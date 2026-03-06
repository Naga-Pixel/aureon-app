'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ManualFallbackProps {
  address: string;
  onSubmit: (data: { roofAreaM2: number; roofSegmentCount: number; numberOfFloors: number; cadastralReference?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}

export function ManualFallback({
  address,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: ManualFallbackProps) {
  const [roofAreaM2, setRoofAreaM2] = useState<string>('');
  const [roofSegmentCount, setRoofSegmentCount] = useState<string>('1');
  const [numberOfFloors, setNumberOfFloors] = useState<string>('1');
  const [cadastralReference, setCadastralReference] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const area = parseFloat(roofAreaM2);
    const segments = parseInt(roofSegmentCount, 10);
    const floors = parseInt(numberOfFloors, 10);

    if (isNaN(area) || area < 10 || area > 100000) {
      setValidationError('La superficie debe ser entre 10 y 100.000 m²');
      return;
    }

    if (isNaN(segments) || segments < 1 || segments > 50) {
      setValidationError('Los segmentos deben ser entre 1 y 50');
      return;
    }

    if (isNaN(floors) || floors < 1 || floors > 50) {
      setValidationError('Las plantas deben ser entre 1 y 50');
      return;
    }

    onSubmit({
      roofAreaM2: area,
      roofSegmentCount: segments,
      numberOfFloors: floors,
      cadastralReference: cadastralReference.trim() || undefined,
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[#222f30]">Entrada Manual Requerida</h2>
        </div>
        <p className="text-sm text-[#445e5f]">
          No se encontraron datos del edificio. Esto puede ocurrir si la dirección no incluye el número del edificio,
          o si es una parcela rural. Introduce los datos del techo manualmente.
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <p className="text-sm text-[#445e5f]">
          <span className="font-medium">Dirección:</span> {address}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Superficie del techo (m²)"
          type="number"
          min="10"
          max="100000"
          placeholder="Ej: 500"
          value={roofAreaM2}
          onChange={(e) => setRoofAreaM2(e.target.value)}
          helperText="Superficie total aproximada del techo disponible para paneles"
        />

        <Input
          label="Número de segmentos de techo"
          type="number"
          min="1"
          max="50"
          placeholder="1"
          value={roofSegmentCount}
          onChange={(e) => setRoofSegmentCount(e.target.value)}
          helperText="Cuántas secciones de techo distintas tiene el edificio"
        />

        <Input
          label="Número de plantas"
          type="number"
          min="1"
          max="50"
          placeholder="1"
          value={numberOfFloors}
          onChange={(e) => setNumberOfFloors(e.target.value)}
          helperText="Si introduces la superficie construida total, indica las plantas para calcular el techo"
        />

        <Input
          label="Referencia catastral (opcional)"
          type="text"
          placeholder="Ej: 9012345AB1234C0001XX"
          value={cadastralReference}
          onChange={(e) => setCadastralReference(e.target.value)}
          helperText="Disponible en sedecatastro.gob.es o en el recibo del IBI"
        />

        {(validationError || error) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {validationError || error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1"
          >
            Volver
          </Button>
          <Button type="submit" isLoading={isLoading} className="flex-1">
            Calcular Evaluación
          </Button>
        </div>
      </form>
    </Card>
  );
}
