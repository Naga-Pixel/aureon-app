export interface SolarApiResult {
  status: 'success' | 'failed';
  roofAreaM2: number | null;
  maxArrayAreaM2: number | null;
  panelsCount: number | null;
  roofSegmentCount: number | null;
  maxSunshineHoursPerYear: number | null;
  rawResponse: Record<string, unknown> | null;
}

export interface RoofSegmentStats {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats: {
    areaMeters2: number;
    sunshineQuantiles: number[];
  };
}

export async function getSolarData(
  latitude: number,
  longitude: number
): Promise<SolarApiResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${latitude}&location.longitude=${longitude}&requiredQuality=HIGH&key=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      // Solar API may not have data for this location
      if (response.status === 404) {
        return {
          status: 'failed',
          roofAreaM2: null,
          maxArrayAreaM2: null,
          panelsCount: null,
          roofSegmentCount: null,
          maxSunshineHoursPerYear: null,
          rawResponse: null,
        };
      }
      throw new Error(`Solar API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract roof segments data
    const roofSegments = data.solarPotential?.roofSegmentStats || [];
    const totalRoofArea = roofSegments.reduce(
      (sum: number, segment: RoofSegmentStats) => sum + (segment.stats?.areaMeters2 || 0),
      0
    );

    // Get max sunshine hours from the best roof segment
    const maxSunshineHours = roofSegments.reduce((max: number, segment: RoofSegmentStats) => {
      const segmentHours = segment.stats?.sunshineQuantiles?.[10] || 0; // 100th percentile
      return Math.max(max, segmentHours);
    }, 0);

    // Get panel configuration data
    const solarPanelConfigs = data.solarPotential?.solarPanelConfigs || [];
    const maxConfig = solarPanelConfigs[solarPanelConfigs.length - 1];
    const panelsCount = maxConfig?.panelsCount || null;

    // Calculate max array area (usable area for panels)
    const maxArrayArea = data.solarPotential?.maxArrayAreaMeters2 || null;

    return {
      status: 'success',
      roofAreaM2: totalRoofArea || null,
      maxArrayAreaM2: maxArrayArea,
      panelsCount,
      roofSegmentCount: roofSegments.length || null,
      maxSunshineHoursPerYear: maxSunshineHours || null,
      rawResponse: data,
    };
  } catch (error) {
    console.error('Solar API error:', error);
    return {
      status: 'failed',
      roofAreaM2: null,
      maxArrayAreaM2: null,
      panelsCount: null,
      roofSegmentCount: null,
      maxSunshineHoursPerYear: null,
      rawResponse: null,
    };
  }
}
