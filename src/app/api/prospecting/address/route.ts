import { NextRequest, NextResponse } from 'next/server';
import { getAddressFromCadastralReference } from '@/lib/services/catastro-inspire';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const cadastralRef = searchParams.get('ref');
  const coordsParam = searchParams.get('coords'); // JSON array of [lon, lat] pairs

  if (!cadastralRef) {
    return NextResponse.json(
      { error: 'Missing cadastral reference parameter' },
      { status: 400 }
    );
  }

  // Parse coordinates if provided
  let coordinates: [number, number][] | null = null;
  if (coordsParam) {
    try {
      coordinates = JSON.parse(coordsParam);
    } catch {
      // Ignore invalid coordinates, will fall back to Catastro only
    }
  }

  try {
    const address = await getAddressFromCadastralReference(cadastralRef, coordinates);

    if (!address) {
      return NextResponse.json(
        { error: 'Address not found', address: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ address });
  } catch (error) {
    console.error('Error fetching address:', error);
    return NextResponse.json(
      { error: 'Failed to fetch address' },
      { status: 500 }
    );
  }
}
