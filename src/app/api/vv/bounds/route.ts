/**
 * VV Bounds API
 *
 * GET /api/vv/bounds?minLat=...&maxLat=...&minLon=...&maxLon=...&limit=500
 *
 * Returns VVs within bounding box for map display.
 * Filters out VVs without coordinates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const minLat = parseFloat(searchParams.get('minLat') || '');
  const maxLat = parseFloat(searchParams.get('maxLat') || '');
  const minLon = parseFloat(searchParams.get('minLon') || '');
  const maxLon = parseFloat(searchParams.get('maxLon') || '');
  const limit = Math.min(1000, parseInt(searchParams.get('limit') || '500', 10));

  // Validate bounds
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
    return NextResponse.json(
      { error: 'Invalid bounds. Required: minLat, maxLat, minLon, maxLon' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('vv_registry')
      .select('establecimiento_id, nombre_comercial, plazas, latitude, longitude, island, municipality, property_type, management_firm, complex_name, complex_id')
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLon)
      .lte('longitude', maxLon)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .neq('latitude', 0)
      .neq('longitude', 0)
      .limit(limit);

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return NextResponse.json({
          vvs: [],
          count: 0,
          message: 'VV registry table not yet created. Run migrations first.',
        });
      }
      console.error('[VV Bounds API] Query error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vvs = (data || []).map((row: any) => ({
      id: row.establecimiento_id,
      name: row.nombre_comercial || 'VV',
      plazas: row.plazas || 0,
      lat: row.latitude,
      lon: row.longitude,
      island: row.island,
      municipality: row.municipality,
      propertyType: row.property_type,
      managementFirm: row.management_firm,
      complexName: row.complex_name,
      complexId: row.complex_id,
      // For grouping: use complexId (address-based) as primary, fall back to complexName
      groupId: row.complex_id || row.complex_name || row.management_firm || null,
    }));

    return NextResponse.json({
      vvs,
      count: vvs.length,
      bounds: { minLat, maxLat, minLon, maxLon },
    });
  } catch (error) {
    console.error('[VV Bounds API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch VVs' }, { status: 500 });
  }
}
