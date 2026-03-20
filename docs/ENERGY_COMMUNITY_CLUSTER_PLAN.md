# Energy Community Cluster Finder - Implementation Plan

## Context

The current cluster finder is glitchy and designed for generic prospecting, not energy community vetting. Energy communities in Spain have specific legal requirements (2km/5km radius rules, same Transformation Center), composition needs (load diversity), and scoring criteria that the current tool doesn't address.

**Goal**: Transform the cluster finder into an Energy Community vetting tool that ranks potential communities by suitability score and ROI.

---

## Phase 1: Fix Glitches & Architecture

### 1.1 Add Spatial Grid Index (fix O(n×m) performance)

**File**: `src/lib/services/cluster-finder.ts`

Create a spatial hash grid (500m cells) to avoid iterating all buildings for each anchor:

```typescript
interface SpatialGrid {
  cellSizeKm: number;
  cells: Map<string, BuildingResult[]>;
}

function buildSpatialGrid(buildings: BuildingResult[]): SpatialGrid
function getBuildingsInRadius(grid: SpatialGrid, center, radiusKm): BuildingResult[]
```

### 1.2 Dynamic Radius by Anchor Type

Apply Spanish energy community rules:
- **2km** for supermarket/retail (urban rooftops)
- **5km** for industrial/warehouse (industrial land)

```typescript
function getRadiusForAnchor(anchor: CommercialAnchor): 2 | 5
```

### 1.3 Building Deduplication

Track which buildings are assigned to which cluster. Strategy: assign to closest anchor.

```typescript
interface BuildingAssignment {
  buildingId: string;
  clusterId: string;
  distanceKm: number;
}
```

### 1.4 Auto-Recompute on Data Change

Add `useEffect` in ProspectMap to clear `clusterFinderActive` when `buildings` or `anchors` change, preventing stale results.

---

## Phase 2: Cluster Scoring System

### 2.1 New Scorer Module

**New file**: `src/lib/services/cluster-scorer.ts`

Implements 4-component scoring (weights sum to 1.0):

| Component | Weight | Logic |
|-----------|--------|-------|
| Roof-to-Member Ratio | 40% | `min(100, (m²/participant / 10) * 100)` - Target >10m² |
| Load Diversity | 30% | Requires 1+ daylight user + 5+ night-heavy (VV/residential) |
| Proximity Density | 20% | `100 - (avgDistanceKm * 40)` - Tighter = better |
| Battery-Ready | 10% | Count buildings with EPC F/G rating (60% IRPF eligible) |

### 2.2 ROI/Payback Calculation

Use existing IRPF community rate (60% deduction from `src/lib/config/incentives/irpf.ts`):

```typescript
function calculateClusterROI(cluster): {
  totalInvestmentEur: number;
  annualSavingsEur: number;
  paybackYears: number;
  irpfDeductionEur: number;
}
```

### 2.3 Types

**Modify**: `src/components/map/types.ts`

```typescript
export interface ScoredClusterResult extends ClusterResult {
  suitabilityScore: number; // 0-100
  scoreComponents: { roofRatio, diversity, proximity, batteryReady };
  roi: { investment, savings, payback };
  vvCount: number;
  ctZoneWarning: boolean;
}
```

---

## Phase 3: 24-Hour Load Profiles

### 3.1 Hourly Consumption Curves

**Modify**: `src/lib/config/consumption-profiles.ts`

Add `HOURLY_CURVES` derived from existing `peakHoursFraction`:

```typescript
export const HOURLY_CURVES: Record<string, number[]> = {
  'vv-tourist': [0.02, 0.02, 0.01, ...], // 24 values summing to 1.0
  'residential': [...],
  'office': [...],
  'supermarket': [...],
  'industrial': [...],
};
```

**Key profiles**:
- `vv-tourist`: Evening AC peaks (18:00-23:00), water heater morning
- `office`: 9-18h plateau, minimal evening
- `supermarket`: Constant refrigeration + daytime peaks
- `residential`: Morning + evening spikes

### 3.2 Energy Balance Simulator

**New file**: `src/lib/services/energy-balance.ts`

```typescript
interface HourlyBalance {
  hour: number;
  generationKwh: number;
  consumptionKwh: number;
  selfConsumedKwh: number;
  gridExportKwh: number;
  gridImportKwh: number;
}

function simulateClusterBalance(cluster, solarCurve): {
  hourly: HourlyBalance[];
  selfConsumptionRatio: number;
  wastedKwh: number;
}
```

### 3.3 Solar Production Curve

**New file**: `src/lib/config/solar-profiles.ts`

Standard solar production curve for Canary Islands (adjustable by season).

---

## Phase 4: VV Registry Integration

### 4.1 VV Lookup Service

**New file**: `src/lib/services/vv-lookup.ts`

Query Supabase `vv_registry` for VVs within cluster radius:

```typescript
async function getVVsInRadius(center, radiusKm): Promise<VVProperty[]>

interface VVProperty {
  establecimientoId: string;
  location: { lat, lon };
  plazas: number;
  estimatedDailyKwh: number; // ~20 kWh/plaza during occupancy
}
```

### 4.2 Enrich Clusters with VV Data

Add VV count and consumption to cluster results for diversity scoring.

### 4.3 VV API Endpoint

**New file**: `src/app/api/vv/search/route.ts`

```
GET /api/vv/search?lat=...&lon=...&radius=...
```

---

## Phase 5: CT Heuristic (Transformation Center)

Since ID_CT data is not available, implement a geo-heuristic:

**New file**: `src/lib/services/ct-heuristic.ts`

```typescript
// Buildings within ~200m likely share the same CT
function inferCTZone(lat, lon): string // hash of grid cell

function detectCrossCTRisk(buildings): {
  risk: boolean;
  zoneCount: number;
}
```

Flag clusters that span multiple inferred CT zones with a warning badge.

**Future**: Add `setCTDataSource()` hook for when real CT data becomes available.

---

## Phase 6: UI Components

### 6.1 Cluster Ranking Panel

**New file**: `src/components/map/ClusterRankingPanel.tsx`

Left sidebar panel showing top 10 clusters:
- Ranked by payback years (ascending)
- Score badge (color-coded 0-100)
- Building count, VV count
- CT warning badge if applicable
- Click to select and zoom
- "Export Hit List" CSV button

### 6.2 Energy Balance Chart

**New file**: `src/components/charts/EnergyBalanceChart.tsx`

24-hour stacked area chart showing:
- Green area: Solar generation
- Blue line: Aggregate consumption
- Shaded regions: Self-consumed vs exported vs imported

### 6.3 ProspectMap Updates

**Modify**: `src/components/map/ProspectMap.tsx`

- Add "Energy Community Mode" toggle
- Show cluster boundary polygons (not just circles)
- Integrate ClusterRankingPanel
- Add radius indicator showing 2km vs 5km based on anchor type

### 6.4 Cluster Detail in Sidebar

**Modify**: `src/components/map/PropertySidebar.tsx`

Add cluster detail tab:
- Participant breakdown (building types)
- Score component breakdown bars
- ROI summary with IRPF deduction
- Energy balance mini-chart
- "Generate Proposal" button

---

## Phase 7: Export & Reporting

### 7.1 Hit List Export

**New file**: `src/lib/services/cluster-export.ts`

CSV columns: Rank, Anchor, Score, Buildings, VVs, Roof Area, Payback, CT Warning

### 7.2 Cluster Proposal PDF

Extend existing PDF report to include:
- Energy balance chart
- Participant list
- Score breakdown
- Synthetic load profile parameters (documented)

---

## Files Summary

| Action | File |
|--------|------|
| Modify | `src/lib/services/cluster-finder.ts` |
| Modify | `src/lib/config/consumption-profiles.ts` |
| Modify | `src/components/map/ProspectMap.tsx` |
| Modify | `src/components/map/PropertySidebar.tsx` |
| Modify | `src/components/map/types.ts` |
| Create | `src/lib/services/cluster-scorer.ts` |
| Create | `src/lib/services/energy-balance.ts` |
| Create | `src/lib/services/vv-lookup.ts` |
| Create | `src/lib/services/ct-heuristic.ts` |
| Create | `src/lib/config/solar-profiles.ts` |
| Create | `src/components/map/ClusterRankingPanel.tsx` |
| Create | `src/components/charts/EnergyBalanceChart.tsx` |
| Create | `src/app/api/vv/search/route.ts` |
| Create | `src/lib/services/cluster-export.ts` |

---

## Verification

1. **Unit tests**: Score each component with edge cases
2. **Integration**: Query VV registry, verify spatial joins
3. **E2E**: Draw area → Find clusters → View ranking → Export CSV
4. **Visual**: Verify 2km/5km radius renders correctly per anchor type
5. **Energy balance**: Check 24h chart renders, self-consumption ratio makes sense

---

## Implementation Order

1. **Phase 1** (Glitch fixes): Spatial grid, dynamic radius, deduplication
2. **Phase 2** (Scoring): 4-component scorer, ROI calculation
3. **Phase 3** (Load profiles): 24h curves, energy balance simulator
4. **Phase 4** (VV): Lookup service, API, cluster enrichment
5. **Phase 5** (CT): Geo-heuristic, warning flags
6. **Phase 6** (UI): Ranking panel, energy chart, ProspectMap updates
7. **Phase 7** (Export): CSV hit list, PDF proposal
