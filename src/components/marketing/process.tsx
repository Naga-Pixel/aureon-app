"use client";

import { useEffect, useRef } from "react";

const steps = [
  {
    number: 1,
    title: "Consulta inicial",
    description:
      "Analizamos tu consumo eléctrico actual y las características de tu instalación.",
  },
  {
    number: 2,
    title: "Diseño personalizado",
    description:
      "Creamos un proyecto a medida con el máximo rendimiento para tu empresa.",
  },
  {
    number: 3,
    title: "Gestión de subvenciones",
    description:
      "Nos encargamos de toda la tramitación para maximizar tu ahorro.",
  },
  {
    number: 4,
    title: "Instalación profesional",
    description:
      "Equipo técnico certificado con garantía completa de la instalación.",
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
      className="py-[140px] bg-[#222f30] text-white rounded-t-[40px] -mt-10 relative z-[2]"
    >
      <div className="container">
        {/* Header */}
        <div className="mb-[72px]">
          <span className="inline-flex items-center gap-3 bg-white/10 px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase mb-10">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Proceso
          </span>
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-normal tracking-[-0.03em] leading-[1.1] fade-up">
            Cómo trabajamos
          </h2>
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8 mt-[72px]">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className={`fade-up stagger-${index + 1} text-center group relative`}
            >
              {/* Connecting Line (not on last item) */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-7 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-[#a7e26e] to-white/20" />
              )}

              {/* Number Circle */}
              <div className="w-14 h-14 mx-auto mb-7 bg-[#a7e26e] text-[#222f30] rounded-full flex items-center justify-center text-xl font-semibold transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_10px_40px_rgba(167,226,110,0.4)]">
                {step.number}
              </div>

              {/* Content */}
              <h3 className="text-xl font-medium mb-3">{step.title}</h3>
              <p className="text-white/70 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
