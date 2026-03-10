'use client';

import { useState, useCallback, useRef } from 'react';
import { ProspectMap, ProspectFilters, BuildingResultsList } from '@/components/map';
import type { BBoxBounds, BuildingResult, ProspectFiltersType, AssessmentType, GrantCategory } from '@/components/map';
import { exportToCSV } from '@/lib/utils/export';
import { downloadProspectReport, ReportMetadata } from '@/lib/services/prospect-report';

export default function ProspectingPage() {
  const [bounds, setBounds] = useState<BBoxBounds | null>(null);
  const [buildings, setBuildings] = useState<BuildingResult[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('solar');
  const [grantCategory, setGrantCategory] = useState<GrantCategory>('residential');
  const lastFiltersRef = useRef<ProspectFiltersType | null>(null);

  const handleAreaSelect = useCallback((selectedBounds: BBoxBounds | null) => {
    setBounds(selectedBounds);
    if (selectedBounds === null) {
      setBuildings([]);
      setSelectedBuilding(null);
    }
    setError(null);
  }, []);

  const handleSearch = useCallback(async (selectedBounds: BBoxBounds, filters: ProspectFiltersType) => {
    setIsLoading(true);
    setError(null);
    setBuildings([]);
    setSelectedBuilding(null);
    lastFiltersRef.current = filters;
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

      if (data.truncated) {
        setError(`Se encontraron ${data.totalFound} edificios, mostrando los primeros ${data.count}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    if (buildings.length === 0 || !bounds || !lastFiltersRef.current) return;

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
        minArea: lastFiltersRef.current.minArea,
        businessSegment: lastFiltersRef.current.businessSegment,
        electricityPrice: lastFiltersRef.current.electricityPrice,
      },
      generatedAt: new Date(),
    };

    downloadProspectReport(buildings, metadata);
  }, [buildings, bounds, assessmentType]);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <ProspectFilters
          onSearch={handleSearch}
          selectedBounds={bounds}
          isLoading={isLoading}
          onAssessmentTypeChange={setAssessmentType}
        />

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            {error}
          </div>
        )}

        <BuildingResultsList
          buildings={buildings}
          selectedBuilding={selectedBuilding}
          onBuildingSelect={setSelectedBuilding}
          onExport={handleExport}
          onExportPDF={handleExportPDF}
          assessmentType={assessmentType}
          grantCategory={grantCategory}
          businessSegment={lastFiltersRef.current?.businessSegment}
          electricityPrice={lastFiltersRef.current?.electricityPrice}
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
        />
      </div>
    </div>
  );
}
