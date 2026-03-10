/**
 * Assessment Calculation Validator
 *
 * Run with: npx tsx scripts/validate-calculations.ts
 *
 * This validates the calculation logic with real-world examples
 * that can be manually verified with a calculator.
 */

import { calculateAssessment, AssessmentInput } from '../src/lib/services/assessment-scorer';

console.log('\n' + '═'.repeat(60));
console.log('  AUREON SOLAR ASSESSMENT - CALCULATION VALIDATOR');
console.log('═'.repeat(60) + '\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

function assertRange(value: number, min: number, max: number, message: string) {
  const inRange = value >= min && value <= max;
  if (inRange) {
    console.log(`  ✅ ${message}: ${value} (expected ${min}-${max})`);
    passed++;
  } else {
    console.log(`  ❌ ${message}: ${value} (expected ${min}-${max})`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 1: Hotel in Canary Islands
// ─────────────────────────────────────────────────────────────
console.log('📊 TEST 1: Hotel in Canary Islands (60kW system)');
console.log('─'.repeat(60));
console.log('  Input:');
console.log('    Building area: 1500 m² (3 floors)');
console.log('    Roof area: 500 m²');
console.log('    Usable area: 300 m² (60%)');
console.log('    PVGIS: 1700 kWh/kWp');
console.log('    Price: €0.20/kWh\n');

const test1: AssessmentInput = {
  roofAreaM2: 1500,
  maxArrayAreaM2: 300,
  panelsCount: null,
  roofSegmentCount: 1,
  maxSunshineHoursPerYear: null,
  kwhPerKwp: 1700,
  numberOfFloors: 3,
  businessSegment: 'hotel',
  electricityPriceEur: 0.20,
  isManualFallback: false,
};

const result1 = calculateAssessment(test1);

console.log('  Expected calculations:');
console.log('    Panels: 300m² / 2 = 150');
console.log('    System: 150 × 400W = 60kW');
console.log('    Production: 60kW × 1700 = 102,000 kWh');
console.log('    Savings: 102,000 × €0.20 = €20,400\n');

console.log('  Results:');
assert(result1.systemSizeKw === 60, `System size: ${result1.systemSizeKw} kW (expected 60)`);
assert(result1.annualProductionKwh === 102000, `Production: ${result1.annualProductionKwh} kWh (expected 102,000)`);
assert(result1.annualSavingsEur === 20400, `Savings: €${result1.annualSavingsEur} (expected €20,400)`);
assertRange(result1.paybackYears!, 3, 4, 'Payback');
assertRange(result1.totalScore, 80, 100, 'Score (excellent)');

console.log(`\n  Summary: ${result1.systemSizeKw}kW → ${result1.annualProductionKwh.toLocaleString()} kWh → €${result1.annualSavingsEur.toLocaleString()}/year\n`);

// ─────────────────────────────────────────────────────────────
// TEST 2: Small Office in Madrid
// ─────────────────────────────────────────────────────────────
console.log('📊 TEST 2: Small Office in Madrid (12kW system)');
console.log('─'.repeat(60));
console.log('  Input:');
console.log('    Building area: 200 m² (2 floors)');
console.log('    Roof area: 100 m²');
console.log('    Usable area: 60 m² (60%)');
console.log('    PVGIS: 1400 kWh/kWp');
console.log('    Price: €0.18/kWh\n');

const test2: AssessmentInput = {
  roofAreaM2: 200,
  maxArrayAreaM2: 60,
  panelsCount: null,
  roofSegmentCount: 2,
  maxSunshineHoursPerYear: null,
  kwhPerKwp: 1400,
  numberOfFloors: 2,
  businessSegment: 'office',
  electricityPriceEur: 0.18,
  isManualFallback: false,
};

const result2 = calculateAssessment(test2);

console.log('  Expected calculations:');
console.log('    Panels: 60m² / 2 = 30');
console.log('    System: 30 × 400W = 12kW');
console.log('    Production: 12kW × 1400 = 16,800 kWh');
console.log('    Savings: 16,800 × €0.18 = €3,024\n');

console.log('  Results:');
assert(result2.systemSizeKw === 12, `System size: ${result2.systemSizeKw} kW (expected 12)`);
assert(result2.annualProductionKwh === 16800, `Production: ${result2.annualProductionKwh} kWh (expected 16,800)`);
assert(result2.annualSavingsEur === 3024, `Savings: €${result2.annualSavingsEur} (expected €3,024)`);
assertRange(result2.totalScore, 50, 80, 'Score (good/moderate)');

console.log(`\n  Summary: ${result2.systemSizeKw}kW → ${result2.annualProductionKwh.toLocaleString()} kWh → €${result2.annualSavingsEur.toLocaleString()}/year\n`);

// ─────────────────────────────────────────────────────────────
// TEST 3: Large Warehouse
// ─────────────────────────────────────────────────────────────
console.log('📊 TEST 3: Large Warehouse in Andalucia (280kW system)');
console.log('─'.repeat(60));
console.log('  Input:');
console.log('    Roof area: 2000 m² (1 floor)');
console.log('    Usable area: 1400 m² (70%)');
console.log('    PVGIS: 1600 kWh/kWp');
console.log('    Price: €0.22/kWh\n');

const test3: AssessmentInput = {
  roofAreaM2: 2000,
  maxArrayAreaM2: 1400,
  panelsCount: null,
  roofSegmentCount: 1,
  maxSunshineHoursPerYear: null,
  kwhPerKwp: 1600,
  numberOfFloors: 1,
  businessSegment: 'warehouse',
  electricityPriceEur: 0.22,
  isManualFallback: false,
};

const result3 = calculateAssessment(test3);

console.log('  Expected calculations:');
console.log('    Panels: 1400m² / 2 = 700');
console.log('    System: 700 × 400W = 280kW');
console.log('    Production: 280kW × 1600 = 448,000 kWh');
console.log('    Savings: 448,000 × €0.22 = €98,560\n');

console.log('  Results:');
assert(result3.systemSizeKw === 280, `System size: ${result3.systemSizeKw} kW (expected 280)`);
assert(result3.annualProductionKwh === 448000, `Production: ${result3.annualProductionKwh} kWh (expected 448,000)`);
assert(result3.annualSavingsEur === 98560, `Savings: €${result3.annualSavingsEur} (expected €98,560)`);
assertRange(result3.totalScore, 85, 100, 'Score (excellent - warehouse bonus)');

console.log(`\n  Summary: ${result3.systemSizeKw}kW → ${result3.annualProductionKwh.toLocaleString()} kWh → €${result3.annualSavingsEur.toLocaleString()}/year\n`);

// ─────────────────────────────────────────────────────────────
// TEST 4: Degradation Calculation
// ─────────────────────────────────────────────────────────────
console.log('📊 TEST 4: Panel Degradation (25-year calculation)');
console.log('─'.repeat(60));
console.log('  Formula: 0.5%/year degradation');
console.log('  Year 1: 100%, Year 25: ~88.6%');
console.log('  Lifetime ratio should be ~22.5x annual (not 25x)\n');

const test4: AssessmentInput = {
  roofAreaM2: 200,
  maxArrayAreaM2: 100,
  panelsCount: null,
  roofSegmentCount: 1,
  maxSunshineHoursPerYear: null,
  kwhPerKwp: 1500,
  numberOfFloors: 1,
  businessSegment: 'industrial',
  electricityPriceEur: 0.20,
  isManualFallback: false,
};

const result4 = calculateAssessment(test4);
const lifetimeRatio = result4.lifetimeProductionKwh / result4.annualProductionKwh;

console.log('  Results:');
console.log(`    Annual Year 1:    ${result4.annualProductionKwh.toLocaleString()} kWh`);
console.log(`    Lifetime (25y):   ${result4.lifetimeProductionKwh.toLocaleString()} kWh`);
assertRange(lifetimeRatio, 22, 23, `Lifetime ratio: ${lifetimeRatio.toFixed(2)}x`);
console.log('');

// ─────────────────────────────────────────────────────────────
// TEST 5: Score Components
// ─────────────────────────────────────────────────────────────
console.log('📊 TEST 5: Score Components Add Up Correctly');
console.log('─'.repeat(60));

const componentSum =
  result1.solarPotentialScore +
  result1.economicPotentialScore +
  result1.executionSimplicityScore +
  result1.segmentFitScore;

console.log('  Score breakdown (Test 1 - Hotel):');
console.log(`    Solar Potential:    ${result1.solarPotentialScore}/40`);
console.log(`    Economic:           ${result1.economicPotentialScore}/30`);
console.log(`    Execution:          ${result1.executionSimplicityScore}/15`);
console.log(`    Segment Fit:        ${result1.segmentFitScore}/15`);
console.log(`    ─────────────────────────`);
console.log(`    TOTAL:              ${result1.totalScore}/100\n`);

assert(result1.totalScore === componentSum, `Components sum to total: ${componentSum} = ${result1.totalScore}`);
assert(result1.solarPotentialScore <= 40, `Solar score ≤ 40: ${result1.solarPotentialScore}`);
assert(result1.economicPotentialScore <= 30, `Economic score ≤ 30: ${result1.economicPotentialScore}`);
assert(result1.executionSimplicityScore <= 15, `Execution score ≤ 15: ${result1.executionSimplicityScore}`);
assert(result1.segmentFitScore <= 15, `Segment score ≤ 15: ${result1.segmentFitScore}`);
console.log('');

// ─────────────────────────────────────────────────────────────
// TEST 6: Manual Fallback Penalty
// ─────────────────────────────────────────────────────────────
console.log('📊 TEST 6: Manual Fallback Reduces Score');
console.log('─'.repeat(60));

const apiResult = calculateAssessment({ ...test1, isManualFallback: false });
const manualResult = calculateAssessment({ ...test1, isManualFallback: true });
const penalty = apiResult.executionSimplicityScore - manualResult.executionSimplicityScore;

console.log(`    API execution score:    ${apiResult.executionSimplicityScore}/15`);
console.log(`    Manual execution score: ${manualResult.executionSimplicityScore}/15`);
assert(penalty === 3, `Penalty is 3 points: ${penalty}`);
console.log('');

// ─────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\n  ⚠️  Some calculations may need review!\n');
  process.exit(1);
} else {
  console.log('\n  ✅ All calculations verified!\n');
}

// ─────────────────────────────────────────────────────────────
// CALCULATION SEQUENCE DOCUMENTATION
// ─────────────────────────────────────────────────────────────
console.log('\n📋 CALCULATION SEQUENCE:');
console.log('─'.repeat(60));
console.log(`
  1. ROOF AREA
     actualRoofArea = buildingAreaM2 / numberOfFloors

  2. USABLE AREA
     usableArea = maxArrayAreaM2 ?? (actualRoofArea × 0.6)

  3. PANEL COUNT
     panelCount = floor(usableArea / 2)  // ~2m² per panel

  4. SYSTEM SIZE
     systemSizeKw = (panelCount × 400W) / 1000

  5. ANNUAL PRODUCTION
     annualProductionKwh = systemSizeKw × kwhPerKwp

  6. ANNUAL SAVINGS
     annualSavingsEur = annualProductionKwh × electricityPrice

  7. INSTALLATION COST
     installationCost = systemSizeKw × €1,200

  8. LIFETIME PRODUCTION (with degradation)
     r = 0.995 (1 - 0.5% degradation)
     lifetime = annual × (1 - r²⁵) / 0.005

  9. PAYBACK PERIOD
     Find year where cumulative savings ≥ installation cost

  10. SCORES
      solar     = sizeFactor(0-20) + qualityFactor(0-20)
      economic  = savingsFactor(0-20) + efficiencyFactor(0-10)
      execution = 15 - segmentPenalty - manualPenalty
      segment   = multiplier × 12.5 (capped at 15)
`);
