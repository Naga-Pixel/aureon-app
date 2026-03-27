/**
 * OSM Overpass API Service
 *
 * Queries OpenStreetMap for commercial anchors (supermarkets, industrial buildings)
 * that can serve as potential energy community hubs.
 */

import type { BBoxBounds, CTLocation } from '@/components/map/types';

export type AnchorType = 'supermarket' | 'industrial' | 'warehouse' | 'retail' | 'vv' | 'transformer' | 'fuel';

export interface CommercialAnchor {
  id: string;
  type: AnchorType;
  name: string | null;
  lat: number;
  lon: number;
  brand?: string;
  operator?: string;
  // Additional details
  industrialType?: string; // factory, warehouse, manufacturing, etc.
  product?: string; // what they produce/sell
  description?: string;
}

export interface TransformerSearchResult {
  transformers: CTLocation[];
  totalCount: number;
  boundingBox: BBoxBounds;
  fetchedAt: Date;
}

export interface AnchorSearchResult {
  anchors: CommercialAnchor[];
  totalCount: number;
  boundingBox: BBoxBounds;
  fetchedAt: Date;
}

// Primary and fallback Overpass API endpoints
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_API = OVERPASS_ENDPOINTS[0]; // For backward compat
const OVERPASS_TIMEOUT_MS = 30000;

// Cache to avoid hitting rate limits (1 req/sec)
const anchorCache = new Map<string, { result: AnchorSearchResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(bounds: BBoxBounds, types: AnchorType[]): string {
  return `${bounds.minLat.toFixed(3)},${bounds.minLon.toFixed(3)},${bounds.maxLat.toFixed(3)},${bounds.maxLon.toFixed(3)}_${types.sort().join(',')}`;
}

/**
 * Build Overpass QL query for commercial anchors
 */
function buildOverpassQuery(bounds: BBoxBounds, types: AnchorType[]): string {
  const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

  const queries: string[] = [];

  if (types.includes('supermarket')) {
    queries.push(`node["shop"="supermarket"](${bbox});`);
    queries.push(`way["shop"="supermarket"](${bbox});`);
  }

  if (types.includes('retail')) {
    queries.push(`node["shop"="mall"](${bbox});`);
    queries.push(`way["shop"="mall"](${bbox});`);
    queries.push(`node["shop"="department_store"](${bbox});`);
    queries.push(`way["shop"="department_store"](${bbox});`);
  }

  if (types.includes('industrial')) {
    queries.push(`way["building"="industrial"](${bbox});`);
  }

  if (types.includes('warehouse')) {
    queries.push(`way["building"="warehouse"](${bbox});`);
  }

  if (types.includes('fuel')) {
    queries.push(`node["amenity"="fuel"](${bbox});`);
    queries.push(`way["amenity"="fuel"](${bbox});`);
  }

  return `[out:json][timeout:25];
(
  ${queries.join('\n  ')}
);
out center;`;
}

/**
 * Parse Overpass response into CommercialAnchor array
 */
function parseOverpassResponse(data: OverpassResponse, types: AnchorType[]): CommercialAnchor[] {
  const anchors: CommercialAnchor[] = [];

  if (!data.elements) return anchors;

  for (const element of data.elements) {
    // Get coordinates (nodes have lat/lon, ways have center)
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;

    if (!lat || !lon) continue;

    // Determine anchor type
    let type: AnchorType;
    const tags = element.tags || {};

    if (tags.shop === 'supermarket') {
      type = 'supermarket';
    } else if (tags.shop === 'mall' || tags.shop === 'department_store') {
      type = 'retail';
    } else if (tags.building === 'industrial') {
      type = 'industrial';
    } else if (tags.building === 'warehouse') {
      type = 'warehouse';
    } else if (tags.amenity === 'fuel') {
      type = 'fuel';
    } else {
      continue; // Skip unknown types
    }

    anchors.push({
      id: `osm-${element.type}-${element.id}`,
      type,
      name: tags.name || tags.brand || null,
      lat,
      lon,
      brand: tags.brand,
      operator: tags.operator,
      // Additional details from OSM tags
      industrialType: tags.industrial || tags.craft || tags.man_made,
      product: tags.product || tags.produce || tags.goods,
      description: tags.description || tags['description:es'],
    });
  }

  return anchors;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  elements: OverpassElement[];
}

/**
 * Fetch commercial anchors from OSM Overpass API
 *
 * @param bounds - Bounding box to search within
 * @param types - Types of anchors to search for
 * @returns Array of commercial anchors
 */
export async function getCommercialAnchors(
  bounds: BBoxBounds,
  types: AnchorType[] = ['supermarket', 'industrial']
): Promise<AnchorSearchResult> {
  // Check cache first
  const cacheKey = getCacheKey(bounds, types);
  const cached = anchorCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log('[OSM] Cache hit for anchors');
    return cached.result;
  }

  const query = buildOverpassQuery(bounds, types);
  console.log('[OSM] Fetching anchors from Overpass API...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[OSM] Overpass API error: ${response.status}`);
      return createEmptyResult(bounds);
    }

    const data: OverpassResponse = await response.json();
    const anchors = parseOverpassResponse(data, types);

    console.log(`[OSM] Found ${anchors.length} anchors`);

    const result: AnchorSearchResult = {
      anchors,
      totalCount: anchors.length,
      boundingBox: bounds,
      fetchedAt: new Date(),
    };

    // Cache result
    anchorCache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[OSM] Overpass API timeout');
    } else {
      console.error('[OSM] Overpass API error:', error);
    }

    return createEmptyResult(bounds);
  }
}

function createEmptyResult(bounds: BBoxBounds): AnchorSearchResult {
  return {
    anchors: [],
    totalCount: 0,
    boundingBox: bounds,
    fetchedAt: new Date(),
  };
}

/**
 * Get anchor icon color based on type
 */
export function getAnchorColor(type: AnchorType): string {
  switch (type) {
    case 'supermarket':
      return '#f59e0b'; // Amber
    case 'retail':
      return '#8b5cf6'; // Purple
    case 'industrial':
      return '#ef4444'; // Red
    case 'warehouse':
      return '#6366f1'; // Indigo
    case 'vv':
      return '#06b6d4'; // Cyan
    case 'fuel':
      return '#22c55e'; // Green
    default:
      return '#6b7280'; // Gray
  }
}

/**
 * Get anchor label for display
 */
export function getAnchorLabel(type: AnchorType): string {
  switch (type) {
    case 'supermarket':
      return 'Supermercado';
    case 'retail':
      return 'Centro Comercial';
    case 'industrial':
      return 'Nave Industrial';
    case 'warehouse':
      return 'Almacén';
    case 'vv':
      return 'Vivienda Vacacional';
    case 'transformer':
      return 'Centro de Transformación';
    case 'fuel':
      return 'Gasolinera';
    default:
      return 'Otro';
  }
}

// ============================================================================
// Power Infrastructure (CT - Centro de Transformación)
// ============================================================================

// Separate cache for transformer queries
const transformerCache = new Map<string, { result: TransformerSearchResult; timestamp: number }>();

function getTransformerCacheKey(bounds: BBoxBounds): string {
  return `ct_${bounds.minLat.toFixed(3)},${bounds.minLon.toFixed(3)},${bounds.maxLat.toFixed(3)},${bounds.maxLon.toFixed(3)}`;
}

/**
 * Build Overpass QL query for power transformers (CT locations)
 * Queries:
 * - power=transformer (individual transformers)
 * - power=substation (all substations - Spanish data often lacks subtype tags)
 */
function buildTransformerQuery(bounds: BBoxBounds): string {
  const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

  return `[out:json][timeout:25];
(
  node["power"="transformer"](${bbox});
  way["power"="transformer"](${bbox});
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
);
out center;`;
}

/**
 * Parse Overpass response into CTLocation array
 */
function parseTransformerResponse(data: OverpassResponse): CTLocation[] {
  const locations: CTLocation[] = [];

  if (!data.elements) return locations;

  for (const element of data.elements) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;

    if (!lat || !lon) continue;

    const tags = element.tags || {};

    // Determine confidence based on available data
    let confidence = 50; // Base confidence for OSM data
    if (tags.ref) confidence += 30; // Has official reference
    if (tags.operator) confidence += 10; // Has operator info
    if (tags.voltage) confidence += 10; // Has technical specs

    locations.push({
      id: `osm-${element.type}-${element.id}`,
      source: 'osm',
      sourceId: `${element.type}/${element.id}`,
      refCT: tags.ref || tags['ref:CT'] || tags.name || null,
      operator: tags.operator || null,
      lat,
      lon,
      confidence: Math.min(100, confidence),
    });
  }

  return locations;
}

/**
 * Fetch power transformers (CT locations) from OSM Overpass API
 *
 * @param bounds - Bounding box to search within
 * @returns Array of CT locations
 */
export async function getTransformers(bounds: BBoxBounds): Promise<TransformerSearchResult> {
  // Check cache first
  const cacheKey = getTransformerCacheKey(bounds);
  const cached = transformerCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log('[OSM] Cache hit for transformers');
    return cached.result;
  }

  const query = buildTransformerQuery(bounds);

  // Try each endpoint until one works
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`[OSM] Fetching transformers from ${endpoint}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[OSM] ${endpoint} error: ${response.status}, trying next...`);
        continue; // Try next endpoint
      }

      const data: OverpassResponse = await response.json();
      console.log(`[OSM] Raw response: ${data.elements?.length || 0} elements`);
      const transformers = parseTransformerResponse(data);

      console.log(`[OSM] Found ${transformers.length} transformers/substations`);

      const result: TransformerSearchResult = {
        transformers,
        totalCount: transformers.length,
        boundingBox: bounds,
        fetchedAt: new Date(),
      };

      // Cache result
      transformerCache.set(cacheKey, { result, timestamp: Date.now() });

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`[OSM] ${endpoint} timeout, trying next...`);
      } else {
        console.warn(`[OSM] ${endpoint} error:`, error);
      }
      // Continue to next endpoint
    }
  }

  console.error('[OSM] All Overpass endpoints failed');
  return createEmptyTransformerResult(bounds);
}

function createEmptyTransformerResult(bounds: BBoxBounds): TransformerSearchResult {
  return {
    transformers: [],
    totalCount: 0,
    boundingBox: bounds,
    fetchedAt: new Date(),
  };
}

/**
 * Get operator color for CT visualization
 */
export function getOperatorColor(operator: string | null): string {
  if (!operator) return '#6b7280'; // Gray for unknown

  const opLower = operator.toLowerCase();

  if (opLower.includes('endesa') || opLower.includes('e-distribución') || opLower.includes('edistribucion')) {
    return '#3b82f6'; // Blue for Endesa
  }
  if (opLower.includes('iberdrola') || opLower.includes('i-de')) {
    return '#f97316'; // Orange for Iberdrola
  }
  if (opLower.includes('unión fenosa') || opLower.includes('ufd')) {
    return '#10b981'; // Green for UFD
  }
  if (opLower.includes('ree') || opLower.includes('red eléctrica')) {
    return '#ef4444'; // Red for REE (transmission, not distribution)
  }

  return '#8b5cf6'; // Purple for other operators
}
