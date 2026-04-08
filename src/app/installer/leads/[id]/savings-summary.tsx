'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui';
import { SolarAssessment } from '@/lib/supabase/types';

interface SavingsSummaryProps {
  leadId: string;
  monthlyBill: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SavingsSummary({ leadId, monthlyBill }: SavingsSummaryProps) {
  const [assessment, setAssessment] = useState<SolarAssessment | null>(null);
  const [loading, setLoading] = useState(true);

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
      <Card variant="elevated">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-5 w-32 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              <div className="h-8 bg-gray-100 rounded"></div>
              <div className="h-8 bg-gray-100 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no assessment, show basic lead info
  if (!assessment) {
    return (
      <Card variant="elevated">
        <CardContent className="p-6">
          <h2 className="text-lg font-medium mb-4">Ahorro estimado</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[#445e5f]">Factura mensual</p>
              <p className="text-2xl font-semibold">{formatCurrency(monthlyBill)}</p>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-[#445e5f] italic">
                Crea una evaluación solar para ver el ahorro estimado.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthlySavings = Math.round(assessment.annual_savings_eur / 12);

  return (
    <Card variant="elevated">
      <CardContent className="p-6">
        <h2 className="text-lg font-medium mb-4">Ahorro estimado</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-[#445e5f]">Factura mensual</p>
            <p className="text-2xl font-semibold">{formatCurrency(monthlyBill)}</p>
          </div>
          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm text-[#445e5f]">Ahorro mensual</p>
            <p className="text-xl font-semibold text-[#a7e26e]">
              {formatCurrency(monthlySavings)}
            </p>
          </div>
          <div>
            <p className="text-sm text-[#445e5f]">Ahorro anual</p>
            <p className="text-xl font-semibold text-[#a7e26e]">
              {formatCurrency(assessment.annual_savings_eur)}
            </p>
          </div>
          {assessment.payback_years && (
            <div>
              <p className="text-sm text-[#445e5f]">Retorno de inversión</p>
              <p className="text-xl font-semibold">
                {assessment.payback_years} años
              </p>
            </div>
          )}
          {assessment.system_size_kw && (
            <div>
              <p className="text-sm text-[#445e5f]">Sistema recomendado</p>
              <p className="text-xl font-semibold">
                {assessment.system_size_kw} kW
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
