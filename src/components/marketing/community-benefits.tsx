"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const benefits = [
  {
    number: "01",
    title: "Para Empresas",
    subtitle: "Convierta su cubierta en un activo estratégico",
    description:
      "Su tejado es actualmente un recurso desaprovechado que podría ser su herramienta más potente para la optimización fiscal y la independencia energética. Al liderar una Comunidad Energética Boutique no solo reduce sus facturas de electricidad a cero sino que activa todo el potencial de la Reserva para Inversiones en Canarias (RIC) transformando obligaciones fiscales en un activo físico de alto rendimiento. Con los incentivos de 2026 que cubren hasta el 95% de los impuestos municipales (ICIO) y proporcionan importantes bonificaciones en el IBI, el proyecto se amortiza en un tiempo récord. Transforme su negocio de un consumidor tradicional a un núcleo energético vecinal asegurando su ventaja competitiva en la economía verde mientras genera una lealtad profunda con la comunidad que rodea sus instalaciones.",
    variant: "dark" as const,
    icon: "energy",
  },
  {
    number: "02",
    title: "Para Vecinos",
    subtitle: "La forma más inteligente de iluminar su hogar",
    description:
      "Imagine no tener que preocuparse nunca más por las subidas en el precio de la electricidad. Al unirse a nuestra exclusiva comunidad energética local obtendrá acceso a energía solar de kilómetro cero generada directamente en su barrio. Esto no trata solo de ahorrar en su factura mensual sino de una estrategia financiera completa. Al integrar una batería doméstica en la red comunitaria podrá optar a subvenciones directas de hasta 490 euros por kWh y a una deducción de entre el 40% y el 60% en su IRPF. Usted aporta el almacenamiento y la comunidad aporta el sol para crear juntos una red eléctrica resiliente e independiente que protege su hogar contra apagones y reduce sus impuestos sobre bienes inmuebles durante años. No se limite a pagar por la energía y empiece a ser dueño de su futuro energético.",
    variant: "green" as const,
    icon: "community",
  },
];

export function CommunityBenefits() {
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

  const getIcon = (icon: string, variant: string) => {
    const fillColor = variant === "dark" ? "white" : "#222f30";

    if (icon === "energy") {
      return <EnergyIcon fill={fillColor} />;
    }
    return <CommunityIcon fill={fillColor} />;
  };

  return (
    <section
      ref={sectionRef}
      className="py-[140px] bg-[#f7f7f5]"
      id="comunidad"
    >
      <div className="container">
        {/* Header */}
        <div className="mb-[72px]">
          <span className="inline-flex items-center gap-3 bg-white px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase mb-10">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Comunidad Energética
          </span>
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-normal tracking-[-0.03em] leading-[1.1] fade-up">
            Beneficios para todos
          </h2>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {benefits.map((benefit, index) => (
            <div
              key={benefit.number}
              className={`fade-up stagger-${index + 1} relative rounded-[20px] p-8 md:p-10 min-h-[500px] flex flex-col overflow-hidden ${
                benefit.variant === "green"
                  ? "bg-[#a7e26e] text-[#222f30]"
                  : "bg-[#222f30] text-white"
              }`}
            >
              {/* Number */}
              <span
                className={`absolute top-8 right-8 font-mono text-sm ${
                  benefit.variant === "dark"
                    ? "text-white/50"
                    : "text-[#222f30]/50"
                }`}
              >
                {benefit.number}.
              </span>

              {/* Icon */}
              <div className="w-[80px] h-[80px] mb-8">
                {getIcon(benefit.icon, benefit.variant)}
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col">
                <h3 className="text-2xl font-medium mb-2 tracking-[-0.02em]">
                  {benefit.title}
                </h3>
                <p
                  className={`text-lg font-medium mb-4 ${
                    benefit.variant === "dark"
                      ? "text-[#a7e26e]"
                      : "text-[#222f30]"
                  }`}
                >
                  {benefit.subtitle}
                </p>
                <p
                  className={`text-base leading-[1.7] mb-8 ${
                    benefit.variant === "dark"
                      ? "opacity-80"
                      : "opacity-80"
                  }`}
                >
                  {benefit.description}
                </p>

                {/* CTA */}
                <div className="mt-auto">
                  <Link
                    href="/solicitar"
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-[12px] font-mono text-sm uppercase transition-all duration-300 ${
                      benefit.variant === "dark"
                        ? "bg-[#a7e26e] text-[#222f30] hover:bg-white"
                        : "bg-[#222f30] text-white hover:bg-[#1a2526]"
                    }`}
                  >
                    Contacto
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M7.703 5.8H.398V4.6h7.305l-3.36-3.36.855-.84 4.8 4.8-4.8 4.8-.855-.84 3.36-3.36Z"
                        fill="currentColor"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EnergyIcon({ fill }: { fill: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 73.79 88.39"
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <g>
          <path d="M18.42,3.97l21.66,40.23-21.66,40.23V3.97M17.42,0v88.39l23.79-44.2L17.42,0h0Z"/>
          <path d="M27.13,3.97l21.66,40.23-21.66,40.23V3.97M26.13,0v88.39l23.79-44.2L26.13,0h0Z"/>
          <path d="M1,3.97l21.66,40.23L1,84.42V3.97M0,0v88.39l23.79-44.2L0,0h0Z"/>
          <path d="M9.71,3.97l21.66,40.23-21.66,40.23V3.97M8.71,0v88.39l23.79-44.2L8.71,0h0Z"/>
        </g>
        <g>
          <path d="M55.37,3.97v80.46l-21.66-40.23L55.37,3.97M56.37,0l-23.79,44.2,23.79,44.2V0h0Z"/>
          <path d="M46.66,3.97v80.46l-21.66-40.23L46.66,3.97M47.66,0l-23.79,44.2,23.79,44.2V0h0Z"/>
          <path d="M72.79,3.97v80.46l-21.66-40.23L72.79,3.97M73.79,0l-23.79,44.2,23.79,44.2V0h0Z"/>
          <path d="M64.08,3.97v80.46l-21.66-40.23L64.08,3.97M65.08,0l-23.79,44.2,23.79,44.2V0h0Z"/>
        </g>
      </g>
    </svg>
  );
}

function CommunityIcon({ fill }: { fill: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 93.32 85.47"
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <path d="M44.83,0v1c7.25,0,14.16,2.31,19.97,6.67,14.71,11.03,17.7,31.97,6.67,46.68-6.36,8.48-16.09,13.34-26.7,13.34-7.25,0-14.16-2.31-19.98-6.67-14.71-11.03-17.7-31.97-6.67-46.68C24.49,5.86,34.22,1,44.83,1V0M44.83,0c-10.44,0-20.76,4.75-27.5,13.74-11.38,15.18-8.3,36.7,6.87,48.08,6.18,4.63,13.41,6.87,20.58,6.87,10.44,0,20.76-4.75,27.5-13.74,11.38-15.18,8.3-36.7-6.87-48.08C59.23,2.24,52,0,44.83,0h0Z"/>
        <path d="M34.37,16.78v1h0c7.25,0,14.16,2.31,19.97,6.67,7.13,5.34,11.74,13.14,13,21.96,1.26,8.82-.99,17.6-6.33,24.72-6.36,8.48-16.09,13.34-26.7,13.34-7.25,0-14.16-2.31-19.98-6.67-7.13-5.34-11.74-13.14-13-21.96s.99-17.6,6.33-24.72c6.36-8.48,16.09-13.34,26.7-13.34v-1M34.37,16.78c-10.44,0-20.76,4.75-27.5,13.74-11.38,15.18-8.3,36.7,6.87,48.08,6.18,4.63,13.41,6.87,20.58,6.87,10.44,0,20.76-4.75,27.5-13.74,11.38-15.18,8.3-36.7-6.87-48.08-6.18-4.63-13.41-6.87-20.58-6.87h0Z"/>
        <path d="M59,16.65v1c7.25,0,14.16,2.31,19.97,6.67,7.13,5.34,11.74,13.14,13,21.96s-.99,17.6-6.33,24.72c-6.36,8.48-16.09,13.34-26.7,13.34-7.25,0-14.16-2.31-19.98-6.67-7.13-5.34-11.74-13.14-13-21.96s.99-17.6,6.33-24.72c6.36-8.48,16.09-13.34,26.7-13.34v-1M59,16.65c-10.44,0-20.76,4.75-27.5,13.74-11.38,15.18-8.3,36.7,6.87,48.08,6.18,4.63,13.41,6.87,20.58,6.87,10.44,0,20.76-4.75,27.5-13.74,11.38-15.18,8.3-36.7-6.87-48.08-6.18-4.63-13.41-6.87-20.58-6.87h0Z"/>
      </g>
    </svg>
  );
}
