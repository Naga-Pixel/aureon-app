import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const hasLead = searchParams.get('hasLead'); // 'true', 'false', or null for all

    let query = (supabase as any)
      .from('solar_assessments')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by lead association
    if (hasLead === 'true') {
      query = query.not('lead_id', 'is', null);
    } else if (hasLead === 'false') {
      query = query.is('lead_id', null);
    }

    const { data: assessments, error } = await query;

    if (error) {
      console.error('Error fetching assessments:', error);
      return NextResponse.json({ error: 'Error al cargar evaluaciones' }, { status: 500 });
    }

    return NextResponse.json({ data: assessments });
  } catch (error) {
    console.error('List assessments error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
