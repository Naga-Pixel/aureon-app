import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { LeadsTable, LeadFilters } from "@/components/installer";
import type { Lead } from "@/lib/supabase/types";

interface LeadsPageProps {
  searchParams: Promise<{
    status?: string;
    island?: string;
  }>;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
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

  // Build query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  // If not admin, only show assigned leads
  if (installer?.role !== "admin") {
    query = query.eq("assigned_installer_id", installer?.id);
  }

  // Apply filters
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.island) {
    query = query.eq("island", params.island);
  }

  const { data: leads } = await query;
  const typedLeads: Lead[] = leads || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium">Leads</h1>
        <p className="text-[#445e5f]">
          Gestiona todos tus leads de energia solar.
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div>Cargando filtros...</div>}>
        <LeadFilters />
      </Suspense>

      {/* Table */}
      <LeadsTable leads={typedLeads} />
    </div>
  );
}
