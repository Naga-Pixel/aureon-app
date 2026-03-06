/**
 * Catastro INSPIRE WFS Service
 * Fetches building footprint polygons for accurate roof area and orientation
 * API: https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwfs.aspx
 */

export interface BuildingFootprint {
  status: 'success' | 'failed';
  roofAreaM2: number | null;
  orientationDegrees: number | null; // 0 = North, 90 = East, 180 = South, 270 = West
  orientationLabel: string | null;
  polygonCoordinates: [number, number][] | null;
  buildingId: string | null;
}

const WFS_BASE = 'https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwfs.aspx';
const WFS_TIMEOUT_MS = 15000;

/**
 * Get building footprint from cadastral reference
 */
export async function getBuildingFootprint(cadastralReference: string): Promise<BuildingFootprint> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WFS_TIMEOUT_MS);

  try {
    // Use the first 14 characters (parcel reference) for the query
    const parcelRef = cadastralReference.substring(0, 14);

    // WFS GetFeature request for buildings
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'BU.Building',
      srsName: 'EPSG:4326',
      outputFormat: 'application/json',
      CQL_FILTER: `reference LIKE '${parcelRef}%'`,
    });

    const url = `${WFS_BASE}?${params}`;
    console.log('Catastro INSPIRE WFS URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Catastro INSPIRE WFS error: ${response.status}`);
      return createFailedResult();
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      console.log('Catastro INSPIRE: No building features found');
      return createFailedResult();
    }

    // Get the first building feature
    const feature = data.features[0];
    const geometry = feature.geometry;

    if (!geometry || geometry.type !== 'MultiPolygon' && geometry.type !== 'Polygon') {
      console.log('Catastro INSPIRE: Invalid geometry type:', geometry?.type);
      return createFailedResult();
    }

    // Extract coordinates (handle both Polygon and MultiPolygon)
    let coordinates: [number, number][];
    if (geometry.type === 'MultiPolygon') {
      // Take the largest polygon from MultiPolygon
      const polygons = geometry.coordinates as [number, number][][][];
      coordinates = getLargestPolygon(polygons);
    } else {
      coordinates = geometry.coordinates[0] as [number, number][];
    }

    // Calculate area and orientation
    const roofAreaM2 = calculatePolygonArea(coordinates);
    const { degrees, label } = calculateOrientation(coordinates);

    return {
      status: 'success',
      roofAreaM2: Math.round(roofAreaM2 * 100) / 100,
      orientationDegrees: degrees,
      orientationLabel: label,
      polygonCoordinates: coordinates,
      buildingId: feature.properties?.reference || cadastralReference,
    };
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
    const bbox = `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`;

    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'BU.Building',
      srsName: 'EPSG:4326',
      outputFormat: 'application/json',
      bbox: bbox,
    });

    const url = `${WFS_BASE}?${params}`;
    console.log('Catastro INSPIRE WFS (by coords) URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Catastro INSPIRE WFS error: ${response.status}`);
      return createFailedResult();
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      console.log('Catastro INSPIRE: No building features found at coordinates');
      return createFailedResult();
    }

    // Find the building that contains the point
    const targetFeature = data.features.find((f: any) => {
      if (!f.geometry) return false;
      return isPointInPolygon(longitude, latitude, f.geometry);
    }) || data.features[0];

    const geometry = targetFeature.geometry;

    if (!geometry || geometry.type !== 'MultiPolygon' && geometry.type !== 'Polygon') {
      console.log('Catastro INSPIRE: Invalid geometry type:', geometry?.type);
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

    return {
      status: 'success',
      roofAreaM2: Math.round(roofAreaM2 * 100) / 100,
      orientationDegrees: degrees,
      orientationLabel: label,
      polygonCoordinates: coordinates,
      buildingId: targetFeature.properties?.reference || null,
    };
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
  let roofFacing = (degrees + 90) % 360;

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
  };
}
