import { ASSESSMENT_CONFIG, getSegmentMultiplier } from '@/lib/config/assessment-config';

export interface AssessmentInput {
  // From Solar API, Catastro, or manual
  roofAreaM2: number; // Building area from Catastro (total, all floors)
  maxArrayAreaM2: number | null;
  panelsCount: number | null;
  roofSegmentCount: number;
  maxSunshineHoursPerYear: number | null;

  // New: PVGIS kWh/kWp (replaces sunshine hours for production calculation)
  kwhPerKwp: number | null;

  // New: Number of floors (to convert building area to roof area)
  numberOfFloors: number;

  // Configuration
  businessSegment: string;
  electricityPriceEur: number;

  // Flags
  isManualFallback: boolean;
}

export interface AssessmentCalculation {
  // System metrics
  systemSizeKw: number;
  annualProductionKwh: number;
  annualSavingsEur: number;
  paybackYears: number | null;

  // Lifetime metrics (25 years with degradation)
  lifetimeProductionKwh: number;
  lifetimeSavingsEur: number;

  // Score breakdown
  solarPotentialScore: number;
  economicPotentialScore: number;
  executionSimplicityScore: number;
  segmentFitScore: number;
  totalScore: number;
}

const CONFIG = ASSESSMENT_CONFIG;

export function calculateAssessment(input: AssessmentInput): AssessmentCalculation {
  // Convert building area to roof area using number of floors
  // Catastro returns total building area (all floors), not roof area
  const actualRoofArea = input.roofAreaM2 / input.numberOfFloors;

  // Calculate system size
  const effectiveRoofArea = input.maxArrayAreaM2 ?? actualRoofArea * 0.6; // 60% usable if no API data
  const panelCount = input.panelsCount ?? Math.floor(effectiveRoofArea / 2); // ~2m² per panel
  const systemSizeKw = (panelCount * CONFIG.PANEL_WATTS) / 1000;

  // Calculate annual production using PVGIS kWh/kWp (preferred) or sunshine hours (legacy)
  let annualProductionKwh: number;
  if (input.kwhPerKwp) {
    // PVGIS gives direct kWh/kWp, already includes typical losses
    annualProductionKwh = systemSizeKw * input.kwhPerKwp;
  } else {
    // Legacy calculation with sunshine hours
    const sunshineHours = input.maxSunshineHoursPerYear ?? 1600;
    annualProductionKwh = systemSizeKw * sunshineHours * CONFIG.SYSTEM_EFFICIENCY;
  }

  // Calculate financial metrics
  const annualSavingsEur = annualProductionKwh * input.electricityPriceEur;
  const installationCost = systemSizeKw * CONFIG.INSTALLATION_COST_PER_KW;

  // Calculate lifetime production and savings with panel degradation
  const { lifetimeProduction, lifetimeSavings, paybackYears } = calculateLifetimeMetrics(
    annualProductionKwh,
    input.electricityPriceEur,
    installationCost,
    CONFIG.PANEL_DEGRADATION_RATE,
    CONFIG.SYSTEM_LIFETIME_YEARS
  );

  // Calculate scores
  const solarPotentialScore = calculateSolarPotentialScore(
    systemSizeKw,
    input.maxArrayAreaM2,
    actualRoofArea
  );

  const economicPotentialScore = calculateEconomicPotentialScore(
    annualSavingsEur,
    annualProductionKwh,
    systemSizeKw
  );

  const executionSimplicityScore = calculateExecutionSimplicityScore(
    input.roofSegmentCount,
    input.isManualFallback
  );

  const segmentFitScore = calculateSegmentFitScore(input.businessSegment);

  const totalScore = Math.round(
    solarPotentialScore + economicPotentialScore + executionSimplicityScore + segmentFitScore
  );

  return {
    systemSizeKw: Math.round(systemSizeKw * 100) / 100,
    annualProductionKwh: Math.round(annualProductionKwh),
    annualSavingsEur: Math.round(annualSavingsEur),
    paybackYears: paybackYears ? Math.round(paybackYears * 10) / 10 : null,
    lifetimeProductionKwh: Math.round(lifetimeProduction),
    lifetimeSavingsEur: Math.round(lifetimeSavings),
    solarPotentialScore: Math.round(solarPotentialScore),
    economicPotentialScore: Math.round(economicPotentialScore),
    executionSimplicityScore: Math.round(executionSimplicityScore),
    segmentFitScore: Math.round(segmentFitScore),
    totalScore: Math.min(100, Math.max(0, totalScore)),
  };
}

/**
 * Calculate lifetime production and savings with panel degradation
 * Industry standard: 0.5%/year degradation over 25 years
 * Year 25 output = ~88% of Year 1
 */
function calculateLifetimeMetrics(
  annualProductionYear1: number,
  electricityPrice: number,
  installationCost: number,
  degradationRate: number,
  years: number
): { lifetimeProduction: number; lifetimeSavings: number; paybackYears: number | null } {
  // Use geometric series for total production with degradation
  // Sum = P * (1 - r^n) / (1 - r) where r = (1 - degradationRate)
  const r = 1 - degradationRate;
  const lifetimeProduction = annualProductionYear1 * (1 - Math.pow(r, years)) / degradationRate;
  const lifetimeSavings = lifetimeProduction * electricityPrice;

  // Calculate payback year iteratively (accounting for degradation)
  let paybackYears: number | null = null;
  if (annualProductionYear1 > 0 && electricityPrice > 0) {
    let cumulativeSavings = 0;
    for (let year = 1; year <= years; year++) {
      const yearProduction = annualProductionYear1 * Math.pow(r, year - 1);
      cumulativeSavings += yearProduction * electricityPrice;
      if (cumulativeSavings >= installationCost) {
        // Interpolate for fractional year
        const previousSavings = cumulativeSavings - (yearProduction * electricityPrice);
        const remaining = installationCost - previousSavings;
        const fraction = remaining / (yearProduction * electricityPrice);
        paybackYears = year - 1 + fraction;
        break;
      }
    }
    // If payback not achieved within system lifetime
    if (paybackYears === null && cumulativeSavings > 0) {
      paybackYears = installationCost / (cumulativeSavings / years); // Simple estimate
    }
  }

  return { lifetimeProduction, lifetimeSavings, paybackYears };
}

/**
 * Solar Potential Score (0-40)
 * - System size factor: min(systemKw / 100, 1) * 20 (caps at 100kW)
 * - Roof quality factor: (maxArrayArea / totalRoofArea) * 20 (usable ratio)
 */
function calculateSolarPotentialScore(
  systemSizeKw: number,
  maxArrayAreaM2: number | null,
  roofAreaM2: number
): number {
  const maxWeight = CONFIG.SCORE_WEIGHTS.SOLAR_POTENTIAL;

  // System size factor (0-20): larger systems score higher, caps at 100kW
  const sizeFactor = Math.min(systemSizeKw / 100, 1) * (maxWeight / 2);

  // Roof quality factor (0-20): higher usable ratio is better
  const usableRatio = maxArrayAreaM2
    ? Math.min(maxArrayAreaM2 / roofAreaM2, 1)
    : 0.6; // Default assumption
  const qualityFactor = usableRatio * (maxWeight / 2);

  return sizeFactor + qualityFactor;
}

/**
 * Economic Potential Score (0-30)
 * - Savings factor: min(annualSavings / 10000, 1) * 20 (caps at €10k/year)
 * - Efficiency factor: (annualKwh / systemKw) / 1500 * 10 (kWh per kW installed)
 */
function calculateEconomicPotentialScore(
  annualSavingsEur: number,
  annualProductionKwh: number,
  systemSizeKw: number
): number {
  const maxWeight = CONFIG.SCORE_WEIGHTS.ECONOMIC_POTENTIAL;

  // Savings factor (0-20): higher savings score higher, caps at €10k/year
  const savingsFactor = Math.min(annualSavingsEur / 10000, 1) * (maxWeight * 2/3);

  // Efficiency factor (0-10): kWh per kW, normalized to ~1500 baseline
  const kwhPerKw = systemSizeKw > 0 ? annualProductionKwh / systemSizeKw : 0;
  const efficiencyFactor = Math.min(kwhPerKw / 1500, 1) * (maxWeight * 1/3);

  return savingsFactor + efficiencyFactor;
}

/**
 * Execution Simplicity Score (0-15)
 * - Roof segments: fewer = simpler
 * - 15 - min(segmentCount - 1, 10): 1 segment = 15, 11+ segments = 5
 * - Manual fallback penalty: -3 points
 */
function calculateExecutionSimplicityScore(
  roofSegmentCount: number,
  isManualFallback: boolean
): number {
  const maxWeight = CONFIG.SCORE_WEIGHTS.EXECUTION_SIMPLICITY;

  // Base score from segment count
  const segmentPenalty = Math.min(roofSegmentCount - 1, 10);
  let score = maxWeight - segmentPenalty;

  // Manual fallback penalty (less certainty)
  if (isManualFallback) {
    score -= 3;
  }

  return Math.max(0, score);
}

/**
 * Segment Fit Score (0-15)
 * - Base: fitMultiplier * 12.5 (from segment config)
 * - Capped at 15
 */
function calculateSegmentFitScore(businessSegment: string): number {
  const maxWeight = CONFIG.SCORE_WEIGHTS.SEGMENT_FIT;
  const multiplier = getSegmentMultiplier(businessSegment);

  // Scale multiplier to score (1.0 = 12.5 points, 1.2 = 15 points)
  const score = multiplier * 12.5;

  return Math.min(maxWeight, score);
}
