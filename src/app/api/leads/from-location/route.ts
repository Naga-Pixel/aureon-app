import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { LeadInsert } from "@/lib/supabase/types";

const ISLAND_MAP: Record<string, string> = {
  'Gran Canaria': 'gran-canaria',
  'Tenerife': 'tenerife',
  'Lanzarote': 'lanzarote',
  'Fuerteventura': 'fuerteventura',
  'La Palma': 'la-palma',
  'La Gomera': 'la-gomera',
  'El Hierro': 'el-hierro',
};

function inferPropertyType(buildingData: Record<string, unknown> | null): string {
  if (!buildingData) return 'vivienda_unifamiliar';

  const dwellings = (buildingData.numberOfDwellings as number) || 1;
  if (dwellings > 1) return 'comunidad_vecinos';

  const currentUse = (buildingData.currentUseLabel as string) || '';
  if (currentUse.toLowerCase().includes('industrial') || currentUse.toLowerCase().includes('comercial')) {
    return 'empresa';
  }

  return 'vivienda_unifamiliar';
}

function inferIsland(buildingData: Record<string, unknown> | null): string {
  if (buildingData?.island) {
    return ISLAND_MAP[buildingData.island as string] || 'gran-canaria';
  }
  return 'gran-canaria';
}

/**
 * Create a lead from prospecting tool
 * Accepts either:
 * - locationId: Create from a saved location
 * - lat, lon, name: Create directly from coordinates
 */
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
    const { locationId, lat, lon, name, buildingData: directBuildingData } = body;

    let leadName: string;
    let leadLat: number;
    let leadLon: number;
    let buildingData: Record<string, unknown> | null = null;

    if (locationId) {
      // Flow 1: Create from saved location
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: location, error: locError } = await (supabase as any)
        .from('saved_locations')
        .select('*')
        .eq('id', locationId)
        .eq('installer_id', installer.id)
        .single();

      if (locError || !location) {
        return NextResponse.json({ error: 'Ubicación no encontrada' }, { status: 404 });
      }

      leadName = location.name || 'Pendiente';
      leadLat = location.lat;
      leadLon = location.lon;
      buildingData = location.building_data as Record<string, unknown> | null;
    } else if (lat !== undefined && lon !== undefined && name) {
      // Flow 2: Create directly from coordinates
      leadName = name;
      leadLat = lat;
      leadLon = lon;
      buildingData = directBuildingData || null;
    } else {
      return NextResponse.json(
        { error: 'Se requiere locationId o (lat, lon, name)' },
        { status: 400 }
      );
    }

    const leadData: LeadInsert = {
      name: leadName,
      email: 'pendiente@editar.com',
      phone: '000000000',
      address: (buildingData?.streetAddress as string) || null,
      property_type: inferPropertyType(buildingData),
      island: inferIsland(buildingData),
      roof_type: 'otro',
      installation_timeline: 'explorando',
      monthly_bill: 100,
      estimated_savings_monthly: buildingData?.annualSavingsEur
        ? Math.round((buildingData.annualSavingsEur as number) / 12)
        : null,
      estimated_savings_annual: (buildingData?.annualSavingsEur as number) || null,
      status: 'new',
      assigned_installer_id: installer.id,
      notes: `Creado desde herramienta de prospección.\nRef: ${(buildingData?.cadastralReference as string) || 'N/A'}\nCoordenadas: ${leadLat}, ${leadLon}`,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error } = await (supabase as any)
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (error) {
      console.error('[leads/from-location] Insert error:', error);
      return NextResponse.json({ error: 'Error al crear lead' }, { status: 500 });
    }

    return NextResponse.json({ lead, id: lead.id }, { status: 201 });
  } catch (error) {
    console.error('[leads/from-location] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
