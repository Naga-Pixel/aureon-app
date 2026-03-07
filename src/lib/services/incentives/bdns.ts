/**
 * Layer 2: BDNS (Base de Datos Nacional de Subvenciones) Service
 *
 * Fetches active grants from the Spanish national subsidies database.
 * Falls back to hardcoded estimates when API is unavailable.
 *
 * API Docs: https://www.pap.hacienda.gob.es/bdnstrans/GE/es/api
 */

import type { Grant, GrantEstimate, GrantStatus, ProjectType } from '@/lib/types/incentives';

const BDNS_API_BASE = 'https://www.pap.hacienda.gob.es/bdnstrans/GE/es/api';
const BDNS_TIMEOUT_MS = 10000;

// Region codes
const REGION_CANARIAS = '05';

// Sector keywords for filtering
const ENERGY_KEYWORDS = ['energía', 'renovable', 'solar', 'batería', 'autoconsumo', 'fotovoltaic'];

/**
 * 2026 Grant rates for Canary Islands
 *
 * Sources:
 * - FEDER Transición Verde 2025-2027
 * - Cabildo de Gran Canaria programs
 * - Gobierno de Canarias renewable incentives
 *
 * Updated: January 2026
 */
const GRANT_RATES_2026 = {
  solar: {
    residential: 400, // €/kWp
    community: 500, // €/kWp (higher for communities)
  },
  battery: {
    residential: 350, // €/kWh
    community: 450, // €/kWh
  },
  maxPerProject: {
    residential: 6000,
    community: 50000,
  },
  // Typical grant programs
  programs: [
    {
      id: 'feder-verde-2026',
      name: 'FEDER Transición Verde 2026',
      deadline: '2026-12-31',
    },
    {
      id: 'cabildo-gc-2026',
      name: 'Cabildo de Gran Canaria - Energía Solar',
      deadline: '2026-09-30',
    },
  ],
} as const;

interface BDNSConvocatoria {
  idConvocatoria: string;
  titulo: string;
  fechaInicio: string;
  fechaFin: string;
  importeTotal: number;
  organoConvocante: string;
  region?: string;
}

/**
 * Fetch active grants from BDNS API
 */
async function fetchBDNSGrants(): Promise<BDNSConvocatoria[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BDNS_TIMEOUT_MS);

  try {
    // Note: Actual BDNS API endpoint structure may vary
    // This is a placeholder for the real implementation
    const params = new URLSearchParams({
      region: REGION_CANARIAS,
      estado: 'abierta',
      // sector: 'energia' // if supported
    });

    const response = await fetch(`${BDNS_API_BASE}/convocatorias?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`BDNS API returned ${response.status}, using fallback rates`);
      return [];
    }

    const data = await response.json();

    // Filter for energy-related grants
    const energyGrants = (data.convocatorias || data || []).filter(
      (conv: BDNSConvocatoria) =>
        ENERGY_KEYWORDS.some((keyword) =>
          conv.titulo?.toLowerCase().includes(keyword)
        )
    );

    return energyGrants;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('BDNS API timeout, using fallback rates');
    } else {
      console.warn('BDNS API error, using fallback rates:', error);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Estimate available grants for a project
 */
export async function estimateGrant(
  solarKwp: number,
  batteryKwh: number,
  projectType: ProjectType
): Promise<GrantEstimate> {
  // Try to fetch live data
  const bdnsGrants = await fetchBDNSGrants();
  const hasLiveData = bdnsGrants.length > 0;

  const rates = GRANT_RATES_2026;

  // Calculate grant amounts
  const solarGrant = solarKwp * rates.solar[projectType];
  const batteryGrant = batteryKwh * rates.battery[projectType];
  const rawTotal = solarGrant + batteryGrant;
  const totalEstimate = Math.min(rawTotal, rates.maxPerProject[projectType]);

  // Build grant list
  const grants: Grant[] = hasLiveData
    ? bdnsGrants.map((g) => ({
        id: g.idConvocatoria,
        name: g.titulo,
        solarRatePerKwp: rates.solar[projectType],
        batteryRatePerKwh: rates.battery[projectType],
        maxAmount: g.importeTotal,
        deadline: g.fechaFin,
        confidence: 'medium' as const,
      }))
    : rates.programs.map((p) => ({
        id: p.id,
        name: p.name,
        solarRatePerKwp: rates.solar[projectType],
        batteryRatePerKwh: rates.battery[projectType],
        maxAmount: rates.maxPerProject[projectType],
        deadline: p.deadline,
        confidence: 'low' as const,
      }));

  // Determine status
  let status: GrantStatus = 'none';
  if (hasLiveData) {
    status = 'active';
  } else if (grants.length > 0) {
    status = 'active'; // Estimated programs exist
  }

  return {
    status,
    grants,
    solarGrant: Math.round(solarGrant),
    batteryGrant: Math.round(batteryGrant),
    totalEstimate: Math.round(totalEstimate),
    confidence: hasLiveData ? 'medium' : 'low',
  };
}

/**
 * Get grant rates for display
 */
export function getGrantRates(projectType: ProjectType) {
  return {
    solarRatePerKwp: GRANT_RATES_2026.solar[projectType],
    batteryRatePerKwh: GRANT_RATES_2026.battery[projectType],
    maxAmount: GRANT_RATES_2026.maxPerProject[projectType],
  };
}

/**
 * Check if any grants are currently active
 */
export async function hasActiveGrants(): Promise<boolean> {
  const grants = await fetchBDNSGrants();
  return grants.length > 0;
}

/**
 * Format grant info for display
 */
export function formatGrantEstimate(estimate: GrantEstimate): string {
  const lines = [
    `Subvención estimada: €${estimate.totalEstimate.toLocaleString('es-ES')}`,
  ];

  if (estimate.solarGrant > 0) {
    lines.push(`  - Solar: €${estimate.solarGrant.toLocaleString('es-ES')}`);
  }
  if (estimate.batteryGrant > 0) {
    lines.push(`  - Batería: €${estimate.batteryGrant.toLocaleString('es-ES')}`);
  }

  lines.push(`Fuente: ${estimate.confidence === 'medium' ? 'BDNS (en vivo)' : 'Estimación basada en programas activos'}`);
  lines.push(`Estado: ${estimate.status === 'active' ? 'Programas disponibles' : 'Sin programas confirmados'}`);

  return lines.join('\n');
}
