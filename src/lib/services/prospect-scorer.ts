// Lightweight scoring for prospecting tool
// Uses improved consumption and arbitrage models

import { BATTERY_CONFIG, ISLAND_VULNERABILITY } from '@/lib/config/battery-config';
import { ASSESSMENT_CONFIG } from '@/lib/config/assessment-config';
import { estimateAnnualConsumption, calculateOutageCost, CONSUMPTION_BY_SEGMENT } from '@/lib/config/consumption-profiles';
import { getArbitrageSchedule } from '@/lib/config/electricity-tariffs';
import type { ESIOSPriceStats } from '@/lib/services/esios';

export type AssessmentType = 'solar' | 'battery' | 'combined';

export type DataSource = 'api' | 'fallback' | 'estimate' | 'config';

export interface DataProvenance {
  source: DataSource;
  confidence: number; // 0-100
  note?: string;
}

export interface ProspectScoreInput {
  roofAreaM2: number;
  kwhPerKwp: number;
  electricityPrice: number;
  businessSegment: string;
  latitude: number;
  longitude: number;
  assessmentType: AssessmentType;
  floors?: number;
  priceStats?: ESIOSPriceStats; // Live ESIOS price statistics (peak, valley, spread)
  // Data source tracking
  kwhPerKwpSource?: 'pvgis' | 'fallback';
  esiosFailed?: boolean;
  // From Catastro INSPIRE (when available)
  catastroFloors?: number | null;
  catastroUse?: string | null;
  catastroUseLabel?: string | null;
  catastroDwellings?: number | null;
}

export interface ProspectScore {
  totalScore: number;
  solarScore: number;
  batteryScore: number;
  systemSizeKw: number;
  annualSavingsEur: number;
  annualProductionKwh: number;
  // Battery-specific
  batteryKwh: number;
  gridVulnerability: number;
  arbitragePotential: number;
  arbitrageSavingsEur: number;
  // Detailed breakdown
  estimatedConsumptionKwh?: number;
  selfConsumptionRatio?: number;
  outageProtectionValue?: number;
  climateZone?: string;
  // Price statistics (from ESIOS when available)
  priceStats?: ESIOSPriceStats;
  // Inferred/detected values
  inferredBuildingType?: string;
  usedFloors?: number;
  // Data provenance
  provenance: {
    roofArea: DataProvenance;
    solarIrradiance: DataProvenance;
    consumption: DataProvenance;
    electricityPrice: DataProvenance;
    gridVulnerability: DataProvenance;
    arbitragePrices: DataProvenance;
    buildingType: DataProvenance;
    floors: DataProvenance;
  };
}

// Detect island from coordinates (Canary Islands bounding boxes)
function detectIslandFromCoords(lat: number, lon: number): string | null {
  const islands: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
    'el hierro': { minLat: 27.63, maxLat: 27.85, minLon: -18.16, maxLon: -17.88 },
    'la gomera': { minLat: 28.0, maxLat: 28.22, minLon: -17.36, maxLon: -17.06 },
    'la palma': { minLat: 28.45, maxLat: 28.87, minLon: -18.0, maxLon: -17.72 },
    'tenerife': { minLat: 27.99, maxLat: 28.59, minLon: -16.92, maxLon: -16.11 },
    'gran canaria': { minLat: 27.74, maxLat: 28.17, minLon: -15.84, maxLon: -15.35 },
    'fuerteventura': { minLat: 28.0, maxLat: 28.76, minLon: -14.52, maxLon: -13.82 },
    'lanzarote': { minLat: 28.84, maxLat: 29.24, minLon: -13.88, maxLon: -13.41 },
  };

  for (const [island, bounds] of Object.entries(islands)) {
    if (lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon) {
      return island;
    }
  }

  if (lat >= 38.6 && lat <= 40.1 && lon >= 1.2 && lon <= 4.4) {
    return 'balearic';
  }

  return null;
}

/**
 * Infer EPC (Energy Performance Certificate) rating from construction year
 *
 * Based on Spanish building regulations evolution:
 * - Pre-1979: No thermal regulation (likely E-G)
 * - 1979-2006: NBE-CT-79 basic insulation (likely D-E)
 * - 2006-2013: CTE 2006 improved standards (likely C-D)
 * - 2013-2020: CTE 2013 stricter requirements (likely B-C)
 * - 2020+: CTE 2019 (HE 2019) near-zero energy buildings (likely A-B)
 */
export type EPCRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export function inferEPCFromYear(constructionYear: number | null | undefined): EPCRating | null {
  if (!constructionYear || constructionYear < 1900 || constructionYear > 2030) {
    return null;
  }

  if (constructionYear >= 2020) {
    return 'B'; // Near-zero energy building standards
  }
  if (constructionYear >= 2013) {
    return 'C'; // CTE 2013 standards
  }
  if (constructionYear >= 2006) {
    return 'D'; // CTE 2006 standards
  }
  if (constructionYear >= 1979) {
    return 'E'; // NBE-CT-79 basic insulation
  }
  // Pre-1979: poor insulation
  return 'F';
}

/**
 * Get EPC score (100 = A, 0 = G) for weighting in prospect scoring
 */
export function getEPCScore(epc: EPCRating | null): number {
  const scores: Record<EPCRating, number> = {
    A: 100,
    B: 85,
    C: 70,
    D: 55,
    E: 40,
    F: 25,
    G: 10,
  };
  return epc ? scores[epc] : 50; // Default to middle if unknown
}

/**
 * Poor EPC buildings (E-G) are better prospects for solar/battery
 * because they have higher energy costs and more to gain from upgrades
 */
export function isHighPotentialEPC(epc: EPCRating | null): boolean {
  return epc === 'E' || epc === 'F' || epc === 'G';
}

// Get grid vulnerability score for location
function getGridVulnerability(lat: number, lon: number): number {
  const island = detectIslandFromCoords(lat, lon);

  if (island && ISLAND_VULNERABILITY[island]) {
    return ISLAND_VULNERABILITY[island].score;
  }

  if (island === 'balearic') {
    return 40;
  }

  return 20; // Mainland
}

// Determine appropriate tariff based on estimated power
function getTariff(systemSizeKw: number): '2.0TD' | '3.0TD' {
  return systemSizeKw > 15 ? '3.0TD' : '2.0TD';
}

// Calculate solar score (0-100)
function calculateSolarScore(input: ProspectScoreInput): {
  score: number;
  systemSizeKw: number;
  annualProductionKwh: number;
  annualSavingsEur: number;
  selfConsumptionRatio: number;
} {
  const usableRoofArea = input.roofAreaM2 * 0.7;
  const panelCount = Math.floor(usableRoofArea / 2);
  const systemSizeKw = (panelCount * ASSESSMENT_CONFIG.PANEL_WATTS) / 1000;
  const annualProductionKwh = systemSizeKw * input.kwhPerKwp;

  // Get consumption estimate for self-consumption calculation
  const consumption = estimateAnnualConsumption(
    input.roofAreaM2,
    input.businessSegment,
    input.latitude,
    input.longitude,
    input.floors || 1
  );

  // Self-consumption depends on production vs consumption ratio
  let selfConsumptionRatio = consumption.selfConsumptionRatio;

  // Adjust self-consumption based on over/under sizing
  const productionRatio = annualProductionKwh / consumption.annualKwh;
  if (productionRatio > 1.5) {
    // Oversized system - more excess to grid
    selfConsumptionRatio *= 0.7;
  } else if (productionRatio < 0.5) {
    // Undersized - can use most of it
    selfConsumptionRatio = Math.min(0.9, selfConsumptionRatio * 1.3);
  }

  // Savings = self-consumed + exported (at lower rate)
  const selfConsumedKwh = annualProductionKwh * selfConsumptionRatio;
  const exportedKwh = annualProductionKwh * (1 - selfConsumptionRatio);
  const exportPrice = input.electricityPrice * 0.5; // Compensation typically ~50% of retail

  const annualSavingsEur = (selfConsumedKwh * input.electricityPrice) + (exportedKwh * exportPrice);

  // Score components
  const sizeFactor = Math.min(systemSizeKw / 100, 1) * 35;
  const productionFactor = Math.min(annualProductionKwh / 150000, 1) * 25;
  const selfConsumptionFactor = selfConsumptionRatio * 20;
  const savingsFactor = Math.min(annualSavingsEur / 15000, 1) * 20;

  const score = Math.round(sizeFactor + productionFactor + selfConsumptionFactor + savingsFactor);

  return {
    score: Math.min(100, score),
    systemSizeKw: Math.round(systemSizeKw * 100) / 100,
    annualProductionKwh: Math.round(annualProductionKwh),
    annualSavingsEur: Math.round(annualSavingsEur),
    selfConsumptionRatio,
  };
}

// Calculate battery score (0-100)
function calculateBatteryScore(input: ProspectScoreInput, solarSystemKw: number): {
  score: number;
  batteryKwh: number;
  gridVulnerability: number;
  arbitragePotential: number;
  arbitrageSavingsEur: number;
  outageProtectionValue: number;
  estimatedConsumptionKwh: number;
  climateZone: string;
} {
  const weights = BATTERY_CONFIG.WEIGHTS;

  // Grid vulnerability (30%)
  const gridVulnerability = getGridVulnerability(input.latitude, input.longitude);
  const gridScore = gridVulnerability * weights.gridVulnerability;

  // Consumption estimation (25%)
  const consumption = estimateAnnualConsumption(
    input.roofAreaM2,
    input.businessSegment,
    input.latitude,
    input.longitude,
    input.floors || 1
  );

  let consumptionScore: number;
  if (consumption.annualKwh < 3000) consumptionScore = 35;
  else if (consumption.annualKwh < 6000) consumptionScore = 50;
  else if (consumption.annualKwh < 12000) consumptionScore = 65;
  else if (consumption.annualKwh < 25000) consumptionScore = 80;
  else if (consumption.annualKwh < 50000) consumptionScore = 90;
  else consumptionScore = 95;
  consumptionScore *= weights.consumptionProfile;

  // Arbitrage potential (20%)
  const tariff = getTariff(solarSystemKw);
  const dailyShiftableKwh = consumption.peakDailyKwh * 0.8; // Can shift 80% of peak to valley

  // Use live ESIOS prices when available, otherwise fall back to static tariff data
  let spread: number;
  if (input.priceStats && input.priceStats.source === 'esios') {
    // Use actual peak/valley spread from ESIOS
    spread = input.priceStats.spread;
  } else {
    // Fall back to static tariff spread
    const schedule = getArbitrageSchedule(tariff);
    spread = schedule.expectedSpread;
  }

  // Calculate arbitrage savings using actual or static spread
  const effectiveShift = dailyShiftableKwh * BATTERY_CONFIG.ROUND_TRIP_EFFICIENCY;
  const arbitrageDays = 260; // Weekdays per year
  const arbitrageSavingsEur = effectiveShift * spread * arbitrageDays;

  // Boost if high volatility (more arbitrage opportunities)
  const volatilityBonus = input.priceStats?.volatility ? Math.min(input.priceStats.volatility / 0.03, 0.3) : 0;
  const adjustedArbitrageSavings = Math.round(arbitrageSavingsEur * (1 + volatilityBonus));

  // Score based on arbitrage value
  let arbitragePotential: number;
  if (adjustedArbitrageSavings < 50) arbitragePotential = 25;
  else if (adjustedArbitrageSavings < 100) arbitragePotential = 45;
  else if (adjustedArbitrageSavings < 200) arbitragePotential = 60;
  else if (adjustedArbitrageSavings < 400) arbitragePotential = 75;
  else if (adjustedArbitrageSavings < 600) arbitragePotential = 85;
  else arbitragePotential = 95;
  const arbitrageScore = arbitragePotential * weights.arbitragePotential;

  // Solar synergy (15%)
  // Better synergy when solar production matches consumption profile
  const segmentProfile = CONSUMPTION_BY_SEGMENT[input.businessSegment] || CONSUMPTION_BY_SEGMENT.commercial;
  const solarSynergyBase = (1 - segmentProfile.peakHoursFraction) * 100; // Less evening use = better solar match
  const hasSolarBonus = solarSystemKw > 0 ? 20 : 0;
  const solarSynergyScore = Math.min(100, solarSynergyBase + hasSolarBonus) * weights.solarSynergy;

  // Installation ease (10%)
  let installationEase: number;
  if (input.roofAreaM2 < 40) installationEase = 40;
  else if (input.roofAreaM2 < 100) installationEase = 65;
  else if (input.roofAreaM2 < 300) installationEase = 80;
  else if (input.roofAreaM2 < 800) installationEase = 90;
  else installationEase = 75; // Very large = more complex
  const installationScore = installationEase * weights.installationEase;

  // Calculate recommended battery size
  const backupHours = BATTERY_CONFIG.BACKUP_HOURS_RECOMMENDED;
  const hourlyConsumption = consumption.dailyKwh / 24;
  const peakHourlyConsumption = consumption.peakDailyKwh / 4; // Peak hours ~4h

  // Size battery to cover peak shifting + some backup
  const arbitrageCapacity = dailyShiftableKwh / BATTERY_CONFIG.ROUND_TRIP_EFFICIENCY;
  const backupCapacity = hourlyConsumption * backupHours;
  let recommendedKwh = Math.max(arbitrageCapacity, backupCapacity);

  // Cap at 15 kWh for residential (grants cap at 10 kWh, realistic max is 15 kWh)
  const residentialSegments = ['residential', 'residential_new', 'apartment', 'apartment_building', 'villa'];
  if (residentialSegments.includes(input.businessSegment)) {
    recommendedKwh = Math.min(recommendedKwh, 15);
  }

  // Round to common battery sizes
  const batteryKwh = roundToBatterySize(recommendedKwh);

  // Calculate outage protection value
  const outageValue = calculateOutageCost(input.businessSegment, gridVulnerability, backupHours);

  const totalScore = Math.round(gridScore + consumptionScore + arbitrageScore + solarSynergyScore + installationScore);

  return {
    score: Math.min(100, totalScore),
    batteryKwh,
    gridVulnerability,
    arbitragePotential,
    arbitrageSavingsEur: adjustedArbitrageSavings,
    outageProtectionValue: outageValue.avoidedWithBattery,
    estimatedConsumptionKwh: consumption.annualKwh,
    climateZone: consumption.climateZone,
  };
}

// Round to common residential/commercial battery sizes
function roundToBatterySize(kwh: number): number {
  const sizes = [5, 7, 10, 13, 15, 20, 25, 30, 40, 50, 75, 100];
  for (const size of sizes) {
    if (kwh <= size) return size;
  }
  return Math.ceil(kwh / 25) * 25; // Round to nearest 25 for large systems
}

// Infer building type from Catastro use code
function inferBuildingType(catastroUse: string | null, userSegment: string): { type: string; fromCatastro: boolean } {
  if (!catastroUse) {
    return { type: userSegment, fromCatastro: false };
  }

  const useMap: Record<string, string> = {
    'residential': 'residential',
    '1_residential': 'residential',
    'industrial': 'industrial',
    '3_industrial': 'industrial',
    'office': 'office',
    '4_1_office': 'office',
    'commerceAndServices': 'commercial',
    '4_2_retail': 'retail',
    'agriculture': 'agricultural',
    '2_agriculture': 'agricultural',
  };

  const mapped = useMap[catastroUse];
  if (mapped) {
    return { type: mapped, fromCatastro: true };
  }

  return { type: userSegment, fromCatastro: false };
}

// Main scoring function
export function calculateProspectScore(input: ProspectScoreInput): ProspectScore {
  // Use Catastro data when available
  const { type: effectiveSegment, fromCatastro: typeFromCatastro } = inferBuildingType(
    input.catastroUse || null,
    input.businessSegment
  );

  // Use Catastro floors if available, otherwise estimate
  const floorsFromCatastro = input.catastroFloors != null && input.catastroFloors > 0;
  const usedFloors = floorsFromCatastro ? input.catastroFloors! : (input.floors || 1);

  // Override input with effective values
  const effectiveInput = {
    ...input,
    businessSegment: effectiveSegment,
    floors: usedFloors,
  };

  const solar = calculateSolarScore(effectiveInput);
  const battery = calculateBatteryScore(effectiveInput, solar.systemSizeKw);

  let totalScore: number;
  let totalSavings: number;

  switch (input.assessmentType) {
    case 'solar':
      totalScore = solar.score;
      totalSavings = solar.annualSavingsEur;
      break;
    case 'battery':
      totalScore = battery.score;
      // Battery savings = arbitrage + outage protection value
      totalSavings = battery.arbitrageSavingsEur + battery.outageProtectionValue;
      break;
    case 'combined':
      // Combined: weighted average (solar primary)
      totalScore = Math.round(solar.score * 0.55 + battery.score * 0.45);
      // Combined savings = solar + battery arbitrage + improved self-consumption
      const selfConsumptionBoost = solar.annualProductionKwh * 0.25 * input.electricityPrice; // Battery increases self-consumption ~25%
      totalSavings = solar.annualSavingsEur + battery.arbitrageSavingsEur + selfConsumptionBoost + battery.outageProtectionValue;
      break;
  }

  // Build provenance tracking
  const provenance = {
    roofArea: {
      source: 'api' as DataSource,
      confidence: 75,
      note: 'Catastro INSPIRE - area total de cubierta',
    },
    solarIrradiance: input.kwhPerKwpSource === 'fallback'
      ? { source: 'fallback' as DataSource, confidence: 60, note: 'PVGIS no disponible, usando media regional' }
      : { source: 'api' as DataSource, confidence: 85, note: 'PVGIS EU - datos satelitales' },
    consumption: {
      source: 'estimate' as DataSource,
      confidence: input.catastroDwellings ? 65 : 50,
      note: input.catastroDwellings
        ? `Estimado por ${input.catastroDwellings} viviendas + perfil ${effectiveSegment}`
        : `Estimado por m² segun perfil ${effectiveSegment} y zona climatica`,
    },
    electricityPrice: {
      source: 'fallback' as DataSource,
      confidence: 50,
      note: 'ESIOS no disponible, usando precio por defecto',
    },
    gridVulnerability: {
      source: 'estimate' as DataSource,
      confidence: battery.gridVulnerability > 30 ? 85 : 60,
      note: battery.gridVulnerability > 30
        ? 'Red insular - vulnerabilidad calculada por ubicacion'
        : 'Peninsula - red estable, vulnerabilidad calculada',
    },
    arbitragePrices: input.priceStats?.source === 'esios'
      ? {
          source: 'api' as DataSource,
          confidence: 80,
          note: `ESIOS ${input.priceStats.days}d: pico ${(input.priceStats.peakPrice * 100).toFixed(1)}c, valle ${(input.priceStats.valleyPrice * 100).toFixed(1)}c`,
        }
      : { source: 'fallback' as DataSource, confidence: 45, note: 'ESIOS no disponible, usando precios PVPC tipicos' },
    buildingType: typeFromCatastro
      ? { source: 'api' as DataSource, confidence: 85, note: `Catastro: ${input.catastroUseLabel || input.catastroUse}` }
      : { source: 'config' as DataSource, confidence: 60, note: `Seleccionado por usuario: ${input.businessSegment}` },
    floors: floorsFromCatastro
      ? { source: 'api' as DataSource, confidence: 90, note: `Catastro: ${usedFloors} plantas` }
      : { source: 'estimate' as DataSource, confidence: 40, note: 'Asumiendo 1 planta (sin datos Catastro)' },
  };

  return {
    totalScore,
    solarScore: solar.score,
    batteryScore: battery.score,
    systemSizeKw: solar.systemSizeKw,
    annualSavingsEur: Math.round(totalSavings),
    annualProductionKwh: solar.annualProductionKwh,
    batteryKwh: battery.batteryKwh,
    gridVulnerability: battery.gridVulnerability,
    arbitragePotential: battery.arbitragePotential,
    arbitrageSavingsEur: battery.arbitrageSavingsEur,
    estimatedConsumptionKwh: battery.estimatedConsumptionKwh,
    selfConsumptionRatio: solar.selfConsumptionRatio,
    outageProtectionValue: battery.outageProtectionValue,
    climateZone: battery.climateZone,
    priceStats: input.priceStats,
    inferredBuildingType: effectiveSegment,
    usedFloors,
    provenance,
  };
}

// Export for testing
export { getGridVulnerability, detectIslandFromCoords };
