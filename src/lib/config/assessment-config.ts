export const ASSESSMENT_CONFIG = {
  // Default electricity price (editable per assessment)
  DEFAULT_ELECTRICITY_PRICE_EUR: 0.20,

  // Energy pricing types
  ENERGY_TYPES: {
    FIXED: 'fixed',
    VARIABLE: 'variable',
  },

  // System assumptions
  PANEL_WATTS: 400,
  SYSTEM_EFFICIENCY: 0.85,
  INSTALLATION_COST_PER_KW: 1200,

  // Panel degradation and system lifetime
  PANEL_DEGRADATION_RATE: 0.005, // 0.5% per year (industry standard)
  SYSTEM_LIFETIME_YEARS: 25,

  // Regional fallback values for kWh/kWp when PVGIS fails
  REGIONAL_DEFAULTS: {
    CANARY_ISLANDS: 1700, // High irradiance
    SOUTH_SPAIN: 1600, // Andalucía, Murcia, Valencia
    CENTRAL_SPAIN: 1400, // Madrid, Castilla
    NORTH_SPAIN: 1200, // Galicia, Asturias, País Vasco
    DEFAULT: 1500, // Conservative fallback
  } as Record<string, number>,

  // Score weights (must sum to 100)
  SCORE_WEIGHTS: {
    SOLAR_POTENTIAL: 40,
    ECONOMIC_POTENTIAL: 30,
    EXECUTION_SIMPLICITY: 15,
    SEGMENT_FIT: 15,
  },

  // Score thresholds for labels
  SCORE_LABELS: {
    EXCELLENT: 80,
    GOOD: 60,
    MODERATE: 40,
    LOW: 0,
  },

  // Feature flags
  FEATURES: {
    // Set to true to enable Google Solar API (for non-Spanish addresses)
    // Set to false to use Catastro-only mode (Spain only, faster, cheaper)
    GOOGLE_SOLAR_ENABLED: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SOLAR === 'true',
  },
} as const;

export const BUSINESS_SEGMENTS = [
  { value: 'hotel', label: 'Hotel', fitMultiplier: 1.0 },
  { value: 'warehouse', label: 'Almacén', fitMultiplier: 1.2 },
  { value: 'retail', label: 'Comercio', fitMultiplier: 0.9 },
  { value: 'industrial', label: 'Industrial', fitMultiplier: 1.1 },
  { value: 'office', label: 'Oficina', fitMultiplier: 0.85 },
  { value: 'agricultural', label: 'Agrícola', fitMultiplier: 1.15 },
] as const;

export type BusinessSegment = (typeof BUSINESS_SEGMENTS)[number]['value'];

export function getSegmentLabel(value: string): string {
  const segment = BUSINESS_SEGMENTS.find(s => s.value === value);
  return segment?.label ?? value;
}

export function getSegmentMultiplier(value: string): number {
  const segment = BUSINESS_SEGMENTS.find(s => s.value === value);
  return segment?.fitMultiplier ?? 1.0;
}

export function getScoreLabel(score: number): string {
  if (score >= ASSESSMENT_CONFIG.SCORE_LABELS.EXCELLENT) return 'Excelente';
  if (score >= ASSESSMENT_CONFIG.SCORE_LABELS.GOOD) return 'Bueno';
  if (score >= ASSESSMENT_CONFIG.SCORE_LABELS.MODERATE) return 'Moderado';
  return 'Bajo';
}

export function getScoreColor(score: number): string {
  if (score >= ASSESSMENT_CONFIG.SCORE_LABELS.EXCELLENT) return '#22c55e'; // green
  if (score >= ASSESSMENT_CONFIG.SCORE_LABELS.GOOD) return '#a7e26e'; // lime (brand)
  if (score >= ASSESSMENT_CONFIG.SCORE_LABELS.MODERATE) return '#eab308'; // yellow
  return '#ef4444'; // red
}

/**
 * Get regional default kWh/kWp based on latitude
 * Used as fallback when PVGIS API fails
 */
export function getRegionalKwhPerKwp(latitude: number): number {
  const { REGIONAL_DEFAULTS } = ASSESSMENT_CONFIG;

  // Canary Islands (27-29°N)
  if (latitude >= 27 && latitude <= 29.5) {
    return REGIONAL_DEFAULTS.CANARY_ISLANDS;
  }
  // Southern Spain (below 38°N - Andalucía, Murcia, Valencia)
  if (latitude < 38) {
    return REGIONAL_DEFAULTS.SOUTH_SPAIN;
  }
  // Central Spain (38-42°N - Madrid, Castilla)
  if (latitude < 42) {
    return REGIONAL_DEFAULTS.CENTRAL_SPAIN;
  }
  // Northern Spain (above 42°N - Galicia, Asturias, País Vasco)
  return REGIONAL_DEFAULTS.NORTH_SPAIN;
}
