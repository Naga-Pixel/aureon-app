/**
 * Cartociudad Geocoding Service (Spanish Government)
 * Free, no API key required, better coverage for Spain than Nominatim
 * Returns cadastral reference when available
 * https://www.cartociudad.es/
 *
 * Optimized for Canary Islands addresses with intelligent candidate scoring.
 */

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  cadastralReference?: string;
}

interface CartociudadCandidate {
  id: string;
  province: string;
  provinceCode: string;
  muni: string;
  type: string;
  address: string;
  postalCode: string;
  poblacion: string;
  tip_via: string;
  lat: number;
  lng: number;
  portalNumber: number | null;
  refCatastral?: string;
  state?: number;
}

// Canary Islands province codes
const CANARY_PROVINCE_CODES = ['35', '38']; // Las Palmas, Santa Cruz de Tenerife

/**
 * Extract the street number from an address string
 */
function extractStreetNumber(address: string): number | null {
  // Match common patterns: "Calle X 40", "C/ X, 40", "X numero 40", etc.
  const patterns = [
    /\b(\d+)\s*$/,                    // Number at end
    /,\s*(\d+)/,                       // After comma
    /\bnumero\s*(\d+)/i,              // "numero 40"
    /\bn[º°]\s*(\d+)/i,               // "nº 40"
    /\s(\d+)\s*,/,                    // Before comma
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/**
 * Normalize address for comparison (lowercase, no accents, simplified)
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score a candidate result - higher is better
 */
function scoreCandidate(
  candidate: CartociudadCandidate,
  originalAddress: string,
  requestedNumber: number | null
): number {
  let score = 0;

  // Strong preference for Canary Islands results
  if (CANARY_PROVINCE_CODES.includes(candidate.provinceCode)) {
    score += 100;
  }

  // Prefer portal (exact address) over toponimo (landmark)
  if (candidate.type === 'portal') {
    score += 50;
  } else if (candidate.type === 'toponimo') {
    score += 10;
  }

  // Bonus for having cadastral reference
  if (candidate.refCatastral) {
    score += 30;
  }

  // Bonus for portal number match/proximity
  if (requestedNumber !== null && candidate.portalNumber !== null) {
    const diff = Math.abs(candidate.portalNumber - requestedNumber);
    if (diff === 0) {
      score += 40; // Exact match
    } else if (diff <= 2) {
      score += 30; // Very close
    } else if (diff <= 5) {
      score += 20; // Close
    } else if (diff <= 10) {
      score += 10; // Nearby
    }
  }

  // Check if municipality appears in original address
  const normalizedAddress = normalizeForComparison(originalAddress);
  const normalizedMuni = normalizeForComparison(candidate.muni);
  const normalizedPoblacion = normalizeForComparison(candidate.poblacion);

  if (normalizedAddress.includes(normalizedMuni)) {
    score += 25;
  }
  if (normalizedAddress.includes(normalizedPoblacion)) {
    score += 15;
  }

  return score;
}

/**
 * Query Cartociudad candidates endpoint - returns multiple results
 */
async function queryCandidates(query: string): Promise<CartociudadCandidate[]> {
  const encodedAddress = encodeURIComponent(query);
  const url = `https://www.cartociudad.es/geocoder/api/geocoder/candidatesJsonp?q=${encodedAddress}&limit=15&autocancel=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const text = await response.text();
    const jsonMatch = text.match(/callback\((.*)\)/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[1]);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((c: CartociudadCandidate) => c.lat && c.lng);
  } catch {
    return [];
  }
}

/**
 * Fallback to Nominatim if Cartociudad fails
 */
async function nominatimFallback(address: string): Promise<GeocodingResult | null> {
  try {
    // Add Canarias to help Nominatim find the right region
    const searchQuery = address.toLowerCase().includes('canaria')
      ? address
      : `${address}, Canarias, España`;

    const encodedAddress = encodeURIComponent(searchQuery);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&countrycodes=es`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Aureon Solar Assessment Tool' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data || data.length === 0) return null;

    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      formattedAddress: result.display_name,
    };
  } catch {
    return null;
  }
}

/**
 * Clean and prepare address for geocoding
 */
function prepareAddress(address: string): string {
  return address
    // Normalize street type abbreviations to expanded form
    .replace(/\bC\.\s*/gi, 'Calle ')
    .replace(/\bC\/\s*/gi, 'Calle ')
    .replace(/\bAvda\.?\s*/gi, 'Avenida ')
    .replace(/\bAv\.\s*/gi, 'Avenida ')
    .replace(/\bPza\.?\s*/gi, 'Plaza ')
    .replace(/\bPl\.\s*/gi, 'Plaza ')
    .replace(/\bCtra\.?\s*/gi, 'Carretera ')
    .replace(/\bPº\.?\s*/gi, 'Paseo ')
    // Remove postal codes - they break Cartociudad searches
    .replace(/\b\d{5}\b/g, '')
    // Remove noise
    .replace(/,?\s*parcela\s+[\d\-]+/gi, '')
    .replace(/,?\s*esquina\s+\w+/gi, '')
    .replace(/(\d+)[A-Za-z]+\b/g, '$1') // 250M -> 250
    // Remove commas - Cartociudad works better without them
    .replace(/,/g, ' ')
    // Clean up spacing
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Common Canary Islands municipalities for extraction
 */
const CANARY_MUNICIPALITIES = [
  'Las Palmas de Gran Canaria', 'Las Palmas', 'Santa Cruz de Tenerife', 'Telde',
  'Arrecife', 'San Bartolomé de Tirajana', 'Santa Lucía de Tirajana', 'Arucas',
  'Agüimes', 'Aguimes', 'Teguise', 'Puerto del Rosario', 'Gáldar', 'Galdar',
  'Ingenio', 'Mogán', 'Mogan', 'La Laguna', 'La Orotava', 'Adeje', 'Granadilla',
  'Puerto de la Cruz', 'Güímar', 'Guimar', 'Candelaria', 'Tacoronte', 'Icod',
  'Vecindario', 'Maspalomas', 'Playa del Inglés', 'Gran Canaria', 'Tenerife',
  'Lanzarote', 'Fuerteventura', 'La Palma', 'La Gomera', 'El Hierro',
];

/**
 * Extract municipality from address - finds the FIRST municipality by position
 */
function extractMunicipality(address: string): string | null {
  const normalized = address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let firstMuni: string | null = null;
  let firstIndex = Infinity;

  for (const muni of CANARY_MUNICIPALITIES) {
    const normalizedMuni = muni.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const index = normalized.indexOf(normalizedMuni);
    if (index !== -1 && index < firstIndex) {
      firstIndex = index;
      firstMuni = muni;
    }
  }

  return firstMuni;
}

/**
 * Generate query variants to handle different naming conventions
 * Spanish addresses have many variations: articles, plurals, abbreviations
 */
function generateQueryVariants(address: string): string[] {
  const base = prepareAddress(address);
  const variants = [base];
  const seen = new Set([base]);

  const municipality = extractMunicipality(address);

  // Variant 1: Remove common articles (los, las, el, la)
  const withoutArticles = base
    .replace(/\b(los|las|el|la)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!seen.has(withoutArticles) && withoutArticles.length > 10) {
    variants.push(withoutArticles);
    seen.add(withoutArticles);
  }

  // Variant 2: Singularize street name words (Dragos -> Drago) but keep municipality intact
  // First, extract everything before the municipality
  let streetPart = withoutArticles;
  if (municipality) {
    const muniIndex = streetPart.toLowerCase().indexOf(municipality.toLowerCase().split(' ')[0]);
    if (muniIndex > 0) {
      streetPart = streetPart.substring(0, muniIndex).trim();
    }
  }

  // Singularize the street part
  const singularStreet = streetPart.replace(/\b(\w{4,})s\b/gi, '$1');

  // Create query with singularized street + municipality
  const singularQuery = municipality
    ? `${singularStreet} ${municipality}`
    : singularStreet;

  if (!seen.has(singularQuery) && singularQuery.length > 10) {
    variants.push(singularQuery);
    seen.add(singularQuery);
  }

  // Variant 3: Just street + first word of municipality (minimal query)
  if (municipality) {
    const minimalQuery = `${singularStreet} ${municipality.split(' ')[0]}`;
    if (!seen.has(minimalQuery) && minimalQuery.length > 8) {
      variants.push(minimalQuery);
      seen.add(minimalQuery);
    }
  }

  // Variant 4: Add "Canarias" suffix to help Cartociudad prioritize Canary Islands results
  if (municipality && !base.toLowerCase().includes('canaria')) {
    const canariasQuery = `${singularStreet} ${municipality} Canarias`;
    if (!seen.has(canariasQuery)) {
      variants.push(canariasQuery);
      seen.add(canariasQuery);
    }
  }

  return variants;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const queryVariants = generateQueryVariants(address);
  const requestedNumber = extractStreetNumber(address);

  console.log('Geocoding variants:', queryVariants, '| Requested number:', requestedNumber);

  // Try each query variant and collect all candidates
  let allCandidates: CartociudadCandidate[] = [];

  for (const query of queryVariants) {
    const candidates = await queryCandidates(query);
    allCandidates = allCandidates.concat(candidates);

    // If we found good results, no need to try more variants
    const hasCanaryResult = candidates.some(
      c => CANARY_PROVINCE_CODES.includes(c.provinceCode) && c.type === 'portal'
    );
    if (hasCanaryResult) break;
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  const candidates = allCandidates.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  console.log('Cartociudad returned', candidates.length, 'unique candidates');

  if (candidates.length > 0) {
    // Score all candidates
    const scored = candidates.map(c => ({
      candidate: c,
      score: scoreCandidate(c, address, requestedNumber),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Log top candidates for debugging
    scored.slice(0, 3).forEach((s, i) => {
      console.log(`  ${i + 1}. score=${s.score} type=${s.candidate.type} muni=${s.candidate.muni} portal=${s.candidate.portalNumber} ref=${s.candidate.refCatastral || 'none'}`);
    });

    const best = scored[0];

    // Accept result if it has a reasonable score (Canary Islands + portal or has ref)
    if (best.score >= 100) {
      const result = best.candidate;

      const formattedAddress = [
        result.tip_via,
        result.address,
        result.portalNumber,
        result.poblacion,
        result.postalCode,
        result.muni,
        result.province,
      ]
        .filter(Boolean)
        .join(' ');

      return {
        latitude: result.lat,
        longitude: result.lng,
        formattedAddress: formattedAddress || `${result.address}, ${result.muni}`,
        cadastralReference: result.refCatastral || undefined,
      };
    }
  }

  // Fallback to Nominatim
  console.log('No good Cartociudad result, trying Nominatim fallback...');
  const fallbackResult = await nominatimFallback(address);
  if (fallbackResult) {
    return fallbackResult;
  }

  throw new Error('No se encontró la dirección. Intenta con el formato: "Calle Nombre 123, Municipio"');
}
