import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NewApplicationForm } from "./new-application-form";

export default async function NuevaSubvencionPage() {
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

  // Get leads that are "won" and don't have an application yet
  const { data: existingApplications } = await db
    .from("subsidy_applications")
    .select("lead_id")
    .eq("installer_id", installer.id);

  const leadIdsWithApps = existingApplications?.map((a: { lead_id: string | null }) => a.lead_id).filter(Boolean) || [];

  let query = supabase
    .from("leads")
    .select("*")
    .eq("assigned_installer_id", installer.id)
    .eq("status", "won")
    .order("created_at", { ascending: false });

  if (leadIdsWithApps.length > 0) {
    query = query.not("id", "in", `(${leadIdsWithApps.join(",")})`);
  }

  const { data: availableLeads } = await query;

  if (!availableLeads || availableLeads.length === 0) {
    return (
      <div>
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
          <h1 className="text-2xl font-medium tracking-tight">Nueva solicitud</h1>
        </div>

        <div className="bg-white rounded-[20px] p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">No hay leads disponibles</h3>
          <p className="text-[#445e5f] mb-6">
            Necesitas tener leads con estado &quot;Ganado&quot; para crear solicitudes de subvencion.
          </p>
          <Link
            href="/installer/leads"
            className="inline-flex items-center gap-2 bg-[#222f30] text-white px-5 py-3 rounded-[12px] font-mono text-sm uppercase transition-colors hover:bg-[#a7e26e] hover:text-[#222f30]"
          >
            Ver mis leads
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
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
        <h1 className="text-2xl font-medium tracking-tight">Nueva solicitud de subvencion</h1>
        <p className="text-[#445e5f] mt-1">
          Completa los datos del cliente para generar la documentacion
        </p>
      </div>

      <NewApplicationForm leads={availableLeads} installerId={installer.id} />
    </div>
  );
}
