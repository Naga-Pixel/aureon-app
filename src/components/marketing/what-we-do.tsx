export function WhatWeDo() {
  return (
    <section className="bg-[#222f30] text-white py-[100px]" id="servicios">
      <div className="container">
        {/* Header */}
        <div className="flex flex-col gap-8 mb-11">
          <span className="inline-flex items-center gap-3 bg-white/10 px-3 py-2 pr-4 rounded-[8px] font-mono text-sm uppercase w-fit">
            <span className="w-2.5 h-2.5 bg-[#a7e26e]" />
            Qué hacemos
          </span>
          <div className="w-full h-px bg-white/20 relative">
            <div className="absolute top-0 left-0 h-full w-1/3 bg-white transition-all duration-500" />
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-11 items-center">
          {/* Icon */}
          <div className="flex items-center justify-center">
            <svg
              className="w-[180px] h-[180px] lg:w-[220px] lg:h-[220px] text-white opacity-90"
              viewBox="0 0 114 114"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                stroke="currentColor"
                strokeMiterlimit="10"
                d="M51.326 108.653V67.592M39.905 107.366l9.137-40.032M29.058 103.571l17.815-36.995M19.324 97.456l25.601-32.103M11.198 89.328 43.3 63.727M5.083 79.596 42.078 61.78M1.287 68.747l40.032-9.137M0 57.327H41.06M1.287 45.906l40.032 9.137M5.083 35.057l36.995 17.816M11.198 25.325l32.103 25.601M19.325 17.198l25.601 32.103M29.056 11.083l17.816 36.995M39.905 7.287l9.137 40.031M51.327 6v41.061M62.748 7.287 53.61 47.318M73.596 11.082 55.78 48.078M83.329 17.198 57.727 49.3M91.455 25.325 59.352 50.926M97.57 35.057 60.577 52.873M101.366 45.905l-40.032 9.137M102.653 57.327H61.592M101.367 68.748 61.335 59.61M97.57 79.596 60.575 61.78M91.455 89.328l-32.103-25.6M83.327 97.455 57.726 65.352M73.597 103.571 55.781 66.576M62.749 107.366l-9.137-40.032"
              />
            </svg>
          </div>

          {/* Text */}
          <p className="text-[clamp(1.875rem,4vw,3.625rem)] leading-[1.15] tracking-[-0.02em] font-light">
            <span className="opacity-100">La energía solar es un desafío de sistemas complejos.</span>
            <span className="opacity-50"> Nuestra plataforma integrada está diseñada para optimizar cada aspecto de tu instalación fotovoltaica.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
