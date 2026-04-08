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
    <header className="fixed top-10 md:top-[50px] left-0 right-0 z-50 px-6 md:px-12 transition-all duration-500">
      <div className="max-w-[1524px] mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className={cn(
            "relative z-10 inline-flex items-center gap-2.5 px-5 py-3 rounded-[12px] border transition-all duration-600",
            isScrolled
              ? "bg-white/80 backdrop-blur-[14px] border-[#222f30]/5"
              : "bg-transparent border-transparent"
          )}
        >
          <Logo
            className={cn(
              "h-[17px] md:h-[17px] transition-colors duration-600",
              isScrolled ? "text-[#222f30]" : "text-white"
            )}
          />
        </Link>

        {/* Navigation Wrapper */}
        <div className="flex items-center gap-3 bg-white/80 backdrop-blur-[14px] border border-[#222f30]/5 rounded-[12px] p-1 pl-3">
          {/* Desktop Nav Links */}
          <nav className="hidden md:flex gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[#222f30] text-sm font-mono uppercase tracking-normal px-[17px] py-2 rounded-[8px] transition-all duration-500 hover:bg-[#f7f7f5]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Installer Login */}
          <Link
            href="/login"
            className="hidden md:inline-flex text-[#222f30]/60 text-sm font-mono uppercase tracking-normal px-3 py-2 rounded-[8px] transition-all duration-300 hover:text-[#222f30] hover:bg-[#f7f7f5]"
          >
            Instaladores
          </Link>

          {/* CTA Button */}
          <Link
            href="/solicitar"
            className="bg-[#222f30] text-white px-5 py-3 rounded-[8px] font-mono text-sm uppercase transition-all duration-300 hover:bg-[#a7e26e] hover:text-[#222f30]"
          >
            Contacto
          </Link>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden flex items-center justify-center w-12 h-12 bg-[#222f30] rounded-[12px]"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Menu"
          >
            <span className="relative block w-[18px] h-0.5 bg-[#a7e26e]">
              <span
                className={cn(
                  "absolute left-0 w-full h-full bg-[#a7e26e] transition-all duration-300",
                  isMobileMenuOpen ? "top-0 rotate-45" : "-top-1.5"
                )}
              />
              <span
                className={cn(
                  "absolute left-0 w-full h-full bg-[#a7e26e] transition-all duration-300",
                  isMobileMenuOpen ? "top-0 -rotate-45" : "top-1.5"
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={cn(
          "md:hidden fixed inset-0 top-[100px] bg-[#222f30] transition-all duration-500",
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
              className="text-xl font-mono uppercase text-white hover:text-[#a7e26e] transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/solicitar"
            className="mt-4 inline-flex items-center justify-center px-6 py-3 bg-[#a7e26e] text-[#222f30] font-mono text-sm uppercase rounded-[12px]"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Contacto
          </Link>
          <Link
            href="/login"
            className="mt-2 text-white/60 font-mono text-sm uppercase hover:text-[#a7e26e] transition-colors"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Acceso Instaladores
          </Link>
        </nav>
      </div>
    </header>
  );
}
