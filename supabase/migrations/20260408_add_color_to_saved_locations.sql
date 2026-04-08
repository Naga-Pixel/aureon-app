-- Add color column to saved_locations (orange, yellow, green presets)
ALTER TABLE saved_locations ADD COLUMN color VARCHAR(7) DEFAULT '#eab308';
