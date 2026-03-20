'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BBoxBounds, BuildingResult, AssessmentType } from './types';
import { VULNERABILITY_ZONES } from '@/lib/data/vulnerability-zones';
import { getMunicipalitiesForHeatmap, type MunicipalHeatmapPoint } from '@/lib/services/incentives/municipal-lookup';
import { getCommercialAnchors, getAnchorColor, getAnchorLabel, type CommercialAnchor } from '@/lib/services/osm-overpass';
import { generateCirclePolygon, findBuildingsInRadius, findHighValueClusters, findEnergyCommunities, getRadiusForAnchor, type ClusterResult } from '@/lib/services/cluster-finder';
import { scoreAndRankClusters } from '@/lib/services/cluster-scorer';
import { enrichClusterWithCTAnalysis } from '@/lib/services/ct-heuristic';
import { ClusterRankingPanel } from './ClusterRankingPanel';
import type { ScoredClusterResult } from './types';

// Satellite imagery options
const ESRI_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const GRAFCAN_ORTHO_URL = 'https://idecan1.grafcan.es/ServicioWMS/OrtoExpress?service=WMS&version=1.1.1&request=GetMap&layers=ortoexpress&styles=&format=image/jpeg&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}';

type BaseLayerMode = 'streets' | 'satellite' | 'grafcan';
type SubsidyHeatmapMode = 'off' | 'ibi' | 'icio';

interface ProspectMapProps {
  onAreaSelect: (bounds: BBoxBounds | null) => void;
  bounds: BBoxBounds | null;
  buildings: BuildingResult[];
  isLoading: boolean;
  selectedBuilding: BuildingResult | null;
  onBuildingSelect: (building: BuildingResult | null) => void;
  assessmentType?: AssessmentType;
  showVulnerabilityLayer?: boolean;
  showSubsidyHeatmap?: boolean;
  showCommercialAnchors?: boolean;
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
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
  showSubsidyHeatmap = true,
  showCommercialAnchors = false,
  initialLat,
  initialLon,
  initialZoom,
}: ProspectMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [vulnerabilityVisible, setVulnerabilityVisible] = useState(true);
  const [baseLayer, setBaseLayer] = useState<BaseLayerMode>('streets');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [subsidyHeatmapMode, setSubsidyHeatmapMode] = useState<SubsidyHeatmapMode>('off');
  const drawStartRef = useRef<{ lng: number; lat: number } | null>(null);
  const isDrawingRef = useRef(false);
  const buildingMarkers = useRef<maplibregl.Marker[]>([]);
  const closeButtonMarker = useRef<maplibregl.Marker | null>(null);
  const subsidyMarkers = useRef<maplibregl.Marker[]>([]);
  const anchorMarkers = useRef<maplibregl.Marker[]>([]);
  const [commercialAnchors, setCommercialAnchors] = useState<CommercialAnchor[]>([]);
  const [isLoadingAnchors, setIsLoadingAnchors] = useState(false);
  const [anchorsVisible, setAnchorsVisible] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<CommercialAnchor | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(2);
  const [highValueClusters, setHighValueClusters] = useState<ClusterResult[]>([]);
  const [clusterFinderActive, setClusterFinderActive] = useState(false);
  // Energy Community mode
  const [energyCommunityMode, setEnergyCommunityMode] = useState(false);
  const [scoredClusters, setScoredClusters] = useState<ScoredClusterResult[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [epcColorMode, setEpcColorMode] = useState(false);
  const lastAnchorBoundsRef = useRef<string | null>(null);
  const hasFlownToCanaries = useRef(false);
  // VV (Viviendas Vacacionales) layer
  const [vvsVisible, setVvsVisible] = useState(false);
  const [vvs, setVvs] = useState<Array<{ id: string; name: string; plazas: number; lat: number; lon: number; propertyType?: string; managementFirm?: string; complexName?: string; complexId?: string; groupId?: string }>>([]);
  const [isLoadingVvs, setIsLoadingVvs] = useState(false);
  const [selectedVvGroup, setSelectedVvGroup] = useState<{ groupId: string; label: string } | null>(null);
  const selectedVvGroupRef = useRef<{ groupId: string; label: string } | null>(null);
  const vvMarkers = useRef<maplibregl.Marker[]>([]);
  const lastVvBoundsRef = useRef<string | null>(null);

  // Layer visibility toggles (5 categories)
  // All toggles start false - user enables the ones they want to see
  const [layerToggles, setLayerToggles] = useState({
    supermarkets: false,
    industrial: false,
    vvFirms: false,
    vvComplexes: false,
    vvIndividual: false,
  });
  const toggleLayer = (layer: keyof typeof layerToggles) => {
    setLayerToggles(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Keep ref in sync with selectedVvGroup state
  useEffect(() => {
    selectedVvGroupRef.current = selectedVvGroup;
  }, [selectedVvGroup]);

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

  // Toggle base layer (streets / satellite / grafcan)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const style = mapInstance.getStyle();
    if (!style || !style.layers) return;

    const layers = style.layers;

    // Layers to hide in imagery mode (buildings, land, water fills)
    const layersToHide = layers.filter(l =>
      l.type === 'fill' ||
      (l.type === 'line' && !l.id.includes('road')) ||
      l.id.includes('building') ||
      l.id.includes('landuse') ||
      l.id.includes('water') ||
      l.id.includes('background')
    ).map(l => l.id);

    // Find first label layer to insert imagery below it
    const firstLabelLayer = layers.find(l =>
      l.type === 'symbol' || l.id.includes('label') || l.id.includes('place')
    );
    const insertBeforeId = firstLabelLayer?.id;

    // Safely remove existing imagery layers
    try {
      if (mapInstance.getLayer('satellite-layer')) {
        mapInstance.removeLayer('satellite-layer');
      }
    } catch (e) { /* layer doesn't exist */ }

    try {
      if (mapInstance.getSource('satellite')) {
        mapInstance.removeSource('satellite');
      }
    } catch (e) { /* source doesn't exist */ }

    try {
      if (mapInstance.getLayer('grafcan-layer')) {
        mapInstance.removeLayer('grafcan-layer');
      }
    } catch (e) { /* layer doesn't exist */ }

    try {
      if (mapInstance.getSource('grafcan')) {
        mapInstance.removeSource('grafcan');
      }
    } catch (e) { /* source doesn't exist */ }

    if (baseLayer === 'streets') {
      // Restore hidden layers for street view
      layersToHide.forEach(layerId => {
        try {
          if (mapInstance.getLayer(layerId)) {
            mapInstance.setLayoutProperty(layerId, 'visibility', 'visible');
          }
        } catch (e) { /* ignore */ }
      });
    } else {
      // Hide fill layers for imagery views
      layersToHide.forEach(layerId => {
        try {
          if (mapInstance.getLayer(layerId)) {
            mapInstance.setLayoutProperty(layerId, 'visibility', 'none');
          }
        } catch (e) { /* ignore */ }
      });

      if (baseLayer === 'satellite') {
        // Add ESRI satellite layer
        mapInstance.addSource('satellite', {
          type: 'raster',
          tiles: [ESRI_SATELLITE_URL],
          tileSize: 256,
          attribution: '© Esri',
          maxzoom: 19,
        });
        mapInstance.addLayer(
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            paint: { 'raster-opacity': 1 },
          },
          insertBeforeId
        );
      } else if (baseLayer === 'grafcan') {
        // Add Grafcan orthophoto layer (Canary Islands only)
        mapInstance.addSource('grafcan', {
          type: 'raster',
          tiles: [GRAFCAN_ORTHO_URL],
          tileSize: 256,
          attribution: '© Grafcan - Gobierno de Canarias',
          maxzoom: 20,
        });
        mapInstance.addLayer(
          {
            id: 'grafcan-layer',
            type: 'raster',
            source: 'grafcan',
            paint: { 'raster-opacity': 1 },
          },
          insertBeforeId
        );
      }
    }
  }, [mapLoaded, baseLayer]);

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

      // Fly to initial position if provided via URL params
      if (initialLat && initialLon) {
        mapInstance.flyTo({
          center: [initialLon, initialLat],
          zoom: initialZoom || 17,
          duration: 1500,
        });
      }

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

  // Find high-value clusters (legacy mode)
  const runClusterFinder = useCallback(() => {
    if (commercialAnchors.length === 0 || buildings.length === 0) {
      setHighValueClusters([]);
      return;
    }

    const clusters = findHighValueClusters(commercialAnchors, buildings, radiusKm, 5);
    setHighValueClusters(clusters);
    setClusterFinderActive(true);

    // If clusters found, select the top one
    if (clusters.length > 0) {
      setSelectedAnchor(clusters[0].anchor);
    }
  }, [commercialAnchors, buildings, radiusKm]);

  // Clear cluster finder
  const clearClusterFinder = useCallback(() => {
    setHighValueClusters([]);
    setClusterFinderActive(false);
    setSelectedAnchor(null);
  }, []);

  // Run Energy Community finder (with scoring and CT analysis)
  const runEnergyCommunityFinder = useCallback(() => {
    if (commercialAnchors.length === 0 || buildings.length === 0) {
      setScoredClusters([]);
      return;
    }

    // Use new optimized finder with dynamic radius and deduplication
    const clusters = findEnergyCommunities(commercialAnchors, buildings, 5, true);

    // Score and rank clusters
    const scored = scoreAndRankClusters(clusters);

    // Enrich with CT analysis
    const enriched = scored.map(enrichClusterWithCTAnalysis);

    setScoredClusters(enriched);
    setEnergyCommunityMode(true);

    // Select top cluster
    if (enriched.length > 0) {
      setSelectedClusterId(enriched[0].anchor.id);
      setSelectedAnchor(enriched[0].anchor as unknown as CommercialAnchor);
    }
  }, [commercialAnchors, buildings]);

  // Clear Energy Community mode
  const clearEnergyCommunityMode = useCallback(() => {
    setScoredClusters([]);
    setEnergyCommunityMode(false);
    setSelectedClusterId(null);
    setSelectedAnchor(null);
  }, []);

  // Handle cluster selection from ranking panel
  const handleClusterSelect = useCallback((cluster: ScoredClusterResult) => {
    setSelectedClusterId(cluster.anchor.id);
    setSelectedAnchor(cluster.anchor as unknown as CommercialAnchor);

    // Fly to cluster location
    if (map.current) {
      map.current.flyTo({
        center: [cluster.anchor.lon, cluster.anchor.lat],
        zoom: 15,
        duration: 1000,
      });
    }
  }, []);

  // Auto-recompute clusters when data changes (if in Energy Community mode)
  useEffect(() => {
    if (energyCommunityMode && (buildings.length > 0 || commercialAnchors.length > 0)) {
      runEnergyCommunityFinder();
    }
  }, [buildings, commercialAnchors, energyCommunityMode, runEnergyCommunityFinder]);

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
      const score = building.score || 0;
      const markerColor = epcColorMode
        ? getEPCProspectColor(score)
        : getScoreColor(score, assessmentType);
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: ${markerColor};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${epcColorMode ? '8px' : '10px'};
        font-weight: bold;
        color: white;
      `;
      el.textContent = epcColorMode
        ? getEPCLabelFromScore(score)
        : (score ? String(Math.round(score)) : '');

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
  }, [buildings, mapLoaded, onBuildingSelect, assessmentType, epcColorMode]);

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

  // Subsidy heatmap markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing subsidy markers
    subsidyMarkers.current.forEach(marker => marker.remove());
    subsidyMarkers.current = [];

    if (subsidyHeatmapMode === 'off' || !showSubsidyHeatmap) {
      hasFlownToCanaries.current = false;
      return;
    }

    const municipalities = getMunicipalitiesForHeatmap();

    // Fly to Canary Islands when heatmap is first enabled
    if (municipalities.length > 0 && !hasFlownToCanaries.current) {
      hasFlownToCanaries.current = true;
      const canaryCenter: [number, number] = [-15.0, 28.3];
      map.current.flyTo({
        center: canaryCenter,
        zoom: 8.5,
        duration: 1000,
      });
    }

    municipalities.forEach((muni: MunicipalHeatmapPoint) => {
      const value = subsidyHeatmapMode === 'ibi'
        ? muni.ibiDiscountPct
        : muni.icioDiscountPct;

      // Create marker element
      const el = document.createElement('div');
      el.className = 'subsidy-marker';

      // Size based on value (larger = better incentive)
      const size = 16 + (value * 24); // 16-40px
      const color = getSubsidyColor(value);

      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${Math.max(10, size / 3)}px;
        font-weight: bold;
        color: white;
        opacity: 0.9;
      `;
      el.textContent = value > 0 ? `${Math.round(value * 100)}%` : '-';

      // Create popup content
      const popupContent = createSubsidyPopup(muni, subsidyHeatmapMode);

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(popupContent);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([muni.lon, muni.lat])
        .setPopup(popup)
        .addTo(map.current!);

      subsidyMarkers.current.push(marker);
    });
  }, [mapLoaded, subsidyHeatmapMode, showSubsidyHeatmap]);

  // Fetch commercial anchors on map movement (debounced, stable, additive)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear anchors when feature is disabled
    if (!showCommercialAnchors || !anchorsVisible) {
      setCommercialAnchors([]);
      lastAnchorBoundsRef.current = null;
      return;
    }

    const mapInstance = map.current;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchId = 0;

    const fetchAnchors = async () => {
      const zoom = mapInstance.getZoom();

      // Don't fetch when zoomed out too far, but keep existing anchors
      if (zoom < 12) {
        setIsLoadingAnchors(false);
        return;
      }

      const mapBounds = mapInstance.getBounds();
      // Use lower precision for cache key to avoid fetching for tiny movements
      const boundsKey = `${mapBounds.getSouth().toFixed(3)},${mapBounds.getWest().toFixed(3)},${mapBounds.getNorth().toFixed(3)},${mapBounds.getEast().toFixed(3)}`;

      // Skip if bounds haven't changed significantly
      if (boundsKey === lastAnchorBoundsRef.current) {
        return;
      }

      const bounds: BBoxBounds = {
        minLat: mapBounds.getSouth(),
        maxLat: mapBounds.getNorth(),
        minLon: mapBounds.getWest(),
        maxLon: mapBounds.getEast(),
      };

      const currentFetchId = ++fetchId;
      setIsLoadingAnchors(true);

      try {
        const result = await getCommercialAnchors(bounds, ['supermarket', 'industrial']);
        if (currentFetchId === fetchId) {
          // Merge new anchors with existing ones (additive approach)
          setCommercialAnchors(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const newAnchors = result.anchors.filter(a => !existingIds.has(a.id));
            // Keep all existing + add new ones (don't remove any)
            return [...prev, ...newAnchors];
          });
          lastAnchorBoundsRef.current = boundsKey;
        }
      } catch (error) {
        if (currentFetchId === fetchId) {
          console.error('[Map] Failed to fetch anchors:', error);
        }
      } finally {
        if (currentFetchId === fetchId) {
          setIsLoadingAnchors(false);
        }
      }
    };

    const debouncedFetch = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(fetchAnchors, 600);
    };

    // Fetch on initial load
    fetchAnchors();

    // Fetch on map idle
    mapInstance.on('idle', debouncedFetch);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      mapInstance.off('idle', debouncedFetch);
    };
  }, [mapLoaded, showCommercialAnchors, anchorsVisible]);

  // Render commercial anchor markers (stable - only update diff)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Clear all markers if feature is disabled
    if (!showCommercialAnchors || !anchorsVisible) {
      anchorMarkers.current.forEach(marker => marker.remove());
      anchorMarkers.current = [];
      return;
    }

    // Filter anchors based on layer toggles
    const filteredAnchors = commercialAnchors.filter(a => {
      if (a.type === 'supermarket' || a.type === 'retail') return layerToggles.supermarkets;
      if (a.type === 'industrial' || a.type === 'warehouse') return layerToggles.industrial;
      return true;
    });

    // Build a set of current anchor IDs
    const newAnchorIds = new Set(filteredAnchors.map(a => a.id));
    const existingMarkerMap = new Map<string, maplibregl.Marker>();

    // Keep track of which markers to keep
    const markersToKeep: maplibregl.Marker[] = [];

    // Remove markers that are no longer in the data
    anchorMarkers.current.forEach(marker => {
      const markerId = (marker.getElement() as HTMLElement).dataset.anchorId;
      if (markerId && newAnchorIds.has(markerId)) {
        existingMarkerMap.set(markerId, marker);
        markersToKeep.push(marker);
      } else {
        marker.remove();
      }
    });

    // Add new markers that don't exist yet
    filteredAnchors.forEach(anchor => {
      if (existingMarkerMap.has(anchor.id)) {
        return; // Already exists, skip
      }

      // Create marker element
      const el = document.createElement('div');
      el.className = 'anchor-marker';
      el.dataset.anchorId = anchor.id;

      const color = getAnchorColor(anchor.type);
      const label = getAnchorLabel(anchor.type);

      el.style.cssText = `
        width: 28px;
        height: 28px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      // SVG icons for anchor types
      const icon = anchor.type === 'supermarket'
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>`;
      el.innerHTML = icon;

      // Build popup content with available details
      const details: string[] = [];
      if (anchor.brand && anchor.brand !== anchor.name) {
        details.push(anchor.brand);
      }
      if (anchor.industrialType) {
        details.push(anchor.industrialType.charAt(0).toUpperCase() + anchor.industrialType.slice(1));
      }
      if (anchor.product) {
        details.push(anchor.product);
      }
      if (anchor.operator && anchor.operator !== anchor.brand) {
        details.push(`Op: ${anchor.operator}`);
      }

      const popupContent = `
        <div style="padding: 8px; min-width: 160px; max-width: 220px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #222f30;">
            ${anchor.name || label}
          </div>
          <div style="font-size: 11px; color: #666; display: flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
            ${label}
          </div>
          ${details.length > 0 ? `<div style="font-size: 10px; color: #888; margin-top: 4px; border-top: 1px solid #eee; padding-top: 4px;">${details.join(' · ')}</div>` : ''}
          ${anchor.description ? `<div style="font-size: 10px; color: #666; margin-top: 4px; font-style: italic;">${anchor.description}</div>` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(popupContent);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([anchor.lon, anchor.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      // Show/hide popup on hover using marker's togglePopup
      el.addEventListener('mouseenter', () => {
        if (!marker.getPopup().isOpen()) {
          marker.togglePopup();
        }
      });
      el.addEventListener('mouseleave', () => {
        if (marker.getPopup().isOpen()) {
          marker.togglePopup();
        }
      });

      // Click to select/deselect anchor and show radius circle
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedAnchor(prev => prev?.id === anchor.id ? null : anchor);
      });

      markersToKeep.push(marker);
    });

    anchorMarkers.current = markersToKeep;
  }, [mapLoaded, showCommercialAnchors, anchorsVisible, commercialAnchors, layerToggles.supermarkets, layerToggles.industrial]);

  // Fetch VVs when visible and map moves (zoom >= 14 for performance)
  useEffect(() => {
    if (!map.current || !mapLoaded || !vvsVisible) {
      setVvs([]);
      lastVvBoundsRef.current = null;
      return;
    }

    const mapInstance = map.current;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchId = 0;

    const fetchVvs = async () => {
      const zoom = mapInstance.getZoom();

      // Only fetch at zoom >= 14 (neighborhood level)
      if (zoom < 14) {
        setIsLoadingVvs(false);
        return;
      }

      const mapBounds = mapInstance.getBounds();
      const boundsKey = `${mapBounds.getSouth().toFixed(3)},${mapBounds.getWest().toFixed(3)},${mapBounds.getNorth().toFixed(3)},${mapBounds.getEast().toFixed(3)}`;

      if (boundsKey === lastVvBoundsRef.current) {
        return;
      }

      const currentFetchId = ++fetchId;
      setIsLoadingVvs(true);

      try {
        const params = new URLSearchParams({
          minLat: mapBounds.getSouth().toString(),
          maxLat: mapBounds.getNorth().toString(),
          minLon: mapBounds.getWest().toString(),
          maxLon: mapBounds.getEast().toString(),
          limit: '500',
        });

        const response = await fetch(`/api/vv/bounds?${params}`);
        if (!response.ok) throw new Error('Failed to fetch VVs');

        const data = await response.json();

        if (currentFetchId === fetchId && data.vvs) {
          setVvs(prev => {
            const existingIds = new Set(prev.map(v => v.id));
            const newVvs = data.vvs.filter((v: { id: string }) => !existingIds.has(v.id));
            return [...prev, ...newVvs];
          });
          lastVvBoundsRef.current = boundsKey;
        }
      } catch (error) {
        if (currentFetchId === fetchId) {
          console.error('[Map] Failed to fetch VVs:', error);
        }
      } finally {
        if (currentFetchId === fetchId) {
          setIsLoadingVvs(false);
        }
      }
    };

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchVvs, 600);
    };

    fetchVvs();
    mapInstance.on('idle', debouncedFetch);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      mapInstance.off('idle', debouncedFetch);
    };
  }, [mapLoaded, vvsVisible]);

  // Render VV markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Clear markers if VVs disabled
    if (!vvsVisible) {
      vvMarkers.current.forEach(marker => marker.remove());
      vvMarkers.current = [];
      return;
    }

    // Check if VV belongs to currently selected group
    // Handles: firm name, complex name, or location-based groupIds (loc:lat,lon)
    const locationKey = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const isHighlighted = (vv: typeof vvs[0]) => {
      if (!selectedVvGroup) return false;
      if (selectedVvGroup.groupId.startsWith('loc:')) {
        const locKey = locationKey(vv.lat, vv.lon);
        return `loc:${locKey}` === selectedVvGroup.groupId;
      }
      // Match by firm name, complex name, or groupId
      return (
        vv.managementFirm === selectedVvGroup.groupId ||
        vv.complexName === selectedVvGroup.groupId ||
        vv.groupId === selectedVvGroup.groupId
      );
    };

    // Filter VVs based on layer toggles
    const filteredVvs = vvs.filter(vv => {
      if (vv.managementFirm) return layerToggles.vvFirms;
      if (vv.complexName) return layerToggles.vvComplexes;
      return layerToggles.vvIndividual;
    });

    // Group VVs at the same location (within ~10m) to avoid stacking
    const vvClusters = new Map<string, typeof filteredVvs>();
    filteredVvs.forEach(vv => {
      const key = locationKey(vv.lat, vv.lon);
      if (!vvClusters.has(key)) {
        vvClusters.set(key, []);
      }
      vvClusters.get(key)!.push(vv);
    });

    // Clear all markers and re-render (simpler than tracking changes)
    vvMarkers.current.forEach(marker => marker.remove());
    vvMarkers.current = [];

    // VV type colors and icons
    const VV_STYLES = {
      firm: {
        color: '#8b5cf6',      // Purple
        highlightColor: '#6d28d9',
        icon: (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>`,
        label: 'Gestora',
        popupIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>`,
      },
      complex: {
        color: '#f59e0b',      // Amber/Orange
        highlightColor: '#d97706',
        icon: (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>`,
        label: 'Complejo',
        popupIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01"/></svg>`,
      },
      individual: {
        color: '#06b6d4',      // Cyan
        highlightColor: '#0891b2',
        icon: (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
        label: 'VV',
        popupIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
      },
    };

    // Add markers for clustered VVs (one marker per unique location)
    vvClusters.forEach((clusterVvs, _locKey) => {
      // Use the first VV as the representative
      const vv = clusterVvs[0];
      const clusterCount = clusterVvs.length;
      const isCluster = clusterCount > 1;

      // Check if any VV in cluster is highlighted
      const highlighted = clusterVvs.some(v => isHighlighted(v));
      // VV has a group if it has a groupId (address-based, complex name, or management firm)
      const hasGroup = !!vv.groupId;
      // Get display label for the group
      const groupLabel = vv.managementFirm || vv.complexName || vv.name;

      // Determine VV type for styling (use first VV's type)
      const vvType = vv.managementFirm ? 'firm' : vv.complexName ? 'complex' : 'individual';
      const style = VV_STYLES[vvType];

      // Larger size for clusters
      const baseSize = isCluster ? 26 : 20;
      const highlightedSize = isCluster ? 32 : 28;
      const iconSize = highlighted ? 14 : (isCluster ? 12 : 10);

      const el = document.createElement('div');
      el.dataset.vvId = vv.id;
      el.dataset.groupId = vv.groupId || '';
      el.style.cssText = `
        width: ${highlighted ? highlightedSize : baseSize}px;
        height: ${highlighted ? highlightedSize : baseSize}px;
        background: ${highlighted ? style.highlightColor : style.color};
        border: ${highlighted ? '3px solid #fbbf24' : '2px solid white'};
        border-radius: 50%;
        cursor: ${hasGroup || isCluster ? 'pointer' : 'default'};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${highlighted ? '0 0 14px 5px rgba(251,191,36,0.7)' : '0 2px 4px rgba(0,0,0,0.3)'};
        font-size: 10px;
        color: white;
        font-weight: bold;
        z-index: ${highlighted ? '100' : '10'};
        transition: all 0.15s ease;
      `;

      // Show count badge for clusters, icon for single VVs
      if (isCluster) {
        el.innerHTML = `<span style="font-size:11px;font-weight:700">${clusterCount}</span>`;
      } else {
        el.innerHTML = style.icon(iconSize);
      }

      // Build title/tooltip
      const totalPlazas = clusterVvs.reduce((sum, v) => sum + v.plazas, 0);
      el.title = isCluster
        ? `${clusterCount} VVs (${totalPlazas} plazas total)`
        : `${vv.name} (${vv.plazas} plazas)${vv.managementFirm ? ` - ${vv.managementFirm}` : vv.complexName ? ` - ${vv.complexName}` : ''}`;

      // Build popup content
      let popupContent: string;
      if (isCluster) {
        // Show summary for clusters
        const vvList = clusterVvs.slice(0, 5).map(v => {
          const typeIcon = v.managementFirm ? VV_STYLES.firm.popupIcon : v.complexName ? VV_STYLES.complex.popupIcon : VV_STYLES.individual.popupIcon;
          return `<div style="font-size:10px;display:flex;align-items:center;gap:4px;margin-top:2px">${typeIcon} ${v.name} (${v.plazas}p)</div>`;
        }).join('');
        const moreCount = clusterCount > 5 ? `<div style="font-size:9px;color:#999;margin-top:2px">+${clusterCount - 5} más...</div>` : '';

        popupContent = `
          <div style="padding:8px;min-width:160px">
            <div style="font-weight:600;font-size:12px">${clusterCount} VVs en este edificio</div>
            <div style="font-size:11px;color:#666;margin-top:4px">${totalPlazas} plazas total</div>
            <div style="margin-top:6px;border-top:1px solid #eee;padding-top:6px">
              ${vvList}
              ${moreCount}
            </div>
            ${hasGroup ? `<div style="font-size:9px;color:#0891b2;margin-top:4px;font-style:italic">Clic para resaltar grupo</div>` : ''}
          </div>
        `;
      } else {
        // Single VV popup
        const enrichmentInfo = vv.managementFirm
          ? `<div style="font-size:10px;color:#8b5cf6;margin-top:3px;display:flex;align-items:center;gap:4px">${VV_STYLES.firm.popupIcon} ${vv.managementFirm}</div>`
          : vv.complexName
            ? `<div style="font-size:10px;color:#f59e0b;margin-top:3px;display:flex;align-items:center;gap:4px">${VV_STYLES.complex.popupIcon} ${vv.complexName}</div>`
            : vv.groupId
              ? `<div style="font-size:10px;color:#06b6d4;margin-top:3px;display:flex;align-items:center;gap:4px">${VV_STYLES.individual.popupIcon} Misma dirección</div>`
              : '';

        const clickHint = hasGroup
          ? `<div style="font-size:9px;color:#0891b2;margin-top:4px;font-style:italic">Clic para resaltar grupo</div>`
          : '';

        popupContent = `
          <div style="padding:8px;min-width:140px">
            <div style="font-weight:600;font-size:12px">${vv.name}</div>
            <div style="font-size:11px;color:#666;margin-top:4px">${vv.plazas} plazas</div>
            ${enrichmentInfo}
            <div style="font-size:10px;color:#999;margin-top:2px">${vv.id}</div>
            ${clickHint}
          </div>
        `;
      }

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false, className: 'vv-popup-high-z' }).setHTML(popupContent);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([vv.lon, vv.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      // Show popup on hover and ensure it's on top
      el.addEventListener('mouseenter', () => {
        marker.togglePopup();
        // Ensure popup is above markers
        const popupEl = marker.getPopup()?.getElement();
        if (popupEl) {
          popupEl.style.zIndex = '1000';
        }
      });
      el.addEventListener('mouseleave', () => {
        if (marker.getPopup()?.isOpen()) {
          marker.togglePopup();
        }
      });

      // Click handler to select group
      // Prioritize firm/complex grouping over location-based grouping
      const locKey = locationKey(vv.lat, vv.lon);
      // Use management firm or complex for grouping if available, otherwise fall back to location for clusters
      const effectiveGroupId = vv.managementFirm || vv.complexName || (isCluster ? `loc:${locKey}` : vv.groupId);
      const effectiveLabel = vv.managementFirm || vv.complexName || (isCluster ? `${clusterCount} VVs` : groupLabel);

      if (effectiveGroupId) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const currentGroup = selectedVvGroupRef.current;
          // Toggle: if same group, deselect; otherwise select this group
          if (currentGroup?.groupId === effectiveGroupId) {
            setSelectedVvGroup(null);
          } else {
            setSelectedVvGroup({ groupId: effectiveGroupId, label: effectiveLabel });
          }
        });
      }

      vvMarkers.current.push(marker);
    });
  }, [mapLoaded, vvsVisible, vvs, selectedVvGroup, layerToggles.vvFirms, layerToggles.vvComplexes, layerToggles.vvIndividual]);

  // Render radius circle around selected anchor
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const sourceId = 'anchor-radius-circle';
    const fillLayerId = 'anchor-radius-fill';
    const lineLayerId = 'anchor-radius-line';

    // Remove existing circle layers/source
    if (mapInstance.getLayer(fillLayerId)) {
      mapInstance.removeLayer(fillLayerId);
    }
    if (mapInstance.getLayer(lineLayerId)) {
      mapInstance.removeLayer(lineLayerId);
    }
    if (mapInstance.getSource(sourceId)) {
      mapInstance.removeSource(sourceId);
    }

    // If no anchor selected, we're done
    if (!selectedAnchor) return;

    // Generate circle polygon
    const circleCoords = generateCirclePolygon(
      selectedAnchor.lat,
      selectedAnchor.lon,
      radiusKm,
      64
    );

    // Find buildings within radius
    const buildingsInRadius = findBuildingsInRadius(selectedAnchor, buildings, radiusKm);
    const totalSavings = buildingsInRadius.reduce((sum, b) => sum + (b.annualSavingsEur || 0), 0);

    // Add source
    mapInstance.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {
          buildingCount: buildingsInRadius.length,
          totalSavings,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [circleCoords],
        },
      },
    });

    // Add semi-transparent fill layer
    mapInstance.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#a7e26e',
        'fill-opacity': 0.15,
      },
    });

    // Add dashed stroke layer
    mapInstance.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#a7e26e',
        'line-width': 2,
        'line-dasharray': [4, 4],
      },
    });
  }, [mapLoaded, selectedAnchor, radiusKm, buildings]);

  // Update anchor marker styles when selection or clusters change
  useEffect(() => {
    const clusterAnchorIds = new Set(highValueClusters.map(c => c.anchor.id));

    anchorMarkers.current.forEach(marker => {
      const el = marker.getElement() as HTMLElement;
      const anchorId = el.dataset.anchorId;
      const isSelected = selectedAnchor?.id === anchorId;
      const isCluster = anchorId && clusterAnchorIds.has(anchorId);

      // Update border style for selected anchor
      if (isSelected) {
        el.style.border = '3px solid #a7e26e';
        el.style.boxShadow = '0 0 0 4px rgba(167, 226, 110, 0.4), 0 2px 6px rgba(0,0,0,0.3)';
        el.style.transform = 'scale(1.15)';
        el.style.zIndex = '10';
      } else if (isCluster && clusterFinderActive) {
        // Highlight cluster anchors with pulsing effect
        el.style.border = '3px solid #16a34a';
        el.style.boxShadow = '0 0 0 3px rgba(22, 163, 74, 0.3), 0 2px 6px rgba(0,0,0,0.3)';
        el.style.transform = 'scale(1.1)';
        el.style.zIndex = '5';
      } else {
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        el.style.transform = 'scale(1)';
        el.style.zIndex = '1';
      }
    });
  }, [selectedAnchor, highValueClusters, clusterFinderActive]);

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
          {/* Base layer selector */}
          <div className="flex bg-white rounded-lg shadow-md overflow-hidden">
            <button
              onClick={() => setBaseLayer('streets')}
              disabled={!mapLoaded}
              className={`px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                baseLayer === 'streets'
                  ? 'bg-[#222f30] text-white'
                  : 'text-[#222f30] hover:bg-gray-100'
              }`}
              title="Vista mapa"
            >
              Mapa
            </button>
            <button
              onClick={() => setBaseLayer('satellite')}
              disabled={!mapLoaded}
              className={`px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 border-x border-gray-200 ${
                baseLayer === 'satellite'
                  ? 'bg-[#222f30] text-white'
                  : 'text-[#222f30] hover:bg-gray-100'
              }`}
              title="Vista satelite (ESRI)"
            >
              Satelite
            </button>
            <button
              onClick={() => setBaseLayer('grafcan')}
              disabled={!mapLoaded}
              className={`px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                baseLayer === 'grafcan'
                  ? 'bg-[#222f30] text-white'
                  : 'text-[#222f30] hover:bg-gray-100'
              }`}
              title="Ortofoto Grafcan 2024 (Canarias)"
            >
              Ortofotos
            </button>
          </div>
        </div>

        {/* Subsidy heatmap toggle */}
        {showSubsidyHeatmap && mapLoaded && (
          <div className="flex gap-1 bg-white rounded-lg shadow-md p-1">
            <button
              onClick={() => setSubsidyHeatmapMode(subsidyHeatmapMode === 'ibi' ? 'off' : 'ibi')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                subsidyHeatmapMode === 'ibi'
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Mostrar bonificaciones IBI (Impuesto sobre Bienes Inmuebles)"
            >
              IBI
            </button>
            <button
              onClick={() => setSubsidyHeatmapMode(subsidyHeatmapMode === 'icio' ? 'off' : 'icio')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                subsidyHeatmapMode === 'icio'
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Mostrar bonificaciones ICIO (Impuesto sobre Construcciones)"
            >
              ICIO
            </button>
          </div>
        )}

        {/* EPC color mode toggle - only show when buildings are visible */}
        {buildings.length > 0 && mapLoaded && (
          <button
            onClick={() => setEpcColorMode(!epcColorMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-md transition-colors ${
              epcColorMode
                ? 'bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            title="Modo EPC: Colorea edificios por potencial de mejora energética (rojo = mejor prospecto)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            EPC
          </button>
        )}

        {/* Energy Community Mode button - standalone, visible when buildings loaded */}
        {buildings.length > 0 && mapLoaded && (
          <button
            onClick={energyCommunityMode ? clearEnergyCommunityMode : runEnergyCommunityFinder}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-md transition-colors ${
              energyCommunityMode
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            title="Modo Comunidad Energética: Evaluación con scoring, ROI y cumplimiento legal"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="8" strokeDasharray="2 2" />
            </svg>
            {energyCommunityMode ? (
              <>
                CE ({scoredClusters.length})
                <span className="ml-1 opacity-60">×</span>
              </>
            ) : (
              'Com. Energética'
            )}
          </button>
        )}

        {/* Layer toggles - 5 compact buttons */}
        {showCommercialAnchors && mapLoaded && (() => {
          // Calculate counts
          const supermarketCount = commercialAnchors.filter(a => a.type === 'supermarket' || a.type === 'retail').length;
          const industrialCount = commercialAnchors.filter(a => a.type === 'industrial' || a.type === 'warehouse').length;
          const vvFirmCount = vvs.filter(v => v.managementFirm).length;
          const vvComplexCount = vvs.filter(v => !v.managementFirm && v.complexName).length;
          const vvIndividualCount = vvs.filter(v => !v.managementFirm && !v.complexName).length;

          const toggles = [
            { key: 'supermarkets' as const, color: '#f59e0b', count: supermarketCount, title: 'Supermercados',
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>` },
            { key: 'industrial' as const, color: '#ef4444', count: industrialCount, title: 'Naves Industriales',
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>` },
            { key: 'vvFirms' as const, color: '#8b5cf6', count: vvFirmCount, title: 'Gestora Inmobiliaria',
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>` },
            { key: 'vvComplexes' as const, color: '#f59e0b', count: vvComplexCount, title: 'Complejo/Resort',
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01"/></svg>` },
            { key: 'vvIndividual' as const, color: '#06b6d4', count: vvIndividualCount, title: 'VV Individual',
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
          ];

          // Auto-enable anchors/VVs when any toggle is clicked
          const handleToggle = (key: keyof typeof layerToggles) => {
            toggleLayer(key);
            // Enable parent layer if needed
            if ((key === 'supermarkets' || key === 'industrial') && !anchorsVisible) {
              setAnchorsVisible(true);
            }
            if ((key === 'vvFirms' || key === 'vvComplexes' || key === 'vvIndividual') && !vvsVisible) {
              setVvsVisible(true);
            }
          };

          return (
            <div className="flex flex-col gap-2">
              {/* Compact toggle grid - 2 rows */}
              <div className="flex flex-wrap gap-1.5 bg-white rounded-lg shadow-md p-1.5">
                {toggles.map(({ key, color, count, title, icon }) => {
                  const isActive = layerToggles[key];
                  const isVvType = key.startsWith('vv');
                  const isLoading = isVvType ? isLoadingVvs : isLoadingAnchors;
                  const showCount = isVvType ? vvsVisible : anchorsVisible;

                  return (
                    <button
                      key={key}
                      onClick={() => handleToggle(key)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      style={{
                        backgroundColor: isActive ? color : undefined,
                        color: isActive ? 'white' : color,
                      }}
                      title={title}
                    >
                      {isLoading ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span dangerouslySetInnerHTML={{ __html: icon }} />
                      )}
                      {showCount && count > 0 && (
                        <span className={`text-[10px] font-semibold ${isActive ? 'text-white/90' : ''}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Radius selector and cluster finder when anchors visible */}
              {anchorsVisible && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-1">
                  <span className="text-xs text-gray-500">Radio:</span>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="text-xs border-0 bg-transparent text-[#222f30] font-medium focus:outline-none cursor-pointer"
                  >
                    <option value={1}>1 km</option>
                    <option value={2}>2 km</option>
                    <option value={5}>5 km</option>
                  </select>
                </div>

                {/* Cluster Finder button (legacy) */}
                {buildings.length > 0 && !energyCommunityMode && (
                  <button
                    onClick={clusterFinderActive ? clearClusterFinder : runClusterFinder}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-md transition-colors ${
                      clusterFinderActive
                        ? 'bg-[#a7e26e] text-[#222f30]'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Encontrar clusters de alto valor (anclajes con 5+ edificios en radio)"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <circle cx="12" cy="12" r="8" strokeDasharray="4 4" />
                    </svg>
                    {clusterFinderActive ? (
                      <>
                        Clusters ({highValueClusters.length})
                        <span className="ml-1 opacity-60">×</span>
                      </>
                    ) : (
                      'Cluster Finder'
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          );
        })()}
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

      {/* Subsidy Heatmap Legend */}
      {mapLoaded && subsidyHeatmapMode !== 'off' && showSubsidyHeatmap && (
        <div className="absolute bottom-8 left-4 z-10">
          <div className="bg-white rounded-lg shadow-md p-3 text-xs">
            <div className="font-medium text-gray-700 mb-2">
              Bonificación {subsidyHeatmapMode === 'ibi' ? 'IBI' : 'ICIO'}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: '#16a34a' }} />
                <span className="text-gray-600">90-100%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: '#22c55e' }} />
                <span className="text-gray-600">50-89%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: '#facc15' }} />
                <span className="text-gray-600">25-49%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: '#fb923c' }} />
                <span className="text-gray-600">1-24%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: '#9ca3af' }} />
                <span className="text-gray-600">Sin bonificación</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Gran Canaria + Fuerteventura
            </p>
          </div>
        </div>
      )}

      {/* EPC Mode Legend */}
      {mapLoaded && epcColorMode && buildings.length > 0 && (
        <div className="absolute bottom-8 left-4 z-10">
          <div className="bg-white rounded-lg shadow-md p-3 text-xs">
            <div className="font-medium text-gray-700 mb-2">Potencial Energético (EPC)</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: '#ef4444' }}>
                  F-G
                </div>
                <span className="text-gray-600">Alto potencial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: '#fb923c' }}>
                  E
                </div>
                <span className="text-gray-600">Buen potencial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: '#facc15' }}>
                  D
                </div>
                <span className="text-gray-600">Potencial medio</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: '#a7e26e' }}>
                  C
                </div>
                <span className="text-gray-600">Bajo potencial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: '#16a34a' }}>
                  A-B
                </div>
                <span className="text-gray-600">Ya eficiente</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Rojo = mejor prospecto solar/batería
            </p>
          </div>
        </div>
      )}

      {/* Commercial Anchors Legend */}
      {mapLoaded && showCommercialAnchors && anchorsVisible && commercialAnchors.length > 0 && !selectedAnchor && (
        <div className="absolute bottom-20 right-4 z-10">
          <div className="bg-white rounded-lg shadow-md p-3 text-xs">
            <div className="font-medium text-gray-700 mb-2">Anclajes Comerciales</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center" style={{ backgroundColor: '#f59e0b' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                </div>
                <span className="text-gray-600">Supermercado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center" style={{ backgroundColor: '#ef4444' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                  </svg>
                </div>
                <span className="text-gray-600">Nave Industrial</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Clic para ver radio · {commercialAnchors.length} encontrados
            </p>
          </div>
        </div>
      )}

      {/* Selected VV Group Panel */}
      {mapLoaded && vvsVisible && selectedVvGroup && (() => {
        // Handle different grouping types: firm name, complex name, or location-based
        const isLocationGroup = selectedVvGroup.groupId.startsWith('loc:');
        const groupVvs = isLocationGroup
          ? vvs.filter(vv => {
              const locKey = `${vv.lat.toFixed(4)},${vv.lon.toFixed(4)}`;
              return `loc:${locKey}` === selectedVvGroup.groupId;
            })
          : vvs.filter(vv =>
              // Match by firm name, complex name, or groupId
              vv.managementFirm === selectedVvGroup.groupId ||
              vv.complexName === selectedVvGroup.groupId ||
              vv.groupId === selectedVvGroup.groupId
            );
        const totalPlazas = groupVvs.reduce((sum, vv) => sum + vv.plazas, 0);
        // Determine type for styling
        const firstVv = groupVvs[0];
        const isFirm = !!firstVv?.managementFirm;
        const isComplex = !!firstVv?.complexName;
        const borderColor = isFirm ? '#8b5cf6' : isComplex ? '#f59e0b' : '#06b6d4';
        return (
          <div className="absolute top-20 right-4 z-20">
            <div className="bg-white rounded-lg shadow-lg p-4 text-xs min-w-[220px] border-l-4" style={{ borderLeftColor: borderColor }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: borderColor }}>
                    {isFirm ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/>
                      </svg>
                    ) : isComplex ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
                        <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01"/>
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                    )}
                  </div>
                  <div className="font-semibold text-[#222f30] truncate max-w-[150px]">
                    {selectedVvGroup.label}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedVvGroup(null)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
                  title="Cerrar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>VVs en vista:</span>
                  <span className="font-semibold text-cyan-600">{groupVvs.length}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total plazas:</span>
                  <span className="font-semibold text-cyan-600">{totalPlazas}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Media plazas/VV:</span>
                  <span className="font-semibold text-cyan-600">
                    {groupVvs.length > 0 ? (totalPlazas / groupVvs.length).toFixed(1) : 0}
                  </span>
                </div>
              </div>
              <p className="text-[10px] mt-3 italic" style={{ color: borderColor }}>
                {isFirm ? 'Gestora inmobiliaria' : isComplex ? 'Complejo/Resort' : 'Misma dirección'}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Energy Community Ranking Panel */}
      {mapLoaded && energyCommunityMode && scoredClusters.length > 0 && (
        <ClusterRankingPanel
          clusters={scoredClusters}
          selectedClusterId={selectedClusterId}
          onClusterSelect={handleClusterSelect}
          onClose={clearEnergyCommunityMode}
        />
      )}

      {/* Selected Anchor Cluster Info */}
      {mapLoaded && selectedAnchor && !energyCommunityMode && (
        <div className="absolute bottom-20 right-4 z-10">
          <div className="bg-white rounded-lg shadow-lg p-4 text-xs min-w-[200px]">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-[#222f30] truncate max-w-[150px]">
                {selectedAnchor.name || getAnchorLabel(selectedAnchor.type)}
              </div>
              <button
                onClick={() => setSelectedAnchor(null)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2 border-t pt-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Radio de análisis</span>
                <span className="font-medium text-[#222f30]">{radiusKm} km</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Edificios en zona</span>
                <span className="font-medium text-[#222f30]">
                  {findBuildingsInRadius(selectedAnchor, buildings, radiusKm).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Ahorro potencial</span>
                <span className="font-bold text-[#a7e26e]">
                  {findBuildingsInRadius(selectedAnchor, buildings, radiusKm)
                    .reduce((sum, b) => sum + (b.annualSavingsEur || 0), 0)
                    .toLocaleString('es-ES')} €/año
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t">
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <div className="w-3 h-3 rounded-full bg-[#a7e26e] opacity-30"></div>
                <span>Área de cobertura {radiusKm}km</span>
              </div>
            </div>
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

/**
 * Get EPC-style color based on prospect score
 * INVERTED: High prospect score = Poor EPC = Best target = Red/Orange
 * This shows which buildings have the most to gain from solar/battery
 *
 * EPC Rating colors (official):
 * A (dark green) → G (red)
 *
 * But for PROSPECT scoring, we invert:
 * High prospect (80+) = likely poor EPC = RED (best target!)
 * Low prospect (0-20) = likely good EPC = GREEN (already efficient)
 */
function getEPCProspectColor(score: number): string {
  // EPC-style colors but INVERTED for prospect scoring
  // High score = poor efficiency = best prospect = warm colors
  if (score >= 80) return '#ef4444'; // Red - EPC G/F equivalent - BEST prospects
  if (score >= 60) return '#fb923c'; // Orange - EPC E equivalent
  if (score >= 40) return '#facc15'; // Yellow - EPC D equivalent
  if (score >= 20) return '#a7e26e'; // Light green - EPC C equivalent
  return '#16a34a';                   // Green - EPC A/B equivalent - already efficient
}

/**
 * Get EPC label from score
 */
function getEPCLabelFromScore(score: number): string {
  if (score >= 80) return 'F-G'; // Poor efficiency
  if (score >= 60) return 'E';
  if (score >= 40) return 'D';
  if (score >= 20) return 'C';
  return 'A-B'; // Good efficiency
}

// Helper function to get color for subsidy heatmap
function getSubsidyColor(value: number): string {
  if (value >= 0.9) return '#16a34a';  // Green - excellent
  if (value >= 0.5) return '#22c55e';  // Light green - good
  if (value >= 0.25) return '#facc15'; // Yellow - moderate
  if (value > 0) return '#fb923c';     // Orange - low
  return '#9ca3af';                     // Gray - none
}

// Helper function to create popup content for subsidy markers
function createSubsidyPopup(muni: MunicipalHeatmapPoint, mode: 'ibi' | 'icio'): string {
  const ibiText = muni.ibiDiscountPct > 0
    ? `${Math.round(muni.ibiDiscountPct * 100)}% x ${muni.ibiDurationYrs} años`
    : 'No aplica';

  const icioText = muni.icioDiscountPct > 0
    ? `${Math.round(muni.icioDiscountPct * 100)}%`
    : 'No aplica';

  const notesHtml = muni.notes ? `<p style="font-size:10px;color:#666;margin-top:4px;font-style:italic">${muni.notes}</p>` : '';

  return `
    <div style="padding:8px;min-width:160px">
      <h4 style="font-weight:600;margin:0 0 6px 0;font-size:13px">${muni.name}</h4>
      <p style="font-size:11px;color:#666;margin:0 0 8px 0">${muni.island}</p>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px">
        <div style="display:flex;justify-content:space-between;${mode === 'ibi' ? 'font-weight:600' : ''}">
          <span>IBI:</span>
          <span style="color:${muni.ibiDiscountPct > 0 ? '#16a34a' : '#9ca3af'}">${ibiText}</span>
        </div>
        <div style="display:flex;justify-content:space-between;${mode === 'icio' ? 'font-weight:600' : ''}">
          <span>ICIO:</span>
          <span style="color:${muni.icioDiscountPct > 0 ? '#16a34a' : '#9ca3af'}">${icioText}</span>
        </div>
      </div>
      ${notesHtml}
    </div>
  `;
}
