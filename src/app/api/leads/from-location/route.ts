import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { LeadInsert } from "@/lib/supabase/types";

// Create a lead from a saved location with placeholder data
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

    const body = await request.json();
    const { locationId } = body;

    if (!locationId) {
      return NextResponse.json({ error: 'locationId requerido' }, { status: 400 });
    }

    // Fetch the saved location
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

    // Extract building data if available
    const buildingData = location.building_data as Record<string, unknown> | null;

    // Determine island from building data or coordinates
    let island = 'gran-canaria'; // default
    if (buildingData?.island) {
      const islandMap: Record<string, string> = {
        'Gran Canaria': 'gran-canaria',
        'Tenerife': 'tenerife',
        'Lanzarote': 'lanzarote',
        'Fuerteventura': 'fuerteventura',
        'La Palma': 'la-palma',
        'La Gomera': 'la-gomera',
        'El Hierro': 'el-hierro',
      };
      island = islandMap[buildingData.island as string] || 'gran-canaria';
    }

    // Determine property type from building data
    let propertyType = 'vivienda_unifamiliar';
    if (buildingData) {
      const dwellings = (buildingData.numberOfDwellings as number) || 1;
      if (dwellings > 1) {
        propertyType = 'comunidad_vecinos';
      }
      const currentUse = (buildingData.currentUseLabel as string) || '';
      if (currentUse.toLowerCase().includes('industrial') || currentUse.toLowerCase().includes('comercial')) {
        propertyType = 'empresa';
      }
    }

    // Create lead with placeholder contact info
    const leadData: LeadInsert = {
      name: location.name || 'Pendiente',
      email: 'pendiente@editar.com',
      phone: '000000000',
      address: (buildingData?.streetAddress as string) || location.name || null,
      property_type: propertyType,
      island: island,
      roof_type: 'otro',
      installation_timeline: 'explorando',
      monthly_bill: 100, // placeholder
      estimated_savings_monthly: buildingData?.annualSavingsEur ? Math.round((buildingData.annualSavingsEur as number) / 12) : null,
      estimated_savings_annual: (buildingData?.annualSavingsEur as number) || null,
      status: 'new',
      assigned_installer_id: installer.id,
      notes: `Promovido desde ubicación guardada.\nRef: ${(buildingData?.cadastralReference as string) || 'N/A'}\nCoordenadas: ${location.lat}, ${location.lon}`,
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

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error('[leads/from-location] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
