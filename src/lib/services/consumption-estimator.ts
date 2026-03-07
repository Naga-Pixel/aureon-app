// Consumption Estimation Service
// Estimates annual and daily electricity consumption based on property characteristics

import { CONSUMPTION_FACTORS } from '@/lib/config/battery-config';

export interface ConsumptionEstimate {
  annualKwh: number;
  dailyKwh: number;
  peakDailyKwh: number;      // Consumption during peak hours
  monthlyBill: number;        // Estimated monthly bill at average price
  confidence: 'high' | 'medium' | 'low';
  factors: {
    baseConsumption: number;
    climateAdjustment: number;
    occupancyAdjustment: number;
  };
}

export interface ConsumptionInput {
  propertyAreaM2: number;
  propertyType: string;
  numberOfFloors?: number;
  hasPool?: boolean;
  hasAC?: boolean;
  occupants?: number;
  island?: string;
  monthlyBillEur?: number;    // If provided, use actual bill to calibrate
}

// Climate adjustment factors by island (AC usage increases consumption)
const ISLAND_CLIMATE_FACTOR: Record<string, number> = {
  'el hierro': 1.0,           // Mild climate
  'la gomera': 1.0,
  'la palma': 1.0,
  'fuerteventura': 1.15,      // Hot, more AC
  'lanzarote': 1.15,
  'tenerife': 1.05,           // Varies by altitude
  'gran canaria': 1.10,
};

// Occupancy adjustment (base is 3 people)
function getOccupancyFactor(occupants: number): number {
  const baseOccupants = 3;
  const difference = occupants - baseOccupants;
  return 1 + (difference * 0.08); // ±8% per person
}

export function estimateConsumption(input: ConsumptionInput): ConsumptionEstimate {
  const {
    propertyAreaM2,
    propertyType,
    numberOfFloors = 1,
    hasPool = false,
    hasAC,
    occupants = 3,
    island,
    monthlyBillEur,
  } = input;

  // If actual bill provided, calculate backwards
  if (monthlyBillEur && monthlyBillEur > 0) {
    const avgPriceEur = 0.18; // Average electricity price
    const annualKwh = (monthlyBillEur / avgPriceEur) * 12;
    const dailyKwh = annualKwh / 365;

    return {
      annualKwh: Math.round(annualKwh),
      dailyKwh: Math.round(dailyKwh * 10) / 10,
      peakDailyKwh: Math.round(dailyKwh * 0.4 * 10) / 10,
      monthlyBill: monthlyBillEur,
      confidence: 'high',
      factors: {
        baseConsumption: annualKwh,
        climateAdjustment: 1,
        occupancyAdjustment: 1,
      },
    };
  }

  // Estimate from property characteristics
  const consumptionPerM2 = CONSUMPTION_FACTORS[propertyType] || CONSUMPTION_FACTORS.residential;

  // Base consumption from area
  // For multi-floor, use total area but assume some shared/unheated space
  const effectiveArea = numberOfFloors > 1
    ? propertyAreaM2 * (1 - (numberOfFloors - 1) * 0.1) // 10% reduction per extra floor
    : propertyAreaM2;

  let baseConsumption = effectiveArea * consumptionPerM2;

  // Climate adjustment
  const normalizedIsland = island?.toLowerCase() || '';
  const climateFactor = ISLAND_CLIMATE_FACTOR[normalizedIsland] || 1.05;

  // AC adjustment (if explicitly stated)
  let climateAdjustment = climateFactor;
  if (hasAC === true) climateAdjustment *= 1.15;
  if (hasAC === false) climateAdjustment *= 0.90;

  // Pool adds significant consumption (pump + heating)
  if (hasPool) {
    baseConsumption += 3000; // ~3000 kWh/year for pool
  }

  // Occupancy adjustment
  const occupancyFactor = getOccupancyFactor(occupants);

  // Calculate final consumption
  const annualKwh = baseConsumption * climateAdjustment * occupancyFactor;
  const dailyKwh = annualKwh / 365;
  const peakDailyKwh = dailyKwh * 0.4; // 40% during peak hours

  // Estimate monthly bill
  const avgPriceEur = 0.18;
  const monthlyBill = (annualKwh / 12) * avgPriceEur;

  // Confidence based on data completeness
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (hasAC !== undefined && island && occupants) {
    confidence = 'high';
  } else if (!island && !occupants) {
    confidence = 'low';
  }

  return {
    annualKwh: Math.round(annualKwh),
    dailyKwh: Math.round(dailyKwh * 10) / 10,
    peakDailyKwh: Math.round(peakDailyKwh * 10) / 10,
    monthlyBill: Math.round(monthlyBill),
    confidence,
    factors: {
      baseConsumption: Math.round(baseConsumption),
      climateAdjustment: Math.round(climateAdjustment * 100) / 100,
      occupancyAdjustment: Math.round(occupancyFactor * 100) / 100,
    },
  };
}

// Calculate recommended battery size
export interface BatterySizing {
  recommendedKwh: number;
  minimumKwh: number;
  optimalKwh: number;
  backupHours: number;
  estimatedCostEur: number;
}

export function calculateBatterySize(
  dailyKwh: number,
  backupHours: number,
  hasSolar: boolean = false
): BatterySizing {
  // Hourly consumption
  const hourlyKwh = dailyKwh / 24;

  // Minimum: cover backup hours at average consumption
  const minimumKwh = hourlyKwh * backupHours;

  // Recommended: cover peak hours + buffer
  const recommendedKwh = hourlyKwh * backupHours * 1.2; // 20% buffer

  // Optimal: if solar, size to store excess production
  // Typical 5kW system produces ~20kWh/day in Canaries
  const optimalKwh = hasSolar
    ? Math.max(recommendedKwh, 10) // At least 10kWh with solar
    : recommendedKwh;

  // Cost estimate (€500/kWh + installation)
  const costPerKwh = 500;
  const installationCost = 800;
  const estimatedCostEur = Math.round(recommendedKwh * costPerKwh + installationCost);

  return {
    recommendedKwh: Math.round(recommendedKwh * 10) / 10,
    minimumKwh: Math.round(minimumKwh * 10) / 10,
    optimalKwh: Math.round(optimalKwh * 10) / 10,
    backupHours,
    estimatedCostEur,
  };
}
