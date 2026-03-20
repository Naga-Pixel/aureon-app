/**
 * Cluster Finder Service
 *
 * Identifies high-value clusters of buildings around commercial anchors.
 * Optimized for Spanish Energy Community vetting with:
 * - Spatial grid index for O(n) performance
 * - Dynamic radius by anchor type (2km/5km per Spanish law)
 * - Building deduplication (assign to closest anchor)
 *
 * Uses Haversine formula for distance calculations (no Turf.js dependency).
 */

import type { CommercialAnchor, AnchorType } from './osm-overpass';
import type { BuildingResult } from '@/components/map/types';

// Earth radius in kilometers
const EARTH_RADIUS_KM = 6371;

// Spatial grid cell size in km (500m for efficient lookups)
const GRID_CELL_SIZE_KM = 0.5;

/**
 * Spatial grid for efficient radius queries
 */
export interface SpatialGrid {
  cellSizeKm: number;
  cells: Map<string, BuildingResult[]>;
  // Track building centers for quick lookup
  buildingCenters: Map<string, { lat: number; lon: number }>;
}

/**
 * Building assignment tracking for deduplication
 */
export interface BuildingAssignment {
  buildingId: string;
  clusterId: string;
  distanceKm: number;
}

/**
 * Result of cluster analysis for a single anchor
 */
export interface ClusterResult {
  anchor: CommercialAnchor;
  radiusKm: number; // Dynamic radius based on anchor type
  buildingsInRadius: number;
  totalRoofAreaM2: number;
  estimatedSavingsEur: number;
  estimatedSystemSizeKw: number;
  buildings: BuildingResult[];
  // Building distances for scoring
  buildingDistances: Map<string, number>;
  avgDistanceKm: number;
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get search radius for anchor type based on Spanish energy community rules
 * - 2km for urban rooftops (supermarket/retail)
 * - 5km for industrial land (industrial/warehouse)
 */
export function getRadiusForAnchor(anchor: CommercialAnchor): 2 | 5 {
  if (anchor.type === 'industrial' || anchor.type === 'warehouse') {
    return 5;
  }
  return 2;
}

/**
 * Get grid cell key for a lat/lon coordinate
 */
function getCellKey(lat: number, lon: number, cellSizeKm: number): string {
  // Convert to cell indices (approximate, good enough for spatial hashing)
  const latCell = Math.floor(lat / (cellSizeKm / 111));
  const lonCell = Math.floor(lon / (cellSizeKm / (111 * Math.cos(toRadians(lat)))));
  return `${latCell},${lonCell}`;
}

/**
 * Build spatial grid index from buildings for O(1) cell lookups
 */
export function buildSpatialGrid(buildings: BuildingResult[]): SpatialGrid {
  const cells = new Map<string, BuildingResult[]>();
  const buildingCenters = new Map<string, { lat: number; lon: number }>();

  for (const building of buildings) {
    const center = getBuildingCenter(building);
    if (!center || !building.buildingId) continue;

    buildingCenters.set(building.buildingId, center);

    const cellKey = getCellKey(center.lat, center.lon, GRID_CELL_SIZE_KM);
    const cell = cells.get(cellKey) || [];
    cell.push(building);
    cells.set(cellKey, cell);
  }

  return { cellSizeKm: GRID_CELL_SIZE_KM, cells, buildingCenters };
}

/**
 * Get all cell keys within a radius of a center point
 */
function getCellsInRadius(centerLat: number, centerLon: number, radiusKm: number, cellSizeKm: number): string[] {
  const cellKeys: string[] = [];
  const cellsToCheck = Math.ceil(radiusKm / cellSizeKm) + 1;

  const latDelta = cellSizeKm / 111;
  const lonDelta = cellSizeKm / (111 * Math.cos(toRadians(centerLat)));

  for (let latOffset = -cellsToCheck; latOffset <= cellsToCheck; latOffset++) {
    for (let lonOffset = -cellsToCheck; lonOffset <= cellsToCheck; lonOffset++) {
      const lat = centerLat + latOffset * latDelta;
      const lon = centerLon + lonOffset * lonDelta;
      cellKeys.push(getCellKey(lat, lon, cellSizeKm));
    }
  }

  // Dedupe cell keys
  return [...new Set(cellKeys)];
}

/**
 * Get buildings within radius using spatial grid (O(n) where n = buildings in nearby cells)
 */
export function getBuildingsInRadius(
  grid: SpatialGrid,
  centerLat: number,
  centerLon: number,
  radiusKm: number
): { building: BuildingResult; distanceKm: number }[] {
  const results: { building: BuildingResult; distanceKm: number }[] = [];
  const cellKeys = getCellsInRadius(centerLat, centerLon, radiusKm, grid.cellSizeKm);

  for (const cellKey of cellKeys) {
    const buildings = grid.cells.get(cellKey);
    if (!buildings) continue;

    for (const building of buildings) {
      if (!building.buildingId) continue;

      const center = grid.buildingCenters.get(building.buildingId);
      if (!center) continue;

      const distance = haversineDistance(centerLat, centerLon, center.lat, center.lon);
      if (distance <= radiusKm) {
        results.push({ building, distanceKm: distance });
      }
    }
  }

  return results;
}

/**
 * Generate a circle polygon as GeoJSON coordinates
 * Used for rendering radius circles on the map
 *
 * @param centerLat - Center latitude
 * @param centerLon - Center longitude
 * @param radiusKm - Radius in kilometers
 * @param points - Number of polygon points (default 64 for smooth circle)
 * @returns Array of [lon, lat] coordinates forming a closed polygon
 */
export function generateCirclePolygon(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  points: number = 64
): [number, number][] {
  const coords: [number, number][] = [];

  // Convert radius from km to degrees (approximate)
  // 1 degree latitude ≈ 111 km
  // 1 degree longitude ≈ 111 km * cos(latitude)
  const latOffset = radiusKm / 111;
  const lonOffset = radiusKm / (111 * Math.cos(toRadians(centerLat)));

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const lat = centerLat + latOffset * Math.sin(angle);
    const lon = centerLon + lonOffset * Math.cos(angle);
    coords.push([lon, lat]);
  }

  return coords;
}

/**
 * Get building center point from polygon or fallback
 */
function getBuildingCenter(building: BuildingResult): { lat: number; lon: number } | null {
  const coords = building.polygonCoordinates;
  if (!coords || coords.length === 0) return null;

  // Calculate centroid
  let sumLat = 0;
  let sumLon = 0;
  for (const [lon, lat] of coords) {
    sumLat += lat;
    sumLon += lon;
  }

  return {
    lat: sumLat / coords.length,
    lon: sumLon / coords.length,
  };
}

/**
 * Find buildings within a given radius of an anchor (legacy, non-indexed version)
 * @deprecated Use getBuildingsInRadius with SpatialGrid for better performance
 */
export function findBuildingsInRadius(
  anchor: CommercialAnchor,
  buildings: BuildingResult[],
  radiusKm: number
): BuildingResult[] {
  return buildings.filter(building => {
    const center = getBuildingCenter(building);
    if (!center) return false;

    const distance = haversineDistance(anchor.lat, anchor.lon, center.lat, center.lon);
    return distance <= radiusKm;
  });
}

/**
 * Find buildings in radius with distances (for scoring)
 */
export function findBuildingsInRadiusWithDistance(
  anchor: CommercialAnchor,
  buildings: BuildingResult[],
  radiusKm: number
): { building: BuildingResult; distanceKm: number }[] {
  const results: { building: BuildingResult; distanceKm: number }[] = [];

  for (const building of buildings) {
    const center = getBuildingCenter(building);
    if (!center) continue;

    const distance = haversineDistance(anchor.lat, anchor.lon, center.lat, center.lon);
    if (distance <= radiusKm) {
      results.push({ building, distanceKm: distance });
    }
  }

  return results;
}

/**
 * Calculate cluster statistics for a set of buildings
 */
function calculateClusterStats(buildings: BuildingResult[]): {
  totalRoofAreaM2: number;
  estimatedSavingsEur: number;
  estimatedSystemSizeKw: number;
} {
  let totalRoofAreaM2 = 0;
  let estimatedSavingsEur = 0;
  let estimatedSystemSizeKw = 0;

  for (const building of buildings) {
    totalRoofAreaM2 += building.roofAreaM2 || 0;
    estimatedSavingsEur += building.annualSavingsEur || 0;
    estimatedSystemSizeKw += building.systemSizeKw || 0;
  }

  return { totalRoofAreaM2, estimatedSavingsEur, estimatedSystemSizeKw };
}

/**
 * Find high-value clusters around commercial anchors (legacy version without deduplication)
 *
 * @param anchors - Commercial anchors to analyze
 * @param buildings - Buildings to cluster
 * @param radiusKm - Search radius in kilometers (default 2km)
 * @param minBuildings - Minimum buildings to qualify as a cluster (default 10)
 * @returns Array of ClusterResult sorted by estimated savings (descending)
 * @deprecated Use findEnergyCommunities for optimized Energy Community detection
 */
export function findHighValueClusters(
  anchors: CommercialAnchor[],
  buildings: BuildingResult[],
  radiusKm: number = 2,
  minBuildings: number = 10
): ClusterResult[] {
  const clusters: ClusterResult[] = [];

  for (const anchor of anchors) {
    const results = findBuildingsInRadiusWithDistance(anchor, buildings, radiusKm);

    if (results.length >= minBuildings) {
      const clusterBuildings = results.map(r => r.building);
      const stats = calculateClusterStats(clusterBuildings);

      // Build distance map and calculate average
      const buildingDistances = new Map<string, number>();
      let totalDistance = 0;
      for (const r of results) {
        if (r.building.buildingId) {
          buildingDistances.set(r.building.buildingId, r.distanceKm);
          totalDistance += r.distanceKm;
        }
      }

      clusters.push({
        anchor,
        radiusKm,
        buildingsInRadius: results.length,
        totalRoofAreaM2: stats.totalRoofAreaM2,
        estimatedSavingsEur: stats.estimatedSavingsEur,
        estimatedSystemSizeKw: stats.estimatedSystemSizeKw,
        buildings: clusterBuildings,
        buildingDistances,
        avgDistanceKm: results.length > 0 ? totalDistance / results.length : 0,
      });
    }
  }

  // Sort by estimated savings (highest first)
  clusters.sort((a, b) => b.estimatedSavingsEur - a.estimatedSavingsEur);

  return clusters;
}

/**
 * Find Energy Communities with optimized spatial indexing and building deduplication
 *
 * Uses:
 * - Spatial grid for O(n) lookups instead of O(n×m)
 * - Dynamic radius based on anchor type (2km/5km per Spanish law)
 * - Building deduplication (each building assigned to closest anchor only)
 *
 * @param anchors - Commercial anchors to analyze
 * @param buildings - Buildings to cluster
 * @param minBuildings - Minimum buildings to qualify as a cluster (default 5 for energy communities)
 * @param useDynamicRadius - Use anchor-type-based radius (default true)
 * @returns Array of ClusterResult sorted by estimated savings (descending)
 */
export function findEnergyCommunities(
  anchors: CommercialAnchor[],
  buildings: BuildingResult[],
  minBuildings: number = 5,
  useDynamicRadius: boolean = true
): ClusterResult[] {
  if (anchors.length === 0 || buildings.length === 0) {
    return [];
  }

  // Build spatial index
  const grid = buildSpatialGrid(buildings);

  // Track building assignments for deduplication
  // Key: buildingId, Value: { clusterId, distanceKm }
  const assignments = new Map<string, BuildingAssignment>();

  // First pass: find all potential cluster memberships
  interface PotentialCluster {
    anchor: CommercialAnchor;
    radiusKm: number;
    buildings: { building: BuildingResult; distanceKm: number }[];
  }

  const potentialClusters: PotentialCluster[] = [];

  for (const anchor of anchors) {
    const radiusKm = useDynamicRadius ? getRadiusForAnchor(anchor) : 2;
    const results = getBuildingsInRadius(grid, anchor.lat, anchor.lon, radiusKm);

    potentialClusters.push({
      anchor,
      radiusKm,
      buildings: results,
    });
  }

  // Second pass: assign each building to its closest anchor
  for (const pc of potentialClusters) {
    for (const { building, distanceKm } of pc.buildings) {
      if (!building.buildingId) continue;

      const existing = assignments.get(building.buildingId);
      if (!existing || distanceKm < existing.distanceKm) {
        assignments.set(building.buildingId, {
          buildingId: building.buildingId,
          clusterId: pc.anchor.id,
          distanceKm,
        });
      }
    }
  }

  // Third pass: build final clusters with deduplicated buildings
  const clusters: ClusterResult[] = [];

  for (const pc of potentialClusters) {
    // Filter to only buildings assigned to this cluster
    const assignedBuildings = pc.buildings.filter(({ building }) => {
      if (!building.buildingId) return false;
      const assignment = assignments.get(building.buildingId);
      return assignment && assignment.clusterId === pc.anchor.id;
    });

    if (assignedBuildings.length < minBuildings) continue;

    const clusterBuildings = assignedBuildings.map(r => r.building);
    const stats = calculateClusterStats(clusterBuildings);

    // Build distance map and calculate average
    const buildingDistances = new Map<string, number>();
    let totalDistance = 0;
    for (const { building, distanceKm } of assignedBuildings) {
      if (building.buildingId) {
        buildingDistances.set(building.buildingId, distanceKm);
        totalDistance += distanceKm;
      }
    }

    clusters.push({
      anchor: pc.anchor,
      radiusKm: pc.radiusKm,
      buildingsInRadius: assignedBuildings.length,
      totalRoofAreaM2: stats.totalRoofAreaM2,
      estimatedSavingsEur: stats.estimatedSavingsEur,
      estimatedSystemSizeKw: stats.estimatedSystemSizeKw,
      buildings: clusterBuildings,
      buildingDistances,
      avgDistanceKm: assignedBuildings.length > 0 ? totalDistance / assignedBuildings.length : 0,
    });
  }

  // Sort by estimated savings (highest first)
  clusters.sort((a, b) => b.estimatedSavingsEur - a.estimatedSavingsEur);

  return clusters;
}

/**
 * Get cluster summary statistics
 */
export function getClustersSummary(clusters: ClusterResult[]): {
  totalClusters: number;
  totalBuildings: number;
  totalRoofAreaM2: number;
  totalSavingsEur: number;
  avgBuildingsPerCluster: number;
} {
  const totalClusters = clusters.length;
  const totalBuildings = clusters.reduce((sum, c) => sum + c.buildingsInRadius, 0);
  const totalRoofAreaM2 = clusters.reduce((sum, c) => sum + c.totalRoofAreaM2, 0);
  const totalSavingsEur = clusters.reduce((sum, c) => sum + c.estimatedSavingsEur, 0);
  const avgBuildingsPerCluster = totalClusters > 0 ? totalBuildings / totalClusters : 0;

  return {
    totalClusters,
    totalBuildings,
    totalRoofAreaM2,
    totalSavingsEur,
    avgBuildingsPerCluster,
  };
}
