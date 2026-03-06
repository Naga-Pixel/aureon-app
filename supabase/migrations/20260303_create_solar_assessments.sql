-- Solar Assessments Table
-- Stores solar feasibility assessment data with Aureon Commercial Score

CREATE TABLE solar_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  -- Input
  address_input TEXT NOT NULL,
  business_segment TEXT NOT NULL,

  -- Geocoding
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  formatted_address TEXT,

  -- Solar API raw data (cached)
  solar_api_status TEXT NOT NULL,
  raw_api_response JSONB,

  -- Extracted metrics
  roof_area_m2 DECIMAL(10, 2),
  max_array_area_m2 DECIMAL(10, 2),
  panels_count INTEGER,
  roof_segment_count INTEGER,
  max_sunshine_hours_per_year DECIMAL(10, 2),

  -- Manual fallback
  is_manual_fallback BOOLEAN DEFAULT FALSE,
  manual_roof_area_m2 DECIMAL(10, 2),

  -- Calculated metrics
  system_size_kw DECIMAL(8, 2) NOT NULL,
  annual_production_kwh DECIMAL(12, 2) NOT NULL,
  annual_savings_eur DECIMAL(10, 2) NOT NULL,
  payback_years DECIMAL(4, 1),
  electricity_price_eur DECIMAL(6, 4) NOT NULL,

  -- Aureon Commercial Score (0-100)
  total_score INTEGER NOT NULL,
  solar_potential_score INTEGER NOT NULL,
  economic_potential_score INTEGER NOT NULL,
  execution_simplicity_score INTEGER NOT NULL,
  segment_fit_score INTEGER NOT NULL,

  -- Metadata
  assessed_by UUID REFERENCES installers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_solar_assessments_address ON solar_assessments(address_input);
CREATE INDEX idx_solar_assessments_lead ON solar_assessments(lead_id);

-- RLS Policies
ALTER TABLE solar_assessments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access" ON solar_assessments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM installers WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Regular installers can only read assessments for their assigned leads
CREATE POLICY "Installers read own leads" ON solar_assessments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN installers i ON i.id = l.assigned_installer_id
      WHERE l.id = solar_assessments.lead_id AND i.user_id = auth.uid()
    )
  );
