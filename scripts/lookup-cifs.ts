/**
 * Lookup company addresses by CIF using multiple sources
 *
 * Usage: npx tsx scripts/lookup-cifs.ts <input-json> <output-json>
 *
 * Sources (in order of preference):
 * 1. Infocif (free tier - limited)
 * 2. Google Places API (requires key)
 * 3. Nominatim geocoding (fallback)
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

interface LookupResult {
  cif: string;
  companyName: string;
  address?: string;
  municipality?: string;
  province?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  error?: string;
}

// Rate limiting
const DELAY_MS = 1000; // 1 second between requests
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Try to find company location using Nominatim (OpenStreetMap)
 * Search by company name + "Canarias"
 */
async function lookupViaNominatim(
  companyName: string
): Promise<LookupResult | null> {
  try {
    // Clean company name for search
    const cleanName = companyName
      .replace(/\bS\.?L\.?U?\.?\b/gi, '')
      .replace(/\bS\.?A\.?\b/gi, '')
      .replace(/\bS\.?C\.?P\.?\b/gi, '')
      .replace(/,/g, '')
      .trim();

    const query = `${cleanName} Canarias España`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=es`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AureonApp/1.0 (solar-grants-lookup)',
      },
    });

    if (!response.ok) return null;

    const results = await response.json();
    if (results.length === 0) return null;

    const result = results[0];

    return {
      cif: '',
      companyName,
      address: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      source: 'nominatim',
    };
  } catch (error) {
    console.error(`Nominatim error for ${companyName}:`, error);
    return null;
  }
}

/**
 * Try to find company via Google Places (if API key available)
 */
async function lookupViaGooglePlaces(
  companyName: string,
  apiKey: string
): Promise<LookupResult | null> {
  if (!apiKey) return null;

  try {
    const query = `${companyName} Canarias`;
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=formatted_address,geometry,name&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'OK' || !data.candidates?.length) return null;

    const place = data.candidates[0];

    return {
      cif: '',
      companyName,
      address: place.formatted_address,
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
      source: 'google_places',
    };
  } catch (error) {
    console.error(`Google Places error for ${companyName}:`, error);
    return null;
  }
}

/**
 * Parse Canarias address to extract municipality
 */
function parseMunicipality(address: string): {
  municipality?: string;
  province?: string;
  postalCode?: string;
} {
  // Common Canarias municipalities
  const municipalities = [
    'Las Palmas de Gran Canaria',
    'Santa Cruz de Tenerife',
    'La Laguna',
    'Telde',
    'Arona',
    'Santa Lucía de Tirajana',
    'San Bartolomé de Tirajana',
    'Arrecife',
    'Puerto del Rosario',
    'Adeje',
    'Granadilla de Abona',
    'La Orotava',
    'Ingenio',
    'Agüimes',
    'Puerto de la Cruz',
    'Los Realejos',
    'Mogán',
    'San Cristóbal de La Laguna',
    'Arucas',
    'Gáldar',
    'Tacoronte',
    'Güímar',
    'Candelaria',
    'El Rosario',
    'Icod de los Vinos',
    'Los Llanos de Aridane',
    'San Miguel de Abona',
    'Yaiza',
    'Tías',
    'Antigua',
    'La Oliva',
    'Pájara',
    'Betancuria',
    'Tuineje',
    'San Sebastián de La Gomera',
    'Valverde',
    'Breña Baja',
    'Villa de Mazo',
  ];

  let municipality: string | undefined;
  let province: string | undefined;

  // Check for municipality in address
  for (const muni of municipalities) {
    if (address.toLowerCase().includes(muni.toLowerCase())) {
      municipality = muni;
      break;
    }
  }

  // Determine province
  if (
    address.includes('Las Palmas') ||
    address.includes('Gran Canaria') ||
    address.includes('Fuerteventura') ||
    address.includes('Lanzarote')
  ) {
    province = 'Las Palmas';
  } else if (
    address.includes('Santa Cruz') ||
    address.includes('Tenerife') ||
    address.includes('La Palma') ||
    address.includes('La Gomera') ||
    address.includes('El Hierro')
  ) {
    province = 'Santa Cruz de Tenerife';
  }

  // Extract postal code
  const postalMatch = address.match(/\b(35|38)\d{3}\b/);
  const postalCode = postalMatch?.[0];

  return { municipality, province, postalCode };
}

async function lookupCIFs(inputPath: string, outputPath: string) {
  const inputData = JSON.parse(await readFile(inputPath, 'utf-8'));
  const grants: Grant[] = inputData.grants;
  const cifsToLookup: string[] = inputData.cifsToLookup;

  console.log(`Loaded ${grants.length} grants with ${cifsToLookup.length} unique CIFs`);

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  if (googleApiKey) {
    console.log('Google Places API key found');
  }

  const results: LookupResult[] = [];
  const cifLocations = new Map<string, LookupResult>();

  // Lookup each unique CIF
  let lookupCount = 0;
  let foundCount = 0;

  for (const cif of cifsToLookup) {
    const grant = grants.find((g) => g.cif === cif);
    if (!grant) continue;

    lookupCount++;
    console.log(
      `[${lookupCount}/${cifsToLookup.length}] Looking up ${cif} - ${grant.companyName}`
    );

    // Try Google Places first (if available)
    let result = await lookupViaGooglePlaces(grant.companyName, googleApiKey);

    // Fall back to Nominatim
    if (!result) {
      await sleep(DELAY_MS); // Rate limit
      result = await lookupViaNominatim(grant.companyName);
    }

    if (result && result.latitude && result.longitude) {
      result.cif = cif;
      const parsed = parseMunicipality(result.address || '');
      result.municipality = parsed.municipality;
      result.province = parsed.province;
      result.postalCode = parsed.postalCode;

      cifLocations.set(cif, result);
      foundCount++;
      console.log(`  ✓ Found: ${result.municipality || result.address?.slice(0, 50)}`);
    } else {
      console.log(`  ✗ Not found`);
    }

    // Progress save every 50
    if (lookupCount % 50 === 0) {
      const tempOutput = {
        processedAt: new Date().toISOString(),
        progress: `${lookupCount}/${cifsToLookup.length}`,
        foundCount,
        cifLocations: Object.fromEntries(cifLocations),
      };
      await writeFile(outputPath + '.progress.json', JSON.stringify(tempOutput, null, 2));
    }

    await sleep(DELAY_MS);
  }

  // Build final results - merge grant data with locations
  for (const grant of grants) {
    const location = cifLocations.get(grant.cif);

    results.push({
      cif: grant.cif,
      companyName: grant.companyName,
      address: location?.address,
      municipality: location?.municipality,
      province: location?.province,
      postalCode: location?.postalCode,
      latitude: location?.latitude,
      longitude: location?.longitude,
      source: location?.source,
      ...grant,
    } as LookupResult & Grant);
  }

  // Write output
  const output = {
    processedAt: new Date().toISOString(),
    totalGrants: grants.length,
    uniqueCIFs: cifsToLookup.length,
    foundLocations: foundCount,
    successRate: `${((foundCount / cifsToLookup.length) * 100).toFixed(1)}%`,
    results,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n=== Summary ===`);
  console.log(`Total grants: ${grants.length}`);
  console.log(`Unique CIFs: ${cifsToLookup.length}`);
  console.log(`Found locations: ${foundCount} (${output.successRate})`);
  console.log(`Output: ${outputPath}`);
}

// Main
const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'data/bdns-solar-grants-geocoded.json';

if (!inputPath) {
  console.error(
    'Usage: npx tsx scripts/lookup-cifs.ts <input-json> [output-json]'
  );
  console.error('  Set GOOGLE_PLACES_API_KEY env var for better results');
  process.exit(1);
}

lookupCIFs(inputPath, outputPath).catch(console.error);
