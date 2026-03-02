import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Types for client profile data used in PDF generation
interface ClientProfileData {
  full_name: string;
  dni_nie: string;
  address: string;
  postal_code: string;
  municipality: string;
  island: string;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  catastral_reference: string | null;
  installation_power_kw: number | null;
  panel_count: number | null;
  panel_model: string | null;
  inverter_model: string | null;
  battery_model: string | null;
  battery_capacity_kwh: number | null;
  total_cost: number | null;
  panel_cost: number | null;
  inverter_cost: number | null;
  battery_cost: number | null;
  installation_cost: number | null;
  iban: string | null;
}

interface ApplicationData {
  id: string;
  requested_amount: number | null;
  client_profile_id: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { applicationId, documentId, documentType } = await request.json();

    // Note: These tables need to be created via the migration before this will work
    // For now, we're using type assertions since the tables don't exist yet

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Verify the user has access to this application
    const { data: installerData } = await db
      .from("installers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!installerData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const installerId = installerData.id as string;

    // Get application
    const { data: applicationData, error: appError } = await db
      .from("subsidy_applications")
      .select("*")
      .eq("id", applicationId)
      .eq("installer_id", installerId)
      .single();

    if (appError || !applicationData) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const application = applicationData as ApplicationData;

    // Get client profile
    const { data: profileData, error: profileError } = await db
      .from("client_profiles")
      .select("*")
      .eq("id", application.client_profile_id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json({ error: "Client profile not found" }, { status: 404 });
    }

    const profile = profileData as ClientProfileData;

    let pdfBytes: Uint8Array;

    // Generate the appropriate document based on type
    switch (documentType) {
      case "solicitud_oficial":
        pdfBytes = await generateSolicitudPDF(profile, application);
        break;
      case "presupuesto":
        pdfBytes = await generatePresupuestoPDF(profile, application);
        break;
      default:
        return NextResponse.json(
          { error: "Document type not supported for auto-generation" },
          { status: 400 }
        );
    }

    // Upload the generated PDF to Supabase Storage
    const fileName = `${documentType}_${Date.now()}.pdf`;
    const filePath = `applications/${applicationId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload document" },
        { status: 500 }
      );
    }

    // Update the document record
    const { error: updateError } = await db
      .from("application_documents")
      .update({
        status: "uploaded",
        file_path: filePath,
        file_name: fileName,
        file_size: pdfBytes.length,
        mime_type: "application/pdf",
        is_auto_generated: true,
        generated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update document record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, filePath });
  } catch (error) {
    console.error("Error generating document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function generateSolicitudPDF(
  profile: ClientProfileData,
  application: ApplicationData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { height } = page.getSize();
  let y = height - 50;

  // Title
  page.drawText("SOLICITUD DE SUBVENCION", {
    x: 50,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 30;

  page.drawText("Programa de Incentivos para Instalaciones de Autoconsumo", {
    x: 50,
    y,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 40;

  // Section: Personal Data
  page.drawText("1. DATOS DEL SOLICITANTE", {
    x: 50,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 25;

  const drawField = (label: string, value: string | number | null, x: number, yPos: number) => {
    page.drawText(label, { x, y: yPos, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(String(value || "-"), { x, y: yPos - 12, size: 11, font: fontBold });
  };

  drawField("Nombre completo", profile.full_name, 50, y);
  drawField("DNI/NIE", profile.dni_nie, 350, y);
  y -= 40;

  drawField("Direccion", profile.address, 50, y);
  y -= 40;

  drawField("Codigo Postal", profile.postal_code, 50, y);
  drawField("Municipio", profile.municipality, 200, y);
  drawField("Isla", profile.island, 400, y);
  y -= 40;

  drawField("Telefono", profile.phone, 50, y);
  drawField("Email", profile.email, 300, y);
  y -= 50;

  // Section: Property
  page.drawText("2. DATOS DEL INMUEBLE", {
    x: 50,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 25;

  drawField("Direccion de la instalacion", profile.property_address || profile.address, 50, y);
  y -= 40;

  drawField("Referencia Catastral", profile.catastral_reference, 50, y);
  y -= 50;

  // Section: Installation
  page.drawText("3. DATOS DE LA INSTALACION", {
    x: 50,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 25;

  drawField("Potencia (kW)", profile.installation_power_kw, 50, y);
  drawField("Numero de paneles", profile.panel_count, 200, y);
  drawField("Modelo paneles", profile.panel_model, 350, y);
  y -= 40;

  drawField("Modelo inversor", profile.inverter_model, 50, y);
  if (profile.battery_model) {
    drawField("Bateria", `${profile.battery_model} (${profile.battery_capacity_kwh} kWh)`, 300, y);
  }
  y -= 50;

  // Section: Costs
  page.drawText("4. DATOS ECONOMICOS", {
    x: 50,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 25;

  drawField("Coste total instalacion", profile.total_cost ? `${profile.total_cost.toLocaleString("es-ES")} EUR` : "-", 50, y);
  drawField("Importe solicitado", application.requested_amount ? `${application.requested_amount.toLocaleString("es-ES")} EUR` : "-", 300, y);
  y -= 40;

  drawField("IBAN", profile.iban, 50, y);
  y -= 60;

  // Signature area
  page.drawText("5. FIRMA DEL SOLICITANTE", {
    x: 50,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 25;

  page.drawText(`En _________________, a ____ de _____________ de 20____`, {
    x: 50,
    y,
    size: 11,
    font,
  });
  y -= 60;

  page.drawText("Firma:", { x: 50, y, size: 10, font });
  page.drawRectangle({
    x: 50,
    y: y - 80,
    width: 200,
    height: 70,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1,
  });

  // Footer
  page.drawText(
    `Documento generado automaticamente - ID: ${application.id}`,
    {
      x: 50,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    }
  );

  return pdfDoc.save();
}

async function generatePresupuestoPDF(
  profile: ClientProfileData,
  application: ApplicationData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { height } = page.getSize();
  let y = height - 50;

  // Title
  page.drawText("PRESUPUESTO DETALLADO", {
    x: 50,
    y,
    size: 18,
    font: fontBold,
  });
  y -= 30;

  page.drawText("Instalacion Fotovoltaica de Autoconsumo", {
    x: 50,
    y,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 40;

  // Client Info
  page.drawText("CLIENTE", { x: 50, y, size: 12, font: fontBold });
  y -= 20;
  page.drawText(`${profile.full_name}`, { x: 50, y, size: 11, font });
  y -= 15;
  page.drawText(`${profile.address}`, { x: 50, y, size: 11, font });
  y -= 15;
  page.drawText(`${profile.postal_code} ${profile.municipality}, ${profile.island}`, { x: 50, y, size: 11, font });
  y -= 40;

  // Table header
  page.drawRectangle({
    x: 50,
    y: y - 5,
    width: 495,
    height: 25,
    color: rgb(0.9, 0.9, 0.9),
  });
  page.drawText("CONCEPTO", { x: 60, y: y + 3, size: 10, font: fontBold });
  page.drawText("CANTIDAD", { x: 300, y: y + 3, size: 10, font: fontBold });
  page.drawText("IMPORTE", { x: 450, y: y + 3, size: 10, font: fontBold });
  y -= 30;

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "-";
    return `${amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} EUR`;
  };

  // Items
  const items: { concept: string; quantity: string; amount: number | null }[] = [
    {
      concept: `Paneles solares ${profile.panel_model || ""}`,
      quantity: profile.panel_count ? `${profile.panel_count} uds` : "-",
      amount: profile.panel_cost,
    },
    {
      concept: `Inversor ${profile.inverter_model || ""}`,
      quantity: "1 ud",
      amount: profile.inverter_cost,
    },
  ];

  if (profile.battery_model && profile.battery_cost) {
    items.push({
      concept: `Bateria ${profile.battery_model} (${profile.battery_capacity_kwh} kWh)`,
      quantity: "1 ud",
      amount: profile.battery_cost,
    });
  }

  items.push({
    concept: "Instalacion y mano de obra",
    quantity: "-",
    amount: profile.installation_cost,
  });

  for (const item of items) {
    page.drawText(item.concept, { x: 60, y, size: 10, font });
    page.drawText(item.quantity, { x: 300, y, size: 10, font });
    page.drawText(formatCurrency(item.amount), { x: 450, y, size: 10, font });
    y -= 25;
    page.drawLine({
      start: { x: 50, y: y + 10 },
      end: { x: 545, y: y + 10 },
      color: rgb(0.9, 0.9, 0.9),
      thickness: 1,
    });
  }

  // Total
  y -= 20;
  page.drawRectangle({
    x: 350,
    y: y - 5,
    width: 195,
    height: 30,
    color: rgb(0.65, 0.89, 0.43), // #a7e26e
  });
  page.drawText("TOTAL", { x: 360, y: y + 5, size: 12, font: fontBold });
  page.drawText(formatCurrency(profile.total_cost), {
    x: 450,
    y: y + 5,
    size: 12,
    font: fontBold,
  });
  y -= 60;

  // Installation details
  page.drawText("ESPECIFICACIONES TECNICAS", { x: 50, y, size: 12, font: fontBold });
  y -= 25;

  const specs = [
    `Potencia instalada: ${profile.installation_power_kw || "-"} kWp`,
    `Numero de paneles: ${profile.panel_count || "-"}`,
    `Modelo de panel: ${profile.panel_model || "-"}`,
    `Modelo de inversor: ${profile.inverter_model || "-"}`,
  ];

  if (profile.battery_model) {
    specs.push(`Almacenamiento: ${profile.battery_model} (${profile.battery_capacity_kwh} kWh)`);
  }

  for (const spec of specs) {
    page.drawText(`• ${spec}`, { x: 60, y, size: 10, font });
    y -= 18;
  }

  // Footer
  page.drawText(
    `Presupuesto valido por 30 dias - Generado: ${new Date().toLocaleDateString("es-ES")}`,
    {
      x: 50,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    }
  );

  return pdfDoc.save();
}
