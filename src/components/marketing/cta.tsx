"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export function CTA() {
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
      className="py-[140px] bg-[#222f30] text-white"
      id="contacto"
    >
      <div className="container">
        <div className="text-center max-w-[800px] mx-auto fade-up">
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-light tracking-[-0.03em] leading-[1.1] mb-6">
            ¿Listo para ahorrar con energía solar?
          </h2>
          <p className="text-xl text-white/70 mb-12 leading-relaxed">
            Solicita tu estudio gratuito y descubre cuánto puede ahorrar tu
            empresa con energía solar. Sin compromiso.
          </p>
          <Link
            href="/solicitar"
            className="group inline-flex items-center gap-3 bg-[#a7e26e] text-[#222f30] px-10 py-5 rounded-[12px] font-mono text-sm uppercase transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(167,226,110,0.3)]"
          >
            <span>Contactar ahora</span>
            <svg
              className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
