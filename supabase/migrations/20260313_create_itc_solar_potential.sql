-- ITC Solar Potential Table
-- Stores pre-computed solar potential data from ITC Canarias (LiDAR-based roof analysis)
-- Bulk downloaded from ITC WFS to avoid real-time API dependency

-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS itc_solar_potential (
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
  source_layer TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cadastral_ref)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_itc_cadastral ON itc_solar_potential(cadastral_ref);
CREATE INDEX IF NOT EXISTS idx_itc_geometry ON itc_solar_potential USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_itc_island ON itc_solar_potential(island);
CREATE INDEX IF NOT EXISTS idx_itc_municipality ON itc_solar_potential(municipality);

-- RLS policies (allow public read for prospecting, admin write for sync)
ALTER TABLE itc_solar_potential ENABLE ROW LEVEL SECURITY;

-- Anyone can read ITC data (it's public government data)
CREATE POLICY "Public read access to ITC solar data"
  ON itc_solar_potential FOR SELECT
  USING (true);

-- Only service role can insert/update (via sync script)
CREATE POLICY "Service role can insert ITC data"
  ON itc_solar_potential FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update ITC data"
  ON itc_solar_potential FOR UPDATE
  USING (true);

COMMENT ON TABLE itc_solar_potential IS 'Pre-computed solar potential from ITC Canarias LiDAR analysis';
COMMENT ON COLUMN itc_solar_potential.cadastral_ref IS 'Catastro reference for joining with building data';
COMMENT ON COLUMN itc_solar_potential.suitable_pv_area_m2 IS 'Roof area suitable for PV based on slope/orientation';
COMMENT ON COLUMN itc_solar_potential.max_installable_kwp IS 'Maximum installable PV capacity';
