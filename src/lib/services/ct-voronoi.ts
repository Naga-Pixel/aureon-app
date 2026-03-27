/**
 * CT Voronoi Zone Generation
 *
 * Generates Voronoi polygons from CT (Centro de Transformación) points
 * to determine which buildings share the same CT zone.
 *
 * Used for accurate energy community eligibility validation.
 */

import voronoi from '@turf/voronoi';
import { featureCollection, point } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { BBoxBounds, CTLocation, BuildingResult } from '@/components/map/types';

export interface CTZone extends Feature<Polygon> {
  properties: {
    ctId: string;
    source: string;
    refCT: string | null;
    operator: string | null;
    confidence: number;
    centerLat: number;
    centerLon: number;
  };
}

export interface CTZoneCollection extends FeatureCollection<Polygon> {
  features: CTZone[];
}

export interface CTValidation {
  isValid: boolean;          // All buildings in same CT zone
  zoneCount: number;         // Number of distinct CT zones
  dominantZone: string | null;
  dominantZoneRatio: number; // 0-1, percentage of buildings in dominant zone
  zones: Array<{
    ctId: string;
    refCT: string | null;
    operator: string | null;
    buildingCount: number;
    percentage: number;
  }>;
  dataSource: 'voronoi' | 'heuristic';
  confidence: number;        // Average confidence of CT data used
}

/**
 * Extend bounds by a buffer distance (in km)
 */
function extendBounds(bounds: BBoxBounds, bufferKm: number): BBoxBounds {
  // Approximate: 1 degree ≈ 111km at equator
  const latBuffer = bufferKm / 111;
  const lonBuffer = bufferKm / (111 * Math.cos((bounds.minLat + bounds.maxLat) / 2 * Math.PI / 180));

  return {
    minLat: bounds.minLat - latBuffer,
    maxLat: bounds.maxLat + latBuffer,
    minLon: bounds.minLon - lonBuffer,
    maxLon: bounds.maxLon + lonBuffer,
  };
}

/**
 * Generate Voronoi polygons from CT points
 *
 * @param ctLocations - Array of CT locations
 * @param bounds - Bounding box to clip Voronoi polygons to
 * @param bufferKm - Buffer to extend bounds for better edge handling (default 2km)
 * @returns FeatureCollection of Voronoi polygons with CT metadata
 */
export function generateCTZones(
  ctLocations: CTLocation[],
  bounds: BBoxBounds,
  bufferKm: number = 2
): CTZoneCollection | null {
  if (ctLocations.length === 0) {
    return null;
  }

  // Handle single CT case - return a large polygon covering the bounds
  if (ctLocations.length === 1) {
    const ct = ctLocations[0];
    const extBounds = extendBounds(bounds, bufferKm);

    const singleZone: CTZone = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [extBounds.minLon, extBounds.minLat],
          [extBounds.maxLon, extBounds.minLat],
          [extBounds.maxLon, extBounds.maxLat],
          [extBounds.minLon, extBounds.maxLat],
          [extBounds.minLon, extBounds.minLat],
        ]],
      },
      properties: {
        ctId: ct.id,
        source: ct.source,
        refCT: ct.refCT,
        operator: ct.operator,
        confidence: ct.confidence,
        centerLat: ct.lat,
        centerLon: ct.lon,
      },
    };

    return {
      type: 'FeatureCollection',
      features: [singleZone],
    };
  }

  // Convert CT locations to GeoJSON points
  const points = featureCollection(
    ctLocations.map(ct =>
      point([ct.lon, ct.lat], {
        ctId: ct.id,
        source: ct.source,
        refCT: ct.refCT,
        operator: ct.operator,
        confidence: ct.confidence,
      })
    )
  );

  // Extend bounds for better Voronoi generation at edges
  const extBounds = extendBounds(bounds, bufferKm);
  const bboxArray: [number, number, number, number] = [
    extBounds.minLon,
    extBounds.minLat,
    extBounds.maxLon,
    extBounds.maxLat,
  ];

  // Generate Voronoi diagram
  const voronoiPolygons = voronoi(points, { bbox: bboxArray });

  if (!voronoiPolygons || !voronoiPolygons.features) {
    console.error('[CT Voronoi] Failed to generate Voronoi diagram');
    return null;
  }

  // Map Voronoi polygons to CT zones with metadata
  const zones: CTZone[] = voronoiPolygons.features
    .filter((f): f is Feature<Polygon> => f !== null && f.geometry !== null)
    .map((feature, index) => {
      const ct = ctLocations[index];
      return {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          ctId: ct.id,
          source: ct.source,
          refCT: ct.refCT,
          operator: ct.operator,
          confidence: ct.confidence,
          centerLat: ct.lat,
          centerLon: ct.lon,
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features: zones,
  };
}

/**
 * Find which CT zone a point belongs to
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @param zones - Voronoi zone collection
 * @returns CT zone ID or null if not found
 */
export function findCTZone(
  lat: number,
  lon: number,
  zones: CTZoneCollection
): CTZone | null {
  const pt = point([lon, lat]);

  for (const zone of zones.features) {
    if (booleanPointInPolygon(pt, zone)) {
      return zone;
    }
  }

  return null;
}

/**
 * Get building center point
 */
function getBuildingCenter(building: BuildingResult): { lat: number; lon: number } | null {
  const coords = building.polygonCoordinates;
  if (!coords || coords.length === 0) return null;

  let sumLat = 0;
  let sumLon = 0;
  for (const [lon, lat] of coords) {
    sumLat += lat;
    sumLon += lon;
  }

  return {
    lat: sumLat / coords.length,
    lon: sumLon / coords.length,
  };
}

/**
 * Validate that all buildings share the same CT zone
 *
 * @param buildings - Array of buildings to validate
 * @param zones - Voronoi zone collection
 * @returns Validation result with zone distribution
 */
export function validateSameCT(
  buildings: BuildingResult[],
  zones: CTZoneCollection
): CTValidation {
  const zoneDistribution = new Map<string, {
    refCT: string | null;
    operator: string | null;
    confidence: number;
    count: number;
  }>();

  let totalConfidence = 0;
  let buildingsWithZone = 0;

  for (const building of buildings) {
    const center = getBuildingCenter(building);
    if (!center) continue;

    const zone = findCTZone(center.lat, center.lon, zones);
    if (!zone) continue;

    buildingsWithZone++;
    totalConfidence += zone.properties.confidence;

    const ctId = zone.properties.ctId;
    const existing = zoneDistribution.get(ctId);

    if (existing) {
      existing.count++;
    } else {
      zoneDistribution.set(ctId, {
        refCT: zone.properties.refCT,
        operator: zone.properties.operator,
        confidence: zone.properties.confidence,
        count: 1,
      });
    }
  }

  // Sort zones by building count
  const sortedZones = Array.from(zoneDistribution.entries())
    .map(([ctId, data]) => ({
      ctId,
      refCT: data.refCT,
      operator: data.operator,
      buildingCount: data.count,
      percentage: buildings.length > 0 ? (data.count / buildings.length) * 100 : 0,
    }))
    .sort((a, b) => b.buildingCount - a.buildingCount);

  const zoneCount = zoneDistribution.size;
  const dominantZone = sortedZones.length > 0 ? sortedZones[0].ctId : null;
  const dominantZoneCount = sortedZones.length > 0 ? sortedZones[0].buildingCount : 0;
  const dominantZoneRatio = buildings.length > 0 ? dominantZoneCount / buildings.length : 0;

  // Valid if all buildings are in the same CT zone (or >90% in dominant zone)
  const isValid = zoneCount === 1 || (zoneCount <= 2 && dominantZoneRatio >= 0.9);

  return {
    isValid,
    zoneCount,
    dominantZone,
    dominantZoneRatio: Math.round(dominantZoneRatio * 100) / 100,
    zones: sortedZones,
    dataSource: 'voronoi',
    confidence: buildingsWithZone > 0 ? Math.round(totalConfidence / buildingsWithZone) : 0,
  };
}

/**
 * Get bounding box for a set of CT locations
 */
export function getCTBounds(ctLocations: CTLocation[]): BBoxBounds | null {
  if (ctLocations.length === 0) return null;

  const points = featureCollection(
    ctLocations.map(ct => point([ct.lon, ct.lat]))
  );

  const [minLon, minLat, maxLon, maxLat] = bbox(points);

  return { minLat, maxLat, minLon, maxLon };
}
