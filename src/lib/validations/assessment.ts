import { z } from 'zod';
import { BUSINESS_SEGMENTS } from '@/lib/config/assessment-config';

const businessSegmentValues = BUSINESS_SEGMENTS.map(s => s.value) as [string, ...string[]];

export const assessmentInputSchema = z.object({
  address: z
    .string()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(500, 'La dirección es demasiado larga'),
  businessSegment: z.enum(businessSegmentValues, {
    message: 'Selecciona un segmento de negocio válido',
  }),
  leadId: z.string().uuid().optional().nullable(),
  country: z
    .enum(['ES', 'DE', 'UK'], {
      message: 'Selecciona un país válido',
    })
    .optional()
    .default('ES'),
  energyType: z
    .enum(['fixed', 'variable'], {
      message: 'Selecciona un tipo de tarifa válido',
    })
    .optional()
    .default('fixed'),
  electricityPrice: z
    .number()
    .min(0.01, 'El precio debe ser mayor que 0')
    .max(1, 'El precio parece demasiado alto')
    .optional()
    .nullable(),
  numberOfFloors: z
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 planta')
    .max(50, 'Demasiadas plantas')
    .optional()
    .default(1),
});

export const manualFallbackSchema = z.object({
  roofAreaM2: z
    .number()
    .min(10, 'La superficie debe ser al menos 10 m²')
    .max(100000, 'La superficie parece demasiado grande'),
  roofSegmentCount: z
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 segmento de techo')
    .max(50, 'Demasiados segmentos')
    .optional()
    .default(1),
  numberOfFloors: z
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 planta')
    .max(50, 'Demasiadas plantas')
    .optional()
    .default(1),
  cadastralReference: z
    .string()
    .max(50, 'Referencia catastral demasiado larga')
    .optional(),
});

export const assessmentResponseSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  addressInput: z.string(),
  businessSegment: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  formattedAddress: z.string().nullable(),
  solarApiStatus: z.enum(['success', 'failed', 'fallback']),
  roofAreaM2: z.number().nullable(),
  maxArrayAreaM2: z.number().nullable(),
  panelsCount: z.number().nullable(),
  roofSegmentCount: z.number().nullable(),
  maxSunshineHoursPerYear: z.number().nullable(),
  isManualFallback: z.boolean(),
  manualRoofAreaM2: z.number().nullable(),
  numberOfFloors: z.number().nullable(),
  pvgisKwhPerKwp: z.number().nullable(),
  pvgisOptimalAngle: z.number().nullable(),
  lifetimeProductionKwh: z.number().nullable(),
  lifetimeSavingsEur: z.number().nullable(),
  degradationRate: z.number().nullable(),
  systemSizeKw: z.number(),
  annualProductionKwh: z.number(),
  annualSavingsEur: z.number(),
  paybackYears: z.number().nullable(),
  electricityPriceEur: z.number(),
  totalScore: z.number(),
  solarPotentialScore: z.number(),
  economicPotentialScore: z.number(),
  executionSimplicityScore: z.number(),
  segmentFitScore: z.number(),
  assessedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Input types (before validation/transformation)
export type AssessmentInputRaw = z.input<typeof assessmentInputSchema>;
// Output types (after validation/transformation with defaults applied)
export type AssessmentInput = z.output<typeof assessmentInputSchema>;
export type ManualFallback = z.output<typeof manualFallbackSchema>;
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
