'use client';

import { useState, useMemo } from 'react';
import type { ScoredClusterResult } from './types';
import { getAnchorLabel } from '@/lib/services/osm-overpass';
import { exportClusterHitList } from '@/lib/services/cluster-export';

interface ClusterRankingPanelProps {
  clusters: ScoredClusterResult[];
  selectedClusterId: string | null;
  onClusterSelect: (cluster: ScoredClusterResult) => void;
  onClose: () => void;
  isLoading?: boolean;
}

type SortBy = 'payback' | 'score' | 'buildings' | 'savings';

/**
 * Score badge color based on score value
 */
function getScoreBadgeColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-700 border-green-200';
  if (score >= 60) return 'bg-lime-100 text-lime-700 border-lime-200';
  if (score >= 40) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

/**
 * Format payback years for display
 */
function formatPayback(years: number): string {
  if (years >= 99) return '>25';
  if (years >= 20) return '>20';
  return years.toFixed(1);
}

/**
 * Cluster card in ranking list
 */
function ClusterCard({
  cluster,
  rank,
  isSelected,
  onClick,
}: {
  cluster: ScoredClusterResult;
  rank: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const anchorLabel = getAnchorLabel(cluster.anchor.type as 'supermarket' | 'industrial' | 'warehouse' | 'retail');
  const scoreBadgeColor = getScoreBadgeColor(cluster.suitabilityScore);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? 'border-[#a7e26e] bg-[#a7e26e]/10 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[#222f30] truncate">
              {cluster.anchor.name || anchorLabel}
            </span>
            {cluster.ctZoneWarning && (
              <span
                className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded"
                title="Posible riesgo de múltiples CTs"
              >
                CT
              </span>
            )}
          </div>

          {/* Metrics row */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{cluster.buildingsInRadius} edificios</span>
            <span className="text-gray-300">|</span>
            <span>{cluster.vvCount > 0 ? `${cluster.vvCount} VVs` : 'Sin VVs'}</span>
            <span className="text-gray-300">|</span>
            <span>{cluster.radiusKm}km</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Score badge */}
              <span className={`px-2 py-0.5 text-xs font-medium rounded border ${scoreBadgeColor}`}>
                {cluster.suitabilityScore}
              </span>

              {/* Payback */}
              <span className="text-xs text-gray-600">
                {formatPayback(cluster.roi.paybackYears)} años
              </span>
            </div>

            {/* Savings */}
            <span className="text-xs font-medium text-[#222f30]">
              {cluster.estimatedSavingsEur.toLocaleString('es-ES')} €/año
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Cluster Ranking Panel
 *
 * Left sidebar panel showing top clusters ranked by payback years.
 * Features: sort options, score badges, CT warnings, export button.
 */
export function ClusterRankingPanel({
  clusters,
  selectedClusterId,
  onClusterSelect,
  onClose,
  isLoading = false,
}: ClusterRankingPanelProps) {
  const [sortBy, setSortBy] = useState<SortBy>('payback');
  const [showTop, setShowTop] = useState(10);

  // Sort clusters
  const sortedClusters = useMemo(() => {
    const sorted = [...clusters];
    switch (sortBy) {
      case 'payback':
        sorted.sort((a, b) => a.roi.paybackYears - b.roi.paybackYears);
        break;
      case 'score':
        sorted.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
        break;
      case 'buildings':
        sorted.sort((a, b) => b.buildingsInRadius - a.buildingsInRadius);
        break;
      case 'savings':
        sorted.sort((a, b) => b.estimatedSavingsEur - a.estimatedSavingsEur);
        break;
    }
    return sorted.slice(0, showTop);
  }, [clusters, sortBy, showTop]);

  // Summary stats
  const summary = useMemo(() => {
    if (clusters.length === 0) return null;

    const totalBuildings = clusters.reduce((sum, c) => sum + c.buildingsInRadius, 0);
    const totalSavings = clusters.reduce((sum, c) => sum + c.estimatedSavingsEur, 0);
    const avgScore = clusters.reduce((sum, c) => sum + c.suitabilityScore, 0) / clusters.length;
    const ctWarnings = clusters.filter(c => c.ctZoneWarning).length;

    return {
      totalClusters: clusters.length,
      totalBuildings,
      totalSavings,
      avgScore: Math.round(avgScore),
      ctWarnings,
    };
  }, [clusters]);

  const handleExport = () => {
    exportClusterHitList(sortedClusters);
  };

  return (
    <div className="absolute left-4 top-4 bottom-4 w-80 bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden z-30">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-semibold text-[#222f30]">Comunidades Energéticas</h3>
          <p className="text-xs text-gray-500">
            {clusters.length} clusters encontrados
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 border-b text-center">
          <div>
            <div className="text-lg font-bold text-[#222f30]">{summary.totalClusters}</div>
            <div className="text-[10px] text-gray-500">Clusters</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#222f30]">{summary.avgScore}</div>
            <div className="text-[10px] text-gray-500">Punt. Media</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#222f30]">
              {(summary.totalSavings / 1000).toFixed(0)}k€
            </div>
            <div className="text-[10px] text-gray-500">Ahorro/año</div>
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2 p-3 border-b">
        <span className="text-xs text-gray-500">Ordenar:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#a7e26e]"
        >
          <option value="payback">Retorno (menor)</option>
          <option value="score">Puntuación (mayor)</option>
          <option value="buildings">Edificios (mayor)</option>
          <option value="savings">Ahorro (mayor)</option>
        </select>
        <select
          value={showTop}
          onChange={(e) => setShowTop(parseInt(e.target.value))}
          className="w-16 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#a7e26e]"
        >
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
          <option value={100}>Todos</option>
        </select>
      </div>

      {/* Cluster list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#a7e26e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedClusters.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No se encontraron clusters.
            <br />
            <span className="text-xs">Ajusta los filtros o el área de búsqueda.</span>
          </div>
        ) : (
          sortedClusters.map((cluster, index) => (
            <ClusterCard
              key={cluster.anchor.id}
              cluster={cluster}
              rank={index + 1}
              isSelected={cluster.anchor.id === selectedClusterId}
              onClick={() => onClusterSelect(cluster)}
            />
          ))
        )}
      </div>

      {/* Export button */}
      {sortedClusters.length > 0 && (
        <div className="p-3 border-t">
          <button
            onClick={handleExport}
            className="w-full py-2 px-4 bg-[#222f30] text-white rounded-lg text-sm font-medium hover:bg-[#1a2425] transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar Hit List (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
