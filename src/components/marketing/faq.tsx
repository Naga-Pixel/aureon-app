"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

const faqs = [
  {
    question: "¿Cuanto cuesta una instalacion solar para mi empresa?",
    answer:
      "El coste depende del tamano de la instalacion y las caracteristicas de tu empresa. Sin embargo, con las subvenciones actuales del Gobierno de Canarias, puedes cubrir hasta el 80% del coste total. Ofrecemos estudios gratuitos y personalizados.",
  },
  {
    question: "¿Cuanto tiempo tarda la instalacion?",
    answer:
      "Una instalacion tipica para empresas se completa en 2-4 semanas, dependiendo del tamano. La tramitacion de subvenciones puede tardar 2-3 meses adicionales, pero comenzamos la instalacion mientras se procesa.",
  },
  {
    question: "¿Que mantenimiento requiere?",
    answer:
      "Las instalaciones solares requieren muy poco mantenimiento. Recomendamos una revision anual y limpieza periodica de los paneles. Ofrecemos contratos de mantenimiento que incluyen monitorizacion 24/7.",
  },
  {
    question: "¿Puedo vender la energia que no consumo?",
    answer:
      "Si, en Canarias puedes verter el excedente de energia a la red y recibir una compensacion. Te ayudamos a tramitar todos los permisos necesarios para la compensacion de excedentes.",
  },
];

export function FAQ() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  const toggleFaq = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <section
      ref={sectionRef}
      className="py-[140px] bg-[#f7f7f5]"
      id="faq"
    >
      <div className="container">
        <div className="text-center mb-16 md:mb-20">
          <span className="inline-flex items-center gap-3 bg-white px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase mx-auto mb-10">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Preguntas frecuentes
          </span>
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-normal tracking-[-0.03em] leading-[1.1] fade-up">
            Resolvemos tus dudas
          </h2>
        </div>

        <div className="max-w-[800px] mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-[20px] overflow-hidden fade-up"
            >
              <button
                onClick={() => toggleFaq(index)}
                className="w-full px-8 py-6 text-left font-medium text-lg flex justify-between items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <span>{faq.question}</span>
                <span
                  className={cn(
                    "text-2xl font-light text-[#a7e26e] transition-transform duration-300",
                    activeIndex === index && "rotate-45"
                  )}
                >
                  +
                </span>
              </button>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-400 ease-out",
                  activeIndex === index ? "max-h-[300px]" : "max-h-0"
                )}
              >
                <div className="px-8 pb-6 text-[#445e5f] leading-relaxed">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
