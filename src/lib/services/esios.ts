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

// In-memory request deduplication to prevent concurrent API calls
const pendingRequests = new Map<string, Promise<any>>();

// In-memory cache for when Redis is slow/unavailable
const memoryCache = new Map<string, { data: any; expires: number }>();
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
        'Accept': 'application/json; application/vnd.esios-api-v1+json',
        'Content-Type': 'application/json',
        'Authorization': `Token token=${token.trim()}`,
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
 * Uses a single bulk API request instead of multiple calls to avoid rate limiting
 * Returns array of {price, datetime} objects
 */
export async function getESIOSHourlyPrices(days: number = 7): Promise<{ price: number; datetime: string }[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);

  const cacheKey = `electricity:esios:bulk:${formatDate(startDate)}:${formatDate(endDate)}`;

  // 1. Check in-memory cache first (fastest)
  const memCached = memoryCache.get(cacheKey);
  if (memCached && memCached.expires > Date.now()) {
    console.log('[ESIOS] Memory cache hit for', days, 'days');
    return memCached.data;
  }

  // 2. Check if there's already a pending request for this key (deduplication)
  const pendingRequest = pendingRequests.get(cacheKey);
  if (pendingRequest) {
    console.log('[ESIOS] Waiting for pending request...');
    return pendingRequest;
  }

  // 3. Check Redis cache
  const cached = await getCached<{ price: number; datetime: string }[]>(cacheKey);
  if (cached) {
    console.log('[ESIOS] Redis cache hit for', days, 'days');
    // Store in memory cache too
    memoryCache.set(cacheKey, { data: cached, expires: Date.now() + MEMORY_CACHE_TTL_MS });
    return cached;
  }

  const token = getToken();
  if (!token) {
    console.error('[ESIOS] Token not configured for bulk request');
    return [];
  }

  // 4. Make the actual API request (with deduplication)
  const requestPromise = (async () => {
    console.log('[ESIOS] Bulk fetching', days, 'days:', formatDate(startDate), 'to', formatDate(endDate));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ESIOS_TIMEOUT_MS * 2);

    try {
      const url = `${ESIOS_API_BASE}/indicators/${INDICATOR_PVPC}?start_date=${formatDate(startDate)}T00:00:00&end_date=${formatDate(endDate)}T23:59:59`;

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json; application/vnd.esios-api-v1+json',
          'Content-Type': 'application/json',
          'Authorization': `Token token=${token.trim()}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ESIOS] Bulk API error: ${response.status} ${response.statusText}`, errorBody);
        return [];
      }

      const data: ESIOSResponse = await response.json();

      if (!data.indicator?.values || data.indicator.values.length === 0) {
        console.error('[ESIOS] Bulk API returned no price data');
        return [];
      }

      console.log('[ESIOS] Bulk API returned', data.indicator.values.length, 'hourly prices');

      const allPrices = data.indicator.values.map(v => ({
        price: v.value / 1000,
        datetime: v.datetime,
      }));

      // Cache in Redis and memory
      await setCache(cacheKey, allPrices, CACHE_TTL_SECONDS / 2);
      memoryCache.set(cacheKey, { data: allPrices, expires: Date.now() + MEMORY_CACHE_TTL_MS });

      return allPrices;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[ESIOS] Bulk API timeout');
      } else {
        console.error('[ESIOS] Bulk API error:', error);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
      pendingRequests.delete(cacheKey);
    }
  })();

  // Store the pending request for deduplication
  pendingRequests.set(cacheKey, requestPromise);

  return requestPromise;
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

/**
 * Price statistics from ESIOS data
 */
export interface ESIOSPriceStats {
  peakPrice: number;      // €/kWh - highest hourly price
  valleyPrice: number;    // €/kWh - lowest hourly price
  averagePrice: number;   // €/kWh - mean price
  spread: number;         // €/kWh - peak minus valley
  volatility: number;     // Standard deviation
  source: 'esios' | 'fallback';
  days: number;           // Number of days of data
}

/**
 * Calculate price statistics from hourly prices
 */
export function calculatePriceStats(prices: { price: number }[]): Omit<ESIOSPriceStats, 'source' | 'days'> {
  if (prices.length === 0) {
    return { peakPrice: 0.24, valleyPrice: 0.08, averagePrice: 0.16, spread: 0.16, volatility: 0 };
  }

  const priceValues = prices.map(p => p.price);
  const peakPrice = Math.max(...priceValues);
  const valleyPrice = Math.min(...priceValues);
  const averagePrice = priceValues.reduce((sum, p) => sum + p, 0) / priceValues.length;
  const spread = peakPrice - valleyPrice;

  // Calculate standard deviation (volatility)
  const squaredDiffs = priceValues.map(p => Math.pow(p - averagePrice, 2));
  const volatility = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / priceValues.length);

  return {
    peakPrice: Math.round(peakPrice * 10000) / 10000,
    valleyPrice: Math.round(valleyPrice * 10000) / 10000,
    averagePrice: Math.round(averagePrice * 10000) / 10000,
    spread: Math.round(spread * 10000) / 10000,
    volatility: Math.round(volatility * 10000) / 10000,
  };
}

/**
 * Get comprehensive price statistics for arbitrage calculations
 * Uses bulk ESIOS data when available, falls back to static tariff data
 */
export async function getESIOSPriceStats(days: number = 7): Promise<ESIOSPriceStats> {
  const hourlyPrices = await getESIOSHourlyPrices(days);

  if (hourlyPrices.length > 0) {
    const stats = calculatePriceStats(hourlyPrices);
    return {
      ...stats,
      source: 'esios',
      days,
    };
  }

  // Fallback to static typical prices from tariff config
  return {
    peakPrice: 0.24,
    valleyPrice: 0.08,
    averagePrice: 0.16,
    spread: 0.16,
    volatility: 0.05,
    source: 'fallback',
    days: 0,
  };
}
