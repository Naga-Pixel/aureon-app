/**
 * Export property addresses for top gestoras
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Load env
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Fetching addresses for Gran Canaria gestoras...\n');

  // Fetch all VVs with addresses
  const allData: Array<{
    management_firm: string;
    direccion: string;
    municipality: string;
    complex_name: string | null;
    plazas: number;
  }> = [];

  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vv_registry')
      .select('management_firm, direccion, municipality, complex_name, plazas')
      .eq('island', 'Gran Canaria')
      .not('management_firm', 'is', null)
      .neq('management_firm', '')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error('Error:', error);
      return;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...data);
      hasMore = data.length === 1000;
      page++;
    }
  }

  console.log(`Fetched ${allData.length} VV records\n`);

  // Group by gestora
  const gestoraMap = new Map<string, {
    addresses: Set<string>;
    municipalities: Set<string>;
    complexes: Set<string>;
    totalBeds: number;
    count: number;
  }>();

  for (const vv of allData) {
    const firm = vv.management_firm.trim();
    if (!gestoraMap.has(firm)) {
      gestoraMap.set(firm, {
        addresses: new Set(),
        municipalities: new Set(),
        complexes: new Set(),
        totalBeds: 0,
        count: 0,
      });
    }
    const g = gestoraMap.get(firm)!;
    g.count++;
    g.totalBeds += vv.plazas || 0;
    if (vv.direccion) g.addresses.add(vv.direccion);
    if (vv.municipality) g.municipalities.add(vv.municipality);
    if (vv.complex_name) g.complexes.add(vv.complex_name);
  }

  // Convert to array and sort by count
  const gestoras = Array.from(gestoraMap.entries())
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      totalBeds: stats.totalBeds,
      addresses: Array.from(stats.addresses),
      municipalities: Array.from(stats.municipalities),
      complexes: Array.from(stats.complexes),
    }))
    .filter(g => g.count >= 3)
    .sort((a, b) => b.count - a.count);

  // Print top 30
  console.log('='.repeat(80));
  console.log('TOP GESTORAS WITH PROPERTY ADDRESSES');
  console.log('='.repeat(80));

  for (const g of gestoras.slice(0, 30)) {
    console.log(`\n### ${g.name} (${g.count} VVs, ${g.totalBeds} beds)`);
    console.log(`    Municipalities: ${g.municipalities.join(', ')}`);
    if (g.complexes.length > 0) {
      console.log(`    Complexes: ${g.complexes.slice(0, 3).join(', ')}`);
    }
    console.log(`    Addresses:`);
    for (const addr of g.addresses.slice(0, 10)) {
      console.log(`      - ${addr}`);
    }
    if (g.addresses.length > 10) {
      console.log(`      ... and ${g.addresses.length - 10} more addresses`);
    }
  }

  // Export to CSV
  const csvRows = ['Gestora,VVs,Beds,Municipality,Address'];
  for (const g of gestoras.slice(0, 50)) {
    for (const addr of g.addresses.slice(0, 20)) {
      csvRows.push([
        `"${g.name.replace(/"/g, '""')}"`,
        g.count,
        g.totalBeds,
        `"${g.municipalities.join(', ')}"`,
        `"${addr.replace(/"/g, '""')}"`,
      ].join(','));
    }
  }

  const csvPath = resolve(process.cwd(), 'outputs', 'gran-canaria-gestora-addresses.csv');
  writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`\n\nExported to: ${csvPath}`);
}

main();
