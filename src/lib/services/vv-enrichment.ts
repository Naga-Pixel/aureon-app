/**
 * VV Enrichment Service
 *
 * Infers property management firms and complex groupings from VV registry data.
 * Uses name patterns and address clustering.
 */

// Patterns that indicate a property management company
const COMPANY_PATTERNS = [
  /\bS\.?L\.?U?\.?\b/i,      // S.L., S.L.U., SL, SLU
  /\bS\.?A\.?\b/i,           // S.A., SA
  /\bSociedad\b/i,
  /\bRentals?\b/i,
  /\bManagement\b/i,
  /\bService[s]?\b/i,
  /\bMaintenance\b/i,
  /\bGrupo\b/i,
  /\bHolding\b/i,
  /\bInversiones\b/i,
  /\bInmobiliaria\b/i,
  /\bGestión\b/i,
  /\bGestion\b/i,
];

// Patterns that indicate a complex/resort name
const COMPLEX_PATTERNS = [
  /\bPark\b/i,
  /\bResort\b/i,
  /\bApartamentos?\b/i,
  /\bSuites?\b/i,
  /\bClub\b/i,
  /\bResidencia[l]?\b/i,
  /\bComplex\b/i,
  /\bVillas?\b/i,
  /\bBungalows?\b/i,
  /\bCondominios?\b/i,
];

// Names to ignore (generic/placeholder)
const IGNORE_NAMES = new Set([
  'sin denominacion',
  'sin denominación',
  'vivienda vacacional',
  'vivienda',
  'categoria unica',
  'categoría única',
  '_u',
]);

/**
 * Check if a name indicates a property management company
 */
export function isPropertyManagementFirm(nombre: string | null): boolean {
  if (!nombre) return false;
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return false;

  return COMPANY_PATTERNS.some(pattern => pattern.test(nombre));
}

/**
 * Check if a name indicates a complex/resort
 */
export function isComplexName(nombre: string | null): boolean {
  if (!nombre) return false;
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return false;

  return COMPLEX_PATTERNS.some(pattern => pattern.test(nombre));
}

/**
 * Normalize an address for grouping
 * Removes apartment numbers, normalizes street names
 */
export function normalizeAddress(direccion: string | null): string | null {
  if (!direccion) return null;

  let normalized = direccion
    .toLowerCase()
    .trim()
    // Normalize common abbreviations
    .replace(/\bavda?\.?\b/gi, 'avenida')
    .replace(/\bc\/?\b/gi, 'calle')
    .replace(/\bcl\.?\b/gi, 'calle')
    .replace(/\bav\.?\b/gi, 'avenida')
    .replace(/\bpl\.?\b/gi, 'plaza')
    .replace(/\bpº\.?\b/gi, 'paseo')
    .replace(/\bnº?\b/gi, '')
    // Remove apartment/unit numbers (e.g., "4 7", "21 2", "apt 3")
    .replace(/\s+\d+\s*[a-z]?\s*$/i, '')
    .replace(/\bapt\.?\s*\d+/gi, '')
    .replace(/\bpiso\s*\d+/gi, '')
    .replace(/\bportal\s*\d+/gi, '')
    // Remove postal codes
    .replace(/\d{5}/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
}

/**
 * Generate a complex ID from address
 * Used to group VVs in the same building
 */
export function generateComplexId(direccion: string | null, municipality: string | null): string | null {
  const normalizedAddr = normalizeAddress(direccion);
  if (!normalizedAddr || normalizedAddr.length < 5) return null;

  // Create a simple hash from address + municipality
  const input = `${normalizedAddr}|${(municipality || '').toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `complex-${Math.abs(hash).toString(36)}`;
}

/**
 * Infer property type from nombre_comercial
 */
export type VVPropertyType = 'management_firm' | 'complex' | 'individual' | 'unknown';

export function inferPropertyType(nombre: string | null): VVPropertyType {
  if (!nombre) return 'unknown';
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return 'unknown';

  if (isPropertyManagementFirm(nombre)) return 'management_firm';
  if (isComplexName(nombre)) return 'complex';
  return 'individual';
}

/**
 * Extract the management firm name from nombre_comercial
 * Returns null if it's not a management firm
 */
export function extractManagementFirm(nombre: string | null): string | null {
  if (!nombre || !isPropertyManagementFirm(nombre)) return null;
  return nombre.trim();
}

/**
 * Extract complex name from nombre_comercial
 * Returns null if it's not a complex name
 * Strips unit/apartment numbers for better grouping
 */
export function extractComplexName(nombre: string | null): string | null {
  if (!nombre) return null;
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return null;

  if (isComplexName(nombre)) {
    // Strip trailing unit/apartment numbers (e.g., "Bungalows Los Arcos 333" -> "Bungalows Los Arcos")
    let cleanName = nombre.trim()
      .replace(/\s+\d+[a-z]?$/i, '')        // "Complex 333" -> "Complex"
      .replace(/\s+#?\d+$/i, '')             // "Complex #12" -> "Complex"
      .replace(/\s+n[º°]?\s*\d+$/i, '')      // "Complex Nº 5" -> "Complex"
      .replace(/\s+-\s*\d+$/i, '')           // "Complex - 42" -> "Complex"
      .replace(/\s+[IVX]+$/i, '')            // "Complex III" -> "Complex"
      .trim();
    return cleanName || nombre.trim();
  }

  return null;
}

export interface VVEnrichment {
  propertyType: VVPropertyType;
  managementFirm: string | null;
  complexName: string | null;
  complexId: string | null;
}

/**
 * Enrich a single VV record with inferred data
 */
export function enrichVV(
  nombreComercial: string | null,
  direccion: string | null,
  municipality: string | null
): VVEnrichment {
  return {
    propertyType: inferPropertyType(nombreComercial),
    managementFirm: extractManagementFirm(nombreComercial),
    complexName: extractComplexName(nombreComercial),
    complexId: generateComplexId(direccion, municipality),
  };
}

/**
 * Analyze a batch of VVs to find common complexes
 * Returns a map of complexId -> count
 */
export function analyzeComplexClusters(
  vvs: Array<{ direccion: string | null; municipality: string | null }>
): Map<string, number> {
  const clusters = new Map<string, number>();

  for (const vv of vvs) {
    const complexId = generateComplexId(vv.direccion, vv.municipality);
    if (complexId) {
      clusters.set(complexId, (clusters.get(complexId) || 0) + 1);
    }
  }

  return clusters;
}

/**
 * Analyze nombre_comercial patterns to find management firms
 * Returns firms with 5+ properties
 */
export function analyzeManagementFirms(
  vvs: Array<{ nombreComercial: string | null }>
): Map<string, number> {
  const firms = new Map<string, number>();

  for (const vv of vvs) {
    const firm = extractManagementFirm(vv.nombreComercial);
    if (firm) {
      firms.set(firm, (firms.get(firm) || 0) + 1);
    }
  }

  // Filter to firms with 5+ properties
  const significantFirms = new Map<string, number>();
  for (const [firm, count] of firms) {
    if (count >= 5) {
      significantFirms.set(firm, count);
    }
  }

  return significantFirms;
}
