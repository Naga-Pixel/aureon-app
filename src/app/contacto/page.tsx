import { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { ContactForm } from "@/components/forms/contact-form";

export const metadata: Metadata = {
  title: "Contacto - Aureon",
  description:
    "Contacta con nosotros para más información sobre comunidades energéticas.",
};

export default function ContactoPage() {
  return (
    <>
      <Header />
      <main className="pt-32 pb-20 bg-[#f7f7f5] min-h-screen">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            {/* Breadcrumb */}
            <nav className="mb-8">
              <Link
                href="/"
                className="text-sm text-[#445e5f] hover:text-[#a7e26e] transition-colors"
              >
                ← Volver al inicio
              </Link>
            </nav>

            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-[clamp(2rem,5vw,3rem)] font-light tracking-[-0.03em] mb-4">
                Contacta con nosotros
              </h1>
              <p className="text-lg text-[#445e5f]">
                ¿Interesado en formar parte de una comunidad energética?
                Escríbenos y te responderemos lo antes posible.
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-[40px] p-8 md:p-12 shadow-[0_20px_60px_rgba(34,47,48,0.1)]">
              <ContactForm />
            </div>

            {/* Contact Info */}
            <div className="mt-12 text-center">
              <p className="text-[#445e5f]">
                También puedes escribirnos directamente a{" "}
                <a
                  href="mailto:andrea@aureon.bio"
                  className="text-[#222f30] font-medium hover:text-[#a7e26e] transition-colors"
                >
                  andrea@aureon.bio
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
