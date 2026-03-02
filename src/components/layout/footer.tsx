import Link from "next/link";
import { Logo } from "./logo";

const footerLinks = {
  navigation: [
    { href: "#inicio", label: "Inicio" },
    { href: "#servicios", label: "Servicios" },
    { href: "#calculadora", label: "Calculadora" },
    { href: "#faq", label: "FAQ" },
  ],
  services: [
    { href: "#", label: "Instalacion fotovoltaica" },
    { href: "#", label: "Gestion de subvenciones" },
    { href: "#", label: "Mantenimiento" },
    { href: "#", label: "Auditoria energetica" },
  ],
  contact: [
    { href: "mailto:info@aureon.es", label: "info@aureon.es" },
    { href: "tel:+34922000000", label: "922 000 000" },
    { href: "#", label: "Santa Cruz de Tenerife" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-[#222f30] text-[#ffffff] py-20">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="max-w-[300px]">
            <div className="mb-6">
              <Logo className="h-5 text-white" />
            </div>
            <p className="text-white/60 leading-[1.7]">
              Energía solar para empresas en Canarias. Transforma tu negocio con
              energía limpia y sostenible.
            </p>
          </div>

          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-[#ffffff]/50 mb-6">
              Navegacion
            </h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.navigation.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-[#ffffff]/80 hover:text-[#a7e26e] transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-[#ffffff]/50 mb-6">
              Servicios
            </h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.services.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[#ffffff]/80 hover:text-[#a7e26e] transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-[#ffffff]/50 mb-6">
              Contacto
            </h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.contact.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[#ffffff]/80 hover:text-[#a7e26e] transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-10 border-t border-[#ffffff]/10">
          <p className="text-[#ffffff]/50 text-sm">
            &copy; {new Date().getFullYear()} Aureon. Todos los derechos
            reservados.
          </p>
          <div className="flex gap-6">
            <Link
              href="/privacidad"
              className="text-[#ffffff]/50 text-sm hover:text-[#a7e26e] transition-colors"
            >
              Politica de privacidad
            </Link>
            <Link
              href="/legal"
              className="text-[#ffffff]/50 text-sm hover:text-[#a7e26e] transition-colors"
            >
              Aviso legal
            </Link>
            <Link
              href="/cookies"
              className="text-[#ffffff]/50 text-sm hover:text-[#a7e26e] transition-colors"
            >
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
