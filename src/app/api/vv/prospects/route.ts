/**
 * VV Top Prospects API
 *
 * GET /api/vv/prospects?island=...&minVv=5&limit=100
 *
 * Returns scored and ranked gestora prospects for energy community outreach.
 * Scoring based on: VV count, geographic concentration, complex clustering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ProspectRow {
  management_firm: string | null;
  island: string | null;
  municipality: string | null;
  complex_name: string | null;
  plazas: number | null;
  latitude: number | null;
  longitude: number | null;
  direccion: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const island = searchParams.get('island');
  const minVv = parseInt(searchParams.get('minVv') || '5', 10);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  try {
    const supabase = await createClient();

    // Fetch all managed VVs with pagination
    const allData: ProspectRow[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('vv_registry')
        .select('management_firm, island, municipality, complex_name, plazas, latitude, longitude, direccion')
        .not('management_firm', 'is', null)
        .neq('management_firm', '')
        .not('latitude', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (island) {
        query = query.eq('island', island);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Prospects API] Query error:', error);
        return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData.push(...data);
        hasMore = data.length === pageSize;
        page++;
      }
    }

    // Group by gestora
    const gestoraMap = new Map<string, {
      vvs: ProspectRow[];
      islands: Set<string>;
      municipalities: Set<string>;
      complexes: Set<string>;
    }>();

    for (const vv of allData) {
      const firm = vv.management_firm!.trim();
      if (!gestoraMap.has(firm)) {
        gestoraMap.set(firm, {
          vvs: [],
          islands: new Set(),
          municipalities: new Set(),
          complexes: new Set(),
        });
      }
      const g = gestoraMap.get(firm)!;
      g.vvs.push(vv);
      if (vv.island) g.islands.add(vv.island);
      if (vv.municipality) g.municipalities.add(vv.municipality);
      if (vv.complex_name) g.complexes.add(vv.complex_name);
    }

    // Calculate scores and build prospect list
    const prospects: Array<{
      name: string;
      score: number;
      vvCount: number;
      totalBeds: number;
      avgBedsPerVv: number;
      islands: string[];
      municipalities: string[];
      complexes: string[];
      concentrationScore: number;
      complexScore: number;
      centerLat: number;
      centerLon: number;
      sampleAddress: string;
    }> = [];

    for (const [firm, stats] of gestoraMap) {
      const vvCount = stats.vvs.length;
      if (vvCount < minVv) continue;

      const totalBeds = stats.vvs.reduce((sum, v) => sum + (v.plazas || 0), 0);
      const avgBeds = totalBeds / vvCount;

      // Calculate center point
      const lats = stats.vvs.map(v => v.latitude!).filter(Boolean);
      const lons = stats.vvs.map(v => v.longitude!).filter(Boolean);
      const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

      // Concentration score: fewer municipalities = more concentrated = better
      const municipalityCount = stats.municipalities.size;
      const concentrationScore = Math.max(0, 100 - (municipalityCount - 1) * 15);

      // Complex score: more VVs in complexes = better clustering
      const vvsInComplexes = stats.vvs.filter(v => v.complex_name).length;
      const complexRatio = vvsInComplexes / vvCount;
      const complexScore = Math.round(complexRatio * 100);

      // Overall prospect score (weighted)
      const vvScore = Math.min(100, Math.log10(vvCount) * 50);
      const bedScore = Math.min(100, totalBeds / 10);
      const prospectScore = Math.round(
        vvScore * 0.40 +
        concentrationScore * 0.25 +
        complexScore * 0.25 +
        bedScore * 0.10
      );

      // Sample address
      const sampleAddress = stats.vvs.find(v => v.direccion)?.direccion || '';

      prospects.push({
        name: firm,
        score: prospectScore,
        vvCount,
        totalBeds,
        avgBedsPerVv: Math.round(avgBeds * 10) / 10,
        islands: Array.from(stats.islands) as string[],
        municipalities: Array.from(stats.municipalities) as string[],
        complexes: (Array.from(stats.complexes) as string[]).slice(0, 5),
        concentrationScore,
        complexScore,
        centerLat: Math.round(centerLat * 1000000) / 1000000,
        centerLon: Math.round(centerLon * 1000000) / 1000000,
        sampleAddress,
      });
    }

    // Sort by score descending and limit
    prospects.sort((a, b) => b.score - a.score);
    const topProspects = prospects.slice(0, limit);

    // Get unique islands for filter dropdown
    const allIslands = new Set<string>();
    for (const p of prospects) {
      p.islands.forEach(i => allIslands.add(i));
    }

    // Stats
    const totalVvs = topProspects.reduce((sum, p) => sum + p.vvCount, 0);
    const totalBeds = topProspects.reduce((sum, p) => sum + p.totalBeds, 0);

    return NextResponse.json({
      prospects: topProspects,
      count: topProspects.length,
      totalProspects: prospects.length,
      totalVvs,
      totalBeds,
      filters: {
        islands: Array.from(allIslands).sort(),
      },
    });
  } catch (error) {
    console.error('[Prospects API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch prospects' }, { status: 500 });
  }
}
