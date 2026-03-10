-- Catastro dwelling counts from CAT files
-- Used as local cache/fallback for DNPRC API

CREATE TABLE IF NOT EXISTS catastro_dwellings (
  id SERIAL PRIMARY KEY,
  ref_14 VARCHAR(14) NOT NULL,           -- 14-char parcel reference
  total_units SMALLINT NOT NULL,          -- Number of dwelling units
  floors SMALLINT,                        -- Number of floors (from CAT file)
  province_code VARCHAR(2) NOT NULL,      -- INE province code (35 = Las Palmas, 38 = SC Tenerife)
  municipality_code VARCHAR(5),           -- INE municipality code
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_ref_14 UNIQUE (ref_14)
);

-- Index for fast lookups by reference
CREATE INDEX IF NOT EXISTS idx_catastro_dwellings_ref_14 ON catastro_dwellings (ref_14);

-- Index for filtering by province (useful for imports/updates)
CREATE INDEX IF NOT EXISTS idx_catastro_dwellings_province ON catastro_dwellings (province_code);

-- Enable RLS
ALTER TABLE catastro_dwellings ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for authenticated users" ON catastro_dwellings
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow insert/update for service role only (for imports)
CREATE POLICY "Allow insert for service role" ON catastro_dwellings
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Allow update for service role" ON catastro_dwellings
  FOR UPDATE
  TO service_role
  USING (true);

COMMENT ON TABLE catastro_dwellings IS 'Cached dwelling counts from Catastro CAT files for fast lookups';
COMMENT ON COLUMN catastro_dwellings.ref_14 IS '14-character cadastral parcel reference';
COMMENT ON COLUMN catastro_dwellings.total_units IS 'Number of registered dwelling units in this parcel';
