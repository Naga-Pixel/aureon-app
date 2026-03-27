/**
 * Smart BDNS processing - extracts location from multiple sources:
 * 1. Municipality-specific programs (from program title)
 * 2. Cabildo/island-level programs (island centroids)
 * 3. Hotel/apartment companies (OSM lookup)
 */

import { readFile, writeFile } from 'fs/promises';

interface Grant {
  cif: string;
  companyName: string;
  codigoBdns: string;
  codigoConcesion: string;
  convocatoria: string;
  organo: string;
  fechaConcesion: string;
  importe: number;
}

interface ProcessedGrant extends Grant {
  latitude?: number;
  longitude?: number;
  municipality?: string;
  island?: string;
  locationType: 'exact' | 'municipality' | 'island' | 'unknown';
  source: string;
}

// Island centroids for island-level aggregation
const ISLAND_CENTROIDS: Record<string, { lat: number; lon: number; name: string }> = {
  'GRAN CANARIA': { lat: 27.9545, lon: -15.5932, name: 'Gran Canaria' },
  'TENERIFE': { lat: 28.2916, lon: -16.6291, name: 'Tenerife' },
  'LANZAROTE': { lat: 29.0469, lon: -13.6319, name: 'Lanzarote' },
  'FUERTEVENTURA': { lat: 28.3587, lon: -14.0537, name: 'Fuerteventura' },
  'LA PALMA': { lat: 28.6835, lon: -17.7642, name: 'La Palma' },
  'LA GOMERA': { lat: 28.0916, lon: -17.1133, name: 'La Gomera' },
  'EL HIERRO': { lat: 27.7406, lon: -18.0237, name: 'El Hierro' },
};

// Municipality centroids for known municipalities
const MUNICIPALITY_CENTROIDS: Record<string, { lat: number; lon: number; island: string }> = {
  'BREÑA BAJA': { lat: 28.6147, lon: -17.7797, island: 'La Palma' },
  'VILLA DE MAZO': { lat: 28.6053, lon: -17.7833, island: 'La Palma' },
  'AGÜIMES': { lat: 27.9061, lon: -15.4458, island: 'Gran Canaria' },
  'FRONTERA': { lat: 27.7523, lon: -18.0156, island: 'El Hierro' },
};

// Keywords to identify island from program title or granting body
function extractIsland(text: string): string | null {
  const upper = text.toUpperCase();

  if (upper.includes('GRAN CANARIA')) return 'GRAN CANARIA';
  if (upper.includes('TENERIFE')) return 'TENERIFE';
  if (upper.includes('LANZAROTE') || upper.includes('LA GRACIOSA')) return 'LANZAROTE';
  if (upper.includes('FUERTEVENTURA')) return 'FUERTEVENTURA';
  if (upper.includes('LA PALMA') || upper.includes('BREÑA') || upper.includes('MAZO')) return 'LA PALMA';
  if (upper.includes('LA GOMERA') || upper.includes('GOMERA')) return 'LA GOMERA';
  if (upper.includes('EL HIERRO') || upper.includes('HIERRO') || upper.includes('FRONTERA')) return 'EL HIERRO';

  return null;
}

// Keywords to identify municipality from program title
function extractMunicipality(text: string): string | null {
  const upper = text.toUpperCase();

  for (const muni of Object.keys(MUNICIPALITY_CENTROIDS)) {
    if (upper.includes(muni)) return muni;
  }

  return null;
}

// Check if company is likely findable in OSM
function isLikelyInOSM(companyName: string): boolean {
  const keywords = [
    'hotel', 'apartamento', 'villa', 'resort', 'hostal',
    'restaurante', 'bodega', 'granja', 'finca',
  ];
  const lower = companyName.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function lookupOSM(companyName: string, island?: string): Promise<{ lat: number; lon: number } | null> {
  const cleanName = companyName
    .replace(/\bS\.?L\.?U?\.?\b/gi, '')
    .replace(/\bS\.?A\.?\b/gi, '')
    .replace(/\bS\.?C\.?P\.?\b/gi, '')
    .replace(/,/g, '')
    .trim();

  const location = island ? `${island} Canarias` : 'Canarias';
  const query = `${cleanName} ${location} España`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=es`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AureonApp/1.0' }
    });

    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (e) {
    // Ignore errors
  }

  return null;
}

async function processGrants(inputPath: string, outputPath: string) {
  const inputData = JSON.parse(await readFile(inputPath, 'utf-8'));
  const grants: Grant[] = inputData.grants;

  console.log(`Processing ${grants.length} grants...`);

  const processed: ProcessedGrant[] = [];
  let exactCount = 0;
  let muniCount = 0;
  let islandCount = 0;
  let unknownCount = 0;

  for (const grant of grants) {
    const result: ProcessedGrant = {
      ...grant,
      locationType: 'unknown',
      source: '',
    };

    // 1. Try to extract municipality from program title
    const municipality = extractMunicipality(grant.convocatoria);
    if (municipality && MUNICIPALITY_CENTROIDS[municipality]) {
      const coords = MUNICIPALITY_CENTROIDS[municipality];
      result.latitude = coords.lat;
      result.longitude = coords.lon;
      result.municipality = municipality;
      result.island = coords.island;
      result.locationType = 'municipality';
      result.source = 'program_title';
      muniCount++;
      processed.push(result);
      continue;
    }

    // 2. Try to extract island from granting body or program
    const island = extractIsland(grant.organo) || extractIsland(grant.convocatoria);
    if (island && ISLAND_CENTROIDS[island]) {
      const coords = ISLAND_CENTROIDS[island];
      result.latitude = coords.lat;
      result.longitude = coords.lon;
      result.island = coords.name;
      result.locationType = 'island';
      result.source = 'cabildo';
      islandCount++;
      processed.push(result);
      continue;
    }

    // 3. For hotel/apartment companies, try OSM lookup
    if (isLikelyInOSM(grant.companyName)) {
      console.log(`Looking up: ${grant.companyName}`);
      const coords = await lookupOSM(grant.companyName, island || undefined);
      if (coords) {
        result.latitude = coords.lat;
        result.longitude = coords.lon;
        result.locationType = 'exact';
        result.source = 'osm';
        exactCount++;
        processed.push(result);
        await sleep(1100); // Rate limit
        continue;
      }
      await sleep(1100);
    }

    // 4. Unknown - still include but without location
    unknownCount++;
    result.source = 'none';
    processed.push(result);
  }

  // Summary
  console.log(`\n=== Processing Complete ===`);
  console.log(`Total grants: ${grants.length}`);
  console.log(`Exact locations (OSM): ${exactCount}`);
  console.log(`Municipality-level: ${muniCount}`);
  console.log(`Island-level: ${islandCount}`);
  console.log(`Unknown: ${unknownCount}`);
  console.log(`Total with location: ${exactCount + muniCount + islandCount}`);

  // Filter to only those with locations
  const withLocation = processed.filter(p => p.latitude && p.longitude);

  const output = {
    processedAt: new Date().toISOString(),
    summary: {
      total: grants.length,
      exact: exactCount,
      municipality: muniCount,
      island: islandCount,
      unknown: unknownCount,
      withLocation: withLocation.length,
    },
    grants: withLocation,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput: ${outputPath}`);
}

const inputPath = process.argv[2] || 'data/bdns-solar-grants.json';
const outputPath = process.argv[3] || 'data/bdns-solar-grants-processed.json';

processGrants(inputPath, outputPath).catch(console.error);
