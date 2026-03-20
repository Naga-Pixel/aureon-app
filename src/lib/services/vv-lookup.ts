/**
 * VV (Viviendas Vacacionales) Lookup Service
 *
 * Queries the vv_registry table for vacation rentals within a radius.
 * VVs are important for energy community load diversity (evening AC peaks).
 */

import { createClient } from '@/lib/supabase/server';

/**
 * VV property from registry
 */
export interface VVProperty {
  establecimientoId: string;
  nombreComercial: string | null;
  direccion: string | null;
  island: string | null;
  municipality: string | null;
  plazas: number;
  dormitoriosIndividuales: number;
  dormitoriosDobles: number;
  latitude: number;
  longitude: number;
  // Estimated consumption based on plazas
  estimatedDailyKwh: number;
  estimatedAnnualKwh: number;
}

/**
 * VV search result
 */
export interface VVSearchResult {
  properties: VVProperty[];
  totalCount: number;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
}

// Consumption estimate: ~20 kWh per plaza per day (during high occupancy)
// Based on Canarias tourist accommodation studies
const KWH_PER_PLAZA_PER_DAY = 20;
const OCCUPANCY_DAYS_PER_YEAR = 200; // Average ~55% occupancy

/**
 * Calculate estimated consumption for a VV property
 */
function estimateVVConsumption(plazas: number): { dailyKwh: number; annualKwh: number } {
  const dailyKwh = plazas * KWH_PER_PLAZA_PER_DAY;
  const annualKwh = dailyKwh * OCCUPANCY_DAYS_PER_YEAR;
  return { dailyKwh, annualKwh };
}

/**
 * Query VV registry for properties within radius
 *
 * Uses PostGIS ST_DWithin for efficient spatial query
 */
export async function getVVsInRadius(
  centerLat: number,
  centerLon: number,
  radiusKm: number
): Promise<VVSearchResult> {
  const supabase = await createClient();

  // Convert radius to meters for ST_DWithin
  const radiusMeters = radiusKm * 1000;

  // Use PostGIS spatial query
  // ST_DWithin uses geography type for accurate distance on Earth's surface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('get_vvs_in_radius', {
      center_lat: centerLat,
      center_lon: centerLon,
      radius_meters: radiusMeters,
    });

  if (error) {
    console.error('[VV Lookup] Query error:', error);
    return {
      properties: [],
      totalCount: 0,
      centerLat,
      centerLon,
      radiusKm,
    };
  }

  // Map results to VVProperty type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: VVProperty[] = (data || []).map((row: any) => {
    const plazas = row.plazas || 2;
    const { dailyKwh, annualKwh } = estimateVVConsumption(plazas);

    return {
      establecimientoId: row.establecimiento_id,
      nombreComercial: row.nombre_comercial,
      direccion: row.direccion,
      island: row.island,
      municipality: row.municipality,
      plazas,
      dormitoriosIndividuales: row.dormitorios_individuales || 0,
      dormitoriosDobles: row.dormitorios_dobles || 0,
      latitude: row.latitude,
      longitude: row.longitude,
      estimatedDailyKwh: Math.round(dailyKwh),
      estimatedAnnualKwh: Math.round(annualKwh),
    };
  });

  return {
    properties,
    totalCount: properties.length,
    centerLat,
    centerLon,
    radiusKm,
  };
}

/**
 * Fallback: Query VV registry using simple lat/lon bounds
 * Use this if PostGIS RPC is not available
 */
export async function getVVsInBounds(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number
): Promise<VVProperty[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('vv_registry')
    .select('*')
    .gte('latitude', minLat)
    .lte('latitude', maxLat)
    .gte('longitude', minLon)
    .lte('longitude', maxLon)
    .limit(500);

  if (error) {
    console.error('[VV Lookup] Bounds query error:', error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => {
    const plazas = row.plazas || 2;
    const { dailyKwh, annualKwh } = estimateVVConsumption(plazas);

    return {
      establecimientoId: row.establecimiento_id,
      nombreComercial: row.nombre_comercial,
      direccion: row.direccion,
      island: row.island,
      municipality: row.municipality,
      plazas,
      dormitoriosIndividuales: row.dormitorios_individuales || 0,
      dormitoriosDobles: row.dormitorios_dobles || 0,
      latitude: row.latitude,
      longitude: row.longitude,
      estimatedDailyKwh: Math.round(dailyKwh),
      estimatedAnnualKwh: Math.round(annualKwh),
    };
  });
}

/**
 * Get VV stats for a cluster
 */
export interface ClusterVVStats {
  count: number;
  totalPlazas: number;
  estimatedDailyKwh: number;
  estimatedAnnualKwh: number;
  properties: VVProperty[];
}

/**
 * Get VV statistics for enriching a cluster
 */
export async function getVVStatsForCluster(
  centerLat: number,
  centerLon: number,
  radiusKm: number
): Promise<ClusterVVStats> {
  const result = await getVVsInRadius(centerLat, centerLon, radiusKm);

  const totalPlazas = result.properties.reduce((sum, p) => sum + p.plazas, 0);
  const estimatedDailyKwh = result.properties.reduce((sum, p) => sum + p.estimatedDailyKwh, 0);
  const estimatedAnnualKwh = result.properties.reduce((sum, p) => sum + p.estimatedAnnualKwh, 0);

  return {
    count: result.totalCount,
    totalPlazas,
    estimatedDailyKwh,
    estimatedAnnualKwh,
    properties: result.properties,
  };
}
