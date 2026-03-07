'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { batteryAssessmentInputSchema, BatteryAssessmentInputRaw } from '@/lib/validations/battery-assessment';
import { PROPERTY_TYPES, BACKUP_PRIORITIES, ISLAND_VULNERABILITY } from '@/lib/config/battery-config';
import { BatteryAssessment } from '@/lib/supabase/types';

interface BatteryAssessmentFormProps {
  leadId?: string;
  defaultAddress?: string;
  onSuccess: (assessment: BatteryAssessment) => void;
}

export function BatteryAssessmentForm({ leadId, defaultAddress, onSuccess }: BatteryAssessmentFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BatteryAssessmentInputRaw>({
    resolver: zodResolver(batteryAssessmentInputSchema),
    defaultValues: {
      address: defaultAddress ?? '',
      propertyType: 'residential',
      leadId: leadId ?? null,
      numberOfFloors: 1,
      occupants: 3,
      hasPool: false,
      hasSolar: false,
      hasExistingBattery: false,
      backupPriority: 'basic',
    },
  });

  const hasSolar = watch('hasSolar');
  const monthlyBill = watch('monthlyBillEur');

  const propertyTypeOptions = PROPERTY_TYPES.map(p => ({
    value: p.value,
    label: p.label,
  }));

  const backupPriorityOptions = BACKUP_PRIORITIES.map(p => ({
    value: p.value,
    label: `${p.label} (${p.hours}h)`,
  }));

  const islandOptions = Object.entries(ISLAND_VULNERABILITY).map(([key, value]) => ({
    value: key,
    label: `${key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} - Vulnerabilidad ${value.label}`,
  }));

  const onSubmit = async (data: BatteryAssessmentInputRaw) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/battery-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Error al procesar la evaluación');
        return;
      }

      onSuccess(result.data);
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-[#222f30] mb-4">Nueva Evaluación de Batería</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Dirección"
          placeholder="Calle Ejemplo 123, Las Palmas de Gran Canaria"
          {...register('address')}
          error={errors.address?.message}
          helperText="Incluye el nombre de la isla (Gran Canaria, Tenerife, etc.)"
        />

        <Select
          label="Tipo de propiedad"
          options={propertyTypeOptions}
          {...register('propertyType')}
          error={errors.propertyType?.message}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Superficie (m²)"
            type="number"
            placeholder="120"
            {...register('propertyAreaM2', { valueAsNumber: true })}
            error={errors.propertyAreaM2?.message}
            helperText="Opcional si está en Catastro"
          />

          <Input
            label="Plantas"
            type="number"
            min="1"
            max="10"
            {...register('numberOfFloors', { valueAsNumber: true })}
            error={errors.numberOfFloors?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Ocupantes"
            type="number"
            min="1"
            max="20"
            {...register('occupants', { valueAsNumber: true })}
            error={errors.occupants?.message}
          />

          <Input
            label="Factura mensual (€)"
            type="number"
            placeholder="80"
            {...register('monthlyBillEur', { valueAsNumber: true })}
            error={errors.monthlyBillEur?.message}
            helperText={monthlyBill ? 'Se usará para calcular consumo' : 'Opcional, mejora precisión'}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('hasAC')}
                className="w-4 h-4 rounded border-gray-300 text-[#a7e26e] focus:ring-[#a7e26e]"
              />
              <span className="text-sm text-[#222f30]">Tiene aire acondicionado</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('hasPool')}
                className="w-4 h-4 rounded border-gray-300 text-[#a7e26e] focus:ring-[#a7e26e]"
              />
              <span className="text-sm text-[#222f30]">Tiene piscina</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('hasSolar')}
                className="w-4 h-4 rounded border-gray-300 text-[#a7e26e] focus:ring-[#a7e26e]"
              />
              <span className="text-sm text-[#222f30]">Tiene instalación solar</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('hasExistingBattery')}
                className="w-4 h-4 rounded border-gray-300 text-[#a7e26e] focus:ring-[#a7e26e]"
              />
              <span className="text-sm text-[#222f30]">Tiene batería existente</span>
            </label>
          </div>
        </div>

        {hasSolar && (
          <Input
            label="Potencia solar instalada (kW)"
            type="number"
            step="0.1"
            placeholder="5.0"
            {...register('solarSystemKw', { valueAsNumber: true })}
            error={errors.solarSystemKw?.message}
          />
        )}

        <Select
          label="Prioridad de respaldo"
          options={backupPriorityOptions}
          {...register('backupPriority')}
          error={errors.backupPriority?.message}
        />

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <strong>Islas Canarias - Redes aisladas:</strong>
          <p className="mt-1">
            Las islas menores (El Hierro, La Gomera, La Palma) tienen redes eléctricas más pequeñas
            y vulnerables. Una batería proporciona mayor seguridad ante cortes.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <Button type="submit" isLoading={isLoading} className="w-full">
          Ejecutar Evaluación
        </Button>
      </form>
    </Card>
  );
}
