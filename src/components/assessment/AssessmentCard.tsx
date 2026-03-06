'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import { getScoreLabel, getScoreColor, getSegmentLabel } from '@/lib/config/assessment-config';
import { SolarAssessment } from '@/lib/supabase/types';

interface AssessmentCardProps {
  leadId: string;
  isAdmin?: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-ES').format(num);
}

export function AssessmentCard({ leadId, isAdmin }: AssessmentCardProps) {
  const [assessment, setAssessment] = useState<SolarAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const response = await fetch(`/api/assessment/${leadId}`);
        const result = await response.json();
        if (result.data) {
          setAssessment(result.data);
        }
      } catch (error) {
        console.error('Error fetching assessment:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssessment();
  }, [leadId]);

  if (loading) {
    return (
      <Card variant="bordered">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-5 w-40 bg-gray-200 rounded mb-4"></div>
            <div className="h-20 bg-gray-100 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!assessment) {
    return (
      <Card variant="bordered">
        <CardContent className="p-6">
          <h2 className="text-lg font-medium mb-3">Evaluación Solar</h2>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-[#445e5f] text-sm mb-3">
              No hay evaluación solar para este lead.
            </p>
            {isAdmin && (
              <Link
                href="/installer/assessment"
                className="text-sm text-[#a7e26e] hover:underline font-medium"
              >
                Crear evaluación →
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const scoreColor = getScoreColor(assessment.total_score);
  const scoreLabel = getScoreLabel(assessment.total_score);

  return (
    <Card variant="bordered">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium">Evaluación Solar</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default">{getSegmentLabel(assessment.business_segment)}</Badge>
              {assessment.solar_api_status === 'catastro' && (
                <Badge variant="info">Catastro</Badge>
              )}
              {assessment.is_manual_fallback && assessment.solar_api_status !== 'catastro' && (
                <Badge variant="warning">Manual</Badge>
              )}
            </div>
          </div>
          <div
            className="flex flex-col items-center px-3 py-2 rounded-xl"
            style={{ backgroundColor: `${scoreColor}20` }}
          >
            <span className="text-2xl font-bold" style={{ color: scoreColor }}>
              {assessment.total_score}
            </span>
            <span className="text-xs font-medium" style={{ color: scoreColor }}>
              {scoreLabel}
            </span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-[#445e5f]">Sistema</p>
            <p className="font-semibold text-[#222f30]">{formatNumber(assessment.system_size_kw)} kW</p>
          </div>
          <div className="bg-[#a7e26e]/10 rounded-lg p-3">
            <p className="text-xs text-[#445e5f]">Ahorro anual</p>
            <p className="font-semibold text-[#222f30]">{formatCurrency(assessment.annual_savings_eur)}</p>
          </div>
        </div>

        {/* Expandable details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-[#445e5f] hover:text-[#222f30] transition-colors"
        >
          <span>{expanded ? 'Ocultar detalles' : 'Ver detalles'}</span>
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#445e5f]">Producción anual</p>
                <p className="font-medium">{formatNumber(assessment.annual_production_kwh)} kWh</p>
              </div>
              <div>
                <p className="text-[#445e5f]">Retorno inversión</p>
                <p className="font-medium">{assessment.payback_years ? `${assessment.payback_years} años` : 'N/A'}</p>
              </div>
              {assessment.panels_count && (
                <div>
                  <p className="text-[#445e5f]">Paneles</p>
                  <p className="font-medium">{assessment.panels_count}</p>
                </div>
              )}
              {assessment.roof_area_m2 && (
                <div>
                  <p className="text-[#445e5f]">Superficie techo</p>
                  <p className="font-medium">{formatNumber(assessment.roof_area_m2)} m²</p>
                </div>
              )}
            </div>

            {/* Score breakdown */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-[#445e5f] mb-2">Desglose puntuación</p>
              <div className="space-y-2">
                {[
                  { label: 'Solar', score: assessment.solar_potential_score, max: 40 },
                  { label: 'Económico', score: assessment.economic_potential_score, max: 30 },
                  { label: 'Ejecución', score: assessment.execution_simplicity_score, max: 15 },
                  { label: 'Segmento', score: assessment.segment_fit_score, max: 15 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-xs text-[#445e5f] w-16">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(item.score / item.max) * 100}%`,
                          backgroundColor: getScoreColor((item.score / item.max) * 100),
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium w-10 text-right">{item.score}/{item.max}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
