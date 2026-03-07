import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { batteryAssessmentInputSchema } from '@/lib/validations/battery-assessment';
import { geocodeAddress } from '@/lib/services/google-geocoding';
import { getCatastroData } from '@/lib/services/catastro';
import { estimateConsumption, ConsumptionInput } from '@/lib/services/consumption-estimator';
import { calculateBatteryScore, detectIsland } from '@/lib/services/battery-scorer';
import { getCurrentAveragePrice } from '@/lib/services/esios';
import { calculateIncentiveWaterfall, generateConfidenceSection } from '@/lib/services/incentives';
import { BACKUP_PRIORITIES, BATTERY_CONFIG } from '@/lib/config/battery-config';
import { BatteryAssessmentInsert } from '@/lib/supabase/types';
import type { WaterfallResult } from '@/lib/types/incentives';

// Extract postal code from formatted address (Spanish format)
function extractPostalCode(address: string): string | null {
  // Match 5-digit postal code (Spanish format: 35XXX or 38XXX for Canaries)
  const match = address.match(/\b(35\d{3}|38\d{3})\b/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = batteryAssessmentInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      address,
      postalCode: inputPostalCode,
      propertyType,
      projectType,
      numberOfUnits,
      leadId,
      monthlyBillEur,
      annualIBI,
      propertyAreaM2,
      numberOfFloors,
      occupants,
      hasAC,
      hasPool,
      hasSolar,
      solarSystemKw,
      hasExistingBattery,
      backupPriority,
      hasCEE,
    } = validationResult.data;

    // Get Supabase client and check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verify user is an admin
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id, role')
      .eq('user_id', user.id)
      .single();

    if (!installer || installer.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo los administradores pueden ejecutar evaluaciones' },
        { status: 403 }
      );
    }

    // Step 1: Geocode the address
    let geocodeResult;
    try {
      geocodeResult = await geocodeAddress(address);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Error de geocodificación' },
        { status: 400 }
      );
    }

    // Step 2: Detect island from address
    let island = detectIsland(geocodeResult.formattedAddress);
    if (!island) {
      island = detectIsland(address);
    }

    if (!island) {
      return NextResponse.json(
        { error: 'No se pudo detectar la isla. Asegúrate de incluir el nombre de la isla en la dirección.' },
        { status: 400 }
      );
    }

    // Step 3: Get property data from Catastro (reusing existing service)
    let catastroData = null;
    let effectivePropertyArea = propertyAreaM2;
    let effectiveFloors = numberOfFloors;
    let yearBuilt: number | null = null;
    let cadastralReference: string | null = null;

    try {
      catastroData = await getCatastroData(geocodeResult.latitude, geocodeResult.longitude);

      if (catastroData.status === 'success') {
        // Use Catastro data if available and user didn't provide
        if (!effectivePropertyArea && catastroData.buildingAreaM2) {
          effectivePropertyArea = catastroData.buildingAreaM2;
        }
        if (catastroData.numberOfFloors) {
          effectiveFloors = catastroData.numberOfFloors;
        }
        yearBuilt = catastroData.yearBuilt ?? null;
        cadastralReference = catastroData.cadastralReference ?? null;
      }
    } catch (error) {
      console.error('Catastro lookup failed:', error);
      // Continue without Catastro data
    }

    // Ensure we have property area (required for consumption estimation)
    if (!effectivePropertyArea) {
      return NextResponse.json(
        { error: 'Se requiere la superficie de la propiedad (no se encontró en Catastro)' },
        { status: 400 }
      );
    }

    // Determine if new build
    const currentYear = new Date().getFullYear();
    const isNewBuild = propertyType === 'residential_new' ||
      (yearBuilt !== null && currentYear - yearBuilt <= 5);

    // Step 4: Estimate consumption
    const consumptionInput: ConsumptionInput = {
      propertyAreaM2: effectivePropertyArea,
      propertyType,
      numberOfFloors: effectiveFloors,
      hasPool,
      hasAC,
      occupants,
      island,
      monthlyBillEur: monthlyBillEur ?? undefined,
    };

    const consumption = estimateConsumption(consumptionInput);

    // Step 5: Get backup hours from priority
    const backupConfig = BACKUP_PRIORITIES.find(p => p.value === backupPriority);
    const backupHours = backupConfig?.hours ?? 4;

    // Step 6: Get current electricity price from ESIOS (falls back to €0.20 if no API key)
    const electricityPriceEur = await getCurrentAveragePrice();

    // Step 7: Calculate battery score
    const scoreResult = calculateBatteryScore({
      island,
      consumption,
      backupHours,
      hasSolar,
      hasExistingBattery,
      isNewBuild,
      propertyType,
      electricityPriceEur,
    });

    // Step 8: Calculate incentive waterfall
    // Extract or use provided postal code
    const postalCode = inputPostalCode ||
      extractPostalCode(geocodeResult.formattedAddress) ||
      extractPostalCode(address) ||
      (island === 'gran canaria' ? '35001' : '38001'); // Default fallback

    // Estimate hardware costs for incentive calculation
    const solarKwp = hasSolar ? (solarSystemKw || 5) : 0;
    const batteryKwh = scoreResult.batterySizing.recommendedKwh;
    const hardwareCost = batteryKwh * BATTERY_CONFIG.COST_PER_KWH;
    const installationCost = BATTERY_CONFIG.INSTALLATION_BASE_COST;

    let incentiveWaterfall: WaterfallResult | null = null;
    try {
      incentiveWaterfall = await calculateIncentiveWaterfall({
        solarKwp,
        batteryKwh,
        hardwareCost,
        installationCost,
        postalCode,
        projectType,
        numberOfUnits,
        annualIBI: annualIBI ?? 500, // Default IBI estimate
        hasCEE,
      });
    } catch (error) {
      console.error('Incentive calculation failed:', error);
      // Continue without incentive data
    }

    // Generate confidence breakdown for report
    const confidenceSection = incentiveWaterfall
      ? generateConfidenceSection(incentiveWaterfall)
      : null;

    // Calculate effective payback with incentives
    const effectivePaybackYears = incentiveWaterfall && scoreResult.annualSavingsEur > 0
      ? incentiveWaterfall.effectiveNetCost / scoreResult.annualSavingsEur
      : scoreResult.paybackYears;

    // Step 9: Save to database
    // Use incentive-adjusted values if available
    const effectiveCost = incentiveWaterfall?.effectiveNetCost ?? scoreResult.batterySizing.estimatedCostEur;
    const adjustedPayback = effectivePaybackYears ?? scoreResult.paybackYears;

    // Calculate incentive-adjusted 10-year ROI
    let adjustedRoi10Years = scoreResult.roi10Years;
    if (incentiveWaterfall && scoreResult.annualSavingsEur > 0) {
      const totalSavings10Years = scoreResult.annualSavingsEur * 10 * 0.85; // Account for degradation
      adjustedRoi10Years = Math.round(
        ((totalSavings10Years - incentiveWaterfall.effectiveNetCost) / incentiveWaterfall.effectiveNetCost) * 100
      );
    }

    const assessmentData: BatteryAssessmentInsert = {
      lead_id: leadId ?? null,
      address_input: address,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
      formatted_address: geocodeResult.formattedAddress,
      island,
      property_type: propertyType,
      property_area_m2: effectivePropertyArea,
      number_of_floors: effectiveFloors,
      year_built: yearBuilt,
      is_new_build: isNewBuild,
      cadastral_reference: cadastralReference,
      has_solar: hasSolar,
      solar_system_kw: solarSystemKw ?? null,
      has_existing_battery: hasExistingBattery,
      monthly_bill_eur: monthlyBillEur ?? null,
      annual_consumption_kwh: consumption.annualKwh,
      daily_consumption_kwh: consumption.dailyKwh,
      peak_daily_kwh: consumption.peakDailyKwh,
      occupants,
      has_ac: hasAC ?? null,
      has_pool: hasPool,
      consumption_confidence: consumption.confidence,
      backup_hours: backupHours,
      recommended_battery_kwh: scoreResult.batterySizing.recommendedKwh,
      minimum_battery_kwh: scoreResult.batterySizing.minimumKwh,
      optimal_battery_kwh: scoreResult.batterySizing.optimalKwh,
      // Use gross cost before incentives for the base estimate
      estimated_cost_eur: incentiveWaterfall?.baseCost.grossCost ?? scoreResult.batterySizing.estimatedCostEur,
      total_score: scoreResult.totalScore,
      grid_vulnerability_score: scoreResult.gridVulnerabilityScore,
      consumption_score: scoreResult.consumptionScore,
      arbitrage_score: scoreResult.arbitrageScore,
      solar_synergy_score: scoreResult.solarSynergyScore,
      installation_score: scoreResult.installationScore,
      annual_savings_eur: scoreResult.annualSavingsEur,
      // Use incentive-adjusted payback
      payback_years: adjustedPayback !== null ? Math.round(adjustedPayback * 10) / 10 : null,
      roi_10_years: adjustedRoi10Years,
      recommendation: scoreResult.recommendation,
      recommendation_text: scoreResult.recommendationText,
      assessed_by: installer.id,
      raw_api_response: {
        catastro: catastroData,
        consumption,
        electricityPriceEur,
        postalCode,
        projectType,
        numberOfUnits,
        hasCEE,
        incentives: incentiveWaterfall ? {
          grossCost: incentiveWaterfall.baseCost.grossCost,
          igicSavings: incentiveWaterfall.baseCost.taxSavingsVsMainland,
          grantEstimate: incentiveWaterfall.grants.totalEstimate,
          grantConfidence: incentiveWaterfall.grants.confidence,
          irpfDeduction: incentiveWaterfall.irpf.totalDeduction,
          irpfEligible: incentiveWaterfall.irpf.eligible,
          ibiSavings: incentiveWaterfall.municipalSavings.ibiSavingsTotal,
          icioSavings: incentiveWaterfall.municipalSavings.icioSavings,
          municipalSource: incentiveWaterfall.municipal.dataSource,
          totalIncentives: incentiveWaterfall.totalIncentives,
          effectiveNetCost: incentiveWaterfall.effectiveNetCost,
          incentivePercentage: incentiveWaterfall.incentivePercentage,
          costPerUnit: incentiveWaterfall.costPerUnit,
        } : null,
        confidence: confidenceSection,
      },
    };

    const { data: savedAssessment, error: insertError } = await (supabase as any)
      .from('battery_assessments')
      .insert(assessmentData)
      .select()
      .single();

    if (insertError) {
      console.error('Error saving battery assessment:', insertError);
      return NextResponse.json(
        { error: 'Error al guardar la evaluación' },
        { status: 500 }
      );
    }

    // Build response with incentive summary
    const response = {
      success: true,
      data: savedAssessment,
      incentives: incentiveWaterfall ? {
        grossCost: incentiveWaterfall.baseCost.grossCost,
        totalIncentives: incentiveWaterfall.totalIncentives,
        effectiveNetCost: incentiveWaterfall.effectiveNetCost,
        incentivePercentage: incentiveWaterfall.incentivePercentage,
        breakdown: {
          igicSavings: incentiveWaterfall.baseCost.taxSavingsVsMainland,
          grantEstimate: incentiveWaterfall.grants.totalEstimate,
          irpfDeduction: incentiveWaterfall.irpf.totalDeduction,
          ibiSavings: incentiveWaterfall.municipalSavings.ibiSavingsTotal,
          icioSavings: incentiveWaterfall.municipalSavings.icioSavings,
        },
        paybackWithIncentives: adjustedPayback,
        roiWithIncentives: adjustedRoi10Years,
        confidence: incentiveWaterfall.confidence,
        warnings: confidenceSection?.warnings || [],
      } : null,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Battery assessment error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
