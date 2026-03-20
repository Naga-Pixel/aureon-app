#!/usr/bin/env npx ts-node
/**
 * VV Registry Sync Script
 *
 * Downloads vacation rental (Viviendas Vacacionales) data from Gobierno de Canarias
 * open data portal and syncs to Supabase.
 *
 * Data source: https://datos.canarias.es
 * Format: CSV (~14.6MB, ~50K records, updated monthly)
 *
 * Usage:
 *   npx ts-node scripts/sync-vv-registry.ts [--dry-run]
 *
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (not anon key - needs write access)
 */

import { createClient } from '@supabase/supabase-js';

// ============ VV Enrichment Logic (inline) ============

const COMPANY_PATTERNS = [
  /\bS\.?L\.?U?\.?\b/i,
  /\bS\.?A\.?\b/i,
  /\bSociedad\b/i,
  /\bRentals?\b/i,
  /\bManagement\b/i,
  /\bService[s]?\b/i,
  /\bMaintenance\b/i,
  /\bGrupo\b/i,
  /\bHolding\b/i,
  /\bInversiones\b/i,
  /\bInmobiliaria\b/i,
  /\bGesti[oó]n\b/i,
];

const COMPLEX_PATTERNS = [
  /\bPark\b/i,
  /\bResort\b/i,
  /\bApartamentos?\b/i,
  /\bSuites?\b/i,
  /\bClub\b/i,
  /\bResidencia[l]?\b/i,
  /\bComplex\b/i,
  /\bVillas?\b/i,
  /\bBungalows?\b/i,
];

const IGNORE_NAMES = new Set([
  'sin denominacion', 'sin denominación', 'vivienda vacacional',
  'vivienda', 'categoria unica', 'categoría única', '_u',
]);

function isPropertyManagementFirm(nombre: string | null): boolean {
  if (!nombre) return false;
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return false;
  return COMPANY_PATTERNS.some(p => p.test(nombre));
}

function isComplexName(nombre: string | null): boolean {
  if (!nombre) return false;
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return false;
  return COMPLEX_PATTERNS.some(p => p.test(nombre));
}

function normalizeAddress(direccion: string | null): string | null {
  if (!direccion) return null;
  let normalized = direccion
    .toLowerCase().trim()
    .replace(/\bavda?\.?\b/gi, 'avenida')
    .replace(/\bc\/?\b/gi, 'calle')
    .replace(/\bcl\.?\b/gi, 'calle')
    .replace(/\bnº?\b/gi, '')
    .replace(/\s+\d+\s*[a-z]?\s*$/i, '')
    .replace(/\bapt\.?\s*\d+/gi, '')
    .replace(/\d{5}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function generateComplexId(direccion: string | null, municipality: string | null): string | null {
  const normalizedAddr = normalizeAddress(direccion);
  if (!normalizedAddr || normalizedAddr.length < 5) return null;
  const input = `${normalizedAddr}|${(municipality || '').toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return `complex-${Math.abs(hash).toString(36)}`;
}

type VVPropertyType = 'management_firm' | 'complex' | 'individual' | 'unknown';

function inferPropertyType(nombre: string | null): VVPropertyType {
  if (!nombre) return 'unknown';
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return 'unknown';
  if (isPropertyManagementFirm(nombre)) return 'management_firm';
  if (isComplexName(nombre)) return 'complex';
  return 'individual';
}

function extractManagementFirm(nombre: string | null): string | null {
  if (!nombre || !isPropertyManagementFirm(nombre)) return null;
  return nombre.trim();
}

function extractComplexName(nombre: string | null): string | null {
  if (!nombre) return null;
  const normalized = nombre.trim().toLowerCase();
  if (IGNORE_NAMES.has(normalized)) return null;
  if (isComplexName(nombre)) {
    // Strip trailing unit/apartment numbers (e.g., "Bungalows Los Arcos 333" -> "Bungalows Los Arcos")
    let cleanName = nombre.trim()
      .replace(/\s+\d+[a-z]?$/i, '')        // "Complex 333" -> "Complex"
      .replace(/\s+#?\d+$/i, '')             // "Complex #12" -> "Complex"
      .replace(/\s+n[º°]?\s*\d+$/i, '')      // "Complex Nº 5" -> "Complex"
      .replace(/\s+-\s*\d+$/i, '')           // "Complex - 42" -> "Complex"
      .replace(/\s+[IVX]+$/i, '')            // "Complex III" -> "Complex"
      .trim();
    return cleanName || nombre.trim();
  }
  return null;
}

/**
 * Detect management firms based on frequency analysis.
 * If the same nombre_comercial appears at 2+ distinct locations,
 * it's likely a property management firm.
 */
function detectFrequencyBasedFirms(records: VVRecord[]): Set<string> {
  const locationsByName = new Map<string, Set<string>>();

  for (const r of records) {
    if (!r.nombre_comercial || !r.latitude || !r.longitude) continue;

    const name = r.nombre_comercial.trim();
    const normalized = name.toLowerCase();

    // Skip generic/ignored names
    if (IGNORE_NAMES.has(normalized)) continue;

    // Create location key with reduced precision (~100m granularity)
    const locKey = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;

    if (!locationsByName.has(name)) {
      locationsByName.set(name, new Set());
    }
    locationsByName.get(name)!.add(locKey);
  }

  // Names appearing at 2+ distinct locations are likely firms
  const frequencyFirms = new Set<string>();
  for (const [name, locations] of locationsByName) {
    if (locations.size >= 2) {
      frequencyFirms.add(name);
    }
  }

  return frequencyFirms;
}

// ============ End Enrichment Logic ============

// CSV download URL from datos.canarias.es
const VV_CSV_URL =
  'https://datos.canarias.es/catalogos/general/dataset/9f4355a2-d086-4384-ba72-d8c99aa2d544/resource/8ff8cc43-c00b-4513-8f42-a5b961c579e1/download/establecimientos-extrahoteleros-de-tipologia-vivienda-vacacional-inscritos-en-el-registro-genera.csv';

interface VVRecord {
  establecimiento_id: string;
  nombre_comercial: string | null;
  modalidad: string | null;
  tipologia: string | null;
  clasificacion: string | null;
  direccion: string | null;
  island: string | null;
  province: string | null;
  municipality: string | null;
  locality: string | null;
  postal_code: string | null;
  dormitorios_individuales: number;
  dormitorios_dobles: number;
  plazas: number;
  longitude: number | null;
  latitude: number | null;
}

/**
 * Parse a CSV line, handling quoted fields with semicolons
 */
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

/**
 * Parse a single CSV row into a VVRecord
 */
function parseRow(fields: string[]): VVRecord | null {
  if (fields.length < 16) return null;

  const [
    establecimiento_id,
    nombre_comercial,
    modalidad,
    tipologia,
    clasificacion,
    direccion,
    island,
    province,
    municipality,
    locality,
    postal_code,
    dormitorios_individuales_str,
    dormitorios_dobles_str,
    plazas_str,
    longitude_str,
    latitude_str,
  ] = fields;

  // Skip if no valid ID
  if (!establecimiento_id || establecimiento_id === 'establecimiento_id') {
    return null;
  }

  const longitude = parseFloat(longitude_str);
  const latitude = parseFloat(latitude_str);

  return {
    establecimiento_id: establecimiento_id.trim(),
    nombre_comercial: nombre_comercial?.trim() || null,
    modalidad: modalidad?.trim() || null,
    tipologia: tipologia?.trim() || null,
    clasificacion: clasificacion?.trim() || null,
    direccion: direccion?.trim() || null,
    island: island?.trim() || null,
    province: province?.trim() || null,
    municipality: municipality?.trim() || null,
    locality: locality?.trim() || null,
    postal_code: postal_code?.trim() || null,
    dormitorios_individuales: parseInt(dormitorios_individuales_str, 10) || 0,
    dormitorios_dobles: parseInt(dormitorios_dobles_str, 10) || 0,
    plazas: parseInt(plazas_str, 10) || 0,
    longitude: isNaN(longitude) ? null : longitude,
    latitude: isNaN(latitude) ? null : latitude,
  };
}

/**
 * Download and parse the VV CSV
 */
async function downloadVVData(): Promise<VVRecord[]> {
  console.log('Downloading VV registry CSV...');
  console.log(`URL: ${VV_CSV_URL}`);

  const response = await fetch(VV_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');

  console.log(`Downloaded ${lines.length} lines`);

  // Use Map to deduplicate by establecimiento_id (keep last occurrence)
  const recordMap = new Map<string, VVRecord>();
  let skipped = 0;
  let duplicates = 0;

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    const record = parseRow(fields);

    if (record) {
      if (recordMap.has(record.establecimiento_id)) {
        duplicates++;
      }
      recordMap.set(record.establecimiento_id, record);
    } else {
      skipped++;
    }
  }

  const records = Array.from(recordMap.values());
  console.log(`Parsed ${records.length} unique records (skipped ${skipped}, duplicates ${duplicates})`);

  return records;
}

/**
 * Upsert records to Supabase in batches
 */
async function syncToSupabase(records: VVRecord[], dryRun = false): Promise<void> {
  // Detect frequency-based firms (same name at 2+ locations)
  const frequencyFirms = detectFrequencyBasedFirms(records);
  console.log(`\nDetected ${frequencyFirms.size} frequency-based management firms`);

  if (frequencyFirms.size > 0) {
    console.log('Top frequency-based firms:');
    // Count VVs per firm for display
    const firmCounts = new Map<string, number>();
    for (const r of records) {
      if (r.nombre_comercial && frequencyFirms.has(r.nombre_comercial.trim())) {
        const name = r.nombre_comercial.trim();
        firmCounts.set(name, (firmCounts.get(name) || 0) + 1);
      }
    }
    const topFirms = [...firmCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [name, count] of topFirms) {
      console.log(`  ${count.toString().padStart(4)} VVs - ${name.slice(0, 50)}`);
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN - No changes will be made');
    console.log('\nSample records:');
    records.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.establecimiento_id}: ${r.nombre_comercial} (${r.island}, ${r.plazas} plazas, ${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)})`);
    });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const batchSize = 1000;
  let inserted = 0;
  let errors = 0;

  console.log(`\nSyncing ${records.length} records to Supabase (batch size: ${batchSize})...`);

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const { error } = await supabase
      .from('vv_registry')
      .upsert(
        batch.map((r) => {
          const nombre = r.nombre_comercial?.trim() || null;
          // Check if this is a frequency-based firm (same name at multiple locations)
          const isFrequencyFirm = nombre && frequencyFirms.has(nombre);
          // Keyword-based detection
          const keywordType = inferPropertyType(nombre);
          const keywordFirm = extractManagementFirm(nombre);

          // Frequency-based firms take priority over keyword detection
          const propertyType = isFrequencyFirm ? 'management_firm' : keywordType;
          const managementFirm = isFrequencyFirm ? nombre : keywordFirm;

          return {
            establecimiento_id: r.establecimiento_id,
            nombre_comercial: r.nombre_comercial,
            modalidad: r.modalidad,
            tipologia: r.tipologia,
            clasificacion: r.clasificacion,
            direccion: r.direccion,
            island: r.island,
            province: r.province,
            municipality: r.municipality,
            locality: r.locality,
            postal_code: r.postal_code,
            dormitorios_individuales: r.dormitorios_individuales,
            dormitorios_dobles: r.dormitorios_dobles,
            plazas: r.plazas,
            longitude: r.longitude,
            latitude: r.latitude,
            // Enrichment fields - frequency-based detection overrides keyword-based
            property_type: propertyType,
            management_firm: managementFirm,
            complex_name: extractComplexName(nombre),
            complex_id: generateComplexId(r.direccion, r.municipality),
            fetched_at: new Date().toISOString(),
          };
        }),
        { onConflict: 'establecimiento_id' }
      );

    if (error) {
      console.error(`Error upserting batch ${i / batchSize + 1}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Progress: ${inserted}/${records.length} records`);
    }
  }

  console.log('\n');
  console.log('=== Sync Complete ===');
  console.log(`  Processed: ${inserted}`);
  console.log(`  Errors: ${errors}`);
}

/**
 * Print summary statistics by island
 */
function printStats(records: VVRecord[]): void {
  const byIsland = new Map<string, { count: number; totalPlazas: number }>();

  for (const record of records) {
    const island = record.island || 'Unknown';
    const existing = byIsland.get(island) || { count: 0, totalPlazas: 0 };
    byIsland.set(island, {
      count: existing.count + 1,
      totalPlazas: existing.totalPlazas + record.plazas,
    });
  }

  console.log('\n=== VV Registry Statistics ===');
  console.log('Island                     VVs    Total Beds');
  console.log('─'.repeat(50));

  const sorted = [...byIsland.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [island, stats] of sorted) {
    console.log(
      `${island.padEnd(25)} ${stats.count.toString().padStart(6)}    ${stats.totalPlazas.toString().padStart(10)}`
    );
  }

  const total = records.reduce((sum, r) => sum + r.plazas, 0);
  console.log('─'.repeat(50));
  console.log(`${'TOTAL'.padEnd(25)} ${records.length.toString().padStart(6)}    ${total.toString().padStart(10)}`);
}

/**
 * Print enrichment statistics
 */
function printEnrichmentStats(records: VVRecord[]): void {
  // Detect frequency-based firms first
  const frequencyFirms = detectFrequencyBasedFirms(records);

  const byType: Record<string, number> = {
    management_firm: 0,
    complex: 0,
    individual: 0,
    unknown: 0,
  };

  const keywordFirms = new Map<string, number>();
  const frequencyFirmCounts = new Map<string, number>();
  const complexes = new Map<string, number>();
  const complexIds = new Set<string>();

  for (const record of records) {
    const nombre = record.nombre_comercial?.trim() || null;
    const isFreqFirm = nombre && frequencyFirms.has(nombre);

    // Count with frequency-based detection applied
    if (isFreqFirm) {
      byType.management_firm++;
      frequencyFirmCounts.set(nombre!, (frequencyFirmCounts.get(nombre!) || 0) + 1);
    } else {
      const type = inferPropertyType(nombre);
      byType[type]++;
    }

    // Also track keyword-based firms separately for comparison
    const keywordFirm = extractManagementFirm(nombre);
    if (keywordFirm) keywordFirms.set(keywordFirm, (keywordFirms.get(keywordFirm) || 0) + 1);

    const complex = extractComplexName(nombre);
    if (complex) complexes.set(complex, (complexes.get(complex) || 0) + 1);

    const complexId = generateComplexId(record.direccion, record.municipality);
    if (complexId) complexIds.add(complexId);
  }

  console.log('\n=== Enrichment Statistics (with frequency-based detection) ===');
  console.log(`Property Types:`);
  console.log(`  Management Firms:    ${byType.management_firm.toString().padStart(6)} (${frequencyFirms.size} unique firms)`);
  console.log(`  Complex/Resort:      ${byType.complex.toString().padStart(6)}`);
  console.log(`  Individual:          ${byType.individual.toString().padStart(6)}`);
  console.log(`  Unknown:             ${byType.unknown.toString().padStart(6)}`);
  console.log(`\nUnique address clusters: ${complexIds.size}`);

  // Top frequency-based firms
  const topFreqFirms = [...frequencyFirmCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topFreqFirms.length > 0) {
    console.log('\nTop Management Firms (frequency-based):');
    for (const [name, count] of topFreqFirms) {
      const keywordMatch = isPropertyManagementFirm(name) ? ' [keyword]' : '';
      console.log(`  ${count.toString().padStart(4)} VVs - ${name.slice(0, 40)}${keywordMatch}`);
    }
  }

  // Top complexes
  const topComplexes = [...complexes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topComplexes.length > 0) {
    console.log('\nTop Complexes/Resorts:');
    for (const [name, count] of topComplexes) {
      console.log(`  ${count.toString().padStart(4)} - ${name.slice(0, 45)}`);
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  VV Registry Sync - Viviendas Vacacionales Canarias    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    const records = await downloadVVData();
    printStats(records);
    printEnrichmentStats(records);
    await syncToSupabase(records, dryRun);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
