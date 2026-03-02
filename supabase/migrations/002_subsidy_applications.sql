-- Phase 2: Subsidy Paperwork Automation
-- Migration for Canarias Next Generation solar subsidy applications

-- Client profiles for form auto-filling
CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  -- Personal Information
  full_name VARCHAR(255) NOT NULL,
  dni_nie VARCHAR(20) NOT NULL,
  nationality VARCHAR(100),
  birth_date DATE,

  -- Contact
  phone VARCHAR(50),
  email VARCHAR(255),

  -- Address (fiscal)
  address TEXT NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  municipality VARCHAR(100) NOT NULL,
  province VARCHAR(100) DEFAULT 'Santa Cruz de Tenerife',
  island VARCHAR(50) NOT NULL,

  -- Property Information
  property_address TEXT,
  property_postal_code VARCHAR(10),
  property_municipality VARCHAR(100),
  catastral_reference VARCHAR(50),
  property_type VARCHAR(50), -- vivienda, local_comercial, nave_industrial
  property_use VARCHAR(50), -- residencial, comercial, industrial
  property_surface_m2 DECIMAL(10,2),

  -- Bank Details (for subsidy payment)
  iban VARCHAR(34),
  bank_name VARCHAR(100),
  account_holder VARCHAR(255),

  -- Installation Details
  installation_power_kw DECIMAL(10,2),
  panel_count INTEGER,
  panel_model VARCHAR(100),
  panel_power_w INTEGER,
  inverter_model VARCHAR(100),
  inverter_power_kw DECIMAL(10,2),
  battery_model VARCHAR(100),
  battery_capacity_kwh DECIMAL(10,2),
  estimated_annual_production_kwh DECIMAL(10,2),

  -- Costs
  total_cost DECIMAL(12,2),
  panel_cost DECIMAL(12,2),
  inverter_cost DECIMAL(12,2),
  battery_cost DECIMAL(12,2),
  installation_cost DECIMAL(12,2),
  other_costs DECIMAL(12,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subsidy applications
CREATE TABLE subsidy_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  client_profile_id UUID REFERENCES client_profiles(id) ON DELETE CASCADE,
  installer_id UUID REFERENCES installers(id) ON DELETE SET NULL,

  -- Application Info
  application_number VARCHAR(50), -- Official number once submitted
  subsidy_type VARCHAR(100) DEFAULT 'next_generation_autoconsumo',

  -- Status tracking
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, collecting_documents, ready_to_submit, submitted,
  -- under_review, approved, rejected, paid

  -- Amounts
  requested_amount DECIMAL(12,2),
  approved_amount DECIMAL(12,2),

  -- Dates
  submission_date TIMESTAMPTZ,
  approval_date TIMESTAMPTZ,
  payment_date TIMESTAMPTZ,

  -- Notes
  internal_notes TEXT,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document types enum-like table for flexibility
CREATE TABLE document_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Insert standard document types for Canarias subsidies
INSERT INTO document_types (id, name, description, is_required, sort_order) VALUES
  ('solicitud_oficial', 'Solicitud Oficial', 'Formulario oficial de solicitud de subvencion', true, 1),
  ('dni_nie', 'DNI/NIE', 'Documento de identidad del solicitante', true, 2),
  ('escrituras', 'Escrituras de Propiedad', 'Escrituras o nota simple del inmueble', true, 3),
  ('presupuesto', 'Presupuesto Detallado', 'Presupuesto desglosado de la instalacion', true, 4),
  ('memoria_tecnica', 'Memoria Tecnica', 'Documento tecnico de la instalacion', true, 5),
  ('certificado_eficiencia', 'Certificado Eficiencia Energetica', 'CEE del inmueble', true, 6),
  ('autorizacion_obra', 'Autorizacion de Obra', 'Licencia o comunicacion previa', false, 7),
  ('contrato_instalador', 'Contrato con Instalador', 'Contrato firmado con empresa instaladora', false, 8),
  ('factura_proforma', 'Factura Proforma', 'Factura proforma de la instalacion', false, 9),
  ('certificado_bancario', 'Certificado Bancario', 'Certificado de titularidad de cuenta', false, 10);

-- Application documents tracking
CREATE TABLE application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  application_id UUID NOT NULL REFERENCES subsidy_applications(id) ON DELETE CASCADE,
  document_type_id VARCHAR(50) NOT NULL REFERENCES document_types(id),

  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, uploaded, verified, rejected, not_applicable

  -- File info
  file_path TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(100),

  -- Auto-generated PDFs
  is_auto_generated BOOLEAN DEFAULT false,
  generated_at TIMESTAMPTZ,

  -- Verification
  verified_by UUID REFERENCES installers(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_client_profiles_lead ON client_profiles(lead_id);
CREATE INDEX idx_subsidy_applications_lead ON subsidy_applications(lead_id);
CREATE INDEX idx_subsidy_applications_installer ON subsidy_applications(installer_id);
CREATE INDEX idx_subsidy_applications_status ON subsidy_applications(status);
CREATE INDEX idx_application_documents_application ON application_documents(application_id);
CREATE INDEX idx_application_documents_status ON application_documents(status);

-- Triggers for updated_at
CREATE TRIGGER update_client_profiles_updated_at
  BEFORE UPDATE ON client_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subsidy_applications_updated_at
  BEFORE UPDATE ON subsidy_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_application_documents_updated_at
  BEFORE UPDATE ON application_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidy_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Document types are readable by all authenticated users
CREATE POLICY "Document types are viewable by authenticated users"
  ON document_types FOR SELECT
  TO authenticated
  USING (true);

-- Client profiles: installers can view/edit for their assigned leads
CREATE POLICY "Installers can view client profiles for assigned leads"
  ON client_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN installers i ON i.id = l.assigned_installer_id
      WHERE l.id = client_profiles.lead_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

CREATE POLICY "Installers can insert client profiles for assigned leads"
  ON client_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN installers i ON i.id = l.assigned_installer_id
      WHERE l.id = lead_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

CREATE POLICY "Installers can update client profiles for assigned leads"
  ON client_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN installers i ON i.id = l.assigned_installer_id
      WHERE l.id = client_profiles.lead_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

-- Subsidy applications: same pattern
CREATE POLICY "Installers can view their applications"
  ON subsidy_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM installers i
      WHERE i.id = subsidy_applications.installer_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

CREATE POLICY "Installers can insert applications"
  ON subsidy_applications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM installers i
      WHERE i.id = installer_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

CREATE POLICY "Installers can update their applications"
  ON subsidy_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM installers i
      WHERE i.id = subsidy_applications.installer_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

-- Application documents: accessible via application
CREATE POLICY "Installers can view documents for their applications"
  ON application_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subsidy_applications sa
      JOIN installers i ON i.id = sa.installer_id
      WHERE sa.id = application_documents.application_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

CREATE POLICY "Installers can manage documents for their applications"
  ON application_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM subsidy_applications sa
      JOIN installers i ON i.id = sa.installer_id
      WHERE sa.id = application_documents.application_id
      AND i.user_id = auth.uid()
      AND i.is_active = true
    )
  );

-- Admin policies (admins can see everything)
CREATE POLICY "Admins can view all client profiles"
  ON client_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );

CREATE POLICY "Admins can manage all applications"
  ON subsidy_applications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );

CREATE POLICY "Admins can manage all documents"
  ON application_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );
