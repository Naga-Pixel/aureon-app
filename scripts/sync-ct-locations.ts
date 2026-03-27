/**
 * Sync CT (Centro de Transformación) locations from OSM to Supabase
 *
 * Usage:
 *   npx tsx scripts/sync-ct-locations.ts
 *   npx tsx scripts/sync-ct-locations.ts --area "Las Palmas"
 *   npx tsx scripts/sync-ct-locations.ts --area "Tenerife"
 *   npx tsx scripts/sync-ct-locations.ts --area "Madrid"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (e) {
  // .env.local not found, use existing env
}

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Overpass endpoints (with fallbacks)
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

// Predefined areas with bounding boxes
const AREAS: Record<string, { name: string; bbox: [number, number, number, number] }> = {
  'las palmas': {
    name: 'Las Palmas de Gran Canaria',
    bbox: [27.95, -15.55, 28.2, -15.35], // [minLat, minLon, maxLat, maxLon]
  },
  'gran canaria': {
    name: 'Gran Canaria',
    bbox: [27.7, -15.9, 28.2, -15.3],
  },
  'tenerife': {
    name: 'Tenerife',
    bbox: [28.0, -16.95, 28.6, -16.1],
  },
  'fuerteventura': {
    name: 'Fuerteventura',
    bbox: [28.0, -14.55, 28.8, -13.8],
  },
  'lanzarote': {
    name: 'Lanzarote',
    bbox: [28.8, -13.95, 29.25, -13.4],
  },
  'canarias': {
    name: 'Canary Islands',
    bbox: [27.6, -18.2, 29.5, -13.3],
  },
  'madrid': {
    name: 'Madrid',
    bbox: [40.3, -3.85, 40.55, -3.55],
  },
  'barcelona': {
    name: 'Barcelona',
    bbox: [41.3, 2.05, 41.5, 2.25],
  },
};

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function buildQuery(bbox: [number, number, number, number]): string {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  return `[out:json][timeout:60];
(
  node["power"="transformer"](${bboxStr});
  way["power"="transformer"](${bboxStr});
  node["power"="substation"](${bboxStr});
  way["power"="substation"](${bboxStr});
);
out center;`;
}

async function fetchFromOverpass(query: string): Promise<OverpassResponse | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`  Trying ${endpoint}...`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.log(`  ${endpoint} returned ${response.status}, trying next...`);
        continue;
      }

      const data = await response.json();
      console.log(`  Success! Got ${data.elements?.length || 0} elements`);
      return data as OverpassResponse;
    } catch (error) {
      console.log(`  ${endpoint} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }

  return null;
}

function parseElements(elements: OverpassElement[]): Array<{
  source: string;
  source_id: string;
  ref_ct: string | null;
  operator: string | null;
  latitude: number;
  longitude: number;
  confidence: number;
  metadata: Record<string, unknown>;
}> {
  const results: Array<{
    source: string;
    source_id: string;
    ref_ct: string | null;
    operator: string | null;
    latitude: number;
    longitude: number;
    confidence: number;
    metadata: Record<string, unknown>;
  }> = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;

    if (!lat || !lon) continue;

    const tags = el.tags || {};

    // Calculate confidence based on available data
    let confidence = 50;
    if (tags.ref || tags['ref:CT'] || tags.name) confidence += 25;
    if (tags.operator) confidence += 15;
    if (tags.voltage) confidence += 10;

    results.push({
      source: 'osm',
      source_id: `${el.type}/${el.id}`,
      ref_ct: tags.ref || tags['ref:CT'] || tags.name || null,
      operator: tags.operator || null,
      latitude: lat,
      longitude: lon,
      confidence: Math.min(100, confidence),
      metadata: {
        osm_type: el.type,
        osm_id: el.id,
        power: tags.power,
        substation: tags.substation,
        voltage: tags.voltage,
        frequency: tags.frequency,
      },
    });
  }

  return results;
}

async function syncArea(areaKey: string): Promise<number> {
  const area = AREAS[areaKey.toLowerCase()];
  if (!area) {
    console.error(`Unknown area: ${areaKey}`);
    console.log('Available areas:', Object.keys(AREAS).join(', '));
    return 0;
  }

  console.log(`\nFetching CT locations for ${area.name}...`);
  console.log(`  Bbox: ${area.bbox.join(', ')}`);

  const query = buildQuery(area.bbox);
  const data = await fetchFromOverpass(query);

  if (!data || !data.elements) {
    console.error('Failed to fetch from Overpass');
    return 0;
  }

  const cts = parseElements(data.elements);
  console.log(`  Parsed ${cts.length} CT locations`);

  if (cts.length === 0) {
    return 0;
  }

  // Insert in batches
  const batchSize = 50;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < cts.length; i += batchSize) {
    const batch = cts.slice(i, i + batchSize);

    const { data: result, error } = await supabase
      .from('ct_locations')
      .upsert(batch, {
        onConflict: 'source,source_id',
        ignoreDuplicates: false,
      })
      .select('id');

    if (error) {
      console.error(`  Error inserting batch: ${error.message}`);
      continue;
    }

    inserted += result?.length || 0;
    process.stdout.write(`  Inserted/updated ${inserted}/${cts.length}\r`);
  }

  console.log(`\n  Done: ${inserted} CT locations synced for ${area.name}`);
  return inserted;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse --area argument
  const areaIndex = args.indexOf('--area');
  let areas: string[] = [];

  if (areaIndex !== -1 && args[areaIndex + 1]) {
    areas = [args[areaIndex + 1]];
  } else if (args.includes('--all')) {
    areas = Object.keys(AREAS);
  } else {
    // Default to Las Palmas
    areas = ['las palmas'];
  }

  console.log('=== CT Location Sync ===');
  console.log(`Areas to sync: ${areas.join(', ')}`);

  let totalSynced = 0;

  for (const area of areas) {
    const count = await syncArea(area);
    totalSynced += count;

    // Small delay between areas to be nice to Overpass
    if (areas.length > 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n=== Total: ${totalSynced} CT locations synced ===`);

  // Show summary from database
  const { count } = await supabase
    .from('ct_locations')
    .select('*', { count: 'exact', head: true });

  console.log(`Database now has ${count} total CT locations`);
}

main().catch(console.error);
