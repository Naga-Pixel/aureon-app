'use client';

import { useRouter } from 'next/navigation';

interface ViewOnMapButtonProps {
  notes: string | null;
}

function parseCoordinatesFromNotes(notes: string | null): { lat: number; lon: number } | null {
  if (!notes) return null;

  // Match "Coordenadas: lat, lon" pattern
  const match = notes.match(/Coordenadas:\s*([-\d.]+),\s*([-\d.]+)/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);

  if (isNaN(lat) || isNaN(lon)) return null;

  return { lat, lon };
}

export function ViewOnMapButton({ notes }: ViewOnMapButtonProps) {
  const router = useRouter();
  const coords = parseCoordinatesFromNotes(notes);

  if (!coords) return null;

  const handleClick = () => {
    router.push(`/installer/prospecting?lat=${coords.lat}&lon=${coords.lon}&zoom=18`);
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 w-full p-3 rounded-xl bg-[#f7f7f5] hover:bg-[#a7e26e]/20 transition-colors text-left"
    >
      <svg
        className="w-5 h-5 text-[#a7e26e]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
        />
      </svg>
      <span className="font-medium">Ver en mapa</span>
    </button>
  );
}
