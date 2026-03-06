-- Add building orientation field for INSPIRE WFS data
ALTER TABLE solar_assessments
ADD COLUMN IF NOT EXISTS building_orientation numeric;

COMMENT ON COLUMN solar_assessments.building_orientation IS 'Building orientation in degrees from North (0=N, 90=E, 180=S, 270=W), derived from INSPIRE WFS building footprint';
