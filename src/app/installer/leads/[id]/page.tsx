import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, Badge } from "@/components/ui";
import { AssessmentCard } from "@/components/assessment";
import { LEAD_STATUSES, PROPERTY_TYPES, ROOF_TYPES, INSTALLATION_TIMELINES } from "@/lib/constants/property-types";
import { ISLANDS } from "@/lib/constants/islands";
import { formatCurrency } from "@/lib/utils/calculator";
import { LeadStatusForm } from "./lead-status-form";
import { DeleteLeadButton } from "./delete-lead-button";
import type { Lead, Installer } from "@/lib/supabase/types";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  const lead: Lead | null = data;

  if (error || !lead) {
    notFound();
  }

  // Get current installer to check if admin
  const { data: { user } } = await supabase.auth.getUser();
  let installer: Installer | null = null;
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("installers")
      .select("*")
      .eq("user_id", user.id)
      .single();
    installer = data;
  }
  const isAdmin = installer?.role === "admin";

  const getLabel = (
    value: string,
    options: readonly { value: string; label: string }[]
  ) => {
    return options.find((o) => o.value === value)?.label || value;
  };

  const statusConfig = LEAD_STATUSES.find((s) => s.value === lead.status);
  const statusVariant =
    lead.status === "new"
      ? "info"
      : lead.status === "contacted"
      ? "warning"
      : lead.status === "won"
      ? "success"
      : lead.status === "lost"
      ? "error"
      : "default";

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav>
        <Link
          href="/installer/leads"
          className="text-sm text-[#445e5f] hover:text-[#a7e26e] transition-colors"
        >
          ← Volver a leads
        </Link>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-medium">{lead.name}</h1>
            <Badge variant={statusVariant}>
              {statusConfig?.label || lead.status}
            </Badge>
          </div>
          <p className="text-[#445e5f]">
            Creado el {formatDate(lead.created_at)}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Contact Info */}
          <Card variant="bordered">
            <CardContent className="p-6">
              <h2 className="text-lg font-medium mb-4">
                Informacion de contacto
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Nombre
                  </p>
                  <p className="font-medium">{lead.name}</p>
                </div>
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Email
                  </p>
                  <a
                    href={`mailto:${lead.email}`}
                    className="font-medium text-[#a7e26e] hover:underline"
                  >
                    {lead.email}
                  </a>
                </div>
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Telefono
                  </p>
                  <a
                    href={`tel:${lead.phone}`}
                    className="font-medium text-[#a7e26e] hover:underline"
                  >
                    {lead.phone}
                  </a>
                </div>
                {lead.address && (
                  <div>
                    <p className="text-sm text-[#445e5f]">
                      Direccion
                    </p>
                    <p className="font-medium">{lead.address}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Property Info */}
          <Card variant="bordered">
            <CardContent className="p-6">
              <h2 className="text-lg font-medium mb-4">
                Detalles de la propiedad
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Tipo de propiedad
                  </p>
                  <p className="font-medium">
                    {getLabel(lead.property_type, PROPERTY_TYPES)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#445e5f]">Isla</p>
                  <p className="font-medium">
                    {getLabel(lead.island, ISLANDS)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Tipo de tejado
                  </p>
                  <p className="font-medium">
                    {getLabel(lead.roof_type, ROOF_TYPES)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Plazo de instalacion
                  </p>
                  <p className="font-medium">
                    {getLabel(lead.installation_timeline, INSTALLATION_TIMELINES)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card variant="bordered">
            <CardContent className="p-6">
              <h2 className="text-lg font-medium mb-4">Notas</h2>
              <LeadStatusForm
                leadId={lead.id}
                currentStatus={lead.status}
                currentNotes={lead.notes || ""}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Savings Summary */}
          <Card variant="elevated">
            <CardContent className="p-6">
              <h2 className="text-lg font-medium mb-4">Ahorro estimado</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-[#445e5f]">
                    Factura mensual
                  </p>
                  <p className="text-2xl font-semibold">
                    {formatCurrency(Number(lead.monthly_bill))}
                  </p>
                </div>
                {lead.estimated_savings_monthly && (
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm text-[#445e5f]">
                      Ahorro mensual
                    </p>
                    <p className="text-xl font-semibold text-[#a7e26e]">
                      {formatCurrency(Number(lead.estimated_savings_monthly))}
                    </p>
                  </div>
                )}
                {lead.estimated_savings_annual && (
                  <div>
                    <p className="text-sm text-[#445e5f]">
                      Ahorro anual
                    </p>
                    <p className="text-xl font-semibold text-[#a7e26e]">
                      {formatCurrency(Number(lead.estimated_savings_annual))}
                    </p>
                  </div>
                )}
                {lead.estimated_subsidy && (
                  <div>
                    <p className="text-sm text-[#445e5f]">
                      Subvencion estimada
                    </p>
                    <p className="text-xl font-semibold">
                      {formatCurrency(Number(lead.estimated_subsidy))}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card variant="bordered">
            <CardContent className="p-6">
              <h2 className="text-lg font-medium mb-4">Acciones rapidas</h2>
              <div className="space-y-3">
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-3 w-full p-3 rounded-xl bg-[#f7f7f5] hover:bg-[#a7e26e]/20 transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-[#a7e26e]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  <span className="font-medium">Llamar</span>
                </a>
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-3 w-full p-3 rounded-xl bg-[#f7f7f5] hover:bg-[#a7e26e]/20 transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-[#a7e26e]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="font-medium">Enviar email</span>
                </a>
                <DeleteLeadButton leadId={lead.id} leadName={lead.name} />
              </div>
            </CardContent>
          </Card>

          {/* Solar Assessment */}
          <AssessmentCard leadId={lead.id} isAdmin={isAdmin} />
        </div>
      </div>
    </div>
  );
}
