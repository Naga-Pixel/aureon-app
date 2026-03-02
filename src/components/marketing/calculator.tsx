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

    // Scroll to results
    setTimeout(() => {
      document
        .getElementById("calculator-results")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <section
      ref={sectionRef}
      className="py-24 md:py-36 bg-[var(--color-bg)]"
      id="calculadora"
    >
      <div className="container">
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-2 text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)] bg-white rounded-full mb-6">
            Calculadora
          </span>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-light tracking-[-0.03em] fade-up mb-4">
            Calcula tu ahorro
          </h2>
          <p className="text-[var(--color-text-muted)] max-w-xl mx-auto">
            Descubre cuanto puedes ahorrar con una instalacion solar
            personalizada para tu empresa.
          </p>
        </div>

        <div className="max-w-[800px] mx-auto bg-white rounded-[var(--radius-xl)] p-8 md:p-12 shadow-[0_20px_60px_rgba(34,47,48,0.1)] fade-up">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-mono uppercase text-[var(--color-text-muted)] tracking-wide">
                Factura mensual de luz (€)
              </label>
              <input
                type="number"
                value={monthlyBill}
                onChange={(e) => setMonthlyBill(e.target.value)}
                placeholder="Ej: 2000"
                required
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-5 py-4 text-lg focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <label className="text-sm font-mono uppercase text-[var(--color-text-muted)] tracking-wide">
                  Tipo de instalacion
                </label>
                <select
                  value={installationType}
                  onChange={(e) => setInstallationType(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-5 py-4 text-lg appearance-none cursor-pointer focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all"
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
                <label className="text-sm font-mono uppercase text-[var(--color-text-muted)] tracking-wide">
                  Isla
                </label>
                <select
                  value={island}
                  onChange={(e) => setIsland(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-5 py-4 text-lg appearance-none cursor-pointer focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)] transition-all"
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
              className="w-full bg-[var(--color-primary)] text-white py-5 px-8 rounded-[var(--radius-md)] font-medium text-lg transition-all duration-300 hover:bg-[var(--color-accent)] hover:text-[var(--color-primary)] hover:-translate-y-0.5 hover:shadow-lg"
            >
              Calcular ahorro estimado
            </button>
          </form>

          {/* Results */}
          {showResults && results && (
            <div
              id="calculator-results"
              className="mt-12 pt-12 border-t border-[var(--color-border)] animate-[fadeIn_0.6s_ease-out]"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[var(--color-text-muted)] mb-2">
                    Ahorro mensual
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatCurrency(results.monthlySavings)}
                  </div>
                </div>
                <div className="bg-[var(--color-accent)] rounded-[var(--radius-md)] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[var(--color-primary)]/70 mb-2">
                    Ahorro anual
                  </div>
                  <div className="text-2xl font-semibold text-[var(--color-primary)]">
                    {formatCurrency(results.annualSavings)}
                  </div>
                </div>
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[var(--color-text-muted)] mb-2">
                    Subvencion estimada
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatCurrency(results.estimatedSubsidy)}
                  </div>
                </div>
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-6 text-center">
                  <div className="text-xs font-mono uppercase text-[var(--color-text-muted)] mb-2">
                    Retorno inversion
                  </div>
                  <div className="text-2xl font-semibold">
                    {results.roiYears} anos
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[rgba(167,226,110,0.2)] to-[rgba(206,247,158,0.1)] rounded-[var(--radius-lg)] p-10 text-center mb-8">
                <div className="text-[var(--color-text-muted)] mb-2">
                  Ahorro total en 25 anos
                </div>
                <div className="text-5xl font-semibold text-[var(--color-primary)]">
                  {formatCurrency(results.totalSavings25Years)}
                </div>
              </div>

              <Link
                href="/solicitar"
                className="block w-full bg-[var(--color-primary)] text-white py-5 px-8 rounded-[var(--radius-md)] font-medium text-lg text-center transition-all duration-300 hover:bg-[var(--color-accent)] hover:text-[var(--color-primary)] hover:-translate-y-0.5"
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
