// Incentive Engine Types

export type ProjectType = 'residential' | 'community';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type GrantStatus = 'active' | 'exhausted' | 'upcoming' | 'none';

// Layer 1: Base Cost
export interface BaseCostResult {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grossCost: number;
  taxSavingsVsMainland: number;
  isCanaryIslands: boolean;
}

// Layer 2: Grants
export interface Grant {
  id: string;
  name: string;
  solarRatePerKwp: number;
  batteryRatePerKwh: number;
  maxAmount: number;
  deadline: string;
  confidence: ConfidenceLevel;
}

export interface GrantEstimate {
  status: GrantStatus;
  grants: Grant[];
  solarGrant: number;
  batteryGrant: number;
  totalEstimate: number;
  confidence: ConfidenceLevel;
}

// Layer 3: IRPF
export interface IRPFResult {
  eligible: boolean;
  deductionRate: number;
  deductionBase: number;
  annualDeduction: number;
  totalDeduction: number;
  spreadYears: number;
  validUntil: string;
  requiresCEE: boolean;
  ceeProvided: boolean;
}

// Layer 4: Municipal
export interface MunicipalData {
  name: string;
  ibi_discount_pct: number;
  ibi_duration_yrs: number;
  icio_discount_pct: number;
}

export interface MunicipalIncentives {
  municipalityId: string;
  municipalityName: string;
  ibiDiscountPct: number;
  ibiDurationYrs: number;
  icioDiscountPct: number;
  dataSource: 'official' | 'default';
  lastUpdated: string;
}

export interface MunicipalSavings {
  annualIbiSavings: number;
  ibiSavingsTotal: number;
  icioSavings: number;
  ibiDurationYrs: number;
}

// Waterfall Input/Output
export interface WaterfallInput {
  // System specs
  solarKwp: number;
  batteryKwh: number;
  hardwareCost: number;
  installationCost: number;

  // Location
  postalCode: string;

  // Project type
  projectType: ProjectType;
  numberOfUnits?: number;

  // Property data
  annualIBI?: number;

  // Compliance
  hasCEE: boolean;
}

export interface WaterfallResult {
  // Input echo
  projectType: ProjectType;
  postalCode: string;

  // Layer 1: Base Cost
  baseCost: BaseCostResult;

  // Layer 2: Grants
  grants: GrantEstimate;
  netCostAfterGrant: number;

  // Layer 3: IRPF
  irpf: IRPFResult;
  netCostAfterIRPF: number;

  // Layer 4: Municipal
  municipal: MunicipalIncentives;
  municipalSavings: MunicipalSavings;

  // Final numbers
  effectiveNetCost: number;
  totalIncentives: number;
  incentivePercentage: number;

  // Per-unit (for communities)
  costPerUnit?: number;
  incentivesPerUnit?: number;

  // Confidence breakdown
  confidence: {
    baseCost: 'fixed';
    grants: string;
    irpf: 'fixed' | 'requires_cee';
    municipal: string;
  };
}

// Energy savings (separate from incentives)
export interface EnergySavingsEstimate {
  annualSavingsEur: number;
  arbitrageSavings: number;
  selfConsumptionSavings: number;
  gridFeesSaved: number;
  source: 'esios' | 'estimate';
}

// Combined ROI
export interface BankableROI {
  waterfall: WaterfallResult;
  energySavings: EnergySavingsEstimate;
  paybackYears: number;
  roi10Years: number;
  npv10Years: number;
  irr: number;
}
