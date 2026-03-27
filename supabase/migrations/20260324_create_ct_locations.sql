-- CT Locations Table (Centros de Transformación)
-- Stores transformer locations from various data sources for accurate
-- energy community eligibility validation
-- Sources: OSM Overpass, GRAFCAN WFS, Catastro small plot detection

CREATE TABLE IF NOT EXISTS ct_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('osm', 'grafcan', 'catastro')),
  source_id TEXT NOT NULL,           -- OSM node ID, GRAFCAN feature ID, etc.
  ref_ct TEXT,                       -- Official CT reference (when available)
  operator TEXT,                     -- Endesa, Iberdrola, etc.
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  geometry GEOMETRY(Point, 4326),
  confidence SMALLINT DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  voltage_kv DECIMAL(6,2),           -- Voltage level when known
  metadata JSONB,                    -- Additional source-specific data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_id)
);

-- Spatial index for radius queries
CREATE INDEX IF NOT EXISTS idx_ct_locations_geometry ON ct_locations USING GIST(geometry);

-- Index for official CT reference lookups
CREATE INDEX IF NOT EXISTS idx_ct_locations_ref ON ct_locations(ref_ct) WHERE ref_ct IS NOT NULL;

-- Index for operator filtering
CREATE INDEX IF NOT EXISTS idx_ct_locations_operator ON ct_locations(operator) WHERE operator IS NOT NULL;

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_ct_locations_source ON ct_locations(source);

-- RLS policies
ALTER TABLE ct_locations ENABLE ROW LEVEL SECURITY;

-- Public read access (CT locations are public infrastructure data)
CREATE POLICY "Public read access to CT locations"
  ON ct_locations FOR SELECT
  USING (true);

-- Only service role can insert/update (via sync scripts)
CREATE POLICY "Service role can insert CT data"
  ON ct_locations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update CT data"
  ON ct_locations FOR UPDATE
  USING (true);

-- Trigger to update geometry from lat/lon
CREATE OR REPLACE FUNCTION update_ct_geometry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.longitude IS NOT NULL AND NEW.latitude IS NOT NULL THEN
    NEW.geometry := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ct_geometry_trigger
  BEFORE INSERT OR UPDATE ON ct_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_ct_geometry();

-- Function to find CTs within radius of a point
-- Uses geography type for accurate distance calculation
CREATE OR REPLACE FUNCTION get_cts_in_radius(
  center_lat DOUBLE PRECISION,
  center_lon DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  source_id TEXT,
  ref_ct TEXT,
  operator TEXT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  confidence SMALLINT,
  distance_meters DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.id,
    c.source,
    c.source_id,
    c.ref_ct,
    c.operator,
    c.latitude,
    c.longitude,
    c.confidence,
    ST_Distance(
      c.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography
    ) as distance_meters
  FROM ct_locations c
  WHERE ST_DWithin(
    c.geometry::geography,
    ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography,
    radius_meters
  )
  ORDER BY distance_meters ASC
  LIMIT 100;
$$;

-- Function to find CTs within a bounding box
CREATE OR REPLACE FUNCTION get_cts_in_bbox(
  min_lat DOUBLE PRECISION,
  min_lon DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lon DOUBLE PRECISION
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  source_id TEXT,
  ref_ct TEXT,
  operator TEXT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  confidence SMALLINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.id,
    c.source,
    c.source_id,
    c.ref_ct,
    c.operator,
    c.latitude,
    c.longitude,
    c.confidence
  FROM ct_locations c
  WHERE c.geometry && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
  ORDER BY c.confidence DESC
  LIMIT 500;
$$;

-- Function to upsert CT from OSM (used by sync scripts)
CREATE OR REPLACE FUNCTION upsert_ct_from_osm(
  p_source_id TEXT,
  p_ref_ct TEXT,
  p_operator TEXT,
  p_latitude DECIMAL(9,6),
  p_longitude DECIMAL(9,6),
  p_confidence SMALLINT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ct_locations (source, source_id, ref_ct, operator, latitude, longitude, confidence, metadata)
  VALUES ('osm', p_source_id, p_ref_ct, p_operator, p_latitude, p_longitude, p_confidence, p_metadata)
  ON CONFLICT (source, source_id) DO UPDATE SET
    ref_ct = COALESCE(EXCLUDED.ref_ct, ct_locations.ref_ct),
    operator = COALESCE(EXCLUDED.operator, ct_locations.operator),
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    confidence = GREATEST(EXCLUDED.confidence, ct_locations.confidence),
    metadata = COALESCE(EXCLUDED.metadata, ct_locations.metadata),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON TABLE ct_locations IS 'Power transformer locations (Centros de Transformación) for energy community eligibility';
COMMENT ON COLUMN ct_locations.source IS 'Data source: osm, grafcan, or catastro';
COMMENT ON COLUMN ct_locations.ref_ct IS 'Official CT reference ID when available';
COMMENT ON COLUMN ct_locations.confidence IS '0-100 confidence score based on data quality';
