import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-end pb-12 md:pb-20" id="inicio">
      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-4 md:inset-6 rounded-[var(--radius-xl)] overflow-hidden">
          <video
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/hero-video.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
        </div>
      </div>

      {/* Content */}
      <div className="container relative z-10 text-white">
        <div className="max-w-4xl mb-16">
          <h1 className="text-[clamp(2.5rem,7vw,5.5rem)] font-light leading-[1.05] tracking-[-0.03em] mb-8">
            El futuro de la energia solar para empresas.
          </h1>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
          <p className="text-lg md:text-xl text-white/80 max-w-lg leading-relaxed">
            Reduce tu factura de luz hasta un 80% con energia solar.
            Subvenciones del Gobierno de Canarias cubren hasta el 80% del coste.
          </p>

          <Link
            href="#calculadora"
            className="group flex items-center gap-4 text-lg font-medium"
          >
            <span>Descubre tu ahorro</span>
            <span className="relative w-12 h-12 flex items-center justify-center">
              <svg
                className="absolute inset-0 w-full h-full fill-white/20"
                viewBox="0 0 48 48"
              >
                <circle cx="24" cy="24" r="24" />
              </svg>
              <svg
                className="w-4 h-4 transition-transform group-hover:translate-x-1"
                viewBox="0 0 10 10"
                fill="currentColor"
              >
                <path d="M7.703 5.8H.398V4.6h7.305l-3.36-3.36.855-.84 4.8 4.8-4.8 4.8-.855-.84 3.36-3.36Z" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
