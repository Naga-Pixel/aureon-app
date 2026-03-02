import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatsCards, LeadsTable } from "@/components/installer";
import { Button } from "@/components/ui";
import type { Lead } from "@/lib/supabase/types";

export default async function InstallerDashboard() {
  const supabase = await createClient();

  // Get current user's installer record
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: installer } = await (supabase as any)
    .from("installers")
    .select("id, role")
    .eq("user_id", user?.id)
    .single();

  // Fetch leads based on role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadsQuery = (supabase as any)
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  // If not admin, only show assigned leads
  if (installer?.role !== "admin") {
    leadsQuery = leadsQuery.eq("assigned_installer_id", installer?.id);
  }

  const { data: leads } = await leadsQuery.limit(10);

  // Calculate stats
  const allLeads: Lead[] = leads || [];
  const stats = {
    total: allLeads.length,
    new: allLeads.filter((l) => l.status === "new").length,
    contacted: allLeads.filter((l) => l.status === "contacted").length,
    won: allLeads.filter((l) => l.status === "won").length,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-medium">Dashboard</h1>
          <p className="text-[var(--color-text-muted)]">
            Bienvenido de vuelta. Aqui tienes un resumen de tus leads.
          </p>
        </div>
      </div>

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Recent Leads */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">Leads recientes</h2>
          <Link href="/installer/leads">
            <Button variant="ghost" size="sm">
              Ver todos
            </Button>
          </Link>
        </div>
        <LeadsTable leads={allLeads.slice(0, 5)} />
      </div>
    </div>
  );
}
