'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { assessmentInputSchema, AssessmentInputRaw } from '@/lib/validations/assessment';
import { BUSINESS_SEGMENTS, ASSESSMENT_CONFIG } from '@/lib/config/assessment-config';
import { ManualFallback } from './ManualFallback';
import { SolarAssessment } from '@/lib/supabase/types';

interface AssessmentFormProps {
  leadId?: string;
  defaultAddress?: string;
  onSuccess: (assessment: SolarAssessment) => void;
}

interface ManualData {
  roofAreaM2: number;
  roofSegmentCount: number;
  numberOfFloors: number;
  cadastralReference?: string;
}

interface GeoResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

interface AddressCheckResult {
  geocode: { latitude: number; longitude: number; formattedAddress: string };
  catastro: {
    cadastralReference: string | null;
    buildingAreaM2: number | null;
    numberOfFloors: number | null;
    buildingUse: string | null;
    yearBuilt: number | null;
  } | null;
  inspire: {
    roofAreaM2: number | null;
    orientationDegrees: number | null;
    orientationLabel: string | null;
  } | null;
  pvgis: { kwhPerKwp: number | null; optimalAngle: number | null; status: string };
}

export function AssessmentForm({ leadId, defaultAddress, onSuccess }: AssessmentFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresManualFallback, setRequiresManualFallback] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<GeoResult | null>(null);
  const [addressCheck, setAddressCheck] = useState<AddressCheckResult | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AssessmentInputRaw>({
    resolver: zodResolver(assessmentInputSchema),
    defaultValues: {
      address: defaultAddress ?? '',
      businessSegment: 'hotel',
      leadId: leadId ?? null,
      electricityPrice: ASSESSMENT_CONFIG.DEFAULT_ELECTRICITY_PRICE_EUR,
      numberOfFloors: 1,
    },
  });

  const businessSegmentOptions = BUSINESS_SEGMENTS.map(s => ({
    value: s.value,
    label: s.label,
  }));

  const checkAddress = async () => {
    const address = watch('address');
    if (!address || address.length < 5) {
      setError('Introduce una dirección válida');
      return;
    }

    setIsChecking(true);
    setError(null);
    setAddressCheck(null);

    try {
      const response = await fetch('/api/assessment/check-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Error al verificar la dirección');
        return;
      }

      setAddressCheck(result);
    } catch {
      setError('Error de conexión');
    } finally {
      setIsChecking(false);
    }
  };

  const onSubmit = async (data: AssessmentInputRaw) => {
    setIsLoading(true);
    setError(null);
    setRequiresManualFallback(false);

    try {
      const response = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.requiresManualFallback) {
          setRequiresManualFallback(true);
          setGeocodeResult(result.geocodeResult);
          setError('No se encontraron datos solares. Por favor, introduce los datos manualmente.');
        } else {
          setError(result.error || 'Error al procesar la evaluación');
        }
        return;
      }

      onSuccess(result.data);
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (manualData: ManualData) => {
    setIsLoading(true);
    setError(null);

    const formData = watch();

    try {
      const response = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          manualFallback: true,
          roofAreaM2: manualData.roofAreaM2,
          roofSegmentCount: manualData.roofSegmentCount,
          numberOfFloors: manualData.numberOfFloors,
          cadastralReference: manualData.cadastralReference,
        }),
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

  if (requiresManualFallback) {
    return (
      <ManualFallback
        address={geocodeResult?.formattedAddress ?? watch('address')}
        onSubmit={handleManualSubmit}
        onCancel={() => setRequiresManualFallback(false)}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-[#222f30] mb-4">Nueva Evaluación Solar</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Input
            label="Dirección"
            placeholder="Calle Ejemplo 123, Las Palmas de Gran Canaria"
            {...register('address')}
            error={errors.address?.message}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={checkAddress}
            isLoading={isChecking}
          >
            Verificar dirección
          </Button>
        </div>

        {addressCheck && (
          <div className="p-4 bg-gray-50 rounded-lg text-sm space-y-2">
            <p className="font-medium text-[#222f30]">Datos encontrados:</p>
            <div className="grid grid-cols-2 gap-2 text-[#445e5f]">
              <p>Coordenadas:</p>
              <p>{addressCheck.geocode.latitude.toFixed(4)}, {addressCheck.geocode.longitude.toFixed(4)}</p>

              {addressCheck.inspire ? (
                <>
                  <p>Superficie cubierta (INSPIRE):</p>
                  <p className="text-green-600 font-medium">{addressCheck.inspire.roofAreaM2?.toLocaleString()} m²</p>

                  {addressCheck.inspire.orientationLabel && (
                    <>
                      <p>Orientación edificio:</p>
                      <p className="text-green-600 font-medium">
                        {addressCheck.inspire.orientationLabel} ({addressCheck.inspire.orientationDegrees}°)
                      </p>
                    </>
                  )}
                </>
              ) : null}

              {addressCheck.catastro ? (
                <>
                  {!addressCheck.inspire && (
                    <>
                      <p>Superficie construida:</p>
                      <p>{addressCheck.catastro.buildingAreaM2?.toLocaleString()} m²</p>
                    </>
                  )}

                  <p>Número de plantas:</p>
                  <p className={addressCheck.catastro.numberOfFloors ? 'text-green-600 font-medium' : 'text-orange-500'}>
                    {addressCheck.catastro.numberOfFloors ?? 'No disponible (usar campo manual)'}
                  </p>

                  <p>Uso:</p>
                  <p>{addressCheck.catastro.buildingUse ?? '-'}</p>

                  <p>Año construcción:</p>
                  <p>{addressCheck.catastro.yearBuilt ?? '-'}</p>

                  <p>Ref. catastral:</p>
                  <p className="text-xs">{addressCheck.catastro.cadastralReference}</p>
                </>
              ) : (
                <p className="col-span-2 text-orange-500">Catastro: No se encontraron datos del edificio</p>
              )}

              <p>PVGIS kWh/kWp:</p>
              <p>{addressCheck.pvgis.kwhPerKwp?.toLocaleString()} kWh/kWp/año</p>

              {addressCheck.pvgis.optimalAngle && (
                <>
                  <p>Ángulo óptimo:</p>
                  <p>{addressCheck.pvgis.optimalAngle}°</p>
                </>
              )}
            </div>
          </div>
        )}

        <Select
          label="Segmento de negocio"
          options={businessSegmentOptions}
          {...register('businessSegment')}
          error={errors.businessSegment?.message}
        />

        <Input
          label="Precio electricidad (€/kWh)"
          type="number"
          step="0.01"
          min="0.01"
          max="1"
          {...register('electricityPrice', { valueAsNumber: true })}
          error={errors.electricityPrice?.message}
          helperText="Precio medio del kWh para calcular el ahorro"
        />

        <Input
          label="Número de plantas del edificio"
          type="number"
          min="1"
          max="50"
          defaultValue={1}
          {...register('numberOfFloors', { valueAsNumber: true })}
          error={errors.numberOfFloors?.message}
          helperText="Usado si Catastro no proporciona el dato automáticamente"
        />

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
