import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Verify the lead belongs to this installer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (supabase as any)
      .from('leads')
      .select('id')
      .eq('id', id)
      .eq('assigned_installer_id', installer.id)
      .single();

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    // Delete the lead (solar assessments keep their data with null lead_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[leads/delete] Error:', error);
      return NextResponse.json({ error: 'Error al eliminar lead' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[leads/delete] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
