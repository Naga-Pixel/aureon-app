'use client';

import { useCallback } from 'react';
import { BuildingResult, AssessmentType } from './types';

interface BuildingResultsListProps {
  buildings: BuildingResult[];
  selectedBuilding: BuildingResult | null;
  onBuildingSelect: (building: BuildingResult | null) => void;
  onExport: () => void;
  onExportPDF?: () => void;
  assessmentType?: AssessmentType;
}

export function BuildingResultsList({
  buildings,
  selectedBuilding,
  onBuildingSelect,
  onExport,
  onExportPDF,
  assessmentType = 'solar',
}: BuildingResultsListProps) {
  // Handle building selection
  const handleBuildingClick = useCallback((building: BuildingResult) => {
    const isDeselecting = building === selectedBuilding;
    onBuildingSelect(isDeselecting ? null : building);
  }, [selectedBuilding, onBuildingSelect]);

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
                {building.streetAddress && (
                  <div className="col-span-2 pb-2 mb-2 border-b border-gray-100">
                    <span className="text-gray-500">Direccion:</span>
                    <span className="ml-1 font-medium text-[#222f30]">
                      {building.streetAddress}
                    </span>
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
              </div>
            )}
          </button>
        ))}
      </div>
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
