'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BatteryAssessment } from '@/lib/supabase/types';
import { ISLAND_VULNERABILITY, BATTERY_CONFIG } from '@/lib/config/battery-config';

interface BatteryAssessmentResultsProps {
  assessment: BatteryAssessment;
  onNewAssessment: () => void;
}

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[#445e5f]">{label}</span>
        <span className="font-medium text-[#222f30]">{score}/100</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 65) return 'text-emerald-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-orange-600';
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 65) return 'bg-emerald-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-orange-500';
}

function getRecommendationBadge(recommendation: string): { color: string; text: string } {
  switch (recommendation) {
    case 'highly_recommended':
      return { color: 'bg-green-100 text-green-800', text: 'Muy Recomendado' };
    case 'recommended':
      return { color: 'bg-emerald-100 text-emerald-800', text: 'Recomendado' };
    case 'consider':
      return { color: 'bg-yellow-100 text-yellow-800', text: 'A Considerar' };
    default:
      return { color: 'bg-gray-100 text-gray-800', text: 'Baja Prioridad' };
  }
}

export function BatteryAssessmentResults({ assessment, onNewAssessment }: BatteryAssessmentResultsProps) {
  const badge = getRecommendationBadge(assessment.recommendation);
  const islandData = ISLAND_VULNERABILITY[assessment.island];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Property & Consumption Data */}
      <Card className="p-6">
        <h3 className="text-base font-medium text-[#222f30] mb-4">Datos de la Propiedad</h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#445e5f]">Dirección</span>
            <span className="text-[#222f30] text-right max-w-[60%]">{assessment.formatted_address}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">Isla</span>
            <span className="text-[#222f30] capitalize">{assessment.island}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">Tipo</span>
            <span className="text-[#222f30]">{assessment.property_type}</span>
          </div>

          {assessment.property_area_m2 && (
            <div className="flex justify-between">
              <span className="text-[#445e5f]">Superficie</span>
              <span className="text-[#222f30]">{assessment.property_area_m2} m²</span>
            </div>
          )}

          {islandData && (
            <div className="flex justify-between">
              <span className="text-[#445e5f]">Red eléctrica</span>
              <span className="text-orange-600 font-medium">
                {islandData.gridSizeMW} MW ({islandData.label})
              </span>
            </div>
          )}
        </div>

        <hr className="my-4" />

        <h3 className="text-base font-medium text-[#222f30] mb-4">Consumo Estimado</h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#445e5f]">Consumo anual</span>
            <span className="text-[#222f30] font-medium">
              {assessment.annual_consumption_kwh?.toLocaleString()} kWh
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">Consumo diario</span>
            <span className="text-[#222f30]">{assessment.daily_consumption_kwh} kWh</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">Consumo pico</span>
            <span className="text-[#222f30]">{assessment.peak_daily_kwh} kWh</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#445e5f]">Confianza</span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              assessment.consumption_confidence === 'high'
                ? 'bg-green-100 text-green-800'
                : assessment.consumption_confidence === 'medium'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-orange-100 text-orange-800'
            }`}>
              {assessment.consumption_confidence === 'high' ? 'Alta' :
               assessment.consumption_confidence === 'medium' ? 'Media' : 'Baja'}
            </span>
          </div>
        </div>

        <hr className="my-4" />

        <h3 className="text-base font-medium text-[#222f30] mb-4">Instalaciones Existentes</h3>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${assessment.has_solar ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-[#445e5f]">
              {assessment.has_solar
                ? `Solar: ${assessment.solar_system_kw} kW`
                : 'Sin instalación solar'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${assessment.has_existing_battery ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-[#445e5f]">
              {assessment.has_existing_battery
                ? 'Tiene batería existente'
                : 'Sin batería'}
            </span>
          </div>
        </div>
      </Card>

      {/* Middle Column - Battery Recommendation */}
      <Card className="p-6">
        <h3 className="text-base font-medium text-[#222f30] mb-4">Recomendación de Batería</h3>

        <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-4 ${badge.color}`}>
          {badge.text}
        </div>

        <p className="text-sm text-[#445e5f] mb-6">{assessment.recommendation_text}</p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-[#222f30] mb-3">Tamaño Recomendado</h4>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[#445e5f]">Mínimo</p>
              <p className="text-lg font-bold text-[#222f30]">{assessment.minimum_battery_kwh}</p>
              <p className="text-xs text-[#445e5f]">kWh</p>
            </div>
            <div className="border-x border-gray-200">
              <p className="text-xs text-[#445e5f]">Recomendado</p>
              <p className="text-2xl font-bold text-[#a7e26e]">{assessment.recommended_battery_kwh}</p>
              <p className="text-xs text-[#445e5f]">kWh</p>
            </div>
            <div>
              <p className="text-xs text-[#445e5f]">Óptimo</p>
              <p className="text-lg font-bold text-[#222f30]">{assessment.optimal_battery_kwh}</p>
              <p className="text-xs text-[#445e5f]">kWh</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#445e5f]">Horas de respaldo</span>
            <span className="text-[#222f30] font-medium">{assessment.backup_hours}h</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">Coste estimado</span>
            <span className="text-[#222f30] font-bold text-lg">
              €{assessment.estimated_cost_eur?.toLocaleString()}
            </span>
          </div>
        </div>

        <hr className="my-4" />

        <h4 className="text-sm font-medium text-[#222f30] mb-3">Proyección Financiera</h4>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#445e5f]">Ahorro anual (arbitraje)</span>
            <span className="text-green-600 font-medium">€{assessment.annual_savings_eur}/año</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">Payback</span>
            <span className="text-[#222f30]">{assessment.payback_years} años</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#445e5f]">ROI a 10 años</span>
            <span className={assessment.roi_10_years && assessment.roi_10_years > 0 ? 'text-green-600 font-medium' : 'text-orange-600'}>
              {assessment.roi_10_years}%
            </span>
          </div>
        </div>
      </Card>

      {/* Right Column - Scores */}
      <Card className="p-6">
        <div className="text-center mb-6">
          <p className="text-sm text-[#445e5f] mb-1">Puntuación Total</p>
          <p className={`text-5xl font-bold ${getScoreColor(assessment.total_score)}`}>
            {assessment.total_score}
          </p>
          <p className="text-sm text-[#445e5f]">/ 100</p>
        </div>

        <div className="space-y-4">
          <ScoreBar
            score={assessment.grid_vulnerability_score}
            label="Vulnerabilidad de Red (30%)"
            color={getScoreBgColor(assessment.grid_vulnerability_score)}
          />

          <ScoreBar
            score={assessment.consumption_score}
            label="Perfil de Consumo (25%)"
            color={getScoreBgColor(assessment.consumption_score)}
          />

          <ScoreBar
            score={assessment.arbitrage_score}
            label="Potencial de Arbitraje (20%)"
            color={getScoreBgColor(assessment.arbitrage_score)}
          />

          <ScoreBar
            score={assessment.solar_synergy_score}
            label="Sinergia Solar (15%)"
            color={getScoreBgColor(assessment.solar_synergy_score)}
          />

          <ScoreBar
            score={assessment.installation_score}
            label="Facilidad de Instalación (10%)"
            color={getScoreBgColor(assessment.installation_score)}
          />
        </div>

        <hr className="my-6" />

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={onNewAssessment}
          >
            Nueva Evaluación
          </Button>
        </div>

        <p className="text-[10px] text-[#445e5f] mt-4 text-center">
          Evaluado el {new Date(assessment.created_at).toLocaleDateString('es-ES')}
        </p>
      </Card>
    </div>
  );
}
