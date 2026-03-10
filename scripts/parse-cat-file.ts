#!/usr/bin/env npx ts-node
/**
 * CAT File Parser for Catastro Dwelling Counts
 *
 * Parses Spanish Catastro CAT (alfanumerico) files to extract dwelling counts per parcel.
 *
 * CAT File Format (fixed-width text):
 * - Type 11: Finca (parcel header)
 * - Type 13: Unidad Constructiva (construction unit)
 * - Type 14: Construcción (construction details)
 * - Type 15: Inmueble (cadastral unit - dwellings, garages, etc.)
 * - Type 17: Cultivo (agricultural use)
 *
 * We count Type 15 records per parcel to get dwelling counts.
 *
 * Usage:
 *   npx ts-node scripts/parse-cat-file.ts <path-to-cat-file> [--output json|supabase]
 *
 * Download CAT files from: https://www.sedecatastro.gob.es/
 *   → Difusión de datos catastrales → Descarga masiva de datos
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface DwellingRecord {
  ref14: string;
  totalUnits: number;
  floors: number | null;
  provinceCode: string;
  municipalityCode: string;
}

interface ParcelData {
  units: number;
  floors: Set<string>;
  municipalityCode: string;
}

/**
 * Parse a Type 11 (Finca) record to extract parcel info
 * Format (1000 chars total):
 * - Pos 1-2: Tipo "11"
 * - Pos 24-30: Parcela catastral (7 chars)
 * - Pos 31-44: Referencia catastral (14 chars)
 */
function parseType11(line: string): { ref14: string; municipalityCode: string } | null {
  if (line.length < 50) return null;

  const ref14 = line.substring(30, 44).trim();
  const provinceCode = line.substring(23, 25);
  const municipalityCode = line.substring(23, 28); // 5 digits: province (2) + municipality (3)

  if (ref14.length !== 14) return null;

  return { ref14, municipalityCode };
}

/**
 * Parse a Type 15 (Inmueble) record to extract unit info
 * Format (1000 chars total):
 * - Pos 1-2: Tipo "15"
 * - Pos 31-44: Referencia catastral parcela (14 chars)
 * - Pos 45-48: Cargo (unit number within parcel)
 * - Pos 60-61: Planta (floor)
 */
function parseType15(line: string): { ref14: string; floor: string } | null {
  if (line.length < 62) return null;

  const ref14 = line.substring(30, 44).trim();
  const floor = line.substring(59, 61).trim();

  if (ref14.length !== 14) return null;

  return { ref14, floor };
}

/**
 * Parse a CAT file and extract dwelling counts per parcel
 */
async function parseCATFile(filePath: string): Promise<Map<string, ParcelData>> {
  const parcels = new Map<string, ParcelData>();

  const fileStream = fs.createReadStream(filePath, { encoding: 'latin1' }); // CAT files use ISO-8859-1
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let type11Count = 0;
  let type15Count = 0;
  let currentMunicipality = '';

  for await (const line of rl) {
    lineCount++;

    const recordType = line.substring(0, 2);

    if (recordType === '11') {
      // Finca record - extract municipality code
      const parsed = parseType11(line);
      if (parsed) {
        type11Count++;
        currentMunicipality = parsed.municipalityCode;

        // Initialize parcel if not exists
        if (!parcels.has(parsed.ref14)) {
          parcels.set(parsed.ref14, {
            units: 0,
            floors: new Set(),
            municipalityCode: parsed.municipalityCode,
          });
        }
      }
    } else if (recordType === '15') {
      // Inmueble record - count as dwelling unit
      const parsed = parseType15(line);
      if (parsed) {
        type15Count++;

        const parcel = parcels.get(parsed.ref14);
        if (parcel) {
          parcel.units++;
          if (parsed.floor) {
            parcel.floors.add(parsed.floor);
          }
        } else {
          // Parcel not seen yet (shouldn't happen in well-formed files)
          parcels.set(parsed.ref14, {
            units: 1,
            floors: new Set([parsed.floor]),
            municipalityCode: currentMunicipality,
          });
        }
      }
    }

    // Progress logging
    if (lineCount % 100000 === 0) {
      console.error(`  Processed ${lineCount.toLocaleString()} lines...`);
    }
  }

  console.error(`\nParsing complete:`);
  console.error(`  Total lines: ${lineCount.toLocaleString()}`);
  console.error(`  Type 11 (Finca): ${type11Count.toLocaleString()}`);
  console.error(`  Type 15 (Inmueble): ${type15Count.toLocaleString()}`);
  console.error(`  Unique parcels: ${parcels.size.toLocaleString()}`);

  return parcels;
}

/**
 * Convert parsed data to records for database insertion
 */
function toRecords(parcels: Map<string, ParcelData>): DwellingRecord[] {
  const records: DwellingRecord[] = [];

  for (const [ref14, data] of parcels) {
    // Only include parcels with dwellings
    if (data.units > 0) {
      records.push({
        ref14,
        totalUnits: data.units,
        floors: data.floors.size > 0 ? data.floors.size : null,
        provinceCode: data.municipalityCode.substring(0, 2),
        municipalityCode: data.municipalityCode,
      });
    }
  }

  return records;
}

/**
 * Output as JSON
 */
function outputJSON(records: DwellingRecord[]): void {
  console.log(JSON.stringify(records, null, 2));
}

/**
 * Generate SQL INSERT statements
 */
function outputSQL(records: DwellingRecord[]): void {
  console.log('-- Catastro dwelling counts import');
  console.log('-- Generated from CAT file\n');

  // Use batch inserts for efficiency
  const batchSize = 1000;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    console.log(`INSERT INTO catastro_dwellings (ref_14, total_units, floors, province_code, municipality_code)`);
    console.log('VALUES');

    const values = batch.map((r, idx) => {
      const floors = r.floors !== null ? r.floors.toString() : 'NULL';
      const comma = idx < batch.length - 1 ? ',' : '';
      return `  ('${r.ref14}', ${r.totalUnits}, ${floors}, '${r.provinceCode}', '${r.municipalityCode}')${comma}`;
    });

    console.log(values.join('\n'));
    console.log('ON CONFLICT (ref_14) DO UPDATE SET');
    console.log('  total_units = EXCLUDED.total_units,');
    console.log('  floors = EXCLUDED.floors,');
    console.log('  updated_at = NOW();\n');
  }

  console.error(`Generated ${records.length.toLocaleString()} records in ${Math.ceil(records.length / batchSize)} batches`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: npx ts-node scripts/parse-cat-file.ts <path-to-cat-file> [--output json|sql]');
    console.error('');
    console.error('Options:');
    console.error('  --output json   Output as JSON (default)');
    console.error('  --output sql    Output as SQL INSERT statements');
    console.error('');
    console.error('Download CAT files from: https://www.sedecatastro.gob.es/');
    process.exit(1);
  }

  const filePath = args[0];
  const outputFormat = args.includes('--output')
    ? args[args.indexOf('--output') + 1] || 'json'
    : 'json';

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  console.error(`Parsing CAT file: ${filePath}`);
  console.error(`Output format: ${outputFormat}\n`);

  const parcels = await parseCATFile(filePath);
  const records = toRecords(parcels);

  // Filter to only parcels with multiple units (apartments)
  const multiUnitRecords = records.filter(r => r.totalUnits > 1);
  console.error(`\nParcels with multiple units: ${multiUnitRecords.length.toLocaleString()}`);

  if (outputFormat === 'sql') {
    outputSQL(multiUnitRecords);
  } else {
    outputJSON(multiUnitRecords);
  }
}

main().catch(console.error);
