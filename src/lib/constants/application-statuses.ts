export const APPLICATION_STATUSES = [
  { value: "draft", label: "Borrador", color: "gray" },
  { value: "collecting_documents", label: "Recopilando documentos", color: "yellow" },
  { value: "ready_to_submit", label: "Listo para enviar", color: "blue" },
  { value: "submitted", label: "Enviado", color: "purple" },
  { value: "under_review", label: "En revision", color: "orange" },
  { value: "approved", label: "Aprobado", color: "green" },
  { value: "rejected", label: "Rechazado", color: "red" },
  { value: "paid", label: "Pagado", color: "emerald" },
] as const;

export const DOCUMENT_STATUSES = [
  { value: "pending", label: "Pendiente", color: "gray" },
  { value: "uploaded", label: "Subido", color: "blue" },
  { value: "verified", label: "Verificado", color: "green" },
  { value: "rejected", label: "Rechazado", color: "red" },
  { value: "not_applicable", label: "No aplica", color: "gray" },
] as const;

export const DOCUMENT_TYPES = [
  { id: "solicitud_oficial", name: "Solicitud Oficial", required: true },
  { id: "dni_nie", name: "DNI/NIE", required: true },
  { id: "escrituras", name: "Escrituras de Propiedad", required: true },
  { id: "presupuesto", name: "Presupuesto Detallado", required: true },
  { id: "memoria_tecnica", name: "Memoria Tecnica", required: true },
  { id: "certificado_eficiencia", name: "Certificado Eficiencia Energetica", required: true },
  { id: "autorizacion_obra", name: "Autorizacion de Obra", required: false },
  { id: "contrato_instalador", name: "Contrato con Instalador", required: false },
  { id: "factura_proforma", name: "Factura Proforma", required: false },
  { id: "certificado_bancario", name: "Certificado Bancario", required: false },
] as const;

export type ApplicationStatusValue = typeof APPLICATION_STATUSES[number]["value"];
export type DocumentStatusValue = typeof DOCUMENT_STATUSES[number]["value"];
