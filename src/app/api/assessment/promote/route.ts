import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const promoteSchema = z.object({
  assessmentId: z.string().uuid(),
  name: z.string().min(2, 'Nombre requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(9, 'Teléfono requerido'),
  propertyType: z.enum(['commercial', 'industrial', 'residential']).default('commercial'),
  island: z.string().default('Gran Canaria'),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = promoteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { assessmentId, name, email, phone, propertyType, island, notes } = validation.data;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get the assessment
    const { data: assessment, error: assessmentError } = await (supabase as any)
      .from('solar_assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json({ error: 'Evaluación no encontrada' }, { status: 404 });
    }

    if (assessment.lead_id) {
      return NextResponse.json({ error: 'Esta evaluación ya tiene un lead asociado' }, { status: 400 });
    }

    // Create the lead
    const { data: lead, error: leadError } = await (supabase as any)
      .from('leads')
      .insert({
        name,
        email,
        phone,
        address: assessment.formatted_address || assessment.address_input,
        property_type: propertyType,
        island,
        roof_type: 'flat', // Default, can be updated later
        installation_timeline: '3_months',
        monthly_bill: Math.round(assessment.annual_savings_eur / 12), // Estimate from savings
        estimated_savings_annual: assessment.annual_savings_eur,
        status: 'new',
        notes: notes || `Evaluación solar: Score ${assessment.total_score}/100`,
      })
      .select()
      .single();

    if (leadError) {
      console.error('Error creating lead:', leadError);
      return NextResponse.json({ error: 'Error al crear el lead' }, { status: 500 });
    }

    // Link assessment to lead
    const { error: updateError } = await (supabase as any)
      .from('solar_assessments')
      .update({ lead_id: lead.id })
      .eq('id', assessmentId);

    if (updateError) {
      console.error('Error linking assessment:', updateError);
      // Lead was created but linking failed - still return success
    }

    return NextResponse.json({
      success: true,
      data: { lead, assessmentId }
    }, { status: 201 });
  } catch (error) {
    console.error('Promote assessment error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
