'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { area as turfArea } from '@turf/area';
import { BBoxBounds, BuildingResult, AssessmentType } from './types';
import { VULNERABILITY_ZONES } from '@/lib/data/vulnerability-zones';
import { getMunicipalitiesForHeatmap, type MunicipalHeatmapPoint } from '@/lib/services/incentives/municipal-lookup';
import { getCommercialAnchors, getAnchorColor, getAnchorLabel, getTransformers, getOperatorColor, type CommercialAnchor } from '@/lib/services/osm-overpass';
import type { CTLocation } from './types';
import { generateCirclePolygon, findBuildingsInRadius, findHighValueClusters, findEnergyCommunities, getRadiusForAnchor, type ClusterResult } from '@/lib/services/cluster-finder';
import { scoreAndRankClusters } from '@/lib/services/cluster-scorer';
import { enrichClusterWithCTAnalysis } from '@/lib/services/ct-heuristic';
import { ClusterRankingPanel } from './ClusterRankingPanel';
import type { ScoredClusterResult } from './types';
import type { SavedLocation } from '@/lib/supabase/types';
import { ASSESSMENT_CONFIG, getRegionalKwhPerKwp } from '@/lib/config/assessment-config';

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
  gestoraFilter?: string;
  savedLocations?: SavedLocation[];
  onSavePin?: (lat: number, lon: number, name: string) => Promise<void>;
  onDeleteSavedLocation?: (id: string) => Promise<void>;
  onUpdateSavedLocationColor?: (id: string, color: string) => Promise<void>;
  onPromoteToLead?: (locationId: string) => Promise<void>;
  onViewChange?: (center: { lat: number; lon: number }, zoom: number) => void;
}

interface SolarEstimate {
  panelCount: number;
  systemKwp: number;
  annualKwh: number;
  annualSavingsEur: number;
  installationCost: number;
  paybackYears: number;
}

function computeSolarEstimate(areaM2: number, lat: number, usablePercent: number = 60): SolarEstimate {
  const usableArea = areaM2 * (usablePercent / 100);
  const panelCount = Math.floor(usableArea / 2);
  if (panelCount <= 0) return { panelCount: 0, systemKwp: 0, annualKwh: 0, annualSavingsEur: 0, installationCost: 0, paybackYears: 0 };
  const systemKwp = (panelCount * ASSESSMENT_CONFIG.PANEL_WATTS) / 1000;
  const annualKwh = systemKwp * getRegionalKwhPerKwp(lat);
  const installationCost = systemKwp * ASSESSMENT_CONFIG.INSTALLATION_COST_PER_KW;
  const annualSavingsEur = annualKwh * ASSESSMENT_CONFIG.DEFAULT_ELECTRICITY_PRICE_EUR;

  // Iterative payback with degradation
  let cumulativeSavings = 0;
  let paybackYears: number = ASSESSMENT_CONFIG.SYSTEM_LIFETIME_YEARS;
  for (let y = 1; y <= ASSESSMENT_CONFIG.SYSTEM_LIFETIME_YEARS; y++) {
    const degraded = annualSavingsEur * Math.pow(1 - ASSESSMENT_CONFIG.PANEL_DEGRADATION_RATE, y - 1);
    cumulativeSavings += degraded;
    if (cumulativeSavings >= installationCost) {
      paybackYears = y;
      break;
    }
  }

  return { panelCount, systemKwp, annualKwh, annualSavingsEur, installationCost, paybackYears };
}

// Nominatim geocoding endpoint
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

// MapLibre style - using free CartoCDN tiles
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// Gran Canaria center (Las Palmas)
const DEFAULT_CENTER: [number, number] = [-15.4134, 28.0997];
const DEFAULT_ZOOM = 11;

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
  gestoraFilter,
  savedLocations = [],
  onSavePin,
  onDeleteSavedLocation,
  onUpdateSavedLocationColor,
  onPromoteToLead,
  onViewChange,
}: ProspectMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const drawVerticesRef = useRef<[number, number][]>([]);
  const drawCursorRef = useRef<[number, number] | null>(null);
  const [vulnerabilityVisible, setVulnerabilityVisible] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayerMode>('streets');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // subsidyHeatmapMode is now derived from layerToggles (defined below)
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
  // Solar grants layer
  const [solarGrants, setSolarGrants] = useState<Array<{ id: number; companyName: string; grantAmount: number; grantDate: string; municipality: string; lat: number; lon: number }>>([]);
  const [isLoadingSolarGrants, setIsLoadingSolarGrants] = useState(false);
  const solarGrantMarkers = useRef<maplibregl.Marker[]>([]);
  const lastSolarGrantsBoundsRef = useRef<string | null>(null);

  // CT (Centro de Transformación) layer
  const [ctLocations, setCTLocations] = useState<CTLocation[]>([]);
  const [isLoadingCTs, setIsLoadingCTs] = useState(false);
  const ctMarkers = useRef<maplibregl.Marker[]>([]);
  const lastCTBoundsRef = useRef<string | null>(null);
  // Gas stations layer
  const [gasStations, setGasStations] = useState<CommercialAnchor[]>([]);
  const [isLoadingGasStations, setIsLoadingGasStations] = useState(false);
  const gasStationMarkers = useRef<maplibregl.Marker[]>([]);
  // Saved locations markers
  const savedLocationMarkers = useRef<maplibregl.Marker[]>([]);
  // Partner installer locations
  const [installerLocations, setInstallerLocations] = useState<Array<{ id: string; name: string; address: string; phone?: string; email?: string; lat: number; lon: number }>>([]);
  const installerMarkers = useRef<maplibregl.Marker[]>([]);
  // Save pin prompt state
  const [savePinPrompt, setSavePinPrompt] = useState<{ lat: number; lon: number } | null>(null);
  const [savePinName, setSavePinName] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Layer visibility toggles
  // All toggles start false - user enables the ones they want to see
  const [layerToggles, setLayerToggles] = useState({
    supermarkets: false,
    industrial: false,
    vvFirms: false,
    vvComplexes: false,
    vvIndividual: false,
    solarGrants: false,
    ctZones: false,
    gasStations: false,
    saved: true,
    partners: true,
    ibi: false,
    icio: false,
  });
  const toggleLayer = (layer: keyof typeof layerToggles) => {
    setLayerToggles(prev => {
      // IBI and ICIO are mutually exclusive
      if (layer === 'ibi' && !prev.ibi) {
        return { ...prev, ibi: true, icio: false };
      }
      if (layer === 'icio' && !prev.icio) {
        return { ...prev, icio: true, ibi: false };
      }
      return { ...prev, [layer]: !prev[layer] };
    });
  };

  // Derive subsidyHeatmapMode from layerToggles
  const subsidyHeatmapMode: SubsidyHeatmapMode = layerToggles.ibi ? 'ibi' : layerToggles.icio ? 'icio' : 'off';

  // Measurement tool state
  const [isMeasuring, setIsMeasuring] = useState(false);
  const isMeasuringRef = useRef(false);
  const measureVerticesRef = useRef<[number, number][]>([]);
  const [measureVertices, setMeasureVertices] = useState<[number, number][]>([]);
  const [measuredAreaM2, setMeasuredAreaM2] = useState<number | null>(null);
  const [measureClosed, setMeasureClosed] = useState(false);
  const [measureSolarEstimate, setMeasureSolarEstimate] = useState<SolarEstimate | null>(null);
  // Editable usable area percentage for measurement tool (default 60%)
  const [measureUsablePercent, setMeasureUsablePercent] = useState(60);
  const [measureUsablePercentInput, setMeasureUsablePercentInput] = useState('60');
  // Editable self-consumption for calculating surplus/homes served (default 60,000 kWh/year)
  const [measureSelfConsumption, setMeasureSelfConsumption] = useState(60000);
  // Lead picker modal for sending measurement to lead
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [leadSearchResults, setLeadSearchResults] = useState<Array<{ id: string; name: string; email: string; address: string | null }>>([]);
  const [isSearchingLeads, setIsSearchingLeads] = useState(false);
  const [isSendingToLead, setIsSendingToLead] = useState(false);
  // Create lead modal
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const measureCursorRef = useRef<[number, number] | null>(null);
  const [showMeasureMethodology, setShowMeasureMethodology] = useState(false);
  // Track if we've already flown to initial URL position (prevents infinite loop)
  const hasFlownToInitialRef = useRef(false);

  // Recalculate solar estimate when usable percent changes
  const displaySolarEstimate = useMemo(() => {
    if (!measureClosed || !measuredAreaM2 || measureVertices.length < 3) {
      return measureSolarEstimate;
    }
    // Calculate center latitude from vertices
    const centerLat = measureVertices.reduce((sum, v) => sum + v[1], 0) / measureVertices.length;
    return computeSolarEstimate(measuredAreaM2, centerLat, measureUsablePercent);
  }, [measureClosed, measuredAreaM2, measureVertices, measureUsablePercent, measureSolarEstimate]);

  // Calculate surplus energy, homes served, and community vs grid revenue
  const surplusCalculation = useMemo(() => {
    if (!displaySolarEstimate) return null;
    const surplus = Math.max(0, displaySolarEstimate.annualKwh - measureSelfConsumption);
    const homesServed = Math.floor(surplus / 3500); // Average Spanish home: 3,500 kWh/year

    // Revenue comparison: Community vs Grid
    const GRID_RATE = 0.05; // €/kWh - compensación simplificada
    const COMMUNITY_RATE = 0.11; // €/kWh - energy community sale price
    const gridRevenue = surplus * GRID_RATE;
    const communityRevenue = surplus * COMMUNITY_RATE;
    const extraProfit = communityRevenue - gridRevenue;
    const extraProfitPercent = gridRevenue > 0 ? ((extraProfit / gridRevenue) * 100) : 0;

    return { surplus, homesServed, gridRevenue, communityRevenue, extraProfit, extraProfitPercent };
  }, [displaySolarEstimate, measureSelfConsumption]);

  // Keep ref in sync with selectedVvGroup state
  useEffect(() => {
    selectedVvGroupRef.current = selectedVvGroup;
  }, [selectedVvGroup]);

  // Keep ref in sync with state
  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  // Keep measuring ref in sync
  useEffect(() => {
    isMeasuringRef.current = isMeasuring;
  }, [isMeasuring]);

  // Auto-enable VVs layer when gestoraFilter is set
  useEffect(() => {
    if (gestoraFilter) {
      setVvsVisible(true);
      setLayerToggles(prev => ({ ...prev, vvFirms: true }));
    }
  }, [gestoraFilter]);

  // Toggle vulnerability layer visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const shouldShow = showVulnerabilityLayer && vulnerabilityVisible;

    if (mapInstance.getLayer('vulnerability-fill')) {
      mapInstance.setLayoutProperty('vulnerability-fill', 'visibility', shouldShow ? 'visible' : 'none');
    }
    if (mapInstance.getLayer('vulnerability-border')) {
      mapInstance.setLayoutProperty('vulnerability-border', 'visibility', shouldShow ? 'visible' : 'none');
    }
  }, [mapLoaded, showVulnerabilityLayer, vulnerabilityVisible]);

  // Toggle base layer (streets / satellite / grafcan)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const style = mapInstance.getStyle();
    if (!style || !style.layers) return;

    const layers = style.layers;

    // Layers to hide in imagery mode (buildings, land, water fills)
    // Exclude vulnerability layers - they have their own visibility control
    const layersToHide = layers.filter(l =>
      !l.id.includes('vulnerability') &&
      (l.type === 'fill' ||
      (l.type === 'line' && !l.id.includes('road')) ||
      l.id.includes('building') ||
      l.id.includes('landuse') ||
      l.id.includes('water') ||
      l.id.includes('background'))
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
        layout: {
          visibility: 'none',
        },
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
        layout: {
          visibility: 'none',
        },
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

      // Fly to initial position if provided (from URL params or stored state)
      if (initialLat && initialLon) {
        mapInstance.flyTo({
          center: [initialLon, initialLat],
          zoom: initialZoom || 17,
          duration: 1500,
        });
      }

      // Track view changes for state persistence
      mapInstance.on('moveend', () => {
        if (onViewChange) {
          const center = mapInstance.getCenter();
          const zoom = mapInstance.getZoom();
          onViewChange({ lat: center.lat, lon: center.lng }, zoom);
        }
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

  // Fly to location when URL params provided (e.g., coming from lead detail page)
  // Only run once on initial load to prevent infinite loop with onViewChange
  useEffect(() => {
    if (!map.current || !mapLoaded || !initialLat || !initialLon) return;
    if (hasFlownToInitialRef.current) return;

    hasFlownToInitialRef.current = true;
    map.current.flyTo({
      center: [initialLon, initialLat],
      zoom: initialZoom || 18,
      duration: 1500,
    });
  }, [mapLoaded, initialLat, initialLon, initialZoom]);

  // Right-click to save pin
  useEffect(() => {
    if (!map.current || !mapLoaded || !onSavePin) return;
    const mapInstance = map.current;

    const handleContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (isDrawingRef.current || isMeasuringRef.current) return;
      setSavePinPrompt({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      setSavePinName('');
    };

    mapInstance.on('contextmenu', handleContextMenu);
    return () => {
      mapInstance.off('contextmenu', handleContextMenu);
    };
  }, [mapLoaded, onSavePin]);

  // Render saved location markers
  useEffect(() => {
    // Clear old markers
    savedLocationMarkers.current.forEach(m => m.remove());
    savedLocationMarkers.current = [];

    if (!map.current || !mapLoaded || !layerToggles.saved) return;

    savedLocations.forEach(loc => {
      const markerColor = loc.color || '#eab308';
      const el = document.createElement('div');
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: ${markerColor};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      el.innerHTML = loc.type === 'building'
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([loc.lon, loc.lat])
        .addTo(map.current!);

      // Color options: orange, yellow, green
      const colorOptions = [
        { color: '#f97316', label: 'Naranja' },
        { color: '#eab308', label: 'Amarillo' },
        { color: '#22c55e', label: 'Verde' },
      ];
      const colorButtonsHtml = colorOptions.map(opt =>
        `<button onclick="document.dispatchEvent(new CustomEvent('update-saved-location-color', {detail:{id:'${loc.id}',color:'${opt.color}'}}))" style="width:20px;height:20px;border-radius:50%;background:${opt.color};border:2px solid ${opt.color === markerColor ? '#222' : 'transparent'};cursor:pointer;margin-right:4px" title="${opt.label}"></button>`
      ).join('');

      // Popup with info, color picker, promote and delete buttons
      const popupHtml = `
        <div style="padding:8px;min-width:160px">
          <h4 style="font-weight:600;margin:0 0 4px 0;font-size:13px">${loc.name || (loc.type === 'building' ? 'Edificio guardado' : 'Pin guardado')}</h4>
          ${loc.notes ? `<p style="font-size:11px;color:#666;margin:0 0 8px 0">${loc.notes}</p>` : ''}
          <p style="font-size:10px;color:#999;margin:0 0 8px 0">${loc.type === 'building' ? 'Edificio' : 'Pin'} · ${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}</p>
          <div style="display:flex;align-items:center;margin-bottom:8px">
            <span style="font-size:10px;color:#666;margin-right:8px">Color:</span>
            ${colorButtonsHtml}
          </div>
          <div style="display:flex;gap:12px;align-items:center">
            <button onclick="document.dispatchEvent(new CustomEvent('promote-to-lead', {detail:'${loc.id}'}))" style="font-size:11px;color:#22c55e;cursor:pointer;background:none;border:none;padding:2px 0;text-decoration:underline;font-weight:500">
              Crear Lead
            </button>
            <button onclick="document.dispatchEvent(new CustomEvent('delete-saved-location', {detail:'${loc.id}'}))" style="font-size:11px;color:#ef4444;cursor:pointer;background:none;border:none;padding:2px 0;text-decoration:underline">
              Eliminar
            </button>
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 15, closeButton: true })
        .setHTML(popupHtml);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        marker.setPopup(popup).togglePopup();
      });

      savedLocationMarkers.current.push(marker);
    });
  }, [mapLoaded, savedLocations, layerToggles.saved]);

  // Fetch partner installer locations on mount
  useEffect(() => {
    const fetchInstallerLocations = async () => {
      try {
        const res = await fetch('/api/installer-locations');
        if (res.ok) {
          const data = await res.json();
          setInstallerLocations(data.locations || []);
        }
      } catch (err) {
        console.error('[ProspectMap] Failed to fetch installer locations:', err);
      }
    };
    fetchInstallerLocations();
  }, []);

  // Render partner installer markers
  useEffect(() => {
    // Clear old markers
    installerMarkers.current.forEach(m => m.remove());
    installerMarkers.current = [];

    if (!map.current || !mapLoaded || !layerToggles.partners) return;

    installerLocations.forEach(loc => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 32px;
        height: 32px;
        background: #3b82f6;
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      // Wrench/tool icon for installers
      el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([loc.lon, loc.lat])
        .addTo(map.current!);

      const popupHtml = `
        <div style="padding:10px;min-width:200px">
          <h4 style="font-weight:700;margin:0 0 6px 0;font-size:14px;color:#3b82f6">${loc.name}</h4>
          <p style="font-size:12px;color:#444;margin:0 0 4px 0">${loc.address}</p>
          ${loc.phone ? `<p style="font-size:12px;margin:4px 0"><a href="tel:${loc.phone.replace(/\s/g, '')}" style="color:#3b82f6;text-decoration:none">📞 ${loc.phone}</a></p>` : ''}
          ${loc.email ? `<p style="font-size:12px;margin:4px 0"><a href="mailto:${loc.email}" style="color:#3b82f6;text-decoration:none">✉️ ${loc.email}</a></p>` : ''}
          <p style="font-size:10px;color:#22c55e;margin:8px 0 0 0;font-weight:500">Partner Instalador</p>
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 18, closeButton: true })
        .setHTML(popupHtml);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        marker.setPopup(popup).togglePopup();
      });

      installerMarkers.current.push(marker);
    });
  }, [mapLoaded, installerLocations, layerToggles.partners]);

  // Listen for delete-saved-location custom events from popup buttons
  useEffect(() => {
    if (!onDeleteSavedLocation) return;

    const handleDelete = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id) onDeleteSavedLocation(id);
    };

    document.addEventListener('delete-saved-location', handleDelete);
    return () => document.removeEventListener('delete-saved-location', handleDelete);
  }, [onDeleteSavedLocation]);

  // Listen for update-saved-location-color custom events from popup buttons
  useEffect(() => {
    if (!onUpdateSavedLocationColor) return;

    const handleColorUpdate = (e: Event) => {
      const { id, color } = (e as CustomEvent).detail || {};
      if (id && color) onUpdateSavedLocationColor(id, color);
    };

    document.addEventListener('update-saved-location-color', handleColorUpdate);
    return () => document.removeEventListener('update-saved-location-color', handleColorUpdate);
  }, [onUpdateSavedLocationColor]);

  // Listen for promote-to-lead custom events from popup buttons
  useEffect(() => {
    if (!onPromoteToLead) return;

    const handlePromote = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id) onPromoteToLead(id);
    };

    document.addEventListener('promote-to-lead', handlePromote);
    return () => document.removeEventListener('promote-to-lead', handlePromote);
  }, [onPromoteToLead]);

  // Measurement tool: helper to update map sources
  const updateMeasureLayer = useCallback((vertices: [number, number][], cursor: [number, number] | null, closed: boolean) => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    // Build polygon coordinates (with cursor as temp closing point if not closed)
    const polyCoords: [number, number][] = vertices.length >= 3
      ? closed
        ? [...vertices, vertices[0]]
        : cursor
          ? [...vertices, cursor, vertices[0]]
          : [...vertices, vertices[0]]
      : [];

    // Polygon fill + stroke
    const polyData: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: polyCoords.length >= 4 ? [polyCoords] : [[[0,0],[0,0],[0,0],[0,0]]] },
    };

    const polySrc = mapInstance.getSource('measure-polygon') as maplibregl.GeoJSONSource;
    if (polySrc) {
      polySrc.setData(polyData);
    } else {
      mapInstance.addSource('measure-polygon', { type: 'geojson', data: polyData });
      mapInstance.addLayer({ id: 'measure-polygon-fill', type: 'fill', source: 'measure-polygon', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 } });
      mapInstance.addLayer({ id: 'measure-polygon-stroke', type: 'line', source: 'measure-polygon', paint: { 'line-color': '#3b82f6', 'line-width': 2 } });
    }

    // Vertices circles
    const vertexData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: vertices.map((v, i) => ({
        type: 'Feature' as const,
        properties: { first: i === 0 ? 1 : 0 },
        geometry: { type: 'Point' as const, coordinates: v },
      })),
    };

    const vertSrc = mapInstance.getSource('measure-vertices') as maplibregl.GeoJSONSource;
    if (vertSrc) {
      vertSrc.setData(vertexData);
    } else {
      mapInstance.addSource('measure-vertices', { type: 'geojson', data: vertexData });
      mapInstance.addLayer({
        id: 'measure-vertices',
        type: 'circle',
        source: 'measure-vertices',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'first'], 1], 6, 4],
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': ['case', ['==', ['get', 'first'], 1], '#3b82f6', '#374151'],
        },
      });
    }

    // Cursor dashed line (from last vertex to cursor)
    const lineCoords: [number, number][] = !closed && vertices.length >= 1 && cursor
      ? [vertices[vertices.length - 1], cursor]
      : [[0,0],[0,0]];

    const lineData: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: lineCoords },
    };

    const lineSrc = mapInstance.getSource('measure-cursor-line') as maplibregl.GeoJSONSource;
    if (lineSrc) {
      lineSrc.setData(lineData);
    } else {
      mapInstance.addSource('measure-cursor-line', { type: 'geojson', data: lineData });
      mapInstance.addLayer({
        id: 'measure-cursor-line',
        type: 'line',
        source: 'measure-cursor-line',
        paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-dasharray': [4, 4] },
      });
    }

    // Compute area
    if (polyCoords.length >= 4) {
      const areaM2 = turfArea({ type: 'Polygon', coordinates: [polyCoords] });
      setMeasuredAreaM2(areaM2);
    } else {
      setMeasuredAreaM2(null);
    }
  }, []);

  // Clean up measurement layers
  const cleanupMeasureLayers = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    for (const lid of ['measure-polygon-fill', 'measure-polygon-stroke', 'measure-vertices', 'measure-cursor-line']) {
      if (mapInstance.getLayer(lid)) mapInstance.removeLayer(lid);
    }
    for (const sid of ['measure-polygon', 'measure-vertices', 'measure-cursor-line']) {
      if (mapInstance.getSource(sid)) mapInstance.removeSource(sid);
    }
  }, []);

  // Drawing tool: helper to update map sources (green colors for area selection)
  const updateDrawLayer = useCallback((vertices: [number, number][], cursor: [number, number] | null) => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    // Build polygon coordinates (with cursor as temp closing point)
    const polyCoords: [number, number][] = vertices.length >= 3
      ? cursor
        ? [...vertices, cursor, vertices[0]]
        : [...vertices, vertices[0]]
      : [];

    // Polygon fill + stroke
    const polyData: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: polyCoords.length >= 4 ? [polyCoords] : [[[0,0],[0,0],[0,0],[0,0]]] },
    };

    const polySrc = mapInstance.getSource('draw-polygon') as maplibregl.GeoJSONSource;
    if (polySrc) {
      polySrc.setData(polyData);
    } else {
      mapInstance.addSource('draw-polygon', { type: 'geojson', data: polyData });
      mapInstance.addLayer({ id: 'draw-polygon-fill', type: 'fill', source: 'draw-polygon', paint: { 'fill-color': '#a7e26e', 'fill-opacity': 0.3 } });
      mapInstance.addLayer({ id: 'draw-polygon-stroke', type: 'line', source: 'draw-polygon', paint: { 'line-color': '#222f30', 'line-width': 2 } });
    }

    // Vertices circles
    const vertexData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: vertices.map((v, i) => ({
        type: 'Feature' as const,
        properties: { first: i === 0 ? 1 : 0 },
        geometry: { type: 'Point' as const, coordinates: v },
      })),
    };

    const vertSrc = mapInstance.getSource('draw-vertices') as maplibregl.GeoJSONSource;
    if (vertSrc) {
      vertSrc.setData(vertexData);
    } else {
      mapInstance.addSource('draw-vertices', { type: 'geojson', data: vertexData });
      mapInstance.addLayer({
        id: 'draw-vertices',
        type: 'circle',
        source: 'draw-vertices',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'first'], 1], 6, 4],
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': ['case', ['==', ['get', 'first'], 1], '#a7e26e', '#222f30'],
        },
      });
    }

    // Cursor dashed line (from last vertex to cursor)
    const lineCoords: [number, number][] = vertices.length >= 1 && cursor
      ? [vertices[vertices.length - 1], cursor]
      : [[0,0],[0,0]];

    const lineData: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: lineCoords },
    };

    const lineSrc = mapInstance.getSource('draw-cursor-line') as maplibregl.GeoJSONSource;
    if (lineSrc) {
      lineSrc.setData(lineData);
    } else {
      mapInstance.addSource('draw-cursor-line', { type: 'geojson', data: lineData });
      mapInstance.addLayer({
        id: 'draw-cursor-line',
        type: 'line',
        source: 'draw-cursor-line',
        paint: { 'line-color': '#222f30', 'line-width': 2, 'line-dasharray': [4, 4] },
      });
    }
  }, []);

  // Clean up drawing layers
  const cleanupDrawLayers = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    for (const lid of ['draw-polygon-fill', 'draw-polygon-stroke', 'draw-vertices', 'draw-cursor-line', 'draw-rectangle', 'draw-rectangle-outline']) {
      if (mapInstance.getLayer(lid)) mapInstance.removeLayer(lid);
    }
    for (const sid of ['draw-polygon', 'draw-vertices', 'draw-cursor-line', 'draw-rectangle']) {
      if (mapInstance.getSource(sid)) mapInstance.removeSource(sid);
    }
  }, []);

  // Drawing event handlers (click-to-add-vertices for touch support)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const mapInstance = map.current;

    const handleDrawClick = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;

      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const verts = drawVerticesRef.current;

      // Check if clicking near first vertex to close (within ~15px)
      if (verts.length >= 3) {
        const firstPx = mapInstance.project(verts[0]);
        const clickPx = mapInstance.project([e.lngLat.lng, e.lngLat.lat]);
        const dist = Math.sqrt((firstPx.x - clickPx.x) ** 2 + (firstPx.y - clickPx.y) ** 2);
        if (dist < 15) {
          // Close polygon and calculate bounding box
          const lngs = verts.map(v => v[0]);
          const lats = verts.map(v => v[1]);
          const bounds: BBoxBounds = {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLon: Math.min(...lngs),
            maxLon: Math.max(...lngs),
          };
          onAreaSelect(bounds);
          setIsDrawing(false);
          setDrawVertices([]);
          drawVerticesRef.current = [];
          drawCursorRef.current = null;
          mapInstance.getCanvas().style.cursor = '';
          return;
        }
      }

      // Add new vertex
      const newVerts = [...verts, point];
      drawVerticesRef.current = newVerts;
      setDrawVertices(newVerts);
      updateDrawLayer(newVerts, drawCursorRef.current);
    };

    const handleDrawMove = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;

      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      drawCursorRef.current = cursor;
      const verts = drawVerticesRef.current;
      if (verts.length >= 1) {
        updateDrawLayer(verts, cursor);
      }
    };

    const handleDrawKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawingRef.current) {
        // Cancel drawing
        setIsDrawing(false);
        setDrawVertices([]);
        drawVerticesRef.current = [];
        drawCursorRef.current = null;
        cleanupDrawLayers();
        mapInstance.getCanvas().style.cursor = '';
      }
    };

    mapInstance.on('click', handleDrawClick);
    mapInstance.on('mousemove', handleDrawMove);
    document.addEventListener('keydown', handleDrawKeydown);

    return () => {
      mapInstance.off('click', handleDrawClick);
      mapInstance.off('mousemove', handleDrawMove);
      document.removeEventListener('keydown', handleDrawKeydown);
    };
  }, [mapLoaded, onAreaSelect, updateDrawLayer, cleanupDrawLayers]);

  // Measurement event handlers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const mapInstance = map.current;

    const handleMeasureClick = (e: maplibregl.MapMouseEvent) => {
      if (!isMeasuringRef.current) return;

      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const verts = measureVerticesRef.current;

      // Check if clicking near first vertex to close (within ~10px)
      if (verts.length >= 3) {
        const first = verts[0];
        const projected = mapInstance.project([first[0], first[1]]);
        const clickProjected = mapInstance.project([point[0], point[1]]);
        const dist = Math.sqrt((projected.x - clickProjected.x) ** 2 + (projected.y - clickProjected.y) ** 2);
        if (dist < 12) {
          // Close polygon
          setMeasureClosed(true);
          setIsMeasuring(false);
          mapInstance.getCanvas().style.cursor = '';
          updateMeasureLayer(verts, null, true);
          // Compute solar estimate from closed polygon
          const closedCoords = [...verts, verts[0]];
          const closedArea = turfArea({ type: 'Polygon', coordinates: [closedCoords] });
          const centerLat = verts.reduce((s, v) => s + v[1], 0) / verts.length;
          setMeasureSolarEstimate(computeSolarEstimate(closedArea, centerLat));
          return;
        }
      }

      const newVerts: [number, number][] = [...verts, point];
      measureVerticesRef.current = newVerts;
      setMeasureVertices(newVerts);
      updateMeasureLayer(newVerts, measureCursorRef.current, false);
    };

    const handleMeasureMove = (e: maplibregl.MapMouseEvent) => {
      if (!isMeasuringRef.current) return;
      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      measureCursorRef.current = cursor;
      const verts = measureVerticesRef.current;
      if (verts.length >= 1) {
        updateMeasureLayer(verts, cursor, false);
      }
    };

    const handleMeasureKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMeasuringRef.current) {
        // Cancel measurement
        setIsMeasuring(false);
        setMeasureVertices([]);
        setMeasuredAreaM2(null);
        setMeasureClosed(false);
        setMeasureSolarEstimate(null);
        measureVerticesRef.current = [];
        measureCursorRef.current = null;
        mapInstance.getCanvas().style.cursor = '';
        cleanupMeasureLayers();
      }
    };

    mapInstance.on('click', handleMeasureClick);
    mapInstance.on('mousemove', handleMeasureMove);
    document.addEventListener('keydown', handleMeasureKeydown);

    return () => {
      mapInstance.off('click', handleMeasureClick);
      mapInstance.off('mousemove', handleMeasureMove);
      document.removeEventListener('keydown', handleMeasureKeydown);
    };
  }, [mapLoaded, updateMeasureLayer, cleanupMeasureLayers]);

  // Toggle measurement mode
  const toggleMeasuring = useCallback(() => {
    if (!map.current) return;

    if (isMeasuring) {
      // Cancel
      setIsMeasuring(false);
      setMeasureVertices([]);
      setMeasuredAreaM2(null);
      setMeasureClosed(false);
      setMeasureSolarEstimate(null);
      measureVerticesRef.current = [];
      measureCursorRef.current = null;
      map.current.getCanvas().style.cursor = '';
      cleanupMeasureLayers();
    } else if (measureClosed) {
      // Clear existing result and start fresh
      clearMeasurement();
    } else {
      // Start measuring
      setIsMeasuring(true);
      setMeasureVertices([]);
      setMeasuredAreaM2(null);
      setMeasureClosed(false);
      setMeasureSolarEstimate(null);
      measureVerticesRef.current = [];
      measureCursorRef.current = null;
      map.current.getCanvas().style.cursor = 'crosshair';
    }
  }, [isMeasuring, measureClosed, cleanupMeasureLayers]);

  // Undo last measurement vertex
  const undoMeasureVertex = useCallback(() => {
    const verts = measureVerticesRef.current;
    if (verts.length === 0) return;
    const newVerts = verts.slice(0, -1);
    measureVerticesRef.current = newVerts;
    setMeasureVertices(newVerts);
    if (newVerts.length === 0) {
      setMeasuredAreaM2(null);
      cleanupMeasureLayers();
    } else {
      updateMeasureLayer(newVerts, measureCursorRef.current, false);
    }
  }, [updateMeasureLayer, cleanupMeasureLayers]);

  // Clear measurement completely
  const clearMeasurement = useCallback(() => {
    setIsMeasuring(false);
    setMeasureVertices([]);
    setMeasuredAreaM2(null);
    setMeasureClosed(false);
    setMeasureSolarEstimate(null);
    setMeasureUsablePercent(60); // Reset to default
    setMeasureUsablePercentInput('60');
    setMeasureSelfConsumption(60000); // Reset to default
    setShowMeasureMethodology(false);
    measureVerticesRef.current = [];
    measureCursorRef.current = null;
    if (map.current) map.current.getCanvas().style.cursor = '';
    cleanupMeasureLayers();
  }, [cleanupMeasureLayers]);

  // Search leads for the lead picker modal
  const searchLeads = useCallback(async (query: string) => {
    setIsSearchingLeads(true);
    try {
      const res = await fetch(`/api/leads/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setLeadSearchResults(data.leads || []);
      }
    } catch (err) {
      console.error('[ProspectMap] Lead search error:', err);
    } finally {
      setIsSearchingLeads(false);
    }
  }, []);

  // Send measurement to a lead as solar assessment
  const sendMeasurementToLead = useCallback(async (leadId: string) => {
    if (!measuredAreaM2 || measureVertices.length < 3) return;

    setIsSendingToLead(true);
    try {
      // Calculate polygon center
      const lngs = measureVertices.map(v => v[0]);
      const lats = measureVertices.map(v => v[1]);
      const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

      // Recalculate with current usable percent
      const estimate = computeSolarEstimate(measuredAreaM2, centerLat, measureUsablePercent);

      const res = await fetch('/api/solar-assessments/from-measurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          areaM2: measuredAreaM2,
          panelCount: estimate.panelCount,
          systemKwp: estimate.systemKwp,
          annualKwh: estimate.annualKwh,
          annualSavingsEur: estimate.annualSavingsEur,
          installationCost: estimate.installationCost,
          paybackYears: estimate.paybackYears,
          latitude: centerLat,
          longitude: centerLng,
          vertices: measureVertices,
          usablePercent: measureUsablePercent,
        }),
      });

      if (res.ok) {
        // Success - close modal and optionally clear measurement
        setShowLeadPicker(false);
        setLeadSearchQuery('');
        setLeadSearchResults([]);
        // Navigate to lead or show success message
        window.location.href = `/installer/leads/${leadId}`;
      } else {
        console.error('[ProspectMap] Failed to send to lead');
      }
    } catch (err) {
      console.error('[ProspectMap] Send to lead error:', err);
    } finally {
      setIsSendingToLead(false);
    }
  }, [measuredAreaM2, measureVertices, measureUsablePercent]);

  // Create a new lead and send measurement to it
  const createLeadAndSendMeasurement = useCallback(async () => {
    if (!measuredAreaM2 || measureVertices.length < 3 || !newLeadName) return;

    setIsCreatingLead(true);
    try {
      // Calculate polygon center
      const lngs = measureVertices.map(v => v[0]);
      const lats = measureVertices.map(v => v[1]);
      const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

      // Recalculate with current usable percent
      const estimate = computeSolarEstimate(measuredAreaM2, centerLat, measureUsablePercent);

      // Build building data from selectedBuilding if available
      const buildingData = selectedBuilding ? {
        island: selectedBuilding.island,
        streetAddress: selectedBuilding.streetAddress,
        cadastralReference: selectedBuilding.cadastralReference,
        numberOfDwellings: selectedBuilding.numberOfDwellings,
        currentUseLabel: selectedBuilding.currentUseLabel,
        annualSavingsEur: estimate.annualSavingsEur,
      } : {
        annualSavingsEur: estimate.annualSavingsEur,
      };

      // Create the lead using from-location endpoint with lat/lon
      const createRes = await fetch('/api/leads/from-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: centerLat,
          lon: centerLng,
          name: newLeadName,
          buildingData,
        }),
      });

      if (!createRes.ok) {
        console.error('[ProspectMap] Failed to create lead');
        return;
      }

      const { id: leadId } = await createRes.json();

      // Send measurement to the new lead
      const measureRes = await fetch('/api/solar-assessments/from-measurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          areaM2: measuredAreaM2,
          panelCount: estimate.panelCount,
          systemKwp: estimate.systemKwp,
          annualKwh: estimate.annualKwh,
          annualSavingsEur: estimate.annualSavingsEur,
          installationCost: estimate.installationCost,
          paybackYears: estimate.paybackYears,
          latitude: centerLat,
          longitude: centerLng,
          vertices: measureVertices,
          usablePercent: measureUsablePercent,
        }),
      });

      if (measureRes.ok) {
        // Success - close modal and navigate
        setShowCreateLead(false);
        setNewLeadName('');
        setNewLeadEmail('');
        setNewLeadPhone('');
        window.location.href = `/installer/leads/${leadId}`;
      } else {
        console.error('[ProspectMap] Failed to send measurement to new lead');
      }
    } catch (err) {
      console.error('[ProspectMap] Create lead error:', err);
    } finally {
      setIsCreatingLead(false);
    }
  }, [measuredAreaM2, measureVertices, measureUsablePercent, newLeadName, newLeadEmail, newLeadPhone, selectedBuilding]);

  // Open lead picker and load initial results
  const openLeadPicker = useCallback(() => {
    setShowLeadPicker(true);
    searchLeads('');
  }, [searchLeads]);

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

    if (isDrawing) {
      // Cancel drawing
      setIsDrawing(false);
      setDrawVertices([]);
      drawVerticesRef.current = [];
      drawCursorRef.current = null;
      map.current.getCanvas().style.cursor = '';
      cleanupDrawLayers();
    } else {
      // Start drawing
      setIsDrawing(true);
      setDrawVertices([]);
      drawVerticesRef.current = [];
      drawCursorRef.current = null;
      map.current.getCanvas().style.cursor = 'crosshair';
    }
  }, [isDrawing, cleanupDrawLayers]);

  // Undo last draw vertex
  const undoDrawVertex = useCallback(() => {
    const verts = drawVerticesRef.current;
    if (verts.length === 0) return;
    const newVerts = verts.slice(0, -1);
    drawVerticesRef.current = newVerts;
    setDrawVertices(newVerts);
    if (newVerts.length === 0) {
      cleanupDrawLayers();
    } else {
      updateDrawLayer(newVerts, drawCursorRef.current);
    }
  }, [updateDrawLayer, cleanupDrawLayers]);

  // Confirm draw selection (close polygon and select bounds)
  const confirmDrawSelection = useCallback(() => {
    const verts = drawVerticesRef.current;
    if (verts.length < 3) return;

    const lngs = verts.map(v => v[0]);
    const lats = verts.map(v => v[1]);
    const bounds: BBoxBounds = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lngs),
      maxLon: Math.max(...lngs),
    };
    onAreaSelect(bounds);
    setIsDrawing(false);
    setDrawVertices([]);
    drawVerticesRef.current = [];
    drawCursorRef.current = null;
    if (map.current) map.current.getCanvas().style.cursor = '';
  }, [onAreaSelect]);

  // Clear selection
  const clearSelection = useCallback(() => {
    if (!map.current) return;

    // Remove draw layers
    cleanupDrawLayers();

    // Remove close button marker
    if (closeButtonMarker.current) {
      closeButtonMarker.current.remove();
      closeButtonMarker.current = null;
    }

    onAreaSelect(null);
  }, [onAreaSelect, cleanupDrawLayers]);

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

    // Enrich with CT analysis (using heuristic fallback for now)
    const enriched = scored.map(cluster => enrichClusterWithCTAnalysis(cluster));

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

    // Filter VVs based on layer toggles and gestora filter
    const filteredVvs = vvs.filter(vv => {
      // If gestora filter is set, only show VVs from that gestora
      if (gestoraFilter) {
        return vv.managementFirm === gestoraFilter;
      }
      // Otherwise filter based on layer toggles
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
  }, [mapLoaded, vvsVisible, vvs, selectedVvGroup, layerToggles.vvFirms, layerToggles.vvComplexes, layerToggles.vvIndividual, gestoraFilter]);

  // Fetch solar grants when toggle enabled and map moves (zoom >= 10)
  useEffect(() => {
    if (!map.current || !mapLoaded || !layerToggles.solarGrants) {
      setSolarGrants([]);
      lastSolarGrantsBoundsRef.current = null;
      return;
    }

    const mapInstance = map.current;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchId = 0;

    const fetchSolarGrants = async () => {
      const zoom = mapInstance.getZoom();

      // Only fetch at zoom >= 7 (archipelago level)
      if (zoom < 7) {
        setIsLoadingSolarGrants(false);
        return;
      }

      const mapBounds = mapInstance.getBounds();
      const boundsKey = `${mapBounds.getSouth().toFixed(2)},${mapBounds.getWest().toFixed(2)},${mapBounds.getNorth().toFixed(2)},${mapBounds.getEast().toFixed(2)}`;

      if (boundsKey === lastSolarGrantsBoundsRef.current) {
        return;
      }

      const currentFetchId = ++fetchId;
      setIsLoadingSolarGrants(true);

      try {
        const params = new URLSearchParams({
          minLat: mapBounds.getSouth().toString(),
          maxLat: mapBounds.getNorth().toString(),
          minLon: mapBounds.getWest().toString(),
          maxLon: mapBounds.getEast().toString(),
          limit: '500',
        });

        const response = await fetch(`/api/solar-grants/bounds?${params}`);
        if (!response.ok) throw new Error('Failed to fetch solar grants');

        const data = await response.json();

        if (currentFetchId === fetchId && data.grants) {
          setSolarGrants(prev => {
            const existingIds = new Set(prev.map(g => g.id));
            const newGrants = data.grants.filter((g: { id: number }) => !existingIds.has(g.id));
            return [...prev, ...newGrants];
          });
          lastSolarGrantsBoundsRef.current = boundsKey;
        }
      } catch (error) {
        if (currentFetchId === fetchId) {
          console.error('[Map] Failed to fetch solar grants:', error);
        }
      } finally {
        if (currentFetchId === fetchId) {
          setIsLoadingSolarGrants(false);
        }
      }
    };

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchSolarGrants, 600);
    };

    fetchSolarGrants();
    mapInstance.on('idle', debouncedFetch);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      mapInstance.off('idle', debouncedFetch);
    };
  }, [mapLoaded, layerToggles.solarGrants]);

  // Render solar grant markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Clear markers if toggle disabled
    if (!layerToggles.solarGrants) {
      solarGrantMarkers.current.forEach(marker => marker.remove());
      solarGrantMarkers.current = [];
      return;
    }

    // Track existing marker IDs
    const existingIds = new Set(solarGrantMarkers.current.map(m => (m as maplibregl.Marker & { _grantId?: number })._grantId));
    const currentIds = new Set(solarGrants.map(g => g.id));

    // Remove markers no longer in data
    solarGrantMarkers.current = solarGrantMarkers.current.filter(marker => {
      const id = (marker as maplibregl.Marker & { _grantId?: number })._grantId;
      if (id !== undefined && !currentIds.has(id)) {
        marker.remove();
        return false;
      }
      return true;
    });

    // Count grants per location for jitter calculation
    const locationCounts = new Map<string, number>();
    solarGrants.forEach(g => {
      const key = `${g.lat.toFixed(4)},${g.lon.toFixed(4)}`;
      locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
    });
    const locationIndex = new Map<string, number>();

    // Add new markers
    solarGrants.forEach(grant => {
      if (existingIds.has(grant.id)) return;

      // Calculate jitter for stacked markers
      const locKey = `${grant.lat.toFixed(4)},${grant.lon.toFixed(4)}`;
      const count = locationCounts.get(locKey) || 1;
      const idx = locationIndex.get(locKey) || 0;
      locationIndex.set(locKey, idx + 1);

      // Spiral jitter pattern for multiple markers at same location
      let jitterLat = 0, jitterLon = 0;
      if (count > 1) {
        const angle = (idx / count) * 2 * Math.PI;
        const radius = 0.003 + (idx * 0.001); // ~300m base + 100m per marker
        jitterLat = Math.sin(angle) * radius;
        jitterLon = Math.cos(angle) * radius;
      }

      const el = document.createElement('div');
      el.className = 'solar-grant-marker';
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: #10b981;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

      const amountStr = grant.grantAmount >= 1000
        ? `${(grant.grantAmount / 1000).toFixed(0)}k€`
        : `${grant.grantAmount.toFixed(0)}€`;

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(`
        <div style="font-size: 12px; max-width: 200px;">
          <div style="font-weight: 600; color: #10b981; margin-bottom: 4px;">Subvención Solar BDNS</div>
          <div style="font-weight: 500; margin-bottom: 2px;">${grant.companyName}</div>
          <div style="color: #666; margin-bottom: 2px;">${grant.municipality || 'Ubicación desconocida'}</div>
          <div style="font-weight: 600; color: #222;">${amountStr}</div>
          ${grant.grantDate ? `<div style="color: #999; font-size: 10px; margin-top: 2px;">${grant.grantDate}</div>` : ''}
        </div>
      `);

      const markerLngLat: [number, number] = [grant.lon + jitterLon, grant.lat + jitterLat];

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(markerLngLat)
        .addTo(mapInstance);

      // Store ID on marker for tracking
      (marker as maplibregl.Marker & { _grantId?: number })._grantId = grant.id;

      // Show popup on hover only (not click)
      el.addEventListener('mouseenter', () => {
        popup.setLngLat(markerLngLat).addTo(mapInstance);
      });
      el.addEventListener('mouseleave', () => popup.remove());

      solarGrantMarkers.current.push(marker);
    });
  }, [mapLoaded, layerToggles.solarGrants, solarGrants]);

  // Fetch CT locations on map movement (when CT layer is enabled)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear CTs when toggle is disabled
    if (!layerToggles.ctZones) {
      setCTLocations([]);
      lastCTBoundsRef.current = null;
      return;
    }

    const mapInstance = map.current;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchId = 0;

    const fetchCTs = async () => {
      const zoom = mapInstance.getZoom();

      // Don't fetch when zoomed out too far
      if (zoom < 13) {
        setIsLoadingCTs(false);
        return;
      }

      const mapBounds = mapInstance.getBounds();
      const boundsKey = `${mapBounds.getSouth().toFixed(3)},${mapBounds.getWest().toFixed(3)},${mapBounds.getNorth().toFixed(3)},${mapBounds.getEast().toFixed(3)}`;

      // Skip if bounds haven't changed significantly
      if (boundsKey === lastCTBoundsRef.current) {
        return;
      }

      // Expand bounds by ~1km to show nearby CTs even if just off-screen
      const latBuffer = 0.01; // ~1km
      const lonBuffer = 0.012; // ~1km at Canary Islands latitude
      const bounds: BBoxBounds = {
        minLat: mapBounds.getSouth() - latBuffer,
        maxLat: mapBounds.getNorth() + latBuffer,
        minLon: mapBounds.getWest() - lonBuffer,
        maxLon: mapBounds.getEast() + lonBuffer,
      };

      const currentFetchId = ++fetchId;
      setIsLoadingCTs(true);

      try {
        // First try database (pre-synced data)
        const apiUrl = `/api/ct-locations?minLat=${bounds.minLat}&maxLat=${bounds.maxLat}&minLon=${bounds.minLon}&maxLon=${bounds.maxLon}`;
        console.log('[CT] Fetching from API:', apiUrl);
        const response = await fetch(apiUrl);
        let ctData: CTLocation[] = [];

        if (response.ok) {
          const data = await response.json();
          ctData = data.ctLocations || [];
          console.log(`[CT] Database returned ${ctData.length} locations`);
        }

        // Note: Overpass fallback disabled - OSM has sparse CT coverage
        // Database has 334+ CTs for Gran Canaria (mostly Las Palmas area)
        // If you need more coverage, run: npx tsx scripts/sync-ct-locations.ts --area "gran canaria"
        if (ctData.length === 0) {
          console.log('[CT] No CTs in this area (OSM coverage is sparse outside Las Palmas)');
        }

        // Only update if this is still the latest request
        if (currentFetchId === fetchId) {
          lastCTBoundsRef.current = boundsKey;
          // Merge with existing CTs to avoid flickering
          setCTLocations(prev => {
            const existingIds = new Set(prev.map(ct => ct.id));
            const newCTs = ctData.filter(ct => !existingIds.has(ct.id));
            return [...prev, ...newCTs];
          });
        }
      } catch (error) {
        console.error('[CT] Error fetching transformers:', error);
      } finally {
        if (currentFetchId === fetchId) {
          setIsLoadingCTs(false);
        }
      }
    };

    const handleMoveEnd = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchCTs, 500);
    };

    // Initial fetch
    fetchCTs();

    // Subscribe to map movement
    mapInstance.on('moveend', handleMoveEnd);

    return () => {
      mapInstance.off('moveend', handleMoveEnd);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [mapLoaded, layerToggles.ctZones]);

  // Render CT markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Remove existing CT markers
    ctMarkers.current.forEach(marker => marker.remove());
    ctMarkers.current = [];

    // Don't render if layer is disabled or no CTs
    if (!layerToggles.ctZones || ctLocations.length === 0) {
      return;
    }

    ctLocations.forEach(ct => {
      // Create marker element
      const el = document.createElement('div');
      el.className = 'ct-marker';

      const color = getOperatorColor(ct.operator);

      el.style.cssText = `
        width: 20px;
        height: 20px;
        background: ${color};
        border: 2px solid white;
        border-radius: 4px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      // Transformer icon (lightning bolt)
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

      // Create popup
      const popup = new maplibregl.Popup({
        offset: 15,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(`
        <div style="font-size: 12px; max-width: 200px;">
          <div style="font-weight: 600; color: ${color}; margin-bottom: 4px;">Centro de Transformación</div>
          ${ct.refCT ? `<div style="font-weight: 500; margin-bottom: 2px;">Ref: ${ct.refCT}</div>` : ''}
          ${ct.operator ? `<div style="color: #666; margin-bottom: 2px;">${ct.operator}</div>` : ''}
          <div style="color: #999; font-size: 10px;">
            Fuente: ${ct.source.toUpperCase()}
            ${ct.confidence >= 70 ? '(alta confianza)' : ct.confidence >= 40 ? '(media)' : '(baja)'}
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([ct.lon, ct.lat])
        .addTo(mapInstance);

      // Show popup on hover
      el.addEventListener('mouseenter', () => {
        popup.setLngLat([ct.lon, ct.lat]).addTo(mapInstance);
      });
      el.addEventListener('mouseleave', () => popup.remove());

      ctMarkers.current.push(marker);
    });
  }, [mapLoaded, layerToggles.ctZones, ctLocations]);

  // Fetch ALL gas stations for Gran Canaria once when layer is enabled
  useEffect(() => {
    if (!mapLoaded || !layerToggles.gasStations) return;
    // Skip if already have data or currently loading
    if (gasStations.length > 0 || isLoadingGasStations) return;

    setIsLoadingGasStations(true);

    const granCanariaBounds: BBoxBounds = {
      minLat: 27.73,
      maxLat: 28.18,
      minLon: -15.87,
      maxLon: -15.33,
    };

    getCommercialAnchors(granCanariaBounds, ['fuel'])
      .then(result => {
        setGasStations(result.anchors);
        console.log(`[Map] Loaded ${result.anchors.length} gas stations for Gran Canaria`);
      })
      .catch(error => {
        console.error('[Map] Failed to fetch gas stations:', error);
      })
      .finally(() => {
        setIsLoadingGasStations(false);
      });
  }, [mapLoaded, layerToggles.gasStations, gasStations.length, isLoadingGasStations]);

  // Render gas station markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    gasStationMarkers.current.forEach(marker => marker.remove());
    gasStationMarkers.current = [];

    if (!layerToggles.gasStations || gasStations.length === 0) return;

    gasStations.forEach(station => {
      const el = document.createElement('div');
      el.className = 'gas-station-marker';

      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: #22c55e;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M3 22h12"/><path d="M18 7l3-3v8a2 2 0 0 1-2 2h-1"/><rect x="6" y="8" width="6" height="4" rx="1"/></svg>`;

      const details: string[] = [];
      if (station.brand && station.brand !== station.name) details.push(station.brand);
      if (station.operator && station.operator !== station.brand) details.push(`Op: ${station.operator}`);

      const popup = new maplibregl.Popup({
        offset: 15,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(`
        <div style="font-size: 12px; max-width: 200px;">
          <div style="font-weight: 600; color: #22c55e; margin-bottom: 4px;">
            ${station.name || 'Gasolinera'}
          </div>
          ${details.length > 0 ? `<div style="color: #666; font-size: 11px;">${details.join(' · ')}</div>` : ''}
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([station.lon, station.lat])
        .addTo(mapInstance);

      el.addEventListener('mouseenter', () => {
        popup.setLngLat([station.lon, station.lat]).addTo(mapInstance);
      });
      el.addEventListener('mouseleave', () => popup.remove());

      // Click to select/deselect and show radius circle
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedAnchor(prev => prev?.id === station.id ? null : station);
      });

      gasStationMarkers.current.push(marker);
    });
  }, [mapLoaded, layerToggles.gasStations, gasStations]);

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

      {/* Gestora filter banner */}
      {gestoraFilter && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-teal-600 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="font-medium">Filtrando por:</span>
            <span className="bg-teal-500 px-2 py-0.5 rounded">{gestoraFilter}</span>
            <span className="text-teal-200 text-sm">
              ({vvs.filter(v => v.managementFirm === gestoraFilter).length} propiedades)
            </span>
          </div>
          <a
            href="/installer/gestoras"
            className="text-sm text-teal-200 hover:text-white underline"
          >
            Quitar filtro
          </a>
        </div>
      )}

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
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={toggleDrawing}
            disabled={!mapLoaded || isMeasuring}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDrawing
                ? 'bg-[#a7e26e] text-[#222f30]'
                : 'bg-white text-[#222f30] hover:bg-gray-100'
            } shadow-md disabled:opacity-50`}
          >
            {isDrawing ? 'Dibujando...' : 'Dibujar Area'}
          </button>
          {isDrawing && (
            <>
              {drawVertices.length > 0 && (
                <button
                  onClick={undoDrawVertex}
                  className="px-3 py-2 rounded-lg font-medium bg-white text-gray-700 hover:bg-gray-100 shadow-md transition-colors text-sm"
                >
                  Deshacer
                </button>
              )}
              {drawVertices.length >= 3 && (
                <button
                  onClick={confirmDrawSelection}
                  className="px-3 py-2 rounded-lg font-medium bg-[#a7e26e] text-[#222f30] hover:bg-[#96d15e] shadow-md transition-colors text-sm"
                >
                  Confirmar
                </button>
              )}
              <button
                onClick={toggleDrawing}
                className="px-3 py-2 rounded-lg font-medium bg-white text-red-600 hover:bg-red-50 shadow-md transition-colors text-sm"
              >
                Cancelar
              </button>
            </>
          )}
          {/* Draw hint */}
          {isDrawing && drawVertices.length === 0 && (
            <span className="text-xs text-gray-500 self-center ml-2">
              Toca para añadir puntos
            </span>
          )}
          {isDrawing && drawVertices.length > 0 && drawVertices.length < 3 && (
            <span className="text-xs text-gray-500 self-center ml-2">
              {3 - drawVertices.length} punto{drawVertices.length === 2 ? '' : 's'} más
            </span>
          )}
          {isDrawing && drawVertices.length >= 3 && (
            <span className="text-xs text-gray-500 self-center ml-2">
              Toca el primer punto o Confirmar
            </span>
          )}
          {/* Measurement tool */}
          {!isDrawing && !isMeasuring && (
            <button
              onClick={toggleMeasuring}
              disabled={!mapLoaded}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isMeasuring
                  ? 'bg-blue-500 text-white'
                  : measureClosed
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-white text-[#222f30] hover:bg-gray-100'
              } shadow-md disabled:opacity-50`}
            >
              {isMeasuring ? 'Midiendo...' : measureClosed ? 'Limpiar' : 'Medir Area'}
            </button>
          )}
          {isMeasuring && (
            <>
              {measureVertices.length > 0 && (
                <button
                  onClick={undoMeasureVertex}
                  className="px-3 py-2 rounded-lg font-medium bg-white text-gray-700 hover:bg-gray-100 shadow-md transition-colors text-sm"
                >
                  Deshacer
                </button>
              )}
              {measureVertices.length >= 3 && (
                <button
                  onClick={() => {
                    const verts = measureVerticesRef.current;
                    setMeasureClosed(true);
                    setIsMeasuring(false);
                    if (map.current) map.current.getCanvas().style.cursor = '';
                    updateMeasureLayer(verts, null, true);
                    // Compute solar estimate from closed polygon
                    const closedCoords = [...verts, verts[0]];
                    const closedArea = turfArea({ type: 'Polygon', coordinates: [closedCoords] });
                    const centerLat = verts.reduce((s, v) => s + v[1], 0) / verts.length;
                    setMeasureSolarEstimate(computeSolarEstimate(closedArea, centerLat));
                  }}
                  className="px-3 py-2 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 shadow-md transition-colors text-sm"
                >
                  Finalizar
                </button>
              )}
              <button
                onClick={clearMeasurement}
                className="px-3 py-2 rounded-lg font-medium bg-white text-red-600 hover:bg-red-50 shadow-md transition-colors text-sm"
              >
                Cancelar
              </button>
            </>
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

        {/* Measurement instructions & result */}
        {isMeasuring && (
          <div className="bg-blue-50 text-blue-800 text-xs px-3 py-2 rounded-lg shadow flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Clic para colocar puntos. Clic en el primer punto para cerrar. <strong>Esc</strong> para cancelar.</span>
            {measuredAreaM2 !== null && measuredAreaM2 > 0 && (
              <span className="ml-auto font-bold text-blue-900 whitespace-nowrap">
                {measuredAreaM2 >= 10000
                  ? `${(measuredAreaM2 / 10000).toFixed(2)} ha`
                  : `${measuredAreaM2.toFixed(1)} m²`}
              </span>
            )}
          </div>
        )}
        {measureClosed && measuredAreaM2 !== null && !isMeasuring && (
          <div className="bg-white text-gray-800 text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-3">
            <span className="font-bold text-blue-600">
              {measuredAreaM2 >= 10000
                ? `${(measuredAreaM2 / 10000).toFixed(2)} ha`
                : `${measuredAreaM2.toFixed(1)} m²`}
            </span>
            <button
              onClick={clearMeasurement}
              className="text-xs text-gray-500 hover:text-red-600 underline transition-colors"
            >
              Limpiar
            </button>
          </div>
        )}
        {measureClosed && displaySolarEstimate && displaySolarEstimate.panelCount > 0 && !isMeasuring && (
          <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs relative">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estimación Solar</h4>
              <button
                onClick={() => setShowMeasureMethodology(!showMeasureMethodology)}
                className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 flex items-center justify-center text-xs font-semibold transition-colors"
                title="Ver metodología"
              >
                i
              </button>
            </div>
            {/* Editable parameters */}
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-600">% Área útil</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={measureUsablePercentInput}
                    onChange={(e) => {
                      const rawVal = e.target.value.replace(/[^0-9]/g, '');
                      setMeasureUsablePercentInput(rawVal);
                    }}
                    onBlur={() => {
                      const num = parseInt(measureUsablePercentInput, 10);
                      const val = isNaN(num) ? 60 : Math.min(100, Math.max(10, num));
                      setMeasureUsablePercent(val);
                      setMeasureUsablePercentInput(String(val));
                    }}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-14 px-2 py-1.5 text-center text-sm font-semibold text-[#222f30] bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-600">Consumo propio</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={measureSelfConsumption}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setMeasureSelfConsumption(val);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    min={0}
                    step={1000}
                    className="w-20 px-2 py-1 text-right text-sm font-medium text-[#222f30] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
                  />
                  <span className="text-xs text-gray-500">kWh/año</span>
                </div>
              </div>
            </div>
            {showMeasureMethodology && (
              <div className="mb-3 p-2 bg-gray-50 rounded text-[10px] text-gray-600 space-y-1">
                <div className="font-semibold text-gray-700 mb-1">Metodología de cálculo:</div>
                <div><span className="font-medium">Área útil:</span> {measureUsablePercent}% del área medida</div>
                <div><span className="font-medium">Paneles:</span> 400W, 2m² por panel</div>
                <div><span className="font-medium">Producción:</span> 1200-1700 kWh/kWp según latitud</div>
                <div><span className="font-medium">Coste:</span> 1.200 €/kWp instalado</div>
                <div><span className="font-medium">Precio electricidad:</span> 0,20 €/kWh</div>
                <div><span className="font-medium">Degradación:</span> 0,5%/año</div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
              <div>
                <div className="text-xs text-gray-500">Paneles</div>
                <div className="text-sm font-bold text-gray-800">{displaySolarEstimate.panelCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Potencia</div>
                <div className="text-sm font-bold text-gray-800">{displaySolarEstimate.systemKwp.toFixed(1)} kWp</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Producción</div>
                <div className="text-sm font-bold text-gray-800">{(displaySolarEstimate.annualKwh / 1000).toFixed(1)}k kWh</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Coste</div>
                <div className="text-sm font-bold text-gray-800">{(displaySolarEstimate.installationCost / 1000).toFixed(0)}k €</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Ahorro/año</div>
                <div className="text-sm font-bold text-green-600">{(displaySolarEstimate.annualSavingsEur / 1000).toFixed(1)}k €</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Amortización</div>
                <div className="text-sm font-bold text-blue-600">{displaySolarEstimate.paybackYears} años</div>
              </div>
            </div>
            {/* Surplus and homes served */}
            {surplusCalculation && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-500">Excedente</div>
                    <div className="text-sm font-bold text-green-600">
                      {surplusCalculation.surplus > 0
                        ? `${(surplusCalculation.surplus / 1000).toFixed(1)}k kWh`
                        : '0 kWh'}
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-500">Hogares</div>
                    <div className="text-sm font-bold text-purple-600">
                      {surplusCalculation.homesServed > 0
                        ? `${surplusCalculation.homesServed} viviendas`
                        : '-'}
                    </div>
                  </div>
                </div>
                {surplusCalculation.surplus <= 0 && (
                  <div className="mt-2 text-[10px] text-amber-600 text-center">
                    La producción no cubre el consumo propio
                  </div>
                )}
                {/* Energy Community revenue comparison */}
                {surplusCalculation.surplus > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                      </svg>
                      Comunidad Energética
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 rounded p-2">
                        <div className="text-gray-500">Venta a red</div>
                        <div className="font-semibold text-gray-600">
                          {surplusCalculation.gridRevenue >= 1000
                            ? `${(surplusCalculation.gridRevenue / 1000).toFixed(1)}k €/año`
                            : `${surplusCalculation.gridRevenue.toFixed(0)} €/año`}
                        </div>
                        <div className="text-[10px] text-gray-400">@0.05 €/kWh</div>
                      </div>
                      <div className="bg-amber-50 rounded p-2">
                        <div className="text-gray-500">Venta a comunidad</div>
                        <div className="font-semibold text-amber-600">
                          {surplusCalculation.communityRevenue >= 1000
                            ? `${(surplusCalculation.communityRevenue / 1000).toFixed(1)}k €/año`
                            : `${surplusCalculation.communityRevenue.toFixed(0)} €/año`}
                        </div>
                        <div className="text-[10px] text-gray-400">@0.11 €/kWh</div>
                      </div>
                    </div>
                    <div className="mt-2 bg-green-100 rounded-lg p-2 text-center">
                      <div className="text-xs text-green-700">Beneficio extra con Comunidad</div>
                      <div className="text-lg font-bold text-green-600">
                        +{surplusCalculation.extraProfit >= 1000
                          ? `${(surplusCalculation.extraProfit / 1000).toFixed(1)}k`
                          : surplusCalculation.extraProfit.toFixed(0)} €/año
                      </div>
                      <div className="text-[10px] text-green-600 font-medium">
                        +{surplusCalculation.extraProfitPercent.toFixed(0)}% más que venta a red
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Action buttons */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setShowCreateLead(true)}
                className="flex-1 py-2 px-3 bg-[#a7e26e] text-[#222f30] text-sm font-medium rounded-lg hover:bg-[#96d15e] transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Crear Lead
              </button>
              <button
                onClick={openLeadPicker}
                className="flex-1 py-2 px-3 bg-[#222f30] text-white text-sm font-medium rounded-lg hover:bg-[#1a2526] transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Enviar a Lead
              </button>
            </div>
          </div>
        )}

        {/* EPC toggle */}
        {buildings.length > 0 && mapLoaded && (
          <div className="flex gap-1 bg-white rounded-lg shadow-md p-1">
            <button
              onClick={() => setEpcColorMode(!epcColorMode)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                epcColorMode
                  ? 'bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Modo EPC: Colorea edificios por potencial de mejora energética (rojo = mejor prospecto)"
            >
              EPC
            </button>
          </div>
        )}

        {/* Layer toggles - 6 compact buttons */}
        {showCommercialAnchors && mapLoaded && (() => {
          // Calculate counts
          const supermarketCount = commercialAnchors.filter(a => a.type === 'supermarket' || a.type === 'retail').length;
          const industrialCount = commercialAnchors.filter(a => a.type === 'industrial' || a.type === 'warehouse').length;
          const vvFirmCount = vvs.filter(v => v.managementFirm).length;
          const vvComplexCount = vvs.filter(v => !v.managementFirm && v.complexName).length;
          const vvIndividualCount = vvs.filter(v => !v.managementFirm && !v.complexName).length;
          const solarGrantsCount = solarGrants.length;
          const ctCount = ctLocations.length;

          const toggles = [
            { key: 'supermarkets' as const, color: '#f59e0b', count: supermarketCount, title: 'Supermercados', isLoading: isLoadingAnchors, showCount: anchorsVisible,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>` },
            { key: 'industrial' as const, color: '#ef4444', count: industrialCount, title: 'Naves Industriales', isLoading: isLoadingAnchors, showCount: anchorsVisible,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>` },
            { key: 'vvFirms' as const, color: '#8b5cf6', count: vvFirmCount, title: 'Gestora Inmobiliaria', isLoading: isLoadingVvs, showCount: vvsVisible,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>` },
            { key: 'vvComplexes' as const, color: '#f59e0b', count: vvComplexCount, title: 'Complejo/Resort', isLoading: isLoadingVvs, showCount: vvsVisible,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01"/></svg>` },
            { key: 'vvIndividual' as const, color: '#06b6d4', count: vvIndividualCount, title: 'VV Individual', isLoading: isLoadingVvs, showCount: vvsVisible,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
            { key: 'solarGrants' as const, color: '#10b981', count: solarGrantsCount, title: 'Subvenciones Solares BDNS', isLoading: isLoadingSolarGrants, showCount: layerToggles.solarGrants,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>` },
            { key: 'ctZones' as const, color: '#3b82f6', count: ctCount, title: 'Centros de Transformación (CT)', isLoading: isLoadingCTs, showCount: layerToggles.ctZones,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>` },
            { key: 'gasStations' as const, color: '#22c55e', count: gasStations.length, title: 'Gasolineras', isLoading: isLoadingGasStations, showCount: layerToggles.gasStations,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M3 22h12"/><path d="M18 7l3-3v8a2 2 0 0 1-2 2h-1"/><rect x="6" y="8" width="6" height="4" rx="1"/></svg>` },
            { key: 'saved' as const, color: '#eab308', count: savedLocations.length, title: 'Ubicaciones Guardadas', isLoading: false, showCount: layerToggles.saved,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` },
            { key: 'partners' as const, color: '#3b82f6', count: installerLocations.length, title: 'Partners Instaladores', isLoading: false, showCount: layerToggles.partners,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>` },
            { key: 'ibi' as const, color: '#10b981', count: 0, title: 'Bonificación IBI', isLoading: false, showCount: false,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>` },
            { key: 'icio' as const, color: '#10b981', count: 0, title: 'Bonificación ICIO', isLoading: false, showCount: false,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 20h20M5 20V8l7-4 7 4v12"/><path d="M9 20v-4h6v4"/></svg>` },
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
                {toggles.map(({ key, color, count, title, icon, isLoading, showCount }) => {
                  const isActive = layerToggles[key];

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

              {/* Radius selector and cluster finder when anchors or gas stations visible */}
              {(anchorsVisible || layerToggles.gasStations) && (
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
      {mapLoaded && showVulnerabilityLayer && (
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

      {/* Save Pin Prompt */}
      {savePinPrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]" onClick={() => setSavePinPrompt(null)}>
          <div className="bg-white rounded-xl shadow-lg p-5 w-72" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[#222f30] mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-500" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Guardar ubicación
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {savePinPrompt.lat.toFixed(5)}, {savePinPrompt.lon.toFixed(5)}
            </p>
            <input
              type="text"
              value={savePinName}
              onChange={(e) => setSavePinName(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#a7e26e] mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onSavePin && !isSavingPin) {
                  setIsSavingPin(true);
                  onSavePin(savePinPrompt.lat, savePinPrompt.lon, savePinName).then(() => {
                    setSavePinPrompt(null);
                    setSavePinName('');
                  }).finally(() => setIsSavingPin(false));
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setSavePinPrompt(null)}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={isSavingPin}
                onClick={() => {
                  if (!onSavePin || isSavingPin) return;
                  setIsSavingPin(true);
                  onSavePin(savePinPrompt.lat, savePinPrompt.lon, savePinName).then(() => {
                    setSavePinPrompt(null);
                    setSavePinName('');
                  }).finally(() => setIsSavingPin(false));
                }}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#222f30] hover:bg-[#1a2526] rounded-lg transition-colors disabled:opacity-50"
              >
                {isSavingPin ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Picker Modal */}
      {showLeadPicker && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]" onClick={() => setShowLeadPicker(false)}>
          <div className="bg-white rounded-xl shadow-lg p-5 w-96 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[#222f30] mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Enviar evaluación a Lead
            </h3>

            {/* Search input */}
            <div className="relative mb-3">
              <input
                type="text"
                value={leadSearchQuery}
                onChange={(e) => {
                  setLeadSearchQuery(e.target.value);
                  searchLeads(e.target.value);
                }}
                placeholder="Buscar lead por nombre, email o dirección..."
                className="w-full px-3 py-2 pl-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Results list */}
            <div className="flex-1 overflow-y-auto min-h-0 border rounded-lg">
              {isSearchingLeads ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : leadSearchResults.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500">
                  {leadSearchQuery ? 'No se encontraron leads' : 'No hay leads disponibles'}
                </div>
              ) : (
                <div className="divide-y">
                  {leadSearchResults.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => sendMeasurementToLead(lead.id)}
                      disabled={isSendingToLead}
                      className="w-full px-3 py-3 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium text-sm text-[#222f30]">{lead.name}</div>
                      <div className="text-xs text-gray-500">{lead.email}</div>
                      {lead.address && (
                        <div className="text-xs text-gray-400 truncate">{lead.address}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer with summary */}
            {displaySolarEstimate && (
              <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Área medida:</span>
                  <span className="font-medium text-gray-700">{measuredAreaM2?.toFixed(0)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span>Sistema:</span>
                  <span className="font-medium text-gray-700">{displaySolarEstimate.systemKwp.toFixed(1)} kWp</span>
                </div>
                <div className="flex justify-between">
                  <span>Ahorro estimado:</span>
                  <span className="font-medium text-green-600">{displaySolarEstimate.annualSavingsEur.toFixed(0)} €/año</span>
                </div>
              </div>
            )}

            {/* Cancel button */}
            <button
              onClick={() => setShowLeadPicker(false)}
              className="mt-3 w-full px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>

            {isSendingToLead && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Enviando...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Lead Modal */}
      {showCreateLead && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]" onClick={() => setShowCreateLead(false)}>
          <div className="bg-white rounded-xl shadow-lg p-5 w-96" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[#222f30] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#a7e26e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Crear nuevo Lead
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="Nombre del contacto"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#a7e26e]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#a7e26e]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#a7e26e]"
                />
              </div>
            </div>

            {/* Summary */}
            {displaySolarEstimate && (
              <div className="mt-4 pt-3 border-t text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Área medida:</span>
                  <span className="font-medium text-gray-700">{measuredAreaM2?.toFixed(0)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span>Sistema:</span>
                  <span className="font-medium text-gray-700">{displaySolarEstimate.systemKwp.toFixed(1)} kWp</span>
                </div>
                <div className="flex justify-between">
                  <span>Ahorro estimado:</span>
                  <span className="font-medium text-green-600">{displaySolarEstimate.annualSavingsEur.toFixed(0)} €/año</span>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCreateLead(false)}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={createLeadAndSendMeasurement}
                disabled={isCreatingLead || !newLeadName}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#222f30] hover:bg-[#1a2526] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingLead ? 'Creando...' : 'Crear y Enviar'}
              </button>
            </div>

            {isCreatingLead && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-5 h-5 border-2 border-[#a7e26e] border-t-transparent rounded-full animate-spin" />
                  Creando lead...
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
