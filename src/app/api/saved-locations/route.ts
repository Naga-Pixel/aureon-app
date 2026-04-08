import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!installer) {
      return NextResponse.json({ error: 'Instalador no encontrado' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: locations, error } = await (supabase as any)
      .from('saved_locations')
      .select('*')
      .eq('installer_id', installer.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[saved-locations] GET error:', error);
      return NextResponse.json({ error: 'Error al obtener ubicaciones' }, { status: 500 });
    }

    return NextResponse.json({ locations: locations || [] });
  } catch (error) {
    console.error('[saved-locations] GET error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!installer) {
      return NextResponse.json({ error: 'Instalador no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { type, name, notes, lat, lon, building_data } = body;

    if (!type || !['pin', 'building'].includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: location, error } = await (supabase as any)
      .from('saved_locations')
      .insert({
        installer_id: installer.id,
        type,
        name: name || null,
        notes: notes || null,
        lat,
        lon,
        building_data: building_data || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[saved-locations] POST error:', error);
      return NextResponse.json({ error: 'Error al guardar ubicación' }, { status: 500 });
    }

    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    console.error('[saved-locations] POST error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: installer } = await (supabase as any)
      .from('installers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!installer) {
      return NextResponse.json({ error: 'Instalador no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { id, color } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    // Validate color is one of the allowed presets
    const allowedColors = ['#f97316', '#eab308', '#22c55e']; // orange, yellow, green
    if (color && !allowedColors.includes(color)) {
      return NextResponse.json({ error: 'Color no válido' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: location, error } = await (supabase as any)
      .from('saved_locations')
      .update({ color })
      .eq('id', id)
      .eq('installer_id', installer.id)
      .select()
      .single();

    if (error) {
      console.error('[saved-locations] PATCH error:', error);
      return NextResponse.json({ error: 'Error al actualizar ubicación' }, { status: 500 });
    }

    return NextResponse.json({ location });
  } catch (error) {
    console.error('[saved-locations] PATCH error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

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
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('saved_locations')
      .delete()
      .eq('id', id)
      .eq('installer_id', installer.id);

    if (error) {
      console.error('[saved-locations] DELETE error:', error);
      return NextResponse.json({ error: 'Error al eliminar ubicación' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[saved-locations] DELETE error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
