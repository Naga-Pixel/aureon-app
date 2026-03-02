export const PROPERTY_TYPES = [
  { value: "vivienda_unifamiliar", label: "Vivienda unifamiliar" },
  { value: "comunidad_vecinos", label: "Comunidad de vecinos" },
  { value: "empresa", label: "Empresa / Nave industrial" },
] as const;

export const ROOF_TYPES = [
  { value: "teja", label: "Teja" },
  { value: "chapa", label: "Chapa metálica" },
  { value: "hormigon", label: "Hormigón / Plana" },
  { value: "otro", label: "Otro" },
] as const;

export const INSTALLATION_TIMELINES = [
  { value: "urgente", label: "Lo antes posible" },
  { value: "proximo_trimestre", label: "En los próximos 3 meses" },
  { value: "este_ano", label: "Este año" },
  { value: "explorando", label: "Solo estoy explorando" },
] as const;

export const LEAD_STATUSES = [
  { value: "new", label: "Nuevo", color: "bg-blue-100 text-blue-800" },
  { value: "contacted", label: "Contactado", color: "bg-yellow-100 text-yellow-800" },
  { value: "qualified", label: "Cualificado", color: "bg-purple-100 text-purple-800" },
  { value: "proposal", label: "Propuesta enviada", color: "bg-indigo-100 text-indigo-800" },
  { value: "won", label: "Ganado", color: "bg-green-100 text-green-800" },
  { value: "lost", label: "Perdido", color: "bg-red-100 text-red-800" },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];
export type RoofType = (typeof ROOF_TYPES)[number]["value"];
export type InstallationTimeline = (typeof INSTALLATION_TIMELINES)[number]["value"];
export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];
