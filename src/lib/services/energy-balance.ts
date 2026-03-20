/**
 * Energy Balance Simulator
 *
 * Simulates 24-hour energy balance for energy community clusters.
 * Calculates self-consumption, grid export, and grid import.
 */

import type { BuildingResult, ScoredClusterResult } from '@/components/map/types';
import { getHourlyCurve, estimateAnnualConsumption } from '@/lib/config/consumption-profiles';
import { getSolarCurve, getDailyProductionKwh, getAnnualProductionKwh, type Season } from '@/lib/config/solar-profiles';

/**
 * Hourly energy balance for a single hour
 */
export interface HourlyBalance {
  hour: number;
  generationKwh: number;
  consumptionKwh: number;
  selfConsumedKwh: number;
  gridExportKwh: number;
  gridImportKwh: number;
}

/**
 * 24-hour energy balance result
 */
export interface DailyEnergyBalance {
  hourly: HourlyBalance[];
  totals: {
    generationKwh: number;
    consumptionKwh: number;
    selfConsumedKwh: number;
    gridExportKwh: number;
    gridImportKwh: number;
  };
  selfConsumptionRatio: number;  // 0-1: fraction of generation used locally
  selfSufficiencyRatio: number;  // 0-1: fraction of consumption from local generation
  wastedKwh: number;             // Exported to grid (potential loss)
}

/**
 * Building consumption profile for simulation
 */
interface BuildingProfile {
  buildingId: string;
  segment: string;
  dailyKwh: number;
  hourlyCurve: number[];
}

/**
 * Infer segment from building data
 */
function inferSegment(building: BuildingResult): string {
  if (building.currentUse) {
    const use = building.currentUse.toLowerCase();
    if (use.includes('residencial') || use.includes('residential')) return 'residential';
    if (use.includes('comercial') || use.includes('commercial')) return 'commercial';
    if (use.includes('industrial')) return 'industrial';
    if (use.includes('oficina') || use.includes('office')) return 'office';
    if (use.includes('almacen') || use.includes('warehouse')) return 'warehouse';
    if (use.includes('hotel')) return 'hotel';
  }

  if (building.numberOfDwellings && building.numberOfDwellings > 1) {
    return 'apartment';
  }

  return 'residential';
}

/**
 * Build consumption profiles for all buildings in a cluster
 */
function buildConsumptionProfiles(
  buildings: BuildingResult[],
  latitude: number,
  longitude: number
): BuildingProfile[] {
  return buildings.map(building => {
    const segment = inferSegment(building);
    const roofArea = building.roofAreaM2 || 100;
    const floors = building.numberOfFloors || 1;

    // Estimate consumption
    const consumption = estimateAnnualConsumption(
      roofArea,
      segment,
      latitude,
      longitude,
      floors
    );

    return {
      buildingId: building.buildingId || 'unknown',
      segment,
      dailyKwh: consumption.dailyKwh,
      hourlyCurve: getHourlyCurve(segment),
    };
  });
}

/**
 * Calculate aggregate hourly consumption for a cluster
 */
function calculateAggregateConsumption(profiles: BuildingProfile[]): number[] {
  const hourly = new Array(24).fill(0);

  for (const profile of profiles) {
    for (let hour = 0; hour < 24; hour++) {
      hourly[hour] += profile.dailyKwh * profile.hourlyCurve[hour];
    }
  }

  return hourly;
}

/**
 * Simulate 24-hour energy balance for a cluster
 *
 * @param cluster - Scored cluster with buildings
 * @param season - Season for solar curve (optional)
 * @param region - Region for solar irradiance (default: canarias)
 */
export function simulateClusterBalance(
  cluster: ScoredClusterResult,
  season?: Season,
  region: string = 'canarias'
): DailyEnergyBalance {
  // Calculate system size from roof area
  const usableRoof = cluster.totalRoofAreaM2 * 0.6;
  const systemSizeKwp = (usableRoof / 10) * 2; // 2 kWp per 10m²

  // Get solar production curve
  const solarCurve = getSolarCurve(region, season);
  const dailyProductionKwh = getDailyProductionKwh(systemSizeKwp, region);

  // Calculate hourly generation
  const hourlyGeneration = solarCurve.map(fraction => dailyProductionKwh * fraction);

  // Build consumption profiles
  const profiles = buildConsumptionProfiles(
    cluster.buildings,
    cluster.anchor.lat,
    cluster.anchor.lon
  );

  // Calculate aggregate consumption
  const hourlyConsumption = calculateAggregateConsumption(profiles);

  // Calculate hourly balance
  const hourly: HourlyBalance[] = [];
  const totals = {
    generationKwh: 0,
    consumptionKwh: 0,
    selfConsumedKwh: 0,
    gridExportKwh: 0,
    gridImportKwh: 0,
  };

  for (let hour = 0; hour < 24; hour++) {
    const generation = hourlyGeneration[hour];
    const consumption = hourlyConsumption[hour];

    // Self-consumed is min of generation and consumption
    const selfConsumed = Math.min(generation, consumption);

    // Export is generation - self-consumed (excess)
    const gridExport = Math.max(0, generation - consumption);

    // Import is consumption - self-consumed (deficit)
    const gridImport = Math.max(0, consumption - generation);

    hourly.push({
      hour,
      generationKwh: Math.round(generation * 100) / 100,
      consumptionKwh: Math.round(consumption * 100) / 100,
      selfConsumedKwh: Math.round(selfConsumed * 100) / 100,
      gridExportKwh: Math.round(gridExport * 100) / 100,
      gridImportKwh: Math.round(gridImport * 100) / 100,
    });

    totals.generationKwh += generation;
    totals.consumptionKwh += consumption;
    totals.selfConsumedKwh += selfConsumed;
    totals.gridExportKwh += gridExport;
    totals.gridImportKwh += gridImport;
  }

  // Round totals
  totals.generationKwh = Math.round(totals.generationKwh * 10) / 10;
  totals.consumptionKwh = Math.round(totals.consumptionKwh * 10) / 10;
  totals.selfConsumedKwh = Math.round(totals.selfConsumedKwh * 10) / 10;
  totals.gridExportKwh = Math.round(totals.gridExportKwh * 10) / 10;
  totals.gridImportKwh = Math.round(totals.gridImportKwh * 10) / 10;

  // Calculate ratios
  const selfConsumptionRatio = totals.generationKwh > 0
    ? totals.selfConsumedKwh / totals.generationKwh
    : 0;

  const selfSufficiencyRatio = totals.consumptionKwh > 0
    ? totals.selfConsumedKwh / totals.consumptionKwh
    : 0;

  return {
    hourly,
    totals,
    selfConsumptionRatio: Math.round(selfConsumptionRatio * 100) / 100,
    selfSufficiencyRatio: Math.round(selfSufficiencyRatio * 100) / 100,
    wastedKwh: totals.gridExportKwh,
  };
}

/**
 * Get monthly energy summary for annual projection
 */
export interface MonthlyEnergySummary {
  month: number;
  monthName: string;
  generationKwh: number;
  consumptionKwh: number;
  selfConsumedKwh: number;
  selfConsumptionRatio: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Project annual energy balance by month
 */
export function projectAnnualBalance(
  cluster: ScoredClusterResult,
  region: string = 'canarias'
): MonthlyEnergySummary[] {
  const summaries: MonthlyEnergySummary[] = [];

  for (let month = 1; month <= 12; month++) {
    // Determine season for this month
    let season: Season;
    if (month >= 5 && month <= 8) season = 'summer';
    else if (month >= 11 || month <= 2) season = 'winter';
    else season = 'equinox';

    // Simulate daily balance
    const daily = simulateClusterBalance(cluster, season, region);

    // Estimate days in month (approximate)
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

    summaries.push({
      month,
      monthName: MONTH_NAMES[month - 1],
      generationKwh: Math.round(daily.totals.generationKwh * daysInMonth),
      consumptionKwh: Math.round(daily.totals.consumptionKwh * daysInMonth),
      selfConsumedKwh: Math.round(daily.totals.selfConsumedKwh * daysInMonth),
      selfConsumptionRatio: daily.selfConsumptionRatio,
    });
  }

  return summaries;
}

/**
 * Estimate financial impact of energy balance
 */
export interface EnergyFinancials {
  // Without solar
  annualGridCostEur: number;

  // With solar
  selfConsumedSavingsEur: number;
  exportRevenueEur: number;
  remainingGridCostEur: number;
  netSavingsEur: number;

  // ROI impact
  improvedPaybackYears: number;
}

/**
 * Calculate financial impact of cluster energy balance
 */
export function calculateEnergyFinancials(
  cluster: ScoredClusterResult,
  electricityPriceEur: number = 0.18,
  exportPriceEur: number = 0.06,
  region: string = 'canarias'
): EnergyFinancials {
  const monthly = projectAnnualBalance(cluster, region);

  // Sum annual values
  const annualConsumption = monthly.reduce((sum, m) => sum + m.consumptionKwh, 0);
  const annualSelfConsumed = monthly.reduce((sum, m) => sum + m.selfConsumedKwh, 0);
  const annualGeneration = monthly.reduce((sum, m) => sum + m.generationKwh, 0);
  const annualExport = annualGeneration - annualSelfConsumed;

  // Calculate financials
  const annualGridCostEur = annualConsumption * electricityPriceEur;
  const selfConsumedSavingsEur = annualSelfConsumed * electricityPriceEur;
  const exportRevenueEur = annualExport * exportPriceEur;
  const remainingGridCostEur = (annualConsumption - annualSelfConsumed) * electricityPriceEur;
  const netSavingsEur = selfConsumedSavingsEur + exportRevenueEur;

  // Calculate improved payback
  const improvedPaybackYears = netSavingsEur > 0
    ? cluster.roi.netInvestmentEur / netSavingsEur
    : 99;

  return {
    annualGridCostEur: Math.round(annualGridCostEur),
    selfConsumedSavingsEur: Math.round(selfConsumedSavingsEur),
    exportRevenueEur: Math.round(exportRevenueEur),
    remainingGridCostEur: Math.round(remainingGridCostEur),
    netSavingsEur: Math.round(netSavingsEur),
    improvedPaybackYears: Math.round(improvedPaybackYears * 10) / 10,
  };
}
