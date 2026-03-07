/**
 * Layer 3: IRPF Tax Deduction Calculator
 *
 * Calculates Spanish state IRPF deductions for renewable energy installations.
 * Logic is 100% fixed based on Royal Decree until 2026/2027.
 */

import { IRPF_CONFIG, isIRPFValid, getIRPFDaysRemaining } from '@/lib/config/incentives/irpf';
import type { IRPFResult, ProjectType } from '@/lib/types/incentives';

export interface IRPFInput {
  netCostAfterGrants: number;
  projectType: ProjectType;
  hasCEE: boolean;
  numberOfUnits?: number; // For community projects - splits deduction
}

/**
 * Calculate IRPF deduction
 *
 * IMPORTANT: The deduction is applied to the NET cost (after grants).
 * This is mandated by Hacienda - grants reduce the deductible base.
 */
export function calculateIRPF(input: IRPFInput): IRPFResult {
  const { netCostAfterGrants, projectType, hasCEE, numberOfUnits = 1 } = input;

  const config = IRPF_CONFIG[projectType];
  const validUntil = config.validUntil;

  // Base result for ineligible cases
  const baseResult: IRPFResult = {
    eligible: false,
    deductionRate: 0,
    deductionBase: 0,
    annualDeduction: 0,
    totalDeduction: 0,
    spreadYears: 0,
    validUntil,
    requiresCEE: true,
    ceeProvided: hasCEE,
  };

  // Check if IRPF is still valid
  if (!isIRPFValid(projectType)) {
    return {
      ...baseResult,
      eligible: false,
    };
  }

  // Check CEE requirement
  if (!hasCEE) {
    return baseResult;
  }

  // Calculate deduction
  if (projectType === 'residential') {
    const deductionBase = Math.min(netCostAfterGrants, config.maxAnnualBase);
    const totalDeduction = deductionBase * config.rate;

    return {
      eligible: true,
      deductionRate: config.rate,
      deductionBase,
      annualDeduction: totalDeduction,
      totalDeduction,
      spreadYears: 1,
      validUntil,
      requiresCEE: true,
      ceeProvided: true,
    };
  }

  // Community project
  const communityConfig = IRPF_CONFIG.community;

  // For communities, the cost is typically split among units
  // but the deduction applies to the total project cost
  const deductionBase = Math.min(netCostAfterGrants, communityConfig.maxTotalBase);
  const totalDeduction = deductionBase * communityConfig.rate;

  // Calculate how many years to spread the deduction
  const spreadYears = Math.min(
    Math.ceil(deductionBase / communityConfig.maxAnnualBase),
    communityConfig.spreadYears
  );

  const annualDeduction = totalDeduction / spreadYears;

  // Per-unit breakdown (informational)
  const deductionPerUnit = numberOfUnits > 1 ? totalDeduction / numberOfUnits : totalDeduction;

  return {
    eligible: true,
    deductionRate: communityConfig.rate,
    deductionBase,
    annualDeduction: Math.round(annualDeduction),
    totalDeduction: Math.round(totalDeduction),
    spreadYears,
    validUntil,
    requiresCEE: true,
    ceeProvided: true,
  };
}

/**
 * Get IRPF info for display
 */
export function getIRPFInfo(projectType: ProjectType) {
  const config = IRPF_CONFIG[projectType];
  const daysRemaining = getIRPFDaysRemaining(projectType);

  return {
    rate: config.rate,
    ratePercent: `${(config.rate * 100).toFixed(0)}%`,
    maxAnnualBase: config.maxAnnualBase,
    maxTotalBase: config.maxTotalBase,
    validUntil: config.validUntil,
    daysRemaining,
    isExpiringSoon: daysRemaining < 90,
    spreadYears: config.spreadYears,
  };
}

/**
 * Format IRPF result for display
 */
export function formatIRPFResult(result: IRPFResult): string {
  if (!result.eligible) {
    if (!result.ceeProvided) {
      return `Deducción IRPF: No aplicable (requiere Certificado de Eficiencia Energética)`;
    }
    return `Deducción IRPF: No aplicable (programa expirado)`;
  }

  const lines = [
    `Deducción IRPF (${(result.deductionRate * 100).toFixed(0)}%): €${result.totalDeduction.toLocaleString('es-ES')}`,
    `  Base deducible: €${result.deductionBase.toLocaleString('es-ES')}`,
  ];

  if (result.spreadYears > 1) {
    lines.push(`  Deducción anual: €${result.annualDeduction.toLocaleString('es-ES')} (${result.spreadYears} años)`);
  }

  lines.push(`  Válido hasta: ${result.validUntil}`);
  lines.push(`  Requisito CEE: ✓ Cumplido`);

  return lines.join('\n');
}

/**
 * Generate CEE warning message if needed
 */
export function getCEEWarning(hasCEE: boolean): string | null {
  if (hasCEE) return null;

  return `⚠️ IMPORTANTE: Para aplicar la deducción IRPF del ${(IRPF_CONFIG.community.rate * 100).toFixed(0)}% ` +
    `es necesario obtener un Certificado de Eficiencia Energética (CEE) ` +
    `antes y después de la instalación, demostrando una reducción del 30% ` +
    `en el consumo de energía no renovable.`;
}
