# Aureon Roadmap v1.0

## Overview

Geographic expansion: **Spain → Poland → UK**

Focus on scalability improvements and map-based prospecting tool. LLM features deferred to future phases.

---

## Phase 1: Foundation & Spain Map [4-5 weeks]

### Week 1-2: Scalability Quick Wins

- [ ] Apply pending DB migration (energy_type, price_source, country)
- [ ] Parallelize API calls in assessment route
  - `Promise.all([PVGIS, Catastro])` instead of sequential
- [ ] Add Upstash Redis for shared cache
  - Replace in-memory `Map()` in ESIOS, Energy-Charts, Octopus
- [ ] Add rate limiting middleware (Upstash Ratelimit)

### Week 3-4: Map UI + Spain Area Search

- [ ] Integrate MapLibre GL JS (free, no vendor lock-in)
- [ ] ESIOS price overlay by region
- [ ] Draw-to-select area tool
- [ ] Catastro WFS bounding box query
  - GET buildings in selected area
- [ ] Batch assessment runner
  - Score buildings without LLM, just existing scorer
- [ ] Results layer with pins + scores

### Week 5: Polish & Deploy

- [ ] Supabase Realtime for live result updates
- [ ] Filter panel (building type, min area, min score)
- [ ] Export results (CSV, PDF)
- [ ] Error handling + loading states

**Deliverable:** Map-based prospecting tool for Spain

---

## Phase 2: Poland Expansion [3-4 weeks]

### Week 6: Poland Data Sources Research & Integration

- [ ] Geocoding: Poland
  - Option A: Google (already have)
  - Option B: GUGiK (free Polish geocoder)
- [ ] Building data: INSPIRE LPIS or GUGiK cadastre
  - https://mapy.geoportal.gov.pl (WFS/WMS)
- [ ] Electricity prices: PSE (Polish grid operator)
  - API: https://www.pse.pl/transmissionGridData (free)

### Week 7-8: Poland Services

- [ ] Add PSE price service (similar to ESIOS)
- [ ] Add GUGiK cadastre service
- [ ] Add country selector to UI
- [ ] Extend validation schemas for PL
- [ ] Poland-specific scoring adjustments
  - Different solar irradiation baseline
  - Different electricity price defaults

### Week 9: Poland Map & Testing

- [ ] PVGIS works for Poland (no changes needed)
- [ ] Map region: Poland tiles + price overlay
- [ ] Area search with GUGiK data
- [ ] End-to-end testing

**Deliverable:** Full Spain + Poland support

---

## Phase 3: UK Expansion [3-4 weeks]

### Week 10: UK Data Sources

- [ ] Geocoding: Google (already have) or OS Places
- [ ] Building data: Ordnance Survey
  - OS Places API (free tier: 1k/month)
  - OR: OpenStreetMap buildings (free, less accurate)
- [ ] Electricity prices: Octopus (already have ✓)
- [ ] EPC data (Energy Performance Certificates)
  - Free API: https://epc.opendatacommunities.org

### Week 11-12: UK Services

- [ ] Add OS Places or OSM building service
- [ ] Add EPC integration (energy ratings)
- [ ] UK-specific scoring
  - Different incentive structure
  - No IGIC/IBI equivalents
- [ ] GBP currency support

### Week 13: UK Map & Testing

- [ ] PVGIS works for UK (no changes needed)
- [ ] Map region: UK tiles + Octopus price overlay
- [ ] Area search
- [ ] End-to-end testing

**Deliverable:** Full Spain + Poland + UK support

---

## Phase 4: Scale & Optimize [2-3 weeks]

### Week 14-15: Background Jobs

- [ ] Inngest for large area searches (>100 buildings)
- [ ] Job progress tracking in UI
- [ ] Email/notification when complete

### Week 16: Monitoring & Resilience

- [ ] Circuit breaker for external APIs
- [ ] Fallback data for price APIs
- [ ] Error tracking (Sentry)
- [ ] Basic analytics dashboard

**Deliverable:** Production-ready at scale

---

## Future / Optional

- [ ] LLM-powered search ("find hotels near coast with flat roofs")
- [ ] Germany expansion (Energy-Charts already done)
- [ ] Saved searches + alerts
- [ ] API for third-party integrations
- [ ] White-label for installer partners

---

## Data Sources by Country

| Country | Geocoding | Buildings | Prices | Solar |
|---------|-----------|-----------|--------|-------|
| Spain 🇪🇸 | Google/Cartociudad | Catastro INSPIRE ✓ | ESIOS ✓ | PVGIS ✓ |
| Poland 🇵🇱 | Google/GUGiK | GUGiK Geoportal | PSE | PVGIS ✓ |
| UK 🇬🇧 | Google/OS Places | OS/OSM | Octopus ✓ | PVGIS ✓ |

## New Services Required

| Phase | Service | Cost |
|-------|---------|------|
| 1 | Upstash Redis | Free → $10/mo |
| 3 | OS Places (UK) | Free tier, then ~£0.01/query |
| 4 | Inngest | Free → $25/mo |

---

*Total timeline: ~16 weeks for full 3-country rollout*
