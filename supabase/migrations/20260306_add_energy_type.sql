-- Add energy type, price source, and country fields
ALTER TABLE solar_assessments
ADD COLUMN IF NOT EXISTS energy_type text DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS price_source text DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS country text DEFAULT 'ES';

COMMENT ON COLUMN solar_assessments.energy_type IS 'Type of electricity tariff: fixed or variable';
COMMENT ON COLUMN solar_assessments.price_source IS 'Source of electricity price: fixed, ESIOS, Energy-Charts, Octopus, or fallback';
COMMENT ON COLUMN solar_assessments.country IS 'Country code: ES (Spain), DE (Germany), UK (United Kingdom)';
