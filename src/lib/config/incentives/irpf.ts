/**
 * Layer 3: IRPF State Tax Deduction Configuration
 *
 * Spanish government IRPF deductions for renewable energy installations.
 * Extended via Royal Decree until 2026 (residential) / 2027 (communities).
 *
 * Status: 100% Fixed until expiry dates
 *
 * IMPORTANT: Requires CEE (Certificado de Eficiencia Energética) showing
 * a 30% reduction in non-renewable energy consumption.
 */

export const IRPF_CONFIG = {
  residential: {
    // 40% deduction for individual homes
    rate: 0.40,
    // Maximum deductible base per year
    maxAnnualBase: 7500,
    // Total maximum over the lifetime
    maxTotalBase: 7500,
    // Valid until end of 2026
    validUntil: '2026-12-31',
    // Can be spread over years
    spreadYears: 1,
  },

  community: {
    // 60% deduction for community/building projects
    rate: 0.60,
    // Maximum deductible base per year
    maxAnnualBase: 5000,
    // Total maximum accumulation over 3 years
    maxTotalBase: 15000,
    // Valid until end of 2027
    validUntil: '2027-12-31',
    // Can be spread over 3 years
    spreadYears: 3,
  },

  // CEE requirement
  requirements: {
    // Must show 30% reduction in non-renewable energy
    minEnergyReduction: 0.30,
    // Pre and post installation certificates required
    requiresPreCEE: true,
    requiresPostCEE: true,
  },
} as const;

// Only residential and community have deduction configs
export type IRPFProjectType = 'residential' | 'community';

/**
 * Check if IRPF deduction is still valid for a project type
 */
export function isIRPFValid(projectType: IRPFProjectType): boolean {
  const config = IRPF_CONFIG[projectType];
  const validUntil = new Date(config.validUntil);
  const now = new Date();
  return now <= validUntil;
}

/**
 * Get days remaining until IRPF expires
 */
export function getIRPFDaysRemaining(projectType: IRPFProjectType): number {
  const config = IRPF_CONFIG[projectType];
  const validUntil = new Date(config.validUntil);
  const now = new Date();
  const diffMs = validUntil.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
