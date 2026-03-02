import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { APPLICATION_STATUSES } from "@/lib/constants/application-statuses";
import { formatCurrency } from "@/lib/utils/calculator";
import { DocumentChecklist } from "./document-checklist";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get installer info
  const { data: installerData } = await supabase
    .from("installers")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!installerData) {
    redirect("/login");
  }

  const installer = installerData as { id: string; company_name: string; contact_name: string };

  // Get application with related data
  const { data: application } = await db
    .from("subsidy_applications")
    .select(`
      *,
      lead:leads(*),
      client_profile:client_profiles(*)
    `)
    .eq("id", id)
    .eq("installer_id", installer.id)
    .single();

  if (!application) {
    notFound();
  }

  // Get documents
  const { data: documents } = await db
    .from("application_documents")
    .select(`
      *,
      document_type:document_types(*)
    `)
    .eq("application_id", id)
    .order("document_type_id");

  const statusConfig = APPLICATION_STATUSES.find((s) => s.value === application.status);

  const getStatusBadgeVariant = (status: string): "default" | "success" | "warning" | "error" | "info" => {
    const variantMap: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
      draft: "default",
      collecting_documents: "warning",
      ready_to_submit: "info",
      submitted: "info",
      under_review: "warning",
      approved: "success",
      rejected: "error",
      paid: "success",
    };
    return variantMap[status] || "default";
  };

  const profile = application.client_profile;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/installer/subvenciones"
          className="inline-flex items-center gap-2 text-[#445e5f] hover:text-[#222f30] transition-colors mb-4"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver a subvenciones
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">
              {profile?.full_name || application.lead?.name || "Solicitud"}
            </h1>
            <p className="text-[#445e5f] mt-1">
              {profile?.dni_nie || application.lead?.email}
            </p>
          </div>
          <Badge variant={getStatusBadgeVariant(application.status)}>
            {statusConfig?.label || application.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Document Checklist */}
          <div className="bg-white rounded-[20px] p-6">
            <h2 className="text-lg font-medium mb-4">Documentos requeridos</h2>
            <DocumentChecklist
              applicationId={id}
              documents={documents || []}
              clientProfile={profile}
            />
          </div>

          {/* Client Data */}
          {profile && (
            <div className="bg-white rounded-[20px] p-6">
              <h2 className="text-lg font-medium mb-4">Datos del cliente</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[#445e5f]">Nombre completo</p>
                  <p className="font-medium">{profile.full_name}</p>
                </div>
                <div>
                  <p className="text-[#445e5f]">DNI/NIE</p>
                  <p className="font-medium">{profile.dni_nie}</p>
                </div>
                <div>
                  <p className="text-[#445e5f]">Telefono</p>
                  <p className="font-medium">{profile.phone || "-"}</p>
                </div>
                <div>
                  <p className="text-[#445e5f]">Email</p>
                  <p className="font-medium">{profile.email || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[#445e5f]">Direccion</p>
                  <p className="font-medium">
                    {profile.address}, {profile.postal_code} {profile.municipality}
                  </p>
                </div>
                {profile.catastral_reference && (
                  <div className="col-span-2">
                    <p className="text-[#445e5f]">Referencia catastral</p>
                    <p className="font-medium font-mono">{profile.catastral_reference}</p>
                  </div>
                )}
              </div>

              {/* Installation Details */}
              {profile.installation_power_kw && (
                <>
                  <h3 className="text-md font-medium mt-6 mb-3">Instalacion</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[#445e5f]">Potencia</p>
                      <p className="font-medium">{profile.installation_power_kw} kW</p>
                    </div>
                    <div>
                      <p className="text-[#445e5f]">Paneles</p>
                      <p className="font-medium">{profile.panel_count || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[#445e5f]">Bateria</p>
                      <p className="font-medium">
                        {profile.battery_capacity_kwh ? `${profile.battery_capacity_kwh} kWh` : "No"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-[20px] p-6">
            <h3 className="font-medium mb-4">Resumen</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#445e5f]">Coste instalacion</span>
                <span className="font-medium">
                  {profile?.total_cost ? formatCurrency(profile.total_cost) : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#445e5f]">Importe solicitado</span>
                <span className="font-medium">
                  {application.requested_amount
                    ? formatCurrency(application.requested_amount)
                    : "-"}
                </span>
              </div>
              {application.approved_amount && (
                <div className="flex justify-between text-[#a7e26e]">
                  <span>Importe aprobado</span>
                  <span className="font-medium">
                    {formatCurrency(application.approved_amount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-[20px] p-6">
            <h3 className="font-medium mb-4">Cronologia</h3>
            <div className="space-y-4">
              <TimelineItem
                label="Creado"
                date={application.created_at}
                isComplete
              />
              <TimelineItem
                label="Documentos completos"
                date={null}
                isComplete={["ready_to_submit", "submitted", "under_review", "approved", "paid"].includes(application.status)}
              />
              <TimelineItem
                label="Enviado"
                date={application.submission_date}
                isComplete={["submitted", "under_review", "approved", "paid"].includes(application.status)}
              />
              <TimelineItem
                label="Aprobado"
                date={application.approval_date}
                isComplete={["approved", "paid"].includes(application.status)}
              />
              <TimelineItem
                label="Pagado"
                date={application.payment_date}
                isComplete={application.status === "paid"}
                isLast
              />
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-[20px] p-6">
            <h3 className="font-medium mb-4">Acciones</h3>
            <div className="space-y-2">
              <button
                className="w-full text-left px-4 py-3 rounded-[12px] bg-[#f7f7f5] hover:bg-[#a7e26e]/20 transition-colors text-sm font-medium flex items-center gap-2"
                disabled
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generar solicitud PDF
              </button>
              <button
                className="w-full text-left px-4 py-3 rounded-[12px] bg-[#f7f7f5] hover:bg-[#a7e26e]/20 transition-colors text-sm font-medium flex items-center gap-2"
                disabled
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generar presupuesto PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  isComplete,
  isLast = false,
}: {
  label: string;
  date: string | null;
  isComplete: boolean;
  isLast?: boolean;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full ${
            isComplete ? "bg-[#a7e26e]" : "bg-gray-200"
          }`}
        />
        {!isLast && (
          <div
            className={`w-0.5 h-8 ${
              isComplete ? "bg-[#a7e26e]" : "bg-gray-200"
            }`}
          />
        )}
      </div>
      <div className="flex-1 -mt-0.5">
        <p className={`text-sm ${isComplete ? "font-medium" : "text-[#445e5f]"}`}>
          {label}
        </p>
        {date && (
          <p className="text-xs text-[#445e5f]">{formatDate(date)}</p>
        )}
      </div>
    </div>
  );
}
