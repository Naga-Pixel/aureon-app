-- Create installers table first (leads references it)
CREATE TABLE installers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  islands TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  role VARCHAR(50) DEFAULT 'installer', -- installer, admin
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contact
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address TEXT,

  -- Property
  property_type VARCHAR(50) NOT NULL, -- vivienda_unifamiliar, comunidad_vecinos, empresa
  island VARCHAR(50) NOT NULL,
  roof_type VARCHAR(50) NOT NULL,     -- teja, chapa, hormigon, otro

  -- Preferences
  installation_timeline VARCHAR(50) NOT NULL, -- urgente, proximo_trimestre, este_ano, explorando
  monthly_bill DECIMAL(10,2) NOT NULL,

  -- Calculator results
  estimated_savings_monthly DECIMAL(10,2),
  estimated_savings_annual DECIMAL(10,2),
  estimated_subsidy DECIMAL(10,2),

  -- Management
  status VARCHAR(50) DEFAULT 'new',
  assigned_installer_id UUID REFERENCES installers(id) ON DELETE SET NULL,
  notes TEXT
);

-- Create indexes for common queries
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_island ON leads(island);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_assigned_installer ON leads(assigned_installer_id);
CREATE INDEX idx_installers_user_id ON installers(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installers_updated_at
  BEFORE UPDATE ON installers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE installers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leads

-- Allow anyone to insert leads (public form submission)
CREATE POLICY "Anyone can create leads"
  ON leads FOR INSERT
  WITH CHECK (true);

-- Admins can see all leads
CREATE POLICY "Admins can view all leads"
  ON leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );

-- Installers can see leads assigned to them
CREATE POLICY "Installers can view assigned leads"
  ON leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.id = leads.assigned_installer_id
      AND installers.is_active = true
    )
  );

-- Admins can update any lead
CREATE POLICY "Admins can update all leads"
  ON leads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );

-- Installers can update leads assigned to them
CREATE POLICY "Installers can update assigned leads"
  ON leads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.id = leads.assigned_installer_id
      AND installers.is_active = true
    )
  );

-- RLS Policies for installers

-- Installers can view their own record
CREATE POLICY "Installers can view own record"
  ON installers FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all installers
CREATE POLICY "Admins can view all installers"
  ON installers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM installers i
      WHERE i.user_id = auth.uid()
      AND i.role = 'admin'
      AND i.is_active = true
    )
  );
