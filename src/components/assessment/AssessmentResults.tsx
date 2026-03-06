'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreBreakdown } from './ScoreBreakdown';
import { AssumptionsPanel, AssumptionUpdates } from './AssumptionsPanel';
import { getSegmentLabel, getScoreLabel, getScoreColor } from '@/lib/config/assessment-config';
import { SolarAssessment } from '@/lib/supabase/types';

interface AssessmentResultsProps {
  assessment: SolarAssessment;
  onAssessAnother?: () => void;
  onAssessmentUpdate?: (updated: SolarAssessment) => void;
  showActions?: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' €';
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-ES').format(num);
}

export function AssessmentResults({
  assessment,
  onAssessAnother,
  onAssessmentUpdate,
  showActions = true,
}: AssessmentResultsProps) {
  const [currentAssessment, setCurrentAssessment] = useState(assessment);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const scoreColor = getScoreColor(currentAssessment.total_score);
  const scoreLabel = getScoreLabel(currentAssessment.total_score);

  const handleRecalculate = async (updates: AssumptionUpdates) => {
    setIsRecalculating(true);
    try {
      const response = await fetch('/api/assessment/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: currentAssessment.id,
          updates,
        }),
      });

      if (!response.ok) {
        console.error('Recalculation failed');
        return;
      }

      const result = await response.json();
      setCurrentAssessment(result.data);
      onAssessmentUpdate?.(result.data);
    } catch (error) {
      console.error('Recalculation error:', error);
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="flex gap-6 items-stretch">
      {/* Left Column - Technical Data */}
      <div className="w-[500px] flex-shrink-0 flex flex-col gap-6">
        {/* Header Card with Score Badge */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-medium text-[#222f30]">Evaluación Solar Comercial</h2>
              <p className="text-sm text-[#445e5f] mt-1">
                {currentAssessment.formatted_address || currentAssessment.address_input}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="default">{getSegmentLabel(currentAssessment.business_segment)}</Badge>
                {currentAssessment.solar_api_status === 'catastro' && (
                  <Badge variant="info">Catastro</Badge>
                )}
                {currentAssessment.solar_api_status === 'inspire' && (
                  <Badge variant="info">INSPIRE</Badge>
                )}
                {currentAssessment.is_manual_fallback && currentAssessment.solar_api_status !== 'catastro' && (
                  <Badge variant="warning">Datos manuales</Badge>
                )}
              </div>
            </div>
            <div
              className="flex flex-col items-center px-4 py-2 rounded-xl"
              style={{ backgroundColor: `${scoreColor}20` }}
            >
              <span className="text-3xl font-bold" style={{ color: scoreColor }}>
                {currentAssessment.total_score}
              </span>
              <span className="text-xs font-medium" style={{ color: scoreColor }}>
                {scoreLabel}
              </span>
            </div>
          </div>
        </Card>

        {/* Technical Data */}
        <Card className="p-6 flex-1 flex flex-col">
          <h3 className="text-base font-medium text-[#222f30] mb-4">Datos Técnicos</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-[#445e5f]">Potencia del Sistema</p>
              <p className="text-2xl font-bold text-[#222f30]">
                {formatNumber(currentAssessment.system_size_kw)} <span className="text-base font-normal">kW</span>
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-[#445e5f]">Producción Anual</p>
              <p className="text-2xl font-bold text-[#222f30]">
                {formatNumber(currentAssessment.annual_production_kwh)} <span className="text-base font-normal">kWh</span>
              </p>
            </div>
            <div className="bg-[#a7e26e]/10 rounded-lg p-4">
              <p className="text-sm text-[#445e5f]">Ahorro Anual</p>
              <p className="text-2xl font-bold text-[#222f30]">
                {formatCurrency(currentAssessment.annual_savings_eur)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-[#445e5f]">Retorno de Inversión</p>
              <p className="text-2xl font-bold text-[#222f30]">
                {currentAssessment.payback_years ? `${currentAssessment.payback_years} años` : 'N/A'}
              </p>
            </div>
          </div>

          {/* 25-year lifetime savings */}
          {currentAssessment.lifetime_savings_eur && (
            <div className="mt-4 pt-4 border-t border-gray-100 bg-[#a7e26e]/5 rounded-lg p-6">
              <p className="text-sm text-[#445e5f]">Ahorro Total (25 años)</p>
              <p className="text-xs text-[#445e5f]/70 mt-0.5">Con degradación de paneles del 0,5%/año</p>
              <p className="text-3xl font-bold text-[#222f30] mt-3">
                {formatCurrency(currentAssessment.lifetime_savings_eur)}
              </p>
            </div>
          )}

          {/* Roof surface below the grid */}
          {currentAssessment.roof_area_m2 && (
            <div className="mt-auto pt-4 border-t border-gray-100">
              <p className="text-sm text-[#445e5f]">Superficie techo</p>
              <p className="text-lg font-medium text-[#222f30]">{formatNumber(currentAssessment.roof_area_m2)} m²</p>
            </div>
          )}
        </Card>

      </div>

      {/* Middle Column - Assumptions Panel */}
      <div className="flex-1 min-w-[320px]">
        <AssumptionsPanel
          assessment={currentAssessment}
          onRecalculate={handleRecalculate}
          isRecalculating={isRecalculating}
        />
      </div>

      {/* Right Column - Score Breakdown */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <Card className="p-6">
          <h3 className="text-base font-medium text-[#222f30] mb-4">Desglose de Puntuación</h3>
          <ScoreBreakdown
            totalScore={currentAssessment.total_score}
            solarPotentialScore={currentAssessment.solar_potential_score}
            economicPotentialScore={currentAssessment.economic_potential_score}
            executionSimplicityScore={currentAssessment.execution_simplicity_score}
            segmentFitScore={currentAssessment.segment_fit_score}
          />
        </Card>

        {showActions && onAssessAnother && (
          <Button variant="outline" onClick={onAssessAnother} className="w-full">
            Nueva Evaluación
          </Button>
        )}
      </div>
    </div>
  );
}
