/**
 * VV Firms/Complexes API
 *
 * GET /api/vv/firms?type=firm|complex&island=...&municipality=...
 *
 * Returns management firms or complexes with their VVs grouped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'firm'; // 'firm' or 'complex'
  const island = searchParams.get('island');
  const municipality = searchParams.get('municipality');

  try {
    const supabase = await createClient();

    // Build query based on type
    let query = (supabase as any)
      .from('vv_registry')
      .select('establecimiento_id, nombre_comercial, plazas, latitude, longitude, island, municipality, direccion, management_firm, complex_name, property_type')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    // Filter by type
    if (type === 'firm') {
      query = query.eq('property_type', 'management_firm').not('management_firm', 'is', null);
    } else {
      query = query.eq('property_type', 'complex').not('complex_name', 'is', null);
    }

    // Apply filters
    if (island) {
      query = query.eq('island', island);
    }
    if (municipality) {
      query = query.ilike('municipality', `%${municipality}%`);
    }

    const { data, error } = await query.limit(10000);

    if (error) {
      console.error('[VV Firms API] Query error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    // Group VVs by firm or complex name
    const groupKey = type === 'firm' ? 'management_firm' : 'complex_name';
    const groups = new Map<string, {
      name: string;
      vvCount: number;
      totalPlazas: number;
      islands: Set<string>;
      municipalities: Set<string>;
      vvs: Array<{
        id: string;
        name: string;
        plazas: number;
        lat: number;
        lon: number;
        address: string;
        island: string;
        municipality: string;
      }>;
    }>();

    for (const row of data || []) {
      const name = row[groupKey];
      if (!name) continue;

      if (!groups.has(name)) {
        groups.set(name, {
          name,
          vvCount: 0,
          totalPlazas: 0,
          islands: new Set(),
          municipalities: new Set(),
          vvs: [],
        });
      }

      const group = groups.get(name)!;
      group.vvCount++;
      group.totalPlazas += row.plazas || 0;
      if (row.island) group.islands.add(row.island);
      if (row.municipality) group.municipalities.add(row.municipality);
      group.vvs.push({
        id: row.establecimiento_id,
        name: row.nombre_comercial || 'VV',
        plazas: row.plazas || 0,
        lat: row.latitude,
        lon: row.longitude,
        address: row.direccion || '',
        island: row.island || '',
        municipality: row.municipality || '',
      });
    }

    // Convert to array and sort by VV count
    const result = Array.from(groups.values()).map(g => ({
      ...g,
      islands: Array.from(g.islands),
      municipalities: Array.from(g.municipalities),
      // Calculate center point for "jump to map"
      centerLat: g.vvs.reduce((sum, v) => sum + v.lat, 0) / g.vvs.length,
      centerLon: g.vvs.reduce((sum, v) => sum + v.lon, 0) / g.vvs.length,
    }));

    // Sort by VV count descending
    result.sort((a, b) => b.vvCount - a.vvCount);

    // Get unique islands and municipalities for filter dropdowns
    const allIslands = new Set<string>();
    const allMunicipalities = new Set<string>();
    for (const group of result) {
      group.islands.forEach(i => allIslands.add(i));
      group.municipalities.forEach(m => allMunicipalities.add(m));
    }

    return NextResponse.json({
      groups: result,
      count: result.length,
      totalVvs: result.reduce((sum, g) => sum + g.vvCount, 0),
      filters: {
        islands: Array.from(allIslands).sort(),
        municipalities: Array.from(allMunicipalities).sort(),
      },
    });
  } catch (error) {
    console.error('[VV Firms API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch firms' }, { status: 500 });
  }
}
