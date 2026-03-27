/**
 * CT (Centro de Transformación) Heuristic
 *
 * Spanish energy communities must share the same CT (Transformation Center).
 * This module provides both:
 * 1. A geo-heuristic fallback (200m grid) when no real CT data is available
 * 2. Integration with real CT data sources (OSM, GRAFCAN, Catastro) via Voronoi zones
 *
 * When real CT data is available, Voronoi-based zone lookup replaces the heuristic.
 */

import type { BuildingResult, ScoredClusterResult, CTLocation, BBoxBounds } from '@/components/map/types';
import { generateCTZones, validateSameCT, type CTZoneCollection, type CTValidation } from './ct-voronoi';

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
  zones: Array<{
    zoneId: string;
    buildingCount: number;
    percentage: number;
    refCT?: string | null;
    operator?: string | null;
  }>;
  // Data source used for analysis
  dataSource: 'heuristic' | 'voronoi';
  // Confidence level (0-100)
  confidence: number;
}

/**
 * Detect cross-CT risk for a set of buildings using grid heuristic
 *
 * Returns risk=true if buildings span multiple inferred CT zones,
 * which may indicate the cluster cannot legally form a single energy community.
 *
 * This is the fallback method when real CT data is not available.
 */
export function detectCrossCTRiskHeuristic(buildings: BuildingResult[]): CTAnalysis {
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
    dataSource: 'heuristic',
    confidence: 30, // Low confidence for heuristic
  };
}

/**
 * Detect cross-CT risk using Voronoi zones from real CT data
 *
 * This is the preferred method when CT locations are available.
 */
export function detectCrossCTRiskVoronoi(
  buildings: BuildingResult[],
  ctZones: CTZoneCollection
): CTAnalysis {
  const validation = validateSameCT(buildings, ctZones);

  // Convert CTValidation to CTAnalysis format
  const zoneDistribution = new Map<string, number>();
  for (const zone of validation.zones) {
    zoneDistribution.set(zone.ctId, zone.buildingCount);
  }

  return {
    zoneDistribution,
    zoneCount: validation.zoneCount,
    risk: !validation.isValid,
    dominantZone: validation.dominantZone,
    dominantZoneRatio: validation.dominantZoneRatio,
    zones: validation.zones.map(z => ({
      zoneId: z.ctId,
      buildingCount: z.buildingCount,
      percentage: z.percentage,
      refCT: z.refCT,
      operator: z.operator,
    })),
    dataSource: 'voronoi',
    confidence: validation.confidence,
  };
}

/**
 * Detect cross-CT risk for a set of buildings
 *
 * Uses Voronoi zones if CT data is available, falls back to heuristic otherwise.
 */
export function detectCrossCTRisk(
  buildings: BuildingResult[],
  ctZones?: CTZoneCollection | null
): CTAnalysis {
  if (ctZones && ctZones.features.length > 0) {
    return detectCrossCTRiskVoronoi(buildings, ctZones);
  }
  return detectCrossCTRiskHeuristic(buildings);
}

/**
 * Get CT warning message for display
 */
export function getCTWarningMessage(analysis: CTAnalysis): string | null {
  if (!analysis.risk) return null;

  const sourceLabel = analysis.dataSource === 'voronoi' ? 'detectadas' : 'inferidas';
  const confidenceNote = analysis.confidence >= 70
    ? ''
    : ' (datos de baja confianza)';

  if (analysis.zoneCount > 2) {
    return `Este cluster abarca ${analysis.zoneCount} zonas CT ${sourceLabel}${confidenceNote}. Verificar con la distribuidora si todos los edificios comparten el mismo Centro de Transformación.`;
  }

  const otherZonePercentage = Math.round((1 - analysis.dominantZoneRatio) * 100);

  // If we have operator info from Voronoi, include it
  if (analysis.dataSource === 'voronoi' && analysis.zones.length > 1) {
    const operators = analysis.zones
      .filter(z => z.operator)
      .map(z => z.operator)
      .filter((v, i, a) => a.indexOf(v) === i) // unique
      .slice(0, 2);

    if (operators.length > 0) {
      return `~${otherZonePercentage}% de los edificios están en una zona CT diferente (${operators.join(', ')})${confidenceNote}. Verificar elegibilidad con la distribuidora.`;
    }
  }

  return `~${otherZonePercentage}% de los edificios podrían estar en un CT diferente${confidenceNote}. Verificar elegibilidad con la distribuidora.`;
}

/**
 * Enrich a cluster with CT analysis
 *
 * @param cluster - The cluster to enrich
 * @param ctZones - Optional Voronoi zones from real CT data
 */
export function enrichClusterWithCTAnalysis(
  cluster: ScoredClusterResult,
  ctZones?: CTZoneCollection | null
): ScoredClusterResult {
  const analysis = detectCrossCTRisk(cluster.buildings, ctZones);

  return {
    ...cluster,
    ctZoneWarning: analysis.risk,
    ctZoneCount: analysis.zoneCount,
    // Extended CT info (for UI display)
    ctAnalysis: analysis,
  };
}

/**
 * Fetch CT locations and generate Voronoi zones for a bounding box
 *
 * This is a convenience function that combines OSM data fetching
 * with Voronoi zone generation.
 */
export async function getCTZonesForBounds(
  bounds: BBoxBounds,
  fetchTransformers: (bounds: BBoxBounds) => Promise<{ transformers: CTLocation[] }>
): Promise<CTZoneCollection | null> {
  const result = await fetchTransformers(bounds);

  if (!result.transformers || result.transformers.length === 0) {
    console.log('[CT] No transformers found, using heuristic fallback');
    return null;
  }

  console.log(`[CT] Generating Voronoi zones from ${result.transformers.length} transformers`);
  return generateCTZones(result.transformers, bounds);
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
