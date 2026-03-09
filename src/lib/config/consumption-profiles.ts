// Consumption Estimation Profiles
// Based on IDAE (Instituto para la Diversificación y Ahorro de la Energía) data

/**
 * Consumption factors by building/business segment
 * Values in kWh/m²/year
 */
export const CONSUMPTION_BY_SEGMENT: Record<string, {
  base: number;           // Base consumption per m²
  heating: number;        // Additional for climate control
  cooling: number;        // AC intensive use
  description: string;
  peakHoursFraction: number; // % of daily consumption during peak (18-22h)
  selfConsumptionRatio: number; // Typical solar self-consumption without battery
}> = {
  // Residential
  residential: {
    base: 35,
    heating: 15,
    cooling: 10,
    description: 'Vivienda unifamiliar',
    peakHoursFraction: 0.45, // High evening usage
    selfConsumptionRatio: 0.30, // Low - people at work during solar hours
  },
  residential_new: {
    base: 25,
    heating: 10,
    cooling: 8,
    description: 'Vivienda nueva eficiente',
    peakHoursFraction: 0.45,
    selfConsumptionRatio: 0.30,
  },
  apartment: {
    base: 30,
    heating: 12,
    cooling: 8,
    description: 'Piso/Apartamento',
    peakHoursFraction: 0.50,
    selfConsumptionRatio: 0.25,
  },
  // Community / apartment building (entire building)
  apartment_building: {
    base: 35,       // Per m² of roof (multiply by ~10-20 units)
    heating: 15,
    cooling: 12,
    description: 'Edificio de pisos (comunidad)',
    peakHoursFraction: 0.45, // Diverse usage patterns average out peaks
    selfConsumptionRatio: 0.55, // Good - some units always home during solar hours
  },
  villa: {
    base: 50,
    heating: 20,
    cooling: 25, // Pool pumps, large AC
    description: 'Chalet/Villa',
    peakHoursFraction: 0.40,
    selfConsumptionRatio: 0.35,
  },

  // Commercial
  commercial: {
    base: 80,
    heating: 25,
    cooling: 35,
    description: 'Local comercial',
    peakHoursFraction: 0.25, // Most consumption during business hours
    selfConsumptionRatio: 0.60, // Good - open during solar hours
  },
  office: {
    base: 100,
    heating: 30,
    cooling: 40,
    description: 'Oficinas',
    peakHoursFraction: 0.15, // Very low evening use
    selfConsumptionRatio: 0.70, // Excellent - 9-18h operation
  },
  retail: {
    base: 120,
    heating: 25,
    cooling: 50, // Refrigeration, AC
    description: 'Comercio/Tienda',
    peakHoursFraction: 0.30,
    selfConsumptionRatio: 0.55,
  },
  restaurant: {
    base: 200,
    heating: 30,
    cooling: 60,
    description: 'Restaurante/Bar',
    peakHoursFraction: 0.50, // Evening service
    selfConsumptionRatio: 0.40,
  },
  hotel: {
    base: 150,
    heating: 40,
    cooling: 60,
    description: 'Hotel',
    peakHoursFraction: 0.35,
    selfConsumptionRatio: 0.50,
  },

  // Industrial
  industrial: {
    base: 150,
    heating: 20,
    cooling: 30,
    description: 'Nave industrial',
    peakHoursFraction: 0.20, // Daytime operation
    selfConsumptionRatio: 0.65,
  },
  warehouse: {
    base: 40,
    heating: 10,
    cooling: 15,
    description: 'Almacén',
    peakHoursFraction: 0.15,
    selfConsumptionRatio: 0.70,
  },
  factory: {
    base: 250,
    heating: 30,
    cooling: 40,
    description: 'Fábrica',
    peakHoursFraction: 0.25,
    selfConsumptionRatio: 0.60,
  },

  // Agricultural
  agricultural: {
    base: 60,
    heating: 10,
    cooling: 20, // Irrigation pumps
    description: 'Explotación agrícola',
    peakHoursFraction: 0.20,
    selfConsumptionRatio: 0.50,
  },
  greenhouse: {
    base: 180,
    heating: 60,
    cooling: 40,
    description: 'Invernadero',
    peakHoursFraction: 0.30,
    selfConsumptionRatio: 0.55,
  },
};

/**
 * Climate zone multipliers for Spain
 * Adjusts heating/cooling consumption
 */
export const CLIMATE_ZONES: Record<string, { heating: number; cooling: number; label: string }> = {
  'canarias': { heating: 0.3, cooling: 1.4, label: 'Canarias (subtropical)' },
  'mediterraneo': { heating: 0.6, cooling: 1.3, label: 'Costa mediterránea' },
  'interior_sur': { heating: 0.8, cooling: 1.5, label: 'Interior sur (Sevilla, Córdoba)' },
  'interior_centro': { heating: 1.2, cooling: 1.2, label: 'Meseta central (Madrid)' },
  'norte': { heating: 1.5, cooling: 0.5, label: 'Norte (Galicia, Asturias)' },
  'pirenaico': { heating: 1.8, cooling: 0.3, label: 'Zona pirenaica' },
};

/**
 * Detect climate zone from coordinates
 */
export function detectClimateZone(lat: number, lon: number): string {
  // Canary Islands
  if (lat < 29.5 && lon < -13) return 'canarias';

  // Northern Spain
  if (lat > 43) return 'norte';

  // Pyrenees area
  if (lat > 42 && lon > 0) return 'pirenaico';

  // Mediterranean coast
  if (lon > 0 || (lat < 38 && lon > -1)) return 'mediterraneo';

  // Southern interior
  if (lat < 38.5) return 'interior_sur';

  // Central plateau
  return 'interior_centro';
}

/**
 * Estimate annual consumption for a building
 */
export function estimateAnnualConsumption(
  roofAreaM2: number,
  segment: string,
  latitude: number,
  longitude: number,
  floors: number = 1
): {
  annualKwh: number;
  dailyKwh: number;
  peakDailyKwh: number;
  valleyDailyKwh: number;
  selfConsumptionRatio: number;
  climateZone: string;
} {
  const profile = CONSUMPTION_BY_SEGMENT[segment] || CONSUMPTION_BY_SEGMENT.commercial;
  const climateZone = detectClimateZone(latitude, longitude);
  const climate = CLIMATE_ZONES[climateZone];

  // Calculate building floor area (roof area × floors)
  const floorArea = roofAreaM2 * floors;

  // Base consumption adjusted for climate
  const baseConsumption = profile.base * floorArea;
  const heatingConsumption = profile.heating * floorArea * climate.heating;
  const coolingConsumption = profile.cooling * floorArea * climate.cooling;

  const annualKwh = baseConsumption + heatingConsumption + coolingConsumption;
  const dailyKwh = annualKwh / 365;

  // Split into peak and valley
  const peakDailyKwh = dailyKwh * profile.peakHoursFraction;
  const valleyDailyKwh = dailyKwh * (1 - profile.peakHoursFraction);

  return {
    annualKwh: Math.round(annualKwh),
    dailyKwh: Math.round(dailyKwh * 10) / 10,
    peakDailyKwh: Math.round(peakDailyKwh * 10) / 10,
    valleyDailyKwh: Math.round(valleyDailyKwh * 10) / 10,
    selfConsumptionRatio: profile.selfConsumptionRatio,
    climateZone,
  };
}

/**
 * Outage cost estimation by segment (€/hour of outage)
 * Based on business interruption studies
 */
export const OUTAGE_COSTS: Record<string, { perHour: number; annualRisk: number; description: string }> = {
  residential: {
    perHour: 5,
    annualRisk: 0.05, // 5% chance of significant outage
    description: 'Inconvenience, food spoilage',
  },
  residential_new: {
    perHour: 5,
    annualRisk: 0.05,
    description: 'Inconvenience, food spoilage',
  },
  apartment: {
    perHour: 3,
    annualRisk: 0.05,
    description: 'Lower impact (smaller appliances)',
  },
  apartment_building: {
    perHour: 50,        // Multiple families affected
    annualRisk: 0.08,   // Higher stakes = more maintenance awareness
    description: 'Elevator, common areas, multiple families',
  },
  villa: {
    perHour: 15,
    annualRisk: 0.08,
    description: 'Pool equipment, security systems',
  },
  commercial: {
    perHour: 50,
    annualRisk: 0.10,
    description: 'Lost sales, customer impact',
  },
  office: {
    perHour: 100,
    annualRisk: 0.08,
    description: 'Productivity loss',
  },
  retail: {
    perHour: 150,
    annualRisk: 0.10,
    description: 'Lost sales, refrigeration',
  },
  restaurant: {
    perHour: 200,
    annualRisk: 0.12,
    description: 'Food spoilage, lost service',
  },
  hotel: {
    perHour: 300,
    annualRisk: 0.08,
    description: 'Guest impact, reputation',
  },
  industrial: {
    perHour: 500,
    annualRisk: 0.15,
    description: 'Production stoppage',
  },
  warehouse: {
    perHour: 30,
    annualRisk: 0.08,
    description: 'Limited impact (lighting, doors)',
  },
  factory: {
    perHour: 1000,
    annualRisk: 0.20,
    description: 'Major production loss',
  },
  agricultural: {
    perHour: 80,
    annualRisk: 0.15,
    description: 'Irrigation, livestock systems',
  },
  greenhouse: {
    perHour: 150,
    annualRisk: 0.15,
    description: 'Climate control critical',
  },
};

/**
 * Calculate expected annual outage cost
 */
export function calculateOutageCost(
  segment: string,
  gridVulnerability: number, // 0-100
  backupHours: number = 4
): { annualCost: number; avoidedWithBattery: number } {
  const profile = OUTAGE_COSTS[segment] || OUTAGE_COSTS.commercial;

  // Adjust risk based on grid vulnerability
  // Higher vulnerability = more frequent/longer outages
  const vulnerabilityMultiplier = 1 + (gridVulnerability / 100) * 2; // 1x to 3x
  const adjustedRisk = Math.min(profile.annualRisk * vulnerabilityMultiplier, 0.5);

  // Expected outage hours per year
  const expectedOutageHours = adjustedRisk * 24; // Assume outages average 24h when they happen

  // Annual cost without protection
  const annualCost = expectedOutageHours * profile.perHour;

  // With battery, we avoid cost for backupHours
  const hoursProtected = Math.min(backupHours, expectedOutageHours);
  const avoidedWithBattery = hoursProtected * profile.perHour;

  return {
    annualCost: Math.round(annualCost),
    avoidedWithBattery: Math.round(avoidedWithBattery),
  };
}
