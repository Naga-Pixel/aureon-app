import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verify user is admin
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id, role')
      .eq('user_id', user.id)
      .single();

    if (!installer || installer.role !== 'admin') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar evaluaciones' }, { status: 403 });
    }

    // Delete the assessment
    const { error } = await (supabase as any)
      .from('solar_assessments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting assessment:', error);
      return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete assessment error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
