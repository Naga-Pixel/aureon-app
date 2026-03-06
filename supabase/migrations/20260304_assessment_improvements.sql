-- Assessment Accuracy Improvements Migration
-- Adds: numberOfFloors, PVGIS data, lifetime calculations with degradation

-- Add columns (using DO block to handle if they already exist)
DO $$
BEGIN
    -- Floor count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'number_of_floors') THEN
        ALTER TABLE solar_assessments ADD COLUMN number_of_floors INTEGER DEFAULT 1;
    END IF;

    -- PVGIS data
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'pvgis_kwh_per_kwp') THEN
        ALTER TABLE solar_assessments ADD COLUMN pvgis_kwh_per_kwp DECIMAL(8,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'pvgis_optimal_angle') THEN
        ALTER TABLE solar_assessments ADD COLUMN pvgis_optimal_angle DECIMAL(4,1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'pvgis_raw_response') THEN
        ALTER TABLE solar_assessments ADD COLUMN pvgis_raw_response JSONB;
    END IF;

    -- Lifetime calculations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'lifetime_production_kwh') THEN
        ALTER TABLE solar_assessments ADD COLUMN lifetime_production_kwh DECIMAL(14,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'lifetime_savings_eur') THEN
        ALTER TABLE solar_assessments ADD COLUMN lifetime_savings_eur DECIMAL(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'solar_assessments' AND column_name = 'degradation_rate') THEN
        ALTER TABLE solar_assessments ADD COLUMN degradation_rate DECIMAL(5,4) DEFAULT 0.005;
    END IF;
END $$;

-- Add constraint (drop first if exists to avoid error)
ALTER TABLE solar_assessments DROP CONSTRAINT IF EXISTS check_floors_range;
ALTER TABLE solar_assessments ADD CONSTRAINT check_floors_range
    CHECK (number_of_floors IS NULL OR (number_of_floors >= 1 AND number_of_floors <= 50));
