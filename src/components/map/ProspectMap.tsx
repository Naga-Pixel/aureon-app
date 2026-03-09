'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BBoxBounds, BuildingResult, AssessmentType } from './types';
import { VULNERABILITY_ZONES } from '@/lib/data/vulnerability-zones';

// Satellite imagery options
const ESRI_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const PNOA_WMTS_URL = 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg'; // PNOA TMS format

interface ProspectMapProps {
  onAreaSelect: (bounds: BBoxBounds | null) => void;
  bounds: BBoxBounds | null;
  buildings: BuildingResult[];
  isLoading: boolean;
  selectedBuilding: BuildingResult | null;
  onBuildingSelect: (building: BuildingResult | null) => void;
  assessmentType?: AssessmentType;
  showVulnerabilityLayer?: boolean;
}

// Nominatim geocoding endpoint
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

// MapLibre style - using free CartoCDN tiles
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// Spain center (Madrid)
const DEFAULT_CENTER: [number, number] = [-3.7038, 40.4168];
const DEFAULT_ZOOM = 6;

export function ProspectMap({
  onAreaSelect,
  bounds,
  buildings,
  isLoading,
  selectedBuilding,
  onBuildingSelect,
  assessmentType = 'solar',
  showVulnerabilityLayer = true,
}: ProspectMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [vulnerabilityVisible, setVulnerabilityVisible] = useState(true);
  const [satelliteView, setSatelliteView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const drawStartRef = useRef<{ lng: number; lat: number } | null>(null);
  const isDrawingRef = useRef(false);
  const buildingMarkers = useRef<maplibregl.Marker[]>([]);
  const closeButtonMarker = useRef<maplibregl.Marker | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  // Toggle vulnerability layer visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const shouldShow = showVulnerabilityLayer && vulnerabilityVisible && assessmentType !== 'solar';

    if (mapInstance.getLayer('vulnerability-fill')) {
      mapInstance.setLayoutProperty('vulnerability-fill', 'visibility', shouldShow ? 'visible' : 'none');
    }
    if (mapInstance.getLayer('vulnerability-border')) {
      mapInstance.setLayoutProperty('vulnerability-border', 'visibility', shouldShow ? 'visible' : 'none');
    }
  }, [mapLoaded, showVulnerabilityLayer, vulnerabilityVisible, assessmentType]);

  // Toggle satellite view
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const layers = mapInstance.getStyle().layers || [];

    // Layers to hide in satellite mode (buildings, land, water fills)
    const layersToHide = layers.filter(l =>
      l.type === 'fill' ||
      l.type === 'line' && !l.id.includes('road') ||
      l.id.includes('building') ||
      l.id.includes('landuse') ||
      l.id.includes('water') ||
      l.id.includes('background')
    ).map(l => l.id);

    if (satelliteView) {
      // Add satellite layer if not exists
      if (!mapInstance.getSource('satellite')) {
        mapInstance.addSource('satellite', {
          type: 'raster',
          tiles: [ESRI_SATELLITE_URL],
          tileSize: 256,
          attribution: '© Esri',
          maxzoom: 19,
        });

        // Add at the very bottom
        mapInstance.addLayer(
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            paint: {
              'raster-opacity': 1,
            },
          },
          layers[0]?.id // Add at very bottom
        );
      }

      // Hide fill layers that cover the satellite
      layersToHide.forEach(layerId => {
        if (mapInstance.getLayer(layerId)) {
          mapInstance.setLayoutProperty(layerId, 'visibility', 'none');
        }
      });
    } else {
      // Remove satellite layer
      if (mapInstance.getLayer('satellite-layer')) {
        mapInstance.removeLayer('satellite-layer');
      }
      if (mapInstance.getSource('satellite')) {
        mapInstance.removeSource('satellite');
      }

      // Restore hidden layers
      layersToHide.forEach(layerId => {
        if (mapInstance.getLayer(layerId)) {
          mapInstance.setLayoutProperty(layerId, 'visibility', 'visible');
        }
      });
    }
  }, [mapLoaded, satelliteView]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.on('load', () => {
      const mapInstance = map.current!;

      // Add vulnerability zones layer
      mapInstance.addSource('vulnerability-zones', {
        type: 'geojson',
        data: VULNERABILITY_ZONES as GeoJSON.FeatureCollection,
      });

      // Fill layer with color gradient based on vulnerability
      mapInstance.addLayer({
        id: 'vulnerability-fill',
        type: 'fill',
        source: 'vulnerability-zones',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'vulnerability'],
            0, '#16a34a',   // Green - low vulnerability
            30, '#22c55e',
            50, '#facc15',  // Yellow - medium
            70, '#f97316',
            100, '#ef4444', // Red - high vulnerability
          ],
          'fill-opacity': 0.25,
        },
      });

      // Border layer for zones
      mapInstance.addLayer({
        id: 'vulnerability-border',
        type: 'line',
        source: 'vulnerability-zones',
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            ['get', 'vulnerability'],
            0, '#16a34a',
            50, '#facc15',
            100, '#ef4444',
          ],
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      });

      setMapLoaded(true);
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add scale
    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }),
      'bottom-left'
    );

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Set up drawing event handlers after map loads
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      drawStartRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current || !drawStartRef.current) return;

      const start = drawStartRef.current;
      const coordinates: [number, number][] = [
        [start.lng, start.lat],
        [e.lngLat.lng, start.lat],
        [e.lngLat.lng, e.lngLat.lat],
        [start.lng, e.lngLat.lat],
        [start.lng, start.lat],
      ];

      // Update or create rectangle
      const source = mapInstance.getSource('draw-rectangle') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        });
      } else {
        mapInstance.addSource('draw-rectangle', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [coordinates],
            },
          },
        });
        mapInstance.addLayer({
          id: 'draw-rectangle',
          type: 'fill',
          source: 'draw-rectangle',
          paint: {
            'fill-color': '#a7e26e',
            'fill-opacity': 0.3,
          },
        });
        mapInstance.addLayer({
          id: 'draw-rectangle-outline',
          type: 'line',
          source: 'draw-rectangle',
          paint: {
            'line-color': '#222f30',
            'line-width': 2,
          },
        });
      }
    };

    const handleMouseUp = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current || !drawStartRef.current) return;

      const start = drawStartRef.current;
      const bounds: BBoxBounds = {
        minLat: Math.min(start.lat, e.lngLat.lat),
        maxLat: Math.max(start.lat, e.lngLat.lat),
        minLon: Math.min(start.lng, e.lngLat.lng),
        maxLon: Math.max(start.lng, e.lngLat.lng),
      };

      // Only select if area is meaningful (not just a click)
      const latDiff = Math.abs(bounds.maxLat - bounds.minLat);
      const lonDiff = Math.abs(bounds.maxLon - bounds.minLon);
      if (latDiff > 0.0001 && lonDiff > 0.0001) {
        onAreaSelect(bounds);
      }

      // Reset drawing state
      drawStartRef.current = null;
      setIsDrawing(false);
      mapInstance.dragPan.enable();
      mapInstance.getCanvas().style.cursor = '';
    };

    mapInstance.on('mousedown', handleMouseDown);
    mapInstance.on('mousemove', handleMouseMove);
    mapInstance.on('mouseup', handleMouseUp);

    return () => {
      mapInstance.off('mousedown', handleMouseDown);
      mapInstance.off('mousemove', handleMouseMove);
      mapInstance.off('mouseup', handleMouseUp);
    };
  }, [mapLoaded, onAreaSelect]);

  // Search for an address and fly to it
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !map.current) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      // Add Spain bias to search
      const query = searchQuery.includes('España') || searchQuery.includes('Spain')
        ? searchQuery
        : `${searchQuery}, España`;

      const url = `${NOMINATIM_SEARCH_URL}?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=es`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AureonApp/1.0',
        },
      });

      const results = await response.json();

      if (results.length === 0) {
        setSearchError('No se encontró la dirección');
        return;
      }

      const result = results[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      // Fly to the location
      map.current.flyTo({
        center: [lon, lat],
        zoom: 17, // Street level zoom for drawing area
        duration: 1500,
      });

      setSearchQuery(''); // Clear search after success
    } catch {
      setSearchError('Error al buscar la dirección');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Toggle drawing mode
  const toggleDrawing = useCallback(() => {
    if (!map.current) return;

    const newDrawingState = !isDrawing;
    setIsDrawing(newDrawingState);

    if (newDrawingState) {
      map.current.dragPan.disable();
      map.current.getCanvas().style.cursor = 'crosshair';
    } else {
      map.current.dragPan.enable();
      map.current.getCanvas().style.cursor = '';
      drawStartRef.current = null;
    }
  }, [isDrawing]);

  // Clear selection
  const clearSelection = useCallback(() => {
    if (!map.current) return;

    // Remove rectangle layers
    if (map.current.getLayer('draw-rectangle-outline')) {
      map.current.removeLayer('draw-rectangle-outline');
    }
    if (map.current.getLayer('draw-rectangle')) {
      map.current.removeLayer('draw-rectangle');
    }
    if (map.current.getSource('draw-rectangle')) {
      map.current.removeSource('draw-rectangle');
    }

    // Remove close button marker
    if (closeButtonMarker.current) {
      closeButtonMarker.current.remove();
      closeButtonMarker.current = null;
    }

    onAreaSelect(null);
  }, [onAreaSelect]);

  // Show/update close button when bounds change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing close button
    if (closeButtonMarker.current) {
      closeButtonMarker.current.remove();
      closeButtonMarker.current = null;
    }

    if (bounds && !isDrawing) {
      // Create close button element
      const el = document.createElement('button');
      el.innerHTML = '&times;';
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: bold;
        color: #dc2626;
        line-height: 1;
      `;
      el.title = 'Borrar seleccion';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelection();
      });

      // Position at top-right corner of bounds
      closeButtonMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([bounds.maxLon, bounds.maxLat])
        .addTo(map.current);
    }
  }, [bounds, mapLoaded, isDrawing, clearSelection]);

  // Update building markers when buildings change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Remove existing markers
    buildingMarkers.current.forEach(marker => marker.remove());
    buildingMarkers.current = [];

    // Add new markers for each building
    buildings.forEach(building => {
      if (!building.polygonCoordinates || building.polygonCoordinates.length === 0) return;

      // Calculate centroid for marker placement
      const centroid = calculateCentroid(building.polygonCoordinates);

      // Create marker element
      const el = document.createElement('div');
      el.className = 'building-marker';
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: ${getScoreColor(building.score || 0, assessmentType)};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        color: white;
      `;
      el.textContent = building.score ? String(Math.round(building.score)) : '';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(centroid)
        .addTo(mapInstance);

      // Add click handler
      el.addEventListener('click', () => {
        onBuildingSelect(building);
      });

      buildingMarkers.current.push(marker);
    });

    // Fit bounds to show all buildings
    if (buildings.length > 0) {
      const allCoords = buildings.flatMap(b => b.polygonCoordinates || []);
      if (allCoords.length > 0) {
        const bounds = allCoords.reduce(
          (acc, [lng, lat]) => ({
            minLng: Math.min(acc.minLng, lng),
            maxLng: Math.max(acc.maxLng, lng),
            minLat: Math.min(acc.minLat, lat),
            maxLat: Math.max(acc.maxLat, lat),
          }),
          { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
        );

        mapInstance.fitBounds(
          [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
          { padding: 50 }
        );
      }
    }
  }, [buildings, mapLoaded, onBuildingSelect, assessmentType]);

  // Highlight selected building
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Remove existing highlight
    if (mapInstance.getLayer('selected-building')) {
      mapInstance.removeLayer('selected-building');
    }
    if (mapInstance.getSource('selected-building')) {
      mapInstance.removeSource('selected-building');
    }

    if (selectedBuilding?.polygonCoordinates) {
      mapInstance.addSource('selected-building', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [selectedBuilding.polygonCoordinates],
          },
        },
      });
      mapInstance.addLayer({
        id: 'selected-building',
        type: 'fill',
        source: 'selected-building',
        paint: {
          'fill-color': '#a7e26e',
          'fill-opacity': 0.5,
        },
      });
    }
  }, [selectedBuilding, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* Search and drawing controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        {/* Address search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar dirección..."
              disabled={!mapLoaded || isSearching}
              className="w-64 px-4 py-2 pr-10 rounded-lg bg-white shadow-md border-0 text-sm text-[#222f30] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a7e26e] disabled:opacity-50"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-[#a7e26e] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!mapLoaded || isSearching || !searchQuery.trim()}
            className="px-3 py-2 rounded-lg bg-white shadow-md text-[#222f30] hover:bg-gray-100 disabled:opacity-50 transition-colors"
            title="Buscar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </form>

        {/* Search error */}
        {searchError && (
          <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg shadow">
            {searchError}
          </div>
        )}

        {/* Map controls */}
        <div className="flex gap-2">
          <button
            onClick={toggleDrawing}
            disabled={!mapLoaded}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDrawing
                ? 'bg-[#a7e26e] text-[#222f30]'
                : 'bg-white text-[#222f30] hover:bg-gray-100'
            } shadow-md disabled:opacity-50`}
          >
            {isDrawing ? 'Dibujando...' : 'Dibujar Area'}
          </button>
          {isDrawing && (
            <button
              onClick={toggleDrawing}
              className="px-4 py-2 rounded-lg font-medium bg-white text-red-600 hover:bg-red-50 shadow-md transition-colors"
            >
              Cancelar
            </button>
          )}
          {/* Satellite toggle */}
          <button
            onClick={() => setSatelliteView(!satelliteView)}
            disabled={!mapLoaded}
            className={`px-3 py-2 rounded-lg font-medium transition-colors shadow-md disabled:opacity-50 ${
              satelliteView
                ? 'bg-blue-600 text-white'
                : 'bg-white text-[#222f30] hover:bg-gray-100'
            }`}
            title={satelliteView ? 'Vista mapa' : 'Vista satelite'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {satelliteView ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
          </button>
        </div>
        {isDrawing && (
          <p className="text-xs bg-white/90 p-2 rounded shadow max-w-[200px]">
            Haz clic y arrastra para seleccionar un area
          </p>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg z-20">
          <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-lg shadow-lg">
            <div className="w-5 h-5 border-2 border-[#a7e26e] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#222f30] font-medium">Buscando edificios...</span>
          </div>
        </div>
      )}

      {/* Map loading indicator */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#222f30] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#222f30]">Cargando mapa...</span>
          </div>
        </div>
      )}

      {/* Vulnerability Legend */}
      {mapLoaded && showVulnerabilityLayer && assessmentType !== 'solar' && (
        <div className="absolute bottom-8 right-4 z-10">
          <div className="bg-white rounded-lg shadow-md p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-700">Vulnerabilidad Red</span>
              <button
                onClick={() => setVulnerabilityVisible(!vulnerabilityVisible)}
                className={`w-8 h-4 rounded-full transition-colors ${
                  vulnerabilityVisible ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`block w-3 h-3 bg-white rounded-full transition-transform ${
                    vulnerabilityVisible ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {vulnerabilityVisible && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
                  <span className="text-gray-600">Alta</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: '#facc15' }} />
                  <span className="text-gray-600">Media</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: '#16a34a' }} />
                  <span className="text-gray-600">Baja</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to calculate polygon centroid
function calculateCentroid(coordinates: [number, number][]): [number, number] {
  let sumLng = 0;
  let sumLat = 0;
  const n = coordinates.length;

  for (const [lng, lat] of coordinates) {
    sumLng += lng;
    sumLat += lat;
  }

  return [sumLng / n, sumLat / n];
}

// Helper function to get color based on score and assessment type
function getScoreColor(score: number, assessmentType: AssessmentType = 'solar'): string {
  // Color palettes for each assessment type
  const palettes = {
    solar: {
      high: '#16a34a',    // Green
      medHigh: '#a7e26e', // Light green
      medium: '#facc15',  // Yellow
      medLow: '#fb923c',  // Orange
      low: '#ef4444',     // Red
    },
    battery: {
      high: '#2563eb',    // Blue
      medHigh: '#3b82f6', // Light blue
      medium: '#60a5fa',  // Lighter blue
      medLow: '#93c5fd',  // Very light blue
      low: '#bfdbfe',     // Pale blue
    },
    combined: {
      high: '#7c3aed',    // Purple
      medHigh: '#8b5cf6', // Light purple
      medium: '#a78bfa',  // Lighter purple
      medLow: '#c4b5fd',  // Very light purple
      low: '#ddd6fe',     // Pale purple
    },
  };

  const palette = palettes[assessmentType];

  if (score >= 80) return palette.high;
  if (score >= 60) return palette.medHigh;
  if (score >= 40) return palette.medium;
  if (score >= 20) return palette.medLow;
  return palette.low;
}
