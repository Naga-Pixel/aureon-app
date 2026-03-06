'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SolarAssessment } from '@/lib/supabase/types';
import { getScoreColor } from '@/lib/config/assessment-config';

interface PromoteToLeadModalProps {
  assessment: SolarAssessment;
  onClose: () => void;
  onSuccess: () => void;
}

const ISLANDS = [
  { value: 'Gran Canaria', label: 'Gran Canaria' },
  { value: 'Tenerife', label: 'Tenerife' },
  { value: 'Lanzarote', label: 'Lanzarote' },
  { value: 'Fuerteventura', label: 'Fuerteventura' },
  { value: 'La Palma', label: 'La Palma' },
  { value: 'La Gomera', label: 'La Gomera' },
  { value: 'El Hierro', label: 'El Hierro' },
];

const PROPERTY_TYPES = [
  { value: 'commercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'residential', label: 'Residencial' },
];

export function PromoteToLeadModal({ assessment, onClose, onSuccess }: PromoteToLeadModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    propertyType: 'commercial',
    island: 'Gran Canaria',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/assessment/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: assessment.id,
          ...formData,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Error al crear el lead');
        return;
      }

      onSuccess();
    } catch {
      setError('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES').format(amount) + ' €';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-medium text-[#222f30]">Convertir a Lead</h2>
          <button
            onClick={onClose}
            className="text-[#445e5f] hover:text-[#222f30] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Assessment Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-[#222f30] text-sm">
                {assessment.formatted_address || assessment.address_input}
              </p>
              <p className="text-sm text-[#445e5f] mt-1">
                {assessment.system_size_kw} kW • {formatCurrency(assessment.annual_savings_eur)}/año
              </p>
            </div>
            <div
              className="px-2 py-1 rounded text-sm font-bold"
              style={{
                backgroundColor: `${getScoreColor(assessment.total_score)}20`,
                color: getScoreColor(assessment.total_score),
              }}
            >
              {assessment.total_score}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre del contacto"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Juan García"
            required
          />

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="juan@empresa.com"
            required
          />

          <Input
            label="Teléfono"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="612 345 678"
            required
          />

          <Select
            label="Tipo de propiedad"
            options={PROPERTY_TYPES}
            value={formData.propertyType}
            onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
          />

          <Select
            label="Isla"
            options={ISLANDS}
            value={formData.island}
            onChange={(e) => setFormData({ ...formData, island: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-[#222f30] mb-1">
              Notas (opcional)
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#a7e26e] focus:border-transparent"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas adicionales sobre el contacto..."
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={isLoading} className="flex-1">
              Crear Lead
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
