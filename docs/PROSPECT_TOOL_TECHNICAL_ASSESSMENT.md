# TECHNICAL ASSESSMENT: AUREON PROSPECTING TOOL

**Version**: 1.1
**Date**: March 2026 (Updated)
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

**Note**: Province/municipality are NOT parsed from cadastral references (they are grid codes, not INE codes). Location data comes from address APIs or DNPRC responses.

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

### 2.4 Catastro DNPRC API (Dwelling Count)

**Endpoint**: `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC`

**Purpose**: Get exact dwelling/unit count for apartment buildings

**How It Works**:
1. Query with 14-character parcel reference (e.g., `1329303FS1512N`)
2. API returns all registered units within that parcel
3. Each unit has a unique 20-char reference (14 parcel + 4 unit + 2 control)

**Data Retrieved**:
| Field | Source Element | Description |
|-------|----------------|-------------|
| Total Units | `<cudnp>` | Count of registered dwellings |
| Unit Details | `<rcdnp>` blocks | Per-unit floor/door info |
| Floor | `<pt>` | Floor number (00 = ground) |
| Door | `<pu>` | Door/unit identifier |
| Address | `<nv>`, `<nm>`, `<np>` | Street, municipality, province |

**Use Case**: Pre-populates apartment building modal with accurate unit counts from official registry.

**API Route**: `/api/prospecting/dwelling-count?ref=<cadastralRef>`

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

// Residential cap: grants only cover up to 10 kWh, practical max 15 kWh
if (segment in ['residential', 'apartment_building', 'villa']) {
  recommendedKwh = min(recommendedKwh, 15)
}

batteryKwh = roundToStandardSize(recommendedKwh)

// Standard sizes: 5, 7, 10, 13, 15, 20, 25, 30, 40, 50, 75, 100 kWh
```

**Apartment Building Per-Unit Calculation**:
- Standard battery per unit: **10 kWh** (optimal for grants)
- Total building capacity: `units × 10 kWh`
- Grants calculated per-unit basis

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

## 4. Grant System (Two-Level Architecture)

### 4.1 Design Philosophy

The system uses a **two-level** approach to balance simplicity with accuracy:

| Level | Purpose | UI Element |
|-------|---------|------------|
| **Grant Category** | Determines grant eligibility | Toggle: Residential / Business |
| **Business Segment** | Determines consumption profile | Dropdown: specific building types |

### 4.2 Grant Category

| Category | Grants Available | Tax Incentives |
|----------|------------------|----------------|
| `residential` | Regional, Cabildo, Energy Communities | IRPF 40%, IBI/ICIO |
| `business` | PYME programs (future) | IVA, Sociedades (future) |

### 4.3 Business Segments by Category

**Residential**:
- `residential` - Vivienda unifamiliar
- `apartment_building` - Edificio de pisos
- `villa` - Chalet / Villa
- `residential_new` - Vivienda nueva (<5 años)

**Business**:
- `commercial`, `office`, `retail`, `restaurant`, `hotel`
- `industrial`, `warehouse`, `factory`
- `agricultural`, `greenhouse`

### 4.4 Stackable Grants (Canary Islands 2026)

| Grant | Organization | Rate | Max | Islands |
|-------|--------------|------|-----|---------|
| Regional Battery | Gobierno de Canarias | 490 €/kWh | 4,900€ (10 kWh max) | All |
| Cabildo GC | Cabildo Gran Canaria | 300 €/kWh | 1,000€ | Gran Canaria |
| Medida I | Cabildo Fuerteventura | 50% of cost | 5,000€ | Fuerteventura |

**IRPF Deduction**: 40% of remaining cost after grants (max base 7,500€, residential only)

### 4.5 Grant Calculation Example (Fuerteventura, 10 kWh)

```
Battery cost: 9,000 EUR
├── Medida I (50%):     -4,500 EUR
├── Regional (490×10):  -4,900 EUR
└── Net cost:               0 EUR (or negative!)

Total grants: 9,400 EUR = 104% coverage
```

### 4.6 Waterfall Chart Visualization

The PDF report includes a waterfall chart showing:
1. Initial battery cost (gray bar)
2. Each grant deduction (green bars)
3. IRPF deduction (blue bar)
4. Final net cost (light green)

**Layout**: Bars left-aligned, values as sublabels, summary box with total savings percentage.

---

## 5. Consumption Estimation

### 5.1 Base Consumption by Segment (kWh/m²/year)

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

### 5.2 Climate Zone Multipliers

| Zone | Heating | Cooling | Detection |
|------|---------|---------|-----------|
| Canarias | 0.3× | 1.4× | Coordinates in Canary bounding boxes |
| Mediterráneo | 0.6× | 1.3× | Coastal Mediterranean |
| Interior Sur | 0.8× | 1.5× | Andalucía interior |
| Interior Centro | 1.2× | 1.2× | Castilla region |
| Norte | 1.5× | 0.5× | Northern Atlantic coast |
| Pirenaico | 1.8× | 0.3× | Pyrenees area |

---

## 6. Electricity Tariff Structure

### 6.1 Tariff 2.0TD (Residential, <15kW)

| Period | Hours | Price (€/kWh) |
|--------|-------|---------------|
| P1 Peak | 18:00-22:00 | 0.22 |
| P2 Flat | 08:00-17:00, 22:00-23:00 | 0.15 |
| P3 Valley | 00:00-07:00 | 0.08 |

**Arbitrage Spread**: ~€0.14/kWh

### 6.2 Tariff 3.0TD (Commercial, >15kW)

| Period | Hours | Price (€/kWh) |
|--------|-------|---------------|
| P1 Super Peak | 10-13h, 18-21h | 0.25 |
| P2 Peak | 08-09h, 14-17h, 22-23h | 0.18 |
| P3 Valley | 00-07h | 0.09 |

**Arbitrage Spread**: ~€0.16/kWh

---

## 7. Data Provenance System

### 7.1 Source Types

| Source | Color | Confidence | Description |
|--------|-------|------------|-------------|
| API | Green | 75-95% | External service data (Catastro, PVGIS, ESIOS) |
| Config | Blue | 60-70% | User-provided parameter |
| Estimate | Yellow | 40-65% | Calculated from statistical model |
| Fallback | Red | 45-60% | API unavailable, using defaults |

### 7.2 Confidence Tracking per Field

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

## 8. Report Generation

### 8.1 Individual Building Report

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

### 8.2 Area Prospect Report

**Sections**:
1. Search metadata (area, filters, date)
2. Confidence assessment (weighted factors)
3. Top 20 buildings table
4. Summary statistics
5. Limitations & recommendations

**Format**: PDF (jsPDF), 3-5 pages

---

## 9. Performance Characteristics

### 9.1 Response Times

| Operation | Typical | Max |
|-----------|---------|-----|
| Catastro fetch | 3-5s | 15s (timeout) |
| PVGIS fetch | 1-2s | 10s (timeout) |
| ESIOS fetch | 2-3s | 10s (timeout) |
| Scoring (200 buildings) | <1s | - |
| **Total search** | **8-12s** | **~20s** |
| PDF generation | 1-3s | - |

### 9.2 Limits

| Parameter | Limit |
|-----------|-------|
| Max search area | 5km × 5km |
| Max results | 200 buildings |
| ESIOS cache TTL | 6 hours |

---

## 10. Error Handling & Fallbacks

| Service | Failure Mode | Fallback |
|---------|--------------|----------|
| Catastro | Timeout/error | Empty results |
| PVGIS | Timeout/error | Regional kWh/kWp defaults |
| ESIOS | No token/timeout | €0.20/kWh default |
| ESIOS | API error | Historical PVPC averages |

---

## 11. Security

- **Authentication**: Supabase session required
- **Authorization**: Admin role only (`installers.role = 'admin'`)
- **Input Validation**: Bounds range, area size, enum types
- **Rate Limiting**: Implicit via area size constraint

---

## 12. File Structure

```
src/
├── app/
│   ├── installer/prospecting/
│   │   └── page.tsx              # Main prospecting page
│   └── api/prospecting/
│       ├── search/route.ts       # Search API endpoint
│       ├── address/route.ts      # Address lookup API
│       └── dwelling-count/route.ts # Catastro DNPRC dwelling count API
├── components/map/
│   ├── ProspectMap.tsx           # MapLibre map component
│   ├── ProspectFilters.tsx       # Filter controls (grant category toggle)
│   ├── BuildingResultsList.tsx   # Results display + apartment modal
│   └── types.ts                  # Shared TypeScript types (GrantCategory)
├── lib/
│   ├── config/
│   │   ├── battery-config.ts     # Battery parameters & weights
│   │   ├── consumption-profiles.ts # Segment consumption data
│   │   ├── electricity-tariffs.ts  # PVPC tariff structure
│   │   ├── assessment-config.ts    # General assessment params
│   │   └── incentives/
│   │       └── grants-2026.ts    # Stackable grant programs & calculator
│   └── services/
│       ├── catastro-inspire.ts   # Catastro WFS client
│       ├── pvgis.ts              # PVGIS API client
│       ├── esios.ts              # ESIOS API client
│       ├── prospect-scorer.ts    # Scoring algorithms (15 kWh cap)
│       ├── prospect-report.ts    # Area PDF report
│       └── building-report.ts    # Individual PDF report + waterfall chart
```

---

## 13. Known Limitations

1. **Roof orientation**: Derived from building footprint shape, not actual roof slope
2. **Shading analysis**: Not performed (no LiDAR/satellite shadow data)
3. **Actual consumption**: Uses statistical profiles, not real meter data
4. **Roof obstacles**: 30% deduction assumed, not measured
5. **Grid connection capacity**: Not validated
6. ~~**Local incentives**: Not included in savings calculations~~ ✅ **RESOLVED**: Grant stacking now implemented for Canary Islands (Regional, Cabildo, IRPF)
7. **Catastro dwelling count**: May differ from actual units (some registered as commercial)

---

## 14. Future Enhancements

### High Priority
- [ ] PVGIS result caching (by location grid)
- [ ] Google Solar API integration (where available)
- [ ] Sensitivity analysis (price/consumption scenarios)
- [ ] Business grants integration (PYME programs)
- [ ] Energy Communities grant support

### Medium Priority
- [ ] Bulk CSV import for building lists
- [ ] Historical tracking of scored buildings
- [ ] Integration tests for API layer
- [ ] Cache dwelling counts in Supabase

### Low Priority
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Mobile-optimized UI

### Recently Completed ✅
- [x] Two-level grant system (Category + Segment)
- [x] Catastro DNPRC dwelling count API
- [x] Apartment building per-unit calculations
- [x] Stackable grant waterfall visualization
- [x] 15 kWh residential battery cap
- [x] Fixed province parsing from cadastral references

---

## 15. Environment Variables

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
// Grant category for eligibility (simple toggle)
type GrantCategory = 'residential' | 'business';

// Assessment type
type AssessmentType = 'solar' | 'battery' | 'combined';

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
  island: string | null;  // For Canary Islands grant eligibility

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
  outageProtectionValue?: number;

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

// Apartment building modal input
interface ApartmentBuildingInput {
  floors: number;
  units: number;
}

// Grant program definition
interface GrantProgram {
  id: string;
  name: string;
  organization: string;
  category: GrantCategory;
  ratePerKwh: number;
  maxAmount: number;
  maxCapacityKwh?: number;
  percentageCap?: number;  // e.g., 0.5 = 50%
  islands: string[];
  deadline: string;
  status: 'active' | 'upcoming' | 'exhausted';
  compatibleWith: string[];
}
```

---

*Document generated for engineering review. Contact: engineering@aureon.es*
