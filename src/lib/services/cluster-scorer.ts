/**
 * Energy Community Cluster Scorer
 *
 * Evaluates clusters for energy community suitability using 4 weighted components:
 * - Roof-to-Member Ratio (40%): Target >10m² per participant
 * - Load Diversity (30%): Mix of daylight and night-heavy consumers
 * - Proximity Density (20%): Tighter clusters are better
 * - Battery-Ready (10%): Buildings with poor EPC (F/G) eligible for 60% IRPF
 */

import type { ClusterResult } from './cluster-finder';
import type { BuildingResult, ClusterScoreComponents, ClusterROI, ScoredClusterResult } from '@/components/map/types';
import { IRPF_CONFIG } from '@/lib/config/incentives/irpf';
import { CONSUMPTION_BY_SEGMENT } from '@/lib/config/consumption-profiles';

// Score component weights (must sum to 1.0)
const WEIGHTS = {
  roofRatio: 0.40,
  diversity: 0.30,
  proximity: 0.20,
  batteryReady: 0.10,
} as const;

// Target values for scoring
const TARGETS = {
  // Target roof area per participant (m²)
  roofAreaPerParticipant: 10,
  // Maximum average distance for full proximity score (km)
  maxAvgDistanceKm: 2.5,
  // Building segments considered "daylight users"
  daylightSegments: ['office', 'commercial', 'retail', 'warehouse', 'industrial', 'factory'] as string[],
  // Building segments considered "night-heavy"
  nightHeavySegments: ['residential', 'residential_new', 'apartment', 'villa', 'hotel', 'restaurant'] as string[],
  // Minimum counts for diversity
  minDaylightUsers: 1,
  minNightHeavyUsers: 5,
};

// Cost assumptions for ROI
const COSTS = {
  // €/kWp for solar installation
  solarCostPerKwp: 1200,
  // €/kWh for battery
  batteryCostPerKwh: 500,
  // Typical kWp per 10m² usable roof
  kwpPer10m2: 2,
} as const;

/**
 * Infer business segment from building data
 */
function inferSegment(building: BuildingResult): string {
  // Use currentUse if available (from Catastro)
  if (building.currentUse) {
    const use = building.currentUse.toLowerCase();
    if (use.includes('residencial') || use.includes('residential')) return 'residential';
    if (use.includes('comercial') || use.includes('commercial')) return 'commercial';
    if (use.includes('industrial')) return 'industrial';
    if (use.includes('oficina') || use.includes('office')) return 'office';
    if (use.includes('almacen') || use.includes('warehouse')) return 'warehouse';
    if (use.includes('hotel')) return 'hotel';
  }

  // Fall back to dwelling count heuristic
  if (building.numberOfDwellings && building.numberOfDwellings > 1) {
    return 'apartment';
  }

  // Default to residential for unknown
  return 'residential';
}

/**
 * Check if a building is a VV (vacation rental) based on segment or marker
 */
function isVacationRental(building: BuildingResult): boolean {
  const segment = inferSegment(building);
  // VVs will be marked separately via VV registry integration
  // For now, return false - VV data comes from separate enrichment
  return false;
}

/**
 * Calculate roof-to-member ratio score
 * Target: >10m² usable roof per participant
 */
function scoreRoofRatio(buildings: BuildingResult[]): number {
  if (buildings.length === 0) return 0;

  const totalRoof = buildings.reduce((sum, b) => sum + (b.roofAreaM2 || 0), 0);
  // Assume ~60% of roof is usable for solar
  const usableRoof = totalRoof * 0.6;
  const roofPerParticipant = usableRoof / buildings.length;

  // Score: 100 if >= target, linear falloff below
  const ratio = roofPerParticipant / TARGETS.roofAreaPerParticipant;
  return Math.min(100, ratio * 100);
}

/**
 * Calculate load diversity score
 * Requires mix of daylight users (office, retail) and night-heavy (residential, VV)
 */
function scoreDiversity(buildings: BuildingResult[]): number {
  let daylightCount = 0;
  let nightHeavyCount = 0;

  for (const building of buildings) {
    const segment = inferSegment(building);

    if (TARGETS.daylightSegments.includes(segment)) {
      daylightCount++;
    } else if (TARGETS.nightHeavySegments.includes(segment)) {
      nightHeavyCount++;
    }
  }

  // Need at least 1 daylight user and 5 night-heavy for full score
  const daylightScore = Math.min(100, (daylightCount / TARGETS.minDaylightUsers) * 50);
  const nightHeavyScore = Math.min(100, (nightHeavyCount / TARGETS.minNightHeavyUsers) * 50);

  // Both criteria must be met for high score
  if (daylightCount >= TARGETS.minDaylightUsers && nightHeavyCount >= TARGETS.minNightHeavyUsers) {
    return Math.min(100, daylightScore + nightHeavyScore);
  }

  // Partial score if only one criterion is met
  return (daylightScore + nightHeavyScore) / 2;
}

/**
 * Calculate proximity density score
 * Tighter clusters (lower avg distance) score higher
 */
function scoreProximity(avgDistanceKm: number): number {
  if (avgDistanceKm <= 0) return 100;

  // Score decreases linearly with distance
  // 0 km = 100, maxAvgDistanceKm = 0
  const score = 100 - (avgDistanceKm / TARGETS.maxAvgDistanceKm) * 100;
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate battery-ready score
 * Buildings with EPC F/G are eligible for 60% IRPF deduction
 */
function scoreBatteryReady(buildings: BuildingResult[]): number {
  if (buildings.length === 0) return 0;

  let batteryReadyCount = 0;

  for (const building of buildings) {
    // Check EPC rating - F and G are ideal candidates for battery + efficiency upgrades
    if (building.inferredEPC === 'F' || building.inferredEPC === 'G') {
      batteryReadyCount++;
    }
  }

  // Score based on percentage of battery-ready buildings
  return (batteryReadyCount / buildings.length) * 100;
}

/**
 * Calculate composite suitability score
 */
export function calculateClusterScore(cluster: ClusterResult): {
  score: number;
  components: ClusterScoreComponents;
} {
  const roofRatio = scoreRoofRatio(cluster.buildings);
  const diversity = scoreDiversity(cluster.buildings);
  const proximity = scoreProximity(cluster.avgDistanceKm);
  const batteryReady = scoreBatteryReady(cluster.buildings);

  const components: ClusterScoreComponents = {
    roofRatio,
    diversity,
    proximity,
    batteryReady,
  };

  const score =
    roofRatio * WEIGHTS.roofRatio +
    diversity * WEIGHTS.diversity +
    proximity * WEIGHTS.proximity +
    batteryReady * WEIGHTS.batteryReady;

  return { score: Math.round(score), components };
}

/**
 * Calculate ROI and payback for a cluster
 * Uses community IRPF rate (60% deduction)
 */
export function calculateClusterROI(cluster: ClusterResult): ClusterROI {
  // Estimate system size from roof area (60% usable, 2kWp per 10m²)
  const usableRoof = cluster.totalRoofAreaM2 * 0.6;
  const systemSizeKwp = (usableRoof / 10) * COSTS.kwpPer10m2;

  // Solar installation cost
  const solarCost = systemSizeKwp * COSTS.solarCostPerKwp;

  // Estimate battery size (roughly 2h of peak production)
  const batteryKwh = systemSizeKwp * 2;
  const batteryCost = batteryKwh * COSTS.batteryCostPerKwh;

  const totalInvestmentEur = solarCost + batteryCost;

  // Annual savings from cluster stats
  const annualSavingsEur = cluster.estimatedSavingsEur;

  // IRPF community deduction (60% rate, max €5000/year, €15000 total over 3 years)
  const irpfRate = IRPF_CONFIG.community.rate;
  const maxAnnualBase = IRPF_CONFIG.community.maxAnnualBase;
  const maxTotalBase = IRPF_CONFIG.community.maxTotalBase;

  // Deductible amount is limited by both annual and total caps
  const deductibleBase = Math.min(totalInvestmentEur, maxTotalBase);
  const irpfDeductionEur = deductibleBase * irpfRate;

  const netInvestmentEur = totalInvestmentEur - irpfDeductionEur;

  // Simple payback calculation
  const paybackYears = annualSavingsEur > 0 ? netInvestmentEur / annualSavingsEur : 99;

  return {
    totalInvestmentEur: Math.round(totalInvestmentEur),
    annualSavingsEur: Math.round(annualSavingsEur),
    paybackYears: Math.round(paybackYears * 10) / 10,
    irpfDeductionEur: Math.round(irpfDeductionEur),
    netInvestmentEur: Math.round(netInvestmentEur),
  };
}

/**
 * Score and enrich a cluster for energy community evaluation
 */
export function scoreCluster(cluster: ClusterResult): ScoredClusterResult {
  const { score, components } = calculateClusterScore(cluster);
  const roi = calculateClusterROI(cluster);

  return {
    anchor: {
      id: cluster.anchor.id,
      type: cluster.anchor.type,
      name: cluster.anchor.name,
      lat: cluster.anchor.lat,
      lon: cluster.anchor.lon,
    },
    radiusKm: cluster.radiusKm,
    buildingsInRadius: cluster.buildingsInRadius,
    totalRoofAreaM2: cluster.totalRoofAreaM2,
    estimatedSavingsEur: cluster.estimatedSavingsEur,
    estimatedSystemSizeKw: cluster.estimatedSystemSizeKw,
    buildings: cluster.buildings,
    // Scoring
    suitabilityScore: score,
    scoreComponents: components,
    roi,
    // VV integration (populated later via enrichment)
    vvCount: 0,
    vvPlazas: 0,
    // CT heuristic (populated later via enrichment)
    ctZoneWarning: false,
    ctZoneCount: 1,
    // Distances
    avgDistanceKm: cluster.avgDistanceKm,
    buildingDistances: cluster.buildingDistances,
  };
}

/**
 * Score multiple clusters and sort by payback (ascending = better ROI first)
 */
export function scoreAndRankClusters(clusters: ClusterResult[]): ScoredClusterResult[] {
  return clusters
    .map(scoreCluster)
    .sort((a, b) => a.roi.paybackYears - b.roi.paybackYears);
}

/**
 * Get top N clusters by suitability score
 */
export function getTopClustersByScore(
  clusters: ClusterResult[],
  limit: number = 10
): ScoredClusterResult[] {
  return clusters
    .map(scoreCluster)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, limit);
}
