export interface CalculatorInput {
  monthlyBill: number;
  propertyType?: string;
  island?: string;
}

export interface CalculatorResult {
  monthlySavings: number;
  annualSavings: number;
  estimatedSubsidy: number;
  installationCost: number;
  netCost: number;
  roiYears: number;
  totalSavings25Years: number;
}

const SAVINGS_RATE = 0.75; // 75% savings
const SUBSIDY_RATE = 0.65; // 65% subsidy
const INSTALLATION_COST_MULTIPLIER = 15; // Rough estimation based on monthly bill

export function calculateSavings(input: CalculatorInput): CalculatorResult {
  const { monthlyBill } = input;

  const monthlySavings = monthlyBill * SAVINGS_RATE;
  const annualSavings = monthlySavings * 12;
  const installationCost = monthlyBill * INSTALLATION_COST_MULTIPLIER;
  const estimatedSubsidy = installationCost * SUBSIDY_RATE;
  const netCost = installationCost - estimatedSubsidy;
  const roiYears = netCost / annualSavings;
  const totalSavings25Years = annualSavings * 25;

  return {
    monthlySavings: Math.round(monthlySavings),
    annualSavings: Math.round(annualSavings),
    estimatedSubsidy: Math.round(estimatedSubsidy),
    installationCost: Math.round(installationCost),
    netCost: Math.round(netCost),
    roiYears: Math.round(roiYears * 10) / 10,
    totalSavings25Years: Math.round(totalSavings25Years),
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
