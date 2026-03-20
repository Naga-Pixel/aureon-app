# Strategic Command Center Implementation Plan

## Context

Transform Aureon from a prospecting tool into a "Strategic Command Center" that shows property managers exactly where the money is hidden in their portfolio. The goal is to make it visually compelling and actionable - less spreadsheet, more command center.

**Available Data (Verified Working):**
- OSM Overpass: 341 supermarkets, 1,064 industrial buildings in Gran Canaria
- Grafcan WMS: 2024 orthophotos (tested, 90KB image fetched)
- OSM: 321 power substations (usable as cluster anchors)
- **ITC PTECan**: Pre-computed solar potential per building (LiDAR-based roof analysis)
- Existing: Catastro INSPIRE, PVGIS, ESIOS, grant calculator

**Key Data Enhancement: ITC Solar Potential**
The ITC (Instituto Tecnológico de Canarias) provides pre-computed solar potential for all Canary Islands buildings via WFS. This includes LiDAR-derived roof suitability, max installable kWp, and annual production estimates. We'll bulk download this data into Supabase to avoid real-time API dependency.

---

## Phase 0: Data Infrastructure (Day 1-2)

### 0.1 ITC Solar Potential Database Table
**New migration:** `supabase/migrations/XXX_create_itc_solar_potential.sql`

```sql
CREATE TABLE itc_solar_potential (
  id BIGSERIAL PRIMARY KEY,
  cadastral_ref TEXT NOT NULL,
  geometry GEOMETRY(Polygon, 4326),
  roof_area_m2 NUMERIC,
  suitable_pv_area_m2 NUMERIC,
  max_installable_kwp NUMERIC,
  annual_production_kwh NUMERIC,
  slope_degrees NUMERIC,
  orientation_degrees NUMERIC,
  island TEXT,
  municipality TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cadastral_ref)
);

CREATE INDEX idx_itc_cadastral ON itc_solar_potential(cadastral_ref);
CREATE INDEX idx_itc_geometry ON itc_solar_potential USING GIST(geometry);
CREATE INDEX idx_itc_island ON itc_solar_potential(island);
```

### 0.2 ITC WFS Sync Script
**New file:** `scripts/sync-itc-solar.ts`

- Download from ITC WFS with pagination (10K features per request)
- Download by island to manage memory
- Upsert into Supabase (ON CONFLICT UPDATE)
- Log sync stats (new/updated/errors)

```typescript
// Pseudo-code
async function syncIsland(island: string) {
  let startIndex = 0;
  const pageSize = 10000;

  while (true) {
    const url = `${ITC_WFS_URL}?SERVICE=WFS&REQUEST=GetFeature&` +
      `TYPENAME=Autoconsumo:edificios&OUTPUTFORMAT=json&` +
      `CQL_FILTER=isla='${island}'&startIndex=${startIndex}&count=${pageSize}`;

    const features = await fetch(url).then(r => r.json());
    if (features.length === 0) break;

    await upsertFeatures(features);
    startIndex += pageSize;
  }
}
```

### 0.3 Integration with Prospect Scorer
**Modified file:** `src/lib/services/prospect-scorer.ts`

```typescript
// New function to fetch ITC data
async function getITCSolarPotential(cadastralRef: string): Promise<ITCSolarData | null> {
  const { data } = await supabase
    .from('itc_solar_potential')
    .select('*')
    .eq('cadastral_ref', cadastralRef)
    .single();
  return data;
}

// In calculateProspectScore:
// If ITC data exists, use it for roofArea, suitableArea, maxKwp
// Else fall back to Catastro + PVGIS calculation
```

### 0.4 VV Registry (Viviendas Vacacionales)
**Data source:** https://datos.canarias.es (CSV, ~14.6MB, updated monthly)

**New migration:** `supabase/migrations/XXX_create_vv_registry.sql`

```sql
CREATE TABLE vv_registry (
  id BIGSERIAL PRIMARY KEY,
  establecimiento_id TEXT UNIQUE NOT NULL,
  nombre_comercial TEXT,
  direccion TEXT,
  island TEXT,
  municipality TEXT,
  postal_code TEXT,
  plazas INTEGER,
  longitude NUMERIC,
  latitude NUMERIC,
  geometry GEOMETRY(Point, 4326),
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vv_geometry ON vv_registry USING GIST(geometry);
CREATE INDEX idx_vv_island ON vv_registry(island);
CREATE INDEX idx_vv_municipality ON vv_registry(municipality);
```

**Sync script:** `scripts/sync-vv-registry.ts`
- Download CSV from datos.canarias.es
- Parse and upsert to Supabase
- ~50K records expected

**Map layer:** Yellow dots for VVs, popup with name + beds

### 0.5 ZAR Zones (Zonas de Aceleración Renovables)
**Data source:** IDE Canarias WMS (currently La Gomera, more islands coming)

**New file:** `src/lib/services/zar-zones.ts`

```typescript
// ZAR WMS layer URL (to be confirmed when available for more islands)
const ZAR_WMS_URL = 'https://idecan1.grafcan.es/ServicioWMS/ZAR_LaGomera';

// Add as polygon layer showing:
// - Green: Suitable zones
// - Yellow: Conditioned zones (biodiversity, agriculture)
// - Red: Unsuitable zones
```

**Note:** ZAR endpoint not yet active for all islands. Add as optional layer, enable per-island as data becomes available.

---

## Phase 1: Foundation (Week 1)

### 1.1 Grafcan Orthophoto Layer
**Files:** `src/components/map/ProspectMap.tsx`

- Add Grafcan WMS as alternative base layer (like satellite toggle)
- Three-way toggle: Streets / Satellite (ESRI) / Ortofotos (Grafcan 2024)
- Pattern: Lines 103-150 (existing satellite implementation)

```
URL: https://idecan1.grafcan.es/ServicioWMS/OrtoExpress?
     service=WMS&version=1.1.1&request=GetMap&layers=0&
     format=image/jpeg&srs=EPSG:3857&bbox={bbox-epsg-3857}
```

### 1.2 OSM Overpass Service
**New file:** `src/lib/services/osm-overpass.ts`

```typescript
interface CommercialAnchor {
  id: string;
  type: 'supermarket' | 'industrial' | 'substation';
  name: string | null;
  lat: number;
  lon: number;
}

async function getCommercialAnchors(bounds: BBoxBounds): Promise<CommercialAnchor[]>
```

- Query OSM for supermarkets + industrial buildings in viewport
- Cache results by bounding box
- Respect rate limits (1 req/sec)

### 1.3 Commercial Anchors Layer
**Files:** `src/components/map/ProspectMap.tsx`

- New prop: `showCommercialAnchors?: boolean`
- Yellow/orange markers for supermarkets/industrial
- Pattern: Lines 467-535 (building markers with popup)

### 1.4 Property Intelligence Card (Sidebar)
**New file:** `src/components/map/PropertySidebar.tsx`

- Slide-out from right (480px) when building selected
- Three tabs: Físico / Financiero / Acción
- Close via X or backdrop click
- Animated with Tailwind transitions

**Tab: Físico**
- Roof area, orientation, floors, dwellings
- Provenance badges (API/Estimate/Fallback)

**Tab: Financiero**
- System size, annual production, savings
- Grant breakdown (direct + tax shield)
- Payback period

**Tab: Acción**
- "Generar PDF" button
- "Añadir a cartera" (future)

**Integration:** `src/app/installer/prospecting/page.tsx`

---

## Phase 2: Cluster Intelligence (Week 2)

### 2.1 Radius Circles
**Files:** `src/components/map/ProspectMap.tsx`

- Draw 2km/5km circles around selected anchors
- Manual Haversine calculation (no Turf.js dependency)
- Dashed stroke, semi-transparent fill

### 2.2 Cluster Finder Algorithm
**New file:** `src/lib/services/cluster-finder.ts`

```typescript
interface ClusterResult {
  anchor: CommercialAnchor;
  buildingsInRadius: number;
  totalRoofArea: number;
  estimatedSavings: number;
}

function findHighValueClusters(
  anchors: CommercialAnchor[],
  buildings: BuildingResult[],
  radiusKm: number,
  minBuildings: number
): ClusterResult[]
```

- "Cluster Finder" button in map controls
- Highlights anchors with 10+ buildings in 2km
- Sorts by potential value

### 2.3 EPC Color Coding
**Files:** `src/lib/services/prospect-scorer.ts`, `src/components/map/ProspectMap.tsx`

- Infer EPC from construction year (Catastro has this in some records)
- Color buildings: Green (A-C) → Yellow (D) → Red (E-G)
- Old buildings without solar = best prospects (show as red)

---

## Phase 3: Enhanced Reports (Week 2-3)

### 3.1 PDF with Orthophoto
**Files:** `src/lib/services/building-report.ts`

- Make `generateBuildingReport` async
- Fetch Grafcan static image for building location
- Embed at top of report (80x60mm)
- Fallback: Skip image if fetch fails

```typescript
async function generateBuildingReportAsync(
  building: BuildingResult,
  metadata: BuildingReportMetadata
): Promise<jsPDF>
```

### 3.2 Simplified Comparison Chart
**Files:** `src/lib/services/building-report.ts`

- Add simple before/after bar chart
- "Coste actual" vs "Coste con Aureon"
- Large percentage badge showing total savings

### 3.3 WhatsApp Summary (1-page)
**New function in:** `src/lib/services/building-report.ts`

```typescript
function generateWhatsAppSummary(building, metadata): jsPDF
```

- A5 format (smaller file)
- Address + score + savings + QR to full report
- Optimized for mobile viewing

---

## File Structure

### New Files
```
scripts/
├── sync-itc-solar.ts           # Bulk download ITC solar potential
└── sync-vv-registry.ts         # Bulk download VV registry

supabase/migrations/
├── XXX_create_itc_solar_potential.sql
└── XXX_create_vv_registry.sql

src/lib/services/
├── osm-overpass.ts             # OSM commercial anchors
├── cluster-finder.ts           # Cluster detection algorithm
├── itc-solar.ts                # Query local ITC data
├── vv-registry.ts              # Query local VV data
└── zar-zones.ts                # ZAR WMS layer config

src/components/map/
└── PropertySidebar.tsx         # Slide-out property card
```

### Modified Files
```
src/components/map/ProspectMap.tsx    # Grafcan layer, anchors, clusters
src/components/map/types.ts           # Add inferredEPC, constructionYear
src/app/installer/prospecting/page.tsx # Integrate PropertySidebar
src/lib/services/prospect-scorer.ts   # EPC inference
src/lib/services/building-report.ts   # Async + orthophoto + summary
```

---

## Reusable Patterns

| Need | Existing Pattern | Location |
|------|------------------|----------|
| WMS tiles | Satellite toggle | `ProspectMap.tsx:103-150` |
| GeoJSON layer | Vulnerability zones | `ProspectMap.tsx:167-209` |
| Markers with popup | Building markers | `ProspectMap.tsx:467-535` |
| Modal overlay | Apartment modal | `BuildingResultsList.tsx:454-543` |
| Provenance badges | Score source | `building-report.ts:46-57` |
| External API service | ESIOS pattern | `esios.ts` (timeout, cache, fallback) |

---

## Verification

### Manual Testing
1. **Grafcan layer**: Toggle to "Ortofotos", verify tiles load for Gran Canaria
2. **OSM anchors**: Draw bbox in Las Palmas, verify supermarket markers appear
3. **Sidebar**: Click building, verify sidebar slides out with correct data
4. **Cluster Finder**: Click button, verify anchors with 10+ buildings highlight
5. **PDF**: Generate report, verify orthophoto image appears at top

### Unit Tests
- `osm-overpass.test.ts`: Mock Overpass response parsing
- `cluster-finder.test.ts`: Haversine distance calculation
- `prospect-scorer.test.ts`: EPC inference from age

---

## No New Dependencies

All features implemented with existing stack:
- Circle geometry: Manual Haversine (no Turf.js)
- Image fetching: Native fetch + base64
- Animations: Tailwind CSS transitions
- Tabs: Custom component (no Radix)

---

## Delivery Milestones

**Phase 0 - Data Infrastructure (Days 1-3):**
- [ ] ITC solar potential table + sync script
- [ ] VV registry table + sync script
- [ ] Integration with prospect scorer (ITC → fallback)
- [ ] ZAR zones service (when WMS available)

**Week 1 - Map Layers:**
- [ ] Grafcan orthophoto toggle
- [ ] OSM commercial anchors layer
- [ ] VV registry layer (yellow dots)
- [ ] PropertySidebar (all tabs)

**Week 2 - Intelligence:**
- [ ] Radius circles around anchors
- [ ] Cluster Finder button + algorithm
- [ ] "VVs within Xkm" counter per anchor
- [ ] EPC color coding (using ITC data)

**Week 3 - Reports:**
- [ ] PDF with orthophoto
- [ ] WhatsApp summary variant
- [ ] ZAR overlay in reports (when available)
- [ ] Polish + edge cases

---

## Data Sources Reference

| Data | Source | URL | Format | Update Frequency |
|------|--------|-----|--------|------------------|
| ITC Solar Potential | ITC Canarias WFS | `oecangeoserver.itccanarias.org` | GeoJSON | Static |
| VV Registry | datos.canarias.es | [Link](https://datos.canarias.es/catalogos/general/dataset/establecimientos-extrahoteleros-de-tipologia-vivienda-vacacional-inscritos-en-el-registro) | CSV | Monthly |
| ZAR Zones | IDE Canarias WMS | TBD per island | WMS | As published |
| Commercial Anchors | OSM Overpass | `overpass-api.de` | JSON | Real-time |
| Orthophotos | Grafcan WMS | `idecan1.grafcan.es/ServicioWMS/OrtoExpress` | JPEG tiles | 2024 campaign |
