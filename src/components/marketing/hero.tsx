import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-between text-white overflow-hidden" id="inicio">
      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-2 left-2 right-2 bottom-2 md:top-3 md:left-3 md:right-3 md:bottom-3 rounded-[20px] md:rounded-[40px] overflow-hidden">
          <video
            className="absolute inset-0 w-full h-full object-cover opacity-90"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/hero-video.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-black/50" />
        </div>
      </div>

      {/* Content */}
      <div className="container relative z-10 min-h-screen flex flex-col justify-between pt-[148px] pb-11">
        {/* Main Heading */}
        <div className="flex-1 flex items-center">
          <h1 className="text-[clamp(3rem,10vw,7rem)] font-normal leading-[1] tracking-[-0.03em] max-w-[1070px]">
            El futuro de la energía es colectivo.
          </h1>
        </div>

        {/* Bottom Content */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-[60px]">
          <p className="text-[clamp(1.25rem,2vw,1.5rem)] font-light leading-[1.3] max-w-[640px] text-white/90">
            Vecinos que producen y comparten su propia energía.
            Subvenciones de hasta el 80% y ahorro garantizado para todos los miembros.
          </p>

          {/* CTA Button - Split style */}
          <Link
            href="#comunidad"
            className="group inline-flex items-stretch h-12"
          >
            <span className="bg-[#222f30] text-white px-5 font-mono text-sm uppercase flex items-center rounded-l-[12px] transition-all duration-500 group-hover:bg-[#a7e26e] group-hover:text-[#222f30]">
              Quiero participar
            </span>
            <span className="w-12 h-12 bg-[#a7e26e] rounded-r-[12px] flex items-center justify-center transition-all duration-500 group-hover:bg-[#222f30]">
              <svg
                className="w-3 h-3 transition-colors duration-500"
                viewBox="0 0 10 10"
                fill="none"
              >
                <path
                  d="M7.703 5.8H.398V4.6h7.305l-3.36-3.36.855-.84 4.8 4.8-4.8 4.8-.855-.84 3.36-3.36Z"
                  className="fill-[#222f30] group-hover:fill-white transition-colors duration-500"
                />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
