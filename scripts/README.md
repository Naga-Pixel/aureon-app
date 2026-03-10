# Aureon Scripts

## CAT File Import for Dwelling Counts

The `parse-cat-file.ts` script parses Spanish Catastro CAT (alfanumérico) files to extract dwelling counts per parcel. This data is used as a local cache/fallback for the DNPRC API.

### Prerequisites

1. Download CAT files from [Sede Electrónica del Catastro](https://www.sedecatastro.gob.es/)
   - Go to: Difusión de datos catastrales → Descarga masiva de datos
   - Select province: Las Palmas (35) for Canary Islands
   - Download CAT files for each municipality

2. Run the Supabase migration:
   ```bash
   supabase db push
   ```

### Usage

**Output as JSON:**
```bash
npx ts-node scripts/parse-cat-file.ts path/to/file.CAT
```

**Output as SQL (for direct import):**
```bash
npx ts-node scripts/parse-cat-file.ts path/to/file.CAT --output sql > import.sql
supabase db execute < import.sql
```

### CAT File Format

CAT files are fixed-width text files with record types:
- **Type 11**: Finca (parcel header)
- **Type 13**: Unidad Constructiva (construction unit)
- **Type 14**: Construcción (construction details)
- **Type 15**: Inmueble (cadastral unit - dwellings, garages, etc.)
- **Type 17**: Cultivo (agricultural use)

The script counts Type 15 records per 14-character parcel reference.

### Municipalities for Canary Islands

**Gran Canaria (35):**
- 35016 Las Palmas de Gran Canaria
- 35026 Telde
- 35022 Santa Lucía de Tirajana
- ... (21 municipalities total)

**Fuerteventura (35):**
- 35017 Puerto del Rosario
- 35003 Antigua
- 35014 La Oliva
- 35015 Pájara
- 35007 Betancuria
- 35030 Tuineje

### Data Size Estimates

| Scope | Parcels | DB Size |
|-------|---------|---------|
| Gran Canaria | ~150k | ~35 MB |
| Fuerteventura | ~50k | ~12 MB |
| All Canary Islands | ~500k | ~100 MB |

### Update Frequency

Catastro publishes updated CAT files quarterly. Set up a cron job or manual process to re-import when updates are available.
