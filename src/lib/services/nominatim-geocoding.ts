/**
 * Nominatim (OpenStreetMap) Geocoding Service
 * Free to use, no API key required
 * Rate limit: 1 request per second
 * https://nominatim.org/release-docs/latest/api/Search/
 */

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const encodedAddress = encodeURIComponent(address);

  // Nominatim requires a User-Agent header
  const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Aureon Solar Assessment Tool (contact@aureon.es)',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error('No se encontró la dirección. Por favor, verifica e intenta de nuevo.');
  }

  const result = data[0];

  return {
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
    formattedAddress: result.display_name,
  };
}
