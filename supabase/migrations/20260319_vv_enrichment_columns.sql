-- Add enrichment columns to vv_registry
-- Stores inferred property management firm, complex name, and grouping

ALTER TABLE vv_registry
  ADD COLUMN IF NOT EXISTS property_type TEXT,
  ADD COLUMN IF NOT EXISTS management_firm TEXT,
  ADD COLUMN IF NOT EXISTS complex_name TEXT,
  ADD COLUMN IF NOT EXISTS complex_id TEXT;

-- Index for grouping by complex and management firm
CREATE INDEX IF NOT EXISTS idx_vv_complex_id ON vv_registry(complex_id) WHERE complex_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vv_management_firm ON vv_registry(management_firm) WHERE management_firm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vv_property_type ON vv_registry(property_type);

COMMENT ON COLUMN vv_registry.property_type IS 'Inferred type: management_firm, complex, individual, unknown';
COMMENT ON COLUMN vv_registry.management_firm IS 'Extracted property management company name';
COMMENT ON COLUMN vv_registry.complex_name IS 'Extracted resort/complex name';
COMMENT ON COLUMN vv_registry.complex_id IS 'Hash-based ID for grouping VVs at same address';
