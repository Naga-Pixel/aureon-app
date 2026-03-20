/**
 * OSM Overpass API Service
 *
 * Queries OpenStreetMap for commercial anchors (supermarkets, industrial buildings)
 * that can serve as potential energy community hubs.
 */

import type { BBoxBounds } from '@/components/map/types';

export type AnchorType = 'supermarket' | 'industrial' | 'warehouse' | 'retail' | 'vv';

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

export interface AnchorSearchResult {
  anchors: CommercialAnchor[];
  totalCount: number;
  boundingBox: BBoxBounds;
  fetchedAt: Date;
}

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
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
    default:
      return 'Otro';
  }
}
