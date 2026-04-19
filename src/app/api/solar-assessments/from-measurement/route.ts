import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SolarAssessmentInsert } from "@/lib/supabase/types";

interface CommunityEnergyData {
  selfConsumptionKwh: number;
  surplusKwh: number;
  homesServed: number;
  gridRevenue: number;
  communityRevenue: number;
  extraProfit: number;
  costWithIncentives: number;
  paybackWithIncentives: number;
}

interface MeasurementData {
  leadId: string;
  areaM2: number;
  panelCount: number;
  systemKwp: number;
  annualKwh: number;
  annualSavingsEur: number;
  installationCost: number;
  paybackYears: number;
  // Polygon center coordinates
  latitude: number;
  longitude: number;
  // Polygon vertices for reference
  vertices: [number, number][];
  // Community energy data
  communityEnergy?: CommunityEnergyData;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get installer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!installer) {
      return NextResponse.json({ error: 'Instalador no encontrado' }, { status: 404 });
    }

    const body: MeasurementData = await request.json();

    if (!body.leadId || !body.areaM2) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Verify the lead belongs to this installer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadError } = await (supabase as any)
      .from('leads')
      .select('id, name, address')
      .eq('id', body.leadId)
      .eq('assigned_installer_id', installer.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    // Calculate scores based on the measurement data
    const solarPotentialScore = Math.min(100, Math.round(body.areaM2 / 5)); // Rough score based on area
    const economicScore = Math.min(100, Math.round(body.annualSavingsEur / 50));
    const simplicityScore = 70; // Default for manual measurement
    const segmentFitScore = 75; // Default
    const totalScore = Math.round((solarPotentialScore + economicScore + simplicityScore + segmentFitScore) / 4);

    // Create solar assessment
    const assessmentData: SolarAssessmentInsert = {
      lead_id: body.leadId,
      address_input: lead.address || `${body.latitude.toFixed(6)}, ${body.longitude.toFixed(6)}`,
      business_segment: 'residential',
      latitude: body.latitude,
      longitude: body.longitude,
      solar_api_status: 'manual',
      is_manual_fallback: true,
      manual_roof_area_m2: body.areaM2,
      roof_area_m2: body.areaM2,
      panels_count: body.panelCount,
      system_size_kw: body.systemKwp,
      annual_production_kwh: body.annualKwh,
      annual_savings_eur: body.annualSavingsEur,
      payback_years: body.paybackYears,
      electricity_price_eur: 0.18, // Default price
      total_score: totalScore,
      solar_potential_score: solarPotentialScore,
      economic_potential_score: economicScore,
      execution_simplicity_score: simplicityScore,
      segment_fit_score: segmentFitScore,
      assessed_by: installer.id,
      raw_api_response: {
        source: 'manual_measurement',
        vertices: body.vertices,
        installationCost: body.installationCost,
        communityEnergy: body.communityEnergy,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: assessment, error } = await (supabase as any)
      .from('solar_assessments')
      .insert(assessmentData)
      .select()
      .single();

    if (error) {
      console.error('[solar-assessments/from-measurement] Insert error:', error);
      return NextResponse.json({ error: 'Error al crear evaluación' }, { status: 500 });
    }

    return NextResponse.json({ assessment }, { status: 201 });
  } catch (error) {
    console.error('[solar-assessments/from-measurement] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
