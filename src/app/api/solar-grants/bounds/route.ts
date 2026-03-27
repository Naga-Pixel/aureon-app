/**
 * Solar Grants Bounds API
 *
 * GET /api/solar-grants/bounds?minLat=...&maxLat=...&minLon=...&maxLon=...&limit=500
 *
 * Returns solar grant recipients within bounding box for map display.
 * Data sourced from BDNS (Base de Datos Nacional de Subvenciones).
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

    const { data, error } = await supabase
      .from('solar_grants_registry')
      .select(
        'id, cif, company_name, grant_amount, grant_date, program_name, municipality, province, latitude, longitude'
      )
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLon)
      .lte('longitude', maxLon)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(limit);

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return NextResponse.json({
          grants: [],
          count: 0,
          message: 'Solar grants registry table not yet created. Run migrations first.',
        });
      }
      console.error('[Solar Grants API] Query error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    type GrantRow = {
      id: number;
      cif: string;
      company_name: string;
      grant_amount: number;
      grant_date: string;
      program_name: string;
      municipality: string;
      province: string;
      latitude: number;
      longitude: number;
    };

    const grants = ((data || []) as GrantRow[]).map((row) => ({
      id: row.id,
      cif: row.cif,
      companyName: row.company_name,
      grantAmount: row.grant_amount,
      grantDate: row.grant_date,
      programName: row.program_name,
      municipality: row.municipality,
      province: row.province,
      lat: row.latitude,
      lon: row.longitude,
    }));

    return NextResponse.json({
      grants,
      count: grants.length,
      bounds: { minLat, maxLat, minLon, maxLon },
    });
  } catch (error) {
    console.error('[Solar Grants API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch solar grants' }, { status: 500 });
  }
}
