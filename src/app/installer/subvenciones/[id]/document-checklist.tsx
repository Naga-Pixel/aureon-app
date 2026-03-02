"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_STATUSES } from "@/lib/constants/application-statuses";
import type { ClientProfile } from "@/lib/supabase/types";

interface Document {
  id: string;
  application_id: string;
  document_type_id: string;
  status: string;
  file_path: string | null;
  file_name: string | null;
  is_auto_generated: boolean;
  document_type: {
    id: string;
    name: string;
    description: string | null;
    is_required: boolean;
  } | null;
}

interface DocumentChecklistProps {
  applicationId: string;
  documents: Document[];
  clientProfile: ClientProfile | null;
}

export function DocumentChecklist({
  applicationId,
  documents,
  clientProfile,
}: DocumentChecklistProps) {
  const router = useRouter();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "uploaded":
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "rejected":
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
          </svg>
        );
    }
  };

  const getStatusLabel = (status: string) => {
    return DOCUMENT_STATUSES.find((s) => s.value === status)?.label || status;
  };

  const canAutoGenerate = (docTypeId: string) => {
    // These document types can be auto-generated from client profile data
    return ["solicitud_oficial", "presupuesto"].includes(docTypeId) && clientProfile;
  };

  const handleFileUpload = async (docId: string, file: File) => {
    setUploadingId(docId);

    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // Upload file to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const filePath = `applications/${applicationId}/${docId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update document record
      const { error: updateError } = await db
        .from("application_documents")
        .update({
          status: "uploaded",
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        })
        .eq("id", docId);

      if (updateError) throw updateError;

      router.refresh();
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error al subir el archivo. Por favor, intenta de nuevo.");
    } finally {
      setUploadingId(null);
    }
  };

  const handleAutoGenerate = async (docId: string, docTypeId: string) => {
    setGeneratingId(docId);

    try {
      // Call API to generate PDF
      const response = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          documentId: docId,
          documentType: docTypeId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate document");
      }

      router.refresh();
    } catch (error) {
      console.error("Error generating document:", error);
      alert("Error al generar el documento. Por favor, intenta de nuevo.");
    } finally {
      setGeneratingId(null);
    }
  };

  const completedCount = documents.filter(
    (d) => d.status === "uploaded" || d.status === "verified"
  ).length;
  const requiredCount = documents.filter(
    (d) => d.document_type?.is_required
  ).length;

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#445e5f]">
            {completedCount} de {requiredCount} documentos requeridos
          </span>
          <span className="text-sm font-medium">
            {Math.round((completedCount / requiredCount) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-[#f7f7f5] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#a7e26e] transition-all duration-300"
            style={{ width: `${(completedCount / requiredCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-4 p-4 bg-[#f7f7f5] rounded-[12px]"
          >
            {/* Status Icon */}
            <div className="flex-shrink-0">{getStatusIcon(doc.status)}</div>

            {/* Document Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">
                  {doc.document_type?.name || doc.document_type_id}
                </p>
                {doc.document_type?.is_required && (
                  <span className="text-xs text-red-500">*</span>
                )}
              </div>
              <p className="text-sm text-[#445e5f]">
                {doc.file_name || getStatusLabel(doc.status)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {doc.status === "pending" && (
                <>
                  {canAutoGenerate(doc.document_type_id) && (
                    <button
                      onClick={() => handleAutoGenerate(doc.id, doc.document_type_id)}
                      disabled={generatingId === doc.id}
                      className="px-3 py-1.5 text-xs font-mono uppercase bg-[#a7e26e] text-[#222f30] rounded-[8px] hover:bg-[#222f30] hover:text-white transition-colors disabled:opacity-50"
                    >
                      {generatingId === doc.id ? "Generando..." : "Generar"}
                    </button>
                  )}
                  <label className="px-3 py-1.5 text-xs font-mono uppercase bg-[#222f30] text-white rounded-[8px] hover:bg-[#a7e26e] hover:text-[#222f30] transition-colors cursor-pointer">
                    {uploadingId === doc.id ? "Subiendo..." : "Subir"}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(doc.id, file);
                      }}
                      disabled={uploadingId === doc.id}
                    />
                  </label>
                </>
              )}

              {(doc.status === "uploaded" || doc.status === "verified") && doc.file_path && (
                <button
                  onClick={() => {
                    // TODO: Open file preview or download
                    window.open(`/api/documents/download?path=${doc.file_path}`, "_blank");
                  }}
                  className="px-3 py-1.5 text-xs font-mono uppercase bg-white text-[#222f30] rounded-[8px] hover:bg-[#f7f7f5] transition-colors"
                >
                  Ver
                </button>
              )}

              {doc.status === "rejected" && (
                <label className="px-3 py-1.5 text-xs font-mono uppercase bg-red-100 text-red-700 rounded-[8px] hover:bg-red-200 transition-colors cursor-pointer">
                  Resubir
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(doc.id, file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Help Text */}
      <p className="mt-4 text-xs text-[#445e5f]">
        * Documentos obligatorios para la solicitud de subvencion
      </p>
    </div>
  );
}
