/**
 * ESIOS API Service
 * Fetches electricity prices from Red Eléctrica de España
 * API Docs: https://api.esios.ree.es/
 *
 * Indicator 1001: PVPC (Precio Voluntario para el Pequeño Consumidor)
 */

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

// Simple in-memory cache (persists for server lifetime)
const priceCache: Map<string, { prices: ESIOSPrice[]; averagePrice: number; fetchedAt: Date }> = new Map();
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

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
 * Get today's date string
 */
function getTodayString(): string {
  return formatDate(new Date());
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
 * Fetch daily electricity prices from ESIOS API
 */
export async function getElectricityPrice(date?: Date): Promise<PriceResult> {
  const targetDate = date || new Date();
  const dateString = formatDate(targetDate);

  // Check cache first
  if (isCacheValid(dateString)) {
    const cached = priceCache.get(dateString)!;
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
    console.warn('ESIOS API token not configured, using fallback price');
    return createFallbackResult(dateString);
  }

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
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': token,
      },
    });

    if (!response.ok) {
      console.error(`ESIOS API error: ${response.status} ${response.statusText}`);
      return createFallbackResult(dateString);
    }

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

    // Cache the result
    priceCache.set(dateString, {
      prices,
      averagePrice: roundedAverage,
      fetchedAt: new Date(),
    });

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
