"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils/cn";

interface NavLink {
  href: string;
  label: string;
}

const navLinks: NavLink[] = [
  { href: "#inicio", label: "Inicio" },
  { href: "#servicios", label: "Servicios" },
  { href: "#faq", label: "FAQ" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        isScrolled
          ? "py-4 bg-[var(--color-bg)]/90 backdrop-blur-md shadow-sm"
          : "py-6"
      )}
    >
      <div className="container flex items-center justify-between">
        <Link href="/" className="relative z-10">
          <Logo
            className={cn(
              "h-6 md:h-7 transition-colors duration-300",
              isScrolled ? "text-[var(--color-primary)]" : "text-white"
            )}
          />
        </Link>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors duration-300 hover:text-[var(--color-accent)]",
                  isScrolled ? "text-[var(--color-text)]" : "text-white/90"
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <Link
            href="/solicitar"
            className={cn(
              "relative overflow-hidden px-5 py-2.5 text-sm font-medium rounded-[var(--radius-md)] transition-all duration-300",
              isScrolled
                ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-accent)] hover:text-[var(--color-primary)]"
                : "bg-white/10 backdrop-blur-sm text-white border border-white/20 hover:bg-white hover:text-[var(--color-primary)]"
            )}
          >
            Contacto
          </Link>

          <button
            className={cn(
              "md:hidden relative w-6 h-6 flex flex-col justify-center gap-1.5",
              isScrolled ? "text-[var(--color-primary)]" : "text-white"
            )}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Menu"
          >
            <span
              className={cn(
                "block h-0.5 w-full bg-current transition-all duration-300",
                isMobileMenuOpen && "rotate-45 translate-y-2"
              )}
            />
            <span
              className={cn(
                "block h-0.5 w-full bg-current transition-all duration-300",
                isMobileMenuOpen && "opacity-0"
              )}
            />
            <span
              className={cn(
                "block h-0.5 w-full bg-current transition-all duration-300",
                isMobileMenuOpen && "-rotate-45 -translate-y-2"
              )}
            />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={cn(
          "md:hidden fixed inset-0 top-[72px] bg-[var(--color-primary)] transition-all duration-500",
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      >
        <nav className="container flex flex-col gap-6 py-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xl font-medium text-white hover:text-[var(--color-accent)] transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/solicitar"
            className="mt-4 inline-flex items-center justify-center px-6 py-3 bg-[var(--color-accent)] text-[var(--color-primary)] font-medium rounded-[var(--radius-md)]"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Solicitar presupuesto
          </Link>
        </nav>
      </div>
    </header>
  );
}
