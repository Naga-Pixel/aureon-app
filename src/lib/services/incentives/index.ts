/**
 * Incentive Engine
 *
 * A 90% automated grants & incentives calculator for Canary Islands
 * solar and battery installations.
 *
 * Architecture:
 * - Layer 1: IGIC (0% tax) - 100% fixed
 * - Layer 2: BDNS grants - 90% automated via API
 * - Layer 3: IRPF deductions - 100% fixed until 2027
 * - Layer 4: Municipal IBI/ICIO - 10% manual (annual JSON update)
 */

// Main orchestrator
export {
  calculateIncentiveWaterfall,
  quickWaterfallEstimate,
  formatWaterfallSummary,
  generateConfidenceSection,
} from './waterfall';

// Layer 1: Base Cost
export {
  calculateBaseCost,
  estimateHardwareCost,
  formatBaseCostBreakdown,
} from './base-cost';

// Layer 2: Grants (BDNS)
export {
  estimateGrant,
  getGrantRates,
  hasActiveGrants,
  formatGrantEstimate,
} from './bdns';

// Layer 3: IRPF
export {
  calculateIRPF,
  getIRPFInfo,
  formatIRPFResult,
  getCEEWarning,
} from './irpf-calculator';

// Layer 4: Municipal
export {
  getMunicipalIncentives,
  calculateMunicipalSavings,
  getAllMunicipalities,
  getMunicipalDatabaseInfo,
  formatMunicipalIncentives,
  postalCodeToINE,
} from './municipal-lookup';

// Config re-exports
export { isCanaryIslands, getTaxRate, IGIC_CONFIG } from '@/lib/config/incentives/igic';
export { IRPF_CONFIG, isIRPFValid, getIRPFDaysRemaining } from '@/lib/config/incentives/irpf';

// Types
export type {
  ProjectType,
  ConfidenceLevel,
  GrantStatus,
  BaseCostResult,
  Grant,
  GrantEstimate,
  IRPFResult,
  MunicipalData,
  MunicipalIncentives,
  MunicipalSavings,
  WaterfallInput,
  WaterfallResult,
  EnergySavingsEstimate,
  BankableROI,
} from '@/lib/types/incentives';
