import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBuildingsInBBox, BBoxBounds } from '@/lib/services/catastro-inspire';
import { getPVGISData } from '@/lib/services/pvgis';
import { calculateProspectScore, calculatePriceVolatility, AssessmentType } from '@/lib/services/prospect-scorer';
import { getESIOSHourlyPrices } from '@/lib/services/esios';

interface ProspectFilters {
  minArea?: number;
  maxResults?: number;
  businessSegment?: string;
  electricityPrice?: number;
  assessmentType?: AssessmentType;
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

    // Set default filters
    const minArea = filters.minArea ?? 50;
    const maxResults = Math.min(filters.maxResults ?? 100, 200);
    const businessSegment = filters.businessSegment ?? 'commercial';
    const electricityPrice = filters.electricityPrice ?? 0.20;
    const assessmentType = filters.assessmentType ?? 'solar';

    // Get buildings in area
    const buildingsResult = await getBuildingsInBBox(bounds, maxResults);

    if (buildingsResult.status === 'failed') {
      return NextResponse.json(
        { error: 'Error al buscar edificios en el area seleccionada' },
        { status: 500 }
      );
    }

    // Get PVGIS for center of area (same for all buildings in small area)
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const pvgis = await getPVGISData(centerLat, centerLon);

    // Track data sources
    const pvgisFailed = pvgis.kwhPerKwp === null;
    const kwhPerKwp = pvgis.kwhPerKwp ?? 1400; // Default for Spain

    // For battery/combined, get ESIOS price volatility
    let priceVolatility = 0;
    let esiosFailed = false;
    if (assessmentType !== 'solar') {
      try {
        const esiosData = await getESIOSHourlyPrices();
        if (esiosData && esiosData.length > 0) {
          priceVolatility = calculatePriceVolatility(esiosData.map(d => d.price));
        } else {
          esiosFailed = true;
        }
      } catch (error) {
        console.warn('Could not fetch ESIOS data for volatility calculation:', error);
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
          priceVolatility,
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
        };
      })
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      buildings: scoredBuildings,
      count: scoredBuildings.length,
      totalFound: buildingsResult.totalCount,
      truncated: buildingsResult.truncated,
      assessmentType,
      pvgis: {
        kwhPerKwp: pvgis.kwhPerKwp,
        optimalAngle: pvgis.optimalAngle,
      },
    });
  } catch (error) {
    console.error('Prospecting search error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
