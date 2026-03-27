#!/usr/bin/env npx ts-node
/**
 * Gestora Validation Script
 *
 * Validates frequency-based management firm candidates by:
 * 1. Checking if plausible domains exist
 * 2. Optional Google Custom Search API lookup
 *
 * Usage:
 *   npx ts-node scripts/validate-gestoras.ts [--island "Gran Canaria"]
 *
 * Environment variables (optional):
 *   GOOGLE_SEARCH_API_KEY - Google Custom Search API key
 *   GOOGLE_SEARCH_CX - Google Custom Search engine ID
 */

// ============ Configuration ============

const TARGET_ISLAND = process.argv.includes('--island')
  ? process.argv[process.argv.indexOf('--island') + 1]
  : 'Gran Canaria';

const VV_CSV_URL =
  'https://datos.canarias.es/catalogos/general/dataset/9f4355a2-d086-4384-ba72-d8c99aa2d544/resource/8ff8cc43-c00b-4513-8f42-a5b961c579e1/download/establecimientos-extrahoteleros-de-tipologia-vivienda-vacacional-inscritos-en-el-registro-genera.csv';

// Names to ignore
const IGNORE_NAMES = new Set([
  'sin denominacion', 'sin denominación', 'vivienda vacacional',
  'vivienda', 'categoria unica', 'categoría única', '_u',
  'particular', 'propietario', 'owner',
]);

// ============ Types ============

interface VVRecord {
  establecimiento_id: string;
  nombre_comercial: string | null;
  island: string | null;
  municipality: string | null;
  latitude: number | null;
  longitude: number | null;
  plazas: number;
  direccion: string | null;
}

interface FirmCandidate {
  name: string;
  vvCount: number;
  totalPlazas: number;
  locations: number; // distinct geographic locations
  municipalities: string[];
  sampleAddresses: string[];
}

interface ValidationResult {
  firm: FirmCandidate;
  domainChecks: DomainCheck[];
  googleResults: GoogleResult[];
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'unverified';
  signals: string[];
}

interface DomainCheck {
  domain: string;
  exists: boolean;
  redirectsTo?: string;
}

interface GoogleResult {
  title: string;
  url: string;
  snippet: string;
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
    establecimiento_id, nombre_comercial, , , , direccion,
    island, , municipality, , ,
    , , plazas_str, longitude_str, latitude_str,
  ] = fields;

  if (!establecimiento_id || establecimiento_id === 'establecimiento_id') {
    return null;
  }

  return {
    establecimiento_id: establecimiento_id.trim(),
    nombre_comercial: nombre_comercial?.trim() || null,
    island: island?.trim() || null,
    municipality: municipality?.trim() || null,
    latitude: parseFloat(latitude_str) || null,
    longitude: parseFloat(longitude_str) || null,
    plazas: parseInt(plazas_str, 10) || 0,
    direccion: direccion?.trim() || null,
  };
}

// ============ Frequency Detection ============

function detectFrequencyFirms(records: VVRecord[]): FirmCandidate[] {
  const firmData = new Map<string, {
    vvCount: number;
    totalPlazas: number;
    locations: Set<string>;
    municipalities: Set<string>;
    addresses: string[];
  }>();

  for (const r of records) {
    if (!r.nombre_comercial || !r.latitude || !r.longitude) continue;

    const name = r.nombre_comercial.trim();
    const normalized = name.toLowerCase();

    if (IGNORE_NAMES.has(normalized)) continue;
    if (normalized.length < 3) continue;

    // Location key with ~100m granularity
    const locKey = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;

    if (!firmData.has(name)) {
      firmData.set(name, {
        vvCount: 0,
        totalPlazas: 0,
        locations: new Set(),
        municipalities: new Set(),
        addresses: [],
      });
    }

    const data = firmData.get(name)!;
    data.vvCount++;
    data.totalPlazas += r.plazas;
    data.locations.add(locKey);
    if (r.municipality) data.municipalities.add(r.municipality);
    if (r.direccion && data.addresses.length < 3) {
      data.addresses.push(r.direccion);
    }
  }

  // Filter to names appearing at 2+ distinct locations
  const candidates: FirmCandidate[] = [];
  for (const [name, data] of firmData) {
    if (data.locations.size >= 2) {
      candidates.push({
        name,
        vvCount: data.vvCount,
        totalPlazas: data.totalPlazas,
        locations: data.locations.size,
        municipalities: Array.from(data.municipalities),
        sampleAddresses: data.addresses,
      });
    }
  }

  // Sort by VV count descending
  return candidates.sort((a, b) => b.vvCount - a.vvCount);
}

// ============ Domain Validation ============

function generateDomainVariants(firmName: string): string[] {
  // Normalize the name
  let slug = firmName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[,.'"\-()]/g, '') // Remove punctuation
    .replace(/\b(s\.?l\.?u?\.?|s\.?a\.?|sociedad\s+limitada)\b/gi, '') // Remove legal suffixes
    .replace(/\b(viviendas?\s+vacacionales?|vacation\s+rentals?|holiday\s+homes?)\b/gi, '')
    .trim()
    .replace(/\s+/g, ''); // Remove spaces for domain

  const slugWithDashes = firmName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[,.'"\-()]/g, '')
    .replace(/\b(s\.?l\.?u?\.?|s\.?a\.?)\b/gi, '')
    .trim()
    .replace(/\s+/g, '-');

  if (slug.length < 3) return [];

  const variants: string[] = [];
  const tlds = ['.com', '.es', '.net'];

  for (const tld of tlds) {
    variants.push(slug + tld);
    if (slugWithDashes !== slug) {
      variants.push(slugWithDashes + tld);
    }
  }

  return [...new Set(variants)].slice(0, 6); // Max 6 variants
}

async function checkDomain(domain: string): Promise<DomainCheck> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const finalUrl = response.url;
    const redirectsTo = finalUrl !== `https://${domain}` && finalUrl !== `https://${domain}/`
      ? finalUrl
      : undefined;

    return { domain, exists: response.ok, redirectsTo };
  } catch (error) {
    // Try http as fallback
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${domain}`, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);
      return { domain, exists: response.ok };
    } catch {
      return { domain, exists: false };
    }
  }
}

async function validateDomains(firm: FirmCandidate): Promise<DomainCheck[]> {
  const variants = generateDomainVariants(firm.name);
  if (variants.length === 0) return [];

  const results: DomainCheck[] = [];

  // Check domains sequentially to be nice to servers
  for (const domain of variants) {
    const result = await checkDomain(domain);
    results.push(result);

    // If we found a working domain, no need to check more
    if (result.exists) break;
  }

  return results;
}

// ============ Google Search (Optional) ============

async function searchGoogle(query: string): Promise<GoogleResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    return [];
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '5');

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Google API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    return (data.items || []).map((item: any) => ({
      title: item.title || '',
      url: item.link || '',
      snippet: item.snippet || '',
    }));
  } catch (error) {
    console.error('Google search error:', error);
    return [];
  }
}

async function validateWithGoogle(firm: FirmCandidate): Promise<GoogleResult[]> {
  // Search for the firm name with relevant keywords
  const query = `"${firm.name}" (alquiler vacacional OR vacation rental OR booking OR inmobiliaria)`;
  return searchGoogle(query);
}

// ============ Scoring ============

function calculateConfidence(
  firm: FirmCandidate,
  domainChecks: DomainCheck[],
  googleResults: GoogleResult[]
): { score: number; level: 'high' | 'medium' | 'low' | 'unverified'; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // Base score from frequency analysis
  if (firm.locations >= 5) {
    score += 30;
    signals.push(`${firm.locations} distinct locations`);
  } else if (firm.locations >= 3) {
    score += 20;
    signals.push(`${firm.locations} distinct locations`);
  } else {
    score += 10;
    signals.push(`${firm.locations} locations (minimum)`);
  }

  // VV count bonus
  if (firm.vvCount >= 20) {
    score += 20;
    signals.push(`${firm.vvCount} VVs managed`);
  } else if (firm.vvCount >= 10) {
    score += 15;
    signals.push(`${firm.vvCount} VVs managed`);
  } else if (firm.vvCount >= 5) {
    score += 10;
    signals.push(`${firm.vvCount} VVs managed`);
  }

  // Legal entity indicators in name
  if (/\b(s\.?l\.?u?\.?|s\.?a\.?)\b/i.test(firm.name)) {
    score += 15;
    signals.push('Legal entity suffix (SL/SA)');
  }

  // Domain exists
  const workingDomain = domainChecks.find(d => d.exists);
  if (workingDomain) {
    score += 25;
    signals.push(`Domain found: ${workingDomain.domain}`);
  }

  // Google results
  if (googleResults.length > 0) {
    const hasBookingPlatform = googleResults.some(r =>
      /booking\.com|airbnb|vrbo|tripadvisor/i.test(r.url)
    );
    const hasLinkedIn = googleResults.some(r => /linkedin\.com/i.test(r.url));
    const hasOwnWebsite = googleResults.some(r =>
      r.url.toLowerCase().includes(firm.name.toLowerCase().replace(/\s+/g, '').slice(0, 10))
    );

    if (hasBookingPlatform) {
      score += 15;
      signals.push('Found on booking platforms');
    }
    if (hasLinkedIn) {
      score += 10;
      signals.push('LinkedIn presence');
    }
    if (hasOwnWebsite) {
      score += 10;
      signals.push('Own website in results');
    }
  }

  // Determine confidence level
  let level: 'high' | 'medium' | 'low' | 'unverified';
  if (score >= 70) {
    level = 'high';
  } else if (score >= 50) {
    level = 'medium';
  } else if (score >= 30) {
    level = 'low';
  } else {
    level = 'unverified';
  }

  return { score: Math.min(100, score), level, signals };
}

// ============ Report Generation ============

function generateHTMLReport(results: ValidationResult[], island: string): string {
  const now = new Date().toISOString().split('T')[0];

  const highConfidence = results.filter(r => r.confidenceLevel === 'high');
  const mediumConfidence = results.filter(r => r.confidenceLevel === 'medium');
  const lowConfidence = results.filter(r => r.confidenceLevel === 'low');
  const unverified = results.filter(r => r.confidenceLevel === 'unverified');

  const totalVVs = results.reduce((sum, r) => sum + r.firm.vvCount, 0);
  const totalPlazas = results.reduce((sum, r) => sum + r.firm.totalPlazas, 0);

  const renderFirmRow = (r: ValidationResult) => {
    const domainLink = r.domainChecks.find(d => d.exists);
    const googleLink = r.googleResults[0];

    const levelColors: Record<string, string> = {
      high: '#22c55e',
      medium: '#eab308',
      low: '#f97316',
      unverified: '#94a3b8',
    };

    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${escapeHtml(r.firm.name)}</strong>
          <br><small style="color: #6b7280;">${r.firm.municipalities.join(', ')}</small>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <strong>${r.firm.vvCount}</strong>
          <br><small style="color: #6b7280;">${r.firm.totalPlazas} plazas</small>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          ${r.firm.locations}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; background: ${levelColors[r.confidenceLevel]}20; color: ${levelColors[r.confidenceLevel]}; font-weight: 600;">
            ${r.confidenceScore}% ${r.confidenceLevel}
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
          ${r.signals.map(s => `<div>• ${escapeHtml(s)}</div>`).join('')}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          ${domainLink ? `<a href="https://${domainLink.domain}" target="_blank" style="color: #2563eb;">${domainLink.domain}</a>` : ''}
          ${googleLink ? `<br><a href="${googleLink.url}" target="_blank" style="color: #6b7280; font-size: 12px;">Google result</a>` : ''}
        </td>
      </tr>
    `;
  };

  const renderSection = (title: string, items: ValidationResult[], color: string) => {
    if (items.length === 0) return '';
    return `
      <div style="margin-top: 32px;">
        <h2 style="color: ${color}; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: ${color}; border-radius: 50%;"></span>
          ${title} (${items.length})
        </h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Gestora</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">VVs</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Locations</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Confidence</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Signals</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Links</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(renderFirmRow).join('')}
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
  <title>Gestora Validation Report - ${island}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f3f4f6;
      margin: 0;
      padding: 24px;
      color: #111827;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header style="margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 28px;">Gestora Validation Report</h1>
      <p style="color: #6b7280; margin: 8px 0 0 0;">${island} • Generated ${now}</p>
    </header>

    <!-- Summary Stats -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #22c55e;">${highConfidence.length}</div>
        <div style="color: #6b7280;">High Confidence</div>
      </div>
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #eab308;">${mediumConfidence.length}</div>
        <div style="color: #6b7280;">Medium Confidence</div>
      </div>
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #111827;">${results.length}</div>
        <div style="color: #6b7280;">Total Candidates</div>
      </div>
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 32px; font-weight: 700; color: #111827;">${totalVVs}</div>
        <div style="color: #6b7280;">VVs Represented</div>
      </div>
    </div>

    <!-- Methodology Note -->
    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 32px;">
      <strong style="color: #1e40af;">Validation Methodology</strong>
      <p style="margin: 8px 0 0 0; color: #1e3a8a; font-size: 14px;">
        Candidates are names appearing at 2+ distinct geographic locations (~100m granularity).
        Confidence is based on: location count, VV count, legal entity suffix, domain existence, and Google search results.
      </p>
    </div>

    ${renderSection('High Confidence Gestoras', highConfidence, '#22c55e')}
    ${renderSection('Medium Confidence', mediumConfidence, '#eab308')}
    ${renderSection('Low Confidence', lowConfidence, '#f97316')}
    ${renderSection('Unverified (Needs Manual Review)', unverified, '#94a3b8')}

    <footer style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 13px;">
      Generated by Aureon Gestora Validation Tool • ${new Date().toLocaleString()}
    </footer>
  </div>
</body>
</html>`;
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
  console.log('║  Gestora Validation Script                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`Target island: ${TARGET_ISLAND}`);
  console.log(`Google API: ${process.env.GOOGLE_SEARCH_API_KEY ? 'configured' : 'not configured (domain check only)'}\n`);

  // Download data
  console.log('Downloading VV registry...');
  const response = await fetch(VV_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  console.log(`Downloaded ${lines.length} lines`);

  // Parse and filter to target island
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

  // Detect frequency-based firms
  const candidates = detectFrequencyFirms(records);
  console.log(`Found ${candidates.length} frequency-based firm candidates\n`);

  if (candidates.length === 0) {
    console.log('No candidates found. Exiting.');
    return;
  }

  // Validate each candidate
  const results: ValidationResult[] = [];

  console.log('Validating candidates...\n');

  for (let i = 0; i < candidates.length; i++) {
    const firm = candidates[i];
    process.stdout.write(`\r  [${i + 1}/${candidates.length}] ${firm.name.slice(0, 40).padEnd(40)}`);

    // Domain checks
    const domainChecks = await validateDomains(firm);

    // Google search (if configured)
    const googleResults = await validateWithGoogle(firm);

    // Calculate confidence
    const { score, level, signals } = calculateConfidence(firm, domainChecks, googleResults);

    results.push({
      firm,
      domainChecks,
      googleResults,
      confidenceScore: score,
      confidenceLevel: level,
      signals,
    });

    // Small delay to be nice to servers
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n\n=== Summary ===');
  console.log(`Total candidates: ${results.length}`);
  console.log(`High confidence: ${results.filter(r => r.confidenceLevel === 'high').length}`);
  console.log(`Medium confidence: ${results.filter(r => r.confidenceLevel === 'medium').length}`);
  console.log(`Low confidence: ${results.filter(r => r.confidenceLevel === 'low').length}`);
  console.log(`Unverified: ${results.filter(r => r.confidenceLevel === 'unverified').length}`);

  // Generate HTML report
  const html = generateHTMLReport(results, TARGET_ISLAND);
  const reportPath = `reports/gestora-validation-${TARGET_ISLAND.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`;

  // Ensure reports directory exists
  const fs = await import('fs');
  const path = await import('path');
  const reportsDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(process.cwd(), reportPath), html);
  console.log(`\nReport saved to: ${reportPath}`);

  // Also save JSON for further processing
  const jsonPath = reportPath.replace('.html', '.json');
  fs.writeFileSync(
    path.join(process.cwd(), jsonPath),
    JSON.stringify(results, null, 2)
  );
  console.log(`JSON data saved to: ${jsonPath}`);

  console.log(`\nOpen the HTML report in your browser to review results.`);
}

main().catch(console.error);
