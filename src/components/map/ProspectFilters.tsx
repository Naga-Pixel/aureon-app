'use client';

import { useState } from 'react';
import { BBoxBounds, ProspectFilters as Filters, AssessmentType } from './types';

interface ProspectFiltersProps {
  onSearch: (bounds: BBoxBounds, filters: Filters) => void;
  selectedBounds: BBoxBounds | null;
  isLoading: boolean;
  onAssessmentTypeChange?: (type: AssessmentType) => void;
}

const BUSINESS_SEGMENTS = [
  // Residential
  { value: 'residential', label: 'Vivienda unifamiliar', group: 'Residencial' },
  { value: 'apartment_building', label: 'Edificio de pisos', group: 'Residencial' },
  { value: 'villa', label: 'Chalet / Villa', group: 'Residencial' },
  { value: 'residential_new', label: 'Vivienda nueva (<5 años)', group: 'Residencial' },
  // Commercial
  { value: 'commercial', label: 'Local comercial', group: 'Comercial' },
  { value: 'office', label: 'Oficinas', group: 'Comercial' },
  { value: 'retail', label: 'Tienda / Supermercado', group: 'Comercial' },
  { value: 'restaurant', label: 'Restaurante / Bar', group: 'Comercial' },
  { value: 'hotel', label: 'Hotel', group: 'Comercial' },
  // Industrial
  { value: 'industrial', label: 'Nave industrial', group: 'Industrial' },
  { value: 'warehouse', label: 'Almacen', group: 'Industrial' },
  { value: 'factory', label: 'Fabrica', group: 'Industrial' },
  // Agricultural
  { value: 'agricultural', label: 'Explotacion agricola', group: 'Agricola' },
  { value: 'greenhouse', label: 'Invernadero', group: 'Agricola' },
];

const ASSESSMENT_TYPES: { value: AssessmentType; label: string; icon: React.ReactNode }[] = [
  {
    value: 'solar',
    label: 'Solar',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    value: 'battery',
    label: 'Bateria',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="2" y="7" width="18" height="10" rx="2" />
        <path d="M22 11v2" />
        <path d="M6 11v2M10 11v2M14 11v2" />
      </svg>
    ),
  },
  {
    value: 'combined',
    label: 'Combinado',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="8" cy="8" r="4" />
        <path d="M8 2v1M8 13v1M3.76 3.76l.7.7M11.54 11.54l.7.7M2 8h1M13 8h1M3.76 12.24l.7-.7M11.54 4.46l.7-.7" />
        <rect x="12" y="12" width="10" height="6" rx="1" />
        <path d="M23 14.5v1" />
      </svg>
    ),
  },
];

export function ProspectFilters({ onSearch, selectedBounds, isLoading, onAssessmentTypeChange }: ProspectFiltersProps) {
  const [filters, setFilters] = useState<Filters>({
    minArea: 50,
    maxResults: 100,
    businessSegment: 'commercial',
    electricityPrice: 0.20,
    assessmentType: 'solar',
  });

  const handleAssessmentTypeChange = (type: AssessmentType) => {
    setFilters({ ...filters, assessmentType: type });
    onAssessmentTypeChange?.(type);
  };

  const handleSearch = () => {
    if (!selectedBounds) return;
    onSearch(selectedBounds, filters);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <h3 className="font-semibold text-[#222f30] mb-4">Filtros de busqueda</h3>

      <div className="space-y-4">
        {/* Assessment Type Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de evaluacion
          </label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {ASSESSMENT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => handleAssessmentTypeChange(type.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  filters.assessmentType === type.value
                    ? type.value === 'solar'
                      ? 'bg-[#a7e26e] text-[#222f30]'
                      : type.value === 'battery'
                      ? 'bg-blue-500 text-white'
                      : 'bg-purple-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {type.icon}
                <span className="hidden sm:inline">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Minimum Area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Area minima (m²)
          </label>
          <input
            type="number"
            value={filters.minArea}
            onChange={(e) => setFilters({ ...filters, minArea: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
            min={0}
            step={10}
          />
        </div>

        {/* Max Results */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Resultados maximos
          </label>
          <select
            value={filters.maxResults}
            onChange={(e) => setFilters({ ...filters, maxResults: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
          >
            <option value={10}>10 (rapido)</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200 (maximo)</option>
          </select>
        </div>

        {/* Business Segment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de negocio
          </label>
          <select
            value={filters.businessSegment}
            onChange={(e) => setFilters({ ...filters, businessSegment: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
          >
            {['Residencial', 'Comercial', 'Industrial', 'Agricola'].map((group) => (
              <optgroup key={group} label={group}>
                {BUSINESS_SEGMENTS.filter((s) => s.group === group).map((segment) => (
                  <option key={segment.value} value={segment.value}>
                    {segment.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Electricity Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Precio electricidad (EUR/kWh)
          </label>
          <input
            type="number"
            value={filters.electricityPrice}
            onChange={(e) => setFilters({ ...filters, electricityPrice: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
            min={0}
            step={0.01}
          />
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={!selectedBounds || isLoading}
          className="w-full py-3 bg-[#222f30] text-white font-medium rounded-lg hover:bg-[#1a2526] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Buscando...
            </span>
          ) : selectedBounds ? (
            'Buscar edificios'
          ) : (
            'Selecciona un area primero'
          )}
        </button>

        {selectedBounds && (
          <p className="text-xs text-gray-500 text-center">
            Area seleccionada: {formatBounds(selectedBounds)}
          </p>
        )}
      </div>
    </div>
  );
}

function formatBounds(bounds: BBoxBounds): string {
  const latDiff = Math.abs(bounds.maxLat - bounds.minLat);
  const lonDiff = Math.abs(bounds.maxLon - bounds.minLon);
  // Approximate: 1 degree latitude = 111km
  const kmLat = latDiff * 111;
  const kmLon = lonDiff * 111 * Math.cos((bounds.minLat + bounds.maxLat) / 2 * Math.PI / 180);
  return `~${kmLat.toFixed(1)}km x ${kmLon.toFixed(1)}km`;
}
