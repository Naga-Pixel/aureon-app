/**
 * Energy-Charts API Service (Germany)
 * Fetches electricity prices from Fraunhofer ISE
 * API Docs: https://api.energy-charts.info/
 *
 * No API key required - public API
 */

interface EnergyChartsPrice {
  date: string;
  hour: number;
  price: number; // €/MWh
}

interface EnergyChartsResponse {
  unix_seconds: number[];
  price: number[]; // €/MWh
}

interface PriceResult {
  status: 'success' | 'failed';
  averagePrice: number | null; // €/kWh
  prices: EnergyChartsPrice[] | null;
  source: 'energy-charts' | 'cache' | 'fallback';
  date: string;
}

const API_BASE = 'https://api.energy-charts.info/price';
const TIMEOUT_MS = 10000;
const DEFAULT_PRICE_EUR_KWH = 0.30; // Germany average ~€0.30/kWh

// Simple in-memory cache
const priceCache: Map<string, { prices: EnergyChartsPrice[]; averagePrice: number; fetchedAt: Date }> = new Map();
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
 * Fetch daily electricity prices from Energy-Charts API
 * Returns day-ahead prices for Germany
 */
export async function getGermanyElectricityPrice(date?: Date): Promise<PriceResult> {
  const targetDate = date || new Date();
  const dateString = formatDate(targetDate);
  const cacheKey = `de-${dateString}`;

  // Check cache first
  if (isCacheValid(cacheKey)) {
    const cached = priceCache.get(cacheKey)!;
    return {
      status: 'success',
      averagePrice: cached.averagePrice,
      prices: cached.prices,
      source: 'cache',
      date: dateString,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Energy-Charts API expects start and end dates
    const params = new URLSearchParams({
      bzn: 'DE-LU', // Germany-Luxembourg bidding zone
      start: dateString,
      end: dateString,
    });

    const url = `${API_BASE}?${params}`;
    console.log('Energy-Charts API URL:', url);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Energy-Charts API error: ${response.status} ${response.statusText}`);
      return createFallbackResult(dateString);
    }

    const data: EnergyChartsResponse = await response.json();

    if (!data.unix_seconds || !data.price || data.price.length === 0) {
      console.error('Energy-Charts API returned no price data');
      return createFallbackResult(dateString);
    }

    // Parse prices (API returns €/MWh, we need €/kWh)
    const prices: EnergyChartsPrice[] = data.unix_seconds.map((timestamp, i) => {
      const dt = new Date(timestamp * 1000);
      return {
        date: dateString,
        hour: dt.getHours(),
        price: data.price[i] / 1000, // Convert €/MWh to €/kWh
      };
    });

    // Filter out negative prices (can happen with renewables surplus)
    const positivePrices = prices.filter(p => p.price > 0);

    // Calculate daily average
    const averagePrice = positivePrices.length > 0
      ? positivePrices.reduce((sum, p) => sum + p.price, 0) / positivePrices.length
      : DEFAULT_PRICE_EUR_KWH;
    const roundedAverage = Math.round(averagePrice * 10000) / 10000;

    // Cache the result
    priceCache.set(cacheKey, {
      prices,
      averagePrice: roundedAverage,
      fetchedAt: new Date(),
    });

    return {
      status: 'success',
      averagePrice: roundedAverage,
      prices,
      source: 'energy-charts',
      date: dateString,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Energy-Charts API timeout');
    } else {
      console.error('Energy-Charts API error:', error);
    }
    return createFallbackResult(dateString);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get current average price (convenience method)
 */
export async function getGermanyCurrentPrice(): Promise<number> {
  const result = await getGermanyElectricityPrice();
  return result.averagePrice ?? DEFAULT_PRICE_EUR_KWH;
}

/**
 * Create fallback result when API fails
 */
function createFallbackResult(dateString: string): PriceResult {
  return {
    status: 'failed',
    averagePrice: DEFAULT_PRICE_EUR_KWH,
    prices: null,
    source: 'fallback',
    date: dateString,
  };
}

/**
 * Get price source label for display
 */
export function getGermanyPriceSourceLabel(source: 'energy-charts' | 'cache' | 'fallback'): string {
  switch (source) {
    case 'energy-charts':
      return 'Energy-Charts (tiempo real)';
    case 'cache':
      return 'Energy-Charts (caché)';
    case 'fallback':
      return 'Precio por defecto';
  }
}
