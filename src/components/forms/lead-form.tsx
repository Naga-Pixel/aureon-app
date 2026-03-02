"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { leadFormSchema, type LeadFormData } from "@/lib/validations/lead";
import { Button, Input, Select, RadioGroup } from "@/components/ui";
import { ISLANDS } from "@/lib/constants/islands";
import {
  PROPERTY_TYPES,
  ROOF_TYPES,
  INSTALLATION_TIMELINES,
} from "@/lib/constants/property-types";
import { calculateSavings } from "@/lib/utils/calculator";

export function LeadForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      property_type: undefined,
      installation_timeline: undefined,
    },
  });

  const propertyType = watch("property_type");
  const installationTimeline = watch("installation_timeline");

  const onSubmit = async (data: LeadFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Calculate savings
      const savings = calculateSavings({ monthlyBill: data.monthly_bill });
      const enrichedData = {
        ...data,
        estimated_savings_monthly: savings.monthlySavings,
        estimated_savings_annual: savings.annualSavings,
        estimated_subsidy: savings.estimatedSubsidy,
      };

      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrichedData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al enviar el formulario");
      }

      router.push("/gracias");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al enviar el formulario"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-red-700">
          {error}
        </div>
      )}

      {/* Property Type */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Tipo de propiedad</h3>
        <RadioGroup
          name="property_type"
          options={PROPERTY_TYPES.map((t) => ({
            value: t.value,
            label: t.label,
          }))}
          value={propertyType}
          onChange={(value) =>
            setValue("property_type", value as LeadFormData["property_type"])
          }
          error={errors.property_type?.message}
        />
      </div>

      {/* Installation Timeline */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">¿Cuando te gustaria instalar?</h3>
        <RadioGroup
          name="installation_timeline"
          options={INSTALLATION_TIMELINES.map((t) => ({
            value: t.value,
            label: t.label,
          }))}
          value={installationTimeline}
          onChange={(value) =>
            setValue(
              "installation_timeline",
              value as LeadFormData["installation_timeline"]
            )
          }
          error={errors.installation_timeline?.message}
        />
      </div>

      {/* Property Details */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium">Detalles de la propiedad</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <Select
            label="Tipo de tejado"
            options={ROOF_TYPES}
            placeholder="Selecciona..."
            {...register("roof_type")}
            error={errors.roof_type?.message}
          />
          <Select
            label="Isla"
            options={ISLANDS}
            placeholder="Selecciona..."
            {...register("island")}
            error={errors.island?.message}
          />
        </div>
        <Input
          label="Factura mensual de luz (€)"
          type="number"
          placeholder="Ej: 150"
          {...register("monthly_bill", { valueAsNumber: true })}
          error={errors.monthly_bill?.message}
        />
      </div>

      {/* Contact Information */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium">Informacion de contacto</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <Input
            label="Nombre completo"
            placeholder="Tu nombre"
            {...register("name")}
            error={errors.name?.message}
          />
          <Input
            label="Telefono"
            type="tel"
            placeholder="+34 600 000 000"
            {...register("phone")}
            error={errors.phone?.message}
          />
        </div>
        <Input
          label="Email"
          type="email"
          placeholder="tu@email.com"
          {...register("email")}
          error={errors.email?.message}
        />
        <Input
          label="Direccion (opcional)"
          placeholder="Calle, numero, ciudad"
          {...register("address")}
          error={errors.address?.message}
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
          {isSubmitting ? "Enviando..." : "Solicitar presupuesto gratuito"}
        </Button>
        <p className="text-sm text-center text-[var(--color-text-muted)] mt-4">
          Al enviar este formulario, aceptas nuestra politica de privacidad.
        </p>
      </div>
    </form>
  );
}
