import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leadFormSchema } from "@/lib/validations/lead";
import type { LeadInsert } from "@/lib/supabase/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate the request body
    const validationResult = leadFormSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Create Supabase client
    const supabase = await createClient();

    // Prepare lead data
    const leadData: LeadInsert = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address || null,
      property_type: data.property_type,
      island: data.island,
      roof_type: data.roof_type,
      installation_timeline: data.installation_timeline,
      monthly_bill: data.monthly_bill,
      estimated_savings_monthly: data.estimated_savings_monthly || null,
      estimated_savings_annual: data.estimated_savings_annual || null,
      estimated_subsidy: data.estimated_subsidy || null,
      status: "new",
    };

    // Insert lead into database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error } = await (supabase as any)
      .from("leads")
      .insert(leadData)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Error al guardar el lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
