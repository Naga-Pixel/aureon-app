import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ApplicationsTable } from "@/components/installer/applications-table";

export default async function SubvencionesPage() {
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

  const installer = installerData as { id: string };

  // Get applications for this installer
  const { data: applications } = await db
    .from("subsidy_applications")
    .select(`
      *,
      lead:leads(name, email),
      client_profile:client_profiles(full_name, dni_nie)
    `)
    .eq("installer_id", installer.id)
    .order("created_at", { ascending: false });

  // Get leads that don't have an application yet (for creating new applications)
  const { data: availableLeads } = await supabase
    .from("leads")
    .select("id, name, email")
    .eq("assigned_installer_id", installer.id)
    .eq("status", "won")
    .not("id", "in", `(${applications?.map((a: { lead_id: string | null }) => a.lead_id).filter(Boolean).join(",") || "00000000-0000-0000-0000-000000000000"})`);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Subvenciones</h1>
          <p className="text-[#445e5f] mt-1">
            Gestiona las solicitudes de subvencion de tus clientes
          </p>
        </div>
        {availableLeads && availableLeads.length > 0 && (
          <Link
            href="/installer/subvenciones/nueva"
            className="inline-flex items-center gap-2 bg-[#a7e26e] text-[#222f30] px-5 py-3 rounded-[12px] font-mono text-sm uppercase transition-colors hover:bg-[#222f30] hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva solicitud
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total solicitudes"
          value={applications?.length || 0}
          icon="document"
        />
        <StatCard
          label="En tramite"
          value={applications?.filter((a: { status: string }) => ["collecting_documents", "ready_to_submit", "submitted", "under_review"].includes(a.status)).length || 0}
          icon="clock"
          color="yellow"
        />
        <StatCard
          label="Aprobadas"
          value={applications?.filter((a: { status: string }) => a.status === "approved" || a.status === "paid").length || 0}
          icon="check"
          color="green"
        />
        <StatCard
          label="Importe total"
          value={`${((applications?.reduce((sum: number, a: { approved_amount: number | null; requested_amount: number | null }) => sum + (a.approved_amount || a.requested_amount || 0), 0) || 0) / 1000).toFixed(1)}k`}
          icon="euro"
          color="blue"
          prefix=""
        />
      </div>

      {/* Applications Table */}
      <ApplicationsTable applications={applications || []} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = "default",
  prefix = "",
}: {
  label: string;
  value: number | string;
  icon: string;
  color?: "default" | "green" | "yellow" | "blue";
  prefix?: string;
}) {
  const colorClasses = {
    default: "bg-[#f7f7f5] text-[#222f30]",
    green: "bg-[#a7e26e]/20 text-[#222f30]",
    yellow: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
  };

  const iconMap: Record<string, React.ReactNode> = {
    document: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    clock: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    check: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    euro: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 10.5h4m-4 3h4m9-1.5a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div className="bg-white rounded-[20px] p-6">
      <div className="flex items-center justify-between mb-4">
        <span className={`w-10 h-10 rounded-[12px] flex items-center justify-center ${colorClasses[color]}`}>
          {iconMap[icon]}
        </span>
      </div>
      <p className="text-3xl font-medium tracking-tight">
        {prefix}{value}
      </p>
      <p className="text-sm text-[#445e5f] mt-1">{label}</p>
    </div>
  );
}
