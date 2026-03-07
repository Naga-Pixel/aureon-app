/**
 * Octopus Energy API Service (UK)
 * Fetches Agile tariff prices
 * API Docs: https://developer.octopus.energy/docs/api/
 *
 * No API key required for public tariff data
 */

interface OctopusPrice {
  date: string;
  hour: number;
  price: number; // p/kWh (pence)
  priceEur: number; // €/kWh (converted)
}

interface OctopusResponse {
  count: number;
  results: Array<{
    value_exc_vat: number; // p/kWh excluding VAT
    value_inc_vat: number; // p/kWh including VAT
    valid_from: string;
    valid_to: string;
  }>;
}

interface PriceResult {
  status: 'success' | 'failed';
  averagePrice: number | null; // €/kWh
  averagePricePence: number | null; // p/kWh
  prices: OctopusPrice[] | null;
  source: 'octopus' | 'cache' | 'fallback';
  date: string;
}

// Octopus Agile tariff product code (updates periodically)
const AGILE_PRODUCT = 'AGILE-FLEX-22-11-25';
const AGILE_TARIFF = 'E-1R-AGILE-FLEX-22-11-25-C'; // Region C (South England)
const API_BASE = 'https://api.octopus.energy/v1';
const TIMEOUT_MS = 10000;
const DEFAULT_PRICE_PENCE = 28; // UK average ~28p/kWh
const DEFAULT_PRICE_EUR = 0.33; // ~€0.33/kWh
const GBP_TO_EUR = 1.17; // Approximate exchange rate

// Simple in-memory cache
const priceCache: Map<string, { prices: OctopusPrice[]; averagePrice: number; averagePricePence: number; fetchedAt: Date }> = new Map();
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Check if cache is valid
 */
function isCacheValid(dateKey: string): boolean {
  const cached = priceCache.get(dateKey);
  if (!cached) return false;

  const now = new Date();
  const age = now.getTime() - cached.fetchedAt.getTime();
  return age < CACHE_DURATION_MS;
}

/**
 * Fetch daily electricity prices from Octopus Agile tariff
 * Returns half-hourly prices for the UK
 */
export async function getUKElectricityPrice(date?: Date, region: string = 'C'): Promise<PriceResult> {
  const targetDate = date || new Date();
  const dateString = formatDate(targetDate);
  const cacheKey = `uk-${region}-${dateString}`;

  // Check cache first
  if (isCacheValid(cacheKey)) {
    const cached = priceCache.get(cacheKey)!;
    return {
      status: 'success',
      averagePrice: cached.averagePrice,
      averagePricePence: cached.averagePricePence,
      prices: cached.prices,
      source: 'cache',
      date: dateString,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Build tariff code with region
    const tariffCode = `E-1R-${AGILE_PRODUCT}-${region}`;

    // Octopus API uses period_from and period_to
    const periodFrom = `${dateString}T00:00:00Z`;
    const periodTo = `${dateString}T23:59:59Z`;

    const params = new URLSearchParams({
      period_from: periodFrom,
      period_to: periodTo,
    });

    const url = `${API_BASE}/products/${AGILE_PRODUCT}/electricity-tariffs/${tariffCode}/standard-unit-rates/?${params}`;
    console.log('Octopus API URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Octopus API error: ${response.status} ${response.statusText}`);
      return createFallbackResult(dateString);
    }

    const data: OctopusResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      console.error('Octopus API returned no price data');
      return createFallbackResult(dateString);
    }

    // Parse prices (API returns p/kWh including VAT)
    const prices: OctopusPrice[] = data.results.map(item => {
      const dt = new Date(item.valid_from);
      const pricePence = item.value_inc_vat;
      return {
        date: dateString,
        hour: dt.getHours(),
        price: pricePence, // p/kWh
        priceEur: (pricePence / 100) * GBP_TO_EUR, // Convert to €/kWh
      };
    });

    // Filter out negative prices (can happen with Agile)
    const positivePrices = prices.filter(p => p.price > 0);

    // Calculate daily average in pence
    const averagePricePence = positivePrices.length > 0
      ? positivePrices.reduce((sum, p) => sum + p.price, 0) / positivePrices.length
      : DEFAULT_PRICE_PENCE;

    // Convert to EUR
    const averagePriceEur = (averagePricePence / 100) * GBP_TO_EUR;
    const roundedAveragePence = Math.round(averagePricePence * 100) / 100;
    const roundedAverageEur = Math.round(averagePriceEur * 10000) / 10000;

    // Cache the result
    priceCache.set(cacheKey, {
      prices,
      averagePrice: roundedAverageEur,
      averagePricePence: roundedAveragePence,
      fetchedAt: new Date(),
    });

    return {
      status: 'success',
      averagePrice: roundedAverageEur,
      averagePricePence: roundedAveragePence,
      prices,
      source: 'octopus',
      date: dateString,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Octopus API timeout');
    } else {
      console.error('Octopus API error:', error);
    }
    return createFallbackResult(dateString);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get current average price (convenience method)
 */
export async function getUKCurrentPrice(): Promise<number> {
  const result = await getUKElectricityPrice();
  return result.averagePrice ?? DEFAULT_PRICE_EUR;
}

/**
 * Create fallback result when API fails
 */
function createFallbackResult(dateString: string): PriceResult {
  return {
    status: 'failed',
    averagePrice: DEFAULT_PRICE_EUR,
    averagePricePence: DEFAULT_PRICE_PENCE,
    prices: null,
    source: 'fallback',
    date: dateString,
  };
}

/**
 * Get price source label for display
 */
export function getUKPriceSourceLabel(source: 'octopus' | 'cache' | 'fallback'): string {
  switch (source) {
    case 'octopus':
      return 'Octopus Agile (real-time)';
    case 'cache':
      return 'Octopus Agile (cached)';
    case 'fallback':
      return 'Default price';
  }
}

/**
 * UK region codes for Octopus
 * https://developer.octopus.energy/docs/api/#list-tariffs
 */
export const UK_REGIONS = {
  A: 'Eastern England',
  B: 'East Midlands',
  C: 'London',
  D: 'Merseyside and North Wales',
  E: 'West Midlands',
  F: 'North Eastern England',
  G: 'North Western England',
  H: 'Southern England',
  J: 'South Eastern England',
  K: 'South Wales',
  L: 'South Western England',
  M: 'Yorkshire',
  N: 'Southern Scotland',
  P: 'Northern Scotland',
} as const;
