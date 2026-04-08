import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Search leads for the current installer
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    // Fetch leads assigned to this installer, optionally filtered by search
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let leadQuery = (supabase as any)
      .from('leads')
      .select('id, name, email, address, phone, status, created_at')
      .eq('assigned_installer_id', installer.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (query.trim()) {
      // Search in name, email, or address
      leadQuery = leadQuery.or(`name.ilike.%${query}%,email.ilike.%${query}%,address.ilike.%${query}%`);
    }

    const { data: leads, error } = await leadQuery;

    if (error) {
      console.error('[leads/search] Error:', error);
      return NextResponse.json({ error: 'Error al buscar leads' }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [] });
  } catch (error) {
    console.error('[leads/search] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
