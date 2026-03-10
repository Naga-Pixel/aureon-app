# TECHNICAL ASSESSMENT: AUREON PROSPECTING TOOL

**Version**: 1.0
**Date**: March 2026
**Author**: Aureon Engineering

---

## Executive Summary

The Aureon Prospecting Tool is a web-based application for identifying and evaluating buildings in Spain for renewable energy installations (solar, battery, or combined systems). Built with Next.js/React and TypeScript, it integrates multiple external APIs to provide data-driven scoring and analysis.

---

## 1. System Architecture

### 1.1 Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 13+, React 18+, TypeScript |
| Mapping | MapLibre GL (open-source) |
| UI | Tailwind CSS |
| PDF Generation | jsPDF + autoTable |
| Backend | Next.js API Routes (serverless) |
| Database | Supabase (PostgreSQL) |
| Caching | Redis |

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                          │
├─────────────────────────────────────────────────────────────┤
│  ProspectingPage (Main Container)                            │
│  ├── ProspectMap (MapLibre area selection & visualization)  │
│  ├── ProspectFilters (Search configuration)                 │
│  └── BuildingResultsList (Results & export)                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               API Layer (/api/prospecting/search)            │
├─────────────────────────────────────────────────────────────┤
│  • Authentication (Supabase - admin only)                    │
│  • Area validation (max 5km × 5km)                          │
│  • Data orchestration & scoring                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               External Data Sources                          │
├─────────────────────────────────────────────────────────────┤
│  • Catastro INSPIRE WFS (building footprints, roof areas)   │
│  • PVGIS EU API (solar irradiance)                          │
│  • ESIOS REE API (electricity prices)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. External API Integrations

### 2.1 Catastro INSPIRE WFS

**Endpoint**: `https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx`

**Purpose**: Fetch building footprints with roof area and metadata

**Data Retrieved**:
| Field | Source Element | Confidence |
|-------|----------------|------------|
| Roof Area (m²) | Polygon geometry calculation | 75% |
| Number of Floors | `bu-core2d:numberOfFloorsAboveGround` | 90% |
| Building Use | `bu-core2d:currentUse` | 85% |
| Number of Dwellings | `bu-core2d:numberOfDwellings` | 90% |
| Province | First 2 digits of cadastral reference | 95% |

**Use Code Mapping**:
```
1_residential  → Residencial
3_industrial   → Industrial
4_1_office     → Oficinas
4_2_retail     → Comercial
2_agriculture  → Agricola
```

**Timeout**: 15 seconds

---

### 2.2 PVGIS API (EU Joint Research Centre)

**Endpoint**: `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc`

**Purpose**: Location-specific solar irradiance data

**Parameters**:
- `lat`, `lon`: Coordinates
- `peakpower`: 1 (normalized)
- `loss`: 14%
- `optimalangles`: 1

**Output**: kWh/kWp/year (typical range: 1200-1700 in Spain)

**Regional Fallbacks** (when API unavailable):
| Region | kWh/kWp |
|--------|---------|
| Canary Islands | 1700 |
| South Spain | 1600 |
| Central Spain | 1400 |
| North Spain | 1200 |
| Default | 1500 |

**Timeout**: 10 seconds

---

### 2.3 ESIOS API (Red Eléctrica de España)

**Endpoint**: `https://api.esios.ree.es/indicators/1001`

**Purpose**: Hourly electricity prices for arbitrage calculation

**Authentication**: `x-api-key` header

**Caching**: Redis, 6-hour TTL

**Fallback Price**: €0.20/kWh

**Volatility Calculation**:
```typescript
volatility = sqrt(variance(hourly_prices))
// Used for arbitrage potential bonus (max +50%)
```

---

## 3. Scoring Algorithms

### 3.1 Solar Score (0-100 points)

**Component Weights**:

| Component | Weight | Formula |
|-----------|--------|---------|
| System Size | 35% | `min(systemSizeKw / 100, 1) × 35` |
| Production | 25% | `min(annualKwh / 150000, 1) × 25` |
| Self-Consumption | 20% | `selfConsumptionRatio × 20` |
| Savings | 20% | `min(savingsEur / 15000, 1) × 20` |

**System Sizing**:
```
usableRoofArea = roofAreaM2 × 0.70
panelCount = floor(usableRoofArea / 2m²)
systemSizeKw = panelCount × 400W / 1000
annualProduction = systemSizeKw × kwhPerKwp
```

**Self-Consumption Adjustment**:
- Production > 1.5× consumption → ratio × 0.7 (oversized)
- Production < 0.5× consumption → min(0.9, ratio × 1.3) (undersized)

**Savings Calculation**:
```
selfConsumedKwh = production × selfConsumptionRatio
exportedKwh = production × (1 - selfConsumptionRatio)
exportPrice = electricityPrice × 0.5

savings = (selfConsumedKwh × price) + (exportedKwh × exportPrice)
```

---

### 3.2 Battery Score (0-100 points)

**Component Weights**:

| Component | Weight | Description |
|-----------|--------|-------------|
| Grid Vulnerability | 30% | Island isolation score |
| Consumption Profile | 25% | Annual consumption tier |
| Arbitrage Potential | 20% | Peak/valley price spread savings |
| Solar Synergy | 15% | Compatibility with solar production |
| Installation Ease | 10% | Building size suitability |

**Grid Vulnerability by Location**:

| Island | Score | Grid Size (MW) |
|--------|-------|----------------|
| El Hierro | 95 | 13 |
| La Gomera | 85 | 25 |
| La Palma | 80 | 100 |
| Fuerteventura | 70 | 200 |
| Lanzarote | 70 | 250 |
| Tenerife | 55 | 1000 |
| Gran Canaria | 50 | 1100 |
| Balearic Islands | 40 | - |
| Mainland | 20 | - |

**Consumption Tier Scoring**:

| Annual kWh | Score |
|------------|-------|
| < 3,000 | 35 |
| 3,000 - 6,000 | 50 |
| 6,000 - 12,000 | 65 |
| 12,000 - 25,000 | 80 |
| 25,000 - 50,000 | 90 |
| > 50,000 | 95 |

**Arbitrage Savings Tiers**:

| Annual EUR | Score |
|------------|-------|
| < 50 | 25 |
| 50 - 100 | 45 |
| 100 - 200 | 60 |
| 200 - 400 | 75 |
| 400 - 600 | 85 |
| > 600 | 95 |

**Battery Sizing Algorithm**:
```
dailyShiftableKwh = peakDailyKwh × 0.8
arbitrageCapacity = dailyShiftableKwh / 0.90  // efficiency
backupCapacity = dailyKwh / 24 × 4 hours

recommendedKwh = max(arbitrageCapacity, backupCapacity)
batteryKwh = roundToStandardSize(recommendedKwh)

// Standard sizes: 5, 7, 10, 13, 15, 20, 25, 30, 40, 50, 75, 100 kWh
```

---

### 3.3 Combined Assessment

```
totalScore = (solarScore × 0.55) + (batteryScore × 0.45)

totalSavings = solarSavings
             + arbitrageSavings
             + selfConsumptionBoost  // +25% with battery
             + outageProtectionValue
```

---

## 4. Consumption Estimation

### 4.1 Base Consumption by Segment (kWh/m²/year)

| Segment | Base | + Heating | + Cooling | Peak Hours | Self-Consumption |
|---------|------|-----------|-----------|------------|------------------|
| residential | 35 | 15 | 10 | 45% | 30% |
| apartment_building | 40 | 15 | 12 | 40% | 25% |
| villa | 55 | 20 | 18 | 50% | 35% |
| commercial | 80 | 25 | 35 | 25% | 60% |
| office | 100 | 30 | 40 | 15% | 70% |
| retail | 120 | 25 | 50 | 30% | 55% |
| restaurant | 200 | 30 | 40 | 35% | 50% |
| hotel | 150 | 35 | 45 | 40% | 45% |
| industrial | 150 | 20 | 30 | 20% | 65% |
| warehouse | 40 | 15 | 15 | 15% | 70% |
| factory | 250 | 25 | 35 | 15% | 75% |
| agricultural | 60 | 10 | 20 | 20% | 50% |
| greenhouse | 180 | 60 | 40 | 30% | 55% |

### 4.2 Climate Zone Multipliers

| Zone | Heating | Cooling | Detection |
|------|---------|---------|-----------|
| Canarias | 0.3× | 1.4× | Coordinates in Canary bounding boxes |
| Mediterráneo | 0.6× | 1.3× | Coastal Mediterranean |
| Interior Sur | 0.8× | 1.5× | Andalucía interior |
| Interior Centro | 1.2× | 1.2× | Castilla region |
| Norte | 1.5× | 0.5× | Northern Atlantic coast |
| Pirenaico | 1.8× | 0.3× | Pyrenees area |

---

## 5. Electricity Tariff Structure

### 5.1 Tariff 2.0TD (Residential, <15kW)

| Period | Hours | Price (€/kWh) |
|--------|-------|---------------|
| P1 Peak | 18:00-22:00 | 0.22 |
| P2 Flat | 08:00-17:00, 22:00-23:00 | 0.15 |
| P3 Valley | 00:00-07:00 | 0.08 |

**Arbitrage Spread**: ~€0.14/kWh

### 5.2 Tariff 3.0TD (Commercial, >15kW)

| Period | Hours | Price (€/kWh) |
|--------|-------|---------------|
| P1 Super Peak | 10-13h, 18-21h | 0.25 |
| P2 Peak | 08-09h, 14-17h, 22-23h | 0.18 |
| P3 Valley | 00-07h | 0.09 |

**Arbitrage Spread**: ~€0.16/kWh

---

## 6. Data Provenance System

### 6.1 Source Types

| Source | Color | Confidence | Description |
|--------|-------|------------|-------------|
| API | Green | 75-95% | External service data (Catastro, PVGIS, ESIOS) |
| Config | Blue | 60-70% | User-provided parameter |
| Estimate | Yellow | 40-65% | Calculated from statistical model |
| Fallback | Red | 45-60% | API unavailable, using defaults |

### 6.2 Confidence Tracking per Field

| Field | Best Source | Best Conf. | Fallback Source | Fallback Conf. |
|-------|-------------|------------|-----------------|----------------|
| Roof Area | Catastro | 75% | - | - |
| Floors | Catastro | 90% | Estimate (1) | 40% |
| Building Type | Catastro | 85% | User selection | 60% |
| Irradiance | PVGIS | 85% | Regional default | 60% |
| Consumption | Model | 50-65% | - | - |
| Price | ESIOS | 75% | Default €0.20 | 50% |
| Vulnerability | Model | 60-85% | - | - |
| Arbitrage | ESIOS | 75% | PVPC historical | 45% |

---

## 7. Report Generation

### 7.1 Individual Building Report

**Sections**:
1. Score display (primary score based on assessment type)
2. Score breakdown with component weights
3. Key results (savings, system size, battery capacity)
4. Building info summary
5. Technical data table with provenance pills
6. Methodology notes
7. Reliability assessment & warnings
8. Legal disclaimer

**Format**: PDF (jsPDF), ~2 pages

### 7.2 Area Prospect Report

**Sections**:
1. Search metadata (area, filters, date)
2. Confidence assessment (weighted factors)
3. Top 20 buildings table
4. Summary statistics
5. Limitations & recommendations

**Format**: PDF (jsPDF), 3-5 pages

---

## 8. Performance Characteristics

### 8.1 Response Times

| Operation | Typical | Max |
|-----------|---------|-----|
| Catastro fetch | 3-5s | 15s (timeout) |
| PVGIS fetch | 1-2s | 10s (timeout) |
| ESIOS fetch | 2-3s | 10s (timeout) |
| Scoring (200 buildings) | <1s | - |
| **Total search** | **8-12s** | **~20s** |
| PDF generation | 1-3s | - |

### 8.2 Limits

| Parameter | Limit |
|-----------|-------|
| Max search area | 5km × 5km |
| Max results | 200 buildings |
| ESIOS cache TTL | 6 hours |

---

## 9. Error Handling & Fallbacks

| Service | Failure Mode | Fallback |
|---------|--------------|----------|
| Catastro | Timeout/error | Empty results |
| PVGIS | Timeout/error | Regional kWh/kWp defaults |
| ESIOS | No token/timeout | €0.20/kWh default |
| ESIOS | API error | Historical PVPC averages |

---

## 10. Security

- **Authentication**: Supabase session required
- **Authorization**: Admin role only (`installers.role = 'admin'`)
- **Input Validation**: Bounds range, area size, enum types
- **Rate Limiting**: Implicit via area size constraint

---

## 11. File Structure

```
src/
├── app/
│   ├── installer/prospecting/
│   │   └── page.tsx              # Main prospecting page
│   └── api/prospecting/
│       └── search/route.ts       # Search API endpoint
├── components/map/
│   ├── ProspectMap.tsx           # MapLibre map component
│   ├── ProspectFilters.tsx       # Filter controls
│   ├── BuildingResultsList.tsx   # Results display
│   └── types.ts                  # Shared TypeScript types
├── lib/
│   ├── config/
│   │   ├── battery-config.ts     # Battery parameters & weights
│   │   ├── consumption-profiles.ts # Segment consumption data
│   │   ├── electricity-tariffs.ts  # PVPC tariff structure
│   │   └── assessment-config.ts    # General assessment params
│   └── services/
│       ├── catastro-inspire.ts   # Catastro WFS client
│       ├── pvgis.ts              # PVGIS API client
│       ├── esios.ts              # ESIOS API client
│       ├── prospect-scorer.ts    # Scoring algorithms
│       ├── prospect-report.ts    # Area PDF report
│       └── building-report.ts    # Individual PDF report
```

---

## 12. Known Limitations

1. **Roof orientation**: Derived from building footprint shape, not actual roof slope
2. **Shading analysis**: Not performed (no LiDAR/satellite shadow data)
3. **Actual consumption**: Uses statistical profiles, not real meter data
4. **Roof obstacles**: 30% deduction assumed, not measured
5. **Grid connection capacity**: Not validated
6. **Local incentives**: Not included in savings calculations

---

## 13. Future Enhancements

### High Priority
- [ ] PVGIS result caching (by location grid)
- [ ] Google Solar API integration (where available)
- [ ] Sensitivity analysis (price/consumption scenarios)

### Medium Priority
- [ ] Bulk CSV import for building lists
- [ ] Historical tracking of scored buildings
- [ ] Integration tests for API layer

### Low Priority
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Mobile-optimized UI

---

## 14. Environment Variables

```bash
# Required
ESIOS_API_TOKEN=<REE API token>

# Supabase (auto-configured)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Redis (for ESIOS caching)
REDIS_URL=...
```

---

## Appendix A: TypeScript Interfaces

```typescript
interface BuildingResult {
  buildingId: string | null;
  roofAreaM2: number | null;
  orientationDegrees: number | null;
  orientationLabel: string | null;
  polygonCoordinates: [number, number][] | null;

  // Catastro data
  numberOfFloors: number | null;
  currentUse: string | null;
  currentUseLabel: string | null;
  numberOfDwellings: number | null;
  province: string | null;
  municipality: string | null;
  cadastralReference: string | null;

  // Scores
  score?: number;
  solarScore?: number;
  batteryScore?: number;

  // Metrics
  systemSizeKw?: number;
  annualProductionKwh?: number;
  annualSavingsEur?: number;
  batteryKwh?: number;
  gridVulnerability?: number;
  arbitrageSavingsEur?: number;
  estimatedConsumptionKwh?: number;
  selfConsumptionRatio?: number;

  // Data quality
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

interface DataProvenance {
  source: 'api' | 'config' | 'estimate' | 'fallback';
  confidence: number;  // 0-100
  note?: string;
}
```

---

*Document generated for engineering review. Contact: engineering@aureon.es*
