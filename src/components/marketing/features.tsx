"use client";

import { useEffect, useRef } from "react";

const features = [
  {
    number: "01",
    title: "Ahorro inmediato",
    description: "Reduce tu factura electrica hasta un 80% desde el primer mes.",
    variant: "green" as const,
  },
  {
    number: "02",
    title: "Subvenciones",
    description:
      "Hasta el 80% del coste cubierto por el Gobierno de Canarias.",
    variant: "dark" as const,
  },
  {
    number: "03",
    title: "Sin compromiso",
    description: "Estudio tecnico y economico gratuito para tu empresa.",
    variant: "light" as const,
  },
];

export function Features() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    const fadeElements =
      sectionRef.current?.querySelectorAll(".fade-up") || [];
    fadeElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-24 md:py-36 bg-[var(--color-bg)]"
      id="servicios"
    >
      <div className="container">
        <div className="text-center mb-16 md:mb-20">
          <span className="inline-block px-4 py-2 text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)] bg-white rounded-full mb-6">
            Beneficios
          </span>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-light tracking-[-0.03em] fade-up">
            ¿Por que elegir energia solar?
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.number}
              className={`fade-up stagger-${index + 1} rounded-[var(--radius-xl)] p-8 md:p-10 min-h-[400px] flex flex-col ${
                feature.variant === "green"
                  ? "bg-[var(--color-accent)]"
                  : feature.variant === "dark"
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-white"
              }`}
            >
              <span
                className={`text-sm font-mono ${
                  feature.variant === "dark"
                    ? "text-white/50"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                {feature.number}.
              </span>

              <div className="flex-1 flex items-center justify-center py-8">
                <SunIcon
                  className={`w-24 h-24 ${
                    feature.variant === "dark"
                      ? "text-white/30"
                      : feature.variant === "green"
                      ? "text-[var(--color-primary)]/20"
                      : "text-[var(--color-accent)]"
                  }`}
                />
              </div>

              <div>
                <h3
                  className={`text-xl font-medium mb-3 ${
                    feature.variant === "dark" ? "text-white" : ""
                  }`}
                >
                  {feature.title}
                </h3>
                <p
                  className={
                    feature.variant === "dark"
                      ? "text-white/70"
                      : "text-[var(--color-text-muted)]"
                  }
                >
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 114 114"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeMiterlimit="10">
        <path d="M51.326 108.653V67.592M39.905 107.366l9.137-40.032M29.058 103.571l17.815-36.995M19.324 97.456l25.601-32.103M11.198 89.328 43.3 63.727M5.083 79.596 42.078 61.78M1.287 68.747l40.032-9.137M0 57.327H41.06M1.287 45.906l40.032 9.137M5.083 35.057l36.995 17.816M11.198 25.325l32.103 25.601M19.325 17.198l25.601 32.103M29.056 11.083l17.816 36.995M39.905 7.287l9.137 40.031M51.327 6v41.061M62.748 7.287 53.61 47.318M73.596 11.082 55.78 48.078M83.329 17.198 57.727 49.3M91.455 25.325 59.352 50.926M97.57 35.057 60.577 52.873M101.366 45.905l-40.032 9.137M102.653 57.327H61.592M101.367 68.748 61.335 59.61M97.57 79.596 60.575 61.78M91.455 89.328l-32.103-25.6M83.327 97.455 57.726 65.352M73.597 103.571 55.781 66.576M62.749 107.366l-9.137-40.032" />
      </g>
    </svg>
  );
}
