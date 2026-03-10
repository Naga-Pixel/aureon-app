/**
 * Assessment Scorer Logic Tests
 *
 * Run with: npx jest src/lib/services/__tests__/assessment-scorer.test.ts
 *
 * These tests validate the calculation sequence with real-world examples
 * that can be manually verified with a calculator.
 */

import { calculateAssessment, AssessmentInput } from '../assessment-scorer';

describe('Assessment Scorer - Calculation Logic', () => {

  /**
   * TEST CASE 1: Hotel in Canary Islands
   *
   * Input:
   * - Roof area: 500 m² (building 1500m² / 3 floors)
   * - Usable: 60% = 300 m²
   * - Panels: 300 / 2 = 150 panels
   * - System: 150 * 400W = 60 kW
   * - PVGIS: 1700 kWh/kWp (Canary Islands)
   * - Price: €0.20/kWh
   *
   * Expected calculations:
   * - Annual production: 60 kW * 1700 = 102,000 kWh
   * - Annual savings: 102,000 * €0.20 = €20,400
   * - Installation cost: 60 * €1,200 = €72,000
   * - Payback: ~3.5 years (with degradation)
   */
  test('Hotel in Canary Islands - 60kW system', () => {
    const input: AssessmentInput = {
      roofAreaM2: 1500, // Building area (3 floors)
      maxArrayAreaM2: 300, // 500m² roof * 60% usable
      panelsCount: null,
      roofSegmentCount: 1,
      maxSunshineHoursPerYear: null,
      kwhPerKwp: 1700, // Canary Islands PVGIS
      numberOfFloors: 3,
      businessSegment: 'hotel',
      electricityPriceEur: 0.20,
      isManualFallback: false,
    };

    const result = calculateAssessment(input);

    // System size: 300m² / 2 = 150 panels * 400W = 60kW
    expect(result.systemSizeKw).toBe(60);

    // Annual production: 60kW * 1700 kWh/kWp = 102,000 kWh
    expect(result.annualProductionKwh).toBe(102000);

    // Annual savings: 102,000 * €0.20 = €20,400
    expect(result.annualSavingsEur).toBe(20400);

    // Payback should be around 3.5 years
    expect(result.paybackYears).toBeGreaterThan(3);
    expect(result.paybackYears).toBeLessThan(4);

    // Score should be excellent (>80) for this ideal case
    expect(result.totalScore).toBeGreaterThanOrEqual(80);

    console.log('\n📊 TEST 1: Hotel Canary Islands');
    console.log('─'.repeat(50));
    console.log(`System Size:        ${result.systemSizeKw} kW`);
    console.log(`Annual Production:  ${result.annualProductionKwh.toLocaleString()} kWh`);
    console.log(`Annual Savings:     €${result.annualSavingsEur.toLocaleString()}`);
    console.log(`Payback:            ${result.paybackYears} years`);
    console.log(`Lifetime Savings:   €${result.lifetimeSavingsEur.toLocaleString()}`);
    console.log(`Total Score:        ${result.totalScore}/100`);
    console.log('─'.repeat(50));
  });

  /**
   * TEST CASE 2: Small office in Madrid
   *
   * Input:
   * - Roof area: 100 m² (building 200m² / 2 floors)
   * - Usable: 60% = 60 m²
   * - Panels: 60 / 2 = 30 panels
   * - System: 30 * 400W = 12 kW
   * - PVGIS: 1400 kWh/kWp (Central Spain)
   * - Price: €0.18/kWh
   */
  test('Small office in Madrid - 12kW system', () => {
    const input: AssessmentInput = {
      roofAreaM2: 200, // Building area (2 floors)
      maxArrayAreaM2: 60, // 100m² roof * 60% usable
      panelsCount: null,
      roofSegmentCount: 2,
      maxSunshineHoursPerYear: null,
      kwhPerKwp: 1400, // Central Spain
      numberOfFloors: 2,
      businessSegment: 'office',
      electricityPriceEur: 0.18,
      isManualFallback: false,
    };

    const result = calculateAssessment(input);

    // System size: 60m² / 2 = 30 panels * 400W = 12kW
    expect(result.systemSizeKw).toBe(12);

    // Annual production: 12kW * 1400 = 16,800 kWh
    expect(result.annualProductionKwh).toBe(16800);

    // Annual savings: 16,800 * €0.18 = €3,024
    expect(result.annualSavingsEur).toBe(3024);

    // Offices have lower segment fit (0.85x), score should be moderate
    expect(result.totalScore).toBeGreaterThan(50);
    expect(result.totalScore).toBeLessThan(80);

    console.log('\n📊 TEST 2: Office Madrid');
    console.log('─'.repeat(50));
    console.log(`System Size:        ${result.systemSizeKw} kW`);
    console.log(`Annual Production:  ${result.annualProductionKwh.toLocaleString()} kWh`);
    console.log(`Annual Savings:     €${result.annualSavingsEur.toLocaleString()}`);
    console.log(`Payback:            ${result.paybackYears} years`);
    console.log(`Total Score:        ${result.totalScore}/100`);
    console.log('─'.repeat(50));
  });

  /**
   * TEST CASE 3: Large warehouse (ideal case)
   *
   * Input:
   * - Roof area: 2000 m² (single floor)
   * - Usable: 70% = 1400 m²
   * - Panels: 1400 / 2 = 700 panels
   * - System: 700 * 400W = 280 kW
   * - PVGIS: 1600 kWh/kWp (South Spain)
   */
  test('Large warehouse in Andalucia - 280kW system', () => {
    const input: AssessmentInput = {
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

    const result = calculateAssessment(input);

    // System size: 1400m² / 2 = 700 panels * 400W = 280kW
    expect(result.systemSizeKw).toBe(280);

    // Annual production: 280kW * 1600 = 448,000 kWh
    expect(result.annualProductionKwh).toBe(448000);

    // Annual savings: 448,000 * €0.22 = €98,560
    expect(result.annualSavingsEur).toBe(98560);

    // Warehouses have best segment fit (1.2x), should score very high
    expect(result.totalScore).toBeGreaterThanOrEqual(85);

    console.log('\n📊 TEST 3: Warehouse Andalucia');
    console.log('─'.repeat(50));
    console.log(`System Size:        ${result.systemSizeKw} kW`);
    console.log(`Annual Production:  ${result.annualProductionKwh.toLocaleString()} kWh`);
    console.log(`Annual Savings:     €${result.annualSavingsEur.toLocaleString()}`);
    console.log(`Payback:            ${result.paybackYears} years`);
    console.log(`Lifetime Savings:   €${result.lifetimeSavingsEur.toLocaleString()}`);
    console.log(`Total Score:        ${result.totalScore}/100`);
    console.log('─'.repeat(50));
  });

  /**
   * TEST: Panel degradation over 25 years
   *
   * Year 1: 100%
   * Year 2: 99.5%
   * Year 25: ~88.6%
   *
   * Lifetime production should be ~22.5x annual (not 25x)
   */
  test('Degradation calculation is correct', () => {
    const input: AssessmentInput = {
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

    const result = calculateAssessment(input);

    // 50 panels * 400W = 20kW
    // Annual: 20kW * 1500 = 30,000 kWh
    const annualYear1 = result.annualProductionKwh;
    expect(annualYear1).toBe(30000);

    // With 0.5%/year degradation over 25 years:
    // Lifetime should be approximately 22.5x annual (not 25x)
    const lifetimeRatio = result.lifetimeProductionKwh / annualYear1;
    expect(lifetimeRatio).toBeGreaterThan(22);
    expect(lifetimeRatio).toBeLessThan(23);

    console.log('\n📊 TEST: Degradation');
    console.log('─'.repeat(50));
    console.log(`Annual Year 1:      ${annualYear1.toLocaleString()} kWh`);
    console.log(`Lifetime (25 yrs):  ${result.lifetimeProductionKwh.toLocaleString()} kWh`);
    console.log(`Ratio:              ${lifetimeRatio.toFixed(2)}x (expected ~22.5x)`);
    console.log('─'.repeat(50));
  });

  /**
   * TEST: Score breakdown adds up correctly
   */
  test('Score components sum to total', () => {
    const input: AssessmentInput = {
      roofAreaM2: 500,
      maxArrayAreaM2: 300,
      panelsCount: null,
      roofSegmentCount: 1,
      maxSunshineHoursPerYear: null,
      kwhPerKwp: 1600,
      numberOfFloors: 1,
      businessSegment: 'hotel',
      electricityPriceEur: 0.20,
      isManualFallback: false,
    };

    const result = calculateAssessment(input);

    const componentSum =
      result.solarPotentialScore +
      result.economicPotentialScore +
      result.executionSimplicityScore +
      result.segmentFitScore;

    expect(result.totalScore).toBe(componentSum);

    // Verify max weights
    expect(result.solarPotentialScore).toBeLessThanOrEqual(40);
    expect(result.economicPotentialScore).toBeLessThanOrEqual(30);
    expect(result.executionSimplicityScore).toBeLessThanOrEqual(15);
    expect(result.segmentFitScore).toBeLessThanOrEqual(15);

    console.log('\n📊 TEST: Score Breakdown');
    console.log('─'.repeat(50));
    console.log(`Solar Potential:    ${result.solarPotentialScore}/40`);
    console.log(`Economic:           ${result.economicPotentialScore}/30`);
    console.log(`Execution:          ${result.executionSimplicityScore}/15`);
    console.log(`Segment Fit:        ${result.segmentFitScore}/15`);
    console.log(`─`.repeat(30));
    console.log(`TOTAL:              ${result.totalScore}/100`);
    console.log('─'.repeat(50));
  });

  /**
   * TEST: Edge case - Manual fallback penalty
   */
  test('Manual fallback reduces execution score', () => {
    const baseInput: AssessmentInput = {
      roofAreaM2: 500,
      maxArrayAreaM2: 300,
      panelsCount: null,
      roofSegmentCount: 1,
      maxSunshineHoursPerYear: null,
      kwhPerKwp: 1600,
      numberOfFloors: 1,
      businessSegment: 'hotel',
      electricityPriceEur: 0.20,
      isManualFallback: false,
    };

    const manualInput = { ...baseInput, isManualFallback: true };

    const baseResult = calculateAssessment(baseInput);
    const manualResult = calculateAssessment(manualInput);

    // Manual fallback should reduce execution score by 3 points
    expect(baseResult.executionSimplicityScore - manualResult.executionSimplicityScore).toBe(3);

    console.log('\n📊 TEST: Manual Fallback Penalty');
    console.log('─'.repeat(50));
    console.log(`API Execution Score:    ${baseResult.executionSimplicityScore}/15`);
    console.log(`Manual Execution Score: ${manualResult.executionSimplicityScore}/15`);
    console.log(`Penalty:                -3 points`);
    console.log('─'.repeat(50));
  });
});

/**
 * CALCULATION SEQUENCE VERIFICATION
 *
 * This documents the exact order of calculations:
 *
 * 1. ROOF AREA
 *    actualRoofArea = buildingAreaM2 / numberOfFloors
 *
 * 2. USABLE AREA
 *    usableArea = maxArrayAreaM2 ?? (actualRoofArea * 0.6)
 *
 * 3. PANEL COUNT
 *    panelCount = floor(usableArea / 2)  // ~2m² per panel
 *
 * 4. SYSTEM SIZE
 *    systemSizeKw = (panelCount * 400) / 1000
 *
 * 5. ANNUAL PRODUCTION
 *    annualProductionKwh = systemSizeKw * kwhPerKwp
 *
 * 6. ANNUAL SAVINGS
 *    annualSavingsEur = annualProductionKwh * electricityPriceEur
 *
 * 7. INSTALLATION COST
 *    installationCost = systemSizeKw * 1200
 *
 * 8. LIFETIME PRODUCTION (with degradation)
 *    r = 0.995 (1 - 0.5% degradation)
 *    lifetimeProduction = annualProduction * (1 - r^25) / 0.005
 *
 * 9. PAYBACK PERIOD
 *    Iterative: find year where cumulative savings >= installation cost
 *
 * 10. SCORES
 *     solarPotential = sizeFactor(0-20) + qualityFactor(0-20)
 *     economic = savingsFactor(0-20) + efficiencyFactor(0-10)
 *     execution = 15 - segmentPenalty - manualPenalty
 *     segmentFit = multiplier * 12.5 (capped at 15)
 */
