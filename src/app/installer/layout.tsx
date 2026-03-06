import { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/installer";

export const metadata: Metadata = {
  title: "Panel de instaladores - Aureon",
  description: "Gestiona tus leads de energia solar.",
};

export default async function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let installer: { contact_name: string; company_name: string; role: string } | null = null;
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("installers")
      .select("contact_name, company_name, role")
      .eq("user_id", user.id)
      .single();
    installer = data;
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <Sidebar
        installerName={installer?.contact_name}
        companyName={installer?.company_name}
        isAdmin={installer?.role === "admin"}
      />
      <main className="ml-64 p-8">{children}</main>
    </div>
  );
}
