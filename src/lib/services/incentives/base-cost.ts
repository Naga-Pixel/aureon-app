/**
 * Layer 1: Base Cost Calculator
 *
 * Calculates the gross cost of a solar/battery installation
 * applying the correct tax rate (0% IGIC for Canary Islands).
 */

import { isCanaryIslands, getTaxRate, IGIC_CONFIG } from '@/lib/config/incentives/igic';
import type { BaseCostResult } from '@/lib/types/incentives';

export interface BaseCostInput {
  hardwareCost: number;
  installationCost: number;
  postalCode: string;
}

/**
 * Calculate the base cost with applicable taxes
 */
export function calculateBaseCost(input: BaseCostInput): BaseCostResult {
  const { hardwareCost, installationCost, postalCode } = input;

  const subtotal = hardwareCost + installationCost;
  const isCanarias = isCanaryIslands(postalCode);
  const taxRate = getTaxRate(postalCode);
  const taxAmount = subtotal * taxRate;
  const grossCost = subtotal + taxAmount;

  // Calculate savings vs mainland (what they would pay with 21% IVA)
  const taxSavingsVsMainland = isCanarias
    ? subtotal * IGIC_CONFIG.MAINLAND_IVA_RATE
    : 0;

  return {
    subtotal,
    taxRate,
    taxAmount,
    grossCost,
    taxSavingsVsMainland,
    isCanaryIslands: isCanarias,
  };
}

/**
 * Estimate hardware cost based on system size
 */
export function estimateHardwareCost(
  solarKwp: number,
  batteryKwh: number
): { hardwareCost: number; installationCost: number } {
  // 2026 market prices (Canary Islands)
  const SOLAR_COST_PER_KWP = 800; // €/kWp for panels + inverter
  const BATTERY_COST_PER_KWH = 450; // €/kWh for LFP battery
  const INSTALLATION_BASE = 800; // Base installation cost
  const INSTALLATION_PER_KWP = 150; // Additional per kWp
  const INSTALLATION_PER_KWH = 100; // Additional per kWh (battery wiring)

  const hardwareCost =
    solarKwp * SOLAR_COST_PER_KWP + batteryKwh * BATTERY_COST_PER_KWH;

  const installationCost =
    INSTALLATION_BASE +
    solarKwp * INSTALLATION_PER_KWP +
    batteryKwh * INSTALLATION_PER_KWH;

  return {
    hardwareCost: Math.round(hardwareCost),
    installationCost: Math.round(installationCost),
  };
}

/**
 * Format cost breakdown for display
 */
export function formatBaseCostBreakdown(result: BaseCostResult): string {
  const lines = [
    `Subtotal (hardware + instalación): €${result.subtotal.toLocaleString('es-ES')}`,
  ];

  if (result.isCanaryIslands) {
    lines.push(`IGIC (0%): €0`);
    lines.push(
      `Ahorro vs IVA peninsular: €${result.taxSavingsVsMainland.toLocaleString('es-ES')}`
    );
  } else {
    lines.push(
      `IVA (${(result.taxRate * 100).toFixed(0)}%): €${result.taxAmount.toLocaleString('es-ES')}`
    );
  }

  lines.push(`Total bruto: €${result.grossCost.toLocaleString('es-ES')}`);

  return lines.join('\n');
}
