/**
 * Spanish Catastro API Service
 * Free public API - no registration or API key required
 * Documentation: https://www.catastro.meh.es/ws/Webservices_Libres.pdf
 */

export interface CatastroResult {
  status: 'success' | 'failed';
  cadastralReference: string | null;
  address: string | null;
  buildingAreaM2: number | null;
  plotAreaM2: number | null;
  buildingUse: string | null;
  yearBuilt: number | null;
  province: string | null;
  municipality: string | null;
  numberOfFloors: number | null;
}

interface CatastroCoordinatesResponse {
  consulta_coordenadas?: {
    coordenadas?: {
      coord?: {
        pc?: {
          pc1?: string;
          pc2?: string;
        };
        ldt?: string;
      };
    };
  };
}

interface CatastroDNPResponse {
  consulta_dnp?: {
    bico?: {
      bi?: {
        debi?: {
          sfc?: string; // Built surface
          ant?: string; // Year built
          luso?: string; // Use
        };
      };
      lcons?: {
        cons?: Array<{
          dfcons?: {
            stl?: string; // Surface per floor
          };
        }> | {
          dfcons?: {
            stl?: string;
          };
        };
      };
    };
    inmueble?: {
      loine?: {
        cp?: string; // Province code
        cm?: string; // Municipality code
      };
      dt?: {
        np?: string; // Province name
        nm?: string; // Municipality name
        locs?: {
          lous?: {
            lourb?: {
              dp?: string; // Postal code
              dir?: {
                tv?: string; // Street type
                nv?: string; // Street name
                pnp?: string; // Number
              };
            };
          };
        };
      };
    };
  };
}

/**
 * Get cadastral reference from coordinates (lat/lng)
 */
export async function getCadastralFromCoordinates(
  latitude: number,
  longitude: number
): Promise<{ reference: string | null; address: string | null }> {
  try {
    const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${longitude}&Coordenada_Y=${latitude}`;

    const response = await fetch(url);
    if (!response.ok) {
      return { reference: null, address: null };
    }

    const text = await response.text();

    // Parse XML response
    const pc1Match = text.match(/<pc1>([^<]+)<\/pc1>/);
    const pc2Match = text.match(/<pc2>([^<]+)<\/pc2>/);
    const ldtMatch = text.match(/<ldt>([^<]+)<\/ldt>/);

    if (pc1Match && pc2Match) {
      const baseReference = pc1Match[1] + pc2Match[1];
      const address = ldtMatch ? ldtMatch[1] : null;

      // Check if this is a rural parcel (starts with numbers + A) vs urban building
      // Rural parcels like "35002A00109084" don't have building data
      if (baseReference.match(/^\d+A\d/)) {
        console.log('Catastro: Rural parcel detected, no building data available');
        return { reference: null, address };
      }

      // Get full reference by querying property list
      const fullReference = await getFullCadastralReference(baseReference);

      return { reference: fullReference || baseReference, address };
    }

    return { reference: null, address: null };
  } catch (error) {
    console.error('Catastro coordinates lookup error:', error);
    return { reference: null, address: null };
  }
}

/**
 * Get full 20-char cadastral reference from base 14-char reference
 * This queries the property list and returns the first/largest property
 */
async function getFullCadastralReference(baseReference: string): Promise<string | null> {
  try {
    const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${baseReference}`;

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const text = await response.text();

    // Find all properties and extract their full references
    // Match pattern: <pc1>...</pc1><pc2>...</pc2><car>...</car><cc1>...</cc1><cc2>...</cc2>
    const rcPattern = /<rc>\s*<pc1>([^<]+)<\/pc1>\s*<pc2>([^<]+)<\/pc2>\s*<car>([^<]+)<\/car>\s*<cc1>([^<]+)<\/cc1>\s*<cc2>([^<]+)<\/cc2>\s*<\/rc>/g;

    const matches = [...text.matchAll(rcPattern)];

    if (matches.length > 0) {
      // Return the first property's full reference
      const [, pc1, pc2, car, cc1, cc2] = matches[0];
      return `${pc1}${pc2}${car}${cc1}${cc2}`;
    }

    return null;
  } catch (error) {
    console.error('Catastro full reference lookup error:', error);
    return null;
  }
}

/**
 * Get building data from cadastral reference
 */
export async function getBuildingDataFromReference(
  cadastralReference: string
): Promise<CatastroResult> {
  try {
    let referenceToUse = cadastralReference;

    // If we have a 14-char reference (base), we need to get the full 20-char reference first
    // The 14-char reference returns a property list, not detailed building data
    if (cadastralReference.length === 14) {
      console.log('Catastro: Got 14-char reference, fetching full reference...');
      const fullReference = await getFullCadastralReference(cadastralReference);
      if (fullReference) {
        referenceToUse = fullReference;
        console.log('Catastro: Using full reference:', referenceToUse);
      }
    }

    const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${referenceToUse}`;

    console.log('Catastro API URL:', url);

    const response = await fetch(url);
    if (!response.ok) {
      console.log('Catastro API response not OK:', response.status);
      return createFailedResult();
    }

    const text = await response.text();
    console.log('Catastro API response length:', text.length);

    // Check if we have a bico (full property data) response
    const hasBico = text.includes('<bico>');
    console.log('Has bico data:', hasBico);

    // Parse XML response for building data
    // Surface constructed (sfc) - inside <debi> when using full reference
    const sfcMatch = text.match(/<sfc>([^<]+)<\/sfc>/);
    // Year built (ant)
    const antMatch = text.match(/<ant>([^<]+)<\/ant>/);
    // Use (luso) - can be text like "Residencial" or code
    const lusoMatch = text.match(/<luso>([^<]+)<\/luso>/);
    // Province (np)
    const npMatch = text.match(/<np>([^<]+)<\/np>/);
    // Municipality (nm)
    const nmMatch = text.match(/<nm>([^<]+)<\/nm>/);
    // Full address (ldt)
    const ldtMatch = text.match(/<ldt>([^<]+)<\/ldt>/);
    // Address parts
    const nvMatch = text.match(/<nv>([^<]+)<\/nv>/);
    const pnpMatch = text.match(/<pnp>([^<]+)<\/pnp>/);
    const tvMatch = text.match(/<tv>([^<]+)<\/tv>/);

    // Also try to get total surface from lcons (construction details)
    const stlMatches = text.match(/<stl>([^<]+)<\/stl>/g);
    let totalSurface = 0;
    if (stlMatches) {
      stlMatches.forEach(match => {
        const value = match.match(/<stl>([^<]+)<\/stl>/);
        if (value) {
          totalSurface += parseFloat(value[1]) || 0;
        }
      });
    }

    // Extract number of floors from lcons entries
    // Each <cons> element with <lcd> (floor description) represents a floor level
    // Common patterns: "PLANTA 1", "PLANTA BAJA", "SOTANO", etc.
    const lcdMatches = text.match(/<lcd>([^<]+)<\/lcd>/g);
    let numberOfFloors: number | null = null;

    if (lcdMatches) {
      // Count unique above-ground floors (exclude SOTANO/basement)
      const floorDescriptions = new Set<string>();
      lcdMatches.forEach(match => {
        const value = match.match(/<lcd>([^<]+)<\/lcd>/)?.[1];
        if (value && !value.includes('SOTANO') && !value.includes('SEMISOTANO')) {
          floorDescriptions.add(value);
        }
      });
      numberOfFloors = floorDescriptions.size > 0 ? floorDescriptions.size : null;
    }

    // Fallback: estimate floors from stl count if we have building area
    if (!numberOfFloors && stlMatches && stlMatches.length > 1) {
      // Each stl typically represents a floor's surface
      numberOfFloors = stlMatches.length;
    }

    console.log('Catastro parsed - sfc:', sfcMatch?.[1], 'totalSurface:', totalSurface, 'floors:', numberOfFloors);

    const buildingAreaM2 = sfcMatch
      ? parseFloat(sfcMatch[1])
      : (totalSurface > 0 ? totalSurface : null);

    if (!buildingAreaM2) {
      console.log('Catastro: No building area found');
      return createFailedResult();
    }

    // Build address string - prefer ldt if available
    let address = ldtMatch ? ldtMatch[1] : '';
    if (!address && tvMatch && nvMatch) {
      address = `${tvMatch[1]} ${nvMatch[1]}`;
      if (pnpMatch) {
        address += ` ${pnpMatch[1]}`;
      }
      if (nmMatch) {
        address += `, ${nmMatch[1]}`;
      }
      if (npMatch) {
        address += `, ${npMatch[1]}`;
      }
    }

    // Translate building use - handle both codes and full text
    let buildingUse = null;
    if (lusoMatch) {
      const lusoValue = lusoMatch[1];
      // If it's a single letter code, translate it; otherwise use as-is
      buildingUse = lusoValue.length === 1 ? translateBuildingUse(lusoValue) : lusoValue;
    }

    console.log('Catastro success - area:', buildingAreaM2, 'use:', buildingUse);

    return {
      status: 'success',
      cadastralReference,
      address: address || null,
      buildingAreaM2,
      plotAreaM2: null,
      buildingUse,
      yearBuilt: antMatch ? parseInt(antMatch[1], 10) : null,
      province: npMatch ? npMatch[1] : null,
      municipality: nmMatch ? nmMatch[1] : null,
      numberOfFloors,
    };
  } catch (error) {
    console.error('Catastro building data error:', error);
    return createFailedResult();
  }
}

/**
 * Main function: Get building data from coordinates
 * Combines both API calls into one convenient function
 */
export async function getCatastroData(
  latitude: number,
  longitude: number
): Promise<CatastroResult> {
  // Step 1: Get cadastral reference from coordinates
  const { reference, address: coordAddress } = await getCadastralFromCoordinates(latitude, longitude);

  if (!reference) {
    return createFailedResult();
  }

  // Step 2: Get building data from cadastral reference
  const buildingData = await getBuildingDataFromReference(reference);

  // If we got address from coordinates but not from building data, use it
  if (buildingData.status === 'success' && !buildingData.address && coordAddress) {
    buildingData.address = coordAddress;
  }

  return buildingData;
}

function createFailedResult(): CatastroResult {
  return {
    status: 'failed',
    cadastralReference: null,
    address: null,
    buildingAreaM2: null,
    plotAreaM2: null,
    buildingUse: null,
    yearBuilt: null,
    province: null,
    municipality: null,
    numberOfFloors: null,
  };
}

function translateBuildingUse(code: string): string {
  const uses: Record<string, string> = {
    'A': 'Almacén',
    'V': 'Vivienda',
    'C': 'Comercial',
    'I': 'Industrial',
    'O': 'Oficinas',
    'T': 'Turístico',
    'G': 'Garaje',
    'Y': 'Sanidad',
    'E': 'Educación',
    'R': 'Religioso',
    'M': 'Obras de urbanización',
    'P': 'Edificio singular',
    'B': 'Almacén agrario',
    'J': 'Industrial agrario',
    'Z': 'Agrario',
  };
  return uses[code] || code;
}
