/**
 * 2026 Battery & Solar Grant Configuration
 *
 * Detailed grant data for Canary Islands installations.
 * These grants are STACKABLE - recipients can combine multiple programs.
 *
 * ============================================================================
 * GRANT SYSTEM ARCHITECTURE (Two-Level)
 * ============================================================================
 *
 * We use a TWO-LEVEL system to balance simplicity with accuracy:
 *
 * LEVEL 1: Grant Category (simple, drives grant eligibility)
 * ---------------------------------------------------------
 * - "residential" → All homeowner grants (Regional, Cabildo, IRPF, Energy Communities, etc.)
 * - "business"    → Commercial/Industrial programs (different requirements, larger amounts)
 *
 * This is the main toggle in the UI. When adding new grants, just set the
 * `category` field - no UI changes needed.
 *
 * LEVEL 2: Business Segment (granular, for consumption/sizing accuracy)
 * ---------------------------------------------------------------------
 * - residential, apartment_building, villa, etc. → Different kWh/m² consumption
 * - commercial, office, retail, restaurant, etc. → Higher consumption profiles
 *
 * This affects battery sizing and savings calculations but NOT grant eligibility.
 * See: src/lib/config/consumption-profiles.ts
 *
 * WHAT'S AFFECTED BY CATEGORY?
 * ----------------------------
 * - Direct grants (Regional, Cabildo)     → Category-specific
 * - IRPF 40% deduction                    → Residential only
 * - IBI/ICIO municipal rebates            → Both (see municipal.json)
 * - Business tax (IVA, Soc.)              → Business only (TODO)
 *
 * WHY THIS DESIGN?
 * ----------------
 * - Grants are category-based (residential vs business) - keeps logic simple
 * - Consumption varies greatly by building type - needs granular segments
 * - Adding new grants = just add to BATTERY_GRANTS_2026 array with category
 * - No UI complexity explosion as we add more grant programs
 *
 * ============================================================================
 *
 * Last updated: March 2026
 */

export type GrantCategory = 'residential' | 'business';

export interface GrantProgram {
  id: string;
  name: string;
  organization: string;
  category: GrantCategory;
  ratePerKwh: number;
  ratePerKwp?: number; // For solar
  maxAmount: number;
  maxCapacityKwh?: number; // Max battery size eligible
  percentageCap?: number; // e.g., 0.5 = 50% of project cost
  islands: string[]; // Which islands this applies to
  deadline: string;
  status: 'active' | 'upcoming' | 'exhausted';
  compatibleWith: string[]; // IDs of compatible grants
  notes?: string;
  applicationUrl?: string;
}

/**
 * 2026 Battery Grants for Residential Installations
 */
export const BATTERY_GRANTS_2026: GrantProgram[] = [
  // ========== RESIDENTIAL GRANTS ==========
  {
    id: 'canarias-regional-battery-2026',
    name: 'Subvencion Regional Baterias',
    organization: 'Gobierno de Canarias',
    category: 'residential',
    ratePerKwh: 490,
    maxAmount: 4900, // 10kWh * 490
    maxCapacityKwh: 10,
    islands: ['Gran Canaria', 'Fuerteventura', 'Tenerife', 'Lanzarote', 'La Palma', 'La Gomera', 'El Hierro'],
    deadline: '2026-12-31',
    status: 'active',
    compatibleWith: ['cabildo-gc-battery-2026', 'cabildo-fv-medida-i-2026'],
    notes: 'Para baterias residenciales menores de 10kWh',
  },
  {
    id: 'cabildo-gc-battery-2026',
    name: 'Ayuda Cabildo Gran Canaria',
    organization: 'Cabildo de Gran Canaria',
    category: 'residential',
    ratePerKwh: 300,
    maxAmount: 1000,
    islands: ['Gran Canaria'],
    deadline: '2026-09-30',
    status: 'active',
    compatibleWith: ['canarias-regional-battery-2026'],
    notes: 'Compatible con subvencion regional. Maximo 1.000 EUR por vivienda.',
  },
  {
    id: 'cabildo-fv-medida-i-2026',
    name: 'Medida I - Autoconsumo Residencial',
    organization: 'Cabildo de Fuerteventura',
    category: 'residential',
    ratePerKwh: 0, // Uses percentage instead
    percentageCap: 0.5, // 50% of installation cost
    maxAmount: 5000,
    islands: ['Fuerteventura'],
    deadline: '2026-04-04',
    status: 'active',
    compatibleWith: ['canarias-regional-battery-2026'],
    notes: 'Convocatoria abierta 5 marzo - 4 abril 2026. Cubre hasta 50% del presupuesto.',
    applicationUrl: 'https://sede.cabildofuer.es/',
  },
  // ========== BUSINESS GRANTS ==========
  // Placeholder for future business grants
  // {
  //   id: 'pyme-autoconsumo-2026',
  //   name: 'Programa PYME Autoconsumo',
  //   organization: 'IDAE',
  //   category: 'business',
  //   ...
  // },
];

/**
 * IRPF Tax Deduction (on top of direct grants)
 */
export const IRPF_DEDUCTION_2026 = {
  rate: 0.40, // 40%
  maxBase: 7500, // Maximum deductible base
  validUntil: '2026-12-31',
  appliesTo: 'remaining cost after grants',
  requiresCEE: true,
  notes: 'Se aplica sobre el coste restante despues de subvenciones directas',
};

/**
 * Calculate all applicable battery grants for a location and category
 */
export function getApplicableBatteryGrants(
  island: string,
  category: GrantCategory = 'residential'
): GrantProgram[] {
  const now = new Date();
  return BATTERY_GRANTS_2026.filter(grant => {
    const deadline = new Date(grant.deadline);
    const isActive = grant.status === 'active' && deadline >= now;
    const appliesToIsland = grant.islands.includes(island);
    const matchesCategory = grant.category === category;
    return isActive && appliesToIsland && matchesCategory;
  });
}

/**
 * Calculate stacked battery grants for a specific installation
 */
export interface StackedGrantResult {
  grants: Array<{
    program: GrantProgram;
    amount: number;
    calculation: string;
    rejectedAlternatives?: string; // Other grants that were not chosen (for transparency)
  }>;
  totalDirectGrants: number;
  irpfDeduction: number;
  irpfCalculation: string;
  totalIncentives: number;
  netCost: number;
  savingsPercentage: number;
}

/**
 * Calculate the best battery grant for a specific installation.
 *
 * IMPORTANT: Under Spanish Ley General de Subvenciones and EU FEDER guidelines,
 * you CANNOT stack multiple public grants for the same eligible cost (battery invoice).
 * This is "doble financiación" (double funding) and is illegal.
 *
 * For battery-only installations, we pick the SINGLE BEST grant.
 * IRPF deduction can still be applied (it's a tax deduction, not a grant).
 */
export function calculateStackedBatteryGrants(
  batteryCost: number,
  batteryKwh: number,
  island: string,
  category: GrantCategory = 'residential'
): StackedGrantResult {
  const applicableGrants = getApplicableBatteryGrants(island, category);
  const grantResults: StackedGrantResult['grants'] = [];
  let totalDirectGrants = 0;

  // Calculate value of each grant
  const grantValues = applicableGrants.map(grant => {
    let amount: number;
    let calculation: string;

    if (grant.percentageCap) {
      // Percentage-based grant (like Fuerteventura Medida I)
      amount = Math.min(
        batteryCost * grant.percentageCap,
        grant.maxAmount
      );
      calculation = `${(grant.percentageCap * 100).toFixed(0)}% de ${batteryCost.toLocaleString('es-ES')} EUR = ${amount.toLocaleString('es-ES')} EUR (max ${grant.maxAmount.toLocaleString('es-ES')} EUR)`;
    } else {
      // Per-kWh grant (like Regional)
      const effectiveKwh = grant.maxCapacityKwh
        ? Math.min(batteryKwh, grant.maxCapacityKwh)
        : batteryKwh;
      amount = Math.min(
        effectiveKwh * grant.ratePerKwh,
        grant.maxAmount
      );
      calculation = `${effectiveKwh.toFixed(1)} kWh x ${grant.ratePerKwh} EUR/kWh = ${amount.toLocaleString('es-ES')} EUR`;
      if (grant.maxCapacityKwh && batteryKwh > grant.maxCapacityKwh) {
        calculation += ` (max ${grant.maxCapacityKwh} kWh elegibles)`;
      }
    }

    return { grant, amount: Math.round(amount), calculation };
  });

  // Sort by value (highest first) and pick the BEST ONE
  grantValues.sort((a, b) => b.amount - a.amount);

  if (grantValues.length > 0) {
    const bestGrant = grantValues[0];
    grantResults.push({
      program: bestGrant.grant,
      amount: bestGrant.amount,
      calculation: bestGrant.calculation,
    });
    totalDirectGrants = bestGrant.amount;

    // Add note about rejected grants (for transparency)
    if (grantValues.length > 1) {
      const rejectedGrants = grantValues.slice(1);
      const rejectedNote = rejectedGrants
        .map(g => `${g.grant.name}: ${g.amount.toLocaleString('es-ES')} EUR`)
        .join(', ');
      // Store this for potential display in report
      grantResults[0].rejectedAlternatives = rejectedNote;
    }
  }

  // IRPF deduction on remaining cost (only for residential)
  // Note: IRPF is a tax deduction, NOT a grant - can be combined
  let remainingCost = Math.max(0, batteryCost - totalDirectGrants);
  let irpfDeduction = 0;
  let irpfCalculation = '';

  if (category === 'residential') {
    const irpfBase = Math.min(remainingCost, IRPF_DEDUCTION_2026.maxBase);
    irpfDeduction = Math.round(irpfBase * IRPF_DEDUCTION_2026.rate);
    irpfCalculation = `${(IRPF_DEDUCTION_2026.rate * 100).toFixed(0)}% de ${irpfBase.toLocaleString('es-ES')} EUR = ${irpfDeduction.toLocaleString('es-ES')} EUR`;
  }

  const totalIncentives = Math.round(totalDirectGrants + irpfDeduction);
  const netCost = Math.max(0, Math.round(batteryCost - totalIncentives));
  const savingsPercentage = Math.round((totalIncentives / batteryCost) * 100);

  return {
    grants: grantResults,
    totalDirectGrants: Math.round(totalDirectGrants),
    irpfDeduction,
    irpfCalculation,
    totalIncentives,
    netCost,
    savingsPercentage,
  };
}

/**
 * Generate waterfall data for visualization
 */
export interface WaterfallStep {
  label: string;
  value: number;
  type: 'start' | 'subtract' | 'end';
  runningTotal: number;
  color: string;
  sublabel?: string;
}

export function generateWaterfallSteps(
  batteryCost: number,
  batteryKwh: number,
  island: string,
  category: GrantCategory = 'residential'
): WaterfallStep[] {
  const result = calculateStackedBatteryGrants(batteryCost, batteryKwh, island, category);
  const steps: WaterfallStep[] = [];
  let runningTotal = batteryCost;

  // Starting point
  steps.push({
    label: 'Coste Bateria',
    value: batteryCost,
    type: 'start',
    runningTotal: batteryCost,
    color: '#374151', // Gray
    sublabel: `${batteryKwh} kWh`,
  });

  // Direct grants
  for (const grant of result.grants) {
    if (grant.amount > 0) {
      runningTotal -= grant.amount;
      steps.push({
        label: grant.program.name,
        value: -grant.amount,
        type: 'subtract',
        runningTotal,
        color: '#16a34a', // Green
        sublabel: grant.program.organization,
      });
    }
  }

  // IRPF
  if (result.irpfDeduction > 0) {
    runningTotal -= result.irpfDeduction;
    steps.push({
      label: 'Deduccion IRPF 40%',
      value: -result.irpfDeduction,
      type: 'subtract',
      runningTotal,
      color: '#2563eb', // Blue
      sublabel: 'Declaracion renta',
    });
  }

  // Final cost
  steps.push({
    label: 'Coste Final',
    value: result.netCost,
    type: 'end',
    runningTotal: result.netCost,
    color: '#a7e26e', // Aureon green
    sublabel: `${result.savingsPercentage}% ahorro`,
  });

  return steps;
}
