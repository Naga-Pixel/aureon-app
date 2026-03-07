// Battery Assessment Scoring Service
// Calculates battery readiness score based on grid vulnerability, consumption, and other factors

import { BATTERY_CONFIG, ISLAND_VULNERABILITY } from '@/lib/config/battery-config';
import { ConsumptionEstimate, BatterySizing, calculateBatterySize } from './consumption-estimator';

export interface BatteryScoreInput {
  island: string;
  consumption: ConsumptionEstimate;
  backupHours: number;
  hasSolar: boolean;
  hasExistingBattery: boolean;
  isNewBuild: boolean;
  propertyType: string;
  electricityPriceEur?: number;
}

export interface BatteryScoreResult {
  totalScore: number;
  gridVulnerabilityScore: number;
  consumptionScore: number;
  arbitrageScore: number;
  solarSynergyScore: number;
  installationScore: number;
  recommendation: 'highly_recommended' | 'recommended' | 'consider' | 'low_priority';
  recommendationText: string;
  batterySizing: BatterySizing;
  annualSavingsEur: number;
  paybackYears: number | null;
  roi10Years: number;
}

// Detect island from address
export function detectIsland(address: string): string | null {
  const normalizedAddress = address.toLowerCase();

  const islandPatterns: Record<string, string[]> = {
    'gran canaria': ['gran canaria', 'las palmas de gran canaria', 'maspalomas', 'playa del ingles', 'telde', 'vecindario'],
    'tenerife': ['tenerife', 'santa cruz de tenerife', 'la laguna', 'adeje', 'arona', 'puerto de la cruz'],
    'lanzarote': ['lanzarote', 'arrecife', 'playa blanca', 'puerto del carmen', 'costa teguise'],
    'fuerteventura': ['fuerteventura', 'puerto del rosario', 'corralejo', 'morro jable', 'caleta de fuste'],
    'la palma': ['la palma', 'santa cruz de la palma', 'los llanos'],
    'la gomera': ['la gomera', 'san sebastian de la gomera', 'valle gran rey'],
    'el hierro': ['el hierro', 'valverde'],
  };

  for (const [island, patterns] of Object.entries(islandPatterns)) {
    if (patterns.some(pattern => normalizedAddress.includes(pattern))) {
      return island;
    }
  }

  return null;
}

// Calculate grid vulnerability score (0-100)
function calculateGridVulnerabilityScore(island: string): number {
  const normalizedIsland = island.toLowerCase();
  const vulnerability = ISLAND_VULNERABILITY[normalizedIsland];

  if (!vulnerability) {
    // Unknown island, assume medium vulnerability
    return 60;
  }

  return vulnerability.score;
}

// Calculate consumption profile score (0-100)
// Higher consumption = more benefit from battery
function calculateConsumptionScore(consumption: ConsumptionEstimate): number {
  const { annualKwh } = consumption;

  // Score based on consumption brackets
  // Higher consumption = more potential savings
  if (annualKwh < 2000) return 30;      // Very low consumption
  if (annualKwh < 4000) return 50;      // Low consumption
  if (annualKwh < 6000) return 65;      // Average
  if (annualKwh < 8000) return 75;      // Above average
  if (annualKwh < 12000) return 85;     // High
  return 95;                             // Very high
}

// Calculate arbitrage potential score (0-100)
function calculateArbitrageScore(
  consumption: ConsumptionEstimate,
  electricityPriceEur: number = 0.20
): { score: number; annualSavingsEur: number } {
  const { peakDailyKwh } = consumption;

  // Arbitrage savings = shifting peak consumption to off-peak
  // Assume 80% of peak can be shifted with battery
  const shiftableKwh = peakDailyKwh * 0.8;
  const dailySavings = shiftableKwh * BATTERY_CONFIG.PEAK_OFF_PEAK_SPREAD_EUR;
  const annualSavingsEur = dailySavings * BATTERY_CONFIG.ARBITRAGE_CYCLES_PER_YEAR;

  // Score based on annual savings potential
  let score: number;
  if (annualSavingsEur < 50) score = 30;
  else if (annualSavingsEur < 100) score = 50;
  else if (annualSavingsEur < 150) score = 65;
  else if (annualSavingsEur < 200) score = 75;
  else if (annualSavingsEur < 300) score = 85;
  else score = 95;

  return { score, annualSavingsEur: Math.round(annualSavingsEur) };
}

// Calculate solar synergy score (0-100)
function calculateSolarSynergyScore(hasSolar: boolean, isNewBuild: boolean): number {
  if (hasSolar) {
    // Already has solar = excellent synergy
    return 95;
  }

  if (isNewBuild) {
    // New build = likely to add solar, good synergy potential
    return 75;
  }

  // No solar, existing build = still useful but less synergy
  return 50;
}

// Calculate installation ease score (0-100)
function calculateInstallationScore(
  isNewBuild: boolean,
  propertyType: string,
  hasExistingBattery: boolean
): number {
  if (hasExistingBattery) {
    // Already has battery = upgrade only
    return 40; // Lower priority, already covered
  }

  let score = 50; // Base score

  if (isNewBuild) {
    score += 30; // Easy electrical integration
  }

  // Property type adjustments
  switch (propertyType) {
    case 'residential_new':
      score += 20;
      break;
    case 'residential':
    case 'villa':
      score += 10;
      break;
    case 'apartment':
      score -= 10; // Space constraints, community approval
      break;
  }

  return Math.min(100, Math.max(0, score));
}

// Main scoring function
export function calculateBatteryScore(input: BatteryScoreInput): BatteryScoreResult {
  const {
    island,
    consumption,
    backupHours,
    hasSolar,
    hasExistingBattery,
    isNewBuild,
    propertyType,
    electricityPriceEur,
  } = input;

  // Calculate individual scores
  const gridVulnerabilityScore = calculateGridVulnerabilityScore(island);
  const consumptionScore = calculateConsumptionScore(consumption);
  const { score: arbitrageScore, annualSavingsEur } = calculateArbitrageScore(
    consumption,
    electricityPriceEur
  );
  const solarSynergyScore = calculateSolarSynergyScore(hasSolar, isNewBuild);
  const installationScore = calculateInstallationScore(isNewBuild, propertyType, hasExistingBattery);

  // Weighted total score
  const weights = BATTERY_CONFIG.WEIGHTS;
  const totalScore = Math.round(
    gridVulnerabilityScore * weights.gridVulnerability +
    consumptionScore * weights.consumptionProfile +
    arbitrageScore * weights.arbitragePotential +
    solarSynergyScore * weights.solarSynergy +
    installationScore * weights.installationEase
  );

  // Calculate battery sizing
  const batterySizing = calculateBatterySize(consumption.dailyKwh, backupHours, hasSolar);

  // Calculate ROI
  // Include both arbitrage savings and avoided outage costs
  const outageValuePerYear = 100; // Estimated value of avoiding outages
  const totalAnnualBenefit = annualSavingsEur + outageValuePerYear;
  const paybackYears = batterySizing.estimatedCostEur / totalAnnualBenefit;

  // 10-year ROI (accounting for degradation)
  let cumulativeSavings = 0;
  for (let year = 1; year <= 10; year++) {
    const degradationFactor = Math.pow(1 - BATTERY_CONFIG.ANNUAL_DEGRADATION, year - 1);
    cumulativeSavings += totalAnnualBenefit * degradationFactor;
  }
  const roi10Years = ((cumulativeSavings - batterySizing.estimatedCostEur) / batterySizing.estimatedCostEur) * 100;

  // Determine recommendation
  let recommendation: BatteryScoreResult['recommendation'];
  let recommendationText: string;

  const thresholds = BATTERY_CONFIG.SCORE_THRESHOLDS;

  if (totalScore >= thresholds.excellent) {
    recommendation = 'highly_recommended';
    recommendationText = 'Excelente candidato para batería. Alta vulnerabilidad de red y buen potencial de ahorro.';
  } else if (totalScore >= thresholds.good) {
    recommendation = 'recommended';
    recommendationText = 'Buena opción para instalar batería. Protección ante cortes y ahorro moderado.';
  } else if (totalScore >= thresholds.fair) {
    recommendation = 'consider';
    recommendationText = 'Considerar batería si valora la independencia energética o tiene equipo sensible.';
  } else {
    recommendation = 'low_priority';
    recommendationText = 'Prioridad baja. El retorno de inversión puede ser largo en esta ubicación.';
  }

  return {
    totalScore,
    gridVulnerabilityScore,
    consumptionScore,
    arbitrageScore,
    solarSynergyScore,
    installationScore,
    recommendation,
    recommendationText,
    batterySizing,
    annualSavingsEur,
    paybackYears: Math.round(paybackYears * 10) / 10,
    roi10Years: Math.round(roi10Years),
  };
}
