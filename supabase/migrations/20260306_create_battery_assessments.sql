-- Battery Assessment Table
-- Stores battery readiness assessments for residential properties

CREATE TABLE IF NOT EXISTS battery_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,

  -- Address & Location
  address_input text NOT NULL,
  latitude decimal(10, 7),
  longitude decimal(10, 7),
  formatted_address text,
  island text NOT NULL,

  -- Property Data
  property_type text NOT NULL DEFAULT 'residential',
  property_area_m2 decimal(10, 2),
  number_of_floors integer DEFAULT 1,
  year_built integer,
  is_new_build boolean DEFAULT false,
  cadastral_reference text,

  -- Existing Installation
  has_solar boolean DEFAULT false,
  solar_system_kw decimal(6, 2),
  has_existing_battery boolean DEFAULT false,
  existing_battery_kwh decimal(6, 2),

  -- Consumption Data
  monthly_bill_eur decimal(10, 2),
  annual_consumption_kwh decimal(10, 2),
  daily_consumption_kwh decimal(8, 2),
  peak_daily_kwh decimal(8, 2),
  occupants integer DEFAULT 3,
  has_ac boolean,
  has_pool boolean DEFAULT false,
  consumption_confidence text DEFAULT 'medium',

  -- Battery Sizing
  backup_hours integer DEFAULT 4,
  recommended_battery_kwh decimal(6, 2),
  minimum_battery_kwh decimal(6, 2),
  optimal_battery_kwh decimal(6, 2),
  estimated_cost_eur decimal(10, 2),

  -- Scores (0-100)
  total_score integer NOT NULL,
  grid_vulnerability_score integer NOT NULL,
  consumption_score integer NOT NULL,
  arbitrage_score integer NOT NULL,
  solar_synergy_score integer NOT NULL,
  installation_score integer NOT NULL,

  -- Financial Projections
  annual_savings_eur decimal(10, 2),
  payback_years decimal(4, 1),
  roi_10_years integer,

  -- Recommendation
  recommendation text NOT NULL,
  recommendation_text text,

  -- Metadata
  assessed_by uuid REFERENCES installers(id) ON DELETE SET NULL,
  raw_api_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_battery_assessments_lead_id ON battery_assessments(lead_id);
CREATE INDEX IF NOT EXISTS idx_battery_assessments_island ON battery_assessments(island);
CREATE INDEX IF NOT EXISTS idx_battery_assessments_total_score ON battery_assessments(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_battery_assessments_created_at ON battery_assessments(created_at DESC);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_battery_assessments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS battery_assessments_updated_at ON battery_assessments;
CREATE TRIGGER battery_assessments_updated_at
  BEFORE UPDATE ON battery_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_battery_assessments_updated_at();

-- RLS Policies
ALTER TABLE battery_assessments ENABLE ROW LEVEL SECURITY;

-- Installers can view all battery assessments
CREATE POLICY "Installers can view battery assessments"
  ON battery_assessments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
    )
  );

-- Admins can insert battery assessments
CREATE POLICY "Admins can insert battery assessments"
  ON battery_assessments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
    )
  );

-- Admins can update battery assessments
CREATE POLICY "Admins can update battery assessments"
  ON battery_assessments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
    )
  );

-- Comments
COMMENT ON TABLE battery_assessments IS 'Battery readiness assessments for residential properties';
COMMENT ON COLUMN battery_assessments.island IS 'Canary Island name (lowercase): gran canaria, tenerife, etc.';
COMMENT ON COLUMN battery_assessments.grid_vulnerability_score IS 'Score based on island grid fragility (0-100)';
COMMENT ON COLUMN battery_assessments.recommendation IS 'highly_recommended, recommended, consider, or low_priority';
