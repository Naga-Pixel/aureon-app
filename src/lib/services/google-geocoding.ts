export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface GeocodingError {
  error: string;
  status: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const encodedAddress = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status === 'ZERO_RESULTS') {
    throw new Error('No se encontró la dirección. Por favor, verifica e intenta de nuevo.');
  }

  if (data.status !== 'OK') {
    throw new Error(`Geocoding failed: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  const result = data.results[0];
  const location = result.geometry.location;

  return {
    latitude: location.lat,
    longitude: location.lng,
    formattedAddress: result.formatted_address,
  };
}
