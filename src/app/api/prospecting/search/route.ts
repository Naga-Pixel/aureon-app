import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBuildingsInBBox, BBoxBounds } from '@/lib/services/catastro-inspire';
import { getPVGISData } from '@/lib/services/pvgis';
import { calculateProspectScore, AssessmentType } from '@/lib/services/prospect-scorer';
import { getESIOSPriceStats, ESIOSPriceStats } from '@/lib/services/esios';

type GrantCategory = 'residential' | 'business';

interface ProspectFilters {
  minArea?: number;
  maxResults?: number;
  grantCategory?: GrantCategory;
  businessSegment?: string;
  electricityPrice?: number;
  assessmentType?: AssessmentType;
}

/**
 * Detect Canary Island from coordinates
 * Returns the island name or undefined if not in Canary Islands
 */
function detectIslandFromCoordinates(lat: number, lon: number): string | undefined {
  // Canary Islands bounding boxes (approximate)
  const islands = [
    { name: 'Gran Canaria', minLat: 27.7, maxLat: 28.2, minLon: -15.85, maxLon: -15.35 },
    { name: 'Fuerteventura', minLat: 28.0, maxLat: 28.75, minLon: -14.55, maxLon: -13.8 },
    { name: 'Lanzarote', minLat: 28.8, maxLat: 29.25, minLon: -13.9, maxLon: -13.4 },
    { name: 'Tenerife', minLat: 27.95, maxLat: 28.6, minLon: -16.95, maxLon: -16.1 },
    { name: 'La Palma', minLat: 28.45, maxLat: 28.85, minLon: -18.0, maxLon: -17.7 },
    { name: 'La Gomera', minLat: 28.0, maxLat: 28.25, minLon: -17.35, maxLon: -17.05 },
    { name: 'El Hierro', minLat: 27.6, maxLat: 27.85, minLon: -18.2, maxLon: -17.85 },
  ];

  for (const island of islands) {
    if (lat >= island.minLat && lat <= island.maxLat &&
        lon >= island.minLon && lon <= island.maxLon) {
      return island.name;
    }
  }

  return undefined;
}

interface SearchRequest {
  bounds: BBoxBounds;
  filters?: ProspectFilters;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { bounds, filters = {} } = body;

    // Validate bounds
    if (!bounds || !bounds.minLat || !bounds.maxLat || !bounds.minLon || !bounds.maxLon) {
      return NextResponse.json(
        { error: 'Se requieren limites de busqueda validos' },
        { status: 400 }
      );
    }

    // Validate bounds are within reasonable range (Spain)
    const areaLatKm = Math.abs(bounds.maxLat - bounds.minLat) * 111;
    const areaLonKm = Math.abs(bounds.maxLon - bounds.minLon) * 111 * Math.cos((bounds.minLat + bounds.maxLat) / 2 * Math.PI / 180);

    if (areaLatKm > 5 || areaLonKm > 5) {
      return NextResponse.json(
        { error: 'El area seleccionada es demasiado grande. Maximo 5km x 5km.' },
        { status: 400 }
      );
    }

    // Skip auth in development when SKIP_AUTH is enabled
    const skipAuth = process.env.SKIP_AUTH === "true";

    if (!skipAuth) {
      // Auth check
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }

      // Verify user is an admin
      const { data: installer } = await (supabase as any)
        .from('installers')
        .select('id, role')
        .eq('user_id', user.id)
        .single();

      if (!installer || installer.role !== 'admin') {
        return NextResponse.json(
          { error: 'Solo los administradores pueden usar la herramienta de prospeccion' },
          { status: 403 }
        );
      }
    }

    // Set default filters
    const minArea = filters.minArea ?? 50;
    const maxResults = Math.min(filters.maxResults ?? 100, 200);
    const grantCategory = filters.grantCategory ?? 'residential';
    const businessSegment = filters.businessSegment ?? (grantCategory === 'residential' ? 'residential' : 'commercial');
    const electricityPrice = filters.electricityPrice ?? 0.20;
    const assessmentType = filters.assessmentType ?? 'solar';

    // Get buildings in area
    const buildingsResult = await getBuildingsInBBox(bounds, maxResults);
    const catastroFailed = buildingsResult.status === 'failed';

    // If Catastro failed, return empty result with service status
    if (catastroFailed) {
      return NextResponse.json({
        buildings: [],
        count: 0,
        totalFound: 0,
        truncated: false,
        assessmentType,
        grantCategory,
        pvgis: { kwhPerKwp: null, optimalAngle: null },
        serviceStatus: {
          catastro: false,
          pvgis: null, // Not checked
          esios: null, // Not checked
        },
      });
    }

    // Get PVGIS for center of area (same for all buildings in small area)
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const pvgis = await getPVGISData(centerLat, centerLon);

    // Detect island from coordinates (for Canary Islands grant eligibility)
    const detectedIsland = detectIslandFromCoordinates(centerLat, centerLon);

    // Track data sources
    const pvgisFailed = pvgis.kwhPerKwp === null;
    const kwhPerKwp = pvgis.kwhPerKwp ?? 1400; // Default for Spain

    // For battery/combined, get ESIOS price statistics
    let priceStats: ESIOSPriceStats | null = null;
    let esiosFailed = false;
    if (assessmentType !== 'solar') {
      try {
        priceStats = await getESIOSPriceStats();
        esiosFailed = priceStats.source === 'fallback';
      } catch (error) {
        console.warn('Could not fetch ESIOS price stats:', error);
        esiosFailed = true;
      }
    }

    // Score each building that meets the minimum area requirement
    const scoredBuildings = buildingsResult.buildings
      .filter(b => b.roofAreaM2 && b.roofAreaM2 >= minArea)
      .map(building => {
        const roofAreaM2 = building.roofAreaM2!;

        const score = calculateProspectScore({
          roofAreaM2,
          kwhPerKwp,
          electricityPrice,
          businessSegment,
          latitude: centerLat,
          longitude: centerLon,
          assessmentType,
          priceStats: priceStats || undefined,
          kwhPerKwpSource: pvgisFailed ? 'fallback' : 'pvgis',
          esiosFailed,
          // Pass Catastro data when available
          catastroFloors: building.numberOfFloors,
          catastroUse: building.currentUse,
          catastroUseLabel: building.currentUseLabel,
          catastroDwellings: building.numberOfDwellings,
        });

        return {
          buildingId: building.buildingId,
          roofAreaM2: building.roofAreaM2,
          orientationDegrees: building.orientationDegrees,
          orientationLabel: building.orientationLabel,
          polygonCoordinates: building.polygonCoordinates,
          // From Catastro INSPIRE
          numberOfFloors: building.numberOfFloors,
          currentUse: building.currentUse,
          currentUseLabel: building.currentUseLabel,
          numberOfDwellings: building.numberOfDwellings,
          buildingNature: building.buildingNature,
          // Address info
          province: building.address?.province || null,
          municipality: building.address?.municipality || null,
          cadastralReference: building.address?.cadastralReference || building.buildingId,
          // Island detection (for Canary Islands grant eligibility)
          island: detectedIsland || null,
          // Scores
          score: score.totalScore,
          solarScore: score.solarScore,
          batteryScore: score.batteryScore,
          systemSizeKw: score.systemSizeKw,
          annualSavingsEur: score.annualSavingsEur,
          annualProductionKwh: score.annualProductionKwh,
          // Battery-specific
          batteryKwh: score.batteryKwh,
          gridVulnerability: score.gridVulnerability,
          arbitragePotential: score.arbitragePotential,
          arbitrageSavingsEur: score.arbitrageSavingsEur,
          // Additional data
          estimatedConsumptionKwh: score.estimatedConsumptionKwh,
          selfConsumptionRatio: score.selfConsumptionRatio,
          outageProtectionValue: score.outageProtectionValue,
          climateZone: score.climateZone,
          // Provenance
          provenance: score.provenance,
          // Price stats for report
          priceStats: priceStats || undefined,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Build service status for UI warnings
    const serviceStatus = {
      catastro: true, // If we got here, catastro worked
      pvgis: !pvgisFailed,
      esios: assessmentType === 'solar' ? null : !esiosFailed, // null = not used
    };

    return NextResponse.json({
      buildings: scoredBuildings,
      count: scoredBuildings.length,
      totalFound: buildingsResult.totalCount,
      truncated: buildingsResult.truncated,
      assessmentType,
      grantCategory,
      pvgis: {
        kwhPerKwp: pvgis.kwhPerKwp,
        optimalAngle: pvgis.optimalAngle,
      },
      serviceStatus,
    });
  } catch (error) {
    console.error('Prospecting search error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
