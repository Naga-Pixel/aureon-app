'use client';

import { useState, useEffect, useCallback } from 'react';
import { BuildingResult, AssessmentType, GrantCategory, DataProvenance } from './types';
import { downloadBuildingReport, type ApartmentBuildingInput } from '@/lib/services/building-report';

type Tab = 'physical' | 'financial' | 'action';

interface PropertySidebarProps {
  building: BuildingResult | null;
  onClose: () => void;
  assessmentType: AssessmentType;
  grantCategory: GrantCategory;
  businessSegment: string;
  electricityPrice: number;
}

const TAB_LABELS: Record<Tab, string> = {
  physical: 'Físico',
  financial: 'Financiero',
  action: 'Acción',
};

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
    if (GRAN_CANARIA_MUNICIPALITIES.some(m => normalizedMuni.includes(m))) {
      return 'Gran Canaria';
    }
    if (FUERTEVENTURA_MUNICIPALITIES.some(m => normalizedMuni.includes(m))) {
      return 'Fuerteventura';
    }
  }
  if (province) {
    const normalized = province.toLowerCase();
    if (normalized.includes('palmas') || normalized.includes('las palmas')) {
      return 'Gran Canaria';
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
  return Math.round(batteryKwh * 900);
}

/**
 * Get provenance badge color
 */
function getProvenanceBadge(provenance?: DataProvenance): { color: string; label: string } {
  if (!provenance) return { color: 'bg-gray-200 text-gray-600', label: '?' };

  switch (provenance.source) {
    case 'api':
      return { color: 'bg-green-100 text-green-700', label: 'API' };
    case 'config':
      return { color: 'bg-blue-100 text-blue-700', label: 'Config' };
    case 'estimate':
      return { color: 'bg-yellow-100 text-yellow-700', label: 'Est.' };
    case 'fallback':
      return { color: 'bg-red-100 text-red-700', label: 'Fallback' };
    default:
      return { color: 'bg-gray-200 text-gray-600', label: '?' };
  }
}

/**
 * Format number with Spanish locale
 */
function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null) return '-';
  return value.toLocaleString('es-ES', { maximumFractionDigits: decimals });
}

/**
 * Format currency
 */
function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${formatNumber(value, 0)} €`;
}

/**
 * Info row component
 */
function InfoRow({
  label,
  value,
  provenance,
  unit,
}: {
  label: string;
  value: string | number | null | undefined;
  provenance?: DataProvenance;
  unit?: string;
}) {
  const badge = getProvenanceBadge(provenance);
  const displayValue = typeof value === 'number' ? formatNumber(value) : value;

  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-gray-600 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium text-[#222f30]">
          {displayValue || '-'}
          {unit && displayValue ? ` ${unit}` : ''}
        </span>
        {provenance && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Loading spinner for inline use
 */
function InlineSpinner() {
  return (
    <div className="w-4 h-4 border-2 border-[#a7e26e] border-t-transparent rounded-full animate-spin" />
  );
}

/**
 * Physical tab content
 */
function PhysicalTab({
  building,
  enrichedData,
  isLoading,
}: {
  building: BuildingResult;
  enrichedData: { floors: number; units: number } | null;
  isLoading: boolean;
}) {
  // Use enriched data if available, otherwise fall back to building data
  const floors = enrichedData?.floors ?? building.numberOfFloors;
  const units = enrichedData?.units ?? building.numberOfDwellings ?? 1;

  // Determine provenance for floors
  const floorsProvenance = enrichedData
    ? { source: 'api' as const, confidence: 95, note: 'Catastro detallado' }
    : building.provenance?.floors;

  return (
    <div className="space-y-1">
      <InfoRow
        label="Área cubierta"
        value={building.roofAreaM2?.toFixed(0)}
        unit="m²"
        provenance={building.provenance?.roofArea}
      />
      <InfoRow
        label="Orientación"
        value={building.orientationLabel || `${building.orientationDegrees}°`}
      />
      {/* Plantas - show spinner while loading */}
      <div className="flex justify-between items-center py-2 border-b border-gray-100">
        <span className="text-gray-600 text-sm">Plantas</span>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <InlineSpinner />
          ) : (
            <>
              <span className="font-medium text-[#222f30]">{floors || '-'}</span>
              {floorsProvenance && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getProvenanceBadge(floorsProvenance).color}`}>
                  {getProvenanceBadge(floorsProvenance).label}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {/* Viviendas - show spinner while loading */}
      <div className="flex justify-between items-center py-2 border-b border-gray-100">
        <span className="text-gray-600 text-sm">Viviendas</span>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <InlineSpinner />
          ) : (
            <>
              <span className="font-medium text-[#222f30]">{units}</span>
              {enrichedData && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                  API
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <InfoRow
        label="Uso actual"
        value={building.currentUseLabel}
        provenance={building.provenance?.buildingType}
      />
      <InfoRow label="Isla" value={building.island} />
      <InfoRow label="Municipio" value={building.municipality} />
      {building.climateZone && (
        <InfoRow label="Zona climática" value={building.climateZone} />
      )}
      <InfoRow label="Ref. catastral" value={building.cadastralReference} />
    </div>
  );
}

/**
 * Financial tab content
 */
function FinancialTab({
  building,
  assessmentType,
}: {
  building: BuildingResult;
  assessmentType: AssessmentType;
}) {
  const showSolar = assessmentType === 'solar' || assessmentType === 'combined';
  const showBattery = assessmentType === 'battery' || assessmentType === 'combined';

  // Calculate simple payback
  const totalSavings = (building.annualSavingsEur || 0) + (building.arbitrageSavingsEur || 0);
  const estimatedCost =
    (building.systemSizeKw || 0) * 1200 + (building.batteryKwh || 0) * 500;
  const paybackYears = totalSavings > 0 ? estimatedCost / totalSavings : null;

  return (
    <div className="space-y-4">
      {/* Scores */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="text-xs text-gray-500 mb-2">Puntuación</div>
        <div className="flex gap-4">
          {showSolar && (
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-[#222f30]">
                {building.solarScore || building.score || '-'}
              </div>
              <div className="text-xs text-gray-500">Solar</div>
            </div>
          )}
          {showBattery && (
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-[#222f30]">
                {building.batteryScore || '-'}
              </div>
              <div className="text-xs text-gray-500">Batería</div>
            </div>
          )}
        </div>
      </div>

      {/* Solar metrics */}
      {showSolar && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">SOLAR</div>
          <InfoRow
            label="Potencia instalable"
            value={building.systemSizeKw?.toFixed(1)}
            unit="kWp"
          />
          <InfoRow
            label="Producción anual"
            value={formatNumber(building.annualProductionKwh)}
            unit="kWh"
          />
          <InfoRow
            label="Autoconsumo"
            value={building.selfConsumptionRatio ? `${(building.selfConsumptionRatio * 100).toFixed(0)}%` : null}
          />
          <InfoRow
            label="Ahorro anual"
            value={formatCurrency(building.annualSavingsEur)}
          />
        </div>
      )}

      {/* Battery metrics */}
      {showBattery && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">BATERÍA</div>
          <InfoRow
            label="Capacidad recomendada"
            value={building.batteryKwh?.toFixed(0)}
            unit="kWh"
          />
          <InfoRow
            label="Vulnerabilidad red"
            value={building.gridVulnerability ? `${building.gridVulnerability.toFixed(0)}%` : null}
            provenance={building.provenance?.gridVulnerability}
          />
          <InfoRow
            label="Ahorro arbitraje"
            value={formatCurrency(building.arbitrageSavingsEur)}
            provenance={building.provenance?.arbitragePrices}
          />
        </div>
      )}

      {/* Summary */}
      <div className="bg-[#222f30] text-white rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm opacity-80">Ahorro total anual</span>
          <span className="text-xl font-bold">{formatCurrency(totalSavings)}</span>
        </div>
        {paybackYears && paybackYears > 0 && paybackYears < 25 && (
          <div className="flex justify-between items-center text-sm">
            <span className="opacity-80">Periodo de retorno</span>
            <span className="font-medium">{paybackYears.toFixed(1)} años</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Property Intelligence Card - Slide-out sidebar
 */
export function PropertySidebar({
  building,
  onClose,
  assessmentType,
  grantCategory,
  businessSegment,
  electricityPrice,
}: PropertySidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('physical');
  const isOpen = building !== null;

  // Enriched Catastro data (floors, units) - fetched on building selection
  const [enrichedData, setEnrichedData] = useState<{ floors: number; units: number } | null>(null);
  const [isLoadingEnriched, setIsLoadingEnriched] = useState(false);

  // Apartment building modal state
  const [apartmentModal, setApartmentModal] = useState<{
    open: boolean;
    building: BuildingResult | null;
    floors: number;
    units: number;
    loading: boolean;
    catastroSource: boolean;
    catastroUnits: number | null;
    catastroWarning: boolean;
  }>({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null, catastroWarning: false });

  // Reset to physical tab and fetch enriched data when building changes
  useEffect(() => {
    if (building) {
      setActiveTab('physical');
      // Reset enriched data and start fetching
      setEnrichedData(null);
      setIsLoadingEnriched(true);

      // Fetch enriched Catastro data
      const ref = building.cadastralReference;
      if (ref) {
        fetch(`/api/prospecting/dwelling-count?ref=${encodeURIComponent(ref)}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.totalUnits && data.totalUnits > 0) {
              setEnrichedData({
                floors: data.floors || building.numberOfFloors || 1,
                units: data.totalUnits,
              });
            }
          })
          .catch(err => {
            console.error('[PropertySidebar] Catastro fetch error:', err);
          })
          .finally(() => {
            setIsLoadingEnriched(false);
          });
      } else {
        setIsLoadingEnriched(false);
      }
    } else {
      // Building deselected - clear state
      setEnrichedData(null);
      setIsLoadingEnriched(false);
    }
  }, [building?.buildingId, building?.cadastralReference, building?.numberOfFloors]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !apartmentModal.open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, apartmentModal.open]);

  // Fetch dwelling count from Catastro
  const fetchDwellingCount = useCallback(async (b: BuildingResult) => {
    const ref = b.cadastralReference;
    if (!ref) return null;

    try {
      const response = await fetch(`/api/prospecting/dwelling-count?ref=${encodeURIComponent(ref)}`);
      if (!response.ok) return null;

      const data = await response.json();
      if (data.totalUnits && data.totalUnits > 0) {
        return { floors: data.floors || 1, units: data.totalUnits };
      }
      return null;
    } catch (error) {
      console.error('[DwellingCount] Fetch error:', error);
      return null;
    }
  }, []);

  // Generate and download report
  const generateAndDownloadReport = useCallback((b: BuildingResult, apartmentInput?: ApartmentBuildingInput) => {
    const island = b.island || getIslandFromLocation(b.municipality, b.province);
    const batteryCostEur = estimateBatteryCost(b.batteryKwh);

    downloadBuildingReport(b, {
      assessmentType,
      grantCategory,
      businessSegment,
      electricityPrice,
      generatedAt: new Date(),
      address: b.streetAddress ?? undefined,
      island,
      batteryCostEur,
      apartmentBuilding: apartmentInput,
    });
  }, [assessmentType, grantCategory, businessSegment, electricityPrice]);

  // Handle download click
  const handleDownloadClick = useCallback(async () => {
    if (!building) return;

    const isApartmentBuilding = businessSegment === 'apartment_building' ||
      (building.numberOfDwellings && building.numberOfDwellings > 1) ||
      (enrichedData && enrichedData.units > 1);

    if (isApartmentBuilding && (assessmentType === 'battery' || assessmentType === 'combined')) {
      const defaultFloors = enrichedData?.floors || building.numberOfFloors || 4;
      const defaultUnits = enrichedData?.units || building.numberOfDwellings || defaultFloors * 2;

      // If we already have enriched data, use it directly (no loading needed)
      if (enrichedData) {
        const isSuspicious = businessSegment === 'apartment_building' && enrichedData.units <= 1;
        setApartmentModal({
          open: true,
          building,
          floors: enrichedData.floors,
          units: enrichedData.units,
          loading: false,
          catastroSource: !isSuspicious,
          catastroUnits: enrichedData.units,
          catastroWarning: isSuspicious,
        });
        return;
      }

      // No enriched data yet - show modal with loading state
      setApartmentModal({
        open: true,
        building,
        floors: defaultFloors,
        units: defaultUnits,
        loading: true,
        catastroSource: false,
        catastroUnits: null,
        catastroWarning: false,
      });

      // Fetch from Catastro
      const catastroData = await fetchDwellingCount(building);
      if (catastroData) {
        const isSuspicious = businessSegment === 'apartment_building' && catastroData.units <= 1;

        if (isSuspicious) {
          setApartmentModal(prev => ({
            ...prev,
            floors: defaultFloors,
            units: defaultUnits,
            loading: false,
            catastroSource: false,
            catastroUnits: catastroData.units,
            catastroWarning: true,
          }));
        } else {
          setApartmentModal(prev => ({
            ...prev,
            floors: catastroData.floors || defaultFloors,
            units: catastroData.units,
            loading: false,
            catastroSource: true,
            catastroUnits: catastroData.units,
            catastroWarning: false,
          }));
        }
      } else {
        setApartmentModal(prev => ({
          ...prev,
          loading: false,
          catastroSource: false,
          catastroUnits: null,
          catastroWarning: false,
        }));
      }
      return;
    }

    // For non-apartment buildings, download directly
    generateAndDownloadReport(building);
  }, [building, businessSegment, assessmentType, fetchDwellingCount, generateAndDownloadReport, enrichedData]);

  const handleApartmentModalConfirm = () => {
    if (apartmentModal.building) {
      generateAndDownloadReport(apartmentModal.building, {
        floors: apartmentModal.floors,
        units: apartmentModal.units,
      });
    }
    setApartmentModal({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null, catastroWarning: false });
  };

  const closeApartmentModal = () => {
    setApartmentModal({ open: false, building: null, floors: 4, units: 8, loading: false, catastroSource: false, catastroUnits: null, catastroWarning: false });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {building && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-[#222f30]">
                  Inteligencia del Inmueble
                </h2>
                {building.streetAddress && (
                  <p className="text-sm text-gray-500 truncate max-w-[280px]">
                    {building.streetAddress}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b">
              {(['physical', 'financial', 'action'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'border-b-2 border-[#a7e26e] text-[#222f30]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4 overflow-y-auto h-[calc(100%-140px)]">
              {activeTab === 'physical' && (
                  <PhysicalTab
                    building={building}
                    enrichedData={enrichedData}
                    isLoading={isLoadingEnriched}
                  />
                )}
              {activeTab === 'financial' && (
                <FinancialTab building={building} assessmentType={assessmentType} />
              )}
              {activeTab === 'action' && (
                <div className="space-y-4">
                  <button
                    onClick={handleDownloadClick}
                    className="w-full py-3 px-4 bg-[#222f30] text-white rounded-lg font-medium hover:bg-[#1a2425] transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Descargar informe detallado (PDF)
                  </button>

                  <button
                    disabled
                    className="w-full py-3 px-4 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    Añadir a Cartera (Próximamente)
                  </button>

                  {/* Building reference info */}
                  <div className="text-xs text-gray-400 mt-4">
                    <div>ID: {building.buildingId}</div>
                    <div>Ref: {building.cadastralReference}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Apartment Building Modal */}
      {apartmentModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={closeApartmentModal}>
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

            {/* Catastro source indicator - success */}
            {!apartmentModal.loading && apartmentModal.catastroSource && apartmentModal.catastroUnits && !apartmentModal.catastroWarning && (
              <div className="flex items-center gap-2 text-sm text-green-700 mb-4 bg-green-50 rounded-lg p-3">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{apartmentModal.catastroUnits} viviendas registradas en Catastro</span>
              </div>
            )}

            {/* Catastro warning - suspicious data */}
            {!apartmentModal.loading && apartmentModal.catastroWarning && (
              <div className="flex items-start gap-2 text-sm text-amber-700 mb-4 bg-amber-50 rounded-lg p-3">
                <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Catastro solo registra {apartmentModal.catastroUnits} unidad (puede estar sin dividir). Verifica los valores estimados abajo.</span>
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
                onClick={closeApartmentModal}
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
    </>
  );
}
