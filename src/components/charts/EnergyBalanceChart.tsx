'use client';

import { useMemo } from 'react';
import type { HourlyBalance, DailyEnergyBalance } from '@/lib/services/energy-balance';

interface EnergyBalanceChartProps {
  balance: DailyEnergyBalance;
  height?: number;
  showLegend?: boolean;
  compact?: boolean;
}

/**
 * 24-hour energy balance chart
 *
 * Shows:
 * - Green area: Solar generation
 * - Blue line: Aggregate consumption
 * - Shaded regions for self-consumed, exported, imported
 */
export function EnergyBalanceChart({
  balance,
  height = 200,
  showLegend = true,
  compact = false,
}: EnergyBalanceChartProps) {
  const { hourly, totals, selfConsumptionRatio, selfSufficiencyRatio } = balance;

  // Chart dimensions
  const width = 100; // Percentage width
  const padding = { top: 10, right: 10, bottom: 25, left: 35 };
  const chartWidth = 100 - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    const maxGen = Math.max(...hourly.map(h => h.generationKwh));
    const maxCon = Math.max(...hourly.map(h => h.consumptionKwh));
    return Math.max(maxGen, maxCon, 1) * 1.1; // 10% headroom
  }, [hourly]);

  // Generate path points
  const generatePoints = useMemo(() => {
    const points: { x: number; genY: number; conY: number }[] = [];
    const barWidth = chartWidth / 24;

    for (let i = 0; i < 24; i++) {
      const h = hourly[i];
      const x = (i / 24) * chartWidth;
      const genY = chartHeight - (h.generationKwh / maxValue) * chartHeight;
      const conY = chartHeight - (h.consumptionKwh / maxValue) * chartHeight;
      points.push({ x, genY, conY });
    }

    return points;
  }, [hourly, chartWidth, chartHeight, maxValue]);

  // Generate SVG paths
  const generationPath = useMemo(() => {
    const pts = generatePoints;
    let d = `M ${pts[0].x} ${chartHeight}`;
    pts.forEach(pt => {
      d += ` L ${pt.x} ${pt.genY}`;
    });
    d += ` L ${pts[pts.length - 1].x} ${chartHeight} Z`;
    return d;
  }, [generatePoints, chartHeight]);

  const consumptionPath = useMemo(() => {
    const pts = generatePoints;
    let d = `M ${pts[0].x} ${pts[0].conY}`;
    pts.slice(1).forEach(pt => {
      d += ` L ${pt.x} ${pt.conY}`;
    });
    return d;
  }, [generatePoints]);

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const tickCount = 4;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push((maxValue / tickCount) * i);
    }
    return ticks;
  }, [maxValue]);

  // X-axis labels (every 6 hours)
  const xLabels = [0, 6, 12, 18, 24];

  if (compact) {
    // Compact mini version for sidebar
    return (
      <div className="w-full">
        <svg
          viewBox={`0 0 100 ${height}`}
          className="w-full"
          style={{ height: `${height}px` }}
        >
          <defs>
            <linearGradient id="genGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#a7e26e" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a7e26e" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {/* Generation area */}
            <path
              d={generationPath}
              fill="url(#genGradient)"
              stroke="#a7e26e"
              strokeWidth="1"
            />

            {/* Consumption line */}
            <path
              d={consumptionPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* X-axis */}
            <line
              x1="0"
              y1={chartHeight}
              x2={chartWidth}
              y2={chartHeight}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          </g>
        </svg>

        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Autoconsumo: {Math.round(selfConsumptionRatio * 100)}%</span>
          <span>Autosuficiencia: {Math.round(selfSufficiencyRatio * 100)}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 100 ${height}`}
        className="w-full"
        style={{ height: `${height}px` }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="generationGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a7e26e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#a7e26e" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Grid lines */}
          {yTicks.map((tick, i) => {
            const y = chartHeight - (tick / maxValue) * chartHeight;
            return (
              <g key={i}>
                <line
                  x1="0"
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="#f3f4f6"
                  strokeWidth="0.5"
                />
                <text
                  x="-2"
                  y={y + 1}
                  textAnchor="end"
                  className="text-[3px] fill-gray-400"
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Generation area */}
          <path
            d={generationPath}
            fill="url(#generationGradient)"
            stroke="#a7e26e"
            strokeWidth="0.5"
          />

          {/* Consumption line */}
          <path
            d={consumptionPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* X-axis */}
          <line
            x1="0"
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="#e5e7eb"
            strokeWidth="0.5"
          />

          {/* X-axis labels */}
          {xLabels.map(hour => {
            const x = (hour / 24) * chartWidth;
            return (
              <text
                key={hour}
                x={x}
                y={chartHeight + 8}
                textAnchor="middle"
                className="text-[3px] fill-gray-500"
              >
                {hour}h
              </text>
            );
          })}

          {/* Y-axis label */}
          <text
            x={-chartHeight / 2}
            y={-padding.left + 8}
            transform="rotate(-90)"
            textAnchor="middle"
            className="text-[3px] fill-gray-500"
          >
            kWh
          </text>
        </g>
      </svg>

      {showLegend && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-[#a7e26e]" />
            <span className="text-gray-600">Generación ({totals.generationKwh.toFixed(0)} kWh)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span className="text-gray-600">Consumo ({totals.consumptionKwh.toFixed(0)} kWh)</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div className="bg-green-50 rounded p-2">
          <div className="text-green-700 font-medium">{Math.round(selfConsumptionRatio * 100)}%</div>
          <div className="text-green-600 text-[10px]">Autoconsumo</div>
        </div>
        <div className="bg-blue-50 rounded p-2">
          <div className="text-blue-700 font-medium">{Math.round(selfSufficiencyRatio * 100)}%</div>
          <div className="text-blue-600 text-[10px]">Autosuficiencia</div>
        </div>
        <div className="bg-amber-50 rounded p-2">
          <div className="text-amber-700 font-medium">{totals.gridExportKwh.toFixed(0)} kWh</div>
          <div className="text-amber-600 text-[10px]">Excedente</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mini sparkline version for ranking panel
 */
export function EnergyBalanceSparkline({
  balance,
  width = 60,
  height = 24,
}: {
  balance: DailyEnergyBalance;
  width?: number;
  height?: number;
}) {
  const { hourly } = balance;

  const maxValue = useMemo(() => {
    const maxGen = Math.max(...hourly.map(h => h.generationKwh));
    const maxCon = Math.max(...hourly.map(h => h.consumptionKwh));
    return Math.max(maxGen, maxCon, 1);
  }, [hourly]);

  const genPath = useMemo(() => {
    let d = `M 0 ${height}`;
    hourly.forEach((h, i) => {
      const x = (i / 23) * width;
      const y = height - (h.generationKwh / maxValue) * height;
      d += ` L ${x} ${y}`;
    });
    d += ` L ${width} ${height} Z`;
    return d;
  }, [hourly, width, height, maxValue]);

  const conPath = useMemo(() => {
    let d = `M 0 ${height - (hourly[0].consumptionKwh / maxValue) * height}`;
    hourly.slice(1).forEach((h, i) => {
      const x = ((i + 1) / 23) * width;
      const y = height - (h.consumptionKwh / maxValue) * height;
      d += ` L ${x} ${y}`;
    });
    return d;
  }, [hourly, width, height, maxValue]);

  return (
    <svg width={width} height={height}>
      <path d={genPath} fill="#a7e26e" fillOpacity="0.4" />
      <path d={conPath} fill="none" stroke="#3b82f6" strokeWidth="1" />
    </svg>
  );
}
