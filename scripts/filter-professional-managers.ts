#!/usr/bin/env npx tsx
/**
 * Filters the multi-property managers JSON to only professional-looking companies
 * and generates a refined HTML report
 */

import * as fs from 'fs';
import * as path from 'path';

interface PropertyManager {
  name: string;
  totalVVs: number;
  streetCount: number;
  municipios: string[];
  streets: string[];
  addresses: string[];
  ids: string[];
}

// Company/professional patterns
const professionalPatterns = [
  /\bS\.?L\.?U?\.?\b/i,
  /\bS\.?A\.?\b/i,
  /\bRentals?\b/i,
  /\bHomes?\b/i,
  /\bHoliday[s]?\b/i,
  /\bVacation[s]?\b/i,
  /\bManagement\b/i,
  /\bInmobiliaria\b/i,
  /\bGesti[oó]n\b/i,
  /\bAlquiler\b/i,
  /\bResort\b/i,
  /\bResidencial\b/i,
  /\bGrupo\b/i,
  /\bSuites?\b/i,
  /\bCollection\b/i,
  /\bProperty\b/i,
  /\bLiving\b/i,
  /\bStay[s]?\b/i,
  /homelidays/i,
  /urbansea/i,
  /notar/i,
];

// Generic names to exclude
const genericPatterns = [
  /^Casa\s+\w{3,8}$/i,
  /^Apartamento[s]?$/i,
  /^Bungalow[s]?$/i,
  /^Duplex$/i,
  /^Chalet$/i,
  /^Vivienda/i,
  /^La Casita$/i,
  /^Vista\s+\w+$/i,
  /^Los\s+\w+$/i,
  /^Las\s+\w+$/i,
  /^Villa\s+\w+$/i,
];

function isProfessional(name: string): boolean {
  if (genericPatterns.some(p => p.test(name))) return false;
  return professionalPatterns.some(p => p.test(name));
}

function isLegalEntity(name: string): boolean {
  return /\bS\.?L\.?U?\.?\b|\bS\.?A\.?\b/i.test(name);
}

function generateHTML(managers: PropertyManager[]): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Property Managers - Gran Canaria (Filtered)</title>
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
    .intro {
      background: #e8f5e9;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 4px solid #4CAF50;
    }
    .stats {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
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
    .tier-1 { background: #fff9c4 !important; }
    .tier-2 { background: #e3f2fd !important; }
    .count {
      background: #4CAF50;
      color: white;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }
    .municipios { font-size: 0.85em; color: #666; }
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
    .company-tag {
      background: #ffecb3;
      color: #ff8f00;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.75em;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <h1>Multi-Property Managers - Gran Canaria</h1>

  <div class="intro">
    <strong>Filtered Results:</strong> Only showing professional-looking property management companies
    (names containing S.L., Rentals, Holiday Homes, Residencial, etc.) - excludes generic names like "Casa Lola".
  </div>

  <div class="stats">
    <p><strong>Professional property managers found:</strong> ${managers.length}</p>
    <p><strong>Tier 1 (4+ streets, highlighted yellow):</strong> High priority targets</p>
    <p><strong>Tier 2 (3 streets, highlighted blue):</strong> Secondary targets</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString('es-ES')}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Company Name</th>
        <th>Streets</th>
        <th>VVs</th>
        <th>Municipios</th>
        <th>Search Links</th>
      </tr>
    </thead>
    <tbody>
      ${managers.map((m, i) => {
        const tier = m.streetCount >= 4 ? 'tier-1' : m.streetCount >= 3 ? 'tier-2' : '';
        const legal = isLegalEntity(m.name);
        const googleSearch = `https://www.google.com/search?q=${encodeURIComponent(`"${m.name}" alquiler vacacional canarias contacto`)}`;
        const linkedinSearch = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m.name)}`;
        const bookingSearch = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(m.name + ' Gran Canaria')}`;
        const airbnbSearch = `https://www.airbnb.es/s/${encodeURIComponent('Gran Canaria')}/homes?query=${encodeURIComponent(m.name)}`;

        return `
          <tr class="${tier}">
            <td>${i + 1}</td>
            <td class="name">${m.name}${legal ? '<span class="company-tag">Legal Entity</span>' : ''}</td>
            <td><span class="count">${m.streetCount}</span></td>
            <td>${m.totalVVs}</td>
            <td class="municipios">${m.municipios.join(', ')}</td>
            <td class="links">
              <a href="${googleSearch}" target="_blank">Google</a>
              <a href="${linkedinSearch}" target="_blank" class="linkedin">LinkedIn</a>
              <a href="${bookingSearch}" target="_blank">Booking</a>
              <a href="${airbnbSearch}" target="_blank">Airbnb</a>
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
  const outputDir = path.join(process.cwd(), 'outputs');
  const jsonPath = path.join(outputDir, 'multi-property-managers-gran-canaria-2026-03-24.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('JSON file not found. Run export-multi-property-managers.ts first.');
    process.exit(1);
  }

  const data: PropertyManager[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const professional = data.filter(m => isProfessional(m.name));

  console.log(`\nFiltered to ${professional.length} professional property managers\n`);

  // Show top 15
  console.log('Top 15 Professional Property Managers:');
  console.log('='.repeat(70));

  professional.slice(0, 15).forEach((m, i) => {
    const legal = isLegalEntity(m.name) ? ' [LEGAL ENTITY]' : '';
    console.log(`\n${i + 1}. ${m.name}${legal}`);
    console.log(`   Streets: ${m.streetCount} | VVs: ${m.totalVVs} | Municipios: ${m.municipios.join(', ')}`);
  });

  // Generate filtered HTML
  const htmlPath = path.join(outputDir, 'property-managers-filtered-2026-03-24.html');
  fs.writeFileSync(htmlPath, generateHTML(professional));
  console.log(`\n\nFiltered HTML report: ${htmlPath}`);

  // Generate filtered CSV
  const csvPath = path.join(outputDir, 'property-managers-filtered-2026-03-24.csv');
  const csvRows = ['Name,Streets,VVs,Municipios,Google Search,LinkedIn Search'];
  for (const m of professional) {
    const googleSearch = `https://www.google.com/search?q=${encodeURIComponent(`"${m.name}" alquiler vacacional canarias contacto`)}`;
    const linkedinSearch = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m.name)}`;
    csvRows.push([
      `"${m.name.replace(/"/g, '""')}"`,
      m.streetCount,
      m.totalVVs,
      `"${m.municipios.join(', ')}"`,
      `"${googleSearch}"`,
      `"${linkedinSearch}"`,
    ].join(','));
  }
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`Filtered CSV: ${csvPath}`);
}

main().catch(console.error);
