"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { APPLICATION_STATUSES } from "@/lib/constants/application-statuses";
import { formatCurrency } from "@/lib/utils/calculator";

interface Application {
  id: string;
  lead_id: string | null;
  client_profile_id: string | null;
  status: string;
  requested_amount: number | null;
  approved_amount: number | null;
  submission_date: string | null;
  created_at: string;
  lead?: {
    name: string;
    email: string;
  } | null;
  client_profile?: {
    full_name: string;
    dni_nie: string;
  } | null;
}

interface ApplicationsTableProps {
  applications: Application[];
}

export function ApplicationsTable({ applications }: ApplicationsTableProps) {
  const getStatusBadge = (status: string) => {
    const statusConfig = APPLICATION_STATUSES.find((s) => s.value === status);
    const variantMap: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
      gray: "default",
      yellow: "warning",
      blue: "info",
      purple: "info",
      orange: "warning",
      green: "success",
      red: "error",
      emerald: "success",
    };
    const variant = variantMap[statusConfig?.color || "gray"] || "default";

    return <Badge variant={variant}>{statusConfig?.label || status}</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getClientName = (app: Application) => {
    return app.client_profile?.full_name || app.lead?.name || "Sin nombre";
  };

  const getClientIdentifier = (app: Application) => {
    return app.client_profile?.dni_nie || app.lead?.email || "";
  };

  if (applications.length === 0) {
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">No hay solicitudes todavia</h3>
        <p className="text-[#445e5f] mb-6">
          Crea tu primera solicitud de subvencion para un cliente ganado.
        </p>
        <Link
          href="/installer/subvenciones/nueva"
          className="inline-flex items-center gap-2 bg-[#a7e26e] text-[#222f30] px-5 py-3 rounded-[12px] font-mono text-sm uppercase transition-colors hover:bg-[#222f30] hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva solicitud
        </Link>
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
                Cliente
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Estado
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Importe solicitado
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Fecha envio
              </th>
              <th className="px-6 py-4 text-left text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Creado
              </th>
              <th className="px-6 py-4 text-right text-xs font-mono uppercase tracking-wider text-[#445e5f]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {applications.map((app) => (
              <tr
                key={app.id}
                className="hover:bg-[#f7f7f5]/50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium">{getClientName(app)}</p>
                    <p className="text-sm text-[#445e5f]">
                      {getClientIdentifier(app)}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4">{getStatusBadge(app.status)}</td>
                <td className="px-6 py-4 font-medium">
                  {app.requested_amount
                    ? formatCurrency(app.requested_amount)
                    : "-"}
                </td>
                <td className="px-6 py-4 text-[#445e5f]">
                  {formatDate(app.submission_date)}
                </td>
                <td className="px-6 py-4 text-[#445e5f]">
                  {formatDate(app.created_at)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/installer/subvenciones/${app.id}`}
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
