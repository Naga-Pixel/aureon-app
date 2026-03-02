import { z } from "zod";

export const leadFormSchema = z.object({
  // Contact Information
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(255, "El nombre es demasiado largo"),
  email: z.string().email("Email invalido"),
  phone: z
    .string()
    .min(9, "El telefono debe tener al menos 9 digitos")
    .max(50, "El telefono es demasiado largo")
    .regex(/^[+]?[\d\s-]+$/, "Formato de telefono invalido"),
  address: z.string().optional(),

  // Property Information
  property_type: z.enum(["vivienda_unifamiliar", "comunidad_vecinos", "empresa"], {
    message: "Selecciona el tipo de propiedad",
  }),
  island: z.enum(
    [
      "tenerife",
      "gran-canaria",
      "lanzarote",
      "fuerteventura",
      "la-palma",
      "la-gomera",
      "el-hierro",
    ],
    { message: "Selecciona una isla" }
  ),
  roof_type: z.enum(["teja", "chapa", "hormigon", "otro"], {
    message: "Selecciona el tipo de tejado",
  }),

  // Preferences
  installation_timeline: z.enum(
    ["urgente", "proximo_trimestre", "este_ano", "explorando"],
    { message: "Selecciona cuando te gustaria instalar" }
  ),
  monthly_bill: z
    .number({ message: "Introduce tu factura mensual" })
    .min(1, "La factura debe ser mayor que 0")
    .max(1000000, "Valor demasiado alto"),

  // Calculator results (optional, filled by system)
  estimated_savings_monthly: z.number().optional(),
  estimated_savings_annual: z.number().optional(),
  estimated_subsidy: z.number().optional(),
});

export type LeadFormData = z.infer<typeof leadFormSchema>;
