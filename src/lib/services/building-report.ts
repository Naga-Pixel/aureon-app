// Individual Building Report Generator
// Creates detailed PDF with all data sources and assumptions clearly marked

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BuildingResult, AssessmentType, DataProvenance, GrantCategory } from '@/components/map/types';
import { generateWaterfallSteps, calculateStackedBatteryGrants, type WaterfallStep } from '@/lib/config/incentives/grants-2026';

export interface ApartmentBuildingInput {
  floors: number;
  units: number;
}

export interface BuildingReportMetadata {
  assessmentType: AssessmentType;
  grantCategory?: GrantCategory;
  businessSegment: string;
  electricityPrice: number;
  generatedAt: Date;
  address?: string | null; // Full street address from Nominatim/Catastro
  island?: string; // For location-specific grants (Gran Canaria, Fuerteventura, etc.)
  batteryCostEur?: number; // Battery cost for grant calculations
  apartmentBuilding?: ApartmentBuildingInput; // For apartment buildings with user input
}

// Source badge colors (background, text)
function getSourceColors(source: DataProvenance['source']): { bg: [number, number, number]; text: [number, number, number] } {
  switch (source) {
    case 'api': return { bg: [220, 252, 231], text: [22, 101, 52] }; // Green
    case 'config': return { bg: [219, 234, 254], text: [30, 64, 175] }; // Blue
    case 'estimate': return { bg: [254, 249, 195], text: [161, 98, 7] }; // Yellow
    case 'fallback': return { bg: [254, 226, 226], text: [185, 28, 28] }; // Red
  }
}

function getSourceLabel(source: DataProvenance['source']): string {
  switch (source) {
    case 'api': return 'API';
    case 'config': return 'Config';
    case 'estimate': return 'Estimado';
    case 'fallback': return 'Fallback';
  }
}

// Draw a colored pill badge
function drawSourcePill(doc: jsPDF, text: string, x: number, y: number, source: DataProvenance['source']): void {
  const colors = getSourceColors(source);
  const pillWidth = 18;
  const pillHeight = 5;

  doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
  doc.roundedRect(x - pillWidth / 2, y - pillHeight / 2 - 1, pillWidth, pillHeight, 2, 2, 'F');

  doc.setFontSize(6);
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.text(text, x, y, { align: 'center' });
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'Alta';
  if (confidence >= 60) return 'Media-Alta';
  if (confidence >= 40) return 'Media';
  return 'Baja';
}

// Draw waterfall chart for subsidies
function drawWaterfallChart(
  doc: jsPDF,
  steps: WaterfallStep[],
  startY: number,
  pageWidth: number
): number {
  const chartMargin = 15;
  const chartWidth = pageWidth - chartMargin * 2;
  const rowHeight = 22;
  const rowGap = 2; // Tight leading
  const labelWidth = 90;
  const barMaxWidth = 70;

  // Find max value for scaling bars
  const maxValue = Math.max(...steps.map(s => Math.abs(s.value)));
  const scale = barMaxWidth / maxValue;

  // Helper to parse hex color
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [128, 128, 128];
  };

  let y = startY;

  // Title
  doc.setFontSize(12);
  doc.setTextColor(34, 47, 48);
  doc.text('Desglose de Subvenciones', chartMargin, y);
  y += 10;

  // Draw each step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Label (main)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 47, 48);
    doc.text(step.label, chartMargin, y + 5);

    // Sublabel (organization or detail) - now includes value
    const valueText = step.type === 'subtract'
      ? `-${Math.abs(step.value).toLocaleString('es-ES')} EUR`
      : `${step.value.toLocaleString('es-ES')} EUR`;
    const sublabelText = step.sublabel ? `${step.sublabel} · ${valueText}` : valueText;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(sublabelText, chartMargin, y + 11);

    // Bar - all left-aligned
    const barX = chartMargin + labelWidth;
    const barWidth = Math.abs(step.value) * scale;
    const [r, g, b] = hexToRgb(step.color);
    doc.setFillColor(r, g, b);
    doc.roundedRect(barX, y, Math.max(barWidth, 4), 14, 2, 2, 'F');

    y += rowHeight + rowGap;
  }

  // Summary box with large bold total on right
  const lastStep = steps[steps.length - 1];
  const firstStep = steps[0];
  const totalSavings = firstStep.value - lastStep.value;
  const savingsPercent = Math.round((totalSavings / firstStep.value) * 100);

  y += 4;
  doc.setFillColor(240, 253, 244); // Light green background
  doc.roundedRect(chartMargin, y, chartWidth, 22, 3, 3, 'F');

  // Left side: description
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(34, 47, 48);
  doc.text(`Coste final: ${lastStep.value.toLocaleString('es-ES')} EUR de bolsillo`, chartMargin + 8, y + 14);

  // Right side: large bold total
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52);
  doc.text(
    `${totalSavings.toLocaleString('es-ES')} EUR (${savingsPercent}%)`,
    chartMargin + chartWidth - 8,
    y + 14,
    { align: 'right' }
  );

  // Reset font
  doc.setFont('helvetica', 'normal');

  return y + 30;
}

// Generate individual building report
export function generateBuildingReport(
  building: BuildingResult,
  metadata: BuildingReportMetadata
): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerMargin = 20;
  let y = 20;

  // Helper to check if we need a new page
  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - footerMargin) {
      doc.addPage();
      y = 20;
    }
  };

  const provenance = building.provenance;

  // ============ HEADER ============
  doc.setFontSize(20);
  doc.setTextColor(34, 47, 48);
  doc.text('Informe de Evaluacion', pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Address line (if available)
  if (metadata.address) {
    doc.setFontSize(10);
    doc.setTextColor(60);
    // Truncate if too long
    const maxWidth = pageWidth - 40;
    const addressLines = doc.splitTextToSize(metadata.address, maxWidth);
    doc.text(addressLines[0], pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  // Reference and location line
  doc.setFontSize(9);
  doc.setTextColor(120);
  const locationParts = [building.province, building.municipality].filter(Boolean);
  const locationStr = locationParts.length > 0 ? ` | ${locationParts.join(', ')}` : '';
  doc.text(`Ref: ${building.buildingId || 'Sin ID'}${locationStr}`, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // ============ SCORE BOX ============
  const assessmentLabel = {
    solar: 'Solar',
    battery: 'Bateria',
    combined: 'Solar + Bateria',
  }[metadata.assessmentType];

  // Show the relevant score based on assessment type
  const primaryScore = metadata.assessmentType === 'battery'
    ? building.batteryScore
    : metadata.assessmentType === 'solar'
      ? building.solarScore
      : building.score;

  const secondaryScoreText = metadata.assessmentType === 'combined'
    ? `Solar: ${building.solarScore || '-'} | Bateria: ${building.batteryScore || '-'}`
    : metadata.assessmentType === 'solar'
      ? `Bateria: ${building.batteryScore || '-'}`
      : `Solar: ${building.solarScore || '-'}`;

  doc.setFillColor(34, 47, 48);
  doc.roundedRect(15, y, pageWidth - 30, 22, 3, 3, 'F');

  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text(`${primaryScore?.toFixed(0) || '?'}`, 28, y + 15);
  doc.setFontSize(9);
  doc.text('puntos', 52, y + 15);

  doc.setFontSize(11);
  doc.text(`Evaluacion ${assessmentLabel}`, 85, y + 10);
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  doc.text(secondaryScoreText, 85, y + 17);
  y += 28;

  // ============ SCORE BREAKDOWN ============
  doc.setFontSize(9);
  doc.setTextColor(80);

  if (metadata.assessmentType === 'solar' || metadata.assessmentType === 'combined') {
    const solarBreakdown = [
      `Tamano sistema: 35%`,
      `Produccion: 25%`,
      `Autoconsumo: 20%`,
      `Ahorro: 20%`,
    ];
    doc.text(`Solar (${building.solarScore || '-'} pts): ${solarBreakdown.join(' | ')}`, 15, y);
    y += 5;
  }

  if (metadata.assessmentType === 'battery' || metadata.assessmentType === 'combined') {
    const batteryBreakdown = [
      `Vulnerabilidad red: 30%`,
      `Perfil consumo: 25%`,
      `Arbitraje: 20%`,
      `Sinergia solar: 15%`,
      `Instalacion: 10%`,
    ];
    doc.text(`Bateria (${building.batteryScore || '-'} pts): ${batteryBreakdown.join(' | ')}`, 15, y);
    y += 5;
  }
  y += 3;

  // ============ KEY RESULTS (prominent) ============
  doc.setFontSize(13);
  doc.setTextColor(34, 47, 48);
  doc.text('Resultados', 15, y);
  y += 2;

  // Build results based on assessment type
  const resultsData: { label: string; value: string; highlight?: boolean }[] = [];

  if (metadata.assessmentType === 'solar' || metadata.assessmentType === 'combined') {
    resultsData.push({ label: 'Sistema solar recomendado', value: `${building.systemSizeKw?.toFixed(1) || '?'} kWp` });
    resultsData.push({ label: 'Produccion anual', value: `${building.annualProductionKwh?.toLocaleString('es-ES') || '?'} kWh` });
    resultsData.push({ label: 'Autoconsumo', value: `${((building.selfConsumptionRatio || 0) * 100).toFixed(0)}%` });
  }

  if (metadata.assessmentType === 'battery' || metadata.assessmentType === 'combined') {
    resultsData.push({ label: 'Bateria recomendada', value: `${building.batteryKwh || '?'} kWh` });
    resultsData.push({ label: 'Ahorro por arbitraje', value: `${building.arbitrageSavingsEur?.toLocaleString('es-ES') || '?'} EUR/ano` });
    resultsData.push({ label: 'Proteccion ante cortes', value: `${building.outageProtectionValue?.toLocaleString('es-ES') || '?'} EUR/ano` });
  }

  resultsData.push({ label: 'Ahorro total anual', value: `${building.annualSavingsEur?.toLocaleString('es-ES') || '?'} EUR`, highlight: true });

  autoTable(doc, {
    startY: y,
    body: resultsData.map(r => [r.label, r.value]),
    theme: 'plain',
    styles: { cellPadding: 3 },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 70, textColor: [80, 80, 80] },
      1: { cellWidth: 50, fontStyle: 'bold', halign: 'right', textColor: [34, 47, 48] },
    },
    margin: { left: 15, right: 15, bottom: footerMargin },
    didParseCell: (data) => {
      // Highlight the total row
      if (data.row.index === resultsData.length - 1) {
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.textColor = [22, 101, 52];
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ============ PER-UNIT CALCULATIONS FOR APARTMENT BUILDINGS ============
  const isApartmentBuilding = metadata.businessSegment === 'apartment_building' ||
    (building.numberOfDwellings && building.numberOfDwellings > 1);

  if (isApartmentBuilding && (metadata.assessmentType === 'battery' || metadata.assessmentType === 'combined')) {
    checkPageBreak(60);

    // Use user input if provided, otherwise show note
    if (metadata.apartmentBuilding) {
      const { floors, units } = metadata.apartmentBuilding;

      // Calculate per-unit metrics
      // For residential grants, each unit should have its own ~10kWh battery
      const batteryPerUnit = 10; // Standard residential battery
      const totalBuildingBattery = batteryPerUnit * units;
      const costPerUnit = batteryPerUnit * 900; // ~900 EUR/kWh
      const totalBuildingCost = costPerUnit * units;

      // Calculate grants per unit (residential grants apply per vivienda)
      const grantsResult = metadata.island
        ? calculateStackedBatteryGrants(costPerUnit, batteryPerUnit, metadata.island, metadata.grantCategory || 'residential')
        : null;

      const netCostPerUnit = grantsResult ? grantsResult.netCost : costPerUnit;
      const savingsPerUnit = (building.annualSavingsEur || 0) / units;

      doc.setFontSize(11);
      doc.setTextColor(34, 47, 48);
      doc.text('Calculo por Vivienda', 15, y);
      y += 2;

      const perUnitData = [
        ['Viviendas en edificio', `${units}`, `${floors} plantas`],
        ['Bateria por vivienda', `${batteryPerUnit} kWh`, 'Tamano recomendado'],
        ['Coste por vivienda', `${costPerUnit.toLocaleString('es-ES')} EUR`, 'Antes de subvenciones'],
        ['Subvenciones por vivienda', grantsResult ? `-${grantsResult.totalIncentives.toLocaleString('es-ES')} EUR` : '-', grantsResult ? `${grantsResult.savingsPercentage}% ahorro` : ''],
        ['Coste neto por vivienda', `${netCostPerUnit.toLocaleString('es-ES')} EUR`, 'Despues de subvenciones'],
      ];

      autoTable(doc, {
        startY: y,
        body: perUnitData,
        theme: 'plain',
        styles: { cellPadding: 2, fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 55, textColor: [80, 80, 80] },
          1: { cellWidth: 40, fontStyle: 'bold', halign: 'right', textColor: [34, 47, 48] },
          2: { cellWidth: 50, fontSize: 7, textColor: [120, 120, 120], fontStyle: 'italic' },
        },
        margin: { left: 15, right: 15 },
      });

      y = (doc as any).lastAutoTable.finalY + 4;

      // Summary for whole building
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(15, y, pageWidth - 30, 16, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setTextColor(22, 101, 52);
      doc.text(`Total edificio: ${units} baterias × ${batteryPerUnit} kWh = ${totalBuildingBattery} kWh | Coste neto total: ${(netCostPerUnit * units).toLocaleString('es-ES')} EUR`, 20, y + 10);
      y += 22;

    } else {
      // No user input - show note
      doc.setFillColor(254, 249, 195); // Light yellow
      doc.roundedRect(15, y, pageWidth - 30, 14, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setTextColor(120, 80, 0);
      doc.text('Edificio de viviendas: Para comunidades de vecinos, solicitar estudio personalizado.', 20, y + 9);
      y += 20;
    }
  }

  // ============ SUBSIDY WATERFALL CHART (for battery assessments) ============
  // Debug logging
  console.log('[Waterfall Debug]', {
    assessmentType: metadata.assessmentType,
    batteryKwh: building.batteryKwh,
    island: metadata.island,
    municipality: building.municipality,
    province: building.province,
  });

  if ((metadata.assessmentType === 'battery' || metadata.assessmentType === 'combined') &&
      building.batteryKwh &&
      metadata.island) {
    checkPageBreak(120);

    // Estimate battery cost if not provided
    const batteryCost = metadata.batteryCostEur || (building.batteryKwh * 800); // ~800 EUR/kWh estimate

    const waterfallSteps = generateWaterfallSteps(
      batteryCost,
      building.batteryKwh,
      metadata.island,
      metadata.grantCategory || 'residential'
    );

    if (waterfallSteps.length > 2) { // Only show if there are grants available
      y = drawWaterfallChart(doc, waterfallSteps, y, pageWidth);
      y += 5;
    }
  }

  // ============ BUILDING INFO (compact) ============
  checkPageBreak(25);
  doc.setFontSize(11);
  doc.setTextColor(34, 47, 48);
  doc.text('Datos del Edificio', 15, y);
  y += 5;

  const buildingInfo: string[] = [];
  if (building.roofAreaM2) buildingInfo.push(`${building.roofAreaM2.toFixed(0)} m² cubierta`);
  if (building.numberOfFloors) buildingInfo.push(`${building.numberOfFloors} plantas`);
  if (building.currentUseLabel) buildingInfo.push(building.currentUseLabel);
  if (building.numberOfDwellings) buildingInfo.push(`${building.numberOfDwellings} viviendas`);
  if (building.orientationLabel) buildingInfo.push(`Orientacion ${building.orientationLabel}`);
  if (building.climateZone) buildingInfo.push(`Zona ${building.climateZone}`);

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(buildingInfo.join('  |  '), 15, y);
  y += 10;

  // ============ TECHNICAL DATA TABLE ============
  checkPageBreak(80);
  doc.setFontSize(11);
  doc.setTextColor(34, 47, 48);
  doc.text('Datos Tecnicos y Fuentes', 15, y);
  y += 5;

  type RowData = { params: string[]; source: DataProvenance['source'] };
  const dataRows: RowData[] = [];

  // Roof area
  const roofAreaSource = provenance?.roofArea.source || 'api';
  const roofAreaConf = provenance?.roofArea.confidence || 75;
  dataRows.push({
    params: ['Area cubierta', `${building.roofAreaM2?.toFixed(0) || '?'} m²`, getSourceLabel(roofAreaSource), `${roofAreaConf}%`, provenance?.roofArea.note || 'Catastro INSPIRE'],
    source: roofAreaSource,
  });

  // Floors
  const floorsSource = provenance?.floors?.source || (building.numberOfFloors ? 'api' : 'estimate');
  const floorsConf = provenance?.floors?.confidence || (building.numberOfFloors ? 90 : 40);
  dataRows.push({
    params: ['Plantas', building.numberOfFloors ? `${building.numberOfFloors}` : 'Desconocido', getSourceLabel(floorsSource), `${floorsConf}%`, provenance?.floors?.note || (building.numberOfFloors ? 'Catastro' : 'Asumiendo 1 planta')],
    source: floorsSource,
  });

  // Building type
  const buildingTypeSource = provenance?.buildingType?.source || (building.currentUse ? 'api' : 'config');
  const buildingTypeConf = provenance?.buildingType?.confidence || (building.currentUse ? 85 : 60);
  dataRows.push({
    params: ['Tipo edificio', building.currentUseLabel || metadata.businessSegment || '-', getSourceLabel(buildingTypeSource), `${buildingTypeConf}%`, building.currentUse ? 'Catastro' : 'Seleccion usuario'],
    source: buildingTypeSource,
  });

  // Solar irradiance
  const solarSource = provenance?.solarIrradiance.source || 'api';
  const solarConf = provenance?.solarIrradiance.confidence || 85;
  const kwhPerKwp = building.annualProductionKwh && building.systemSizeKw ? (building.annualProductionKwh / building.systemSizeKw).toFixed(0) : '?';
  dataRows.push({
    params: ['Irradiacion', `${kwhPerKwp} kWh/kWp`, getSourceLabel(solarSource), `${solarConf}%`, provenance?.solarIrradiance.note || 'PVGIS EU'],
    source: solarSource,
  });

  // Consumption
  const consumptionSource = provenance?.consumption.source || 'estimate';
  const consumptionConf = provenance?.consumption.confidence || 50;
  dataRows.push({
    params: ['Consumo anual', `${building.estimatedConsumptionKwh?.toLocaleString('es-ES') || '?'} kWh`, getSourceLabel(consumptionSource), `${consumptionConf}%`, `Perfil ${metadata.businessSegment}`],
    source: consumptionSource,
  });

  // Electricity price
  const priceSource = provenance?.electricityPrice.source || 'fallback';
  const priceConf = provenance?.electricityPrice.confidence || 50;
  dataRows.push({
    params: ['Precio kWh', `${metadata.electricityPrice.toFixed(2)} EUR`, getSourceLabel(priceSource), `${priceConf}%`, priceSource === 'fallback' ? 'Precio por defecto' : 'ESIOS'],
    source: priceSource,
  });

  // Grid vulnerability
  const gridSource = provenance?.gridVulnerability.source || 'estimate';
  const gridConf = provenance?.gridVulnerability.confidence || 85;
  dataRows.push({
    params: ['Vulnerabilidad red', `${building.gridVulnerability || '?'}%`, getSourceLabel(gridSource), `${gridConf}%`, 'Calculado por ubicacion'],
    source: gridSource,
  });

  // Arbitrage (only for battery assessments)
  if (metadata.assessmentType !== 'solar') {
    const arbitrageSource = provenance?.arbitragePrices.source || 'fallback';
    const arbitrageConf = provenance?.arbitragePrices.confidence || 45;
    dataRows.push({
      params: ['Precios arbitraje', 'PVPC horario', getSourceLabel(arbitrageSource), `${arbitrageConf}%`, arbitrageSource === 'api' ? 'ESIOS ultimos 7 dias' : 'Historicos PVPC'],
      source: arbitrageSource,
    });
  }

  const rowSources = dataRows.map(r => r.source);

  autoTable(doc, {
    startY: y,
    head: [['Parametro', 'Valor', 'Fuente', 'Conf.', 'Nota']],
    body: dataRows.map(r => r.params),
    theme: 'striped',
    headStyles: { fillColor: [34, 47, 48], fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 30 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 'auto', textColor: [100, 100, 100] },
    },
    margin: { left: 15, right: 15, bottom: footerMargin },
    willDrawCell: (data) => {
      // Don't draw text in the Fuente column - we'll draw a pill instead
      if (data.column.index === 2 && data.section === 'body') {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if (data.column.index === 2 && data.section === 'body' && data.row.index !== undefined) {
        const source = rowSources[data.row.index];
        const cellX = data.cell.x + data.cell.width / 2;
        const cellY = data.cell.y + data.cell.height / 2 + 1;

        drawSourcePill(doc, getSourceLabel(source), cellX, cellY, source);
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ============ METHODOLOGY (compact) ============
  checkPageBreak(35);
  doc.setFontSize(10);
  doc.setTextColor(34, 47, 48);
  doc.text('Metodologia', 15, y);
  y += 5;

  doc.setFontSize(7);
  doc.setTextColor(100);
  const methodology = [
    'Area util cubierta: 70% del total (equipos, accesos, sombras excluidos)',
    'Paneles: 400W, 2m² por panel | Eficiencia bateria: 90% round-trip',
    'Arbitraje: 260 dias/ano con spread pico/valle significativo',
  ];
  for (const line of methodology) {
    doc.text(line, 15, y);
    y += 3.5;
  }
  y += 5;

  // ============ CONFIDENCE & WARNINGS ============
  if (provenance) {
    checkPageBreak(25);
    const avgConfidence = Math.round(
      (provenance.roofArea.confidence +
        provenance.solarIrradiance.confidence +
        provenance.consumption.confidence +
        provenance.electricityPrice.confidence +
        provenance.gridVulnerability.confidence +
        provenance.arbitragePrices.confidence) / 6
    );

    doc.setFontSize(9);
    doc.setTextColor(34, 47, 48);
    doc.text(`Fiabilidad del informe: ${avgConfidence}% (${getConfidenceLabel(avgConfidence)})`, 15, y);
    y += 6;

    // Warnings
    const warnings: string[] = [];
    if (provenance.solarIrradiance.source === 'fallback') warnings.push('Irradiacion solar basada en medias regionales');
    if (provenance.arbitragePrices.source === 'fallback') warnings.push('Precios de arbitraje basados en historicos');
    if (provenance.electricityPrice.source === 'fallback') warnings.push('Precio electricidad por defecto');
    if (provenance.consumption.confidence < 60) warnings.push('Consumo estimado - solicitar facturas reales');

    if (warnings.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(180, 100, 30);
      doc.text('Notas: ' + warnings.join(' | '), 15, y);
      y += 5;
    }
  }

  // ============ DISCLAIMER ============
  y += 3;
  checkPageBreak(15);
  doc.setFontSize(6);
  doc.setTextColor(140);
  const disclaimer = 'AVISO LEGAL: Estimacion preliminar automatica. Valores "Estimado" o "Fallback" requieren verificacion. Se recomienda visita tecnica antes de invertir.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - 30);
  doc.text(disclaimerLines, 15, y);

  // ============ FOOTER ON ALL PAGES ============
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`${metadata.generatedAt.toLocaleDateString('es-ES')}`, 15, pageHeight - 8);
    doc.text('Aureon', pageWidth - 25, pageHeight - 8);
    if (totalPages > 1) {
      doc.text(`${i}/${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }
  }

  return doc;
}

// Download individual building report
export function downloadBuildingReport(
  building: BuildingResult,
  metadata: BuildingReportMetadata
): void {
  const doc = generateBuildingReport(building, metadata);
  const refId = building.buildingId?.slice(-8) || 'edificio';
  const filename = `informe-${refId}-${metadata.generatedAt.toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
