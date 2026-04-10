import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Quick lead creation endpoint - minimal fields required
 * Used by prospecting tool to create leads with just name
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Only name is required
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
      return NextResponse.json(
        { error: "Nombre es requerido (mínimo 2 caracteres)" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Insert lead with minimal data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error } = await (supabase as any)
      .from("leads")
      .insert({
        name: body.name.trim(),
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        source: body.source || 'prospecting_tool',
        status: "new",
      })
      .select('id')
      .single();

    if (error) {
      console.error("[leads/quick] Supabase error:", error);
      return NextResponse.json(
        { error: "Error al crear el lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: lead.id }, { status: 201 });
  } catch (error) {
    console.error("[leads/quick] API error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
