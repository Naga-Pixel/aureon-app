import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateAssessment } from '@/lib/services/assessment-scorer';
import { ASSESSMENT_CONFIG } from '@/lib/config/assessment-config';

interface RecalculateRequest {
  assessmentId: string;
  updates: {
    roofAreaM2?: number;
    usableRoofPercent?: number;
    electricityPrice?: number;
    numberOfFloors?: number;
    installationCostPerKw?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: RecalculateRequest = await request.json();
    const { assessmentId, updates } = body;

    if (!assessmentId) {
      return NextResponse.json({ error: 'ID de evaluación requerido' }, { status: 400 });
    }

    // Get Supabase client and check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get the existing assessment
    const { data: assessment, error: fetchError } = await (supabase as any)
      .from('solar_assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (fetchError || !assessment) {
      return NextResponse.json({ error: 'Evaluación no encontrada' }, { status: 404 });
    }

    // Apply updates
    const numberOfFloors = updates.numberOfFloors ?? assessment.number_of_floors ?? 1;
    const electricityPrice = updates.electricityPrice ?? assessment.electricity_price_eur;

    // Calculate roof area
    let roofAreaM2: number;
    if (updates.roofAreaM2) {
      // User specified roof area directly
      roofAreaM2 = updates.roofAreaM2;
    } else if (assessment.roof_area_m2) {
      // Use existing roof area (which is building area from Catastro)
      roofAreaM2 = assessment.roof_area_m2 / (assessment.number_of_floors ?? 1);
    } else {
      roofAreaM2 = 500; // Fallback
    }

    // Calculate usable roof area
    const usablePercent = updates.usableRoofPercent ??
      (assessment.max_array_area_m2 && roofAreaM2
        ? (assessment.max_array_area_m2 / roofAreaM2) * 100
        : 60);
    const usableRoofAreaM2 = roofAreaM2 * (usablePercent / 100);

    // Prepare input for calculator
    const assessmentInput = {
      roofAreaM2: roofAreaM2 * numberOfFloors, // Convert back to building area format
      maxArrayAreaM2: usableRoofAreaM2,
      panelsCount: assessment.panels_count,
      roofSegmentCount: assessment.roof_segment_count ?? 1,
      maxSunshineHoursPerYear: assessment.max_sunshine_hours_per_year,
      kwhPerKwp: assessment.pvgis_kwh_per_kwp,
      numberOfFloors,
      businessSegment: assessment.business_segment,
      electricityPriceEur: electricityPrice,
      isManualFallback: true, // Recalculated values are manual
    };

    const calculation = calculateAssessment(assessmentInput);

    // Update the assessment in the database
    const updateData = {
      roof_area_m2: roofAreaM2 * numberOfFloors,
      max_array_area_m2: usableRoofAreaM2,
      number_of_floors: numberOfFloors,
      electricity_price_eur: electricityPrice,
      system_size_kw: calculation.systemSizeKw,
      annual_production_kwh: calculation.annualProductionKwh,
      annual_savings_eur: calculation.annualSavingsEur,
      payback_years: calculation.paybackYears,
      lifetime_production_kwh: calculation.lifetimeProductionKwh,
      lifetime_savings_eur: calculation.lifetimeSavingsEur,
      total_score: calculation.totalScore,
      solar_potential_score: calculation.solarPotentialScore,
      economic_potential_score: calculation.economicPotentialScore,
      execution_simplicity_score: calculation.executionSimplicityScore,
      segment_fit_score: calculation.segmentFitScore,
      is_manual_fallback: true,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedAssessment, error: updateError } = await (supabase as any)
      .from('solar_assessments')
      .update(updateData)
      .eq('id', assessmentId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating assessment:', updateError);
      return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updatedAssessment });
  } catch (error) {
    console.error('Recalculate error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
