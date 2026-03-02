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
    <main className="min-h-screen bg-[var(--color-primary)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/">
            <Logo className="h-8 mx-auto text-white" />
          </Link>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-[var(--radius-xl)] p-8 md:p-10 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium mb-2">Panel de instaladores</h1>
            <p className="text-[var(--color-text-muted)]">
              Accede para gestionar tus leads
            </p>
          </div>

          <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-lg" />}>
            <LoginForm />
          </Suspense>

          <div className="mt-8 pt-6 border-t border-[var(--color-border)] text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              ¿Problemas para acceder?{" "}
              <a
                href="mailto:soporte@aureon.es"
                className="text-[var(--color-primary)] hover:text-[var(--color-accent)] transition-colors"
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
            className="text-white/70 hover:text-white text-sm transition-colors"
          >
            ← Volver a la web
          </Link>
        </div>
      </div>
    </main>
  );
}
