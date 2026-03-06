import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/services/google-geocoding';
import { getCatastroData } from '@/lib/services/catastro';
import { getPVGISData } from '@/lib/services/pvgis';
import { getBuildingFootprintByCoordinates, getBuildingFootprint } from '@/lib/services/catastro-inspire';

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address || address.length < 5) {
      return NextResponse.json({ error: 'Dirección inválida' }, { status: 400 });
    }

    // Step 1: Geocode
    let geocodeResult;
    try {
      geocodeResult = await geocodeAddress(address);
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Error de geocodificación',
      }, { status: 400 });
    }

    // Step 2: Get Catastro data (for building info like floors, year, use)
    const catastroData = await getCatastroData(geocodeResult.latitude, geocodeResult.longitude);

    // Step 3: Get INSPIRE building footprint (for accurate roof area and orientation)
    let inspireData;
    if (catastroData.status === 'success' && catastroData.cadastralReference) {
      inspireData = await getBuildingFootprint(catastroData.cadastralReference);
    } else {
      inspireData = await getBuildingFootprintByCoordinates(
        geocodeResult.latitude,
        geocodeResult.longitude
      );
    }

    // Step 4: Get PVGIS data
    const pvgisData = await getPVGISData(geocodeResult.latitude, geocodeResult.longitude);

    return NextResponse.json({
      success: true,
      geocode: {
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        formattedAddress: geocodeResult.formattedAddress,
      },
      catastro: catastroData.status === 'success' ? {
        cadastralReference: catastroData.cadastralReference,
        buildingAreaM2: catastroData.buildingAreaM2,
        numberOfFloors: catastroData.numberOfFloors,
        buildingUse: catastroData.buildingUse,
        yearBuilt: catastroData.yearBuilt,
      } : null,
      inspire: inspireData.status === 'success' ? {
        roofAreaM2: inspireData.roofAreaM2,
        orientationDegrees: inspireData.orientationDegrees,
        orientationLabel: inspireData.orientationLabel,
      } : null,
      pvgis: {
        kwhPerKwp: pvgisData.kwhPerKwp,
        optimalAngle: pvgisData.optimalAngle,
        status: pvgisData.status,
      },
    });
  } catch (error) {
    console.error('Check address error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
