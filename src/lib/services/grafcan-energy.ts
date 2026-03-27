/**
 * GRAFCAN Energy Infrastructure WFS Service
 *
 * Queries GRAFCAN (Gobierno de Canarias) WFS for power infrastructure data.
 * This is specific to the Canary Islands.
 *
 * Note: The exact WFS endpoint for energy infrastructure needs discovery.
 * This module provides the infrastructure to query once the endpoint is found.
 */

import type { BBoxBounds, CTLocation } from '@/components/map/types';

// GRAFCAN WFS endpoints to try
const GRAFCAN_WFS_CANDIDATES = [
  'https://idecan1.grafcan.es/ServicioWFS/MTI',
  'https://idecan1.grafcan.es/ServicioWFS/Energia',
  'https://idecan1.grafcan.es/ServicioWFS/Infraestructuras',
];

// Layer names to search for in GetCapabilities
const CT_LAYER_KEYWORDS = [
  'transformador',
  'transformacion',
  'CT',
  'electrica',
  'energia',
  'distribucion',
];

export interface GRAFCANCapabilities {
  endpoint: string;
  layers: Array<{
    name: string;
    title: string;
    abstract?: string;
  }>;
  energyLayers: string[];
}

export interface GRAFCANCTSearchResult {
  transformers: CTLocation[];
  totalCount: number;
  boundingBox: BBoxBounds;
  fetchedAt: Date;
  layerUsed: string | null;
}

/**
 * Discover available GRAFCAN WFS layers
 *
 * Queries GetCapabilities to find energy-related layers
 */
export async function discoverGRAFCANLayers(): Promise<GRAFCANCapabilities | null> {
  for (const endpoint of GRAFCAN_WFS_CANDIDATES) {
    try {
      const url = `${endpoint}?service=WFS&request=GetCapabilities`;
      console.log(`[GRAFCAN] Checking endpoint: ${endpoint}`);

      const response = await fetch(url, {
        headers: { 'Accept': 'application/xml' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const xmlText = await response.text();
      const layers = parseCapabilities(xmlText);

      if (layers.length === 0) continue;

      // Find energy-related layers
      const energyLayers = layers.filter(layer => {
        const searchText = `${layer.name} ${layer.title} ${layer.abstract || ''}`.toLowerCase();
        return CT_LAYER_KEYWORDS.some(keyword => searchText.includes(keyword));
      });

      console.log(`[GRAFCAN] Found ${layers.length} layers, ${energyLayers.length} energy-related`);

      return {
        endpoint,
        layers,
        energyLayers: energyLayers.map(l => l.name),
      };
    } catch (error) {
      console.log(`[GRAFCAN] Endpoint ${endpoint} not available`);
      continue;
    }
  }

  console.log('[GRAFCAN] No WFS endpoints available');
  return null;
}

/**
 * Parse WFS GetCapabilities XML response
 */
function parseCapabilities(xmlText: string): Array<{ name: string; title: string; abstract?: string }> {
  const layers: Array<{ name: string; title: string; abstract?: string }> = [];

  // Simple regex-based parsing (avoiding DOM parser for server-side compatibility)
  const featureTypeRegex = /<FeatureType[^>]*>([\s\S]*?)<\/FeatureType>/gi;
  let match;

  while ((match = featureTypeRegex.exec(xmlText)) !== null) {
    const block = match[1];

    const nameMatch = block.match(/<Name[^>]*>([^<]+)<\/Name>/i);
    const titleMatch = block.match(/<Title[^>]*>([^<]+)<\/Title>/i);
    const abstractMatch = block.match(/<Abstract[^>]*>([^<]+)<\/Abstract>/i);

    if (nameMatch && titleMatch) {
      layers.push({
        name: nameMatch[1].trim(),
        title: titleMatch[1].trim(),
        abstract: abstractMatch?.[1]?.trim(),
      });
    }
  }

  return layers;
}

/**
 * Fetch CT locations from GRAFCAN WFS
 *
 * Note: This function requires the layer name to be known.
 * Use discoverGRAFCANLayers() first to find available layers.
 */
export async function getGRAFCANCTs(
  bounds: BBoxBounds,
  endpoint: string,
  layerName: string
): Promise<GRAFCANCTSearchResult> {
  const emptyResult: GRAFCANCTSearchResult = {
    transformers: [],
    totalCount: 0,
    boundingBox: bounds,
    fetchedAt: new Date(),
    layerUsed: null,
  };

  try {
    // WFS 2.0 GetFeature request
    const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;
    const url = `${endpoint}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeName=${encodeURIComponent(layerName)}` +
      `&bbox=${bbox},EPSG:4326` +
      `&outputFormat=application/json` +
      `&count=500`;

    console.log(`[GRAFCAN] Fetching CTs from ${layerName}...`);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[GRAFCAN] WFS error: ${response.status}`);
      return emptyResult;
    }

    const data = await response.json();
    const transformers = parseGeoJSONFeatures(data);

    console.log(`[GRAFCAN] Found ${transformers.length} CTs`);

    return {
      transformers,
      totalCount: transformers.length,
      boundingBox: bounds,
      fetchedAt: new Date(),
      layerUsed: layerName,
    };
  } catch (error) {
    console.error('[GRAFCAN] WFS error:', error);
    return emptyResult;
  }
}

/**
 * Parse GeoJSON features from GRAFCAN WFS response
 */
function parseGeoJSONFeatures(data: unknown): CTLocation[] {
  const locations: CTLocation[] = [];

  if (!data || typeof data !== 'object') return locations;

  const geoJSON = data as {
    type?: string;
    features?: Array<{
      id?: string;
      geometry?: { type: string; coordinates: number[] };
      properties?: Record<string, unknown>;
    }>;
  };

  if (geoJSON.type !== 'FeatureCollection' || !Array.isArray(geoJSON.features)) {
    return locations;
  }

  for (const feature of geoJSON.features) {
    if (!feature.geometry || feature.geometry.type !== 'Point') continue;

    const [lon, lat] = feature.geometry.coordinates;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;

    const props = feature.properties || {};
    const id = feature.id || `grafcan-${locations.length}`;

    // Try to extract CT reference and operator from properties
    // Property names vary by layer, so we check multiple possibilities
    const refCT = extractProperty(props, ['ref', 'codigo', 'id_ct', 'referencia', 'nombre']) as string | null;
    const operator = extractProperty(props, ['operador', 'empresa', 'propietario', 'titular']) as string | null;

    locations.push({
      id: `grafcan-${id}`,
      source: 'grafcan',
      sourceId: String(id),
      refCT,
      operator,
      lat,
      lon,
      confidence: 70, // GRAFCAN data is generally reliable
    });
  }

  return locations;
}

/**
 * Extract a property value trying multiple possible keys
 */
function extractProperty(props: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    // Check exact match
    if (props[key] !== undefined && props[key] !== null) {
      return props[key];
    }
    // Check case-insensitive
    const lowerKey = key.toLowerCase();
    for (const propKey of Object.keys(props)) {
      if (propKey.toLowerCase() === lowerKey && props[propKey] !== undefined && props[propKey] !== null) {
        return props[propKey];
      }
    }
  }
  return null;
}

/**
 * Check if GRAFCAN energy data is available for an area
 *
 * GRAFCAN only covers the Canary Islands, so this checks if the bounds
 * intersect with the Canary Islands region.
 */
export function isInCanaryIslands(bounds: BBoxBounds): boolean {
  // Canary Islands approximate bounds
  const CANARY_BOUNDS = {
    minLat: 27.6,
    maxLat: 29.5,
    minLon: -18.2,
    maxLon: -13.3,
  };

  // Check if bounds intersect with Canary Islands
  return !(
    bounds.maxLat < CANARY_BOUNDS.minLat ||
    bounds.minLat > CANARY_BOUNDS.maxLat ||
    bounds.maxLon < CANARY_BOUNDS.minLon ||
    bounds.minLon > CANARY_BOUNDS.maxLon
  );
}

// Cache for discovered capabilities
let cachedCapabilities: GRAFCANCapabilities | null = null;
let capabilitiesChecked = false;

/**
 * Get GRAFCAN capabilities (cached)
 */
export async function getGRAFCANCapabilities(): Promise<GRAFCANCapabilities | null> {
  if (capabilitiesChecked) {
    return cachedCapabilities;
  }

  capabilitiesChecked = true;
  cachedCapabilities = await discoverGRAFCANLayers();
  return cachedCapabilities;
}

/**
 * Auto-fetch CTs from GRAFCAN if available
 *
 * This is a convenience function that:
 * 1. Checks if the area is in the Canary Islands
 * 2. Discovers available energy layers
 * 3. Fetches CT data from the first available layer
 */
export async function autoFetchGRAFCANCTs(bounds: BBoxBounds): Promise<GRAFCANCTSearchResult | null> {
  // Only query GRAFCAN for Canary Islands
  if (!isInCanaryIslands(bounds)) {
    return null;
  }

  const capabilities = await getGRAFCANCapabilities();
  if (!capabilities || capabilities.energyLayers.length === 0) {
    console.log('[GRAFCAN] No energy layers available');
    return null;
  }

  // Try each energy layer until we get results
  for (const layerName of capabilities.energyLayers) {
    const result = await getGRAFCANCTs(bounds, capabilities.endpoint, layerName);
    if (result.totalCount > 0) {
      return result;
    }
  }

  return null;
}
