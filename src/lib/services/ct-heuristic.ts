/**
 * CT (Centro de Transformación) Heuristic
 *
 * Spanish energy communities must share the same CT (Transformation Center).
 * Since real CT data (ID_CT) is not publicly available, we use a geo-heuristic:
 * - Buildings within ~200m likely share the same CT
 * - Urban areas have denser CT placement than rural
 *
 * This heuristic provides a warning flag for clusters that may span multiple CTs.
 */

import type { BuildingResult, ScoredClusterResult } from '@/components/map/types';

// CT cell size in km (~200m)
// In urban Spain, CTs typically serve areas of 100-300m radius
const CT_CELL_SIZE_KM = 0.2;

// Earth radius for calculations
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Infer CT zone ID from coordinates
 *
 * Uses a simple grid hash. Buildings in the same grid cell
 * are assumed to share the same CT.
 */
export function inferCTZone(lat: number, lon: number): string {
  // Convert to cell indices
  // 1 degree latitude ≈ 111 km
  const latCell = Math.floor(lat / (CT_CELL_SIZE_KM / 111));
  const lonCell = Math.floor(lon / (CT_CELL_SIZE_KM / (111 * Math.cos(toRadians(lat)))));

  return `CT-${latCell}-${lonCell}`;
}

/**
 * Get building center point
 */
function getBuildingCenter(building: BuildingResult): { lat: number; lon: number } | null {
  const coords = building.polygonCoordinates;
  if (!coords || coords.length === 0) return null;

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
 * Analyze CT zones for a set of buildings
 */
export interface CTAnalysis {
  // Map of CT zone ID to building count
  zoneDistribution: Map<string, number>;
  // Total number of distinct CT zones
  zoneCount: number;
  // Whether cluster spans multiple zones (potential warning)
  risk: boolean;
  // Dominant zone (most buildings)
  dominantZone: string | null;
  // Buildings in dominant zone vs total (0-1)
  dominantZoneRatio: number;
  // List of zones sorted by building count
  zones: Array<{ zoneId: string; buildingCount: number; percentage: number }>;
}

/**
 * Detect cross-CT risk for a set of buildings
 *
 * Returns risk=true if buildings span multiple inferred CT zones,
 * which may indicate the cluster cannot legally form a single energy community.
 */
export function detectCrossCTRisk(buildings: BuildingResult[]): CTAnalysis {
  const zoneDistribution = new Map<string, number>();

  for (const building of buildings) {
    const center = getBuildingCenter(building);
    if (!center) continue;

    const zoneId = inferCTZone(center.lat, center.lon);
    const count = zoneDistribution.get(zoneId) || 0;
    zoneDistribution.set(zoneId, count + 1);
  }

  // Sort zones by building count (descending)
  const sortedZones = Array.from(zoneDistribution.entries())
    .map(([zoneId, count]) => ({
      zoneId,
      buildingCount: count,
      percentage: buildings.length > 0 ? (count / buildings.length) * 100 : 0,
    }))
    .sort((a, b) => b.buildingCount - a.buildingCount);

  const zoneCount = zoneDistribution.size;
  const dominantZone = sortedZones.length > 0 ? sortedZones[0].zoneId : null;
  const dominantZoneCount = sortedZones.length > 0 ? sortedZones[0].buildingCount : 0;
  const dominantZoneRatio = buildings.length > 0 ? dominantZoneCount / buildings.length : 0;

  // Risk if more than 2 zones OR dominant zone has less than 70% of buildings
  const risk = zoneCount > 2 || (zoneCount > 1 && dominantZoneRatio < 0.7);

  return {
    zoneDistribution,
    zoneCount,
    risk,
    dominantZone,
    dominantZoneRatio: Math.round(dominantZoneRatio * 100) / 100,
    zones: sortedZones,
  };
}

/**
 * Get CT warning message for display
 */
export function getCTWarningMessage(analysis: CTAnalysis): string | null {
  if (!analysis.risk) return null;

  if (analysis.zoneCount > 2) {
    return `Este cluster abarca ${analysis.zoneCount} zonas CT inferidas. Verificar con la distribuidora si todos los edificios comparten el mismo Centro de Transformación.`;
  }

  const otherZonePercentage = Math.round((1 - analysis.dominantZoneRatio) * 100);
  return `~${otherZonePercentage}% de los edificios podrían estar en un CT diferente. Verificar elegibilidad con la distribuidora.`;
}

/**
 * Enrich a cluster with CT analysis
 */
export function enrichClusterWithCTAnalysis(
  cluster: ScoredClusterResult
): ScoredClusterResult {
  const analysis = detectCrossCTRisk(cluster.buildings);

  return {
    ...cluster,
    ctZoneWarning: analysis.risk,
    ctZoneCount: analysis.zoneCount,
  };
}

/**
 * Configuration for future CT data source
 *
 * When real CT data becomes available (e.g., from distribution company),
 * this can be replaced with actual lookups.
 */
export interface CTDataSourceConfig {
  type: 'heuristic' | 'database' | 'api';
  endpoint?: string;
  apiKey?: string;
}

let ctDataSourceConfig: CTDataSourceConfig = { type: 'heuristic' };

/**
 * Set CT data source configuration
 *
 * Call this when real CT data becomes available
 */
export function setCTDataSource(config: CTDataSourceConfig): void {
  ctDataSourceConfig = config;
  console.log('[CT Heuristic] Data source updated:', config.type);
}

/**
 * Get current CT data source configuration
 */
export function getCTDataSource(): CTDataSourceConfig {
  return ctDataSourceConfig;
}

/**
 * Check if using heuristic (estimated) CT data
 */
export function isUsingCTHeuristic(): boolean {
  return ctDataSourceConfig.type === 'heuristic';
}
