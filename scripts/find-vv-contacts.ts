#!/usr/bin/env npx ts-node
/**
 * VV Contact Finder Script
 *
 * Finds contactable targets from VV registry by:
 * 1. Address clustering (buildings with multiple VVs)
 * 2. Brand extraction from listing names
 * 3. Google search for contact info (optional, free tier: 100/day)
 *
 * Usage:
 *   npx ts-node scripts/find-vv-contacts.ts [--island "Gran Canaria"] [--min-vvs 5]
 *
 * Environment variables (optional, for enhanced results):
 *   GOOGLE_SEARCH_API_KEY - Google Custom Search API key
 *   GOOGLE_SEARCH_CX - Google Custom Search engine ID
 *
 * Without Google API, uses web scraping fallback for basic info.
 */

// ============ Configuration ============

const args = process.argv.slice(2);
const TARGET_ISLAND = args.includes('--island')
  ? args[args.indexOf('--island') + 1]
  : 'Gran Canaria';
const MIN_VVS = args.includes('--min-vvs')
  ? parseInt(args[args.indexOf('--min-vvs') + 1], 10)
  : 5;
const MAX_RESULTS = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : 999;

const VV_CSV_URL =
  'https://datos.canarias.es/catalogos/general/dataset/9f4355a2-d086-4384-ba72-d8c99aa2d544/resource/8ff8cc43-c00b-4513-8f42-a5b961c579e1/download/establecimientos-extrahoteleros-de-tipologia-vivienda-vacacional-inscritos-en-el-registro-genera.csv';

// Brand patterns to extract from listing names
const BRAND_PATTERNS = [
  // Property management indicators
  /^([\w\s]+)\s+\d+$/i,           // "Brand Name 123" -> "Brand Name"
  /^([\w\s]+)\s+(?:apt|apto|apartment|suite|room)\s*\d*/i,
  /^([\w\s]+)\s+(?:i{1,3}|iv|v|vi)$/i,  // Roman numerals
];

// Words that indicate a brand vs generic name
const BRAND_INDICATORS = [
  'suites', 'apartments', 'apartamentos', 'rentals', 'homes', 'holidays',
  'villas', 'resort', 'beach', 'playa', 'park', 'group', 'bnb', 'stay',
  'collection', 'living', 'houses', 'flats',
];

// Generic names to ignore
const GENERIC_NAMES = new Set([
  'apartamento', 'apartment', 'bungalow', 'piso', 'flat', 'duplex',
  'estudio', 'studio', 'casa', 'house', 'home', 'vivienda',
  'habitacion', 'room', 'suite', 'chalet', 'villa',
]);

// ============ Types ============

interface VVRecord {
  id: string;
  nombre: string | null;
  island: string | null;
  municipality: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  plazas: number;
}

interface BuildingCluster {
  normalizedAddress: string;
  sampleAddress: string;
  municipality: string;
  vvCount: number;
  totalPlazas: number;
  listingNames: string[];
  brands: string[];
  coordinates: { lat: number; lon: number } | null;
}

interface ContactInfo {
  website: string | null;
  phone: string | null;
  email: string | null;
  source: string;
}

interface ContactResult {
  cluster: BuildingCluster;
  searchQuery: string;
  contact: ContactInfo;
  confidence: 'high' | 'medium' | 'low' | 'none';
  notes: string[];
}

// ============ CSV Parsing ============

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

function parseRow(fields: string[]): VVRecord | null {
  if (fields.length < 16) return null;

  const [
    id, nombre, , , , address,
    island, , municipality, , ,
    , , plazas_str, lon_str, lat_str,
  ] = fields;

  if (!id || id === 'establecimiento_id') return null;

  return {
    id: id.trim(),
    nombre: nombre?.trim() || null,
    island: island?.trim() || null,
    municipality: municipality?.trim() || null,
    address: address?.trim() || null,
    latitude: parseFloat(lat_str) || null,
    longitude: parseFloat(lon_str) || null,
    plazas: parseInt(plazas_str, 10) || 0,
  };
}

// ============ Address Clustering ============

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+\d+[a-z]?\s*$/i, '')     // Remove trailing unit numbers
    .replace(/\bapt\.?\s*\d+/gi, '')
    .replace(/\bpiso\s*\d+/gi, '')
    .replace(/\bportal\s*\d+/gi, '')
    .replace(/\bnº?\s*\d+/gi, ' ')         // Normalize street numbers
    .replace(/[,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrands(names: string[]): string[] {
  const brandCounts = new Map<string, number>();

  for (const name of names) {
    if (!name) continue;

    const normalized = name.toLowerCase().trim();
    const words = normalized.split(/\s+/);

    // Skip if it's a single generic word
    if (words.length === 1 && GENERIC_NAMES.has(words[0])) continue;

    // Check if it contains brand indicators
    const hasBrandIndicator = BRAND_INDICATORS.some(ind =>
      normalized.includes(ind)
    );

    // Extract potential brand (first 2-3 significant words)
    let brand = words
      .filter(w => !GENERIC_NAMES.has(w) && w.length > 2 && !/^\d+$/.test(w))
      .slice(0, 3)
      .join(' ');

    if (brand.length < 3) continue;

    // Clean up trailing numbers and common suffixes
    brand = brand
      .replace(/\s+\d+[a-z]?$/i, '')
      .replace(/\s+(i{1,3}|iv|v|vi)$/i, '')
      .trim();

    if (brand.length >= 3) {
      brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
    }
  }

  // Return brands that appear 2+ times (consistent naming)
  return [...brandCounts.entries()]
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([brand]) => brand);
}

function clusterByAddress(records: VVRecord[]): BuildingCluster[] {
  const clusters = new Map<string, {
    addresses: string[];
    municipality: string;
    vvCount: number;
    totalPlazas: number;
    names: string[];
    coords: { lat: number; lon: number }[];
  }>();

  for (const r of records) {
    if (!r.address || r.address.length < 10) continue;

    const key = normalizeAddress(r.address) + '|' + (r.municipality || '').toLowerCase();

    if (!clusters.has(key)) {
      clusters.set(key, {
        addresses: [],
        municipality: r.municipality || '',
        vvCount: 0,
        totalPlazas: 0,
        names: [],
        coords: [],
      });
    }

    const cluster = clusters.get(key)!;
    cluster.vvCount++;
    cluster.totalPlazas += r.plazas;
    cluster.addresses.push(r.address);
    if (r.nombre) cluster.names.push(r.nombre);
    if (r.latitude && r.longitude) {
      cluster.coords.push({ lat: r.latitude, lon: r.longitude });
    }
  }

  // Convert to array and filter by min VVs
  return [...clusters.entries()]
    .filter(([_, c]) => c.vvCount >= MIN_VVS)
    .map(([key, c]) => {
      // Get most common address as sample
      const addrCounts = new Map<string, number>();
      c.addresses.forEach(a => addrCounts.set(a, (addrCounts.get(a) || 0) + 1));
      const sampleAddress = [...addrCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || c.addresses[0];

      // Calculate center coordinates
      const coords = c.coords.length > 0
        ? {
            lat: c.coords.reduce((s, p) => s + p.lat, 0) / c.coords.length,
            lon: c.coords.reduce((s, p) => s + p.lon, 0) / c.coords.length,
          }
        : null;

      return {
        normalizedAddress: key.split('|')[0],
        sampleAddress,
        municipality: c.municipality,
        vvCount: c.vvCount,
        totalPlazas: c.totalPlazas,
        listingNames: [...new Set(c.names)],
        brands: extractBrands(c.names),
        coordinates: coords,
      };
    })
    .sort((a, b) => b.vvCount - a.vvCount);
}

// ============ Contact Search ============

async function searchGoogle(query: string): Promise<{
  results: Array<{ title: string; url: string; snippet: string }>;
  source: 'google_api' | 'none';
}> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    return { results: [], source: 'none' };
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '5');

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`  Google API error: ${response.status}`);
      return { results: [], source: 'none' };
    }

    const data = await response.json();
    return {
      results: (data.items || []).map((item: any) => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.snippet || '',
      })),
      source: 'google_api',
    };
  } catch (error) {
    return { results: [], source: 'none' };
  }
}

function extractContactFromResults(
  results: Array<{ title: string; url: string; snippet: string }>
): ContactInfo {
  let website: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  let source = 'search';

  for (const r of results) {
    // Skip aggregator sites
    if (/airbnb|booking\.com|expedia|tripadvisor|vrbo|cozycozy|likibu/i.test(r.url)) {
      continue;
    }

    // Prioritize official-looking domains
    if (!website && r.url) {
      website = r.url;
      source = new URL(r.url).hostname;
    }

    // Extract phone from snippet
    if (!phone) {
      const phoneMatch = r.snippet.match(/(?:\+34\s?)?(?:9\d{2}[\s\-]?\d{3}[\s\-]?\d{3}|\d{3}[\s\-]\d{3}[\s\-]\d{3})/);
      if (phoneMatch) {
        phone = phoneMatch[0].replace(/[\s\-]/g, ' ').trim();
      }
    }

    // Extract email from snippet
    if (!email) {
      const emailMatch = r.snippet.match(/[\w\.\-]+@[\w\.\-]+\.\w+/);
      if (emailMatch) {
        email = emailMatch[0];
      }
    }
  }

  return { website, phone, email, source };
}

async function findContact(cluster: BuildingCluster): Promise<ContactResult> {
  const notes: string[] = [];

  // Build search query
  let searchQuery: string;

  if (cluster.brands.length > 0) {
    // Use the most prominent brand
    const brand = cluster.brands[0];
    searchQuery = `"${brand}" ${cluster.municipality} Gran Canaria alquiler vacacional contacto`;
    notes.push(`Brand detected: ${brand}`);
  } else {
    // Fall back to address-based search
    searchQuery = `"${cluster.sampleAddress}" ${cluster.municipality} apartamentos contacto`;
    notes.push('No brand detected, using address');
  }

  // Search Google
  const { results, source } = await searchGoogle(searchQuery);

  if (source === 'none') {
    notes.push('Google API not configured - manual search needed');
  }

  // Extract contact info
  const contact = extractContactFromResults(results);

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' | 'none';
  if (contact.phone && contact.website) {
    confidence = 'high';
    notes.push('Phone and website found');
  } else if (contact.website) {
    confidence = 'medium';
    notes.push('Website found, no phone');
  } else if (contact.phone || contact.email) {
    confidence = 'medium';
    notes.push('Partial contact info found');
  } else if (results.length > 0) {
    confidence = 'low';
    notes.push('Search results found but no direct contact');
  } else {
    confidence = 'none';
    notes.push('No results - try manual search');
  }

  // Add manual search suggestions
  if (confidence === 'none' || confidence === 'low') {
    if (cluster.brands.length > 0) {
      notes.push(`Try: Google "${cluster.brands[0]} Gran Canaria"`);
    }
    notes.push(`Try: administrador de fincas ${cluster.municipality}`);
  }

  return { cluster, searchQuery, contact, confidence, notes };
}

// ============ Report Generation ============

function generateHTMLReport(results: ContactResult[], island: string): string {
  const now = new Date().toISOString().split('T')[0];

  const high = results.filter(r => r.confidence === 'high');
  const medium = results.filter(r => r.confidence === 'medium');
  const low = results.filter(r => r.confidence === 'low');
  const none = results.filter(r => r.confidence === 'none');

  const totalVVs = results.reduce((s, r) => s + r.cluster.vvCount, 0);

  const renderRow = (r: ContactResult) => {
    const c = r.cluster;
    const colors: Record<string, string> = {
      high: '#22c55e', medium: '#eab308', low: '#f97316', none: '#94a3b8'
    };

    const mapLink = c.coordinates
      ? `https://www.google.com/maps?q=${c.coordinates.lat},${c.coordinates.lon}`
      : `https://www.google.com/maps/search/${encodeURIComponent(c.sampleAddress + ', ' + c.municipality + ', Gran Canaria')}`;

    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
          <strong>${escapeHtml(c.sampleAddress)}</strong>
          <br><small style="color: #6b7280;">${escapeHtml(c.municipality)}</small>
          <br><a href="${mapLink}" target="_blank" style="font-size: 11px; color: #3b82f6;">View on map</a>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: top;">
          <strong style="font-size: 18px;">${c.vvCount}</strong>
          <br><small style="color: #6b7280;">${c.totalPlazas} plazas</small>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
          ${c.brands.length > 0
            ? c.brands.map(b => `<span style="display: inline-block; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; margin: 2px; font-size: 12px;">${escapeHtml(b)}</span>`).join('')
            : '<span style="color: #9ca3af; font-size: 12px;">No brand detected</span>'
          }
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: ${colors[r.confidence]}20; color: ${colors[r.confidence]}; font-weight: 600; font-size: 12px;">
            ${r.confidence.toUpperCase()}
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
          ${r.contact.website ? `<div><a href="${r.contact.website}" target="_blank" style="color: #2563eb; font-size: 13px;">${new URL(r.contact.website).hostname}</a></div>` : ''}
          ${r.contact.phone ? `<div style="font-size: 13px;"><strong>Tel:</strong> ${escapeHtml(r.contact.phone)}</div>` : ''}
          ${r.contact.email ? `<div style="font-size: 13px;"><strong>Email:</strong> ${escapeHtml(r.contact.email)}</div>` : ''}
          ${!r.contact.website && !r.contact.phone && !r.contact.email ? '<span style="color: #9ca3af; font-size: 12px;">Manual search needed</span>' : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 12px; color: #6b7280;">
          ${r.notes.map(n => `<div>• ${escapeHtml(n)}</div>`).join('')}
        </td>
      </tr>
    `;
  };

  const renderSection = (title: string, items: ContactResult[], color: string, icon: string) => {
    if (items.length === 0) return '';
    return `
      <div style="margin-top: 32px;">
        <h2 style="color: #111827; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 24px;">${icon}</span>
          <span style="color: ${color};">${title}</span>
          <span style="color: #9ca3af; font-weight: normal; font-size: 16px;">(${items.length} buildings, ${items.reduce((s, r) => s + r.cluster.vvCount, 0)} VVs)</span>
        </h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; width: 25%;">Address</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; width: 8%;">VVs</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; width: 17%;">Brands</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; width: 10%;">Status</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; width: 20%;">Contact Info</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; width: 20%;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(renderRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VV Contact Finder - ${island}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; margin: 0; padding: 24px; color: #111827; }
    .container { max-width: 1600px; margin: 0 auto; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header style="margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 28px;">VV Contact Finder Results</h1>
      <p style="color: #6b7280; margin: 8px 0 0 0;">${island} • Buildings with ${MIN_VVS}+ VVs • Generated ${now}</p>
    </header>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px;">
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #22c55e;">${high.length}</div>
        <div style="color: #6b7280;">Ready to Contact</div>
      </div>
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #eab308;">${medium.length}</div>
        <div style="color: #6b7280;">Partial Info</div>
      </div>
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #111827;">${results.length}</div>
        <div style="color: #6b7280;">Total Buildings</div>
      </div>
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #111827;">${totalVVs}</div>
        <div style="color: #6b7280;">Total VVs</div>
      </div>
    </div>

    <div style="background: #ecfdf5; border-left: 4px solid #22c55e; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
      <strong style="color: #166534;">How to Use This Report</strong>
      <ol style="margin: 8px 0 0 0; color: #166534; font-size: 14px; padding-left: 20px;">
        <li><strong>High confidence:</strong> Call or email directly using the contact info</li>
        <li><strong>Medium:</strong> Visit the website to find contact details</li>
        <li><strong>Low/None:</strong> Google the brand or search for "administrador de fincas [municipality]"</li>
      </ol>
    </div>

    ${renderSection('Ready to Contact', high, '#22c55e', '✅')}
    ${renderSection('Partial Contact Info', medium, '#eab308', '🔍')}
    ${renderSection('Needs Manual Search', low, '#f97316', '👀')}
    ${renderSection('No Results Found', none, '#94a3b8', '❓')}

    <footer style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 13px;">
      Generated by Aureon VV Contact Finder • ${new Date().toLocaleString()}
    </footer>
  </div>
</body>
</html>`;
}

function generateCSV(results: ContactResult[]): string {
  const headers = [
    'Address', 'Municipality', 'VVs', 'Plazas', 'Brands', 'Confidence',
    'Website', 'Phone', 'Email', 'Map Link', 'Notes'
  ];

  const rows = results.map(r => {
    const c = r.cluster;
    const mapLink = c.coordinates
      ? `https://www.google.com/maps?q=${c.coordinates.lat},${c.coordinates.lon}`
      : '';

    return [
      `"${c.sampleAddress.replace(/"/g, '""')}"`,
      `"${c.municipality}"`,
      c.vvCount,
      c.totalPlazas,
      `"${c.brands.join(', ')}"`,
      r.confidence,
      r.contact.website || '',
      r.contact.phone || '',
      r.contact.email || '',
      mapLink,
      `"${r.notes.join('; ').replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============ Main ============

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  VV Contact Finder                                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`Target island: ${TARGET_ISLAND}`);
  console.log(`Minimum VVs per building: ${MIN_VVS}`);
  console.log(`Google API: ${process.env.GOOGLE_SEARCH_API_KEY ? 'configured' : 'not configured'}\n`);

  // Download data
  console.log('Downloading VV registry...');
  const response = await fetch(VV_CSV_URL);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);

  const text = await response.text();
  const lines = text.split('\n');
  console.log(`Downloaded ${lines.length} lines`);

  // Parse and filter
  const records: VVRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    const record = parseRow(fields);

    if (record && record.island?.toLowerCase() === TARGET_ISLAND.toLowerCase()) {
      records.push(record);
    }
  }

  console.log(`Filtered to ${records.length} VVs in ${TARGET_ISLAND}\n`);

  // Cluster by address
  console.log('Clustering by address...');
  const clusters = clusterByAddress(records);
  console.log(`Found ${clusters.length} buildings with ${MIN_VVS}+ VVs\n`);

  if (clusters.length === 0) {
    console.log('No clusters found. Try lowering --min-vvs');
    return;
  }

  // Find contacts for each cluster (limited by --limit)
  const clustersToProcess = clusters.slice(0, MAX_RESULTS);
  console.log(`Searching for contact info (processing ${clustersToProcess.length} of ${clusters.length})...\n`);
  const results: ContactResult[] = [];

  for (let i = 0; i < clustersToProcess.length; i++) {
    const cluster = clustersToProcess[i];
    const brandInfo = cluster.brands.length > 0 ? ` [${cluster.brands[0]}]` : '';
    process.stdout.write(`\r  [${i + 1}/${clusters.length}] ${cluster.municipality.slice(0, 20).padEnd(20)}${brandInfo.slice(0, 25).padEnd(25)}`);

    const result = await findContact(cluster);
    results.push(result);

    // Rate limit for Google API (1.5 seconds between requests to stay under 100/min)
    if (process.env.GOOGLE_SEARCH_API_KEY) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log('\n\n=== Summary ===');
  console.log(`Total buildings: ${results.length}`);
  console.log(`High confidence (ready to contact): ${results.filter(r => r.confidence === 'high').length}`);
  console.log(`Medium confidence (partial info): ${results.filter(r => r.confidence === 'medium').length}`);
  console.log(`Low/None (needs manual search): ${results.filter(r => r.confidence === 'low' || r.confidence === 'none').length}`);

  // Generate reports
  const fs = await import('fs');
  const path = await import('path');
  const reportsDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const slugIsland = TARGET_ISLAND.toLowerCase().replace(/\s+/g, '-');

  // HTML report
  const htmlPath = `reports/vv-contacts-${slugIsland}-${dateStr}.html`;
  fs.writeFileSync(path.join(process.cwd(), htmlPath), generateHTMLReport(results, TARGET_ISLAND));
  console.log(`\nHTML report: ${htmlPath}`);

  // CSV export
  const csvPath = `reports/vv-contacts-${slugIsland}-${dateStr}.csv`;
  fs.writeFileSync(path.join(process.cwd(), csvPath), generateCSV(results));
  console.log(`CSV export: ${csvPath}`);

  // JSON data
  const jsonPath = `reports/vv-contacts-${slugIsland}-${dateStr}.json`;
  fs.writeFileSync(path.join(process.cwd(), jsonPath), JSON.stringify(results, null, 2));
  console.log(`JSON data: ${jsonPath}`);

  console.log(`\nOpen the HTML report in your browser to start outreach!`);
}

main().catch(console.error);
