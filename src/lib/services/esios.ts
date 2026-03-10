/**
 * ESIOS API Service
 * Fetches electricity prices from Red Eléctrica de España
 * API Docs: https://api.esios.ree.es/
 *
 * Indicator 1001: PVPC (Precio Voluntario para el Pequeño Consumidor)
 */

import { getCached, setCache } from '@/lib/cache/redis';

interface ESIOSPrice {
  date: string;
  hour: number;
  price: number; // €/MWh
}

interface ESIOSResponse {
  indicator: {
    values: Array<{
      datetime: string;
      value: number;
    }>;
  };
}

interface CachedPrice {
  prices: ESIOSPrice[];
  averagePrice: number;
}

interface PriceResult {
  status: 'success' | 'failed';
  averagePrice: number | null; // €/kWh
  prices: ESIOSPrice[] | null;
  source: 'esios' | 'cache' | 'fallback';
  date: string;
}

const ESIOS_API_BASE = 'https://api.esios.ree.es';
const INDICATOR_PVPC = 1001;
const ESIOS_TIMEOUT_MS = 10000;
const DEFAULT_PRICE_EUR_KWH = 0.20;
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Get ESIOS API token from environment
 */
function getToken(): string | null {
  return process.env.ESIOS_API_TOKEN || null;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Fetch daily electricity prices from ESIOS API
 */
export async function getElectricityPrice(date?: Date): Promise<PriceResult> {
  const targetDate = date || new Date();
  const dateString = formatDate(targetDate);
  const cacheKey = `electricity:esios:${dateString}`;

  // Check Redis cache first
  const cached = await getCached<CachedPrice>(cacheKey);
  if (cached) {
    return {
      status: 'success',
      averagePrice: cached.averagePrice,
      prices: cached.prices,
      source: 'cache',
      date: dateString,
    };
  }

  const token = getToken();

  if (!token) {
    console.error('[ESIOS] Token not configured - ESIOS_API_TOKEN env var missing');
    return createFallbackResult(dateString);
  }

  console.log('[ESIOS] Fetching prices for', dateString, 'token length:', token.length);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ESIOS_TIMEOUT_MS);

  try {
    // ESIOS expects date range
    const startDate = `${dateString}T00:00:00`;
    const endDate = `${dateString}T23:59:59`;

    const url = `${ESIOS_API_BASE}/indicators/${INDICATOR_PVPC}?start_date=${startDate}&end_date=${endDate}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json; application/xls',
        'Content-Type': 'application/json',
        'Host': 'api.esios.ree.es',
        'Authorization': `Token token="${token.trim()}"`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[ESIOS] API error: ${response.status} ${response.statusText}`, errorBody);
      return createFallbackResult(dateString);
    }

    console.log('[ESIOS] API response OK');

    const data: ESIOSResponse = await response.json();

    if (!data.indicator?.values || data.indicator.values.length === 0) {
      console.error('ESIOS API returned no price data');
      return createFallbackResult(dateString);
    }

    // Parse prices (ESIOS returns €/MWh, we need €/kWh)
    const prices: ESIOSPrice[] = data.indicator.values.map(v => {
      const datetime = new Date(v.datetime);
      return {
        date: dateString,
        hour: datetime.getHours(),
        price: v.value / 1000, // Convert €/MWh to €/kWh
      };
    });

    // Calculate daily average
    const averagePrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
    const roundedAverage = Math.round(averagePrice * 10000) / 10000; // 4 decimal places

    // Cache the result in Redis
    await setCache(cacheKey, { prices, averagePrice: roundedAverage }, CACHE_TTL_SECONDS);

    return {
      status: 'success',
      averagePrice: roundedAverage,
      prices,
      source: 'esios',
      date: dateString,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('ESIOS API timeout');
    } else {
      console.error('ESIOS API error:', error);
    }
    return createFallbackResult(dateString);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get current average price (convenience method)
 */
export async function getCurrentAveragePrice(): Promise<number> {
  const result = await getElectricityPrice();
  return result.averagePrice ?? DEFAULT_PRICE_EUR_KWH;
}

/**
 * Get hourly prices for the last N days (for volatility calculation)
 * Returns array of {price, datetime} objects
 */
export async function getESIOSHourlyPrices(days: number = 7): Promise<{ price: number; datetime: string }[]> {
  const allPrices: { price: number; datetime: string }[] = [];

  // Fetch prices for each day
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const result = await getElectricityPrice(date);

    if (result.prices) {
      for (const p of result.prices) {
        allPrices.push({
          price: p.price,
          datetime: `${p.date}T${String(p.hour).padStart(2, '0')}:00:00`,
        });
      }
    }
  }

  return allPrices;
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
 * Get price description for display
 */
export function getPriceSourceLabel(source: 'esios' | 'cache' | 'fallback'): string {
  switch (source) {
    case 'esios':
      return 'ESIOS (tiempo real)';
    case 'cache':
      return 'ESIOS (caché)';
    case 'fallback':
      return 'Precio por defecto';
  }
}
