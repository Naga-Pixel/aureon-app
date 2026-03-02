import { Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/layout";
import { LoginForm } from "@/components/forms/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesion - Aureon",
  description: "Accede al panel de instaladores de Aureon.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#222f30] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/">
            <Logo className="h-8 mx-auto text-[#ffffff]" />
          </Link>
        </div>

        {/* Login Card */}
        <div className="bg-[#ffffff] rounded-[32px] p-8 md:p-10 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium mb-2">Panel de instaladores</h1>
            <p className="text-[#445e5f]">
              Accede para gestionar tus leads
            </p>
          </div>

          <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-lg" />}>
            <LoginForm />
          </Suspense>

          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-[#445e5f]">
              ¿Problemas para acceder?{" "}
              <a
                href="mailto:soporte@aureon.es"
                className="text-[#222f30] hover:text-[#a7e26e] transition-colors"
              >
                Contacta con soporte
              </a>
            </p>
          </div>
        </div>

        {/* Back to home */}
        <div className="text-center mt-8">
          <Link
            href="/"
            className="text-[#ffffff]/70 hover:text-[#ffffff] text-sm transition-colors"
          >
            ← Volver a la web
          </Link>
        </div>
      </div>
    </main>
  );
}
