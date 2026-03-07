/**
 * Incentive Waterfall Calculator
 *
 * Orchestrates all four layers of the incentive engine:
 * 1. Base Cost (IGIC 0%)
 * 2. Direct Grants (BDNS)
 * 3. State Tax (IRPF)
 * 4. Municipal (IBI/ICIO)
 *
 * Produces a complete financial breakdown for bankable ROI reports.
 */

import { calculateBaseCost, estimateHardwareCost } from './base-cost';
import { estimateGrant } from './bdns';
import { calculateIRPF, getCEEWarning } from './irpf-calculator';
import { getMunicipalIncentives, calculateMunicipalSavings } from './municipal-lookup';
import type { WaterfallInput, WaterfallResult, ProjectType } from '@/lib/types/incentives';

/**
 * Calculate the complete incentive waterfall
 *
 * This is the main entry point for the incentive engine.
 */
export async function calculateIncentiveWaterfall(
  input: WaterfallInput
): Promise<WaterfallResult> {
  const {
    solarKwp,
    batteryKwh,
    hardwareCost,
    installationCost,
    postalCode,
    projectType,
    numberOfUnits = 1,
    annualIBI = 500, // Default estimate
    hasCEE,
  } = input;

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: Base Cost (IGIC)
  // ═══════════════════════════════════════════════════════════════════════════
  const baseCost = calculateBaseCost({
    hardwareCost,
    installationCost,
    postalCode,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: Direct Grants (BDNS)
  // ═══════════════════════════════════════════════════════════════════════════
  const grants = await estimateGrant(solarKwp, batteryKwh, projectType);

  // By law, grants are subtracted before calculating tax deductions
  const netCostAfterGrant = Math.max(0, baseCost.grossCost - grants.totalEstimate);

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: State Tax (IRPF)
  // ═══════════════════════════════════════════════════════════════════════════
  const irpf = calculateIRPF({
    netCostAfterGrants: netCostAfterGrant,
    projectType,
    hasCEE,
    numberOfUnits,
  });

  const netCostAfterIRPF = netCostAfterGrant - irpf.totalDeduction;

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: Municipal (IBI/ICIO)
  // ═══════════════════════════════════════════════════════════════════════════
  const municipal = getMunicipalIncentives(postalCode);
  const municipalSavings = calculateMunicipalSavings(
    annualIBI,
    baseCost.grossCost, // ICIO is based on total project cost
    municipal
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL CALCULATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const totalIncentives =
    baseCost.taxSavingsVsMainland +
    grants.totalEstimate +
    irpf.totalDeduction +
    municipalSavings.ibiSavingsTotal +
    municipalSavings.icioSavings;

  const effectiveNetCost = Math.max(0, baseCost.grossCost - totalIncentives);
  const incentivePercentage = baseCost.grossCost > 0
    ? Math.round((totalIncentives / baseCost.grossCost) * 100)
    : 0;

  // Per-unit calculations for communities
  const costPerUnit = numberOfUnits > 1 ? effectiveNetCost / numberOfUnits : undefined;
  const incentivesPerUnit = numberOfUnits > 1 ? totalIncentives / numberOfUnits : undefined;

  // Build confidence breakdown
  const confidence = {
    baseCost: 'fixed' as const,
    grants: grants.confidence === 'medium'
      ? 'BDNS en vivo'
      : 'Estimación basada en programas activos',
    irpf: hasCEE ? ('fixed' as const) : ('requires_cee' as const),
    municipal: municipal.dataSource === 'official'
      ? `Oficial (${municipal.lastUpdated})`
      : 'Estimación por defecto',
  };

  return {
    projectType,
    postalCode,
    baseCost,
    grants,
    netCostAfterGrant,
    irpf,
    netCostAfterIRPF,
    municipal,
    municipalSavings,
    effectiveNetCost,
    totalIncentives,
    incentivePercentage,
    costPerUnit,
    incentivesPerUnit,
    confidence,
  };
}

/**
 * Quick estimate with auto-calculated costs
 *
 * Use this when you only have system specs, not actual quotes.
 */
export async function quickWaterfallEstimate(params: {
  solarKwp: number;
  batteryKwh: number;
  postalCode: string;
  projectType: ProjectType;
  numberOfUnits?: number;
  annualIBI?: number;
  hasCEE?: boolean;
}): Promise<WaterfallResult> {
  const {
    solarKwp,
    batteryKwh,
    postalCode,
    projectType,
    numberOfUnits = 1,
    annualIBI = 500,
    hasCEE = true, // Assume CEE will be obtained
  } = params;

  // Estimate costs based on system size
  const { hardwareCost, installationCost } = estimateHardwareCost(solarKwp, batteryKwh);

  return calculateIncentiveWaterfall({
    solarKwp,
    batteryKwh,
    hardwareCost,
    installationCost,
    postalCode,
    projectType,
    numberOfUnits,
    annualIBI,
    hasCEE,
  });
}

/**
 * Format waterfall result for display
 */
export function formatWaterfallSummary(result: WaterfallResult): string {
  const lines = [
    `═══════════════════════════════════════════════════════════════`,
    `                RESUMEN DE INCENTIVOS`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `Coste bruto:                    €${result.baseCost.grossCost.toLocaleString('es-ES')}`,
    ``,
    `CAPA 1 - IGIC (0% vs 21% IVA):  -€${result.baseCost.taxSavingsVsMainland.toLocaleString('es-ES')}`,
    `CAPA 2 - Subvención directa:    -€${result.grants.totalEstimate.toLocaleString('es-ES')}`,
    `CAPA 3 - Deducción IRPF:        -€${result.irpf.totalDeduction.toLocaleString('es-ES')}`,
    `CAPA 4 - Ahorro IBI/ICIO:       -€${(result.municipalSavings.ibiSavingsTotal + result.municipalSavings.icioSavings).toLocaleString('es-ES')}`,
    `───────────────────────────────────────────────────────────────`,
    `TOTAL INCENTIVOS:               €${result.totalIncentives.toLocaleString('es-ES')} (${result.incentivePercentage}%)`,
    ``,
    `COSTE EFECTIVO NETO:            €${result.effectiveNetCost.toLocaleString('es-ES')}`,
  ];

  if (result.costPerUnit) {
    lines.push(`  Por unidad (${result.projectType === 'community' ? 'vivienda' : 'unidad'}): €${result.costPerUnit.toLocaleString('es-ES')}`);
  }

  lines.push(
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `                CONFIANZA DE DATOS`,
    `═══════════════════════════════════════════════════════════════`,
    `Coste base:      ${result.confidence.baseCost === 'fixed' ? '✓ Fijo (ley regional)' : result.confidence.baseCost}`,
    `Subvenciones:    ${result.confidence.grants}`,
    `IRPF:            ${result.confidence.irpf === 'fixed' ? '✓ Garantizado (RD-ley)' : '⚠️ Requiere CEE'}`,
    `Municipal:       ${result.confidence.municipal}`,
  );

  // Add CEE warning if needed
  const ceeWarning = getCEEWarning(result.irpf.ceeProvided);
  if (ceeWarning) {
    lines.push(``, ceeWarning);
  }

  return lines.join('\n');
}

/**
 * Generate confidence breakdown for PDF reports
 */
export function generateConfidenceSection(result: WaterfallResult): {
  items: Array<{ component: string; source: string; confidence: string }>;
  warnings: string[];
} {
  const items = [
    {
      component: 'Ahorro energético',
      source: 'ESIOS API (tiempo real)',
      confidence: '100%',
    },
    {
      component: 'Coste base (IGIC)',
      source: 'Ley 4/2012 Canarias',
      confidence: '100%',
    },
    {
      component: 'Deducciones IRPF',
      source: `RD-ley vigente hasta ${result.irpf.validUntil}`,
      confidence: result.irpf.eligible ? '100%' : 'Requiere CEE',
    },
    {
      component: 'Subvenciones directas',
      source: result.confidence.grants,
      confidence: 'Sujeto a disponibilidad',
    },
    {
      component: 'Impuestos municipales',
      source: result.confidence.municipal,
      confidence: 'Verificar ordenanza local',
    },
  ];

  const warnings: string[] = [];

  if (!result.irpf.ceeProvided) {
    warnings.push(
      'La deducción IRPF requiere Certificado de Eficiencia Energética (CEE) ' +
        'pre y post instalación mostrando reducción del 30% en consumo no renovable.'
    );
  }

  if (result.grants.confidence === 'low') {
    warnings.push(
      'Las subvenciones son estimaciones basadas en programas típicos. ' +
        'El importe final depende de la solicitud y disponibilidad presupuestaria.'
    );
  }

  if (result.municipal.dataSource === 'default') {
    warnings.push(
      `No se encontró ordenanza fiscal específica para el código postal ${result.postalCode}. ` +
        'Se aplicaron valores por defecto. Verificar con el ayuntamiento.'
    );
  }

  return { items, warnings };
}
