import { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { LeadForm } from "@/components/forms";

export const metadata: Metadata = {
  title: "Solicitar presupuesto - Aureon",
  description:
    "Solicita tu presupuesto gratuito para instalacion solar. Sin compromiso.",
};

export default function SolicitarPage() {
  return (
    <>
      <Header />
      <main className="pt-32 pb-20 bg-[var(--color-bg)] min-h-screen">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            {/* Breadcrumb */}
            <nav className="mb-8">
              <Link
                href="/"
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                ← Volver al inicio
              </Link>
            </nav>

            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-[clamp(2rem,5vw,3rem)] font-light tracking-[-0.03em] mb-4">
                Solicita tu presupuesto
              </h1>
              <p className="text-lg text-[var(--color-text-muted)]">
                Completa el formulario y te contactaremos en menos de 24 horas
                con un estudio personalizado.
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-[var(--radius-xl)] p-8 md:p-12 shadow-[0_20px_60px_rgba(34,47,48,0.1)]">
              <LeadForm />
            </div>

            {/* Trust Badges */}
            <div className="mt-12 grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-semibold text-[var(--color-accent)] mb-2">
                  24h
                </div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  Respuesta garantizada
                </div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-[var(--color-accent)] mb-2">
                  100%
                </div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  Gratuito
                </div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-[var(--color-accent)] mb-2">
                  Sin
                </div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  Compromiso
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
