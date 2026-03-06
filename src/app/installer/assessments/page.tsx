'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getScoreLabel, getScoreColor, getSegmentLabel } from '@/lib/config/assessment-config';
import { SolarAssessment } from '@/lib/supabase/types';
import { PromoteToLeadModal } from '@/components/assessment/PromoteToLeadModal';
import Link from 'next/link';

type FilterType = 'all' | 'pending' | 'promoted';

export default function AssessmentsListPage() {
  const [assessments, setAssessments] = useState<SolarAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedAssessment, setSelectedAssessment] = useState<SolarAssessment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAssessments = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'pending') params.set('hasLead', 'false');
      if (filter === 'promoted') params.set('hasLead', 'true');

      const response = await fetch(`/api/assessment/list?${params}`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error);
        return;
      }

      setAssessments(result.data);
    } catch {
      setError('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, [filter]);

  const handlePromoteSuccess = () => {
    setSelectedAssessment(null);
    fetchAssessments();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta evaluación?')) return;

    setDeletingId(id);
    try {
      const response = await fetch('/api/assessment/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        fetchAssessments();
      } else {
        const result = await response.json();
        setError(result.error || 'Error al eliminar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' €';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#222f30]">Evaluaciones Guardadas</h1>
          <p className="text-[#445e5f] mt-1">
            Propiedades evaluadas pendientes de contacto
          </p>
        </div>
        <Link href="/installer/assessment">
          <Button>Nueva Evaluación</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          Todas
        </Button>
        <Button
          variant={filter === 'pending' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setFilter('pending')}
        >
          Pendientes
        </Button>
        <Button
          variant={filter === 'promoted' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setFilter('promoted')}
        >
          Convertidas a Lead
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-[#445e5f]">Cargando evaluaciones...</div>
      ) : assessments.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-[#445e5f]">No hay evaluaciones guardadas</p>
          <Link href="/installer/assessment" className="mt-4 inline-block">
            <Button>Crear primera evaluación</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {assessments.map((assessment) => (
            <Card key={assessment.id} className="p-6">
              <div className="flex items-center justify-between gap-6">
                {/* Left: Address and details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium text-[#222f30]">
                      {assessment.formatted_address || assessment.address_input}
                    </h3>
                    {assessment.lead_id ? (
                      <Badge variant="success">Lead creado</Badge>
                    ) : (
                      <Badge variant="warning">Pendiente</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#445e5f]">
                    <span>{getSegmentLabel(assessment.business_segment)}</span>
                    <span>•</span>
                    <span>{assessment.system_size_kw} kW</span>
                    <span>•</span>
                    <span>{formatCurrency(assessment.annual_savings_eur)}/año</span>
                    {assessment.number_of_floors && assessment.number_of_floors > 1 && (
                      <>
                        <span>•</span>
                        <span>{assessment.number_of_floors} plantas</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-[#445e5f]/70 mt-1">
                    {formatDate(assessment.created_at)}
                  </p>
                </div>

                {/* Right: Score, Button, Delete */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  {/* Score Circle */}
                  <div
                    className="flex flex-col items-center justify-center rounded-full"
                    style={{
                      width: '64px',
                      height: '64px',
                      backgroundColor: `${getScoreColor(assessment.total_score)}20`,
                    }}
                  >
                    <span
                      className="text-xl font-bold leading-none"
                      style={{ color: getScoreColor(assessment.total_score) }}
                    >
                      {assessment.total_score}
                    </span>
                    <span
                      className="text-[10px] mt-0.5"
                      style={{ color: getScoreColor(assessment.total_score) }}
                    >
                      {getScoreLabel(assessment.total_score)}
                    </span>
                  </div>

                  {/* Action Button */}
                  {assessment.lead_id ? (
                    <Link href={`/installer/leads/${assessment.lead_id}`}>
                      <Button variant="outline" className="uppercase tracking-wider text-xs">
                        Ver Lead
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      onClick={() => setSelectedAssessment(assessment)}
                      className="bg-[#222f30] hover:bg-[#1a2324] text-white uppercase tracking-wider text-xs px-4 py-2 rounded-full"
                    >
                      Convertir a Lead
                    </Button>
                  )}

                  {/* Delete Circle */}
                  {!assessment.lead_id && (
                    <button
                      onClick={() => handleDelete(assessment.id)}
                      disabled={deletingId === assessment.id}
                      className="w-10 h-10 rounded-full bg-[#222f30] text-white flex items-center justify-center hover:bg-[#1a2324] transition-colors"
                    >
                      {deletingId === assessment.id ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Promote Modal */}
      {selectedAssessment && (
        <PromoteToLeadModal
          assessment={selectedAssessment}
          onClose={() => setSelectedAssessment(null)}
          onSuccess={handlePromoteSuccess}
        />
      )}
    </div>
  );
}
