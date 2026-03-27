/**
 * Enrich Gestora Prospects with Contact Information
 *
 * Uses Google Custom Search API to find email, phone, website for each gestora.
 * Respects rate limits and daily quota (100 queries/day free tier).
 *
 * Usage:
 *   npx tsx scripts/enrich-prospect-contacts.ts
 *   npx tsx scripts/enrich-prospect-contacts.ts --island "Gran Canaria" --limit 50
 *   npx tsx scripts/enrich-prospect-contacts.ts --dry-run  # Show what would be searched
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (e) {
  // .env.local not found
}

// Config
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!GOOGLE_API_KEY || !GOOGLE_CX) {
  console.error('Missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Rate limiting - Google allows 10 QPS but we'll be very conservative
const DELAY_BETWEEN_REQUESTS_MS = 1500; // 1.5 seconds between requests
const MAX_QUERIES_PER_RUN = 50; // Stay well under 100/day quota

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
};
const isDryRun = args.includes('--dry-run');
const filterIsland = getArg('island') || 'Gran Canaria';
const limit = parseInt(getArg('limit') || '50', 10);

// Types
interface Prospect {
  name: string;
  vvCount: number;
  totalBeds: number;
  islands: string[];
  municipalities: string[];
  score: number;
}

interface ContactInfo {
  gestora: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedinUrl: string | null;
  searchQuery: string;
  searchedAt: string;
  resultSnippets: string[];
}

interface GoogleSearchResult {
  items?: Array<{
    title: string;
    link: string;
    snippet: string;
    pagemap?: {
      metatags?: Array<Record<string, string>>;
    };
  }>;
  searchInformation?: {
    totalResults: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

// Regex patterns for extraction
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX_ES = /(?:\+34\s?)?(?:6\d{2}|7[1-9]\d|8\d{2}|9\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/g;
const PHONE_REGEX_INTL = /\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Extract emails from text
 */
function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) || [];
  // Filter out common false positives
  return [...new Set(matches)].filter(email =>
    !email.includes('example.') &&
    !email.includes('@sentry') &&
    !email.includes('@google') &&
    !email.includes('@schema.org') &&
    !email.endsWith('.png') &&
    !email.endsWith('.jpg')
  );
}

/**
 * Extract phone numbers from text
 */
function extractPhones(text: string): string[] {
  const esMatches = text.match(PHONE_REGEX_ES) || [];
  const intlMatches = text.match(PHONE_REGEX_INTL) || [];
  const all = [...esMatches, ...intlMatches];
  // Normalize and dedupe
  return [...new Set(all.map(p => p.replace(/[\s.-]/g, '')))];
}

/**
 * Extract website from search results
 */
function extractWebsite(results: GoogleSearchResult): string | null {
  if (!results.items) return null;

  // Look for company's own domain (not booking sites, directories)
  const skipDomains = [
    'booking.com', 'airbnb', 'tripadvisor', 'expedia', 'hotels.com',
    'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com',
    'linkedin.com', 'wikipedia.org', 'yelp.com', 'google.com',
    'paginasamarillas', 'infoisinfo', 'cylex', 'europages',
    'datos.canarias.es', 'gobiernodecanarias.org'
  ];

  for (const item of results.items) {
    const domain = new URL(item.link).hostname.toLowerCase();
    if (!skipDomains.some(skip => domain.includes(skip))) {
      return item.link;
    }
  }

  return null;
}

/**
 * Extract LinkedIn URL from results
 */
function extractLinkedIn(results: GoogleSearchResult): string | null {
  if (!results.items) return null;

  for (const item of results.items) {
    if (item.link.includes('linkedin.com/company')) {
      return item.link;
    }
  }
  return null;
}

/**
 * Search Google for contact info
 */
async function searchGoogle(query: string): Promise<GoogleSearchResult> {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY!);
  url.searchParams.set('cx', GOOGLE_CX!);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10'); // Get top 10 results
  url.searchParams.set('lr', 'lang_es'); // Spanish language
  url.searchParams.set('cr', 'countryES'); // Spain

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google API error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch top prospects from database
 */
async function fetchProspects(island: string, maxCount: number): Promise<Prospect[]> {
  console.log(`Fetching prospects for ${island}...`);

  // Fetch all managed VVs for the island
  const allData: Array<{
    management_firm: string | null;
    island: string | null;
    municipality: string | null;
    plazas: number | null;
  }> = [];

  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vv_registry')
      .select('management_firm, island, municipality, plazas')
      .eq('island', island)
      .not('management_firm', 'is', null)
      .neq('management_firm', '')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...data);
      hasMore = data.length === pageSize;
      page++;
    }
  }

  // Group by gestora
  const gestoraMap = new Map<string, {
    vvCount: number;
    totalBeds: number;
    islands: Set<string>;
    municipalities: Set<string>;
  }>();

  for (const vv of allData) {
    const firm = vv.management_firm!.trim();
    if (!gestoraMap.has(firm)) {
      gestoraMap.set(firm, {
        vvCount: 0,
        totalBeds: 0,
        islands: new Set(),
        municipalities: new Set(),
      });
    }
    const g = gestoraMap.get(firm)!;
    g.vvCount++;
    g.totalBeds += vv.plazas || 0;
    if (vv.island) g.islands.add(vv.island);
    if (vv.municipality) g.municipalities.add(vv.municipality);
  }

  // Convert to array, calculate score, sort
  const prospects: Prospect[] = [];

  for (const [name, stats] of gestoraMap) {
    if (stats.vvCount < 5) continue; // Skip small ones

    const municipalityCount = stats.municipalities.size;
    const concentrationScore = Math.max(0, 100 - (municipalityCount - 1) * 15);
    const vvScore = Math.min(100, Math.log10(stats.vvCount) * 50);
    const bedScore = Math.min(100, stats.totalBeds / 10);
    const score = Math.round(vvScore * 0.5 + concentrationScore * 0.3 + bedScore * 0.2);

    prospects.push({
      name,
      vvCount: stats.vvCount,
      totalBeds: stats.totalBeds,
      islands: Array.from(stats.islands),
      municipalities: Array.from(stats.municipalities),
      score,
    });
  }

  prospects.sort((a, b) => b.score - a.score);

  console.log(`Found ${prospects.length} prospects with 5+ VVs`);

  return prospects.slice(0, maxCount);
}

/**
 * Load previously enriched contacts to avoid re-querying
 */
function loadExistingContacts(filepath: string): Map<string, ContactInfo> {
  const map = new Map<string, ContactInfo>();

  if (existsSync(filepath)) {
    try {
      const data = JSON.parse(readFileSync(filepath, 'utf-8'));
      for (const contact of data) {
        map.set(contact.gestora, contact);
      }
      console.log(`Loaded ${map.size} existing contacts from cache`);
    } catch (e) {
      console.log('Could not load existing contacts, starting fresh');
    }
  }

  return map;
}

/**
 * Save contacts to JSON and CSV
 */
function saveContacts(contacts: ContactInfo[], baseFilename: string): void {
  mkdirSync(resolve(process.cwd(), 'outputs'), { recursive: true });

  // JSON
  const jsonPath = resolve(process.cwd(), 'outputs', `${baseFilename}.json`);
  writeFileSync(jsonPath, JSON.stringify(contacts, null, 2));
  console.log(`Saved JSON: ${jsonPath}`);

  // CSV
  const csvPath = resolve(process.cwd(), 'outputs', `${baseFilename}.csv`);
  const headers = ['Gestora', 'Email', 'Phone', 'Website', 'LinkedIn', 'Searched At'];
  const rows = contacts.map(c => [
    `"${c.gestora.replace(/"/g, '""')}"`,
    c.email || '',
    c.phone || '',
    c.website || '',
    c.linkedinUrl || '',
    c.searchedAt,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  writeFileSync(csvPath, csv);
  console.log(`Saved CSV: ${csvPath}`);
}

/**
 * Main enrichment process
 */
async function main() {
  console.log('=== Prospect Contact Enrichment ===\n');
  console.log(`Island: ${filterIsland}`);
  console.log(`Limit: ${limit} prospects`);
  console.log(`Dry run: ${isDryRun}`);
  console.log(`Delay between requests: ${DELAY_BETWEEN_REQUESTS_MS}ms`);
  console.log('');

  // Fetch prospects
  const prospects = await fetchProspects(filterIsland, Math.min(limit, MAX_QUERIES_PER_RUN));

  if (prospects.length === 0) {
    console.log('No prospects found');
    return;
  }

  // Load existing contacts
  const islandSlug = filterIsland.toLowerCase().replace(/\s+/g, '-');
  const outputFilename = `prospect-contacts-${islandSlug}`;
  const existingContacts = loadExistingContacts(
    resolve(process.cwd(), 'outputs', `${outputFilename}.json`)
  );

  // Enrich each prospect
  const contacts: ContactInfo[] = Array.from(existingContacts.values());
  let queriesMade = 0;
  let skipped = 0;
  let found = 0;

  console.log(`\nProcessing ${prospects.length} prospects...\n`);

  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];

    // Skip if already enriched
    if (existingContacts.has(prospect.name)) {
      console.log(`[${i + 1}/${prospects.length}] SKIP (cached): ${prospect.name}`);
      skipped++;
      continue;
    }

    // Build search query
    const searchQuery = `"${prospect.name}" contacto email telefono ${filterIsland} Canarias`;

    if (isDryRun) {
      console.log(`[${i + 1}/${prospects.length}] WOULD SEARCH: ${searchQuery}`);
      continue;
    }

    console.log(`[${i + 1}/${prospects.length}] Searching: ${prospect.name}`);

    try {
      const results = await searchGoogle(searchQuery);
      queriesMade++;

      // Check for quota exceeded
      if (results.error) {
        if (results.error.code === 429 || results.error.message.includes('quota')) {
          console.error('\n!!! Daily quota exceeded. Stopping. !!!\n');
          break;
        }
        throw new Error(results.error.message);
      }

      // Extract contact info from results
      const allText = (results.items || [])
        .map(item => `${item.title} ${item.snippet}`)
        .join(' ');

      const emails = extractEmails(allText);
      const phones = extractPhones(allText);
      const website = extractWebsite(results);
      const linkedin = extractLinkedIn(results);

      const contact: ContactInfo = {
        gestora: prospect.name,
        email: emails[0] || null,
        phone: phones[0] || null,
        website,
        linkedinUrl: linkedin,
        searchQuery,
        searchedAt: new Date().toISOString(),
        resultSnippets: (results.items || []).slice(0, 3).map(i => i.snippet),
      };

      contacts.push(contact);

      const foundInfo = [
        contact.email ? 'email' : null,
        contact.phone ? 'phone' : null,
        contact.website ? 'web' : null,
      ].filter(Boolean);

      if (foundInfo.length > 0) {
        console.log(`   Found: ${foundInfo.join(', ')}`);
        found++;
      } else {
        console.log(`   No contact info found`);
      }

      // Rate limit
      if (i < prospects.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }

    } catch (error) {
      console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Add empty result to avoid re-querying
      contacts.push({
        gestora: prospect.name,
        email: null,
        phone: null,
        website: null,
        linkedinUrl: null,
        searchQuery,
        searchedAt: new Date().toISOString(),
        resultSnippets: [],
      });
    }
  }

  if (!isDryRun) {
    // Save results
    saveContacts(contacts, outputFilename);

    // Summary
    console.log('\n=== Summary ===');
    console.log(`Queries made: ${queriesMade}`);
    console.log(`Skipped (cached): ${skipped}`);
    console.log(`Found contact info: ${found}`);
    console.log(`Total contacts: ${contacts.length}`);

    // Show contacts with info
    const withInfo = contacts.filter(c => c.email || c.phone || c.website);
    if (withInfo.length > 0) {
      console.log('\n=== Contacts Found ===\n');
      for (const c of withInfo.slice(0, 20)) {
        console.log(`${c.gestora}`);
        if (c.email) console.log(`  Email: ${c.email}`);
        if (c.phone) console.log(`  Phone: ${c.phone}`);
        if (c.website) console.log(`  Web: ${c.website}`);
        console.log('');
      }
    }
  }
}

main().catch(console.error);
