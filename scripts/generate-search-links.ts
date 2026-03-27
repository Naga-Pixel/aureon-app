/**
 * Generate Search Links for Gestora Contact Research
 *
 * Creates an HTML file with clickable search links for each gestora.
 * Data persists in localStorage so you can work through the list over time.
 *
 * Usage:
 *   npx tsx scripts/generate-search-links.ts
 *   npx tsx scripts/generate-search-links.ts --island "Gran Canaria"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
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
} catch (e) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
};
const filterIsland = getArg('island') || 'Gran Canaria';

interface Prospect {
  name: string;
  vvCount: number;
  totalBeds: number;
  municipalities: string[];
  score: number;
}

async function fetchProspects(island: string): Promise<Prospect[]> {
  console.log(`Fetching prospects for ${island}...`);

  const allData: Array<{
    management_firm: string | null;
    municipality: string | null;
    plazas: number | null;
  }> = [];

  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vv_registry')
      .select('management_firm, municipality, plazas')
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

  const gestoraMap = new Map<string, {
    vvCount: number;
    totalBeds: number;
    municipalities: Set<string>;
  }>();

  for (const vv of allData) {
    const firm = vv.management_firm!.trim();
    if (!gestoraMap.has(firm)) {
      gestoraMap.set(firm, { vvCount: 0, totalBeds: 0, municipalities: new Set() });
    }
    const g = gestoraMap.get(firm)!;
    g.vvCount++;
    g.totalBeds += vv.plazas || 0;
    if (vv.municipality) g.municipalities.add(vv.municipality);
  }

  const prospects: Prospect[] = [];
  for (const [name, stats] of gestoraMap) {
    if (stats.vvCount < 5) continue;
    const municipalityCount = stats.municipalities.size;
    const concentrationScore = Math.max(0, 100 - (municipalityCount - 1) * 15);
    const vvScore = Math.min(100, Math.log10(stats.vvCount) * 50);
    const score = Math.round(vvScore * 0.6 + concentrationScore * 0.4);

    prospects.push({
      name,
      vvCount: stats.vvCount,
      totalBeds: stats.totalBeds,
      municipalities: Array.from(stats.municipalities),
      score,
    });
  }

  prospects.sort((a, b) => b.score - a.score);
  return prospects;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateHTML(prospects: Prospect[], island: string): string {
  const rows = prospects.map((p, i) => {
    const nameEncoded = encodeURIComponent(`"${p.name}"`);
    const searchBase = encodeURIComponent(`${p.name} ${island} Canarias`);

    return `
      <tr data-gestora="${escapeHtml(p.name)}">
        <td class="rank">${i + 1}</td>
        <td class="score ${p.score >= 70 ? 'high' : p.score >= 50 ? 'med' : 'low'}">${p.score}</td>
        <td class="name">${escapeHtml(p.name)}</td>
        <td class="num">${p.vvCount}</td>
        <td class="num">${p.totalBeds}</td>
        <td class="muni" title="${escapeHtml(p.municipalities.join(', '))}">${escapeHtml(p.municipalities.slice(0, 2).join(', '))}${p.municipalities.length > 2 ? '...' : ''}</td>
        <td class="links">
          <a href="https://www.google.com/search?q=${nameEncoded}+contacto+email+telefono+Canarias" target="_blank" title="Google">G</a>
          <a href="https://www.google.com/search?q=${nameEncoded}+site:infocif.es" target="_blank" title="Infocif">iC</a>
          <a href="https://www.google.com/search?q=${nameEncoded}+site:einforma.com" target="_blank" title="eInforma">eI</a>
          <a href="https://www.google.com/search?q=${searchBase}+site:linkedin.com" target="_blank" title="LinkedIn">in</a>
        </td>
        <td class="input"><input type="text" placeholder="Email" data-field="email"></td>
        <td class="input"><input type="text" placeholder="+34..." data-field="phone"></td>
        <td class="input"><input type="text" placeholder="https://..." data-field="website"></td>
        <td class="status">
          <select data-field="status">
            <option value="">-</option>
            <option value="found">Found</option>
            <option value="no-info">No info</option>
            <option value="contacted">Contacted</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gestora Contact Research - ${escapeHtml(island)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 20px; background: #f5f5f5;
    }
    h1 { margin: 0 0 5px; }
    .subtitle { color: #666; margin-bottom: 20px; }
    .stats-bar {
      display: flex; gap: 20px; margin-bottom: 15px; padding: 10px 15px;
      background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat { font-size: 14px; }
    .stat strong { color: #059669; }
    .actions { margin-bottom: 15px; display: flex; gap: 10px; }
    .actions button {
      padding: 8px 16px; background: #059669; color: white;
      border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
    }
    .actions button:hover { background: #047857; }
    .actions button.secondary { background: #6b7280; }
    .actions button.secondary:hover { background: #4b5563; }
    table {
      width: 100%; border-collapse: collapse; background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;
    }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
    th { background: #f8f8f8; font-weight: 600; position: sticky; top: 0; z-index: 10; }
    tr:hover { background: #f9fafb; }
    tr.found { background: #d1fae5; }
    tr.contacted { background: #dbeafe; }
    tr.no-info { background: #f3f4f6; opacity: 0.7; }
    .rank { width: 35px; color: #999; text-align: center; }
    .score { width: 45px; font-weight: 600; text-align: center; border-radius: 4px; }
    .score.high { background: #d1fae5; color: #065f46; }
    .score.med { background: #fef3c7; color: #92400e; }
    .score.low { background: #f3f4f6; color: #6b7280; }
    .name { font-weight: 500; min-width: 180px; }
    .num { width: 50px; text-align: center; }
    .muni { font-size: 11px; color: #666; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .links { width: 100px; white-space: nowrap; }
    .links a {
      display: inline-block; padding: 3px 6px; margin-right: 2px;
      background: #3b82f6; color: white; text-decoration: none;
      border-radius: 3px; font-size: 10px; font-weight: 600;
    }
    .links a:hover { background: #2563eb; }
    .links a[title="LinkedIn"] { background: #0077b5; }
    .links a[title="Infocif"] { background: #f59e0b; }
    .links a[title="eInforma"] { background: #8b5cf6; }
    .input { width: 140px; }
    .input input {
      width: 100%; padding: 4px 8px; border: 1px solid #e5e7eb;
      border-radius: 4px; font-size: 12px;
    }
    .input input:focus { border-color: #3b82f6; outline: none; }
    .input input.filled { background: #f0fdf4; border-color: #86efac; }
    .status select {
      padding: 4px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 12px;
    }
    .filter-bar { margin-bottom: 10px; }
    .filter-bar select { padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; }
  </style>
</head>
<body>
  <h1>Gestora Contact Research - ${escapeHtml(island)}</h1>
  <p class="subtitle">${prospects.length} gestoras with 5+ VVs. Click search links, paste contact info, track progress.</p>

  <div class="stats-bar">
    <div class="stat">Total: <strong id="stat-total">${prospects.length}</strong></div>
    <div class="stat">Found: <strong id="stat-found">0</strong></div>
    <div class="stat">No info: <strong id="stat-noinfo">0</strong></div>
    <div class="stat">Contacted: <strong id="stat-contacted">0</strong></div>
    <div class="stat">Remaining: <strong id="stat-remaining">${prospects.length}</strong></div>
  </div>

  <div class="filter-bar">
    <label>Show: </label>
    <select id="filter-status">
      <option value="all">All</option>
      <option value="pending">Pending only</option>
      <option value="found">Found only</option>
      <option value="contacted">Contacted only</option>
    </select>
  </div>

  <div class="actions">
    <button onclick="exportCSV()">Export CSV</button>
    <button onclick="exportJSON()" class="secondary">Export JSON</button>
    <button onclick="clearAll()" class="secondary">Clear All Data</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Score</th>
        <th>Gestora</th>
        <th>VVs</th>
        <th>Beds</th>
        <th>Municipios</th>
        <th>Search</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Website</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <script>
    const STORAGE_KEY = 'gestora-contacts-${island.toLowerCase().replace(/\\s+/g, '-')}';

    // Pre-populated research data (auto-generated)
    const PRE_POPULATED = {
      "Resort Cordial Santa Agueda": {
        email: "info@becordial.com",
        phone: "+34 928 143393",
        website: "https://www.becordial.com",
        status: "found",
        notes: "Alberto Pernalete (Dir Ops), Oscar Pubill (Mogán), Tanja Tremmel (Marketing)"
      },
      "Los Molinos": {
        email: "",
        phone: "+34 645 560 244",
        website: "https://residencial-los-molinos.grancanaria-hotels.com/",
        status: "found",
        notes: "Avenida Tirajana 40 Maspalomas. 5-story complex"
      },
      "Rocas Rojas": {
        email: "grancanaria@fastighetsbyran.com",
        phone: "+34 928 768803",
        website: "http://rocasrojas.com/",
        status: "found",
        notes: "393-unit complex San Agustín. Calle Las Pitas 6"
      },
      "Sunsuites Carolina": {
        email: "carolina@sunsuites.es",
        phone: "+34 928 778200",
        website: "https://www.sunsuites.es",
        status: "found",
        notes: "11-50 employees. Calle Los Cardones 3 San Agustín"
      },
      "Cordial Mogan Solaz": {
        email: "info@becordial.com",
        phone: "+34 928 143393",
        website: "https://www.becordial.com",
        status: "found",
        notes: "Same group as Resort Cordial Santa Agueda"
      },
      "VillaGranCanaria": {
        email: "info@villagrancanaria.com",
        phone: "+34 928 380 457",
        website: "https://villagrancanaria.com/",
        status: "found",
        notes: "VillaGranCanaria Investments S.L. CIF B76226992. 20+ years. Salobre Golf Resort"
      },
      "Living Las Canteras": {
        email: "juan.betancor@livinglascanteras.com",
        phone: "",
        website: "https://livinglascanteras.com/",
        status: "found",
        notes: "Juan Betancor (Founder). 2 Galileo Street 35010 Las Palmas. Since 2010"
      },
      "Grupo Diluvi": {
        email: "info@grupodiluvi.es",
        phone: "+34 928 725 613",
        website: "https://grupodiluvi.es/",
        status: "found",
        notes: "Mogán 35130 Gran Canaria"
      },
      "Hosticasa": {
        email: "contacto@hosticasa.com",
        phone: "+34 684 100 239",
        website: "https://www.hosticasa.com/",
        status: "found",
        notes: "Carlos Román (Director). Official intermediary I-0004576.1. C/ Practicante Ignacio Rodríguez 35017"
      },
      "Weguest": {
        email: "contact@weguest.com",
        phone: "+34 900 101 957",
        website: "https://www.weguest.com/",
        status: "found",
        notes: "National company. Free phone"
      },
      "Sleepaways": {
        email: "info@sleepaways.com",
        phone: "+34 828 128751",
        website: "https://property.sleepaways.com/",
        status: "found",
        notes: "Also UK +44 7520642199, Germany +49 89 61429689"
      },
      "Gestión Vacacional Canarias": {
        email: "info@gestionvacacionalcanarias.es",
        phone: "+34 680 336 661",
        website: "https://gestionvacacionalcanarias.com/",
        status: "found",
        notes: "WhatsApp available. Maspalomas focused"
      },
      "Las Casas Canarias": {
        email: "info@lascasascanarias.com",
        phone: "+34 928 580 030",
        website: "https://www.lascasascanarias.com/",
        status: "found",
        notes: "The Dream Destination Travel S.L. WhatsApp +34 638 525 416. Since 2003"
      },
      "Finca Tomas Y Puri": {
        email: "",
        phone: "",
        website: "http://www.fincaruralgrancanaria.com/",
        status: "found",
        notes: "Rural tourism. GC 60 Km 35 Capaón 30 - Fátaga 35106"
      }
    };

    // Load saved data
    function loadData() {
      const saved = localStorage.getItem(STORAGE_KEY);
      let userData = {};
      try { userData = saved ? JSON.parse(saved) : {}; } catch { userData = {}; }
      // Merge pre-populated with user data (user data takes precedence)
      const merged = { ...PRE_POPULATED };
      for (const [key, val] of Object.entries(userData)) {
        merged[key] = { ...(merged[key] || {}), ...val };
      }
      return merged;
    }

    // Save data
    function saveData(data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // Initialize
    const data = loadData();
    saveData(data); // Persist merged data

    document.querySelectorAll('tbody tr').forEach(tr => {
      const gestora = tr.dataset.gestora;
      const saved = data[gestora] || {};

      // Restore values
      tr.querySelectorAll('input, select').forEach(el => {
        const field = el.dataset.field;
        if (saved[field]) {
          el.value = saved[field];
          if (el.tagName === 'INPUT' && saved[field]) el.classList.add('filled');
        }
      });

      // Apply status class
      if (saved.status) tr.classList.add(saved.status);

      // Save on change
      tr.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', () => {
          const field = el.dataset.field;
          if (!data[gestora]) data[gestora] = {};
          data[gestora][field] = el.value;
          saveData(data);

          if (el.tagName === 'INPUT') {
            el.classList.toggle('filled', !!el.value);
          }
          if (field === 'status') {
            tr.classList.remove('found', 'no-info', 'contacted');
            if (el.value) tr.classList.add(el.value);
          }
          updateStats();
        });
      });
    });

    function updateStats() {
      let found = 0, noinfo = 0, contacted = 0;
      Object.values(data).forEach(d => {
        if (d.status === 'found') found++;
        if (d.status === 'no-info') noinfo++;
        if (d.status === 'contacted') contacted++;
      });
      document.getElementById('stat-found').textContent = found;
      document.getElementById('stat-noinfo').textContent = noinfo;
      document.getElementById('stat-contacted').textContent = contacted;
      document.getElementById('stat-remaining').textContent = ${prospects.length} - found - noinfo - contacted;
    }
    updateStats();

    // Filter
    document.getElementById('filter-status').addEventListener('change', (e) => {
      const filter = e.target.value;
      document.querySelectorAll('tbody tr').forEach(tr => {
        const gestora = tr.dataset.gestora;
        const status = data[gestora]?.status || '';
        if (filter === 'all') tr.style.display = '';
        else if (filter === 'pending') tr.style.display = status ? 'none' : '';
        else tr.style.display = status === filter ? '' : 'none';
      });
    });

    function exportCSV() {
      const rows = [['Gestora', 'VVs', 'Beds', 'Score', 'Email', 'Phone', 'Website', 'Status']];
      document.querySelectorAll('tbody tr').forEach(tr => {
        const gestora = tr.dataset.gestora;
        const d = data[gestora] || {};
        if (d.email || d.phone || d.website || d.status) {
          rows.push([
            gestora,
            tr.querySelectorAll('.num')[0].textContent,
            tr.querySelectorAll('.num')[1].textContent,
            tr.querySelector('.score').textContent,
            d.email || '',
            d.phone || '',
            d.website || '',
            d.status || ''
          ]);
        }
      });
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\\n');
      download(csv, 'gestora-contacts-${island.toLowerCase().replace(/\\s+/g, '-')}.csv', 'text/csv');
    }

    function exportJSON() {
      download(JSON.stringify(data, null, 2), 'gestora-contacts-${island.toLowerCase().replace(/\\s+/g, '-')}.json', 'application/json');
    }

    function download(content, filename, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
    }

    function clearAll() {
      if (confirm('Clear all saved contact data? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      }
    }
  </script>
</body>
</html>`;
}

async function main() {
  const prospects = await fetchProspects(filterIsland);
  console.log(`Found ${prospects.length} prospects with 5+ VVs`);

  const html = generateHTML(prospects, filterIsland);

  mkdirSync(resolve(process.cwd(), 'outputs'), { recursive: true });
  const filename = `gestora-search-${filterIsland.toLowerCase().replace(/\s+/g, '-')}.html`;
  const filepath = resolve(process.cwd(), 'outputs', filename);
  writeFileSync(filepath, html);

  console.log(`\nGenerated: ${filepath}`);
  console.log('\nOpen in browser to:');
  console.log('1. Click search links (Google, Infocif, eInforma, LinkedIn)');
  console.log('2. Paste contact info into fields');
  console.log('3. Mark status (Found/No info/Contacted)');
  console.log('4. Export to CSV when done');
  console.log('\nData auto-saves to browser localStorage.');
}

main().catch(console.error);
