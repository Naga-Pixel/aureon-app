'use client';

import { useState, useCallback } from 'react';
import { BuildingResult, AssessmentType, GrantCategory } from './types';
import { downloadBuildingReport, type ApartmentBuildingInput } from '@/lib/services/building-report';

// Gran Canaria municipalities (for grant eligibility)
const GRAN_CANARIA_MUNICIPALITIES = [
  'agaete', 'aguimes', 'agüimes', 'artenara', 'arucas', 'firgas', 'galdar', 'gáldar',
  'ingenio', 'aldea', 'san nicolas', 'san nicolás', 'las palmas', 'mogan', 'mogán',
  'moya', 'san bartolome', 'san bartolomé', 'tirajana', 'santa brigida', 'santa brígida',
  'santa lucia', 'santa lucía', 'guia', 'guía', 'tejeda', 'telde', 'teror',
  'valsequillo', 'valleseco', 'vega de san mateo', 'san mateo'
];

// Fuerteventura municipalities
const FUERTEVENTURA_MUNICIPALITIES = [
  'antigua', 'betancuria', 'oliva', 'pajara', 'pájara', 'puerto del rosario', 'tuineje'
];

// Map municipality/province to island for Canary Islands
function getIslandFromLocation(municipality: string | null, province: string | null): string | undefined {
  if (municipality) {
    const normalizedMuni = municipality.toLowerCase();

    // Check Gran Canaria
    if (GRAN_CANARIA_MUNICIPALITIES.some(m => normalizedMuni.includes(m))) {
      return 'Gran Canaria';
    }

    // Check Fuerteventura
    if (FUERTEVENTURA_MUNICIPALITIES.some(m => normalizedMuni.includes(m))) {
      return 'Fuerteventura';
    }
  }

  // Fallback to province-based detection
  if (province) {
    const normalized = province.toLowerCase();
    if (normalized.includes('palmas') || normalized.includes('las palmas')) {
      return 'Gran Canaria'; // Default for Las Palmas province
    }
    if (normalized.includes('tenerife') || normalized.includes('santa cruz')) {
      return 'Tenerife';
    }
  }

  return undefined;
}

// Estimate battery cost based on kWh
function estimateBatteryCost(batteryKwh: number | undefined): number | undefined {
  if (!batteryKwh) return undefined;
  // Average residential battery cost ~800-1000 EUR/kWh
  return Math.round(batteryKwh * 900);
}

interface BuildingResultsListProps {
  buildings: BuildingResult[];
  selectedBuilding: BuildingResult | null;
  onBuildingSelect: (building: BuildingResult | null) => void;
  onExport: () => void;
  onExportPDF?: () => void;
  assessmentType?: AssessmentType;
  grantCategory?: GrantCategory;
  businessSegment?: string;
  electricityPrice?: number;
}

export function BuildingResultsList({
  buildings,
  selectedBuilding,
  onBuildingSelect,
  onExport,
  onExportPDF,
  assessmentType = 'solar',
  grantCategory = 'residential',
  businessSegment = 'residential',
  electricityPrice = 0.20,
}: BuildingResultsListProps) {
  // Address cache: 'loading' | null (not found) | string (address)
  const [addressCache, setAddressCache] = useState<Record<string, 'loading' | string | null>>({});

  // Apartment building modal state
  const [apartmentModal, setApartmentModal] = useState<{
    open: boolean;
    building: BuildingResult | null;
    floors: number;
    units: number;
    loading: boolean;
    catastroSource: boolean; // true if data came from Catastro API
    catastroUnits: number | null; // original Catastro count for display
  }>({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null });

  // Fetch address for a building (called on click)
  const fetchAddressIfNeeded = useCallback((building: BuildingResult) => {
    const ref = building.cadastralReference;
    if (!ref || ref in addressCache) return;

    // Mark as loading
    setAddressCache(prev => ({ ...prev, [ref]: 'loading' }));

    // Build URL with coordinates if available (for Cartociudad reverse geocoding)
    let url = `/api/prospecting/address?ref=${encodeURIComponent(ref)}`;
    if (building.polygonCoordinates) {
      url += `&coords=${encodeURIComponent(JSON.stringify(building.polygonCoordinates))}`;
    }

    // Fetch address
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setAddressCache(prev => ({
          ...prev,
          [ref]: data.address?.fullAddress || null,
        }));
      })
      .catch(() => {
        setAddressCache(prev => ({
          ...prev,
          [ref]: null,
        }));
      });
  }, [addressCache]);

  // Handle building selection - fetch address on click
  const handleBuildingClick = useCallback((building: BuildingResult) => {
    const isDeselecting = building === selectedBuilding;
    onBuildingSelect(isDeselecting ? null : building);

    // Fetch address when selecting (not deselecting)
    if (!isDeselecting) {
      fetchAddressIfNeeded(building);
    }
  }, [selectedBuilding, onBuildingSelect, fetchAddressIfNeeded]);

  // Check if address is loading
  const isAddressLoading = (ref: string) => addressCache[ref] === 'loading';

  // Fetch dwelling count from Catastro DNPRC API
  const fetchDwellingCount = useCallback(async (building: BuildingResult) => {
    const ref = building.cadastralReference;
    if (!ref) return null;

    try {
      const response = await fetch(`/api/prospecting/dwelling-count?ref=${encodeURIComponent(ref)}`);
      if (!response.ok) return null;

      const data = await response.json();
      if (data.totalUnits && data.totalUnits > 0) {
        return {
          floors: data.floors || 1,
          units: data.totalUnits,
        };
      }
      return null;
    } catch (error) {
      console.error('[DwellingCount] Fetch error:', error);
      return null;
    }
  }, []);

  const handleDownloadBuildingReport = async (building: BuildingResult, e: React.MouseEvent) => {
    e.stopPropagation();

    // For apartment buildings, show modal to get floors/units
    const isApartmentBuilding = businessSegment === 'apartment_building' ||
      (building.numberOfDwellings && building.numberOfDwellings > 1);

    if (isApartmentBuilding && (assessmentType === 'battery' || assessmentType === 'combined')) {
      // Show modal immediately with loading state
      const defaultFloors = building.numberOfFloors || 4;
      const defaultUnits = building.numberOfDwellings || defaultFloors * 2;
      setApartmentModal({
        open: true,
        building,
        floors: defaultFloors,
        units: defaultUnits,
        loading: true,
        catastroSource: false,
        catastroUnits: null,
      });

      // Fetch exact count from Catastro DNPRC API
      const catastroData = await fetchDwellingCount(building);
      if (catastroData) {
        setApartmentModal(prev => ({
          ...prev,
          floors: catastroData.floors,
          units: catastroData.units,
          loading: false,
          catastroSource: true,
          catastroUnits: catastroData.units,
        }));
      } else {
        setApartmentModal(prev => ({
          ...prev,
          loading: false,
          catastroSource: false,
          catastroUnits: null,
        }));
      }
      return;
    }

    // For non-apartment buildings, download directly
    generateAndDownloadReport(building);
  };

  const generateAndDownloadReport = (building: BuildingResult, apartmentInput?: ApartmentBuildingInput) => {
    // Get address from cache if available
    const address = building.cadastralReference
      ? addressCache[building.cadastralReference]
      : null;

    // Use island from API (detected from coordinates) or fallback to location detection
    const island = building.island || getIslandFromLocation(building.municipality, building.province);

    // Estimate battery cost for waterfall chart
    const batteryCostEur = estimateBatteryCost(building.batteryKwh);

    // Debug logging
    console.log('[Report Debug]', {
      buildingIsland: building.island,
      detectedIsland: island,
      municipality: building.municipality,
      province: building.province,
      batteryKwh: building.batteryKwh,
      batteryCostEur,
      assessmentType,
      apartmentInput,
    });

    downloadBuildingReport(building, {
      assessmentType,
      grantCategory,
      businessSegment,
      electricityPrice,
      generatedAt: new Date(),
      address: address === 'loading' ? null : address,
      island,
      batteryCostEur,
      apartmentBuilding: apartmentInput,
    });
  };

  const handleApartmentModalConfirm = () => {
    if (apartmentModal.building) {
      generateAndDownloadReport(apartmentModal.building, {
        floors: apartmentModal.floors,
        units: apartmentModal.units,
      });
    }
    setApartmentModal({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null });
  };
  if (buildings.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-4">
        <p className="text-gray-500 text-sm text-center">
          Selecciona un area en el mapa para buscar edificios
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-4 flex flex-col max-h-[400px]">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#222f30]">Resultados</h3>
          <p className="text-xs text-gray-500">{buildings.length} edificios encontrados</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="text-sm text-[#222f30] hover:text-[#a7e26e] font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100"
            title="Exportar a CSV"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              className="text-sm text-white bg-[#222f30] hover:bg-[#1a2526] font-medium flex items-center gap-1 px-2 py-1 rounded"
              title="Generar informe PDF con analisis de confianza"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Informe
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {buildings.map((building, index) => (
          <button
            key={building.buildingId || index}
            onClick={() => handleBuildingClick(building)}
            className={`w-full p-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors ${
              building === selectedBuilding ? 'bg-[#a7e26e]/10' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[#222f30] truncate">
                  {building.buildingId || `Edificio #${index + 1}`}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{building.roofAreaM2?.toFixed(0) || '?'} m²</span>
                  {building.orientationLabel && (
                    <span className="flex items-center gap-1">
                      <CompassIcon direction={building.orientationDegrees || 0} />
                      {building.orientationLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-lg font-bold"
                  style={{ color: getScoreColor(building.score || 0, assessmentType) }}
                >
                  {building.score?.toFixed(0) || '—'}
                </div>
                <p className="text-xs text-gray-500">puntos</p>
              </div>
            </div>

            {/* Expanded details when selected */}
            {building === selectedBuilding && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                {/* Address */}
                {building.cadastralReference && (
                  <div className="col-span-2 pb-2 mb-2 border-b border-gray-100">
                    <span className="text-gray-500">Direccion:</span>
                    {isAddressLoading(building.cadastralReference) ? (
                      <span className="ml-1 text-gray-400 italic">Cargando...</span>
                    ) : addressCache[building.cadastralReference] ? (
                      <span className="ml-1 font-medium text-[#222f30]">
                        {addressCache[building.cadastralReference]}
                      </span>
                    ) : (
                      <span className="ml-1 text-gray-400 italic">No disponible</span>
                    )}
                  </div>
                )}

                {/* Solar metrics */}
                {(assessmentType === 'solar' || assessmentType === 'combined') && (
                  <>
                    <div>
                      <span className="text-gray-500">Sistema solar:</span>
                      <span className="ml-1 font-medium">{building.systemSizeKw?.toFixed(1) || '?'} kW</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Produccion:</span>
                      <span className="ml-1 font-medium">{formatNumber(building.annualProductionKwh)} kWh/año</span>
                    </div>
                  </>
                )}

                {/* Battery metrics */}
                {(assessmentType === 'battery' || assessmentType === 'combined') && (
                  <>
                    <div>
                      <span className="text-gray-500">Bateria:</span>
                      <span className="ml-1 font-medium">{building.batteryKwh || '?'} kWh</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Vulnerabilidad:</span>
                      <span className={`ml-1 font-medium ${getVulnerabilityColor(building.gridVulnerability || 0)}`}>
                        {building.gridVulnerability || '?'}%
                      </span>
                    </div>
                    {assessmentType === 'battery' && (
                      <div>
                        <span className="text-gray-500">Arbitraje:</span>
                        <span className="ml-1 font-medium text-blue-600">{formatCurrency(building.arbitrageSavingsEur)}/año</span>
                      </div>
                    )}
                  </>
                )}

                {/* Total savings */}
                <div className={assessmentType === 'combined' ? 'col-span-2' : ''}>
                  <span className="text-gray-500">Ahorro total:</span>
                  <span className={`ml-1 font-medium ${
                    assessmentType === 'solar' ? 'text-[#16a34a]' :
                    assessmentType === 'battery' ? 'text-blue-600' :
                    'text-purple-600'
                  }`}>
                    {formatCurrency(building.annualSavingsEur)}/año
                  </span>
                </div>

                {/* Score breakdown for combined */}
                {assessmentType === 'combined' && (
                  <div className="col-span-2 flex gap-4 pt-1">
                    <span className="text-gray-500">
                      Solar: <span className="font-medium text-[#16a34a]">{building.solarScore || '?'}</span>
                    </span>
                    <span className="text-gray-500">
                      Bateria: <span className="font-medium text-blue-600">{building.batteryScore || '?'}</span>
                    </span>
                  </div>
                )}

                {/* Download individual report */}
                <div className="col-span-2 pt-2 mt-2 border-t border-gray-100">
                  <button
                    onClick={(e) => handleDownloadBuildingReport(building, e)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-[#222f30] hover:bg-[#1a2526] rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Descargar informe detallado (PDF)
                  </button>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Apartment Building Modal */}
      {apartmentModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setApartmentModal({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null })}>
          <div className="bg-white rounded-xl shadow-lg p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[#222f30] mb-4">Datos del edificio</h3>
            <p className="text-sm text-gray-600 mb-4">
              Para calcular correctamente las subvenciones por vivienda, indica el numero de plantas y viviendas.
            </p>

            {/* Loading indicator */}
            {apartmentModal.loading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 bg-gray-50 rounded-lg p-3">
                <svg className="animate-spin h-4 w-4 text-[#222f30]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Consultando Catastro...
              </div>
            )}

            {/* Catastro source indicator */}
            {!apartmentModal.loading && apartmentModal.catastroSource && apartmentModal.catastroUnits && (
              <div className="flex items-center gap-2 text-sm text-green-700 mb-4 bg-green-50 rounded-lg p-3">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{apartmentModal.catastroUnits} viviendas registradas en Catastro</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numero de plantas
                </label>
                <input
                  type="number"
                  value={apartmentModal.floors}
                  onChange={(e) => setApartmentModal({ ...apartmentModal, floors: Math.max(1, parseInt(e.target.value) || 1), catastroSource: false })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e]"
                  min={1}
                  max={50}
                  disabled={apartmentModal.loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numero de viviendas
                </label>
                <input
                  type="number"
                  value={apartmentModal.units}
                  onChange={(e) => setApartmentModal({ ...apartmentModal, units: Math.max(1, parseInt(e.target.value) || 1), catastroSource: false })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e]"
                  min={1}
                  max={200}
                  disabled={apartmentModal.loading}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setApartmentModal({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null })}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApartmentModalConfirm}
                disabled={apartmentModal.loading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#222f30] hover:bg-[#1a2526] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generar informe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper components
function CompassIcon({ direction }: { direction: number }) {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{ transform: `rotate(${direction}deg)` }}
    >
      <path d="M12 2v20M12 2l-4 4M12 2l4 4" />
    </svg>
  );
}

function getScoreColor(score: number, assessmentType: AssessmentType = 'solar'): string {
  const palettes = {
    solar: ['#dc2626', '#ea580c', '#ca8a04', '#65a30d', '#16a34a'],
    battery: ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb'],
    combined: ['#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed'],
  };

  const palette = palettes[assessmentType];

  if (score >= 80) return palette[4];
  if (score >= 60) return palette[3];
  if (score >= 40) return palette[2];
  if (score >= 20) return palette[1];
  return palette[0];
}

function getVulnerabilityColor(vulnerability: number): string {
  if (vulnerability >= 80) return 'text-red-600';
  if (vulnerability >= 60) return 'text-orange-500';
  if (vulnerability >= 40) return 'text-yellow-600';
  return 'text-green-600';
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) return '?';
  return value.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return '?';
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
