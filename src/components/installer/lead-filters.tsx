"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";
import { LEAD_STATUSES } from "@/lib/constants/property-types";
import { ISLANDS } from "@/lib/constants/islands";

export function LeadFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get("status") || "";
  const currentIsland = searchParams.get("island") || "";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/installer/leads?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="w-48">
        <Select
          label="Estado"
          options={[{ value: "", label: "Todos" }, ...LEAD_STATUSES]}
          value={currentStatus}
          onChange={(e) => updateFilter("status", e.target.value)}
        />
      </div>
      <div className="w-48">
        <Select
          label="Isla"
          options={[{ value: "", label: "Todas" }, ...ISLANDS]}
          value={currentIsland}
          onChange={(e) => updateFilter("island", e.target.value)}
        />
      </div>
    </div>
  );
}
