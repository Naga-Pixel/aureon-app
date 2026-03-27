/**
 * Add manually researched addresses to solar grants
 *
 * These addresses were found via Google search for the top regional grants
 * that couldn't be geocoded automatically.
 */

import { readFile, writeFile } from 'fs/promises';

// Manually researched company locations
const MANUAL_GEOCODES: Record<string, { lat: number; lon: number; address: string; municipality: string }> = {
  // El Rosario Solar - Tenerife (€2.4M + €1.6M grants)
  'G09868597': { lat: 28.4067, lon: -16.3647, address: 'Calle Elcano 38, Radazul', municipality: 'El Rosario, Tenerife' },

  // HRP Las Marismas - Fuerteventura (€1M grant)
  'B76061639': { lat: 28.7303, lon: -13.8628, address: 'Huriamen 7, Corralejo', municipality: 'La Oliva, Fuerteventura' },

  // Medano Ingenieros - Tenerife (€795k)
  'B38950929': { lat: 28.0445, lon: -16.5367, address: 'Calle Tulipán 1, El Médano', municipality: 'Granadilla de Abona, Tenerife' },

  // Soslaires Canarias - Gran Canaria (€770k)
  'B35552306': { lat: 27.9067, lon: -15.4189, address: 'Calle Rafael Martel Rodriguez 1', municipality: 'Agüimes, Gran Canaria' },

  // Hotelera Adeje (H10 Costa Adeje Palace) - Tenerife (€700k)
  'B38485231': { lat: 28.0731, lon: -16.7342, address: 'Calle la Enramada s/n', municipality: 'Adeje, Tenerife' },

  // CE Playa del Inglés - Gran Canaria (€640k + €587k + €300k)
  'G56325194': { lat: 27.7589, lon: -15.5761, address: 'Playa del Inglés', municipality: 'San Bartolomé de Tirajana, Gran Canaria' },

  // Surlago (Hotel Gran Tinerfe) - Tenerife (€564k)
  'A38348413': { lat: 28.0789, lon: -16.7256, address: 'Avda Rafael Puig Lluvina 13', municipality: 'Adeje, Tenerife' },

  // San Eugenio SA - Tenerife (€557k)
  'A76524842': { lat: 28.0753, lon: -16.7389, address: 'Urbanización San Eugenio', municipality: 'Adeje, Tenerife' },

  // Lansol (Hotel Lanzarote Princess) - Lanzarote (€431k)
  'A58062308': { lat: 28.8603, lon: -13.8283, address: 'Playa Blanca', municipality: 'Yaiza, Lanzarote' },

  // Hoteles Piñero Canarias (already has some geocoded, but add for completeness)
  'B07671985': { lat: 28.0542, lon: -16.7189, address: 'Costa Adeje', municipality: 'Adeje, Tenerife' },

  // Anargo 2002 (Gas station) - Gran Canaria (€325k)
  'B35710805': { lat: 27.8689, lon: -15.5417, address: 'Calle Orilla Alta 2', municipality: 'Santa Lucía de Tirajana, Gran Canaria' },

  // Teide 10 (Hotel Rubicón Palace) - Lanzarote (€307k)
  'B35504059': { lat: 28.8589, lon: -13.8194, address: 'Av Faro de Pechiguera s/n', municipality: 'Yaiza, Lanzarote' },

  // CE Valleseco - Gran Canaria (€297k + €147k)
  'G09829433': { lat: 28.0519, lon: -15.5742, address: 'Calle León y Castillo 12', municipality: 'Valleseco, Gran Canaria' },

  // Rosa Ingeniería - Gran Canaria (€278k + multiple)
  'B76344761': { lat: 27.8714, lon: -15.5378, address: 'Calle Doctor Fleming 72', municipality: 'Santa Lucía de Tirajana, Gran Canaria' },

  // Energía Bonita - La Palma (€274k)
  'F67655522': { lat: 28.7417, lon: -17.7803, address: 'Puntallana', municipality: 'Puntallana, La Palma' },

  // Teleférico Pico Teide - Tenerife (€256k)
  'A38002549': { lat: 28.4697, lon: -16.2519, address: 'Calle San Francisco 5', municipality: 'Santa Cruz de Tenerife' },

  // Dinosol Supermercados - Gran Canaria (€147k)
  'B61742565': { lat: 28.1269, lon: -15.4367, address: 'C/Luis Correa Medina 9', municipality: 'Las Palmas de Gran Canaria' },

  // Complejo El Carmen - Tenerife (€227k)
  'B38457495': { lat: 28.0489, lon: -16.5589, address: 'El Médano', municipality: 'Granadilla de Abona, Tenerife' },

  // Artes Gráficas del Atlántico - Gran Canaria (€193k)
  'A35218700': { lat: 28.0758, lon: -15.4519, address: 'Las Palmas', municipality: 'Las Palmas de Gran Canaria' },

  // Arca Canarias - Tenerife (€189k)
  'B38219341': { lat: 28.4589, lon: -16.2867, address: 'Santa Cruz de Tenerife', municipality: 'Santa Cruz de Tenerife' },

  // Mogan Negocios - Gran Canaria (€182k)
  'B35841642': { lat: 27.8167, lon: -15.7167, address: 'Mogán', municipality: 'Mogán, Gran Canaria' },

  // Compañía Frigorífica Canariense - Gran Canaria (€144k)
  'A35025014': { lat: 28.1089, lon: -15.4283, address: 'Las Palmas', municipality: 'Las Palmas de Gran Canaria' },

  // Columbus SA - Tenerife (€128k)
  'A38022125': { lat: 28.0519, lon: -16.7156, address: 'Playa de las Américas', municipality: 'Arona, Tenerife' },
};

async function addManualGeocodes() {
  const inputPath = process.argv[2] || 'data/bdns-solar-grants.json';
  const outputPath = process.argv[3] || 'data/bdns-solar-grants-processed.json';

  // Load original grants
  const originalData = JSON.parse(await readFile(inputPath, 'utf-8'));
  const grants = originalData.grants;

  // Load existing processed data if it exists
  let existingProcessed: { grants: any[] } = { grants: [] };
  try {
    existingProcessed = JSON.parse(await readFile(outputPath, 'utf-8'));
  } catch {
    // File doesn't exist, start fresh
  }

  const existingIds = new Set(existingProcessed.grants.map(g => g.codigoConcesion));

  // Process grants with manual geocodes
  let added = 0;
  let updated = 0;

  const newGrants: any[] = [...existingProcessed.grants];

  for (const grant of grants) {
    const manualGeo = MANUAL_GEOCODES[grant.cif];

    if (manualGeo) {
      const grantWithGeo = {
        ...grant,
        latitude: manualGeo.lat,
        longitude: manualGeo.lon,
        address: manualGeo.address,
        municipality: manualGeo.municipality,
        source: 'manual-research',
      };

      if (existingIds.has(grant.codigoConcesion)) {
        // Update existing
        const idx = newGrants.findIndex(g => g.codigoConcesion === grant.codigoConcesion);
        if (idx >= 0 && newGrants[idx].source !== 'osm') {
          newGrants[idx] = grantWithGeo;
          updated++;
        }
      } else {
        // Add new
        newGrants.push(grantWithGeo);
        added++;
      }
    }
  }

  // Count by source
  const bySrc: Record<string, number> = {};
  newGrants.forEach(g => {
    const src = g.source || 'unknown';
    bySrc[src] = (bySrc[src] || 0) + 1;
  });

  const output = {
    processedAt: new Date().toISOString(),
    summary: {
      total: newGrants.length,
      bySource: bySrc,
    },
    grants: newGrants,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n=== Manual Geocoding Complete ===`);
  console.log(`Added: ${added} new grants`);
  console.log(`Updated: ${updated} existing grants`);
  console.log(`Total grants with location: ${newGrants.length}`);
  console.log(`\nBy source:`);
  Object.entries(bySrc).sort((a, b) => b[1] - a[1]).forEach(([src, count]) => {
    console.log(`  ${src}: ${count}`);
  });
}

addManualGeocodes().catch(console.error);
