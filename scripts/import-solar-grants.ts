/**
 * Import geocoded solar grants into Supabase
 *
 * Usage: npx tsx scripts/import-solar-grants.ts <geocoded-json>
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
 */

import { readFile } from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

interface GeocodedGrant {
  cif: string;
  companyName: string;
  codigoBdns: string;
  codigoConcesion: string;
  convocatoria: string;
  organo: string;
  fechaConcesion: string;
  importe: number;
  address?: string;
  municipality?: string;
  province?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
}

async function importGrants(inputPath: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Load geocoded data
  const data = JSON.parse(await readFile(inputPath, 'utf-8'));
  const grants: GeocodedGrant[] = data.grants;

  console.log(`Loaded ${grants.length} grants from ${inputPath}`);

  // Filter to only grants with locations
  const geolocatedGrants = grants.filter(
    (g) => g.latitude && g.longitude
  );

  console.log(`${geolocatedGrants.length} have geocoded locations`);

  // Prepare records for insert
  const records = geolocatedGrants.map((g) => ({
    bdns_code: g.codigoBdns,
    concession_code: g.codigoConcesion,
    cif: g.cif,
    company_name: g.companyName,
    grant_amount: g.importe,
    grant_date: parseDate(g.fechaConcesion),
    program_name: g.convocatoria,
    granting_body: g.organo,
    address: g.address,
    municipality: g.municipality,
    province: g.province,
    postal_code: g.postalCode,
    latitude: g.latitude,
    longitude: g.longitude,
    lookup_source: g.source,
    lookup_date: new Date().toISOString(),
  }));

  // Batch insert
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('solar_grants_registry')
      .upsert(batch, {
        onConflict: 'concession_code',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(
        `Inserted batch ${i / BATCH_SIZE + 1}: ${inserted}/${records.length}`
      );
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Total records: ${records.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Handle DD/MM/YYYY format
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return null;
}

// Main
const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: npx tsx scripts/import-solar-grants.ts <geocoded-json>');
  process.exit(1);
}

importGrants(inputPath).catch(console.error);
