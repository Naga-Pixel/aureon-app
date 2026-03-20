'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

type VVItem = {
  id: string;
  name: string;
  plazas: number;
  lat: number;
  lon: number;
  address: string;
  island: string;
  municipality: string;
};

type FirmGroup = {
  name: string;
  vvCount: number;
  totalPlazas: number;
  islands: string[];
  municipalities: string[];
  vvs: VVItem[];
  centerLat: number;
  centerLon: number;
};

type SortOption = 'vvCount' | 'island' | 'municipality' | 'name';

export default function GestorasPage() {
  const [activeTab, setActiveTab] = useState<'firm' | 'complex'>('firm');
  const [groups, setGroups] = useState<FirmGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedIsland, setSelectedIsland] = useState<string>('');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('');
  const [availableIslands, setAvailableIslands] = useState<string[]>([]);
  const [availableMunicipalities, setAvailableMunicipalities] = useState<string[]>([]);

  // Sorting
  const [sortBy, setSortBy] = useState<SortOption>('vvCount');

  // Accordion state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Fetch data when tab or filters change
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ type: activeTab });
        if (selectedIsland) params.set('island', selectedIsland);
        if (selectedMunicipality) params.set('municipality', selectedMunicipality);

        const res = await fetch(`/api/vv/firms?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error fetching data');

        setGroups(data.groups);
        setAvailableIslands(data.filters.islands);
        // Only update municipalities if no island filter (to show all)
        if (!selectedIsland) {
          setAvailableMunicipalities(data.filters.municipalities);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTab, selectedIsland, selectedMunicipality]);

  // Update municipalities when island changes
  useEffect(() => {
    if (selectedIsland) {
      // Filter municipalities to only those in the selected island
      const islandMunicipalities = new Set<string>();
      groups.forEach(g => {
        if (g.islands.includes(selectedIsland)) {
          g.municipalities.forEach(m => islandMunicipalities.add(m));
        }
      });
      setAvailableMunicipalities(Array.from(islandMunicipalities).sort());
    }
  }, [selectedIsland, groups]);

  // Sort groups
  const sortedGroups = useMemo(() => {
    const sorted = [...groups];
    switch (sortBy) {
      case 'vvCount':
        sorted.sort((a, b) => b.vvCount - a.vvCount);
        break;
      case 'island':
        sorted.sort((a, b) => (a.islands[0] || '').localeCompare(b.islands[0] || ''));
        break;
      case 'municipality':
        sorted.sort((a, b) => (a.municipalities[0] || '').localeCompare(b.municipalities[0] || ''));
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [groups, sortBy]);

  // Stats
  const totalVvs = groups.reduce((sum, g) => sum + g.vvCount, 0);
  const totalPlazas = groups.reduce((sum, g) => sum + g.totalPlazas, 0);

  const toggleAccordion = (name: string) => {
    setExpandedGroup(expandedGroup === name ? null : name);
  };

  const getVvMapLink = (vv: VVItem) => {
    return `/installer/prospecting?lat=${vv.lat.toFixed(5)}&lon=${vv.lon.toFixed(5)}&zoom=18`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Gestoras y Complejos VV
        </h1>
        <p className="text-gray-600 mt-1">
          Explora gestoras inmobiliarias y complejos turisticos con viviendas vacacionales
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => {
            setActiveTab('firm');
            setExpandedGroup(null);
          }}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'firm'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Gestoras Inmobiliarias
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('complex');
            setExpandedGroup(null);
          }}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'complex'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Complejos / Resorts
          </span>
        </button>
      </div>

      {/* Filters and Sort */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-lg shadow-sm p-4">
        {/* Island Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Isla:</label>
          <select
            value={selectedIsland}
            onChange={(e) => {
              setSelectedIsland(e.target.value);
              setSelectedMunicipality('');
            }}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-green-500 focus:ring-green-500"
          >
            <option value="">Todas</option>
            {availableIslands.map((island) => (
              <option key={island} value={island}>
                {island}
              </option>
            ))}
          </select>
        </div>

        {/* Municipality Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Municipio:</label>
          <select
            value={selectedMunicipality}
            onChange={(e) => setSelectedMunicipality(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-green-500 focus:ring-green-500"
          >
            <option value="">Todos</option>
            {availableMunicipalities.map((muni) => (
              <option key={muni} value={muni}>
                {muni}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Sort */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Ordenar:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-green-500 focus:ring-green-500"
          >
            <option value="vvCount">Por num. VVs</option>
            <option value="name">Por nombre</option>
            <option value="island">Por isla</option>
            <option value="municipality">Por municipio</option>
          </select>
        </div>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
          <span>
            <strong className={activeTab === 'firm' ? 'text-purple-600' : 'text-amber-600'}>
              {groups.length}
            </strong>{' '}
            {activeTab === 'firm' ? 'gestoras' : 'complejos'}
          </span>
          <span>
            <strong>{totalVvs.toLocaleString()}</strong> VVs
          </span>
          <span>
            <strong>{totalPlazas.toLocaleString()}</strong> plazas
          </span>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Accordion List */}
      {!isLoading && !error && (
        <div className="space-y-2">
          {sortedGroups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No se encontraron {activeTab === 'firm' ? 'gestoras' : 'complejos'} con los filtros seleccionados
            </div>
          ) : (
            sortedGroups.map((group) => (
              <div
                key={group.name}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
              >
                {/* Accordion Header */}
                <button
                  onClick={() => toggleAccordion(group.name)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        activeTab === 'firm' ? 'bg-purple-500' : 'bg-amber-500'
                      }`}
                    >
                      {group.vvCount}
                    </div>
                    {/* Name */}
                    <div className="text-left">
                      <div className="font-medium text-gray-900">{group.name}</div>
                      <div className="text-xs text-gray-500">
                        {group.islands.join(', ')} &middot; {group.totalPlazas} plazas
                      </div>
                    </div>
                  </div>
                  {/* Expand icon */}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedGroup === group.name ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Accordion Content */}
                {expandedGroup === group.name && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    {/* Action bar */}
                    <div className="px-4 py-2 bg-gray-100">
                      <span className="text-xs text-gray-600">
                        {group.vvs.length} viviendas vacacionales
                      </span>
                    </div>
                    {/* VV List */}
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Direccion</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Plazas</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Municipio</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Mapa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {group.vvs.map((vv) => (
                            <tr key={vv.id} className="hover:bg-white">
                              <td className="px-4 py-2 text-gray-900">{vv.name}</td>
                              <td className="px-4 py-2 text-gray-600 truncate max-w-xs" title={vv.address}>
                                {vv.address || '-'}
                              </td>
                              <td className="px-4 py-2 text-center text-gray-900">{vv.plazas}</td>
                              <td className="px-4 py-2 text-gray-600">{vv.municipality}</td>
                              <td className="px-4 py-2 text-center">
                                <Link
                                  href={getVvMapLink(vv)}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white transition-colors ${
                                    activeTab === 'firm'
                                      ? 'bg-purple-400 hover:bg-purple-500'
                                      : 'bg-amber-400 hover:bg-amber-500'
                                  }`}
                                  title="Ver en mapa"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
