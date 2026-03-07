// Battery Assessment Configuration

// Island grid vulnerability (isolated grids = more fragile)
export const ISLAND_VULNERABILITY: Record<string, { score: number; label: string; gridSizeMW: number }> = {
  'el hierro': { score: 95, label: 'Muy Alta', gridSizeMW: 13 },
  'la gomera': { score: 85, label: 'Alta', gridSizeMW: 25 },
  'la palma': { score: 80, label: 'Alta', gridSizeMW: 100 },
  'fuerteventura': { score: 70, label: 'Media-Alta', gridSizeMW: 200 },
  'lanzarote': { score: 70, label: 'Media-Alta', gridSizeMW: 250 },
  'tenerife': { score: 55, label: 'Media', gridSizeMW: 1000 },
  'gran canaria': { score: 50, label: 'Media', gridSizeMW: 1100 },
};

// Consumption estimation by property type (kWh/m²/year)
export const CONSUMPTION_FACTORS: Record<string, number> = {
  residential: 45,      // Average Spanish household ~45 kWh/m²/year
  residential_new: 35,  // New builds are more efficient
  apartment: 40,
  villa: 55,            // Larger, often with pool/AC
  commercial: 80,
};

// Battery sizing parameters
export const BATTERY_CONFIG = {
  // Typical daily consumption patterns
  PEAK_HOURS_FRACTION: 0.4,           // 40% of daily consumption during peak hours
  BACKUP_HOURS_RECOMMENDED: 4,        // Hours of backup for average home
  BACKUP_HOURS_CRITICAL: 8,           // Hours for critical needs

  // Battery efficiency and degradation
  ROUND_TRIP_EFFICIENCY: 0.90,        // 90% round-trip efficiency
  ANNUAL_DEGRADATION: 0.02,           // 2% capacity loss per year
  WARRANTY_YEARS: 10,
  EXPECTED_LIFESPAN_YEARS: 15,

  // Pricing (€)
  COST_PER_KWH: 500,                  // €500/kWh installed (2024 prices)
  INSTALLATION_BASE_COST: 800,        // Base installation cost

  // Arbitrage assumptions
  PEAK_OFF_PEAK_SPREAD_EUR: 0.10,     // Average €0.10/kWh spread
  ARBITRAGE_CYCLES_PER_YEAR: 300,     // Days with meaningful arbitrage

  // Scoring weights
  WEIGHTS: {
    gridVulnerability: 0.30,
    consumptionProfile: 0.25,
    arbitragePotential: 0.20,
    solarSynergy: 0.15,
    installationEase: 0.10,
  },

  // Score thresholds
  SCORE_THRESHOLDS: {
    excellent: 80,
    good: 65,
    fair: 50,
    poor: 0,
  },
};

// Property type options
export const PROPERTY_TYPES = [
  { value: 'residential', label: 'Vivienda unifamiliar' },
  { value: 'residential_new', label: 'Vivienda nueva (< 5 años)' },
  { value: 'apartment', label: 'Piso / Apartamento' },
  { value: 'villa', label: 'Chalet / Villa' },
];

// Backup priority options
export const BACKUP_PRIORITIES = [
  { value: 'basic', label: 'Básico (iluminación, nevera)', hours: 4 },
  { value: 'comfort', label: 'Confort (+ TV, router, cargadores)', hours: 6 },
  { value: 'full', label: 'Completo (+ AC/calefacción)', hours: 8 },
  { value: 'critical', label: 'Crítico (equipo médico)', hours: 12 },
];
