"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select } from "@/components/ui";
import { ISLANDS } from "@/lib/constants/islands";
import type { Lead } from "@/lib/supabase/types";

interface NewApplicationFormProps {
  leads: Lead[];
  installerId: string;
}

type Step = "select_lead" | "personal" | "property" | "installation" | "bank" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "select_lead", label: "Seleccionar cliente" },
  { id: "personal", label: "Datos personales" },
  { id: "property", label: "Inmueble" },
  { id: "installation", label: "Instalacion" },
  { id: "bank", label: "Datos bancarios" },
  { id: "review", label: "Revisar" },
];

export function NewApplicationForm({ leads, installerId }: NewApplicationFormProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("select_lead");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [formData, setFormData] = useState({
    // Personal
    full_name: "",
    dni_nie: "",
    nationality: "Espanola",
    birth_date: "",
    phone: "",
    email: "",
    address: "",
    postal_code: "",
    municipality: "",
    island: "",

    // Property
    property_address: "",
    property_postal_code: "",
    property_municipality: "",
    catastral_reference: "",
    property_type: "vivienda",
    property_use: "residencial",
    property_surface_m2: "",

    // Installation
    installation_power_kw: "",
    panel_count: "",
    panel_model: "",
    panel_power_w: "",
    inverter_model: "",
    inverter_power_kw: "",
    battery_model: "",
    battery_capacity_kwh: "",
    estimated_annual_production_kwh: "",

    // Costs
    total_cost: "",
    panel_cost: "",
    inverter_cost: "",
    battery_cost: "",
    installation_cost: "",
    other_costs: "",

    // Bank
    iban: "",
    bank_name: "",
    account_holder: "",
  });

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  const handleLeadSelect = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setSelectedLeadId(leadId);
      setFormData((prev) => ({
        ...prev,
        full_name: lead.name,
        phone: lead.phone,
        email: lead.email,
        island: lead.island,
        address: lead.address || "",
      }));
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // Create client profile
      const { data: clientProfile, error: profileError } = await db
        .from("client_profiles")
        .insert({
          lead_id: selectedLeadId,
          full_name: formData.full_name,
          dni_nie: formData.dni_nie,
          nationality: formData.nationality,
          birth_date: formData.birth_date || null,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          postal_code: formData.postal_code,
          municipality: formData.municipality,
          island: formData.island,
          property_address: formData.property_address || formData.address,
          property_postal_code: formData.property_postal_code || formData.postal_code,
          property_municipality: formData.property_municipality || formData.municipality,
          catastral_reference: formData.catastral_reference,
          property_type: formData.property_type,
          property_use: formData.property_use,
          property_surface_m2: formData.property_surface_m2 ? parseFloat(formData.property_surface_m2) : null,
          installation_power_kw: formData.installation_power_kw ? parseFloat(formData.installation_power_kw) : null,
          panel_count: formData.panel_count ? parseInt(formData.panel_count) : null,
          panel_model: formData.panel_model,
          panel_power_w: formData.panel_power_w ? parseInt(formData.panel_power_w) : null,
          inverter_model: formData.inverter_model,
          inverter_power_kw: formData.inverter_power_kw ? parseFloat(formData.inverter_power_kw) : null,
          battery_model: formData.battery_model,
          battery_capacity_kwh: formData.battery_capacity_kwh ? parseFloat(formData.battery_capacity_kwh) : null,
          estimated_annual_production_kwh: formData.estimated_annual_production_kwh ? parseFloat(formData.estimated_annual_production_kwh) : null,
          total_cost: formData.total_cost ? parseFloat(formData.total_cost) : null,
          panel_cost: formData.panel_cost ? parseFloat(formData.panel_cost) : null,
          inverter_cost: formData.inverter_cost ? parseFloat(formData.inverter_cost) : null,
          battery_cost: formData.battery_cost ? parseFloat(formData.battery_cost) : null,
          installation_cost: formData.installation_cost ? parseFloat(formData.installation_cost) : null,
          other_costs: formData.other_costs ? parseFloat(formData.other_costs) : null,
          iban: formData.iban,
          bank_name: formData.bank_name,
          account_holder: formData.account_holder || formData.full_name,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      // Calculate requested amount (typically a percentage of total cost)
      const totalCost = formData.total_cost ? parseFloat(formData.total_cost) : 0;
      const requestedAmount = totalCost * 0.5; // 50% subsidy estimate

      // Create subsidy application
      const { data: application, error: appError } = await db
        .from("subsidy_applications")
        .insert({
          lead_id: selectedLeadId,
          client_profile_id: clientProfile.id,
          installer_id: installerId,
          status: "collecting_documents",
          requested_amount: requestedAmount,
        })
        .select()
        .single();

      if (appError) throw appError;

      // Create document entries for all required documents
      const documentTypes = [
        "solicitud_oficial",
        "dni_nie",
        "escrituras",
        "presupuesto",
        "memoria_tecnica",
        "certificado_eficiencia",
      ];

      const documentInserts = documentTypes.map((docType) => ({
        application_id: application.id,
        document_type_id: docType,
        status: "pending",
      }));

      const { error: docsError } = await db
        .from("application_documents")
        .insert(documentInserts);

      if (docsError) throw docsError;

      // Redirect to the application detail page
      router.push(`/installer/subvenciones/${application.id}`);
    } catch (err) {
      console.error("Error creating application:", err);
      setError("Error al crear la solicitud. Por favor, intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      {/* Progress Steps */}
      <div className="bg-white rounded-[20px] p-6 mb-6">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= currentStepIndex
                    ? "bg-[#a7e26e] text-[#222f30]"
                    : "bg-[#f7f7f5] text-[#445e5f]"
                }`}
              >
                {index + 1}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-2 ${
                    index < currentStepIndex ? "bg-[#a7e26e]" : "bg-[#f7f7f5]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-center mt-4 font-medium">
          {STEPS[currentStepIndex].label}
        </p>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-[20px] p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[12px] text-red-700">
            {error}
          </div>
        )}

        {/* Step: Select Lead */}
        {currentStep === "select_lead" && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Selecciona el cliente
              </label>
              <Select
                value={selectedLeadId}
                onChange={(e) => handleLeadSelect(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name} - {lead.email}
                  </option>
                ))}
              </Select>
            </div>

            {selectedLead && (
              <div className="p-4 bg-[#f7f7f5] rounded-[12px]">
                <h4 className="font-medium mb-2">Datos del lead</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p><span className="text-[#445e5f]">Nombre:</span> {selectedLead.name}</p>
                  <p><span className="text-[#445e5f]">Email:</span> {selectedLead.email}</p>
                  <p><span className="text-[#445e5f]">Telefono:</span> {selectedLead.phone}</p>
                  <p><span className="text-[#445e5f]">Isla:</span> {ISLANDS.find(i => i.value === selectedLead.island)?.label}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Personal Data */}
        {currentStep === "personal" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Nombre completo"
                value={formData.full_name}
                onChange={(e) => handleInputChange("full_name", e.target.value)}
                required
              />
              <Input
                label="DNI/NIE"
                value={formData.dni_nie}
                onChange={(e) => handleInputChange("dni_nie", e.target.value)}
                placeholder="12345678A"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Telefono"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
              />
            </div>
            <Input
              label="Direccion fiscal"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              required
            />
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Codigo postal"
                value={formData.postal_code}
                onChange={(e) => handleInputChange("postal_code", e.target.value)}
                required
              />
              <Input
                label="Municipio"
                value={formData.municipality}
                onChange={(e) => handleInputChange("municipality", e.target.value)}
                required
              />
              <Select
                label="Isla"
                value={formData.island}
                onChange={(e) => handleInputChange("island", e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {ISLANDS.map((island) => (
                  <option key={island.value} value={island.value}>
                    {island.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {/* Step: Property */}
        {currentStep === "property" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="same_address"
                className="rounded"
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData((prev) => ({
                      ...prev,
                      property_address: prev.address,
                      property_postal_code: prev.postal_code,
                      property_municipality: prev.municipality,
                    }));
                  }
                }}
              />
              <label htmlFor="same_address" className="text-sm">
                Misma direccion que la fiscal
              </label>
            </div>

            <Input
              label="Direccion del inmueble"
              value={formData.property_address}
              onChange={(e) => handleInputChange("property_address", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Codigo postal"
                value={formData.property_postal_code}
                onChange={(e) => handleInputChange("property_postal_code", e.target.value)}
              />
              <Input
                label="Municipio"
                value={formData.property_municipality}
                onChange={(e) => handleInputChange("property_municipality", e.target.value)}
              />
            </div>
            <Input
              label="Referencia catastral"
              value={formData.catastral_reference}
              onChange={(e) => handleInputChange("catastral_reference", e.target.value)}
              placeholder="1234567AB1234C0001AB"
            />
            <div className="grid grid-cols-3 gap-4">
              <Select
                label="Tipo de inmueble"
                value={formData.property_type}
                onChange={(e) => handleInputChange("property_type", e.target.value)}
              >
                <option value="vivienda">Vivienda</option>
                <option value="local_comercial">Local comercial</option>
                <option value="nave_industrial">Nave industrial</option>
              </Select>
              <Select
                label="Uso"
                value={formData.property_use}
                onChange={(e) => handleInputChange("property_use", e.target.value)}
              >
                <option value="residencial">Residencial</option>
                <option value="comercial">Comercial</option>
                <option value="industrial">Industrial</option>
              </Select>
              <Input
                label="Superficie (m2)"
                type="number"
                value={formData.property_surface_m2}
                onChange={(e) => handleInputChange("property_surface_m2", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step: Installation */}
        {currentStep === "installation" && (
          <div className="space-y-6">
            <h4 className="font-medium text-[#445e5f]">Paneles solares</h4>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Potencia total (kW)"
                type="number"
                step="0.1"
                value={formData.installation_power_kw}
                onChange={(e) => handleInputChange("installation_power_kw", e.target.value)}
              />
              <Input
                label="Numero de paneles"
                type="number"
                value={formData.panel_count}
                onChange={(e) => handleInputChange("panel_count", e.target.value)}
              />
              <Input
                label="Potencia por panel (W)"
                type="number"
                value={formData.panel_power_w}
                onChange={(e) => handleInputChange("panel_power_w", e.target.value)}
              />
            </div>
            <Input
              label="Modelo de panel"
              value={formData.panel_model}
              onChange={(e) => handleInputChange("panel_model", e.target.value)}
              placeholder="Ej: JA Solar JAM54S30-410/MR"
            />

            <h4 className="font-medium text-[#445e5f] pt-4">Inversor</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Modelo de inversor"
                value={formData.inverter_model}
                onChange={(e) => handleInputChange("inverter_model", e.target.value)}
                placeholder="Ej: Huawei SUN2000-5KTL-L1"
              />
              <Input
                label="Potencia inversor (kW)"
                type="number"
                step="0.1"
                value={formData.inverter_power_kw}
                onChange={(e) => handleInputChange("inverter_power_kw", e.target.value)}
              />
            </div>

            <h4 className="font-medium text-[#445e5f] pt-4">Bateria (opcional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Modelo de bateria"
                value={formData.battery_model}
                onChange={(e) => handleInputChange("battery_model", e.target.value)}
                placeholder="Ej: Huawei LUNA2000-5-S0"
              />
              <Input
                label="Capacidad (kWh)"
                type="number"
                step="0.1"
                value={formData.battery_capacity_kwh}
                onChange={(e) => handleInputChange("battery_capacity_kwh", e.target.value)}
              />
            </div>

            <h4 className="font-medium text-[#445e5f] pt-4">Costes</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Coste paneles"
                type="number"
                value={formData.panel_cost}
                onChange={(e) => handleInputChange("panel_cost", e.target.value)}
              />
              <Input
                label="Coste inversor"
                type="number"
                value={formData.inverter_cost}
                onChange={(e) => handleInputChange("inverter_cost", e.target.value)}
              />
              <Input
                label="Coste bateria"
                type="number"
                value={formData.battery_cost}
                onChange={(e) => handleInputChange("battery_cost", e.target.value)}
              />
              <Input
                label="Coste instalacion"
                type="number"
                value={formData.installation_cost}
                onChange={(e) => handleInputChange("installation_cost", e.target.value)}
              />
            </div>
            <Input
              label="Coste total"
              type="number"
              value={formData.total_cost}
              onChange={(e) => handleInputChange("total_cost", e.target.value)}
            />
          </div>
        )}

        {/* Step: Bank */}
        {currentStep === "bank" && (
          <div className="space-y-6">
            <p className="text-sm text-[#445e5f]">
              Datos bancarios para recibir el pago de la subvencion
            </p>
            <Input
              label="IBAN"
              value={formData.iban}
              onChange={(e) => handleInputChange("iban", e.target.value)}
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Nombre del banco"
                value={formData.bank_name}
                onChange={(e) => handleInputChange("bank_name", e.target.value)}
              />
              <Input
                label="Titular de la cuenta"
                value={formData.account_holder}
                onChange={(e) => handleInputChange("account_holder", e.target.value)}
                placeholder={formData.full_name}
              />
            </div>
          </div>
        )}

        {/* Step: Review */}
        {currentStep === "review" && (
          <div className="space-y-6">
            <div className="p-4 bg-[#a7e26e]/20 rounded-[12px]">
              <h4 className="font-medium mb-2">Resumen de la solicitud</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[#445e5f]">Cliente</p>
                  <p className="font-medium">{formData.full_name}</p>
                </div>
                <div>
                  <p className="text-[#445e5f]">DNI/NIE</p>
                  <p className="font-medium">{formData.dni_nie}</p>
                </div>
                <div>
                  <p className="text-[#445e5f]">Potencia instalacion</p>
                  <p className="font-medium">{formData.installation_power_kw} kW</p>
                </div>
                <div>
                  <p className="text-[#445e5f]">Coste total</p>
                  <p className="font-medium">{formData.total_cost} EUR</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#f7f7f5] rounded-[12px]">
              <h4 className="font-medium mb-2">Documentos requeridos</h4>
              <ul className="text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  Solicitud oficial (se generara automaticamente)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  DNI/NIE del solicitante
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  Escrituras de propiedad
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  Presupuesto detallado
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  Memoria tecnica
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  Certificado de eficiencia energetica
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          {currentStepIndex > 0 ? (
            <Button variant="outline" onClick={goPrev}>
              Anterior
            </Button>
          ) : (
            <div />
          )}

          {currentStep === "review" ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Creando..." : "Crear solicitud"}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={currentStep === "select_lead" && !selectedLeadId}
            >
              Siguiente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
