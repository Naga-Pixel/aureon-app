# Aureon Solar Assessment Tool - Technical Breakdown

## Architecture Overview

```
User Input (Address, Segment, Floors)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Data Collection                       │
├─────────────────────────────────────────────────────────┤
│  1. Geocoding (Google/Cartociudad)                      │
│  2. Building Data (Catastro → INSPIRE WFS)              │
│  3. Solar Irradiance (PVGIS)                            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Calculations                          │
├─────────────────────────────────────────────────────────┤
│  • System Size (kW)                                     │
│  • Annual Production (kWh)                              │
│  • Annual Savings (€)                                   │
│  • Payback Period (years)                               │
│  • 25-year Lifetime Savings (€)                         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Scoring (0-100)                       │
├─────────────────────────────────────────────────────────┤
│  • Solar Potential:      40 pts                         │
│  • Economic Potential:   30 pts                         │
│  • Execution Simplicity: 15 pts                         │
│  • Segment Fit:          15 pts                         │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Data Sources

### 1.1 Geocoding

**File:** `src/lib/services/google-geocoding.ts`

- Converts address → latitude/longitude
- Uses Google Geocoding API (or Cartociudad for Spain)

### 1.2 Building Data - Catastro

**File:** `src/lib/services/catastro.ts`

- **API:** `https://ovc.catastro.meh.es/ovcservweb/`
- **Returns:**
  - `buildingAreaM2` - Total constructed area (all floors)
  - `numberOfFloors` - Floor count
  - `cadastralReference` - Unique building ID
  - `buildingUse` - Property type
  - `yearBuilt`

> ⚠️ **Limitation:** Returns total building area, not roof area. Must divide by floors.

### 1.3 Building Footprint - INSPIRE WFS

**File:** `src/lib/services/catastro-inspire.ts`

- **API:** `https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwfs.aspx`
- **Returns:**
  - `roofAreaM2` - Actual roof footprint (calculated from polygon)
  - `orientationDegrees` - Building orientation (0°=N, 90°=E, etc.)
- **Method:** Fetches GeoJSON polygon, calculates area via Shoelace formula

### 1.4 Solar Irradiance - PVGIS

**File:** `src/lib/services/pvgis.ts`

- **API:** `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc` (EU Joint Research Centre)
- **Returns:**
  - `kwhPerKwp` - Annual energy production per kW installed (location-specific)
  - `optimalAngle` - Optimal panel tilt angle
- **Fallback values by region:**

| Region | kWh/kWp |
|--------|---------|
| Canary Islands | 1700 |
| South Spain | 1600 |
| Central Spain | 1400 |
| North Spain | 1200 |
| Default | 1500 |

---

## 2. Calculation Logic

**File:** `src/lib/services/assessment-scorer.ts`

### 2.1 System Size (kW)

```javascript
// If INSPIRE data available:
roofArea = inspireRoofAreaM2

// If only Catastro:
roofArea = buildingAreaM2 / numberOfFloors

// Usable area (assumption):
usableArea = roofArea * 0.6  // 60% for Catastro
usableArea = roofArea * 0.7  // 70% for INSPIRE

// Panel count:
panelCount = floor(usableArea / 2)  // ~2m² per panel

// System size:
systemSizeKw = (panelCount * 400W) / 1000
```

### 2.2 Annual Production (kWh)

```javascript
// Using PVGIS data (preferred):
annualProductionKwh = systemSizeKw * kwhPerKwp

// Fallback with sunshine hours:
annualProductionKwh = systemSizeKw * sunshineHours * 0.85
```

### 2.3 Annual Savings (€)

```javascript
annualSavingsEur = annualProductionKwh * electricityPriceEur
// Default electricity price: €0.20/kWh
```

### 2.4 Payback Period (years)

```javascript
installationCost = systemSizeKw * 1200  // €1,200/kW

// Iterative calculation with degradation:
for (year = 1; year <= 25; year++) {
  yearProduction = annualProduction * (0.995 ^ (year - 1))
  cumulativeSavings += yearProduction * electricityPrice
  if (cumulativeSavings >= installationCost) {
    paybackYears = year + fraction
    break
  }
}
```

### 2.5 Lifetime Savings (25 years)

```javascript
// Geometric series with 0.5%/year degradation:
degradationRate = 0.005
r = 1 - degradationRate  // 0.995

lifetimeProduction = annualProduction * (1 - r^25) / degradationRate
lifetimeSavings = lifetimeProduction * electricityPrice
```

---

## 3. Scoring Algorithm

### 3.1 Solar Potential Score (0-40 pts)

```javascript
// System size factor (0-20): larger = better, caps at 100kW
sizeFactor = min(systemSizeKw / 100, 1) * 20

// Roof quality factor (0-20): usable ratio
usableRatio = maxArrayArea / roofArea  // or 0.6 default
qualityFactor = usableRatio * 20

solarPotentialScore = sizeFactor + qualityFactor
```

### 3.2 Economic Potential Score (0-30 pts)

```javascript
// Savings factor (0-20): caps at €10k/year
savingsFactor = min(annualSavings / 10000, 1) * 20

// Efficiency factor (0-10): kWh per kW installed
kwhPerKw = annualProduction / systemSizeKw
efficiencyFactor = min(kwhPerKw / 1500, 1) * 10

economicPotentialScore = savingsFactor + efficiencyFactor
```

### 3.3 Execution Simplicity Score (0-15 pts)

```javascript
// Fewer roof segments = simpler installation
segmentPenalty = min(roofSegmentCount - 1, 10)
score = 15 - segmentPenalty

// Manual fallback penalty (less certainty)
if (isManualFallback) score -= 3

executionSimplicityScore = max(0, score)
```

### 3.4 Segment Fit Score (0-15 pts)

```javascript
// Business segment multipliers:
const multipliers = {
  warehouse:    1.20,  // Best fit
  agricultural: 1.15,
  industrial:   1.10,
  hotel:        1.00,
  retail:       0.90,
  office:       0.85,  // Worst fit
}

segmentFitScore = min(multiplier * 12.5, 15)
```

---

## 4. Fixed Assumptions

| Parameter | Value | Source |
|-----------|-------|--------|
| Panel power | 400W | Industry standard |
| System efficiency | 85% | Conservative estimate |
| Installation cost | €1,200/kW | Market average |
| Panel degradation | 0.5%/year | Industry standard |
| System lifetime | 25 years | Standard warranty |
| Usable roof % | 60-70% | Assumption |
| Electricity price | €0.20/kWh | Default (editable) |

---

## 5. Known Limitations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| No shading analysis | May overestimate production | Manual adjustment available |
| Single electricity price | No time-of-use or export rates | User can edit price |
| Fixed installation cost | Varies by installer/region | Could make editable |
| No grid capacity check | May propose oversized systems | Manual review needed |
| Orientation not used in calc | Suboptimal angle not penalized | PVGIS uses optimal angle |
| Segment fit is arbitrary | Multipliers not data-backed | Based on industry experience |

---

## 6. Data Priority

The system prioritizes data sources in this order:

1. **INSPIRE WFS (best)** → Actual roof footprint polygon
2. **Catastro (good)** → Building area / floors
3. **Manual input** → User-provided values

---

## 7. Files Reference

| File | Purpose |
|------|---------|
| `src/lib/services/assessment-scorer.ts` | Core calculation logic |
| `src/lib/config/assessment-config.ts` | Constants and thresholds |
| `src/lib/services/catastro.ts` | Catastro API integration |
| `src/lib/services/catastro-inspire.ts` | INSPIRE WFS integration |
| `src/lib/services/pvgis.ts` | Solar irradiance data |
| `src/app/api/assessment/route.ts` | Main API endpoint |
| `src/app/api/assessment/recalculate/route.ts` | Recalculation with edited values |

---

## 8. API Endpoints

### POST `/api/assessment`
Creates a new assessment from an address.

**Request:**
```json
{
  "address": "Calle Example 123, Madrid",
  "businessSegment": "hotel",
  "numberOfFloors": 3,
  "electricityPrice": 0.20,
  "leadId": null
}
```

### POST `/api/assessment/check-address`
Validates address and returns available data before running full assessment.

### POST `/api/assessment/recalculate`
Recalculates an existing assessment with updated assumptions.

**Request:**
```json
{
  "assessmentId": "uuid",
  "updates": {
    "roofAreaM2": 500,
    "usableRoofPercent": 70,
    "electricityPrice": 0.25,
    "numberOfFloors": 2
  }
}
```

---

## 9. Score Interpretation

| Score | Label | Meaning |
|-------|-------|---------|
| 80-100 | Excelente | High-priority lead, excellent solar potential |
| 60-79 | Bueno | Good candidate, worth pursuing |
| 40-59 | Moderado | Moderate potential, may need optimization |
| 0-39 | Bajo | Low potential, likely not viable |
