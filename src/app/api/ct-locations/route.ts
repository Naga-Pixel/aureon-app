import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, appendFileSync } from 'fs';

function logToFile(msg: string) {
  try {
    appendFileSync('/tmp/ct-api.log', `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {}
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const minLat = parseFloat(searchParams.get('minLat') || '');
  const maxLat = parseFloat(searchParams.get('maxLat') || '');
  const minLon = parseFloat(searchParams.get('minLon') || '');
  const maxLon = parseFloat(searchParams.get('maxLon') || '');

  console.log('[CT API] Received bbox:', { minLat, maxLat, minLon, maxLon });
  logToFile(`Received bbox: minLat=${minLat}, maxLat=${maxLat}, minLon=${minLon}, maxLon=${maxLon}`);

  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
    return NextResponse.json(
      { error: 'Missing or invalid bbox parameters (minLat, maxLat, minLon, maxLon)' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .rpc('get_cts_in_bbox', {
      min_lat: minLat,
      min_lon: minLon,
      max_lat: maxLat,
      max_lon: maxLon,
    });

  if (error) {
    console.error('[CT API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[CT API] Query result:', data?.length || 0, 'locations for bbox:', { minLat, maxLat, minLon, maxLon });
  logToFile(`Query result: ${data?.length || 0} locations`);

  // Transform to CTLocation format
  const ctLocations = (data || []).map((ct: {
    id: string;
    source: string;
    source_id: string;
    ref_ct: string | null;
    operator: string | null;
    latitude: number;
    longitude: number;
    confidence: number;
  }) => ({
    id: ct.id,
    source: ct.source,
    sourceId: ct.source_id,
    refCT: ct.ref_ct,
    operator: ct.operator,
    lat: Number(ct.latitude),
    lon: Number(ct.longitude),
    confidence: ct.confidence,
  }));

  return NextResponse.json({
    ctLocations,
    count: ctLocations.length,
  });
}
