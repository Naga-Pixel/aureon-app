"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  interest: "empresa" | "vecino" | "otro";
}

export function ContactForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    message: "",
    interest: "vecino",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al enviar el mensaje");
      }

      router.push("/gracias");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al enviar el mensaje"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-[12px] text-red-700">
          {error}
        </div>
      )}

      {/* Interest Type */}
      <div className="space-y-4">
        <label className="block text-lg font-medium text-[#222f30]">
          Me interesa como...
        </label>
        <div className="flex flex-wrap gap-3">
          {[
            { value: "empresa", label: "Empresa" },
            { value: "vecino", label: "Vecino" },
            { value: "otro", label: "Otro" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setFormData({ ...formData, interest: option.value as ContactFormData["interest"] })
              }
              className={`px-5 py-3 rounded-[12px] font-medium transition-all ${
                formData.interest === option.value
                  ? "bg-[#a7e26e] text-[#222f30]"
                  : "bg-[#f7f7f5] text-[#445e5f] hover:bg-[#e8e8e6]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact Information */}
      <div className="space-y-6">
        <Input
          label="Nombre completo"
          placeholder="Tu nombre"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <div className="grid md:grid-cols-2 gap-6">
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Input
            label="Teléfono"
            type="tel"
            placeholder="+34 600 000 000"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
      </div>

      {/* Message */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#222f30]">
          Mensaje
        </label>
        <textarea
          placeholder="Cuéntanos en qué podemos ayudarte..."
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          required
          rows={5}
          className="w-full px-4 py-3 bg-[#f7f7f5] border border-[rgba(34,47,48,0.1)] rounded-[12px] text-[#222f30] placeholder:text-[#445e5f]/60 focus:border-[#a7e26e] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all outline-none resize-none"
        />
      </div>

      {/* Submit */}
      <div className="pt-4">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Enviando..." : "Enviar mensaje"}
        </Button>
        <p className="text-sm text-center text-[#445e5f] mt-4">
          Te responderemos lo antes posible a tu correo electrónico.
        </p>
      </div>
    </form>
  );
}
