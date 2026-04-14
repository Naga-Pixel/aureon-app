import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("installer_locations")
      .select("id, name, address, phone, email, website, lat, lon, island")
      .eq("is_active", true);

    if (error) {
      console.error("[installer-locations] Error:", error);
      return NextResponse.json({ error: "Error fetching locations" }, { status: 500 });
    }

    return NextResponse.json({ locations: data });
  } catch (error) {
    console.error("[installer-locations] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
