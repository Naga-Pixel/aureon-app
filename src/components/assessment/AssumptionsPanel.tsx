'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SolarAssessment } from '@/lib/supabase/types';
import { ASSESSMENT_CONFIG } from '@/lib/config/assessment-config';

interface AssumptionsPanelProps {
  assessment: SolarAssessment;
  onRecalculate?: (updates: AssumptionUpdates) => void;
  isRecalculating?: boolean;
}

export interface AssumptionUpdates {
  roofAreaM2?: number;
  usableRoofPercent?: number;
  electricityPrice?: number;
  numberOfFloors?: number;
  installationCostPerKw?: number;
}

type DataSource = 'pvgis' | 'catastro' | 'inspire' | 'google' | 'esios' | 'default' | 'manual';

interface AssumptionRow {
  label: string;
  value: string | number;
  editableValue?: number;
  source: DataSource;
  editable: boolean;
  field?: keyof AssumptionUpdates;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}

const SOURCE_LABELS: Record<DataSource, { text: string; className: string }> = {
  pvgis: { text: 'PVGIS', className: 'bg-blue-100 text-blue-700' },
  catastro: { text: 'Catastro', className: 'bg-green-100 text-green-700' },
  inspire: { text: 'INSPIRE', className: 'bg-green-100 text-green-700' },
  google: { text: 'Google Solar', className: 'bg-purple-100 text-purple-700' },
  esios: { text: 'ESIOS', className: 'bg-blue-100 text-blue-700' },
  default: { text: 'Supuesto', className: 'bg-amber-100 text-amber-700' },
  manual: { text: 'Manual', className: 'bg-gray-100 text-gray-700' },
};

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(num);
}

export function AssumptionsPanel({
  assessment,
  onRecalculate,
  isRecalculating,
}: AssumptionsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<AssumptionUpdates>({});

  // Determine data sources based on assessment data
  const getSource = (field: string): DataSource => {
    if (assessment.is_manual_fallback && assessment.solar_api_status !== 'catastro' && assessment.solar_api_status !== 'inspire') {
      if (['roofArea', 'numberOfFloors'].includes(field)) return 'manual';
    }
    if (assessment.solar_api_status === 'inspire') {
      if (field === 'roofArea') return 'inspire';
      if (field === 'orientation') return 'inspire';
      if (field === 'numberOfFloors') return 'catastro'; // Floors still from Catastro
    }
    if (assessment.solar_api_status === 'catastro') {
      if (['roofArea', 'numberOfFloors'].includes(field)) return 'catastro';
    }
    if (assessment.solar_api_status === 'success') {
      if (['roofArea', 'usableRoof'].includes(field)) return 'google';
    }
    if (field === 'kwhPerKwp' && assessment.pvgis_kwh_per_kwp) return 'pvgis';
    if (field === 'optimalAngle' && assessment.pvgis_optimal_angle) return 'pvgis';
    return 'default';
  };

  // Get orientation label from degrees
  const getOrientationLabel = (degrees: number | null): string => {
    if (degrees === null) return 'N/A';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round(degrees / 45) % 8;
    return `${directions[index]} (${degrees}°)`;
  };

  // Calculate usable roof percentage
  const actualRoofArea = assessment.roof_area_m2 && assessment.number_of_floors
    ? assessment.roof_area_m2 / assessment.number_of_floors
    : assessment.roof_area_m2;
  const usableRoofPercent = assessment.max_array_area_m2 && actualRoofArea
    ? Math.round((assessment.max_array_area_m2 / actualRoofArea) * 100)
    : 60;

  const assumptions: AssumptionRow[] = [
    {
      label: 'Superficie cubierta',
      value: actualRoofArea ? `${formatNumber(actualRoofArea)} m²` : 'N/A',
      editableValue: actualRoofArea || 0,
      source: getSource('roofArea'),
      editable: true,
      field: 'roofAreaM2',
      unit: 'm²',
      step: 10,
      min: 10,
      max: 50000,
    },
    {
      label: 'Cubierta utilizable',
      value: `${usableRoofPercent}%`,
      editableValue: usableRoofPercent,
      source: assessment.max_array_area_m2 ? getSource('usableRoof') : 'default',
      editable: true,
      field: 'usableRoofPercent',
      unit: '%',
      step: 5,
      min: 10,
      max: 100,
    },
    {
      label: 'Producción solar',
      value: assessment.pvgis_kwh_per_kwp
        ? `${formatNumber(assessment.pvgis_kwh_per_kwp)} kWh/kWp/año`
        : 'N/A',
      source: getSource('kwhPerKwp'),
      editable: false,
    },
    {
      label: 'Tipo tarifa',
      value: (assessment as any).energy_type === 'variable' ? 'Variable (PVPC)' : 'Fija',
      source: (assessment as any).energy_type === 'variable' ? 'esios' : 'manual',
      editable: false,
    },
    {
      label: 'Precio electricidad',
      value: `${assessment.electricity_price_eur.toFixed(4)} €/kWh`,
      editableValue: assessment.electricity_price_eur,
      source: ((assessment as any).price_source === 'esios' ? 'esios'
        : (assessment as any).price_source === 'fallback' ? 'default'
        : assessment.electricity_price_eur === ASSESSMENT_CONFIG.DEFAULT_ELECTRICITY_PRICE_EUR ? 'default'
        : 'manual') as DataSource,
      editable: (assessment as any).energy_type !== 'variable',
      field: 'electricityPrice',
      unit: '€/kWh',
      step: 0.01,
      min: 0.05,
      max: 0.50,
    },
    {
      label: 'Plantas edificio',
      value: assessment.number_of_floors?.toString() || '1',
      editableValue: assessment.number_of_floors || 1,
      source: getSource('numberOfFloors'),
      editable: true,
      field: 'numberOfFloors',
      step: 1,
      min: 1,
      max: 50,
    },
    {
      label: 'Coste instalación',
      value: `${formatNumber(ASSESSMENT_CONFIG.INSTALLATION_COST_PER_KW)} €/kW`,
      editableValue: ASSESSMENT_CONFIG.INSTALLATION_COST_PER_KW,
      source: 'default',
      editable: true,
      field: 'installationCostPerKw',
      unit: '€/kW',
      step: 50,
      min: 500,
      max: 3000,
    },
    {
      label: 'Inclinación óptima',
      value: assessment.pvgis_optimal_angle ? `${assessment.pvgis_optimal_angle}°` : 'N/A',
      source: getSource('optimalAngle'),
      editable: false,
    },
    {
      label: 'Orientación edificio',
      value: getOrientationLabel((assessment as any).building_orientation),
      source: (assessment as any).building_orientation ? getSource('orientation') : 'default',
      editable: false,
    },
    {
      label: 'Eficiencia sistema',
      value: '85%',
      source: 'default',
      editable: false,
    },
    {
      label: 'Degradación anual',
      value: '0,5%',
      source: 'default',
      editable: false,
    },
  ];

  const handleEditChange = useCallback((field: keyof AssumptionUpdates, value: number) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleRecalculate = () => {
    if (onRecalculate && Object.keys(editValues).length > 0) {
      onRecalculate(editValues);
      setIsEditing(false);
      setEditValues({});
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValues({});
  };

  const hasDefaultAssumptions = assumptions.some(a => a.source === 'default' && a.editable);

  return (
    <Card className="p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-[#222f30]">Supuestos y Datos</h3>
        {onRecalculate && !isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Editar
          </Button>
        )}
      </div>

      {hasDefaultAssumptions && !isEditing && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            Algunos valores son supuestos por defecto. Puedes editarlos para mejorar la precisión.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {assumptions.map((row, index) => (
          <div
            key={index}
            className={`flex items-center justify-between py-2 ${
              index < assumptions.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#445e5f]">{row.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_LABELS[row.source].className}`}
              >
                {SOURCE_LABELS[row.source].text}
              </span>
            </div>

            {isEditing && row.editable && row.field ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={row.step}
                  min={row.min}
                  max={row.max}
                  defaultValue={row.editableValue}
                  onChange={(e) => handleEditChange(row.field!, parseFloat(e.target.value))}
                  className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
                />
                {row.unit && <span className="text-xs text-[#445e5f]">{row.unit}</span>}
              </div>
            ) : (
              <span
                className={`text-sm font-medium ${
                  row.source === 'default' ? 'text-amber-700' : 'text-[#222f30]'
                }`}
              >
                {row.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {isEditing && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
          <Button
            onClick={handleRecalculate}
            isLoading={isRecalculating}
            disabled={Object.keys(editValues).length === 0}
            size="sm"
          >
            Recalcular
          </Button>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
        </div>
      )}

      {assessment.cadastral_reference && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-[#445e5f]">
            Ref. catastral: <span className="font-mono">{assessment.cadastral_reference}</span>
          </p>
        </div>
      )}
    </Card>
  );
}
