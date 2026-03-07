import { z } from 'zod';
import { PROPERTY_TYPES, BACKUP_PRIORITIES } from '@/lib/config/battery-config';

const propertyTypeValues = PROPERTY_TYPES.map(p => p.value) as [string, ...string[]];
const backupPriorityValues = BACKUP_PRIORITIES.map(p => p.value) as [string, ...string[]];

export const batteryAssessmentInputSchema = z.object({
  address: z
    .string()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(500, 'La dirección es demasiado larga'),

  // Postal code for municipal incentive lookup (optional, can be extracted from address)
  postalCode: z
    .string()
    .regex(/^[0-9]{5}$/, 'El código postal debe tener 5 dígitos')
    .optional()
    .nullable(),

  propertyType: z.enum(propertyTypeValues, {
    message: 'Selecciona un tipo de propiedad válido',
  }),

  // Project type: residential (single home) or community (building)
  projectType: z
    .enum(['residential', 'community'], {
      message: 'Selecciona residential o community',
    })
    .optional()
    .default('residential'),

  // Number of units (for community projects)
  numberOfUnits: z
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 unidad')
    .max(500, 'Demasiadas unidades')
    .optional()
    .default(1),

  leadId: z.string().uuid().optional().nullable(),

  // Optional: if provided, use actual consumption
  monthlyBillEur: z
    .number()
    .min(10, 'La factura debe ser al menos €10')
    .max(2000, 'La factura parece demasiado alta')
    .optional()
    .nullable(),

  // Annual IBI (property tax) for municipal savings calculation
  annualIBI: z
    .number()
    .min(50, 'El IBI debe ser al menos €50')
    .max(10000, 'El IBI parece demasiado alto')
    .optional()
    .nullable(),

  // Property characteristics for estimation
  propertyAreaM2: z
    .number()
    .min(20, 'La superficie debe ser al menos 20 m²')
    .max(2000, 'La superficie parece demasiado grande')
    .optional()
    .nullable(),

  numberOfFloors: z
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 planta')
    .max(10, 'Demasiadas plantas')
    .optional()
    .default(1),

  occupants: z
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 ocupante')
    .max(20, 'Demasiados ocupantes')
    .optional()
    .default(3),

  hasAC: z.boolean().optional(),
  hasPool: z.boolean().optional().default(false),

  // Existing installations
  hasSolar: z.boolean().optional().default(false),
  solarSystemKw: z
    .number()
    .min(0.5, 'El sistema solar debe ser al menos 0.5 kW')
    .max(100, 'El sistema solar parece demasiado grande')
    .optional()
    .nullable(),

  hasExistingBattery: z.boolean().optional().default(false),

  // Backup preferences
  backupPriority: z.enum(backupPriorityValues, {
    message: 'Selecciona una prioridad de respaldo válida',
  }).optional().default('basic'),

  // CEE (Energy Efficiency Certificate) - required for IRPF deduction
  // If true, assumes client will obtain CEE pre/post installation
  hasCEE: z.boolean().optional().default(true),
});

export type BatteryAssessmentInputRaw = z.input<typeof batteryAssessmentInputSchema>;
export type BatteryAssessmentInput = z.output<typeof batteryAssessmentInputSchema>;
