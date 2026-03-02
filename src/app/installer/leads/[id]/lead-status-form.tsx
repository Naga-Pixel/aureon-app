"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Select, Textarea } from "@/components/ui";
import { LEAD_STATUSES } from "@/lib/constants/property-types";

interface LeadStatusFormProps {
  leadId: string;
  currentStatus: string;
  currentNotes: string;
}

export function LeadStatusForm({
  leadId,
  currentStatus,
  currentNotes,
}: LeadStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState(currentNotes);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("leads")
        .update({ status, notes, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (error) throw error;

      setMessage({ type: "success", text: "Lead actualizado correctamente" });
      router.refresh();
    } catch {
      setMessage({
        type: "error",
        text: "Error al actualizar el lead",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div
          className={`p-3 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <Select
        label="Estado del lead"
        options={LEAD_STATUSES}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      />

      <Textarea
        label="Notas internas"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anade notas sobre este lead..."
        rows={4}
      />

      <Button
        type="submit"
        variant="primary"
        isLoading={isLoading}
        disabled={isLoading}
      >
        {isLoading ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
