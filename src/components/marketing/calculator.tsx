"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ISLANDS } from "@/lib/constants/islands";
import { calculateSavings, formatCurrency } from "@/lib/utils/calculator";

const installationTypes = [
  { value: "roof", label: "Cubierta industrial" },
  { value: "ground", label: "Suelo" },
  { value: "parking", label: "Marquesina parking" },
];

export function Calculator() {
  const sectionRef = useRef<HTMLElement>(null);
  const [monthlyBill, setMonthlyBill] = useState("");
  const [installationType, setInstallationType] = useState("roof");
  const [island, setIsland] = useState("tenerife");
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<ReturnType<
    typeof calculateSavings
  > | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bill = parseFloat(monthlyBill);
    if (isNaN(bill) || bill <= 0) return;

    const calculatedResults = calculateSavings({
      monthlyBill: bill,
      propertyType: installationType,
      island,
    });

    setResults(calculatedResults);
    setShowResults(true);

    setTimeout(() => {
      document
        .getElementById("calculator-results")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <section
      ref={sectionRef}
      className="py-[140px] bg-[#f7f7f5]"
      id="calculadora"
    >
      <div className="container">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-3 bg-white px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase mx-auto mb-10">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Calculadora
          </span>
          <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-normal tracking-[-0.03em] leading-[1.1] fade-up mb-4">
            Calcula tu ahorro
          </h2>
          <p className="text-[#445e5f] max-w-xl mx-auto mt-4">
            Descubre cuánto puedes ahorrar con una instalación solar
            personalizada para tu empresa.
          </p>
        </div>

        <div className="max-w-[800px] mx-auto bg-[#ffffff] rounded-[40px] p-8 md:p-12 shadow-[0_20px_60px_rgba(34,47,48,0.1)] fade-up">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-mono uppercase text-[#445e5f] tracking-wide">
                Factura mensual de luz (€)
              </label>
              <input
                type="number"
                value={monthlyBill}
                onChange={(e) => setMonthlyBill(e.target.value)}
                placeholder="Ej: 2000"
                required
                className="bg-[#f7f7f5] border border-[rgba(34,47,48,0.1)] rounded-[12px] px-5 py-[18px] text-lg focus:border-[#a7e26e] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all outline-none"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <label className="text-sm font-mono uppercase text-[#445e5f] tracking-wide">
                  Tipo de instalacion
                </label>
                <select
                  value={installationType}
                  onChange={(e) => setInstallationType(e.target.value)}
                  className="bg-[#f7f7f5] border border-[rgba(34,47,48,0.1)] rounded-[12px] px-5 py-[18px] text-lg appearance-none cursor-pointer focus:border-[#a7e26e] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all outline-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23445e5f' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 16px center",
                    backgroundSize: "16px",
                  }}
                >
                  {installationTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-sm font-mono uppercase text-[#445e5f] tracking-wide">
                  Isla
                </label>
                <select
                  value={island}
                  onChange={(e) => setIsland(e.target.value)}
                  className="bg-[#f7f7f5] border border-[rgba(34,47,48,0.1)] rounded-[12px] px-5 py-[18px] text-lg appearance-none cursor-pointer focus:border-[#a7e26e] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all outline-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23445e5f' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 16px center",
                    backgroundSize: "16px",
                  }}
                >
                  {ISLANDS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#222f30] text-white py-5 px-8 rounded-[12px] font-mono text-sm uppercase transition-all duration-300 hover:bg-[#a7e26e] hover:text-[#222f30] hover:-translate-y-0.5 hover:shadow-lg"
            >
              Calcular ahorro estimado
            </button>
          </form>

          {showResults && results && (
            <div
              id="calculator-results"
              className="mt-12 pt-12 border-t border-gray-200 animate-[fadeIn_0.6s_ease-out]"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-[#f7f7f5] rounded-[12px] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[#445e5f] mb-2">
                    Ahorro mensual
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatCurrency(results.monthlySavings)}
                  </div>
                </div>
                <div className="bg-[#a7e26e] rounded-[12px] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[#222f30]/70 mb-2">
                    Ahorro anual
                  </div>
                  <div className="text-2xl font-semibold text-[#222f30]">
                    {formatCurrency(results.annualSavings)}
                  </div>
                </div>
                <div className="bg-[#f7f7f5] rounded-[12px] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[#445e5f] mb-2">
                    Subvención estimada
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatCurrency(results.estimatedSubsidy)}
                  </div>
                </div>
                <div className="bg-[#f7f7f5] rounded-[12px] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[#445e5f] mb-2">
                    Retorno inversión
                  </div>
                  <div className="text-2xl font-semibold">
                    {results.roiYears} años
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[rgba(167,226,110,0.2)] to-[rgba(206,247,158,0.1)] rounded-[20px] p-10 text-center mb-8">
                <div className="text-[#445e5f] mb-2">
                  Ahorro total en 25 años
                </div>
                <div className="text-5xl font-semibold text-[#222f30]">
                  {formatCurrency(results.totalSavings25Years)}
                </div>
              </div>

              <Link
                href="/solicitar"
                className="block w-full bg-[#222f30] text-white py-5 px-8 rounded-[12px] font-mono text-sm uppercase text-center transition-all duration-300 hover:bg-[#a7e26e] hover:text-[#222f30] hover:-translate-y-0.5"
              >
                Solicitar estudio gratuito
              </Link>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
