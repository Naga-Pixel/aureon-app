-- Add DELETE policies for leads table

-- Admins can delete any lead
CREATE POLICY "Admins can delete all leads"
  ON leads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.role = 'admin'
      AND installers.is_active = true
    )
  );

-- Installers can delete leads assigned to them
CREATE POLICY "Installers can delete assigned leads"
  ON leads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM installers
      WHERE installers.user_id = auth.uid()
      AND installers.id = leads.assigned_installer_id
      AND installers.is_active = true
    )
  );
