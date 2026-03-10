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
 * BATTERY GRANTS (Updated March 2026):
 * - Regional (Gobierno de Canarias): €490/kWh for batteries <10kWh
 * - Cabildo Gran Canaria: €300/kWh, max €1,000 (STACKABLE with regional)
 * - Cabildo Fuerteventura Medida I: 50% up to €5,000 (deadline April 4, 2026)
 *
 * SOLAR GRANTS:
 * - Rates vary by program, typically €400-500/kWp
 *
 * Sources:
 * - Gobierno de Canarias BOC
 * - Cabildo de Gran Canaria convocatorias
 * - Cabildo de Fuerteventura Medida I (March-April 2026)
 */
const GRANT_RATES_2026 = {
  solar: {
    residential: 400, // €/kWp (conservative estimate)
    community: 500, // €/kWp (higher for communities)
  },
  battery: {
    // Base regional rate - applies everywhere in Canarias
    regional: 490, // €/kWh for batteries <10kWh
    maxRegionalCapacity: 10, // kWh
    // Island-specific additions
    granCanaria: {
      additional: 300, // €/kWh from Cabildo
      maxAmount: 1000, // €
    },
    fuerteventura: {
      percentageCap: 0.5, // 50% of project cost
      maxAmount: 5000, // €
      deadline: '2026-04-04',
    },
  },
  maxPerProject: {
    residential: 10000, // Increased to account for stacked grants
    community: 50000,
  },
  // Typical grant programs
  programs: [
    {
      id: 'canarias-regional-2026',
      name: 'Subvención Regional Baterías',
      deadline: '2026-12-31',
    },
    {
      id: 'cabildo-gc-battery-2026',
      name: 'Cabildo Gran Canaria - Baterías',
      deadline: '2026-09-30',
    },
    {
      id: 'cabildo-fv-medida-i-2026',
      name: 'Cabildo Fuerteventura - Medida I',
      deadline: '2026-04-04',
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
 *
 * @param solarKwp - Solar system size in kWp
 * @param batteryKwh - Battery capacity in kWh
 * @param projectType - 'residential' or 'community'
 * @param island - Optional island name for location-specific grants
 * @param batteryCost - Optional battery cost for percentage-based grants
 */
export async function estimateGrant(
  solarKwp: number,
  batteryKwh: number,
  projectType: ProjectType,
  island?: string,
  batteryCost?: number
): Promise<GrantEstimate> {
  // Try to fetch live data
  const bdnsGrants = await fetchBDNSGrants();
  const hasLiveData = bdnsGrants.length > 0;

  const rates = GRANT_RATES_2026;

  // Calculate solar grant
  const solarGrant = solarKwp * rates.solar[projectType];

  // Calculate battery grant with stacked incentives
  let batteryGrant = 0;
  const batteryPrograms: Grant[] = [];

  if (batteryKwh > 0 && projectType === 'residential') {
    // 1. Regional grant (applies to all Canary Islands)
    const effectiveKwh = Math.min(batteryKwh, rates.battery.maxRegionalCapacity);
    const regionalGrant = effectiveKwh * rates.battery.regional;
    batteryGrant += regionalGrant;

    batteryPrograms.push({
      id: 'canarias-regional-2026',
      name: 'Subvencion Regional Baterias',
      solarRatePerKwp: 0,
      batteryRatePerKwh: rates.battery.regional,
      maxAmount: rates.battery.maxRegionalCapacity * rates.battery.regional,
      deadline: '2026-12-31',
      confidence: 'high',
    });

    // 2. Island-specific grants
    if (island === 'Gran Canaria') {
      const gcGrant = Math.min(
        batteryKwh * rates.battery.granCanaria.additional,
        rates.battery.granCanaria.maxAmount
      );
      batteryGrant += gcGrant;

      batteryPrograms.push({
        id: 'cabildo-gc-battery-2026',
        name: 'Cabildo Gran Canaria - Baterias',
        solarRatePerKwp: 0,
        batteryRatePerKwh: rates.battery.granCanaria.additional,
        maxAmount: rates.battery.granCanaria.maxAmount,
        deadline: '2026-09-30',
        confidence: 'high',
      });
    } else if (island === 'Fuerteventura' && batteryCost) {
      // Fuerteventura uses percentage-based grant
      const now = new Date();
      const deadline = new Date(rates.battery.fuerteventura.deadline);
      if (now <= deadline) {
        const fvGrant = Math.min(
          batteryCost * rates.battery.fuerteventura.percentageCap,
          rates.battery.fuerteventura.maxAmount
        );
        batteryGrant += fvGrant;

        batteryPrograms.push({
          id: 'cabildo-fv-medida-i-2026',
          name: 'Cabildo Fuerteventura - Medida I',
          solarRatePerKwp: 0,
          batteryRatePerKwh: 0, // Percentage-based
          maxAmount: rates.battery.fuerteventura.maxAmount,
          deadline: rates.battery.fuerteventura.deadline,
          confidence: 'high',
        });
      }
    }
  } else if (batteryKwh > 0) {
    // Community projects - simplified calculation
    batteryGrant = batteryKwh * 450; // €/kWh for communities
  }

  const rawTotal = solarGrant + batteryGrant;
  const totalEstimate = Math.min(rawTotal, rates.maxPerProject[projectType]);

  // Build grant list
  const grants: Grant[] = hasLiveData
    ? bdnsGrants.map((g) => ({
        id: g.idConvocatoria,
        name: g.titulo,
        solarRatePerKwp: rates.solar[projectType],
        batteryRatePerKwh: rates.battery.regional,
        maxAmount: g.importeTotal,
        deadline: g.fechaFin,
        confidence: 'medium' as const,
      }))
    : [
        // Solar grant if applicable
        ...(solarKwp > 0 ? [{
          id: 'solar-grant-2026',
          name: 'Subvencion Solar',
          solarRatePerKwp: rates.solar[projectType],
          batteryRatePerKwh: 0,
          maxAmount: solarKwp * rates.solar[projectType],
          deadline: '2026-12-31',
          confidence: 'medium' as const,
        }] : []),
        // Battery programs
        ...batteryPrograms,
      ];

  // Determine status
  let status: GrantStatus = 'none';
  if (hasLiveData || grants.length > 0) {
    status = 'active';
  }

  // Higher confidence when we have island-specific data
  const confidence = island ? 'high' : (hasLiveData ? 'medium' : 'low');

  return {
    status,
    grants,
    solarGrant: Math.round(solarGrant),
    batteryGrant: Math.round(batteryGrant),
    totalEstimate: Math.round(totalEstimate),
    confidence,
  };
}

/**
 * Get grant rates for display
 */
export function getGrantRates(projectType: ProjectType) {
  // Battery rate depends on project type
  const batteryRate = projectType === 'residential'
    ? GRANT_RATES_2026.battery.regional
    : 450; // Community rate

  return {
    solarRatePerKwp: GRANT_RATES_2026.solar[projectType],
    batteryRatePerKwh: batteryRate,
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
