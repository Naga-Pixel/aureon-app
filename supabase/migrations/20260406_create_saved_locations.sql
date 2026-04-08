-- Saved locations: custom map pins and saved buildings for prospecting
CREATE TABLE saved_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installer_id UUID NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('pin', 'building')),
  name VARCHAR(255),
  notes TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  -- building-specific data (null for plain pins)
  building_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_locations_installer ON saved_locations(installer_id);

-- RLS
ALTER TABLE saved_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Installers can view own saved locations"
  ON saved_locations FOR SELECT
  USING (installer_id IN (
    SELECT id FROM installers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Installers can insert own saved locations"
  ON saved_locations FOR INSERT
  WITH CHECK (installer_id IN (
    SELECT id FROM installers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Installers can delete own saved locations"
  ON saved_locations FOR DELETE
  USING (installer_id IN (
    SELECT id FROM installers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Installers can update own saved locations"
  ON saved_locations FOR UPDATE
  USING (installer_id IN (
    SELECT id FROM installers WHERE user_id = auth.uid()
  ));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_saved_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_saved_locations_updated_at
  BEFORE UPDATE ON saved_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_locations_updated_at();
