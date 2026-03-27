'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLocalStorage } from '@/hooks/useLocalStorage';

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

type Prospect = {
  name: string;
  score: number;
  vvCount: number;
  totalBeds: number;
  avgBedsPerVv: number;
  islands: string[];
  municipalities: string[];
  complexes: string[];
  concentrationScore: number;
  complexScore: number;
  centerLat: number;
  centerLon: number;
  sampleAddress: string;
};

type LeadProperty = {
  id: string;
  name: string;
  address: string;
  municipality: string;
  plazas: number;
  lat: number | null;
  lon: number | null;
  complex: string | null;
};

type Lead = {
  name: string;
  rank: number;
  score: number;
  vvCount: number;
  totalBeds: number;
  islands: string[];
  municipalities: string[];
  complexes: string[];
  concentrationScore: number;
  centerLat: number;
  centerLon: number;
  hasContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  contactPerson: string | null;
  notes: string | null;
  type: 'gestora' | 'mgmt';
  properties: LeadProperty[];
};

export default function GestorasPage() {
  const [activeTab, setActiveTab, isHydrated] = useLocalStorage<'firm' | 'complex' | 'prospects' | 'leads'>('gestoras:activeTab', 'firm');
  const [groups, setGroups] = useState<FirmGroup[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsStats, setLeadsStats] = useState({ withContact: 0, totalVvs: 0, totalBeds: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedIsland, setSelectedIsland] = useLocalStorage<string>('gestoras:selectedIsland', '');
  const [selectedMunicipality, setSelectedMunicipality] = useLocalStorage<string>('gestoras:selectedMunicipality', '');
  const [availableIslands, setAvailableIslands] = useState<string[]>([]);
  const [availableMunicipalities, setAvailableMunicipalities] = useState<string[]>([]);

  // Sorting
  const [sortBy, setSortBy] = useLocalStorage<SortOption>('gestoras:sortBy', 'vvCount');

  // Accordion state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Fetch data when tab or filters change (wait for localStorage hydration)
  useEffect(() => {
    if (!isHydrated) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (activeTab === 'leads') {
          // Fetch leads data
          const params = new URLSearchParams({ minVv: '3', limit: '100' });
          if (selectedIsland) params.set('island', selectedIsland);

          const res = await fetch(`/api/vv/leads?${params}`);
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || 'Error fetching leads');

          setLeads(data.leads);
          setLeadsStats({
            withContact: data.withContact,
            totalVvs: data.totalVvs,
            totalBeds: data.totalBeds,
          });
          setAvailableIslands(data.filters.islands);
        } else if (activeTab === 'prospects') {
          // Fetch prospects data
          const params = new URLSearchParams({ minVv: '5', limit: '200' });
          if (selectedIsland) params.set('island', selectedIsland);

          const res = await fetch(`/api/vv/prospects?${params}`);
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || 'Error fetching prospects');

          setProspects(data.prospects);
          setAvailableIslands(data.filters.islands);
        } else {
          // Fetch firms/complexes data
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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isHydrated, activeTab, selectedIsland, selectedMunicipality]);

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
        <button
          onClick={() => {
            setActiveTab('prospects');
            setExpandedGroup(null);
          }}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'prospects'
              ? 'border-green-500 text-green-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            Top Prospects
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('leads');
            setExpandedGroup(null);
          }}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'leads'
              ? 'border-teal-500 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Leads
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

        {/* Municipality Filter - hide for prospects and leads tabs */}
        {activeTab !== 'prospects' && activeTab !== 'leads' && (
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
        )}

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Sort - hide for prospects and leads (already sorted by score/contact) */}
        {activeTab !== 'prospects' && activeTab !== 'leads' && (
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
        )}

        {/* Stats */}
        <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
          {activeTab === 'leads' ? (
            <>
              <span>
                <strong className="text-teal-600">{leads.length}</strong> leads
              </span>
              <span className="bg-teal-50 px-2 py-0.5 rounded">
                <strong className="text-teal-600">{leadsStats.withContact}</strong> con contacto
              </span>
              <span>
                <strong>{leadsStats.totalVvs.toLocaleString()}</strong> VVs
              </span>
              <span>
                <strong>{leadsStats.totalBeds.toLocaleString()}</strong> camas
              </span>
            </>
          ) : activeTab === 'prospects' ? (
            <>
              <span>
                <strong className="text-green-600">{prospects.length}</strong> prospects
              </span>
              <span>
                <strong>{prospects.reduce((sum, p) => sum + p.vvCount, 0).toLocaleString()}</strong> VVs
              </span>
              <span>
                <strong>{prospects.reduce((sum, p) => sum + p.totalBeds, 0).toLocaleString()}</strong> camas
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
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

      {/* Prospects Table */}
      {!isLoading && !error && activeTab === 'prospects' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {prospects.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No se encontraron prospects con los filtros seleccionados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Gestora</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">VVs</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Camas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Isla(s)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Municipio(s)</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Concentracion</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Mapa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {prospects.map((prospect, idx) => (
                    <tr key={prospect.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-10 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              prospect.score >= 70
                                ? 'bg-green-500'
                                : prospect.score >= 50
                                ? 'bg-yellow-500'
                                : 'bg-gray-400'
                            }`}
                          >
                            {prospect.score}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{prospect.name}</div>
                        {prospect.complexes.length > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {prospect.complexes.slice(0, 2).join(', ')}
                            {prospect.complexes.length > 2 && ` +${prospect.complexes.length - 2}`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">{prospect.vvCount}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{prospect.totalBeds}</td>
                      <td className="px-4 py-3 text-gray-600">{prospect.islands.join(', ')}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={prospect.municipalities.join(', ')}>
                        {prospect.municipalities.slice(0, 2).join(', ')}
                        {prospect.municipalities.length > 2 && ` +${prospect.municipalities.length - 2}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            prospect.concentrationScore >= 85
                              ? 'bg-green-100 text-green-800'
                              : prospect.concentrationScore >= 70
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {prospect.concentrationScore >= 85 ? 'Alta' : prospect.concentrationScore >= 70 ? 'Media' : 'Baja'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/installer/prospecting?lat=${prospect.centerLat}&lon=${prospect.centerLon}&zoom=15`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors"
                          title="Ver en mapa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          )}
        </div>
      )}

      {/* Leads Accordion */}
      {!isLoading && !error && activeTab === 'leads' && (
        <div className="space-y-2">
          {leads.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No se encontraron leads con los filtros seleccionados
            </div>
          ) : (
            leads.map((lead) => (
              <div
                key={lead.name}
                className={`bg-white rounded-lg shadow-sm border overflow-hidden ${
                  lead.hasContact ? 'border-teal-300' : 'border-gray-200'
                }`}
              >
                {/* Accordion Header */}
                <button
                  onClick={() => toggleAccordion(lead.name)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Rank & Score */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 w-6">#{lead.rank}</span>
                      <div
                        className={`w-10 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                          lead.score >= 60 ? 'bg-green-500' : lead.score >= 45 ? 'bg-yellow-500' : 'bg-gray-400'
                        }`}
                      >
                        {lead.score}
                      </div>
                    </div>
                    {/* Name & Info */}
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{lead.name}</span>
                        {lead.hasContact && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                            Contacto
                          </span>
                        )}
                        {lead.type === 'mgmt' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Gestora
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {lead.vvCount} VVs &middot; {lead.totalBeds} camas &middot; {lead.islands.join(', ')}
                      </div>
                    </div>
                  </div>
                  {/* Right side: contact icons + expand */}
                  <div className="flex items-center gap-3">
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-teal-600 hover:text-teal-700"
                        title={lead.email}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </a>
                    )}
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-teal-600 hover:text-teal-700"
                        title={lead.phone}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </a>
                    )}
                    {lead.website && (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-teal-600 hover:text-teal-700"
                        title={lead.website}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      </a>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedGroup === lead.name ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Accordion Content */}
                {expandedGroup === lead.name && (
                  <div className="border-t border-gray-200">
                    {/* Contact Info Section */}
                    {(lead.email || lead.phone || lead.website || lead.contactPerson || lead.notes) && (
                      <div className="bg-teal-50 px-4 py-3 border-b border-teal-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                          {lead.email && (
                            <div>
                              <span className="text-gray-500">Email:</span>{' '}
                              <a href={`mailto:${lead.email}`} className="text-teal-600 hover:underline">
                                {lead.email}
                              </a>
                            </div>
                          )}
                          {lead.phone && (
                            <div>
                              <span className="text-gray-500">Teléfono:</span>{' '}
                              <a href={`tel:${lead.phone}`} className="text-teal-600 hover:underline">
                                {lead.phone}
                              </a>
                            </div>
                          )}
                          {lead.website && (
                            <div>
                              <span className="text-gray-500">Web:</span>{' '}
                              <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                                {new URL(lead.website).hostname.replace('www.', '')}
                              </a>
                            </div>
                          )}
                          {lead.contactPerson && (
                            <div>
                              <span className="text-gray-500">Contacto:</span>{' '}
                              <span className="text-gray-900">{lead.contactPerson}</span>
                            </div>
                          )}
                        </div>
                        {lead.notes && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="text-gray-500">Notas:</span> {lead.notes}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="px-4 py-2 bg-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-600">
                        {lead.properties.length} propiedades &middot; {lead.municipalities.join(', ')}
                      </span>
                      <Link
                        href={`/installer/prospecting?gestora=${encodeURIComponent(lead.name)}&lat=${lead.centerLat}&lon=${lead.centerLon}&zoom=14`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium rounded-md transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        Ver todas en mapa
                      </Link>
                    </div>

                    {/* Properties List */}
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dirección</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Municipio</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Plazas</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Mapa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {lead.properties.map((prop) => (
                            <tr key={prop.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-900 max-w-xs truncate" title={prop.address}>
                                {prop.address || '-'}
                                {prop.complex && (
                                  <span className="ml-2 text-xs text-gray-500">({prop.complex})</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-gray-600">{prop.municipality}</td>
                              <td className="px-4 py-2 text-center text-gray-900">{prop.plazas}</td>
                              <td className="px-4 py-2 text-center">
                                {prop.lat && prop.lon ? (
                                  <Link
                                    href={`/installer/prospecting?lat=${prop.lat.toFixed(5)}&lon=${prop.lon.toFixed(5)}&zoom=18`}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-teal-400 hover:bg-teal-500 text-white transition-colors"
                                    title="Ver en mapa"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                  </Link>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
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

      {/* Accordion List (for firm/complex tabs) */}
      {!isLoading && !error && activeTab !== 'prospects' && activeTab !== 'leads' && (
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
