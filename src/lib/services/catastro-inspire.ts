/**
 * Catastro INSPIRE WFS Service
 * Fetches building footprint polygons for accurate roof area and orientation
 * API: https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx (Buildings)
 * Note: WFS 2.0 with EPSG:4326 uses lat/lon order for bbox
 */

// Building use codes from INSPIRE
export type BuildingUseCode =
  | 'residential'
  | 'agriculture'
  | 'industrial'
  | 'commerceAndServices'
  | 'office'
  | 'publicServices'
  | 'ancpiaryOrUtilities'
  | 'unknown';

export interface BuildingFootprint {
  status: 'success' | 'failed';
  roofAreaM2: number | null;
  orientationDegrees: number | null; // 0 = North, 90 = East, 180 = South, 270 = West
  orientationLabel: string | null;
  polygonCoordinates: [number, number][] | null; // [lon, lat] pairs
  buildingId: string | null;
  // Additional data from INSPIRE
  numberOfFloors: number | null;
  currentUse: BuildingUseCode | null;
  currentUseLabel: string | null;
  numberOfDwellings: number | null;
  buildingNature: string | null;
  // Inferred from cadastral reference
  address?: {
    province: string | null;
    municipality: string | null;
    cadastralReference: string | null;
  };
}

export interface BBoxBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface BBoxSearchResult {
  status: 'success' | 'partial' | 'failed';
  buildings: BuildingFootprint[];
  totalCount: number;
  truncated: boolean;
}

// GeoJSON types for WFS response
interface GeoJSONGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: [number, number][][] | [number, number][][][];
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry | null;
  properties: {
    reference?: string;
    [key: string]: unknown;
  } | null;
}

// Updated endpoint - the old spadgcwfs.aspx no longer exists
const WFS_BASE = 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx';
const WFS_TIMEOUT_MS = 15000;

// Catastro address lookup endpoint
const ADDRESS_API_BASE = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx';

// Nominatim (OpenStreetMap) reverse geocoding endpoint
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';

export interface CatastroAddress {
  streetType: string | null;  // Tipo de via (CL, AV, PZ, etc.)
  streetName: string | null;  // Nombre de via
  streetNumber: string | null; // Numero
  postalCode: string | null;
  municipality: string | null;
  province: string | null;
  fullAddress: string | null; // Formatted full address
  source: 'catastro' | 'nominatim'; // Which service provided the address
}

/**
 * Get address using Nominatim (OpenStreetMap) reverse geocoding
 * Uses coordinates to find the nearest address
 * Rate limit: 1 request per second (we're only calling on-demand so this is fine)
 */
export async function getAddressFromCoordinates(
  lon: number,
  lat: number
): Promise<CatastroAddress | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `${NOMINATIM_API}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AureonApp/1.0 (solar prospecting tool)',
      },
    });

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Nominatim returns address details in the 'address' object
    if (!data || !data.address) {
      console.log('Nominatim: No address found in response');
      return null;
    }

    const addr = data.address;

    // Get street name (could be in different fields)
    const streetName = addr.road || addr.pedestrian || addr.street || addr.path || null;

    // Use display_name as full address (already nicely formatted)
    const fullAddress = data.display_name || null;

    return {
      streetType: null, // Nominatim doesn't separate street type
      streetName: streetName,
      streetNumber: addr.house_number || null,
      postalCode: addr.postcode || null,
      municipality: addr.city || addr.town || addr.village || addr.municipality || null,
      province: addr.state || addr.province || null,
      fullAddress: fullAddress,
      source: 'nominatim',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Nominatim API timeout');
    } else {
      console.error('Nominatim API error:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get address from Catastro DNPRC service (fallback)
 * Uses cadastral reference to find address
 */
async function getAddressFromCatastro(
  cadastralReference: string
): Promise<CatastroAddress | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    // Use the first 14 characters (parcel reference)
    const rc = cadastralReference.substring(0, 14);

    const url = `${ADDRESS_API_BASE}/Consulta_DNPRC?RC=${encodeURIComponent(rc)}`;
    console.log('Catastro Address API URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Catastro Address API error: ${response.status}`);
      return null;
    }

    const xmlText = await response.text();

    // Check for error response
    if (xmlText.includes('<lerr>') || xmlText.includes('Error')) {
      console.log('Catastro Address API: No address found');
      return null;
    }

    // Parse the XML response
    const address = parseAddressResponse(xmlText);
    if (address) {
      address.source = 'catastro';
    }
    return address;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Catastro Address API timeout');
    } else {
      console.error('Catastro Address API error:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the full street address - tries Cartociudad first, then Catastro as fallback
 */
export async function getAddressFromCadastralReference(
  cadastralReference: string,
  coordinates?: [number, number][] | null // polygon coordinates [lon, lat]
): Promise<CatastroAddress | null> {
  // Try Cartociudad first if we have coordinates
  if (coordinates && coordinates.length > 0) {
    // Calculate centroid of the polygon
    const centroid = calculateCentroid(coordinates);
    const [lon, lat] = centroid;

    const cartociudadResult = await getAddressFromCoordinates(lon, lat);
    if (cartociudadResult?.fullAddress) {
      return cartociudadResult;
    }
  }

  // Fall back to Catastro
  return getAddressFromCatastro(cadastralReference);
}

/**
 * Parse the address XML response from Catastro
 */
function parseAddressResponse(xml: string): CatastroAddress | null {
  // Extract address components using regex (simple parsing for server-side)
  const extractTag = (tag: string): string | null => {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
    return match ? match[1].trim() || null : null;
  };

  // Try to extract from the ldt (localizacion) block
  const streetType = extractTag('tv') || extractTag('cv'); // tipo via
  const streetName = extractTag('nv'); // nombre via
  const streetNumber = extractTag('pnp') || extractTag('snp'); // numero
  const postalCode = extractTag('dp') || extractTag('cp'); // codigo postal
  const municipality = extractTag('nm') || extractTag('loine>.*?<nm'); // nombre municipio
  const province = extractTag('np'); // nombre provincia

  // Also try the ldt block for a pre-formatted address
  const ldtMatch = xml.match(/<ldt>([^<]+)<\/ldt>/i);
  const ldtAddress = ldtMatch ? ldtMatch[1].trim() : null;

  // Build the full address
  let fullAddress: string | null = null;

  if (ldtAddress) {
    fullAddress = ldtAddress;
  } else if (streetName) {
    const parts: string[] = [];
    if (streetType) parts.push(streetType);
    parts.push(streetName);
    if (streetNumber) parts.push(streetNumber);
    if (postalCode || municipality) {
      parts.push('-');
      if (postalCode) parts.push(postalCode);
      if (municipality) parts.push(municipality);
    }
    fullAddress = parts.join(' ');
  }

  if (!fullAddress) {
    return null;
  }

  return {
    streetType,
    streetName,
    streetNumber,
    postalCode,
    municipality,
    province,
    fullAddress,
    source: 'catastro',
  };
}

/**
 * Get building footprint from cadastral reference
 */
export async function getBuildingFootprint(cadastralReference: string): Promise<BuildingFootprint> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WFS_TIMEOUT_MS);

  try {
    // Use the first 14 characters (parcel reference) for the query
    const parcelRef = cadastralReference.substring(0, 14);

    // WFS GetFeature request for buildings using CQL filter
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'BU.Building',
      srsName: 'EPSG:4326',
      CQL_FILTER: `reference LIKE '${parcelRef}%'`,
    });

    const url = `${WFS_BASE}?${params}`;
    console.log('Catastro INSPIRE WFS URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Catastro INSPIRE WFS error: ${response.status}`);
      return createFailedResult();
    }

    const xmlText = await response.text();

    // Check for error or empty response
    if (xmlText.includes('ExceptionReport') || xmlText.includes('No records founded')) {
      console.log('Catastro INSPIRE: No building features found');
      return createFailedResult();
    }

    // Parse GML response - get first building
    const buildings = parseGMLBuildings(xmlText);

    if (buildings.length === 0) {
      console.log('Catastro INSPIRE: No building features parsed');
      return createFailedResult();
    }

    // Return the first building, update the ID if needed
    const building = buildings[0];
    if (!building.buildingId) {
      building.buildingId = cadastralReference;
    }

    return building;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Catastro INSPIRE WFS timeout');
    } else {
      console.error('Catastro INSPIRE WFS error:', error);
    }
    return createFailedResult();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get building footprint from coordinates (lat/lng)
 */
export async function getBuildingFootprintByCoordinates(
  latitude: number,
  longitude: number
): Promise<BuildingFootprint> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WFS_TIMEOUT_MS);

  try {
    // Create a small bounding box around the point (roughly 50m)
    const delta = 0.0005; // ~50m at equator
    // WFS 2.0 with EPSG:4326 uses lat/lon order: minLat,minLon,maxLat,maxLon
    const bbox = `${latitude - delta},${longitude - delta},${latitude + delta},${longitude + delta}`;

    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'BU.Building',
      srsName: 'EPSG:4326',
      bbox: bbox,
    });

    const url = `${WFS_BASE}?${params}`;
    console.log('Catastro INSPIRE WFS (by coords) URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Catastro INSPIRE WFS error: ${response.status}`);
      return createFailedResult();
    }

    const xmlText = await response.text();

    // Check for error or empty response
    if (xmlText.includes('ExceptionReport') || xmlText.includes('No records founded')) {
      console.log('Catastro INSPIRE: No building features found at coordinates');
      return createFailedResult();
    }

    // Parse GML response
    const buildings = parseGMLBuildings(xmlText);

    if (buildings.length === 0) {
      console.log('Catastro INSPIRE: No building features parsed at coordinates');
      return createFailedResult();
    }

    // Find the building that contains the point, or return the first one
    const targetBuilding = buildings.find(b => {
      if (!b.polygonCoordinates) return false;
      return isPointInRing(longitude, latitude, b.polygonCoordinates);
    }) || buildings[0];

    return targetBuilding;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Catastro INSPIRE WFS timeout');
    } else {
      console.error('Catastro INSPIRE WFS error:', error);
    }
    return createFailedResult();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the largest polygon from a MultiPolygon
 */
function getLargestPolygon(polygons: [number, number][][][]): [number, number][] {
  let largestArea = 0;
  let largestPolygon: [number, number][] = polygons[0][0];

  for (const polygon of polygons) {
    const exterior = polygon[0];
    const area = Math.abs(calculatePolygonArea(exterior));
    if (area > largestArea) {
      largestArea = area;
      largestPolygon = exterior;
    }
  }

  return largestPolygon;
}

/**
 * Calculate polygon area using the Shoelace formula
 * Coordinates are in [longitude, latitude] format (EPSG:4326)
 * Returns area in square meters (approximate, using haversine-based conversion)
 */
function calculatePolygonArea(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0;

  // Convert to local meters using the centroid as reference
  const centroid = calculateCentroid(coordinates);
  const cosLat = Math.cos((centroid[1] * Math.PI) / 180);

  // Meters per degree at this latitude
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * cosLat;

  // Convert coordinates to local meters
  const localCoords = coordinates.map(([lon, lat]) => [
    (lon - centroid[0]) * metersPerDegreeLon,
    (lat - centroid[1]) * metersPerDegreeLat,
  ]);

  // Shoelace formula for area
  let area = 0;
  for (let i = 0; i < localCoords.length - 1; i++) {
    area += localCoords[i][0] * localCoords[i + 1][1];
    area -= localCoords[i + 1][0] * localCoords[i][1];
  }

  return Math.abs(area) / 2;
}

/**
 * Calculate the centroid of a polygon
 */
function calculateCentroid(coordinates: [number, number][]): [number, number] {
  let sumLon = 0;
  let sumLat = 0;
  const n = coordinates.length;

  for (const [lon, lat] of coordinates) {
    sumLon += lon;
    sumLat += lat;
  }

  return [sumLon / n, sumLat / n];
}

/**
 * Calculate building orientation from the longest edge
 * Returns degrees from North (0 = North, 90 = East, 180 = South, 270 = West)
 */
function calculateOrientation(coordinates: [number, number][]): { degrees: number; label: string } {
  if (coordinates.length < 2) {
    return { degrees: 0, label: 'N' };
  }

  // Find the longest edge
  let longestEdgeLength = 0;
  let longestEdgeAngle = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    // Calculate edge length (approximate)
    const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
    const dy = lat2 - lat1;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > longestEdgeLength) {
      longestEdgeLength = length;
      // Calculate angle from North (0°)
      longestEdgeAngle = Math.atan2(dx, dy) * (180 / Math.PI);
    }
  }

  // Normalize to 0-360
  let degrees = longestEdgeAngle;
  if (degrees < 0) degrees += 360;

  // For roof orientation, we care about the perpendicular (roof faces)
  // Add 90° to get the direction the roof faces
  const roofFacing = (degrees + 90) % 360;

  // Get cardinal direction label
  const label = getCardinalDirection(roofFacing);

  return { degrees: Math.round(roofFacing), label };
}

/**
 * Get cardinal direction label from degrees
 */
function getCardinalDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

/**
 * Check if a point is inside a polygon (ray casting algorithm)
 */
function isPointInPolygon(x: number, y: number, geometry: any): boolean {
  let coordinates: [number, number][];

  if (geometry.type === 'MultiPolygon') {
    // Check all polygons
    for (const polygon of geometry.coordinates) {
      if (isPointInRing(x, y, polygon[0])) {
        return true;
      }
    }
    return false;
  } else if (geometry.type === 'Polygon') {
    coordinates = geometry.coordinates[0];
    return isPointInRing(x, y, coordinates);
  }

  return false;
}

function isPointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function createFailedResult(): BuildingFootprint {
  return {
    status: 'failed',
    roofAreaM2: null,
    orientationDegrees: null,
    orientationLabel: null,
    polygonCoordinates: null,
    buildingId: null,
    numberOfFloors: null,
    currentUse: null,
    currentUseLabel: null,
    numberOfDwellings: null,
    buildingNature: null,
  };
}

/**
 * Get all buildings within a bounding box
 * Used for area-based prospecting on the map
 * Note: WFS 2.0 with EPSG:4326 uses lat/lon order for bbox
 */
export async function getBuildingsInBBox(
  bounds: BBoxBounds,
  maxResults: number = 200
): Promise<BBoxSearchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for area queries

  try {
    // WFS 2.0 with EPSG:4326 uses lat/lon order: minLat,minLon,maxLat,maxLon
    const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'BU.Building',
      srsName: 'EPSG:4326',
      bbox: bbox,
      count: String(maxResults),
    });

    const url = `${WFS_BASE}?${params}`;
    console.log('Catastro INSPIRE WFS (BBox) URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Catastro INSPIRE WFS error: ${response.status}`);
      return { status: 'failed', buildings: [], totalCount: 0, truncated: false };
    }

    const xmlText = await response.text();

    // Check for HTML maintenance page or error response
    if (xmlText.trimStart().startsWith('<HTML') || xmlText.includes('INTERRUPCIÓN DEL SERVICIO')) {
      console.error('Catastro INSPIRE: Service unavailable (maintenance)');
      return { status: 'failed', buildings: [], totalCount: 0, truncated: false };
    }

    // Check for error response
    if (xmlText.includes('ExceptionReport') || xmlText.includes('No records founded')) {
      console.log('Catastro INSPIRE: No building features found in bbox');
      return { status: 'success', buildings: [], totalCount: 0, truncated: false };
    }

    // Parse GML response
    const buildings = parseGMLBuildings(xmlText);

    if (buildings.length === 0) {
      console.log('Catastro INSPIRE: No building features parsed from response');
      return { status: 'success', buildings: [], totalCount: 0, truncated: false };
    }

    // Check if results were truncated
    const truncated = buildings.length >= maxResults;

    return {
      status: truncated ? 'partial' : 'success',
      buildings,
      totalCount: buildings.length,
      truncated,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Catastro INSPIRE WFS timeout');
    } else {
      console.error('Catastro INSPIRE WFS error:', error);
    }
    return { status: 'failed', buildings: [], totalCount: 0, truncated: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Map INSPIRE currentUse codes to our internal types
 */
function mapCurrentUse(useCode: string | null): { code: BuildingUseCode; label: string } {
  if (!useCode) return { code: 'unknown', label: 'Desconocido' };

  const useMap: Record<string, { code: BuildingUseCode; label: string }> = {
    '1_residential': { code: 'residential', label: 'Residencial' },
    'residential': { code: 'residential', label: 'Residencial' },
    '2_agriculture': { code: 'agriculture', label: 'Agricola' },
    'agriculture': { code: 'agriculture', label: 'Agricola' },
    '3_industrial': { code: 'industrial', label: 'Industrial' },
    'industrial': { code: 'industrial', label: 'Industrial' },
    '4_1_office': { code: 'office', label: 'Oficinas' },
    'office': { code: 'office', label: 'Oficinas' },
    '4_2_retail': { code: 'commerceAndServices', label: 'Comercial' },
    '4_3_publicServices': { code: 'publicServices', label: 'Servicios publicos' },
    'commerceAndServices': { code: 'commerceAndServices', label: 'Comercial' },
    'publicServices': { code: 'publicServices', label: 'Servicios publicos' },
  };

  // Try exact match first
  if (useMap[useCode]) return useMap[useCode];

  // Try partial match
  const lowerCode = useCode.toLowerCase();
  if (lowerCode.includes('resident')) return { code: 'residential', label: 'Residencial' };
  if (lowerCode.includes('industr')) return { code: 'industrial', label: 'Industrial' };
  if (lowerCode.includes('office')) return { code: 'office', label: 'Oficinas' };
  if (lowerCode.includes('commerc') || lowerCode.includes('retail')) return { code: 'commerceAndServices', label: 'Comercial' };
  if (lowerCode.includes('agricul')) return { code: 'agriculture', label: 'Agricola' };

  return { code: 'unknown', label: 'Desconocido' };
}

/**
 * Extract address info from cadastral reference
 * BuildingId format: ES.SDGC.BU.0930731FS1503S (or just 0930731FS1503S)
 * Cadastral reference: First 2 digits = province, next 3 = municipality
 */
function parseAddressFromReference(reference: string | null): BuildingFootprint['address'] {
  // NOTE: Cadastral references are grid-based codes, NOT province+municipality codes.
  // The first digits do NOT correspond to INE province codes.
  // Province/municipality should come from actual Catastro API responses or address lookups,
  // not from parsing the reference number.
  return {
    province: null,
    municipality: null,
    cadastralReference: reference,
  };
}

/**
 * Parse GML response from Catastro WFS
 * Extracts building IDs, polygon coordinates, floors, and use
 */
function parseGMLBuildings(xml: string): BuildingFootprint[] {
  const buildings: BuildingFootprint[] = [];

  // Extract each Building element using regex (simple parser for server-side)
  const buildingRegex = /<bu-ext2d:Building[^>]*gml:id="([^"]+)"[^>]*>([\s\S]*?)<\/bu-ext2d:Building>/g;
  let match;

  while ((match = buildingRegex.exec(xml)) !== null) {
    const buildingId = match[1];
    const buildingXml = match[2];

    // Extract polygon coordinates from gml:posList
    const posListMatch = buildingXml.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    if (!posListMatch) continue;

    const posList = posListMatch[1].trim();
    const values = posList.split(/\s+/).map(Number);

    // posList is in lat/lon pairs for EPSG:4326
    const coordinates: [number, number][] = [];
    for (let i = 0; i < values.length - 1; i += 2) {
      const lat = values[i];
      const lon = values[i + 1];
      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates.push([lon, lat]); // Convert to [lon, lat] for consistency
      }
    }

    if (coordinates.length < 3) continue;

    const roofAreaM2 = calculatePolygonArea(coordinates);
    const { degrees, label } = calculateOrientation(coordinates);

    // Extract numberOfFloorsAboveGround
    const floorsMatch = buildingXml.match(/<bu-core2d:numberOfFloorsAboveGround>(\d+)<\/bu-core2d:numberOfFloorsAboveGround>/);
    const numberOfFloors = floorsMatch ? parseInt(floorsMatch[1], 10) : null;

    // Extract currentUse (may be in href or as text)
    let currentUseRaw: string | null = null;
    const useHrefMatch = buildingXml.match(/<bu-core2d:currentUse[^>]*href="[^"]*\/([^"\/]+)"[^>]*\/>/);
    const useTextMatch = buildingXml.match(/<bu-core2d:currentUse>([^<]+)<\/bu-core2d:currentUse>/);
    if (useHrefMatch) {
      currentUseRaw = useHrefMatch[1];
    } else if (useTextMatch) {
      currentUseRaw = useTextMatch[1];
    }
    const { code: currentUse, label: currentUseLabel } = mapCurrentUse(currentUseRaw);

    // Extract numberOfDwellings (for residential buildings)
    const dwellingsMatch = buildingXml.match(/<bu-core2d:numberOfDwellings>(\d+)<\/bu-core2d:numberOfDwellings>/);
    const numberOfDwellings = dwellingsMatch ? parseInt(dwellingsMatch[1], 10) : null;

    // Extract buildingNature
    const natureHrefMatch = buildingXml.match(/<bu-core2d:buildingNature[^>]*href="[^"]*\/([^"\/]+)"[^>]*\/>/);
    const buildingNature = natureHrefMatch ? natureHrefMatch[1] : null;

    // Parse address from reference
    const address = parseAddressFromReference(buildingId);

    buildings.push({
      status: 'success',
      roofAreaM2: Math.round(roofAreaM2 * 100) / 100,
      orientationDegrees: degrees,
      orientationLabel: label,
      polygonCoordinates: coordinates,
      buildingId,
      numberOfFloors,
      currentUse,
      currentUseLabel,
      numberOfDwellings,
      buildingNature,
      address,
    });
  }

  return buildings;
}

/**
 * Process a GeoJSON feature into a BuildingFootprint
 */
function processFeature(feature: GeoJSONFeature): BuildingFootprint {
  const geometry = feature.geometry;

  if (!geometry || (geometry.type !== 'MultiPolygon' && geometry.type !== 'Polygon')) {
    return createFailedResult();
  }

  let coordinates: [number, number][];
  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates as [number, number][][][];
    coordinates = getLargestPolygon(polygons);
  } else {
    coordinates = geometry.coordinates[0] as [number, number][];
  }

  const roofAreaM2 = calculatePolygonArea(coordinates);
  const { degrees, label } = calculateOrientation(coordinates);
  const buildingId = (feature.properties?.reference as string) || null;

  return {
    status: 'success',
    roofAreaM2: Math.round(roofAreaM2 * 100) / 100,
    orientationDegrees: degrees,
    orientationLabel: label,
    polygonCoordinates: coordinates,
    buildingId,
    numberOfFloors: null, // Not available in GeoJSON
    currentUse: null,
    currentUseLabel: null,
    numberOfDwellings: null,
    buildingNature: null,
    address: parseAddressFromReference(buildingId),
  };
}
