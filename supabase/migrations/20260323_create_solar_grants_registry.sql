-- Solar Grants Registry
-- Stores geocoded solar/autoconsumo grant recipients from BDNS
-- Used as a "retrofit baseline" layer showing existing solar installations

CREATE TABLE solar_grants_registry (
  id SERIAL PRIMARY KEY,

  -- BDNS identifiers
  bdns_code VARCHAR(20),           -- Código BDNS (convocatoria)
  concession_code VARCHAR(20),     -- Código de concesión

  -- Beneficiary info
  cif VARCHAR(15),                 -- Company CIF (e.g., B76329234)
  company_name VARCHAR(255),       -- Company name

  -- Grant details
  grant_amount DECIMAL(12,2),      -- Importe
  grant_date DATE,                 -- Fecha de concesión
  program_name TEXT,               -- Convocatoria title
  granting_body VARCHAR(255),      -- Órgano concedente

  -- Location (from CIF lookup)
  address TEXT,
  municipality VARCHAR(100),
  province VARCHAR(50),
  postal_code VARCHAR(10),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),

  -- Metadata
  lookup_source VARCHAR(50),       -- 'infocif', 'axesor', 'manual', etc.
  lookup_date TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for map queries
CREATE INDEX idx_solar_grants_lat_lon ON solar_grants_registry(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_solar_grants_municipality ON solar_grants_registry(municipality);
CREATE INDEX idx_solar_grants_cif ON solar_grants_registry(cif);
CREATE INDEX idx_solar_grants_bdns ON solar_grants_registry(bdns_code);

-- Unique constraint to avoid duplicates
CREATE UNIQUE INDEX idx_solar_grants_unique ON solar_grants_registry(concession_code);

-- Trigger for updated_at
CREATE TRIGGER update_solar_grants_registry_updated_at
  BEFORE UPDATE ON solar_grants_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS - public read for map layer
ALTER TABLE solar_grants_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solar grants registry is publicly readable"
  ON solar_grants_registry FOR SELECT
  USING (true);

-- Only admins can insert/update
CREATE POLICY "Admins can manage solar grants registry"
  ON solar_grants_registry FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );
