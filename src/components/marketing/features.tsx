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
      viewBox="0 0 115 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeMiterlimit="10">
        <path d="m102.347 78.237v-41.9c0-5.14-2.742-9.89-7.194-12.46l-36.286-20.95a14.387 14.387 0 0 0 -14.387 0l-36.286 20.951a14.388 14.388 0 0 0 -7.194 12.459v41.9c0 5.14 2.742 9.89 7.194 12.46l36.286 20.949a14.388 14.388 0 0 0 14.387 0l36.286-20.95a14.388 14.388 0 0 0 7.194-12.46z"/>
        <path d="m11.86 32.084c-3.562 2.056-5.756 6.588-5.756 10.7v35.552c0 4.112 2.194 8.64 5.755 10.696l31.256 18.046c3.561 2.056 8.747 2.517 12.308.461l32.054-18.507c3.56-2.056 5.755-6.588 5.755-10.7v-35.552c0-4.112-2.194-8.64-5.755-10.696l-32.054-18.506c-3.561-2.056-8.747-1.595-12.308.46l-31.255 18.047z"/>
        <path d="m15.525 40.291c-2.67 1.543-4.316 5.857-4.316 8.941v29.204c0 3.085 1.645 7.39 4.316 8.933l26.226 15.141c2.67 1.542 7.557 2.463 10.228.921l27.821-16.063c2.671-1.541 4.316-5.856 4.316-8.94v-29.205c0-3.084-1.645-7.39-4.316-8.932l-27.82-16.061c-2.671-1.542-7.557-.621-10.228.921z"/>
        <path d="m19.19 48.499c-1.78 1.028-2.877 5.124-2.877 7.18v22.858c0 2.056 1.097 6.14 2.878 7.168l21.195 12.237c1.78 1.028 6.368 2.41 8.149 1.382l23.589-13.62c1.78-1.026 2.876-5.124 2.876-7.179v-22.858c0-2.056-1.097-6.14-2.877-7.169l-23.589-13.618c-1.78-1.029-6.367.353-8.148 1.381l-21.195 12.239z"/>
        <path d="m22.856 56.706c-.89.514-1.439 4.393-1.439 5.421v16.51c0 1.028.549 4.89 1.44 5.404l16.165 9.333c.89.514 5.178 2.356 6.068 1.842l19.357-11.175c.89-.514 1.439-4.394 1.439-5.422v-16.509c0-1.027-.548-4.89-1.439-5.404l-19.357-11.176c-.89-.514-5.178 1.328-6.068 1.843z"/>
        <path d="m41.646 91.109 15.125-8.732v-17.464l-15.125-8.733-15.124 8.732v17.464l15.124 8.732z"/>
      </g>
    </svg>
  );
}

function GeometricIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 115 114"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke={stroke} strokeMiterlimit="10">
        <path d="m1 47.221 51.761-20.61M1 47.221l51.761 20.61M52.761 109.053 1 47.221M103.396 47.221l-50.635-20.61M52.761 67.832l50.635-20.61M52.761 109.053l50.635-61.832M1 88.442l51.761 20.611M1 88.443l51.761-20.611M52.761 26.61 1 88.444M103.396 88.442l-50.635 20.611M52.761 67.832l50.635 20.61M52.761 26.61l50.635 61.833M1 26.61 52.761 6M1 26.61l51.761 20.611M52.761 88.443 1 26.61M103.396 26.61 52.761 6M52.761 47.221l50.635-20.61M52.761 88.443l50.635-61.832M1 67.832l51.761 20.61M1 67.832l51.761-20.61M52.761 6 1 67.832M103.396 67.832l-50.635 20.61M52.761 47.221l50.635 20.61M52.761 6l50.635 61.832"/>
      </g>
    </svg>
  );
}
