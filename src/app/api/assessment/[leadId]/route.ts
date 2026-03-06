import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadId } = await params;

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID requerido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get installer info
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id, role')
      .eq('user_id', user.id)
      .single();

    if (!installer) {
      return NextResponse.json({ error: 'Instalador no encontrado' }, { status: 404 });
    }

    // Fetch the assessment
    const { data: assessment, error } = await (supabase as any)
      .from('solar_assessments')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No assessment found is not an error
      if (error.code === 'PGRST116') {
        return NextResponse.json({ data: null }, { status: 200 });
      }
      console.error('Error fetching assessment:', error);
      return NextResponse.json({ error: 'Error al obtener evaluación' }, { status: 500 });
    }

    // If not admin, verify the lead is assigned to this installer
    if (installer.role !== 'admin') {
      const { data: lead } = await (supabase as any)
        .from('leads')
        .select('assigned_installer_id')
        .eq('id', leadId)
        .single();

      if (!lead || lead.assigned_installer_id !== installer.id) {
        return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
      }
    }

    return NextResponse.json({ data: assessment }, { status: 200 });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
