import { NextRequest, NextResponse } from 'next/server';

/**
 * Catastro Dwelling Count API
 *
 * Uses the Catastro DNPRC (Datos No Protegidos por Referencia Catastral) API
 * to get the exact number of dwellings/units in a building.
 *
 * The "hack": Query with 14-char parcel reference, count the returned units.
 * Each unit has a unique 20-char reference (14 parcel + 4 unit + 2 control).
 */

const CATASTRO_API = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC';

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
  address?: {
    street: string;
    number: string;
    municipality: string;
    province: string;
    postalCode: string;
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
    const url = `${CATASTRO_API}?Provincia=&Municipio=&RC=${encodeURIComponent(parcelRef)}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xml',
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        error: 'Catastro API error',
        status: response.status
      }, { status: 502 });
    }

    const xmlText = await response.text();

    // Check for errors
    if (xmlText.includes('<cuerr>1</cuerr>') && xmlText.includes('<lerr>')) {
      const errorMatch = xmlText.match(/<des>([^<]+)<\/des>/);
      return NextResponse.json({
        error: errorMatch ? errorMatch[1] : 'Catastro API error',
        parcelReference: parcelRef,
        totalUnits: 0
      }, { status: 404 });
    }

    // Parse dwelling count from <cudnp>
    const countMatch = xmlText.match(/<cudnp>(\d+)<\/cudnp>/);
    const totalUnits = countMatch ? parseInt(countMatch[1], 10) : 0;

    // Parse individual dwellings
    const dwellings: DwellingInfo[] = [];
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
        dwellings.push({
          unitNumber: carMatch[1],
          floor: ptMatch ? ptMatch[1] : '00',
          door: puMatch ? puMatch[1] : '00',
          fullReference: `${pc1Match?.[1] || ''}${pc2Match?.[1] || ''}${carMatch[1]}${cc1Match?.[1] || ''}${cc2Match?.[1] || ''}`,
        });
      }
    }

    // Calculate floors (unique floor values)
    const uniqueFloors = new Set(dwellings.map(d => d.floor));
    const floors = uniqueFloors.size;
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

    const result: DwellingCountResult = {
      parcelReference: parcelRef,
      totalUnits,
      floors,
      unitsPerFloor,
      dwellings: dwellings.slice(0, 50), // Limit to 50 for response size
      address,
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Dwelling count API error:', error);
    return NextResponse.json({
      error: 'Failed to fetch dwelling count',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
