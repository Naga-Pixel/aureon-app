/**
 * Types for the Prospecting Map components
 */

import type { ESIOSPriceStats } from '@/lib/services/esios';

export interface BBoxBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * CT (Centro de Transformación) location from various data sources
 */
export type CTDataSource = 'osm' | 'grafcan' | 'catastro';

export interface CTLocation {
  id: string;
  source: CTDataSource;
  sourceId: string;       // OSM node ID, GRAFCAN feature ID, etc.
  refCT: string | null;   // Official CT reference (when available)
  operator: string | null; // Endesa, Iberdrola, etc.
  lat: number;
  lon: number;
  confidence: number;     // 0-100
}

export type DataSource = 'api' | 'fallback' | 'estimate' | 'config';

export interface DataProvenance {
  source: DataSource;
  confidence: number; // 0-100
  note?: string;
}

export interface BuildingResult {
  buildingId: string | null;
  roofAreaM2: number | null;
  orientationDegrees: number | null;
  orientationLabel: string | null;
  polygonCoordinates: [number, number][] | null;
  // From Catastro INSPIRE
  numberOfFloors: number | null;
  currentUse: string | null;
  currentUseLabel: string | null;
  numberOfDwellings: number | null;
  buildingNature: string | null;
  // Address info
  province: string | null;
  municipality: string | null;
  cadastralReference: string | null;
  // Island detection (for Canary Islands)
  island?: string | null;
  // Full street address (fetched on-demand from Catastro)
  streetAddress?: string | null;
  // Construction year (when available from Catastro)
  constructionYear?: number | null;
  // Inferred Energy Performance Certificate rating (A-G)
  inferredEPC?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | null;
  // Calculated fields from scoring
  score?: number;
  solarScore?: number;
  batteryScore?: number;
  systemSizeKw?: number;
  annualSavingsEur?: number;
  annualProductionKwh?: number;
  // Battery-specific metrics
  batteryKwh?: number;
  gridVulnerability?: number;
  arbitragePotential?: number;
  arbitrageSavingsEur?: number;
  // Additional data for reports
  estimatedConsumptionKwh?: number;
  selfConsumptionRatio?: number;
  outageProtectionValue?: number;
  climateZone?: string;
  // Price statistics (from ESIOS when available)
  priceStats?: ESIOSPriceStats;
  // Data provenance tracking
  provenance?: {
    roofArea: DataProvenance;
    solarIrradiance: DataProvenance;
    consumption: DataProvenance;
    electricityPrice: DataProvenance;
    gridVulnerability: DataProvenance;
    arbitragePrices: DataProvenance;
    buildingType: DataProvenance;
    floors: DataProvenance;
  };
}

export type AssessmentType = 'solar' | 'battery' | 'combined';

/**
 * Grant Category - determines which subsidies/grants apply.
 * This is SEPARATE from businessSegment (which affects consumption calculations).
 * See: src/lib/config/incentives/grants-2026.ts for full explanation.
 */
export type GrantCategory = 'residential' | 'business';

export interface ProspectFilters {
  minArea: number;
  maxResults: number;
  grantCategory: GrantCategory;
  businessSegment: string;
  electricityPrice: number;
  assessmentType: AssessmentType;
}

export interface BatteryMetrics {
  batteryKwh: number;
  gridVulnerability: number;
  arbitragePotential: number;
  arbitrageSavingsEur: number;
}

export interface SearchResult {
  buildings: BuildingResult[];
  count: number;
  pvgis: {
    kwhPerKwp: number;
  };
}

/**
 * Score components for energy community cluster evaluation
 */
export interface ClusterScoreComponents {
  roofRatio: number;        // 0-100: m² per participant (target >10m²)
  diversity: number;        // 0-100: load diversity (daylight + night-heavy mix)
  proximity: number;        // 0-100: tighter clusters score higher
  batteryReady: number;     // 0-100: % of buildings with poor EPC (F/G)
}

/**
 * ROI calculation for energy community cluster
 */
export interface ClusterROI {
  totalInvestmentEur: number;
  annualSavingsEur: number;
  paybackYears: number;
  irpfDeductionEur: number;
  netInvestmentEur: number;
}

/**
 * CT Analysis result for cluster eligibility
 */
export interface CTAnalysisResult {
  zoneCount: number;
  risk: boolean;
  dominantZone: string | null;
  dominantZoneRatio: number;
  zones: Array<{
    zoneId: string;
    buildingCount: number;
    percentage: number;
    refCT?: string | null;
    operator?: string | null;
  }>;
  dataSource: 'heuristic' | 'voronoi';
  confidence: number;
}

/**
 * Extended cluster result with energy community scoring
 */
export interface ScoredClusterResult {
  anchor: {
    id: string;
    type: string;
    name: string | null;
    lat: number;
    lon: number;
  };
  radiusKm: number;
  buildingsInRadius: number;
  totalRoofAreaM2: number;
  estimatedSavingsEur: number;
  estimatedSystemSizeKw: number;
  buildings: BuildingResult[];
  // Scoring
  suitabilityScore: number;     // 0-100 weighted composite
  scoreComponents: ClusterScoreComponents;
  roi: ClusterROI;
  // VV integration
  vvCount: number;
  vvPlazas: number;
  // CT heuristic
  ctZoneWarning: boolean;
  ctZoneCount: number;
  ctAnalysis?: CTAnalysisResult;
  // Distances
  avgDistanceKm: number;
  buildingDistances: Map<string, number>;
}
