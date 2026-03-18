"use client";

import { useEffect, useRef } from "react";

const features = [
  {
    number: "01",
    title: "Ahorro inmediato",
    description: "Reduce tu factura eléctrica hasta un 80% desde el primer mes.",
    variant: "green" as const,
    icon: "sun",
  },
  {
    number: "02",
    title: "Subvenciones",
    description: "Hasta el 80% del coste cubierto por el Gobierno de Canarias.",
    variant: "dark" as const,
    icon: "hexagon",
  },
  {
    number: "03",
    title: "Sin compromiso",
    description: "Estudio técnico y económico gratuito para tu empresa.",
    variant: "light" as const,
    icon: "geometric",
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

  const getIcon = (icon: string, variant: string) => {
    const strokeColor = variant === "dark" ? "white" : "#222f30";

    if (icon === "sun") {
      return <SunIcon stroke={strokeColor} />;
    }
    if (icon === "hexagon") {
      return <HexagonIcon stroke={strokeColor} />;
    }
    return <GeometricIcon stroke={strokeColor} />;
  };

  return (
    <section
      ref={sectionRef}
      className="py-[140px] bg-[#f7f7f5]"
    >
      <div className="container">
        {/* Header */}
        <div className="mb-[72px]">
          <span className="inline-flex items-center gap-3 bg-white px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase mb-10">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Beneficios
          </span>
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-normal tracking-[-0.03em] leading-[1.1] fade-up">
            ¿Por qué elegir energía solar?
          </h2>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <div
              key={feature.number}
              className={`fade-up stagger-${index + 1} relative rounded-[20px] p-8 min-h-[400px] flex flex-col overflow-hidden ${
                feature.variant === "green"
                  ? "bg-[#a7e26e] text-[#222f30]"
                  : feature.variant === "dark"
                  ? "bg-[#222f30] text-white"
                  : "bg-[#e8e8e6] text-[#222f30]"
              }`}
            >
              {/* Number */}
              <span
                className={`absolute top-8 right-8 font-mono text-sm ${
                  feature.variant === "dark"
                    ? "text-white/50"
                    : "text-[#222f30]/50"
                }`}
              >
                {feature.number}.
              </span>

              {/* Icon */}
              <div className="w-[100px] h-[100px] mb-auto">
                {getIcon(feature.icon, feature.variant)}
              </div>

              {/* Content */}
              <div className="mt-auto">
                <h3 className="text-2xl font-medium mb-3 tracking-[-0.02em]">
                  {feature.title}
                </h3>
                <p
                  className={`text-base leading-[1.6] ${
                    feature.variant === "dark"
                      ? "opacity-80"
                      : "opacity-80"
                  }`}
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

function SunIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 114 114"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeMiterlimit="10">
        <path d="M51.326 108.653V67.592M39.905 107.366l9.137-40.032M29.058 103.571l17.815-36.995M19.324 97.456l25.601-32.103M11.198 89.328 43.3 63.727M5.083 79.596 42.078 61.78M1.287 68.747l40.032-9.137M0 57.327H41.06M1.287 45.906l40.032 9.137M5.083 35.057l36.995 17.816M11.198 25.325l32.103 25.601M19.325 17.198l25.601 32.103M29.056 11.083l17.816 36.995M39.905 7.287l9.137 40.031M51.327 6v41.061M62.748 7.287 53.61 47.318M73.596 11.082 55.78 48.078M83.329 17.198 57.727 49.3M91.455 25.325 59.352 50.926M97.57 35.057 60.577 52.873M101.366 45.905l-40.032 9.137M102.653 57.327H61.592M101.367 68.748 61.335 59.61M97.57 79.596 60.575 61.78M91.455 89.328l-32.103-25.6M83.327 97.455 57.726 65.352M73.597 103.571 55.781 66.576M62.749 107.366l-9.137-40.032" />
      </g>
    </svg>
  );
}

function HexagonIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 122.54 100.51"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeMiterlimit="10" fill="none">
        <polyline points="35.86 21.05 92.32 21.05 121.83 50.56 72.38 100.01 50.16 100.01 .71 50.56 30.21 21.05 92.03 21.05"/>
        <polyline points="35.86 11.23 92.32 11.23 121.83 40.73 72.38 90.18 50.16 90.18 .71 40.73 30.21 11.23 92.03 11.23"/>
        <polyline points="35.86 .5 92.32 .5 121.83 30.01 72.38 79.46 50.16 79.46 .71 30.01 30.21 .5 92.03 .5"/>
      </g>
    </svg>
  );
}

function GeometricIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="-8 -9 102 116"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeMiterlimit="10" fill="none">
        <path d="M43.3,2l41.57,72H1.73L43.3,2M43.3,0L0,75h86.6L43.3,0h0Z"/>
        <path d="M43.3,25.64l41.57,72H1.73L43.3,25.64M43.3,23.64L0,98.64h86.6L43.3,23.64h0Z"/>
      </g>
    </svg>
  );
}
