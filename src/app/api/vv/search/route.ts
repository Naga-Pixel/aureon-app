/**
 * VV Search API
 *
 * GET /api/vv/search?lat=...&lon=...&radius=...
 *
 * Returns VV (Viviendas Vacacionales) properties within radius of a point.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVVsInRadius, getVVsInBounds, type VVSearchResult } from '@/lib/services/vv-lookup';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const lat = parseFloat(searchParams.get('lat') || '');
  const lon = parseFloat(searchParams.get('lon') || '');
  const radius = parseFloat(searchParams.get('radius') || '2');

  // Validate coordinates
  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json(
      { error: 'Invalid coordinates. Required: lat, lon' },
      { status: 400 }
    );
  }

  // Validate radius (1-10 km)
  const radiusKm = Math.min(10, Math.max(0.5, radius));

  try {
    let result: VVSearchResult;

    try {
      // Try PostGIS spatial query first
      result = await getVVsInRadius(lat, lon, radiusKm);
    } catch (rpcError) {
      // Fallback to bounds-based query if RPC not available
      console.warn('[VV API] PostGIS RPC not available, using bounds fallback');

      // Calculate bounding box from radius
      const latDelta = radiusKm / 111;
      const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));

      const properties = await getVVsInBounds(
        lat - latDelta,
        lat + latDelta,
        lon - lonDelta,
        lon + lonDelta
      );

      result = {
        properties,
        totalCount: properties.length,
        centerLat: lat,
        centerLon: lon,
        radiusKm,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[VV API] Search error:', error);
    return NextResponse.json(
      { error: 'Failed to search VV registry' },
      { status: 500 }
    );
  }
}
