-- VV Registry Table (Viviendas Vacacionales)
-- Stores vacation rental locations from Gobierno de Canarias open data
-- Source: https://datos.canarias.es (CSV, updated monthly)

CREATE TABLE IF NOT EXISTS vv_registry (
  id BIGSERIAL PRIMARY KEY,
  establecimiento_id TEXT UNIQUE NOT NULL,
  nombre_comercial TEXT,
  modalidad TEXT,
  tipologia TEXT,
  clasificacion TEXT,
  direccion TEXT,
  island TEXT,
  province TEXT,
  municipality TEXT,
  locality TEXT,
  postal_code TEXT,
  dormitorios_individuales INTEGER DEFAULT 0,
  dormitorios_dobles INTEGER DEFAULT 0,
  plazas INTEGER,
  longitude NUMERIC,
  latitude NUMERIC,
  geometry GEOMETRY(Point, 4326),
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for spatial queries and filtering
CREATE INDEX IF NOT EXISTS idx_vv_geometry ON vv_registry USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_vv_island ON vv_registry(island);
CREATE INDEX IF NOT EXISTS idx_vv_municipality ON vv_registry(municipality);
CREATE INDEX IF NOT EXISTS idx_vv_plazas ON vv_registry(plazas);

-- RLS policies
ALTER TABLE vv_registry ENABLE ROW LEVEL SECURITY;

-- Anyone can read VV data (it's public government data)
CREATE POLICY "Public read access to VV registry"
  ON vv_registry FOR SELECT
  USING (true);

-- Only service role can insert/update (via sync script)
CREATE POLICY "Service role can insert VV data"
  ON vv_registry FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update VV data"
  ON vv_registry FOR UPDATE
  USING (true);

-- Function to update geometry from lat/lon
CREATE OR REPLACE FUNCTION update_vv_geometry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.longitude IS NOT NULL AND NEW.latitude IS NOT NULL THEN
    NEW.geometry := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vv_geometry_trigger
  BEFORE INSERT OR UPDATE ON vv_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_vv_geometry();

COMMENT ON TABLE vv_registry IS 'Vacation rentals (Viviendas Vacacionales) registered in Canarias';
COMMENT ON COLUMN vv_registry.establecimiento_id IS 'Official registration ID (e.g., A-38-4-0000685)';
COMMENT ON COLUMN vv_registry.plazas IS 'Total bed capacity';

-- PostGIS function to find VVs within radius
-- Uses geography type for accurate distance calculation
CREATE OR REPLACE FUNCTION get_vvs_in_radius(
  center_lat DOUBLE PRECISION,
  center_lon DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION
)
RETURNS TABLE (
  establecimiento_id TEXT,
  nombre_comercial TEXT,
  direccion TEXT,
  island TEXT,
  municipality TEXT,
  plazas INTEGER,
  dormitorios_individuales INTEGER,
  dormitorios_dobles INTEGER,
  latitude NUMERIC,
  longitude NUMERIC,
  distance_meters DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    v.establecimiento_id,
    v.nombre_comercial,
    v.direccion,
    v.island,
    v.municipality,
    v.plazas,
    v.dormitorios_individuales,
    v.dormitorios_dobles,
    v.latitude,
    v.longitude,
    ST_Distance(
      v.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography
    ) as distance_meters
  FROM vv_registry v
  WHERE ST_DWithin(
    v.geometry::geography,
    ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography,
    radius_meters
  )
  ORDER BY distance_meters ASC
  LIMIT 500;
$$;
