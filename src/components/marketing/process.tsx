"use client";

import { useEffect, useRef } from "react";

const steps = [
  {
    number: 1,
    title: "Consulta inicial",
    description:
      "Analizamos tu consumo electrico actual y las caracteristicas de tu instalacion.",
  },
  {
    number: 2,
    title: "Diseno personalizado",
    description:
      "Creamos un proyecto a medida con el maximo rendimiento para tu empresa.",
  },
  {
    number: 3,
    title: "Gestion de subvenciones",
    description:
      "Nos encargamos de toda la tramitacion para maximizar tu ahorro.",
  },
  {
    number: 4,
    title: "Instalacion profesional",
    description:
      "Equipo tecnico certificado con garantia completa de la instalacion.",
  },
];

export function Process() {
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
      className="py-24 md:py-36 bg-[var(--color-primary)] text-white"
    >
      <div className="container">
        <div className="text-center mb-16 md:mb-20">
          <span className="inline-block px-4 py-2 text-xs font-mono uppercase tracking-wider text-white/50 bg-white/10 rounded-full mb-6">
            Proceso
          </span>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-light tracking-[-0.03em] fade-up">
            Como trabajamos
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className={`fade-up stagger-${index + 1} text-center group`}
            >
              <div className="w-16 h-16 mx-auto mb-7 bg-[var(--color-accent)] text-[var(--color-primary)] rounded-full flex items-center justify-center text-xl font-semibold transition-transform duration-300 group-hover:scale-110 group-hover:shadow-[0_10px_40px_rgba(167,226,110,0.4)]">
                {step.number}
              </div>
              <h3 className="text-xl font-medium mb-3">{step.title}</h3>
              <p className="text-white/70 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
