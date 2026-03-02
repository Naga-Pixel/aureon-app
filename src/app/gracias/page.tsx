import { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/layout";

export const metadata: Metadata = {
  title: "Gracias - Aureon",
  description: "Hemos recibido tu solicitud correctamente.",
};

export default function GraciasPage() {
  return (
    <>
      <Header />
      <main className="pt-32 pb-20 bg-[var(--color-bg)] min-h-screen flex items-center">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            {/* Success Icon */}
            <div className="w-24 h-24 mx-auto mb-8 bg-[var(--color-accent)] rounded-full flex items-center justify-center">
              <svg
                className="w-12 h-12 text-[var(--color-primary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            {/* Content */}
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-light tracking-[-0.03em] mb-6">
              ¡Gracias por tu solicitud!
            </h1>
            <p className="text-xl text-[var(--color-text-muted)] mb-8 leading-relaxed">
              Hemos recibido tu informacion correctamente. Uno de nuestros
              expertos en energia solar se pondra en contacto contigo en las
              proximas 24 horas.
            </p>

            {/* What's Next */}
            <div className="bg-white rounded-[var(--radius-xl)] p-8 md:p-10 text-left mb-10 shadow-[0_20px_60px_rgba(34,47,48,0.1)]">
              <h2 className="text-lg font-medium mb-6">
                ¿Que pasara a continuacion?
              </h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-[var(--color-accent)]/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-[var(--color-primary)]">
                      1
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium">Revision de tu solicitud</h3>
                    <p className="text-[var(--color-text-muted)] text-sm">
                      Nuestro equipo analizara tus datos para preparar un
                      estudio personalizado.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-[var(--color-accent)]/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-[var(--color-primary)]">
                      2
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium">Contacto telefonico</h3>
                    <p className="text-[var(--color-text-muted)] text-sm">
                      Te llamaremos para resolver cualquier duda y agendar una
                      visita tecnica si es necesario.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-[var(--color-accent)]/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-[var(--color-primary)]">
                      3
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium">Propuesta detallada</h3>
                    <p className="text-[var(--color-text-muted)] text-sm">
                      Recibiras un presupuesto completo con todas las opciones
                      de financiacion y subvenciones disponibles.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[var(--color-primary)] font-medium hover:text-[var(--color-accent)] transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
