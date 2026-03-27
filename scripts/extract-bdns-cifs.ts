/**
 * Extract business CIFs from BDNS solar grants CSV
 *
 * Usage: npx tsx scripts/extract-bdns-cifs.ts <input-csv> <output-json>
 *
 * Input: BDNS export CSV (UTF-8)
 * Output: JSON with CIFs and grant details ready for geocoding
 */

import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { parse } from 'csv-parse';

interface BDNSRecord {
  administracion: string;
  departamento: string;
  organo: string;
  codigoBdns: string;
  convocatoria: string;
  basesReguladoras: string;
  codigoConcesion: string;
  fechaConcesion: string;
  fechaRegistro: string;
  beneficiario: string;
  importe: string;
  instrumento: string;
  ayudaEquivalente: string;
}

interface ExtractedGrant {
  cif: string;
  companyName: string;
  codigoBdns: string;
  codigoConcesion: string;
  convocatoria: string;
  organo: string;
  fechaConcesion: string;
  importe: number;
}

// Keywords to filter for solar/autoconsumo grants
const SOLAR_KEYWORDS = [
  'autoconsumo',
  'fotovoltaic',
  'solar',
  'renovable',
  'placas',
];

// CIF pattern: Letter + 8 digits (Spanish company ID)
const CIF_PATTERN = /^([A-Z])(\d{7,8})\s+(.+)$/;

async function extractCIFs(inputPath: string, outputPath: string) {
  const records: BDNSRecord[] = [];

  // Parse CSV
  const parser = createReadStream(inputPath).pipe(
    parse({
      columns: [
        'administracion',
        'departamento',
        'organo',
        'codigoBdns',
        'convocatoria',
        'basesReguladoras',
        'codigoConcesion',
        'fechaConcesion',
        'fechaRegistro',
        'beneficiario',
        'importe',
        'instrumento',
        'ayudaEquivalente',
      ],
      skip_empty_lines: true,
      from_line: 2, // Skip header
      relax_quotes: true,
      relax_column_count: true,
    })
  );

  for await (const record of parser) {
    records.push(record);
  }

  console.log(`Parsed ${records.length} total records`);

  // Filter for solar/autoconsumo grants
  const solarRecords = records.filter((r) =>
    SOLAR_KEYWORDS.some((kw) =>
      r.convocatoria?.toLowerCase().includes(kw)
    )
  );

  console.log(`Found ${solarRecords.length} solar/autoconsumo grants`);

  // Extract business CIFs
  const businessGrants: ExtractedGrant[] = [];
  const seenConcessions = new Set<string>();

  for (const record of solarRecords) {
    const beneficiario = record.beneficiario?.trim();
    if (!beneficiario) continue;

    // Check if it's a business (CIF pattern)
    const match = beneficiario.match(CIF_PATTERN);
    if (!match) continue;

    const cif = match[1] + match[2]; // Letter + digits
    const companyName = match[3].trim();

    // Skip duplicates
    if (seenConcessions.has(record.codigoConcesion)) continue;
    seenConcessions.add(record.codigoConcesion);

    // Parse amount
    const importe = parseFloat(
      record.importe?.replace(',', '.') || '0'
    );

    businessGrants.push({
      cif,
      companyName,
      codigoBdns: record.codigoBdns,
      codigoConcesion: record.codigoConcesion,
      convocatoria: record.convocatoria,
      organo: record.organo,
      fechaConcesion: record.fechaConcesion,
      importe,
    });
  }

  console.log(`Extracted ${businessGrants.length} business grants with CIFs`);

  // Get unique CIFs for lookup
  const uniqueCIFs = [...new Set(businessGrants.map((g) => g.cif))];
  console.log(`Unique CIFs to lookup: ${uniqueCIFs.length}`);

  // Write output
  const output = {
    extractedAt: new Date().toISOString(),
    totalRecords: records.length,
    solarRecords: solarRecords.length,
    businessGrants: businessGrants.length,
    uniqueCIFs: uniqueCIFs.length,
    grants: businessGrants,
    cifsToLookup: uniqueCIFs,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to ${outputPath}`);

  // Print sample
  console.log('\n=== Sample CIFs to lookup ===');
  uniqueCIFs.slice(0, 10).forEach((cif) => {
    const grant = businessGrants.find((g) => g.cif === cif);
    console.log(`${cif} - ${grant?.companyName}`);
  });
}

// Main
const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'data/bdns-solar-grants.json';

if (!inputPath) {
  console.error('Usage: npx tsx scripts/extract-bdns-cifs.ts <input-csv> [output-json]');
  process.exit(1);
}

extractCIFs(inputPath, outputPath).catch(console.error);
