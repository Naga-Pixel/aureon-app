/**
 * Layer 1: IGIC/IVA Tax Configuration
 *
 * Canary Islands benefit from 0% IGIC on solar/battery installations
 * vs 21% IVA on mainland Spain.
 *
 * Status: 100% Fixed (regional tax law)
 */

export const IGIC_CONFIG = {
  // Canary Islands: 0% IGIC for renewable energy installations
  // Reference: Ley 4/2012, modified for renewables
  CANARY_ISLANDS_RATE: 0,

  // Mainland Spain: 21% IVA
  MAINLAND_IVA_RATE: 0.21,

  // Reduced IVA for renovations (mainland) - 10%
  MAINLAND_REDUCED_RATE: 0.10,

  // Province codes that qualify for 0% IGIC
  // 35 = Las Palmas (Gran Canaria, Fuerteventura, Lanzarote)
  // 38 = Santa Cruz de Tenerife (Tenerife, La Palma, La Gomera, El Hierro)
  CANARY_PROVINCES: ['35', '38'] as const,
} as const;

/**
 * Check if a postal code is in the Canary Islands
 */
export function isCanaryIslands(postalCode: string): boolean {
  if (!postalCode || postalCode.length < 2) return false;
  const province = postalCode.substring(0, 2);
  return IGIC_CONFIG.CANARY_PROVINCES.includes(province as '35' | '38');
}

/**
 * Get the applicable tax rate for a location
 */
export function getTaxRate(postalCode: string): number {
  return isCanaryIslands(postalCode)
    ? IGIC_CONFIG.CANARY_ISLANDS_RATE
    : IGIC_CONFIG.MAINLAND_IVA_RATE;
}

/**
 * Calculate the tax savings vs mainland Spain
 */
export function calculateTaxSavings(subtotal: number, postalCode: string): number {
  if (!isCanaryIslands(postalCode)) return 0;
  return subtotal * IGIC_CONFIG.MAINLAND_IVA_RATE;
}
