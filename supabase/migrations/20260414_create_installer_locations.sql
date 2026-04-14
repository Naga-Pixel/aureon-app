-- Partner installer locations for map display
CREATE TABLE IF NOT EXISTS installer_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  island TEXT DEFAULT 'gran-canaria',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE installer_locations ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "Anyone can view installer locations"
  ON installer_locations FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Insert initial partner installers
INSERT INTO installer_locations (name, address, phone, email, lat, lon, island) VALUES
  ('EAVE Gran Canaria', 'C. Diego Vega Sarmiento, 41, 35014 Las Palmas de Gran Canaria', '928 940 090', 'grancanaria@eave.es', 28.0992110, -15.4409574, 'gran-canaria'),
  ('LEDTSE', 'C. Los Martínez de Escobar, 22, 35007 Las Palmas de Gran Canaria', '608 02 75 33', 'hello@ledtse.com', 28.1382145, -15.4323449, 'gran-canaria'),
  ('Ingesol Canarias', 'C. Monseñor Oscar Romero, 9, 35214 Telde', '928130508', 'info@ingesolcanarias.es', 27.9948662, -15.3888028, 'gran-canaria'),
  ('Sotematm', 'Urbanización Industrial Díaz Casanova Parcela C 5, 35010 Las Palmas de Gran Canaria', '928 49 47 49', 'info@sotematm.com', 28.1211951, -15.4567834, 'gran-canaria');
