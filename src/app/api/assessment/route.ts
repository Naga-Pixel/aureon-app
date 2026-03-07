import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assessmentInputSchema, manualFallbackSchema } from '@/lib/validations/assessment';
import { geocodeAddress } from '@/lib/services/google-geocoding';
import { getSolarData } from '@/lib/services/google-solar';
import { getCatastroData, getBuildingDataFromReference } from '@/lib/services/catastro';
import { getBuildingFootprint, getBuildingFootprintByCoordinates } from '@/lib/services/catastro-inspire';
import { getPVGISData, PVGISResult } from '@/lib/services/pvgis';
import { getElectricityPriceByCountry, getDefaultPrice, Country } from '@/lib/services/electricity-price';
import { calculateAssessment } from '@/lib/services/assessment-scorer';
import { ASSESSMENT_CONFIG } from '@/lib/config/assessment-config';
import { SolarAssessmentInsert } from '@/lib/supabase/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if this is a manual fallback submission
    const isManualFallback = body.manualFallback === true;

    // Validate input
    const validationResult = assessmentInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { address, businessSegment, leadId, country, energyType, electricityPrice, numberOfFloors } = validationResult.data;

    // Determine electricity price based on energy type and country
    const selectedCountry = (country || 'ES') as Country;
    let finalElectricityPrice: number;
    let priceSource: string = 'fixed';

    if (energyType === 'variable') {
      const priceResult = await getElectricityPriceByCountry(selectedCountry);
      finalElectricityPrice = priceResult.averagePrice;
      priceSource = priceResult.source;
    } else {
      finalElectricityPrice = electricityPrice ?? getDefaultPrice(selectedCountry);
      priceSource = 'fixed';
    }

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

    // Step 2: Get PVGIS solar irradiation data (location-specific kWh/kWp)
    const pvgisData: PVGISResult = await getPVGISData(geocodeResult.latitude, geocodeResult.longitude);

    // Step 3: Get building data from APIs
    const googleSolarEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SOLAR === 'true';

    // Try Google Solar API first (if enabled)
    const solarData = googleSolarEnabled && !isManualFallback
      ? await getSolarData(geocodeResult.latitude, geocodeResult.longitude)
      : { status: 'failed' as const, roofAreaM2: null, maxArrayAreaM2: null, panelsCount: null, roofSegmentCount: null, maxSunshineHoursPerYear: null, rawResponse: null };

    let catastroData = null;
    let inspireData = null;
    let useCatastro = false;
    let useInspire = false;

    // If Google Solar disabled or failed, try Spanish Catastro API
    if (solarData.status === 'failed' && !isManualFallback) {
      // If Cartociudad returned a cadastral reference, use it directly
      if ('cadastralReference' in geocodeResult && geocodeResult.cadastralReference) {
        catastroData = await getBuildingDataFromReference(geocodeResult.cadastralReference as string);
        // Also try INSPIRE WFS for accurate roof footprint
        inspireData = await getBuildingFootprint(geocodeResult.cadastralReference as string);
      }

      // If no cadastral reference or lookup failed, try by coordinates
      if (!catastroData || catastroData.status !== 'success') {
        catastroData = await getCatastroData(geocodeResult.latitude, geocodeResult.longitude);
      }

      // Try INSPIRE WFS if we have cadastral reference from Catastro lookup
      if (!inspireData && catastroData?.cadastralReference) {
        inspireData = await getBuildingFootprint(catastroData.cadastralReference);
      }

      // If still no INSPIRE data, try by coordinates
      if (!inspireData || inspireData.status !== 'success') {
        inspireData = await getBuildingFootprintByCoordinates(
          geocodeResult.latitude,
          geocodeResult.longitude
        );
      }

      if (inspireData && inspireData.status === 'success' && inspireData.roofAreaM2) {
        useInspire = true;
      }

      if (catastroData.status === 'success' && catastroData.buildingAreaM2) {
        useCatastro = true;
      }

      // If neither INSPIRE nor Catastro have data, require manual fallback
      if (!useInspire && !useCatastro) {
        return NextResponse.json(
          {
            error: 'No se encontraron datos del edificio. Asegúrate de incluir el número del edificio en la dirección (ej: "Calle Ejemplo 40").',
            requiresManualFallback: true,
            geocodeResult,
          },
          { status: 422 }
        );
      }
    }

    // If manual fallback, validate the manual data
    let manualData = null;
    if (isManualFallback) {
      const manualValidation = manualFallbackSchema.safeParse(body);
      if (!manualValidation.success) {
        return NextResponse.json(
          { error: 'Datos manuales inválidos', details: manualValidation.error.flatten() },
          { status: 400 }
        );
      }
      manualData = manualValidation.data;
    }

    // Step 4: Calculate assessment scores
    let buildingAreaM2: number; // Total building area (all floors) from Catastro
    let actualRoofAreaM2: number | null = null; // Actual roof footprint from INSPIRE
    let roofSegmentCount: number;
    let effectiveFloors: number;
    let buildingOrientation: number | null = null;

    if (isManualFallback && manualData) {
      // Manual input: roofAreaM2 is already the roof area, not building area
      // Multiply by floors to convert to "building area" format for scorer
      buildingAreaM2 = manualData.roofAreaM2 * (manualData.numberOfFloors ?? 1);
      roofSegmentCount = manualData.roofSegmentCount;
      effectiveFloors = manualData.numberOfFloors ?? 1;
    } else if (useInspire && inspireData && inspireData.roofAreaM2) {
      // INSPIRE WFS gives us actual roof footprint area - this is the most accurate
      actualRoofAreaM2 = inspireData.roofAreaM2;
      buildingOrientation = inspireData.orientationDegrees;
      // Use Catastro for floor count if available
      effectiveFloors = catastroData?.numberOfFloors ?? numberOfFloors;
      // Convert roof area to "building area" format for scorer (multiply by floors)
      buildingAreaM2 = actualRoofAreaM2 * effectiveFloors;
      roofSegmentCount = 1;
    } else if (useCatastro && catastroData) {
      // Catastro returns total building area (all floors)
      // We need to divide by floors to get roof area in the scorer
      buildingAreaM2 = catastroData.buildingAreaM2!;
      roofSegmentCount = 1; // Assume single roof segment
      // Use Catastro floor count if available, otherwise fall back to user input
      effectiveFloors = catastroData.numberOfFloors ?? numberOfFloors;
    } else {
      // Google Solar API returns actual roof area
      buildingAreaM2 = solarData.roofAreaM2 ?? 500;
      roofSegmentCount = solarData.roofSegmentCount ?? 1;
      effectiveFloors = 1; // Google Solar already gives roof area
    }

    // Calculate usable roof area
    const roofArea = actualRoofAreaM2 ?? (buildingAreaM2 / effectiveFloors);
    const usableRoofArea = useInspire
      ? roofArea * 0.7  // INSPIRE gives accurate footprint, assume 70% usable
      : (useCatastro ? roofArea * 0.6 : solarData.maxArrayAreaM2);

    const assessmentInput = {
      roofAreaM2: buildingAreaM2,
      maxArrayAreaM2: usableRoofArea,
      panelsCount: useCatastro || useInspire || isManualFallback ? null : solarData.panelsCount,
      roofSegmentCount,
      maxSunshineHoursPerYear: useCatastro || useInspire || isManualFallback ? null : solarData.maxSunshineHoursPerYear,
      kwhPerKwp: pvgisData.kwhPerKwp, // PVGIS data for location-specific solar potential
      numberOfFloors: effectiveFloors, // For building area to roof area conversion
      businessSegment,
      electricityPriceEur: finalElectricityPrice,
      isManualFallback: isManualFallback || useCatastro || useInspire,
    };

    const calculation = calculateAssessment(assessmentInput);

    // Determine data source and API status
    let apiStatus: string;
    if (isManualFallback) {
      apiStatus = 'fallback';
    } else if (useInspire) {
      apiStatus = 'inspire';
    } else if (useCatastro) {
      apiStatus = 'catastro';
    } else {
      apiStatus = solarData.status;
    }

    // Step 5: Save to database
    const assessmentData: SolarAssessmentInsert = {
      lead_id: leadId ?? null,
      address_input: address,
      business_segment: businessSegment,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
      formatted_address: geocodeResult.formattedAddress,
      solar_api_status: apiStatus,
      raw_api_response: useInspire
        ? { inspire: inspireData, catastro: catastroData }
        : (useCatastro ? { catastro: catastroData } : solarData.rawResponse),
      roof_area_m2: useInspire
        ? actualRoofAreaM2
        : (useCatastro ? catastroData?.buildingAreaM2 : (isManualFallback ? null : solarData.roofAreaM2)),
      max_array_area_m2: usableRoofArea,
      panels_count: useCatastro || useInspire || isManualFallback ? null : solarData.panelsCount,
      roof_segment_count: useInspire || useCatastro ? 1 : solarData.roofSegmentCount,
      max_sunshine_hours_per_year: useCatastro || useInspire || isManualFallback ? null : solarData.maxSunshineHoursPerYear,
      is_manual_fallback: isManualFallback,
      manual_roof_area_m2: manualData?.roofAreaM2 ?? null,
      cadastral_reference: useInspire
        ? (inspireData?.buildingId ?? catastroData?.cadastralReference)
        : (useCatastro ? catastroData?.cadastralReference : (manualData?.cadastralReference ?? null)),
      building_orientation: buildingOrientation,
      // New fields
      number_of_floors: effectiveFloors,
      pvgis_kwh_per_kwp: pvgisData.kwhPerKwp,
      pvgis_optimal_angle: pvgisData.optimalAngle,
      pvgis_raw_response: pvgisData.rawResponse as Record<string, unknown> | null,
      lifetime_production_kwh: calculation.lifetimeProductionKwh,
      lifetime_savings_eur: calculation.lifetimeSavingsEur,
      degradation_rate: ASSESSMENT_CONFIG.PANEL_DEGRADATION_RATE,
      // Calculated metrics
      system_size_kw: calculation.systemSizeKw,
      annual_production_kwh: calculation.annualProductionKwh,
      annual_savings_eur: calculation.annualSavingsEur,
      payback_years: calculation.paybackYears,
      electricity_price_eur: finalElectricityPrice,
      energy_type: energyType,
      price_source: priceSource,
      country: selectedCountry,
      total_score: calculation.totalScore,
      solar_potential_score: calculation.solarPotentialScore,
      economic_potential_score: calculation.economicPotentialScore,
      execution_simplicity_score: calculation.executionSimplicityScore,
      segment_fit_score: calculation.segmentFitScore,
      assessed_by: installer.id,
    };

    const { data: savedAssessment, error: insertError } = await (supabase as any)
      .from('solar_assessments')
      .insert(assessmentData)
      .select()
      .single();

    if (insertError) {
      console.error('Error saving assessment:', insertError);
      return NextResponse.json(
        { error: 'Error al guardar la evaluación' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: savedAssessment },
      { status: 201 }
    );
  } catch (error) {
    console.error('Assessment error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
