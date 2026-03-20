/**
 * Cluster Export Service
 *
 * Exports energy community cluster data to CSV format.
 */

import type { ScoredClusterResult } from '@/components/map/types';
import { getAnchorLabel } from './osm-overpass';

/**
 * CSV column headers
 */
const CSV_HEADERS = [
  'Rank',
  'Anchor Name',
  'Anchor Type',
  'Score',
  'Buildings',
  'VVs',
  'VV Plazas',
  'Roof Area (m²)',
  'System Size (kWp)',
  'Investment (€)',
  'IRPF Deduction (€)',
  'Net Investment (€)',
  'Annual Savings (€)',
  'Payback (years)',
  'Radius (km)',
  'Avg Distance (km)',
  'CT Warning',
  'CT Zones',
  'Latitude',
  'Longitude',
];

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // If contains comma, quote, or newline, wrap in quotes and escape inner quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generate CSV row from cluster
 */
function clusterToCSVRow(cluster: ScoredClusterResult, rank: number): string {
  const anchorLabel = getAnchorLabel(cluster.anchor.type as 'supermarket' | 'industrial' | 'warehouse' | 'retail');

  const values = [
    rank,
    cluster.anchor.name || anchorLabel,
    anchorLabel,
    cluster.suitabilityScore,
    cluster.buildingsInRadius,
    cluster.vvCount,
    cluster.vvPlazas,
    Math.round(cluster.totalRoofAreaM2),
    Math.round(cluster.estimatedSystemSizeKw),
    cluster.roi.totalInvestmentEur,
    cluster.roi.irpfDeductionEur,
    cluster.roi.netInvestmentEur,
    cluster.roi.annualSavingsEur,
    cluster.roi.paybackYears,
    cluster.radiusKm,
    cluster.avgDistanceKm.toFixed(2),
    cluster.ctZoneWarning ? 'Yes' : 'No',
    cluster.ctZoneCount,
    cluster.anchor.lat.toFixed(6),
    cluster.anchor.lon.toFixed(6),
  ];

  return values.map(escapeCSV).join(',');
}

/**
 * Generate complete CSV content
 */
export function generateClusterCSV(clusters: ScoredClusterResult[]): string {
  const header = CSV_HEADERS.join(',');
  const rows = clusters.map((cluster, index) => clusterToCSVRow(cluster, index + 1));

  return [header, ...rows].join('\n');
}

/**
 * Download CSV as file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Export clusters as CSV hit list
 */
export function exportClusterHitList(clusters: ScoredClusterResult[]): void {
  const csv = generateClusterCSV(clusters);
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `energy-communities-${timestamp}.csv`;

  downloadCSV(csv, filename);
}

/**
 * Generate summary statistics for clusters
 */
export interface ClusterSummaryStats {
  totalClusters: number;
  totalBuildings: number;
  totalVVs: number;
  totalRoofAreaM2: number;
  totalSystemSizeKwp: number;
  totalInvestmentEur: number;
  totalIRPFDeductionEur: number;
  totalAnnualSavingsEur: number;
  avgPaybackYears: number;
  avgScore: number;
  clustersWithCTWarning: number;
}

/**
 * Calculate summary statistics
 */
export function calculateClusterSummary(clusters: ScoredClusterResult[]): ClusterSummaryStats {
  if (clusters.length === 0) {
    return {
      totalClusters: 0,
      totalBuildings: 0,
      totalVVs: 0,
      totalRoofAreaM2: 0,
      totalSystemSizeKwp: 0,
      totalInvestmentEur: 0,
      totalIRPFDeductionEur: 0,
      totalAnnualSavingsEur: 0,
      avgPaybackYears: 0,
      avgScore: 0,
      clustersWithCTWarning: 0,
    };
  }

  const totals = clusters.reduce(
    (acc, c) => ({
      buildings: acc.buildings + c.buildingsInRadius,
      vvs: acc.vvs + c.vvCount,
      roofArea: acc.roofArea + c.totalRoofAreaM2,
      systemSize: acc.systemSize + c.estimatedSystemSizeKw,
      investment: acc.investment + c.roi.totalInvestmentEur,
      irpf: acc.irpf + c.roi.irpfDeductionEur,
      savings: acc.savings + c.roi.annualSavingsEur,
      payback: acc.payback + c.roi.paybackYears,
      score: acc.score + c.suitabilityScore,
      ctWarnings: acc.ctWarnings + (c.ctZoneWarning ? 1 : 0),
    }),
    {
      buildings: 0,
      vvs: 0,
      roofArea: 0,
      systemSize: 0,
      investment: 0,
      irpf: 0,
      savings: 0,
      payback: 0,
      score: 0,
      ctWarnings: 0,
    }
  );

  return {
    totalClusters: clusters.length,
    totalBuildings: totals.buildings,
    totalVVs: totals.vvs,
    totalRoofAreaM2: Math.round(totals.roofArea),
    totalSystemSizeKwp: Math.round(totals.systemSize),
    totalInvestmentEur: Math.round(totals.investment),
    totalIRPFDeductionEur: Math.round(totals.irpf),
    totalAnnualSavingsEur: Math.round(totals.savings),
    avgPaybackYears: Math.round((totals.payback / clusters.length) * 10) / 10,
    avgScore: Math.round(totals.score / clusters.length),
    clustersWithCTWarning: totals.ctWarnings,
  };
}
