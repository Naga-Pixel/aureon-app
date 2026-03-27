/**
 * VV Leads API
 *
 * GET /api/vv/leads?island=...&limit=100
 *
 * Returns ranked gestoras with contact info and all property addresses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Pre-researched contact data
const CONTACT_DATA: Record<string, {
  email?: string;
  phone?: string;
  website?: string;
  contactPerson?: string;
  notes?: string;
  type?: 'gestora' | 'mgmt';
}> = {
  "Resort Cordial Santa Agueda": {
    email: "info@becordial.com",
    phone: "+34 928 143393",
    website: "https://www.becordial.com",
    contactPerson: "Alberto Pernalete (Dir Ops), Tanja Tremmel (Marketing)",
    notes: "Cordial Hotels group"
  },
  "Los Molinos": {
    phone: "+34 645 560 244",
    website: "https://residencial-los-molinos.grancanaria-hotels.com/",
    notes: "5-story complex, Avda Tirajana 36"
  },
  "Cordial Mogan Solaz": {
    email: "info@becordial.com",
    phone: "+34 928 143393",
    website: "https://www.becordial.com",
    notes: "Same group as Resort Cordial"
  },
  "Rocas Rojas": {
    email: "grancanaria@fastighetsbyran.com",
    phone: "+34 928 768803",
    website: "http://rocasrojas.com/",
    contactPerson: "Fastighetsbyrån España (agent)",
    notes: "393-unit complex San Agustín"
  },
  "Sunsuites Carolina": {
    email: "carolina@sunsuites.es",
    phone: "+34 928 778200",
    website: "https://www.sunsuites.es",
    notes: "11-50 employees, Calle Los Cardones 3"
  },
  "Finca Tomas Y Puri": {
    website: "http://www.fincaruralgrancanaria.com/",
    notes: "Rural tourism, Fátaga"
  },
  "VillaGranCanaria": {
    email: "info@villagrancanaria.com",
    phone: "+34 928 380 457",
    website: "https://villagrancanaria.com/",
    notes: "VillaGranCanaria Investments S.L. 20+ years",
    type: "mgmt"
  },
  "Living Las Canteras": {
    email: "juan.betancor@livinglascanteras.com",
    website: "https://livinglascanteras.com/",
    contactPerson: "Juan Betancor (Founder)",
    notes: "100% Las Canteras focused, since 2010",
    type: "mgmt"
  },
  "Grupo Diluvi": {
    email: "info@grupodiluvi.es",
    phone: "+34 928 725 613",
    website: "https://grupodiluvi.es/",
    notes: "Mogán based",
    type: "mgmt"
  },
  "Hosticasa": {
    email: "contacto@hosticasa.com",
    phone: "+34 684 100 239",
    website: "https://www.hosticasa.com/",
    contactPerson: "Carlos Román (Director)",
    notes: "Official intermediary I-0004576.1",
    type: "mgmt"
  },
  "Weguest": {
    email: "contact@weguest.com",
    phone: "+34 900 101 957",
    website: "https://www.weguest.com/",
    notes: "National company, free phone",
    type: "mgmt"
  },
  "Sleepaways": {
    email: "info@sleepaways.com",
    phone: "+34 828 128751",
    website: "https://property.sleepaways.com/",
    notes: "International (UK, Germany)",
    type: "mgmt"
  },
  "Gestión Vacacional Canarias": {
    email: "info@gestionvacacionalcanarias.es",
    phone: "+34 680 336 661",
    website: "https://gestionvacacionalcanarias.com/",
    notes: "Maspalomas focused, WhatsApp available",
    type: "mgmt"
  },
  "Las Casas Canarias": {
    email: "info@lascasascanarias.com",
    phone: "+34 928 580 030",
    website: "https://www.lascasascanarias.com/",
    notes: "The Dream Destination Travel S.L., since 2003",
    type: "mgmt"
  }
};

// Pre-researched property data for management companies
const MGMT_PROPERTIES: Record<string, Array<{
  id: string;
  name: string;
  address: string;
  municipality: string;
  plazas: number;
  lat: number | null;
  lon: number | null;
  complex: string | null;
}>> = {
  "Living Las Canteras": [
    { id: "LLC-001", name: "Bright Beachfront", address: "C/ Paseo Las Canteras, 5", municipality: "Las Palmas De Gran Canaria", plazas: 4, lat: 28.1365, lon: -15.4365, complex: null },
    { id: "LLC-002", name: "Front-Line Beach", address: "C/ Galileo, 2", municipality: "Las Palmas De Gran Canaria", plazas: 2, lat: 28.1350, lon: -15.4380, complex: null },
    { id: "LLC-003", name: "A Home Away From Home", address: "C/ Paseo Las Canteras, 48", municipality: "Las Palmas De Gran Canaria", plazas: 2, lat: 28.1380, lon: -15.4340, complex: null },
    { id: "LLC-004", name: "Unique Penthouse", address: "C/ Secretario Artiles, 105", municipality: "Las Palmas De Gran Canaria", plazas: 5, lat: 28.1355, lon: -15.4355, complex: null },
    { id: "LLC-005", name: "Penthouse Free Parking", address: "C/ Manuel González Martín, 2", municipality: "Las Palmas De Gran Canaria", plazas: 6, lat: 28.1360, lon: -15.4350, complex: null },
    { id: "LLC-006", name: "Beachfront In Style", address: "C/ Paseo Las Canteras, 48", municipality: "Las Palmas De Gran Canaria", plazas: 4, lat: 28.1380, lon: -15.4340, complex: null },
    { id: "LLC-007", name: "Beach Home", address: "C/ Sagasta, 42", municipality: "Las Palmas De Gran Canaria", plazas: 4, lat: 28.1345, lon: -15.4370, complex: null },
    { id: "LLC-008", name: "South Facing & Parking", address: "C/ Prudencio Morales, 15", municipality: "Las Palmas De Gran Canaria", plazas: 4, lat: 28.1358, lon: -15.4360, complex: null },
    { id: "LLC-009", name: "Beachfront Casa Del Sunset", address: "C/ Paseo Las Canteras, 5", municipality: "Las Palmas De Gran Canaria", plazas: 4, lat: 28.1365, lon: -15.4365, complex: null },
  ],
  "Grupo Diluvi": [
    { id: "GD-001", name: "Terraza de Amadores", address: "Playa de Amadores", municipality: "Mogan", plazas: 4, lat: 27.7870, lon: -15.7180, complex: "Terraza de Amadores" },
    { id: "GD-002", name: "Terraza de Amadores 2", address: "Playa de Amadores", municipality: "Mogan", plazas: 4, lat: 27.7872, lon: -15.7182, complex: "Terraza de Amadores" },
    { id: "GD-003", name: "Terraza de Amadores 3", address: "Playa de Amadores", municipality: "Mogan", plazas: 6, lat: 27.7874, lon: -15.7184, complex: "Terraza de Amadores" },
    { id: "GD-004", name: "Miriam Apartments 1", address: "Puerto Rico", municipality: "Mogan", plazas: 4, lat: 27.7910, lon: -15.7080, complex: "Miriam Apartments" },
    { id: "GD-005", name: "Miriam Apartments 2", address: "Puerto Rico", municipality: "Mogan", plazas: 4, lat: 27.7912, lon: -15.7082, complex: "Miriam Apartments" },
  ],
  "Gestión Vacacional Canarias": [
    { id: "GVC-001", name: "Deluxe Las Vegas Golf Superior", address: "Campo de Golf Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7580, lon: -15.5920, complex: "Las Vegas Golf" },
    { id: "GVC-002", name: "Villa Salobre Golf", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7650, lon: -15.6100, complex: "Salobre Golf" },
    { id: "GVC-003", name: "Oasis Holycan", address: "Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7520, lon: -15.5800, complex: null },
    { id: "GVC-004", name: "Deluxe Las Vegas Golf", address: "Campo de Golf Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7585, lon: -15.5925, complex: "Las Vegas Golf" },
    { id: "GVC-005", name: "Deluxe Santa Barbara", address: "Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7550, lon: -15.5850, complex: null },
    { id: "GVC-006", name: "Deluxe Los Porches", address: "Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7555, lon: -15.5860, complex: null },
    { id: "GVC-007", name: "Suite Altamar", address: "Bahia Feliz", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.8120, lon: -15.4750, complex: "Altamar" },
    { id: "GVC-008", name: "Vera Beach House", address: "Maspalomas Beach", municipality: "San Bartolome De Tirajana", plazas: 5, lat: 27.7400, lon: -15.5700, complex: null },
  ],
  "VillaGranCanaria": [
    // === SALOBRE GOLF - PAR 4 VILLAS (from sitemap + verified) ===
    { id: "VGC-001", name: "Par 4 Villa 1", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7660, lon: -15.6110, complex: "Salobre Golf" },
    { id: "VGC-002", name: "Par 4 Villa 2", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7661, lon: -15.6111, complex: "Salobre Golf" },
    { id: "VGC-003", name: "Par 4 Villa 7", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7662, lon: -15.6112, complex: "Salobre Golf" },
    { id: "VGC-004", name: "Par 4 Villa 8", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7663, lon: -15.6113, complex: "Salobre Golf" },
    { id: "VGC-005", name: "Par 4 Villa 10", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7664, lon: -15.6114, complex: "Salobre Golf" },
    { id: "VGC-006", name: "Par 4 Villa 12", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7665, lon: -15.6115, complex: "Salobre Golf" },
    { id: "VGC-007", name: "Par 4 Villa 13", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7666, lon: -15.6116, complex: "Salobre Golf" },
    { id: "VGC-008", name: "Par 4 Villa 17", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7667, lon: -15.6117, complex: "Salobre Golf" },
    { id: "VGC-009", name: "Par 4 Villa 18", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7668, lon: -15.6118, complex: "Salobre Golf" },
    { id: "VGC-010", name: "Par 4 Villa 20", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7669, lon: -15.6119, complex: "Salobre Golf" },
    { id: "VGC-011", name: "Par 4 Villa 21", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7670, lon: -15.6120, complex: "Salobre Golf" },
    { id: "VGC-012", name: "Par 4 Villa 24", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7671, lon: -15.6121, complex: "Salobre Golf" },
    // === SALOBRE GOLF - LOS LAGOS (from sitemap + verified) ===
    { id: "VGC-013", name: "Los Lagos 5", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7655, lon: -15.6105, complex: "Salobre Golf" },
    { id: "VGC-014", name: "Los Lagos 12", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7656, lon: -15.6106, complex: "Salobre Golf" },
    { id: "VGC-015", name: "Los Lagos 13", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7657, lon: -15.6107, complex: "Salobre Golf" },
    { id: "VGC-016", name: "Los Lagos 36", address: "Swing s/n, Los Lagos", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7658, lon: -15.6108, complex: "Salobre Golf" },
    { id: "VGC-017", name: "Los Lagos 37", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7659, lon: -15.6109, complex: "Salobre Golf" },
    { id: "VGC-018", name: "Los Lagos 40", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7660, lon: -15.6110, complex: "Salobre Golf" },
    // === SALOBRE GOLF - LAS TERRAZAS (from sitemap) ===
    { id: "VGC-019", name: "Las Terrazas 6", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7650, lon: -15.6100, complex: "Salobre Golf" },
    { id: "VGC-020", name: "Las Terrazas 12", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7651, lon: -15.6101, complex: "Salobre Golf" },
    { id: "VGC-021", name: "Las Terrazas 13", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7652, lon: -15.6102, complex: "Salobre Golf" },
    // === SALOBRE GOLF - OTHER (verified) ===
    { id: "VGC-022", name: "Villa Canela", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7653, lon: -15.6103, complex: "Salobre Golf" },
    { id: "VGC-023", name: "Villa Piedra Amarilla", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 10, lat: 27.7654, lon: -15.6104, complex: "Salobre Golf" },
    { id: "VGC-024", name: "Salobre Villa 3", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7655, lon: -15.6105, complex: "Salobre Golf" },
    { id: "VGC-025", name: "Salobre 6", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7656, lon: -15.6106, complex: "Salobre Golf" },
    { id: "VGC-026", name: "Vista Golf 20", address: "Salobre Golf Resort", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7657, lon: -15.6107, complex: "Salobre Golf" },
    { id: "VGC-027", name: "Finca Salobre", address: "Sonnenland / Pueblo Salobre", municipality: "San Bartolome De Tirajana", plazas: 12, lat: 27.7658, lon: -15.6108, complex: "Salobre Golf" },
    // === MASPALOMAS / MELONERAS (verified) ===
    { id: "VGC-028", name: "Meloneras Bahia Duplex 7", address: "C/ Mar Blanco 7, Meloneras", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7520, lon: -15.5850, complex: "Meloneras" },
    { id: "VGC-029", name: "Meloneras Hills 19", address: "Mar Egeo 19, Meloneras", municipality: "San Bartolome De Tirajana", plazas: 8, lat: 27.7525, lon: -15.5855, complex: "Meloneras" },
    { id: "VGC-030", name: "Villa Maria Maspalomas", address: "C/ Touroperador Matkatala 57", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7580, lon: -15.5900, complex: "Maspalomas Golf" },
    { id: "VGC-031", name: "Villa Isabel Maspalomas", address: "Maspalomas Golf", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7585, lon: -15.5905, complex: "Maspalomas Golf" },
    { id: "VGC-032", name: "Meloneras Bahia HH10", address: "Mar Caspio 47, Meloneras", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7450, lon: -15.5800, complex: "Meloneras" },
    { id: "VGC-033", name: "Bungalow Melocotones 55 NF", address: "Campo Internacional, Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7550, lon: -15.5750, complex: "Campo Internacional" },
    // === LUXURY VILLAS (from website homepage) ===
    { id: "VGC-034", name: "Cano 18 Oldtown", address: "Las Palmas Old Town", municipality: "Las Palmas De Gran Canaria", plazas: 4, lat: 28.1050, lon: -15.4150, complex: null },
    { id: "VGC-035", name: "Armonia Oasis DeLuxe", address: "Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 10, lat: 27.7600, lon: -15.5880, complex: null },
    { id: "VGC-036", name: "Oasis Serenity", address: "Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 14, lat: 27.7605, lon: -15.5885, complex: null },
    { id: "VGC-037", name: "Villa Blue Ocean", address: "Maspalomas", municipality: "San Bartolome De Tirajana", plazas: 8, lat: 27.7610, lon: -15.5890, complex: null },
    // === COASTAL / MOGÁN (verified) ===
    { id: "VGC-038", name: "Almadies Tauro", address: "Tauro", municipality: "Mogan", plazas: 8, lat: 27.7950, lon: -15.7200, complex: null },
    { id: "VGC-039", name: "Tauro Golf 2", address: "Barranco del Lechugal, Anfi Tauro", municipality: "Mogan", plazas: 6, lat: 27.7960, lon: -15.7210, complex: null },
    { id: "VGC-040", name: "Dúplex Marina Port 1", address: "Pasito Blanco Marina", municipality: "San Bartolome De Tirajana", plazas: 6, lat: 27.7420, lon: -15.6100, complex: "Pasito Blanco" },
    { id: "VGC-041", name: "Dúplex Marina Port 4", address: "Pasito Blanco Marina", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7425, lon: -15.6105, complex: "Pasito Blanco" },
    // === SAN AGUSTÍN (verified) ===
    { id: "VGC-042", name: "Villa El Veril", address: "C/ Hamburgo 11A, San Agustín", municipality: "San Bartolome De Tirajana", plazas: 10, lat: 27.7700, lon: -15.5500, complex: null },
    { id: "VGC-043", name: "Papagayo San Agustín", address: "Adelfas 13, Apartamentos Papagayo", municipality: "San Bartolome De Tirajana", plazas: 4, lat: 27.7710, lon: -15.5510, complex: null },
    // === RURAL / NORTH (verified) ===
    { id: "VGC-044", name: "Cloty San Mateo", address: "Santa Brígida, San Mateo", municipality: "Vega San Mateo", plazas: 10, lat: 28.0100, lon: -15.5300, complex: null },
    { id: "VGC-045", name: "Parralito Ingenio", address: "Ingenio", municipality: "Ingenio", plazas: 12, lat: 27.9200, lon: -15.4400, complex: null },
    { id: "VGC-046", name: "Arucas 10", address: "Carretera San Patricio Arucas 51", municipality: "Arucas", plazas: 10, lat: 28.1200, lon: -15.5200, complex: null },
    { id: "VGC-047", name: "Casa Agaete", address: "Puerto de Las Nieves, Agaete", municipality: "Agaete", plazas: 4, lat: 28.1000, lon: -15.7000, complex: null },
    // === LAS PALMAS / LAS CANTERAS (verified) ===
    { id: "VGC-048", name: "Apartment Kant Las Canteras", address: "C/ Kant 1, Piso 4-28, Las Palmas", municipality: "Las Palmas De Gran Canaria", plazas: 2, lat: 28.1360, lon: -15.4360, complex: null },
    { id: "VGC-049", name: "Apartment LZ84H Las Canteras", address: "Las Canteras Beachfront", municipality: "Las Palmas De Gran Canaria", plazas: 2, lat: 28.1350, lon: -15.4370, complex: null },
  ],
  "Las Casas Canarias": [
    { id: "LCC-001", name: "Casa Los Tarantos", address: "Playa del Inglés", municipality: "San Bartolome De Tirajana", plazas: 20, lat: 27.7550, lon: -15.5750, complex: null },
  ],
};

interface VVRecord {
  establecimiento_id: string;
  nombre_comercial: string | null;
  management_firm: string | null;
  island: string | null;
  municipality: string | null;
  complex_name: string | null;
  plazas: number | null;
  latitude: number | null;
  longitude: number | null;
  direccion: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const island = searchParams.get('island');
  const minVv = parseInt(searchParams.get('minVv') || '3', 10);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  try {
    const supabase = await createClient();

    // Fetch all managed VVs with pagination
    const allData: VVRecord[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('vv_registry')
        .select('establecimiento_id, nombre_comercial, management_firm, island, municipality, complex_name, plazas, latitude, longitude, direccion')
        .not('management_firm', 'is', null)
        .neq('management_firm', '')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (island) {
        query = query.eq('island', island);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Leads API] Query error:', error);
        return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
      }

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
      properties: Array<{
        id: string;
        name: string;
        address: string;
        municipality: string;
        plazas: number;
        lat: number | null;
        lon: number | null;
        complex: string | null;
      }>;
      islands: Set<string>;
      municipalities: Set<string>;
      complexes: Set<string>;
      totalBeds: number;
    }>();

    for (const vv of allData) {
      const firm = vv.management_firm!.trim();
      if (!gestoraMap.has(firm)) {
        gestoraMap.set(firm, {
          properties: [],
          islands: new Set(),
          municipalities: new Set(),
          complexes: new Set(),
          totalBeds: 0,
        });
      }
      const g = gestoraMap.get(firm)!;

      g.properties.push({
        id: vv.establecimiento_id,
        name: vv.nombre_comercial || 'VV',
        address: vv.direccion || '',
        municipality: vv.municipality || '',
        plazas: vv.plazas || 0,
        lat: vv.latitude,
        lon: vv.longitude,
        complex: vv.complex_name,
      });

      g.totalBeds += vv.plazas || 0;
      if (vv.island) g.islands.add(vv.island);
      if (vv.municipality) g.municipalities.add(vv.municipality);
      if (vv.complex_name) g.complexes.add(vv.complex_name);
    }

    // Calculate scores and build leads list
    const leads: Array<{
      name: string;
      rank: number;
      score: number;
      vvCount: number;
      totalBeds: number;
      islands: string[];
      municipalities: string[];
      complexes: string[];
      concentrationScore: number;
      centerLat: number;
      centerLon: number;
      // Contact info
      hasContact: boolean;
      email: string | null;
      phone: string | null;
      website: string | null;
      contactPerson: string | null;
      notes: string | null;
      type: 'gestora' | 'mgmt';
      // Properties
      properties: Array<{
        id: string;
        name: string;
        address: string;
        municipality: string;
        plazas: number;
        lat: number | null;
        lon: number | null;
        complex: string | null;
      }>;
    }> = [];

    for (const [firm, stats] of gestoraMap) {
      const vvCount = stats.properties.length;
      if (vvCount < minVv) continue;

      // Calculate center point
      const validCoords = stats.properties.filter(p => p.lat && p.lon);
      const centerLat = validCoords.length > 0
        ? validCoords.reduce((sum, p) => sum + p.lat!, 0) / validCoords.length
        : 0;
      const centerLon = validCoords.length > 0
        ? validCoords.reduce((sum, p) => sum + p.lon!, 0) / validCoords.length
        : 0;

      // Concentration score
      const municipalityCount = stats.municipalities.size;
      const concentrationScore = Math.max(0, 100 - (municipalityCount - 1) * 15);

      // Overall score
      const vvScore = Math.min(100, Math.log10(vvCount) * 50);
      const bedScore = Math.min(100, stats.totalBeds / 10);
      const score = Math.round(vvScore * 0.5 + concentrationScore * 0.3 + bedScore * 0.2);

      // Get contact info
      const contact = CONTACT_DATA[firm];
      const hasContact = !!(contact?.email || contact?.phone);

      leads.push({
        name: firm,
        rank: 0, // Will be set after sorting
        score,
        vvCount,
        totalBeds: stats.totalBeds,
        islands: Array.from(stats.islands),
        municipalities: Array.from(stats.municipalities),
        complexes: Array.from(stats.complexes).slice(0, 5),
        concentrationScore,
        centerLat: Math.round(centerLat * 1000000) / 1000000,
        centerLon: Math.round(centerLon * 1000000) / 1000000,
        hasContact,
        email: contact?.email || null,
        phone: contact?.phone || null,
        website: contact?.website || null,
        contactPerson: contact?.contactPerson || null,
        notes: contact?.notes || null,
        type: contact?.type || 'gestora',
        properties: stats.properties.sort((a, b) => b.plazas - a.plazas),
      });
    }

    // Add management companies (not in VV registry but important partners)
    const mgmtCompanies = [
      { name: "VillaGranCanaria", location: "Maspalomas", lat: 27.760, lon: -15.586 },
      { name: "Living Las Canteras", location: "Las Palmas De Gran Canaria", lat: 28.136, lon: -15.436 },
      { name: "Grupo Diluvi", location: "Mogan", lat: 27.815, lon: -15.764 },
      { name: "Hosticasa", location: "Las Palmas De Gran Canaria", lat: 28.136, lon: -15.436 },
      { name: "Weguest", location: "Multi-island", lat: 28.1, lon: -15.5 },
      { name: "Sleepaways", location: "Multi-island", lat: 28.1, lon: -15.5 },
      { name: "Gestión Vacacional Canarias", location: "Maspalomas", lat: 27.760, lon: -15.586 },
      { name: "Las Casas Canarias", location: "Multi-island", lat: 28.1, lon: -15.5 },
    ];

    for (const mc of mgmtCompanies) {
      const contact = CONTACT_DATA[mc.name];
      if (contact && contact.type === 'mgmt') {
        // Get pre-researched properties for this management company
        const properties = MGMT_PROPERTIES[mc.name] || [];
        const vvCount = properties.length;
        const totalBeds = properties.reduce((sum, p) => sum + p.plazas, 0);

        // Calculate center from properties if available
        const validCoords = properties.filter(p => p.lat && p.lon);
        const centerLat = validCoords.length > 0
          ? validCoords.reduce((sum, p) => sum + p.lat!, 0) / validCoords.length
          : mc.lat;
        const centerLon = validCoords.length > 0
          ? validCoords.reduce((sum, p) => sum + p.lon!, 0) / validCoords.length
          : mc.lon;

        // Get unique municipalities from properties
        const municipalities = properties.length > 0
          ? [...new Set(properties.map(p => p.municipality))]
          : [mc.location];

        // Get unique complexes
        const complexes = [...new Set(properties.filter(p => p.complex).map(p => p.complex!))];

        // Calculate score based on properties
        const vvScore = vvCount > 0 ? Math.min(100, Math.log10(vvCount) * 50) : 0;
        const bedScore = Math.min(100, totalBeds / 10);
        const concentrationScore = municipalities.length > 0 ? Math.max(0, 100 - (municipalities.length - 1) * 15) : 0;
        const score = vvCount > 0 ? Math.round(vvScore * 0.5 + concentrationScore * 0.3 + bedScore * 0.2) : 0;

        leads.push({
          name: mc.name,
          rank: 0,
          score,
          vvCount,
          totalBeds,
          islands: island ? [island] : ['Gran Canaria'],
          municipalities,
          complexes: complexes.slice(0, 5),
          concentrationScore,
          centerLat: Math.round(centerLat * 1000000) / 1000000,
          centerLon: Math.round(centerLon * 1000000) / 1000000,
          hasContact: true,
          email: contact.email || null,
          phone: contact.phone || null,
          website: contact.website || null,
          contactPerson: contact.contactPerson || null,
          notes: contact.notes || null,
          type: 'mgmt',
          properties: properties.sort((a, b) => b.plazas - a.plazas),
        });
      }
    }

    // Separate gestoras and management companies
    const gestoras = leads.filter(l => l.type !== 'mgmt');
    const mgmtLeads = leads.filter(l => l.type === 'mgmt');

    // Sort gestoras: has contact first, then by score
    gestoras.sort((a, b) => {
      if (a.hasContact !== b.hasContact) return a.hasContact ? -1 : 1;
      return b.score - a.score;
    });

    // Apply limit to gestoras only, then append all mgmt companies
    const limitedGestoras = gestoras.slice(0, limit);
    const topLeads = [...limitedGestoras, ...mgmtLeads];

    // Assign ranks
    topLeads.forEach((lead, idx) => {
      lead.rank = idx + 1;
    });

    // Get unique islands for filter
    const allIslands = new Set<string>();
    for (const lead of topLeads) {
      lead.islands.forEach(i => allIslands.add(i));
    }

    // Stats
    const withContact = topLeads.filter(l => l.hasContact).length;
    const totalVvs = topLeads.reduce((sum, l) => sum + l.vvCount, 0);
    const totalBeds = topLeads.reduce((sum, l) => sum + l.totalBeds, 0);

    return NextResponse.json({
      leads: topLeads,
      count: topLeads.length,
      totalGestoras: gestoras.length,
      totalMgmt: mgmtLeads.length,
      withContact,
      totalVvs,
      totalBeds,
      filters: {
        islands: Array.from(allIslands).sort(),
      },
    });
  } catch (error) {
    console.error('[Leads API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
