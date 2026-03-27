"use client";

import { useEffect, useRef } from "react";

const benefits = [
  {
    number: "01",
    title: "Para Empresas",
    subtitle: "Convierta su cubierta en un activo estratégico",
    description:
      "Su tejado es actualmente un recurso desaprovechado que podría ser su herramienta más potente para la optimización fiscal y la independencia energética. Al liderar una Comunidad Energética Boutique no solo reduce sus facturas de electricidad a cero sino que activa todo el potencial de la Reserva para Inversiones en Canarias (RIC) transformando obligaciones fiscales en un activo físico de alto rendimiento. Con los incentivos de 2026 que cubren hasta el 95% de los impuestos municipales (ICIO) y proporcionan importantes bonificaciones en el IBI, el proyecto se amortiza en un tiempo récord. Transforme su negocio de un consumidor tradicional a un núcleo energético vecinal asegurando su ventaja competitiva en la economía verde mientras genera una lealtad profunda con la comunidad que rodea sus instalaciones.",
    variant: "dark" as const,
    icon: "building",
  },
  {
    number: "02",
    title: "Para Vecinos",
    subtitle: "La forma más inteligente de iluminar su hogar",
    description:
      "Imagine no tener que preocuparse nunca más por las subidas en el precio de la electricidad. Al unirse a nuestra exclusiva comunidad energética local obtendrá acceso a energía solar de kilómetro cero generada directamente en su barrio. Esto no trata solo de ahorrar en su factura mensual sino de una estrategia financiera completa. Al integrar una batería doméstica en la red comunitaria podrá optar a subvenciones directas de hasta 490 euros por kWh y a una deducción de entre el 40% y el 60% en su IRPF. Usted aporta el almacenamiento y la comunidad aporta el sol para crear juntos una red eléctrica resiliente e independiente que protege su hogar contra apagones y reduce sus impuestos sobre bienes inmuebles durante años. No se limite a pagar por la energía y empiece a ser dueño de su futuro energético.",
    variant: "green" as const,
    icon: "home",
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
    const strokeColor = variant === "dark" ? "white" : "#222f30";

    if (icon === "building") {
      return <BuildingIcon stroke={strokeColor} />;
    }
    return <HomeIcon stroke={strokeColor} />;
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
              <div className="mt-auto">
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
                  className={`text-base leading-[1.7] ${
                    benefit.variant === "dark"
                      ? "opacity-80"
                      : "opacity-80"
                  }`}
                >
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BuildingIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeWidth="2" strokeMiterlimit="10" fill="none">
        <rect x="10" y="20" width="35" height="75" />
        <rect x="55" y="40" width="35" height="55" />
        <rect x="18" y="30" width="8" height="10" />
        <rect x="30" y="30" width="8" height="10" />
        <rect x="18" y="48" width="8" height="10" />
        <rect x="30" y="48" width="8" height="10" />
        <rect x="18" y="66" width="8" height="10" />
        <rect x="30" y="66" width="8" height="10" />
        <rect x="63" y="50" width="8" height="10" />
        <rect x="78" y="50" width="8" height="10" />
        <rect x="63" y="68" width="8" height="10" />
        <rect x="78" y="68" width="8" height="10" />
        <path d="M27.5 5 L10 20 L45 20 Z" />
        <line x1="27.5" y1="5" x2="72.5" y2="5" />
        <path d="M72.5 5 L55 40 L90 40 Z" />
      </g>
    </svg>
  );
}

function HomeIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeWidth="2" strokeMiterlimit="10" fill="none">
        <path d="M50 8 L10 40 L10 92 L90 92 L90 40 Z" />
        <path d="M5 42 L50 5 L95 42" />
        <rect x="38" y="60" width="24" height="32" />
        <rect x="20" y="50" width="14" height="14" />
        <rect x="66" y="50" width="14" height="14" />
        <circle cx="50" cy="25" r="8" />
        <line x1="50" y1="17" x2="50" y2="12" />
        <line x1="50" y1="33" x2="50" y2="38" />
        <line x1="42" y1="25" x2="37" y2="25" />
        <line x1="58" y1="25" x2="63" y2="25" />
      </g>
    </svg>
  );
}
