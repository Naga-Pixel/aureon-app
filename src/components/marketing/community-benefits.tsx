"use client";

import { useEffect, useRef } from "react";

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

  return (
    <section
      ref={sectionRef}
      className="py-[140px] bg-[#f7f7f5]"
      id="beneficios"
    >
      <div className="container">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-3 bg-white px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase mx-auto mb-10">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Comunidad Energética
          </span>
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-normal tracking-[-0.03em] leading-[1.1] fade-up mb-4">
            Beneficios para todos
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-[1200px] mx-auto">
          {/* Para Empresas */}
          <div className="bg-white rounded-[32px] p-10 md:p-12 shadow-[0_20px_60px_rgba(34,47,48,0.08)] fade-up">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-12 h-12 bg-[#222f30] rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-[#a7e26e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </span>
              <h3 className="text-2xl font-semibold text-[#222f30]">Para Empresas</h3>
            </div>
            <p className="text-lg leading-[1.7] text-[#445e5f]">
              <span className="font-semibold text-[#222f30]">Convierta su cubierta en un activo estratégico.</span>{" "}
              Su tejado es actualmente un recurso desaprovechado que podría ser su herramienta más potente para la optimización fiscal y la independencia energética. Al liderar una Comunidad Energética Boutique no solo reduce sus facturas de electricidad a cero sino que activa todo el potencial de la Reserva para Inversiones en Canarias (RIC) transformando obligaciones fiscales en un activo físico de alto rendimiento. Con los incentivos de 2026 que cubren hasta el 95% de los impuestos municipales (ICIO) y proporcionan importantes bonificaciones en el IBI, el proyecto se amortiza en un tiempo récord. Transforme su negocio de un consumidor tradicional a un núcleo energético vecinal asegurando su ventaja competitiva en la economía verde mientras genera una lealtad profunda con la comunidad que rodea sus instalaciones.
            </p>
          </div>

          {/* Para Vecinos */}
          <div className="bg-white rounded-[32px] p-10 md:p-12 shadow-[0_20px_60px_rgba(34,47,48,0.08)] fade-up">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-12 h-12 bg-[#a7e26e] rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-[#222f30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </span>
              <h3 className="text-2xl font-semibold text-[#222f30]">Para Vecinos</h3>
            </div>
            <p className="text-lg leading-[1.7] text-[#445e5f]">
              <span className="font-semibold text-[#222f30]">La forma más inteligente de iluminar su hogar.</span>{" "}
              Imagine no tener que preocuparse nunca más por las subidas en el precio de la electricidad. Al unirse a nuestra exclusiva comunidad energética local obtendrá acceso a energía solar de kilómetro cero generada directamente en su barrio. Esto no trata solo de ahorrar en su factura mensual sino de una estrategia financiera completa. Al integrar una batería doméstica en la red comunitaria podrá optar a subvenciones directas de hasta 490 euros por kWh y a una deducción de entre el 40% y el 60% en su IRPF. Usted aporta el almacenamiento y la comunidad aporta el sol para crear juntos una red eléctrica resiliente e independiente que protege su hogar contra apagones y reduce sus impuestos sobre bienes inmuebles durante años. No se limite a pagar por la energía y empiece a ser dueño de su futuro energético.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
