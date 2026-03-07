/**
 * Layer 4: Municipal Tax Incentives Lookup
 *
 * Looks up IBI (property tax) and ICIO (construction tax) discounts
 * from a static JSON dictionary of Canary Island municipalities.
 *
 * Status: 10% manual - updated annually from Ordenanzas Fiscales
 */

import municipalData from '@/lib/config/incentives/municipal.json';
import type { MunicipalIncentives, MunicipalSavings, MunicipalData } from '@/lib/types/incentives';

// Type the imported JSON
interface MunicipalDatabase {
  lastUpdated: string;
  source: string;
  updateFrequency: string;
  nextUpdate: string;
  municipalities: Record<string, MunicipalData>;
  postalCodeToINE: Record<string, string>;
}

const data = municipalData as MunicipalDatabase;

/**
 * Convert postal code to INE municipality code
 */
export function postalCodeToINE(postalCode: string): string {
  if (!postalCode || postalCode.length < 5) {
    return '_default';
  }

  // Try exact match first
  const exactMatch = data.postalCodeToINE[postalCode];
  if (exactMatch) {
    return exactMatch;
  }

  // Try first 5 digits
  const normalized = postalCode.substring(0, 5);
  const normalizedMatch = data.postalCodeToINE[normalized];
  if (normalizedMatch) {
    return normalizedMatch;
  }

  return '_default';
}

/**
 * Get municipal incentives for a postal code
 */
export function getMunicipalIncentives(postalCode: string): MunicipalIncentives {
  const ineCode = postalCodeToINE(postalCode);
  const municipal = data.municipalities[ineCode] || data.municipalities['_default'];
  const isOfficial = ineCode !== '_default' && data.municipalities[ineCode] !== undefined;

  return {
    municipalityId: ineCode,
    municipalityName: municipal.name,
    ibiDiscountPct: municipal.ibi_discount_pct,
    ibiDurationYrs: municipal.ibi_duration_yrs,
    icioDiscountPct: municipal.icio_discount_pct,
    dataSource: isOfficial ? 'official' : 'default',
    lastUpdated: data.lastUpdated,
  };
}

/**
 * Calculate municipal savings
 *
 * @param annualIBI - Annual IBI (property tax) amount
 * @param projectCost - Total project cost (for ICIO calculation)
 * @param municipal - Municipal incentives data
 */
export function calculateMunicipalSavings(
  annualIBI: number,
  projectCost: number,
  municipal: MunicipalIncentives
): MunicipalSavings {
  // IBI savings over the discount period
  const annualIbiSavings = annualIBI * municipal.ibiDiscountPct;
  const ibiSavingsTotal = annualIbiSavings * municipal.ibiDurationYrs;

  // ICIO (Impuesto sobre Construcciones, Instalaciones y Obras)
  // Typically 2-4% of project cost, varies by municipality
  const ICIO_RATE = 0.04; // 4% is common
  const icioCost = projectCost * ICIO_RATE;
  const icioSavings = icioCost * municipal.icioDiscountPct;

  return {
    annualIbiSavings: Math.round(annualIbiSavings),
    ibiSavingsTotal: Math.round(ibiSavingsTotal),
    icioSavings: Math.round(icioSavings),
    ibiDurationYrs: municipal.ibiDurationYrs,
  };
}

/**
 * Get all municipalities (for admin/reference)
 */
export function getAllMunicipalities(): Array<{
  ineCode: string;
  name: string;
  ibiDiscount: string;
  icioDiscount: string;
}> {
  return Object.entries(data.municipalities)
    .filter(([code]) => code !== '_default')
    .map(([code, muni]) => ({
      ineCode: code,
      name: muni.name,
      ibiDiscount: `${(muni.ibi_discount_pct * 100).toFixed(0)}% x ${muni.ibi_duration_yrs} años`,
      icioDiscount: `${(muni.icio_discount_pct * 100).toFixed(0)}%`,
    }));
}

/**
 * Get database metadata
 */
export function getMunicipalDatabaseInfo() {
  return {
    lastUpdated: data.lastUpdated,
    source: data.source,
    updateFrequency: data.updateFrequency,
    nextUpdate: data.nextUpdate,
    municipalityCount: Object.keys(data.municipalities).length - 1, // Exclude _default
  };
}

/**
 * Format municipal incentives for display
 */
export function formatMunicipalIncentives(
  municipal: MunicipalIncentives,
  savings: MunicipalSavings
): string {
  const lines = [
    `Municipio: ${municipal.municipalityName}`,
    ``,
    `IBI (Impuesto sobre Bienes Inmuebles):`,
    `  Bonificación: ${(municipal.ibiDiscountPct * 100).toFixed(0)}% durante ${municipal.ibiDurationYrs} años`,
    `  Ahorro anual: €${savings.annualIbiSavings.toLocaleString('es-ES')}`,
    `  Ahorro total: €${savings.ibiSavingsTotal.toLocaleString('es-ES')}`,
    ``,
    `ICIO (Impuesto sobre Construcciones):`,
    `  Bonificación: ${(municipal.icioDiscountPct * 100).toFixed(0)}%`,
    `  Ahorro: €${savings.icioSavings.toLocaleString('es-ES')}`,
  ];

  if (municipal.dataSource === 'default') {
    lines.push(``, `⚠️ Datos estimados. Verificar ordenanza municipal.`);
  } else {
    lines.push(``, `Fuente: ${municipal.lastUpdated}`);
  }

  return lines.join('\n');
}
