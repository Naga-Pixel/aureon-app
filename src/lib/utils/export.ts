/**
 * Export utilities for building results
 */

interface BuildingForExport {
  buildingId: string | null;
  roofAreaM2: number | null;
  orientationLabel: string | null;
  score?: number;
  systemSizeKw?: number;
  annualProductionKwh?: number;
  annualSavingsEur?: number;
}

/**
 * Export building results to CSV format
 */
export function exportToCSV(buildings: BuildingForExport[]): string {
  const headers = [
    'Referencia Catastral',
    'Area Tejado (m²)',
    'Orientacion',
    'Puntuacion',
    'Sistema (kW)',
    'Produccion Anual (kWh)',
    'Ahorro Anual (EUR)',
  ];

  const rows = buildings.map(b => [
    b.buildingId || 'N/A',
    b.roofAreaM2?.toFixed(2) || 'N/A',
    b.orientationLabel || 'N/A',
    b.score?.toFixed(0) || 'N/A',
    b.systemSizeKw?.toFixed(2) || 'N/A',
    b.annualProductionKwh?.toFixed(0) || 'N/A',
    b.annualSavingsEur?.toFixed(0) || 'N/A',
  ]);

  // Escape values that contain commas or quotes
  const escapeValue = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvContent = [
    headers.map(escapeValue).join(','),
    ...rows.map(row => row.map(escapeValue).join(',')),
  ].join('\n');

  // Add BOM for proper Excel UTF-8 encoding
  return '\uFEFF' + csvContent;
}

/**
 * Format buildings data for JSON export
 */
export function exportToJSON(buildings: BuildingForExport[]): string {
  const data = buildings.map(b => ({
    cadastralReference: b.buildingId,
    roofAreaM2: b.roofAreaM2,
    orientation: b.orientationLabel,
    score: b.score,
    systemSizeKw: b.systemSizeKw,
    annualProductionKwh: b.annualProductionKwh,
    annualSavingsEur: b.annualSavingsEur,
  }));

  return JSON.stringify(data, null, 2);
}
