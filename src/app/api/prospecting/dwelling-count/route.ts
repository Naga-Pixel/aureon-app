import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Catastro Dwelling Count API
 *
 * Two-level lookup for reliability:
 * 1. Check local Supabase cache (from CAT file imports)
 * 2. Fall back to Catastro DNPRC API if not found
 *
 * The DNPRC "hack": Query with 14-char parcel reference, count the returned units.
 * Each unit has a unique 20-char reference (14 parcel + 4 unit + 2 control).
 */

const CATASTRO_API = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC';

// Initialize Supabase client (service role for write access)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

interface DwellingInfo {
  unitNumber: string;
  floor: string;
  door: string;
  fullReference: string;
}

interface DwellingCountResult {
  parcelReference: string;
  totalUnits: number;
  floors: number;
  unitsPerFloor: number;
  dwellings: DwellingInfo[];
  source: 'cache' | 'api';
  address?: {
    street: string;
    number: string;
    municipality: string;
    province: string;
    postalCode: string;
  };
}

/**
 * Check local Supabase cache for dwelling count
 */
async function checkCache(parcelRef: string): Promise<{ totalUnits: number; floors: number } | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('catastro_dwellings')
      .select('total_units, floors')
      .eq('ref_14', parcelRef)
      .single();

    if (error || !data) return null;

    return {
      totalUnits: data.total_units,
      floors: data.floors || 1,
    };
  } catch {
    return null;
  }
}

/**
 * Cache a successful API response in Supabase
 */
async function cacheResult(parcelRef: string, totalUnits: number, floors: number): Promise<void> {
  if (!supabase || totalUnits === 0) return;

  try {
    // Extract province code from parcel reference (first 2 digits after removing letters)
    // This is a rough heuristic - CAT file imports will have accurate codes
    const provinceCode = '35'; // Default to Las Palmas for now

    await supabase
      .from('catastro_dwellings')
      .upsert({
        ref_14: parcelRef,
        total_units: totalUnits,
        floors: floors || null,
        province_code: provinceCode,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'ref_14',
      });
  } catch (error) {
    console.error('[DwellingCount] Cache write failed:', error);
  }
}

/**
 * Check if a floor code represents a basement level
 * Spanish Catastro uses: ST, S0, S1, S2... for basement levels (garages, storage)
 */
function isBasementFloor(floor: string): boolean {
  return floor.startsWith('S');
}

/**
 * Fetch from Catastro DNPRC API
 */
async function fetchFromAPI(parcelRef: string): Promise<DwellingCountResult | null> {
  const url = `${CATASTRO_API}?Provincia=&Municipio=&RC=${encodeURIComponent(parcelRef)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/xml',
    },
  });

  if (!response.ok) {
    return null;
  }

  const xmlText = await response.text();

  // Check for errors
  if (xmlText.includes('<cuerr>1</cuerr>') && xmlText.includes('<lerr>')) {
    return null;
  }

  // Parse all units from XML
  const allUnits: DwellingInfo[] = [];
  const dwellingRegex = /<rcdnp>([\s\S]*?)<\/rcdnp>/g;
  let match;

  while ((match = dwellingRegex.exec(xmlText)) !== null) {
    const block = match[1];

    // Extract unit details
    const pc1Match = block.match(/<pc1>([^<]+)<\/pc1>/);
    const pc2Match = block.match(/<pc2>([^<]+)<\/pc2>/);
    const carMatch = block.match(/<car>([^<]+)<\/car>/);
    const cc1Match = block.match(/<cc1>([^<]+)<\/cc1>/);
    const cc2Match = block.match(/<cc2>([^<]+)<\/cc2>/);
    const ptMatch = block.match(/<pt>([^<]+)<\/pt>/);
    const puMatch = block.match(/<pu>([^<]+)<\/pu>/);

    if (carMatch) {
      allUnits.push({
        unitNumber: carMatch[1],
        floor: ptMatch ? ptMatch[1] : '00',
        door: puMatch ? puMatch[1] : '00',
        fullReference: `${pc1Match?.[1] || ''}${pc2Match?.[1] || ''}${carMatch[1]}${cc1Match?.[1] || ''}${cc2Match?.[1] || ''}`,
      });
    }
  }

  // Filter out basement units (garages, storage rooms)
  // Basement floors start with "S" (ST, S0, S1, S2...)
  const dwellings = allUnits.filter(d => !isBasementFloor(d.floor));
  const basementUnits = allUnits.length - dwellings.length;

  if (basementUnits > 0) {
    console.log(`[DwellingCount] Filtered out ${basementUnits} basement units (garages/storage)`);
  }

  // Calculate floors from above-ground units only
  const uniqueFloors = new Set(dwellings.map(d => d.floor));
  const floors = uniqueFloors.size;
  const totalUnits = dwellings.length;
  const unitsPerFloor = floors > 0 ? Math.round(totalUnits / floors) : 0;

  // Extract address from first dwelling
  let address: DwellingCountResult['address'] | undefined;
  const streetMatch = xmlText.match(/<nv>([^<]+)<\/nv>/);
  const numberMatch = xmlText.match(/<pnp>([^<]+)<\/pnp>/);
  const municipalityMatch = xmlText.match(/<nm>([^<]+)<\/nm>/);
  const provinceMatch = xmlText.match(/<np>([^<]+)<\/np>/);
  const postalMatch = xmlText.match(/<dp>([^<]+)<\/dp>/);
  const streetTypeMatch = xmlText.match(/<tv>([^<]+)<\/tv>/);

  if (streetMatch) {
    address = {
      street: `${streetTypeMatch?.[1] || ''} ${streetMatch[1]}`.trim(),
      number: numberMatch?.[1] || '',
      municipality: municipalityMatch?.[1] || '',
      province: provinceMatch?.[1] || '',
      postalCode: postalMatch?.[1] || '',
    };
  }

  return {
    parcelReference: parcelRef,
    totalUnits,
    floors,
    unitsPerFloor,
    dwellings: dwellings.slice(0, 50), // Limit to 50 for response size
    source: 'api',
    address,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ref = searchParams.get('ref');

  if (!ref) {
    return NextResponse.json({ error: 'Missing ref parameter' }, { status: 400 });
  }

  // Extract 14-char parcel reference from various formats
  // Could be: "ES.SDGC.BU.1329303FS1512N" or "1329303FS1512N" or "1329303FS1512N0001YT"
  let parcelRef = ref;

  // Remove ES.SDGC.BU. prefix if present
  if (parcelRef.includes('.')) {
    const parts = parcelRef.split('.');
    parcelRef = parts[parts.length - 1];
  }

  // Take first 14 characters (parcel reference)
  parcelRef = parcelRef.substring(0, 14);

  if (parcelRef.length !== 14) {
    return NextResponse.json({
      error: 'Invalid reference format. Need 14-character parcel reference.',
      received: parcelRef,
      length: parcelRef.length
    }, { status: 400 });
  }

  try {
    // 1. Check local cache first (fast, reliable)
    const cached = await checkCache(parcelRef);
    if (cached && cached.totalUnits > 0) {
      console.log(`[DwellingCount] Cache hit for ${parcelRef}: ${cached.totalUnits} units`);
      return NextResponse.json({
        parcelReference: parcelRef,
        totalUnits: cached.totalUnits,
        floors: cached.floors,
        unitsPerFloor: cached.floors > 0 ? Math.round(cached.totalUnits / cached.floors) : 0,
        dwellings: [], // Not stored in cache
        source: 'cache',
      });
    }

    // 2. Fall back to DNPRC API
    console.log(`[DwellingCount] Cache miss for ${parcelRef}, fetching from API...`);
    const result = await fetchFromAPI(parcelRef);

    if (!result) {
      return NextResponse.json({
        error: 'Parcel not found',
        parcelReference: parcelRef,
        totalUnits: 0
      }, { status: 404 });
    }

    // 3. Cache successful result for next time
    await cacheResult(parcelRef, result.totalUnits, result.floors);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Dwelling count API error:', error);
    return NextResponse.json({
      error: 'Failed to fetch dwelling count',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
