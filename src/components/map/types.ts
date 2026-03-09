/**
 * Types for the Prospecting Map components
 */

export interface BBoxBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
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
  // Full street address (fetched on-demand from Catastro)
  streetAddress?: string | null;
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

export interface ProspectFilters {
  minArea: number;
  maxResults: number;
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
