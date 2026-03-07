/**
 * Unified Electricity Price Service
 * Supports Spain (ESIOS), Germany (Energy-Charts), UK (Octopus)
 */

import { getElectricityPrice as getESIOSPrice } from './esios';
import { getGermanyElectricityPrice } from './energy-charts';
import { getUKElectricityPrice } from './octopus-energy';

export type Country = 'ES' | 'DE' | 'UK';

export interface ElectricityPriceResult {
  status: 'success' | 'failed';
  averagePrice: number; // €/kWh
  source: string;
  country: Country;
  date: string;
}

export const COUNTRIES = [
  { code: 'ES' as Country, label: 'España', api: 'ESIOS (PVPC)', defaultPrice: 0.20 },
  { code: 'DE' as Country, label: 'Alemania', api: 'Energy-Charts', defaultPrice: 0.30 },
  { code: 'UK' as Country, label: 'Reino Unido', api: 'Octopus Agile', defaultPrice: 0.33 },
] as const;

/**
 * Get electricity price for a specific country
 */
export async function getElectricityPriceByCountry(country: Country): Promise<ElectricityPriceResult> {
  const countryConfig = COUNTRIES.find(c => c.code === country);
  const defaultPrice = countryConfig?.defaultPrice ?? 0.25;

  switch (country) {
    case 'ES': {
      const result = await getESIOSPrice();
      return {
        status: result.status,
        averagePrice: result.averagePrice ?? defaultPrice,
        source: result.source === 'esios' ? 'ESIOS' : result.source === 'cache' ? 'ESIOS (caché)' : 'Por defecto',
        country,
        date: result.date,
      };
    }

    case 'DE': {
      const result = await getGermanyElectricityPrice();
      return {
        status: result.status,
        averagePrice: result.averagePrice ?? defaultPrice,
        source: result.source === 'energy-charts' ? 'Energy-Charts' : result.source === 'cache' ? 'Energy-Charts (caché)' : 'Por defecto',
        country,
        date: result.date,
      };
    }

    case 'UK': {
      const result = await getUKElectricityPrice();
      return {
        status: result.status,
        averagePrice: result.averagePrice ?? defaultPrice,
        source: result.source === 'octopus' ? 'Octopus Agile' : result.source === 'cache' ? 'Octopus (caché)' : 'Por defecto',
        country,
        date: result.date,
      };
    }

    default:
      return {
        status: 'failed',
        averagePrice: defaultPrice,
        source: 'Por defecto',
        country,
        date: new Date().toISOString().split('T')[0],
      };
  }
}

/**
 * Get default price for a country
 */
export function getDefaultPrice(country: Country): number {
  const config = COUNTRIES.find(c => c.code === country);
  return config?.defaultPrice ?? 0.25;
}

/**
 * Get country label
 */
export function getCountryLabel(country: Country): string {
  const config = COUNTRIES.find(c => c.code === country);
  return config?.label ?? country;
}

/**
 * Get API name for country
 */
export function getCountryApiName(country: Country): string {
  const config = COUNTRIES.find(c => c.code === country);
  return config?.api ?? 'Unknown';
}
