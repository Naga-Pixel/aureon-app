/**
 * PVGIS API Service
 * Fetches location-specific solar potential data from EU Joint Research Centre
 * API Docs: https://re.jrc.ec.europa.eu/pvg_tools/en/
 */

import { getRegionalKwhPerKwp } from '@/lib/config/assessment-config';

interface PVGISResponse {
  inputs: {
    location: {
      latitude: number;
      longitude: number;
      elevation: number;
    };
    mounting_system: {
      fixed: {
        slope: { value: number };
        azimuth: { value: number };
      };
    };
  };
  outputs: {
    totals: {
      fixed: {
        E_y: number; // Annual energy production (kWh/kWp)
        E_m: number[]; // Monthly energy production
        H_y: number; // Annual irradiation (kWh/m²)
        SD_y: number; // Standard deviation
      };
    };
  };
}

export interface PVGISResult {
  status: 'success' | 'failed';
  kwhPerKwp: number | null;
  optimalAngle: number | null;
  rawResponse: PVGISResponse | null;
}

const PVGIS_API_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
const PVGIS_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Fetch solar potential data from PVGIS API
 * Returns annual kWh production per kWp installed
 */
export async function getPVGISData(latitude: number, longitude: number): Promise<PVGISResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PVGIS_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lon: longitude.toString(),
      peakpower: '1', // 1 kWp for normalized output
      loss: '14', // Standard system losses (14%)
      outputformat: 'json',
      optimalangles: '1', // Request optimal tilt angle
    });

    const response = await fetch(`${PVGIS_API_BASE}?${params}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`PVGIS API error: ${response.status} ${response.statusText}`);
      return createFallbackResult(latitude);
    }

    const data: PVGISResponse = await response.json();

    // Validate response structure
    if (!data.outputs?.totals?.fixed?.E_y) {
      console.error('PVGIS API returned invalid data structure');
      return createFallbackResult(latitude);
    }

    const kwhPerKwp = data.outputs.totals.fixed.E_y;
    const optimalAngle = data.inputs?.mounting_system?.fixed?.slope?.value ?? null;

    return {
      status: 'success',
      kwhPerKwp: Math.round(kwhPerKwp * 100) / 100,
      optimalAngle: optimalAngle !== null ? Math.round(optimalAngle * 10) / 10 : null,
      rawResponse: data,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('PVGIS API timeout');
    } else {
      console.error('PVGIS API error:', error);
    }
    return createFallbackResult(latitude);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Create fallback result using regional defaults when PVGIS fails
 */
function createFallbackResult(latitude: number): PVGISResult {
  return {
    status: 'failed',
    kwhPerKwp: getRegionalKwhPerKwp(latitude),
    optimalAngle: null,
    rawResponse: null,
  };
}
