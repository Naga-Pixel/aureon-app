'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProspectMap, ProspectFilters, BuildingResultsList } from '@/components/map';
import { PropertySidebar } from '@/components/map/PropertySidebar';
import type { BBoxBounds, BuildingResult, ProspectFiltersType } from '@/components/map';
import { exportToCSV } from '@/lib/utils/export';
import { downloadProspectReport, ReportMetadata } from '@/lib/services/prospect-report';
import type { SavedLocation } from '@/lib/supabase/types';
import { useProspectingStore } from '@/stores';
import { useScrollRestore } from '@/hooks/useScrollRestore';

export default function ProspectingPage() {
  const searchParams = useSearchParams();

  // Store state
  const {
    bounds,
    setBounds,
    buildings,
    setBuildings,
    selectedBuildingId,
    setSelectedBuildingId,
    lastFilters,
    setLastFilters,
    assessmentType,
    setAssessmentType,
    grantCategory,
    setGrantCategory,
    scrollPosition,
    setScrollPosition,
    mapCenter,
    mapZoom,
    setMapView,
  } = useProspectingStore();

  // Scroll restoration for building results list
  const scrollRef = useScrollRestore<HTMLDivElement>({
    scrollPosition,
    setScrollPosition,
  });

  // Read initial position from URL params (from Gestoras/Leads page links)
  // URL params always take priority over stored position
  const urlLat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null;
  const urlLon = searchParams.get('lon') ? parseFloat(searchParams.get('lon')!) : null;
  const urlZoom = searchParams.get('zoom') ? parseFloat(searchParams.get('zoom')!) : null;
  const initialLat = urlLat ?? mapCenter?.lat;
  const initialLon = urlLon ?? mapCenter?.lon;
  const initialZoom = urlZoom ?? mapZoom ?? undefined;
  const gestoraFilter = searchParams.get('gestora') || undefined;

  // Find selected building from ID
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    return buildings.find(b => b.buildingId === selectedBuildingId || b.cadastralReference === selectedBuildingId) || null;
  }, [buildings, selectedBuildingId]);

  const setSelectedBuilding = useCallback((building: BuildingResult | null) => {
    setSelectedBuildingId(building?.buildingId || building?.cadastralReference || null);
  }, [setSelectedBuildingId]);

  // Local state for transient UI
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceWarnings, setServiceWarnings] = useState<string[]>([]);

  // Saved locations
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

  const fetchSavedLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-locations');
      if (res.ok) {
        const data = await res.json();
        setSavedLocations(data.locations || []);
      } else {
        console.warn('[ProspectingPage] Saved locations fetch failed:', res.status);
      }
    } catch (err) {
      console.error('[ProspectingPage] Error fetching saved locations:', err);
    }
  }, []);

  useEffect(() => {
    fetchSavedLocations();
  }, [fetchSavedLocations]);

  // Set of building IDs that are saved (for PropertySidebar toggle state)
  const savedLocationIds = useMemo(() => {
    const ids = new Set<string>();
    savedLocations.forEach(loc => {
      if (loc.type === 'building' && loc.building_data) {
        const bd = loc.building_data as Record<string, unknown>;
        const key = (bd.buildingId as string) || (bd.cadastralReference as string) || '';
        if (key) ids.add(key);
      }
    });
    return ids;
  }, [savedLocations]);

  // Map from building key to saved location ID (for unsave)
  const savedLocationByBuildingKey = useMemo(() => {
    const map = new Map<string, string>();
    savedLocations.forEach(loc => {
      if (loc.type === 'building' && loc.building_data) {
        const bd = loc.building_data as Record<string, unknown>;
        const key = (bd.buildingId as string) || (bd.cadastralReference as string) || '';
        if (key) map.set(key, loc.id);
      }
    });
    return map;
  }, [savedLocations]);

  const handleSaveBuilding = useCallback(async (building: BuildingResult) => {
    const lat = building.polygonCoordinates
      ? building.polygonCoordinates.reduce((s, c) => s + c[1], 0) / building.polygonCoordinates.length
      : 0;
    const lon = building.polygonCoordinates
      ? building.polygonCoordinates.reduce((s, c) => s + c[0], 0) / building.polygonCoordinates.length
      : 0;

    await fetch('/api/saved-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'building',
        name: building.streetAddress || building.cadastralReference || 'Edificio',
        lat,
        lon,
        building_data: building,
      }),
    });
    await fetchSavedLocations();
  }, [fetchSavedLocations]);

  const handleUnsaveBuilding = useCallback(async (buildingKey: string) => {
    const locationId = savedLocationByBuildingKey.get(buildingKey);
    if (!locationId) return;
    await fetch(`/api/saved-locations?id=${locationId}`, { method: 'DELETE' });
    await fetchSavedLocations();
  }, [savedLocationByBuildingKey, fetchSavedLocations]);

  const handleSavePin = useCallback(async (lat: number, lon: number, name: string) => {
    const res = await fetch('/api/saved-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pin', name: name || 'Pin', lat, lon }),
    });
    if (!res.ok) {
      console.error('[ProspectingPage] Failed to save pin:', res.status, await res.text());
    }
    await fetchSavedLocations();
  }, [fetchSavedLocations]);

  const handleDeleteSavedLocation = useCallback(async (id: string) => {
    await fetch(`/api/saved-locations?id=${id}`, { method: 'DELETE' });
    await fetchSavedLocations();
  }, [fetchSavedLocations]);

  const handleUpdateSavedLocationColor = useCallback(async (id: string, color: string) => {
    await fetch('/api/saved-locations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, color }),
    });
    await fetchSavedLocations();
  }, [fetchSavedLocations]);

  const handlePromoteToLead = useCallback(async (locationId: string) => {
    const res = await fetch('/api/leads/from-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId }),
    });
    if (res.ok) {
      const data = await res.json();
      // Navigate to the lead page to edit details
      window.location.href = `/installer/leads/${data.lead.id}`;
    } else {
      console.error('[ProspectingPage] Failed to promote to lead');
    }
  }, []);

  const handleAreaSelect = useCallback((selectedBounds: BBoxBounds | null) => {
    setBounds(selectedBounds);
    if (selectedBounds === null) {
      setBuildings([]);
      setSelectedBuildingId(null);
    }
    setError(null);
  }, [setBounds, setBuildings, setSelectedBuildingId]);

  const handleSearch = useCallback(async (selectedBounds: BBoxBounds, filters: ProspectFiltersType) => {
    setIsLoading(true);
    setError(null);
    setServiceWarnings([]);
    setBuildings([]);
    setSelectedBuildingId(null);
    setLastFilters(filters);
    setGrantCategory(filters.grantCategory);

    try {
      const res = await fetch('/api/prospecting/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds: selectedBounds, filters }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al buscar edificios');
      }

      setBuildings(data.buildings);
      setScrollPosition(0); // Reset scroll on new search

      // Check service status and build warnings
      // Note: null means "not checked", false means "failed"
      const warnings: string[] = [];
      if (data.serviceStatus) {
        if (data.serviceStatus.catastro === false) {
          warnings.push('Catastro no disponible - no se pueden obtener edificios');
        }
        if (data.serviceStatus.pvgis === false) {
          warnings.push('PVGIS no disponible - usando estimaciones de produccion solar');
        }
        if (data.serviceStatus.esios === false) {
          warnings.push('ESIOS no disponible - usando estimaciones de precios electricos');
        }
      }
      setServiceWarnings(warnings);

      if (data.truncated) {
        setError(`Se encontraron ${data.totalFound} edificios, mostrando los primeros ${data.count}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [setBuildings, setSelectedBuildingId, setLastFilters, setGrantCategory, setScrollPosition]);

  const handleExport = useCallback(() => {
    if (buildings.length === 0) return;
    const csv = exportToCSV(buildings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `prospeccion-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [buildings]);

  const handleExportPDF = useCallback(() => {
    if (buildings.length === 0 || !bounds || !lastFilters) return;

    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const latKm = Math.abs(bounds.maxLat - bounds.minLat) * 111;
    const lonKm = Math.abs(bounds.maxLon - bounds.minLon) * 111 * Math.cos(centerLat * Math.PI / 180);

    const metadata: ReportMetadata = {
      assessmentType,
      location: {
        centerLat,
        centerLon,
        areaKm2: latKm * lonKm,
      },
      filters: {
        minArea: lastFilters.minArea,
        businessSegment: lastFilters.businessSegment,
        electricityPrice: lastFilters.electricityPrice,
      },
      generatedAt: new Date(),
    };

    downloadProspectReport(buildings, metadata);
  }, [buildings, bounds, assessmentType, lastFilters]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedBuilding(null);
  }, []);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <ProspectFilters
          onSearch={handleSearch}
          selectedBounds={bounds}
          isLoading={isLoading}
          onAssessmentTypeChange={setAssessmentType}
          initialAssessmentType={assessmentType}
        />

        {serviceWarnings.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
            <div className="font-medium mb-1">Servicios con problemas:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {serviceWarnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            {error}
          </div>
        )}

        <BuildingResultsList
          ref={scrollRef}
          buildings={buildings}
          selectedBuilding={selectedBuilding}
          onBuildingSelect={setSelectedBuilding}
          onExport={handleExport}
          onExportPDF={handleExportPDF}
          assessmentType={assessmentType}
        />
      </div>

      {/* Map area */}
      <div className="flex-1">
        <ProspectMap
          buildings={buildings}
          bounds={bounds}
          isLoading={isLoading}
          onAreaSelect={handleAreaSelect}
          selectedBuilding={selectedBuilding}
          onBuildingSelect={setSelectedBuilding}
          assessmentType={assessmentType}
          showCommercialAnchors={true}
          initialLat={initialLat}
          initialLon={initialLon}
          initialZoom={initialZoom}
          gestoraFilter={gestoraFilter}
          savedLocations={savedLocations}
          onSavePin={handleSavePin}
          onDeleteSavedLocation={handleDeleteSavedLocation}
          onUpdateSavedLocationColor={handleUpdateSavedLocationColor}
          onPromoteToLead={handlePromoteToLead}
          onViewChange={setMapView}
        />
      </div>

      {/* Property Intelligence Sidebar */}
      <PropertySidebar
        building={selectedBuilding}
        onClose={handleCloseSidebar}
        assessmentType={assessmentType}
        grantCategory={grantCategory}
        businessSegment={lastFilters?.businessSegment || 'residential'}
        electricityPrice={lastFilters?.electricityPrice || 0.18}
        savedLocationIds={savedLocationIds}
        onSaveBuilding={handleSaveBuilding}
        onUnsaveBuilding={handleUnsaveBuilding}
      />
    </div>
  );
}
