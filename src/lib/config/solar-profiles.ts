/**
 * Solar Production Profiles
 *
 * Hourly solar production curves for different regions and seasons.
 * Values represent fraction of daily production per hour (sum to 1.0).
 *
 * Based on PVGIS data for Canary Islands (28°N latitude).
 */

/**
 * Season type for solar curve selection
 */
export type Season = 'summer' | 'winter' | 'equinox';

/**
 * Get current season based on month
 */
export function getCurrentSeason(month?: number): Season {
  const m = month ?? new Date().getMonth() + 1;

  if (m >= 5 && m <= 8) return 'summer';
  if (m >= 11 || m <= 2) return 'winter';
  return 'equinox';
}

/**
 * Solar production curves for Canary Islands (28°N latitude)
 *
 * Summer: Long days, high production, peak around 13:00
 * Winter: Shorter days, lower production, peak around 12:00
 * Equinox: Average conditions, peak around 12:30
 */
export const SOLAR_CURVES_CANARIAS: Record<Season, number[]> = {
  // Summer (May-August): First light ~6:30, sunset ~21:00
  summer: [
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00, // 0-5: Night
    0.01, 0.03, 0.06, 0.09, 0.11, 0.12, // 6-11: Morning ramp
    0.13, 0.13, 0.12, 0.11, 0.09, 0.06, // 12-17: Peak and afternoon
    0.03, 0.01, 0.00, 0.00, 0.00, 0.00, // 18-23: Evening decline
  ],

  // Winter (Nov-Feb): First light ~7:30, sunset ~18:30
  winter: [
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00, // 0-5: Night
    0.00, 0.01, 0.04, 0.09, 0.13, 0.15, // 6-11: Later sunrise
    0.16, 0.15, 0.13, 0.09, 0.04, 0.01, // 12-17: Peak centered around noon
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00, // 18-23: Early sunset
  ],

  // Equinox (Mar-Apr, Sep-Oct): Average conditions
  equinox: [
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00, // 0-5: Night
    0.00, 0.02, 0.05, 0.09, 0.12, 0.14, // 6-11: Morning
    0.15, 0.14, 0.12, 0.09, 0.06, 0.02, // 12-17: Peak around midday
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00, // 18-23: Evening
  ],
};

/**
 * Regional solar irradiance factors (kWh/kWp/year)
 * Source: PVGIS 5.2 typical year data
 */
export const SOLAR_IRRADIANCE: Record<string, number> = {
  // Canary Islands - excellent solar resource
  canarias: 1750,
  // Mediterranean coast
  mediterraneo: 1600,
  // Southern interior (Sevilla, Córdoba)
  interior_sur: 1650,
  // Central plateau (Madrid)
  interior_centro: 1500,
  // Northern Spain
  norte: 1200,
  // Pyrenees
  pirenaico: 1350,
};

/**
 * Get solar production curve for a region and season
 */
export function getSolarCurve(region: string = 'canarias', season?: Season): number[] {
  const s = season ?? getCurrentSeason();

  // Currently only have detailed curves for Canarias
  // For other regions, use Canarias curves (shape is similar, just scale differs)
  return SOLAR_CURVES_CANARIAS[s];
}

/**
 * Get daily production in kWh for a given system size
 */
export function getDailyProductionKwh(
  systemSizeKwp: number,
  region: string = 'canarias'
): number {
  const annualKwhPerKwp = SOLAR_IRRADIANCE[region] || SOLAR_IRRADIANCE.canarias;
  return (systemSizeKwp * annualKwhPerKwp) / 365;
}

/**
 * Get hourly production in kWh for a given system size and season
 */
export function getHourlyProductionKwh(
  systemSizeKwp: number,
  region: string = 'canarias',
  season?: Season
): number[] {
  const dailyKwh = getDailyProductionKwh(systemSizeKwp, region);
  const curve = getSolarCurve(region, season);

  return curve.map(fraction => dailyKwh * fraction);
}

/**
 * Calculate annual production for a system
 */
export function getAnnualProductionKwh(
  systemSizeKwp: number,
  region: string = 'canarias'
): number {
  const kwhPerKwp = SOLAR_IRRADIANCE[region] || SOLAR_IRRADIANCE.canarias;
  return systemSizeKwp * kwhPerKwp;
}
