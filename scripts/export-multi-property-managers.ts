#!/usr/bin/env npx tsx
/**
 * Export Multi-Property Managers Report
 *
 * Finds VV managers with properties on multiple DIFFERENT streets
 * (not just different apartments in the same building)
 *
 * Usage: npx tsx scripts/export-multi-property-managers.ts [--island ISLAND] [--min-streets N]
 */

import * as fs from 'fs';
import * as path from 'path';

const VV_DATA_URL = 'https://datos.canarias.es/catalogos/general/dataset/9f4355a2-d086-4384-ba72-d8c99aa2d544/resource/8ff8cc43-c00b-4513-8f42-a5b961c579e1/download/establecimientos-extrahoteleros-de-tipologia-vivienda-vacacional-inscritos-en-el-registro-genera.csv';

interface VVRecord {
  establecimientoId: string;
  nombreComercial: string;
  municipio: string;
  isla: string;
  direccion: string;
}

interface PropertyManager {
  name: string;
  totalVVs: number;
  streetCount: number;
  municipios: string[];
  streets: string[];
  addresses: string[];
  ids: string[];
}

function extractStreetName(direccion: string): string {
  if (!direccion) return '';

  // Remove common prefixes
  let street = direccion
    .replace(/^(CALLE|C\/|CL\.|CL|AVENIDA|AV\.|AV|AVDA|PLAZA|PL\.|PL|PASEO|CARRETERA|CTRA|URB\.|URB|URBANIZACION|URBANIZACIÓN)\s*/i, '')
    .trim();

  // Remove numbers, letters after numbers, and unit info
  street = street
    .replace(/,?\s*\d+.*$/i, '')  // Remove everything after first number
    .replace(/\s+(BAJO|PORTAL|PUERTA|PTA|PISO|PLANTA|ESC|ESCALERA|BLQ|BLOQUE|EDIFICIO|ED|LOCAL|APT|APARTAMENTO|DCHA|IZDA|IZQ|DERECHA|IZQUIERDA|CENTRO).*$/i, '')
    .trim();

  return street.toLowerCase();
}

function parseCSVLine(line: string, delimiter = ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function downloadVVData(): Promise<VVRecord[]> {
  console.log('Downloading VV registry data...');

  const response = await fetch(VV_DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to download VV data: ${response.status}`);
  }

  const csvText = await response.text();
  const lines = csvText.split('\n');
  const records: VVRecord[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 10) continue;

    // CSV columns (0-indexed):
    // 0: establecimiento_id, 1: nombre_comercial, 2: modalidad, 3: tipologia,
    // 4: clasificacion, 5: direccion, 6: island, 7: province, 8: municipality, ...
    const establecimientoId = fields[0];
    const nombreComercial = fields[1] || '';
    const direccion = fields[5] || '';
    const isla = fields[6] || '';
    const municipio = fields[8] || '';

    if (!establecimientoId || establecimientoId === 'establecimiento_id') continue;

    records.push({
      establecimientoId,
      nombreComercial,
      municipio,
      isla,
      direccion,
    });
  }

  return records;
}

function findMultiPropertyManagers(records: VVRecord[], minStreets: number = 2): PropertyManager[] {
  // Group by nombre_comercial
  const byName = new Map<string, VVRecord[]>();

  // Ignore generic names
  const ignoreNames = new Set([
    'sin denominacion', 'sin denominación', 'vivienda vacacional',
    'vivienda', 'categoria unica', 'categoría única', '_u', '',
  ]);

  for (const record of records) {
    const name = record.nombreComercial.trim();
    if (!name || ignoreNames.has(name.toLowerCase())) continue;

    if (!byName.has(name)) {
      byName.set(name, []);
    }
    byName.get(name)!.push(record);
  }

  const managers: PropertyManager[] = [];

  for (const [name, vvs] of byName) {
    // Extract unique streets
    const streetSet = new Set<string>();
    const addressSet = new Set<string>();
    const municipioSet = new Set<string>();
    const ids: string[] = [];

    for (const vv of vvs) {
      const street = extractStreetName(vv.direccion);
      if (street) {
        streetSet.add(street);
        addressSet.add(`${vv.direccion}, ${vv.municipio}`);
        if (vv.municipio) municipioSet.add(vv.municipio);
        ids.push(vv.establecimientoId);
      }
    }

    if (streetSet.size >= minStreets) {
      managers.push({
        name,
        totalVVs: vvs.length,
        streetCount: streetSet.size,
        municipios: Array.from(municipioSet).sort(),
        streets: Array.from(streetSet).sort(),
        addresses: Array.from(addressSet).sort(),
        ids,
      });
    }
  }

  // Sort by street count descending
  return managers.sort((a, b) => b.streetCount - a.streetCount);
}

function generateCSV(managers: PropertyManager[]): string {
  const rows: string[] = [];

  // Header
  rows.push([
    'Nombre Comercial',
    'Calles Diferentes',
    'Total VVs',
    'Municipios',
    'Calles',
    'Google Search Link',
    'LinkedIn Search Link',
  ].join(','));

  for (const m of managers) {
    const googleSearch = `https://www.google.com/search?q=${encodeURIComponent(`"${m.name}" alquiler vacacional canarias contacto`)}`;
    const linkedinSearch = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m.name)}`;

    rows.push([
      `"${m.name.replace(/"/g, '""')}"`,
      m.streetCount.toString(),
      m.totalVVs.toString(),
      `"${m.municipios.join(', ')}"`,
      `"${m.streets.slice(0, 5).join(', ')}${m.streets.length > 5 ? '...' : ''}"`,
      `"${googleSearch}"`,
      `"${linkedinSearch}"`,
    ].join(','));
  }

  return rows.join('\n');
}

function generateHTML(managers: PropertyManager[], island: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multi-Property Managers - ${island}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #1a1a2e; margin-bottom: 10px; }
    .stats {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stats p { margin: 5px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th {
      background: #1a1a2e;
      color: white;
      padding: 15px 10px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 12px 10px;
      border-bottom: 1px solid #eee;
      vertical-align: top;
    }
    tr:hover { background: #f8f9fa; }
    .name { font-weight: 600; color: #1a1a2e; }
    .count {
      background: #4CAF50;
      color: white;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }
    .municipios {
      font-size: 0.85em;
      color: #666;
    }
    .streets {
      font-size: 0.8em;
      color: #888;
      max-width: 300px;
    }
    .links a {
      display: inline-block;
      padding: 6px 12px;
      margin: 2px;
      background: #e3f2fd;
      color: #1565c0;
      text-decoration: none;
      border-radius: 4px;
      font-size: 0.8em;
    }
    .links a:hover { background: #bbdefb; }
    .links a.linkedin { background: #e8f4f8; color: #0077b5; }
    .links a.linkedin:hover { background: #cce8f0; }
    .highlight { background: #fff9c4 !important; }
  </style>
</head>
<body>
  <h1>Multi-Property Managers - ${island}</h1>

  <div class="stats">
    <p><strong>Total managers with 2+ different streets:</strong> ${managers.length}</p>
    <p><strong>Top 50 shown</strong> (sorted by number of different streets)</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString('es-ES')}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Nombre Comercial</th>
        <th>Calles</th>
        <th>VVs</th>
        <th>Municipios</th>
        <th>Calles (muestra)</th>
        <th>Buscar</th>
      </tr>
    </thead>
    <tbody>
      ${managers.slice(0, 50).map((m, i) => {
        const googleSearch = `https://www.google.com/search?q=${encodeURIComponent(`"${m.name}" alquiler vacacional canarias contacto`)}`;
        const linkedinSearch = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m.name)}`;
        const bookingSearch = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(m.name + ' ' + m.municipios[0])}`;

        return `
          <tr class="${m.streetCount >= 5 ? 'highlight' : ''}">
            <td>${i + 1}</td>
            <td class="name">${m.name}</td>
            <td><span class="count">${m.streetCount}</span></td>
            <td>${m.totalVVs}</td>
            <td class="municipios">${m.municipios.join(', ')}</td>
            <td class="streets">${m.streets.slice(0, 3).join(', ')}${m.streets.length > 3 ? '...' : ''}</td>
            <td class="links">
              <a href="${googleSearch}" target="_blank">Google</a>
              <a href="${linkedinSearch}" target="_blank" class="linkedin">LinkedIn</a>
              <a href="${bookingSearch}" target="_blank">Booking</a>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const islandArg = args.includes('--island')
    ? args[args.indexOf('--island') + 1]
    : 'Gran Canaria';

  const minStreets = args.includes('--min-streets')
    ? parseInt(args[args.indexOf('--min-streets') + 1], 10)
    : 2;

  console.log(`\nFinding multi-property managers for: ${islandArg}`);
  console.log(`Minimum different streets: ${minStreets}\n`);

  // Download and filter data
  const allRecords = await downloadVVData();
  const records = allRecords.filter(r =>
    r.isla.toLowerCase().includes(islandArg.toLowerCase())
  );

  console.log(`Total VV records for ${islandArg}: ${records.length}`);

  // Find multi-property managers
  const managers = findMultiPropertyManagers(records, minStreets);

  console.log(`\nFound ${managers.length} managers with properties on ${minStreets}+ different streets\n`);

  // Show top 20 in console
  console.log('Top 20 Multi-Property Managers:');
  console.log('=' .repeat(80));

  managers.slice(0, 20).forEach((m, i) => {
    console.log(`\n${i + 1}. ${m.name}`);
    console.log(`   Streets: ${m.streetCount} | VVs: ${m.totalVVs} | Municipios: ${m.municipios.join(', ')}`);
    console.log(`   Sample streets: ${m.streets.slice(0, 3).join(', ')}${m.streets.length > 3 ? '...' : ''}`);
  });

  // Generate outputs
  const outputDir = path.join(process.cwd(), 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const safeIsland = islandArg.toLowerCase().replace(/\s+/g, '-');

  // CSV export
  const csvPath = path.join(outputDir, `multi-property-managers-${safeIsland}-${timestamp}.csv`);
  fs.writeFileSync(csvPath, generateCSV(managers));
  console.log(`\n\nCSV exported: ${csvPath}`);

  // HTML report
  const htmlPath = path.join(outputDir, `multi-property-managers-${safeIsland}-${timestamp}.html`);
  fs.writeFileSync(htmlPath, generateHTML(managers, islandArg));
  console.log(`HTML report: ${htmlPath}`);

  // JSON for further processing
  const jsonPath = path.join(outputDir, `multi-property-managers-${safeIsland}-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(managers, null, 2));
  console.log(`JSON data: ${jsonPath}`);

  console.log(`\nOpen the HTML report in your browser for clickable search links.`);
}

main().catch(console.error);
