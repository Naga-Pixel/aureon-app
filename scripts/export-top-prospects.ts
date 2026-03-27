/**
 * Export Top Gestora Prospects
 *
 * Identifies and exports the best gestora targets for energy community outreach.
 * Scoring based on: VV count, concentration, complex clustering, bed capacity.
 *
 * Usage:
 *   npx tsx scripts/export-top-prospects.ts
 *   npx tsx scripts/export-top-prospects.ts --island "Gran Canaria"
 *   npx tsx scripts/export-top-prospects.ts --min-vv 10 --top 100
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
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
  // .env.local not found
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const filterIsland = getArg('island');
const minVV = parseInt(getArg('min-vv') || '5', 10);
const topN = parseInt(getArg('top') || '200', 10);

interface GestoraProspect {
  management_firm: string;
  vv_count: number;
  total_beds: number;
  avg_beds_per_vv: number;
  islands: string[];
  municipalities: string[];
  complexes: string[];
  concentration_score: number;
  complex_score: number;
  prospect_score: number;
  center_lat: number;
  center_lon: number;
  sample_addresses: string[];
  map_url: string;
}

async function fetchGestoraStats(): Promise<GestoraProspect[]> {
  console.log('Fetching gestora statistics...');

  // Fetch all records with pagination (Supabase has 1000 row limit)
  const allData: Array<{
    management_firm: string | null;
    island: string | null;
    municipality: string | null;
    complex_name: string | null;
    plazas: number | null;
    latitude: number | null;
    longitude: number | null;
    direccion: string | null;
  }> = [];

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

    if (filterIsland) {
      query = query.eq('island', filterIsland);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...data);
      process.stdout.write(`  Fetched ${allData.length} records...\r`);
      hasMore = data.length === pageSize;
      page++;
    }
  }

  console.log(`\nProcessing ${allData.length} VV records...`);

  const data = allData;

  if (data.length === 0) {
    console.log('No data found');
    return [];
  }

  // Group by gestora
  const gestoraMap = new Map<string, {
    vvs: typeof data;
    islands: Set<string>;
    municipalities: Set<string>;
    complexes: Set<string>;
  }>();

  for (const vv of data) {
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
  const prospects: GestoraProspect[] = [];

  for (const [firm, stats] of gestoraMap) {
    const vvCount = stats.vvs.length;

    // Skip if below minimum
    if (vvCount < minVV) continue;

    const totalBeds = stats.vvs.reduce((sum, v) => sum + (v.plazas || 0), 0);
    const avgBeds = totalBeds / vvCount;

    // Calculate center point
    const lats = stats.vvs.map(v => v.latitude!).filter(Boolean);
    const lons = stats.vvs.map(v => v.longitude!).filter(Boolean);
    const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

    // Concentration score: fewer municipalities = more concentrated = better
    // Score: 100 if 1 municipality, decreasing as spread increases
    const municipalityCount = stats.municipalities.size;
    const concentrationScore = Math.max(0, 100 - (municipalityCount - 1) * 15);

    // Complex score: more complexes = better clustering
    // Score: 0 if no complexes, up to 100 if most VVs are in complexes
    const complexCount = stats.complexes.size;
    const vvsInComplexes = stats.vvs.filter(v => v.complex_name).length;
    const complexRatio = vvsInComplexes / vvCount;
    const complexScore = Math.round(complexRatio * 100);

    // Overall prospect score (weighted)
    // - VV count: 40% (log scale to not over-weight huge portfolios)
    // - Concentration: 25%
    // - Complex clustering: 25%
    // - Bed capacity: 10%
    const vvScore = Math.min(100, Math.log10(vvCount) * 50);
    const bedScore = Math.min(100, totalBeds / 10);

    const prospectScore = Math.round(
      vvScore * 0.40 +
      concentrationScore * 0.25 +
      complexScore * 0.25 +
      bedScore * 0.10
    );

    // Sample addresses for context
    const sampleAddresses = stats.vvs
      .slice(0, 3)
      .map(v => v.direccion)
      .filter(Boolean) as string[];

    // Generate map URL
    const mapUrl = `http://localhost:3000/installer/prospecting?lat=${centerLat.toFixed(6)}&lon=${centerLon.toFixed(6)}&zoom=15`;

    prospects.push({
      management_firm: firm,
      vv_count: vvCount,
      total_beds: totalBeds,
      avg_beds_per_vv: Math.round(avgBeds * 10) / 10,
      islands: Array.from(stats.islands),
      municipalities: Array.from(stats.municipalities),
      complexes: Array.from(stats.complexes).slice(0, 5), // Top 5 complexes
      concentration_score: concentrationScore,
      complex_score: complexScore,
      prospect_score: prospectScore,
      center_lat: Math.round(centerLat * 1000000) / 1000000,
      center_lon: Math.round(centerLon * 1000000) / 1000000,
      sample_addresses: sampleAddresses,
      map_url: mapUrl,
    });
  }

  // Sort by prospect score descending
  prospects.sort((a, b) => b.prospect_score - a.prospect_score);

  return prospects.slice(0, topN);
}

function exportToCSV(prospects: GestoraProspect[], filename: string): void {
  const headers = [
    'Ranking',
    'Gestora',
    'Score',
    'VVs',
    'Camas',
    'Camas/VV',
    'Islas',
    'Municipios',
    'Complejos',
    'Concentracion',
    'Score Complejos',
    'Lat',
    'Lon',
    'Direccion Ejemplo',
    'Map URL',
  ];

  const rows = prospects.map((p, i) => [
    i + 1,
    `"${p.management_firm.replace(/"/g, '""')}"`,
    p.prospect_score,
    p.vv_count,
    p.total_beds,
    p.avg_beds_per_vv,
    `"${p.islands.join(', ')}"`,
    `"${p.municipalities.join(', ')}"`,
    `"${p.complexes.join(', ')}"`,
    p.concentration_score,
    p.complex_score,
    p.center_lat,
    p.center_lon,
    `"${(p.sample_addresses[0] || '').replace(/"/g, '""')}"`,
    p.map_url,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // Ensure outputs directory exists
  mkdirSync(resolve(process.cwd(), 'outputs'), { recursive: true });

  const filepath = resolve(process.cwd(), 'outputs', filename);
  writeFileSync(filepath, csv, 'utf-8');
  console.log(`\nExported to: ${filepath}`);
}

function exportToJSON(prospects: GestoraProspect[], filename: string): void {
  mkdirSync(resolve(process.cwd(), 'outputs'), { recursive: true });
  const filepath = resolve(process.cwd(), 'outputs', filename);
  writeFileSync(filepath, JSON.stringify(prospects, null, 2), 'utf-8');
  console.log(`Exported to: ${filepath}`);
}

function printSummary(prospects: GestoraProspect[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('TOP GESTORA PROSPECTS');
  console.log('='.repeat(70));

  if (filterIsland) {
    console.log(`Filtered by island: ${filterIsland}`);
  }
  console.log(`Minimum VVs: ${minVV}`);
  console.log(`Total prospects: ${prospects.length}`);
  console.log('='.repeat(70));

  // Print top 20
  console.log('\nTop 20 Prospects:\n');
  console.log(
    'Rank'.padEnd(6) +
    'Score'.padEnd(7) +
    'VVs'.padEnd(6) +
    'Beds'.padEnd(7) +
    'Muni'.padEnd(6) +
    'Gestora'
  );
  console.log('-'.repeat(70));

  for (let i = 0; i < Math.min(20, prospects.length); i++) {
    const p = prospects[i];
    console.log(
      `#${i + 1}`.padEnd(6) +
      `${p.prospect_score}`.padEnd(7) +
      `${p.vv_count}`.padEnd(6) +
      `${p.total_beds}`.padEnd(7) +
      `${p.municipalities.length}`.padEnd(6) +
      p.management_firm.slice(0, 40)
    );
  }

  // Stats by island
  console.log('\n' + '-'.repeat(70));
  console.log('By Island:\n');

  const byIsland = new Map<string, { count: number; totalVV: number; totalBeds: number }>();
  for (const p of prospects) {
    for (const island of p.islands) {
      if (!byIsland.has(island)) {
        byIsland.set(island, { count: 0, totalVV: 0, totalBeds: 0 });
      }
      const stats = byIsland.get(island)!;
      stats.count++;
      stats.totalVV += p.vv_count;
      stats.totalBeds += p.total_beds;
    }
  }

  for (const [island, stats] of Array.from(byIsland.entries()).sort((a, b) => b[1].totalVV - a[1].totalVV)) {
    console.log(`  ${island}: ${stats.count} gestoras, ${stats.totalVV} VVs, ${stats.totalBeds} beds`);
  }

  // Top complexes (gestoras with high complex scores)
  console.log('\n' + '-'.repeat(70));
  console.log('Best Complex Clusters (highest complex scores):\n');

  const complexProspects = [...prospects]
    .filter(p => p.complex_score > 50)
    .sort((a, b) => b.complex_score - a.complex_score)
    .slice(0, 10);

  for (const p of complexProspects) {
    console.log(`  ${p.management_firm.slice(0, 35).padEnd(37)} ${p.vv_count} VVs in ${p.complexes.length} complexes`);
  }
}

async function main() {
  console.log('=== Top Gestora Prospects Export ===\n');

  const prospects = await fetchGestoraStats();

  if (prospects.length === 0) {
    console.log('No prospects found matching criteria');
    process.exit(0);
  }

  // Generate timestamp for filenames
  const timestamp = new Date().toISOString().slice(0, 10);
  const suffix = filterIsland ? `-${filterIsland.toLowerCase().replace(/\s+/g, '-')}` : '';

  // Export files
  exportToCSV(prospects, `top-prospects${suffix}-${timestamp}.csv`);
  exportToJSON(prospects, `top-prospects${suffix}-${timestamp}.json`);

  // Print summary
  printSummary(prospects);

  console.log('\n' + '='.repeat(70));
  console.log('Ready for outreach! Open the CSV in your spreadsheet app.');
  console.log('Click Map URL to view each gestora\'s properties on the map.');
  console.log('='.repeat(70));
}

main().catch(console.error);
