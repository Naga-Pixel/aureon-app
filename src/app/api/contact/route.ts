import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  message: string;
  interest: "empresa" | "vecino" | "otro";
}

export async function POST(request: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const body: ContactFormData = await request.json();

    // Validate required fields
    if (!body.name || !body.email || !body.message) {
      return NextResponse.json(
        { error: "Nombre, email y mensaje son obligatorios" },
        { status: 400 }
      );
    }

    // Map interest to Spanish
    const interestLabel = {
      empresa: "Empresa",
      vecino: "Vecino",
      otro: "Otro",
    }[body.interest];

    // Send email using Resend
    const { error } = await resend.emails.send({
      from: "Aureon <contacto@aureon.bio>",
      to: ["andrea@aureon.bio"],
      replyTo: body.email,
      subject: `[Comunidad Energética] Nuevo contacto de ${body.name}`,
      html: `
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${body.name}</p>
        <p><strong>Email:</strong> ${body.email}</p>
        <p><strong>Teléfono:</strong> ${body.phone || "No proporcionado"}</p>
        <p><strong>Interesado como:</strong> ${interestLabel}</p>
        <hr />
        <h3>Mensaje:</h3>
        <p>${body.message.replace(/\n/g, "<br />")}</p>
      `,
      text: `
Nuevo mensaje de contacto

Nombre: ${body.name}
Email: ${body.email}
Teléfono: ${body.phone || "No proporcionado"}
Interesado como: ${interestLabel}

Mensaje:
${body.message}
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Error al enviar el mensaje" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
