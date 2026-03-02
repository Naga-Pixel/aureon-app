"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { LEAD_STATUSES } from "@/lib/constants/property-types";
import { ISLANDS } from "@/lib/constants/islands";
import { formatCurrency } from "@/lib/utils/calculator";
import type { Lead } from "@/lib/supabase/types";

interface LeadsTableProps {
  leads: Lead[];
}

export function LeadsTable({ leads }: LeadsTableProps) {
  const getStatusBadge = (status: string) => {
    const statusConfig = LEAD_STATUSES.find((s) => s.value === status);
    const variant =
      status === "new"
        ? "info"
        : status === "contacted"
        ? "warning"
        : status === "won"
        ? "success"
        : status === "lost"
        ? "error"
        : "default";

    return <Badge variant={variant}>{statusConfig?.label || status}</Badge>;
  };

  const getIslandLabel = (island: string) => {
    return ISLANDS.find((i) => i.value === island)?.label || island;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-[20px] p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-[#f7f7f5] rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[#445e5f]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">No hay leads todavia</h3>
        <p className="text-[#445e5f]">
          Los leads apareceran aqui cuando se asignen a tu cuenta.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Nombre
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Isla
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Factura
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Estado
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Fecha
              </th>
              <th className="px-6 py-4 text-right text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="hover:bg-[#f7f7f5]/50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-sm text-[#445e5f]">
                      {lead.email}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 text-[#445e5f]">
                  {getIslandLabel(lead.island)}
                </td>
                <td className="px-6 py-4 font-medium">
                  {formatCurrency(Number(lead.monthly_bill))}/mes
                </td>
                <td className="px-6 py-4">{getStatusBadge(lead.status)}</td>
                <td className="px-6 py-4 text-[#445e5f]">
                  {formatDate(lead.created_at)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/installer/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#a7e26e] hover:text-[#222f30] transition-colors"
                  >
                    Ver detalles
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
