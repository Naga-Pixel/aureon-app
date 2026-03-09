// Spanish Electricity Tariff Configuration
// Based on 2024 PVPC and regulated tariff structures

/**
 * Typical hourly PVPC price profile (€/kWh)
 * Based on historical averages - prices vary by season and day
 * Source: REE historical data patterns
 */
export const TYPICAL_HOURLY_PRICES: Record<'weekday' | 'weekend', number[]> = {
  // Weekday pattern (Mon-Fri) - higher midday and evening peaks
  weekday: [
    0.08, 0.07, 0.06, 0.06, 0.06, 0.07, // 00:00 - 05:59 (valley)
    0.10, 0.14, 0.18, 0.20, 0.19, 0.17, // 06:00 - 11:59 (morning ramp + peak)
    0.15, 0.14, 0.13, 0.14, 0.16, 0.19, // 12:00 - 17:59 (midday dip + afternoon)
    0.22, 0.24, 0.23, 0.18, 0.12, 0.09, // 18:00 - 23:59 (evening peak + decline)
  ],
  // Weekend pattern (Sat-Sun) - flatter, lower overall
  weekend: [
    0.06, 0.05, 0.05, 0.05, 0.05, 0.06, // 00:00 - 05:59
    0.07, 0.09, 0.11, 0.12, 0.12, 0.11, // 06:00 - 11:59
    0.10, 0.10, 0.10, 0.11, 0.12, 0.14, // 12:00 - 17:59
    0.16, 0.17, 0.15, 0.12, 0.09, 0.07, // 18:00 - 23:59
  ],
};

/**
 * 2.0TD Tariff periods (residential/small commercial <15kW)
 * P1: Peak, P2: Flat, P3: Valley
 */
export const TARIFF_2_0TD = {
  name: '2.0TD',
  maxPowerKw: 15,
  // Hours for each period (0-23)
  periods: {
    // Winter (Nov-Feb) and Summer (Jul-Aug) have different peaks
    winterWeekday: {
      P1: [18, 19, 20, 21], // Peak: 18:00-22:00
      P2: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23], // Flat
      P3: [0, 1, 2, 3, 4, 5, 6, 7], // Valley
    },
    summerWeekday: {
      P1: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], // Peak extended
      P2: [8, 9, 22, 23],
      P3: [0, 1, 2, 3, 4, 5, 6, 7],
    },
    weekend: {
      P1: [] as number[],
      P2: [] as number[],
      P3: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // All valley
    },
  },
  // Typical prices by period (€/kWh) - 2024 averages
  prices: {
    P1: 0.22,
    P2: 0.15,
    P3: 0.08,
  },
};

/**
 * 3.0TD Tariff periods (commercial/industrial >15kW)
 * 6 periods, more complex structure
 */
export const TARIFF_3_0TD = {
  name: '3.0TD',
  minPowerKw: 15,
  periods: {
    weekday: {
      P1: [10, 11, 12, 13, 18, 19, 20, 21], // Super peak
      P2: [8, 9, 14, 15, 16, 17, 22, 23], // Peak
      P3: [0, 1, 2, 3, 4, 5, 6, 7], // Valley
    },
    weekend: {
      P1: [] as number[],
      P2: [] as number[],
      P3: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    },
  },
  prices: {
    P1: 0.25,
    P2: 0.18,
    P3: 0.09,
  },
};

/**
 * Calculate average daily price spread (peak vs valley)
 * This determines arbitrage potential
 */
export function calculateDailySpread(isWeekend: boolean = false): { peakPrice: number; valleyPrice: number; spread: number } {
  const prices = isWeekend ? TYPICAL_HOURLY_PRICES.weekend : TYPICAL_HOURLY_PRICES.weekday;

  const peakPrice = Math.max(...prices);
  const valleyPrice = Math.min(...prices);
  const spread = peakPrice - valleyPrice;

  return { peakPrice, valleyPrice, spread };
}

/**
 * Calculate weighted average daily spread accounting for weekdays/weekends
 */
export function getAverageArbitrageSpread(): number {
  const weekdaySpread = calculateDailySpread(false).spread;
  const weekendSpread = calculateDailySpread(true).spread;

  // 5 weekdays + 2 weekend days
  return (weekdaySpread * 5 + weekendSpread * 2) / 7;
}

/**
 * Get optimal charging/discharging hours for arbitrage
 */
export function getArbitrageSchedule(tariff: '2.0TD' | '3.0TD' = '2.0TD'): {
  chargeHours: number[];
  dischargeHours: number[];
  expectedSpread: number;
} {
  // Simplified: use common valley/peak hours
  let chargeHours: number[];
  let dischargeHours: number[];
  let expectedSpread: number;

  if (tariff === '2.0TD') {
    chargeHours = TARIFF_2_0TD.periods.winterWeekday.P3;
    dischargeHours = TARIFF_2_0TD.periods.winterWeekday.P1;
    expectedSpread = TARIFF_2_0TD.prices.P1 - TARIFF_2_0TD.prices.P3;
  } else {
    chargeHours = TARIFF_3_0TD.periods.weekday.P3;
    dischargeHours = TARIFF_3_0TD.periods.weekday.P1;
    expectedSpread = TARIFF_3_0TD.prices.P1 - TARIFF_3_0TD.prices.P3;
  }

  return { chargeHours, dischargeHours, expectedSpread };
}

/**
 * Estimate annual arbitrage savings
 */
export function estimateArbitrageSavings(
  dailyShiftableKwh: number,
  tariff: '2.0TD' | '3.0TD' = '2.0TD',
  batteryEfficiency: number = 0.90
): number {
  const schedule = getArbitrageSchedule(tariff);

  // Account for battery round-trip efficiency
  const effectiveShift = dailyShiftableKwh * batteryEfficiency;

  // Arbitrage only works on weekdays (260 days/year approx)
  const arbitrageDays = 260;

  return effectiveShift * schedule.expectedSpread * arbitrageDays;
}
