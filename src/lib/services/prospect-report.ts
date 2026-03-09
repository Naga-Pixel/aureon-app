// Prospect Report Generator
// Generates PDF reports with confidence scores and limitations

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BuildingResult, AssessmentType } from '@/components/map/types';

export interface ReportMetadata {
  assessmentType: AssessmentType;
  location: {
    centerLat: number;
    centerLon: number;
    areaKm2: number;
  };
  filters: {
    minArea: number;
    businessSegment: string;
    electricityPrice: number;
  };
  generatedAt: Date;
}

export interface ConfidenceAssessment {
  overall: number; // 0-100
  factors: {
    name: string;
    score: number;
    reason: string;
  }[];
  limitations: string[];
  recommendations: string[];
}

// Calculate confidence score based on data quality and methodology
export function calculateConfidence(
  buildings: BuildingResult[],
  metadata: ReportMetadata
): ConfidenceAssessment {
  const factors: ConfidenceAssessment['factors'] = [];
  const limitations: string[] = [];
  const recommendations: string[] = [];

  // 1. Sample size confidence
  const sampleSize = buildings.length;
  let sampleScore: number;
  if (sampleSize >= 50) {
    sampleScore = 90;
  } else if (sampleSize >= 20) {
    sampleScore = 75;
  } else if (sampleSize >= 10) {
    sampleScore = 60;
  } else {
    sampleScore = 40;
    limitations.push('Muestra pequena (<10 edificios) - resultados pueden no ser representativos');
  }
  factors.push({
    name: 'Tamano de muestra',
    score: sampleScore,
    reason: `${sampleSize} edificios analizados`,
  });

  // 2. Data source confidence (Catastro)
  const catastroScore = 75; // Catastro is official but areas can be outdated
  factors.push({
    name: 'Fuente de datos (Catastro)',
    score: catastroScore,
    reason: 'Datos oficiales, pueden estar desactualizados',
  });
  limitations.push('Areas de cubierta basadas en Catastro - pueden diferir de area util real');

  // 3. Solar irradiance confidence (PVGIS)
  const pvgisScore = 85; // PVGIS is reliable for Spain
  factors.push({
    name: 'Irradiacion solar (PVGIS)',
    score: pvgisScore,
    reason: 'Datos satelitales de la UE, alta precision',
  });

  // 4. Consumption estimation confidence
  let consumptionScore: number;
  const segment = metadata.filters.businessSegment;
  if (['commercial', 'office', 'industrial'].includes(segment)) {
    consumptionScore = 55;
    limitations.push('Consumo estimado por m² - sin datos reales de facturas');
    recommendations.push('Solicitar facturas electricas para calculo preciso de ahorro');
  } else if (['apartment_building', 'residential'].includes(segment)) {
    consumptionScore = 50;
    limitations.push('Consumo residencial muy variable segun ocupantes y habitos');
    recommendations.push('Confirmar numero de viviendas y consumo medio con comunidad');
  } else {
    consumptionScore = 45;
    limitations.push('Perfil de consumo generico - precision limitada');
  }
  factors.push({
    name: 'Estimacion de consumo',
    score: consumptionScore,
    reason: `Basado en perfil ${segment}`,
  });

  // 5. Battery/arbitrage confidence
  if (metadata.assessmentType !== 'solar') {
    const batteryScore = 60;
    factors.push({
      name: 'Potencial de bateria',
      score: batteryScore,
      reason: 'Precios PVPC tipicos, sin datos en tiempo real',
    });
    limitations.push('Ahorro por arbitraje basado en precios PVPC historicos tipicos');
    limitations.push('Vulnerabilidad de red es estimacion - no hay datos oficiales de cortes');

    // Grid vulnerability location-specific
    const isCanaryIslands = metadata.location.centerLat < 29 && metadata.location.centerLon < -13;
    if (isCanaryIslands) {
      factors.push({
        name: 'Vulnerabilidad de red',
        score: 80,
        reason: 'Islas Canarias - red aislada bien documentada',
      });
    } else {
      factors.push({
        name: 'Vulnerabilidad de red',
        score: 50,
        reason: 'Peninsula - vulnerabilidad baja, menos relevante',
      });
      recommendations.push('En peninsula, bateria mas util para autoconsumo que para respaldo');
    }
  }

  // 6. Roof orientation (not available from Catastro INSPIRE)
  factors.push({
    name: 'Orientacion de cubierta',
    score: 40,
    reason: 'No disponible en datos Catastro',
  });
  limitations.push('Orientacion de cubierta desconocida - asume condiciones medias');
  recommendations.push('Verificar orientacion con visita tecnica o Google Maps');

  // Calculate weighted overall score
  const weights: Record<string, number> = {
    'Tamano de muestra': 0.10,
    'Fuente de datos (Catastro)': 0.15,
    'Irradiacion solar (PVGIS)': 0.20,
    'Estimacion de consumo': 0.25,
    'Potencial de bateria': 0.15,
    'Vulnerabilidad de red': 0.10,
    'Orientacion de cubierta': 0.05,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const factor of factors) {
    const weight = weights[factor.name] || 0.1;
    weightedSum += factor.score * weight;
    totalWeight += weight;
  }

  const overall = Math.round(weightedSum / totalWeight);

  // Add general recommendations
  recommendations.push('Realizar visita tecnica antes de presupuesto definitivo');
  if (metadata.assessmentType === 'combined') {
    recommendations.push('Dimensionar bateria segun necesidades reales de respaldo');
  }

  return {
    overall,
    factors,
    limitations,
    recommendations,
  };
}

// Get confidence label
export function getConfidenceLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Alta', color: '#16a34a' };
  if (score >= 65) return { label: 'Media-Alta', color: '#65a30d' };
  if (score >= 50) return { label: 'Media', color: '#ca8a04' };
  if (score >= 35) return { label: 'Media-Baja', color: '#ea580c' };
  return { label: 'Baja', color: '#dc2626' };
}

// Generate PDF report
export function generateProspectReport(
  buildings: BuildingResult[],
  metadata: ReportMetadata,
  confidence: ConfidenceAssessment
): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(34, 47, 48); // #222f30
  doc.text('Informe de Prospeccion', pageWidth / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(100);
  const assessmentLabel = {
    solar: 'Solar',
    battery: 'Bateria',
    combined: 'Solar + Bateria',
  }[metadata.assessmentType];
  doc.text(`Evaluacion: ${assessmentLabel}`, pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Summary box
  doc.setFillColor(247, 247, 247);
  doc.roundedRect(15, y, pageWidth - 30, 35, 3, 3, 'F');
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Fecha: ${metadata.generatedAt.toLocaleDateString('es-ES')}`, 20, y);
  doc.text(`Edificios analizados: ${buildings.length}`, 100, y);
  y += 6;
  doc.text(`Segmento: ${metadata.filters.businessSegment}`, 20, y);
  doc.text(`Area minima: ${metadata.filters.minArea} m²`, 100, y);
  y += 6;
  doc.text(`Precio electricidad: ${metadata.filters.electricityPrice.toFixed(2)} EUR/kWh`, 20, y);
  y += 6;
  doc.text(`Coordenadas: ${metadata.location.centerLat.toFixed(4)}, ${metadata.location.centerLon.toFixed(4)}`, 20, y);
  y += 15;

  // Confidence Score Section
  doc.setFontSize(14);
  doc.setTextColor(34, 47, 48);
  doc.text('Nivel de Confianza', 15, y);
  y += 8;

  const confLabel = getConfidenceLabel(confidence.overall);
  doc.setFontSize(24);
  doc.setTextColor(confLabel.color);
  doc.text(`${confidence.overall}%`, 20, y);
  doc.setFontSize(12);
  doc.text(confLabel.label, 45, y);
  y += 12;

  // Confidence factors table
  const factorRows = confidence.factors.map(f => [
    f.name,
    `${f.score}%`,
    f.reason,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Factor', 'Puntuacion', 'Detalle']],
    body: factorRows,
    theme: 'striped',
    headStyles: { fillColor: [34, 47, 48] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 'auto' },
    },
    margin: { left: 15, right: 15 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Limitations Section
  doc.setFontSize(14);
  doc.setTextColor(34, 47, 48);
  doc.text('Limitaciones Conocidas', 15, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(80);
  for (const limitation of confidence.limitations) {
    const lines = doc.splitTextToSize(`• ${limitation}`, pageWidth - 35);
    doc.text(lines, 20, y);
    y += lines.length * 4 + 2;
  }
  y += 5;

  // Recommendations Section
  doc.setFontSize(14);
  doc.setTextColor(34, 47, 48);
  doc.text('Recomendaciones', 15, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(60);
  for (const rec of confidence.recommendations) {
    const lines = doc.splitTextToSize(`✓ ${rec}`, pageWidth - 35);
    doc.text(lines, 20, y);
    y += lines.length * 4 + 2;
  }

  // New page for building results
  doc.addPage();
  y = 20;

  doc.setFontSize(14);
  doc.setTextColor(34, 47, 48);
  doc.text('Edificios Identificados (Top 20)', 15, y);
  y += 10;

  // Buildings table
  const topBuildings = buildings.slice(0, 20);
  const buildingRows = topBuildings.map((b, i) => {
    const row = [
      String(i + 1),
      b.buildingId?.slice(-8) || '-',
      `${b.roofAreaM2?.toFixed(0) || '?'} m²`,
      String(b.score?.toFixed(0) || '-'),
    ];

    if (metadata.assessmentType === 'solar' || metadata.assessmentType === 'combined') {
      row.push(`${b.systemSizeKw?.toFixed(1) || '?'} kW`);
      row.push(`${b.annualProductionKwh?.toLocaleString('es-ES') || '?'} kWh`);
    }

    if (metadata.assessmentType === 'battery' || metadata.assessmentType === 'combined') {
      row.push(`${b.batteryKwh || '?'} kWh`);
      row.push(`${b.gridVulnerability || '?'}%`);
    }

    row.push(`${b.annualSavingsEur?.toLocaleString('es-ES') || '?'} €`);

    return row;
  });

  const headers = ['#', 'Ref.', 'Area'];
  headers.push('Punt.');

  if (metadata.assessmentType === 'solar' || metadata.assessmentType === 'combined') {
    headers.push('Sistema', 'Prod.');
  }
  if (metadata.assessmentType === 'battery' || metadata.assessmentType === 'combined') {
    headers.push('Bateria', 'Vuln.');
  }
  headers.push('Ahorro/año');

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: buildingRows,
    theme: 'striped',
    headStyles: { fillColor: [34, 47, 48], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 20 },
      3: { cellWidth: 15, halign: 'center' },
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Summary statistics
  const avgScore = buildings.reduce((sum, b) => sum + (b.score || 0), 0) / buildings.length;
  const totalSavings = buildings.reduce((sum, b) => sum + (b.annualSavingsEur || 0), 0);
  const highScoreCount = buildings.filter(b => (b.score || 0) >= 70).length;

  doc.setFontSize(12);
  doc.setTextColor(34, 47, 48);
  doc.text('Resumen Estadistico', 15, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Puntuacion media: ${avgScore.toFixed(1)} puntos`, 20, y);
  y += 6;
  doc.text(`Edificios con alta puntuacion (≥70): ${highScoreCount} (${((highScoreCount / buildings.length) * 100).toFixed(0)}%)`, 20, y);
  y += 6;
  doc.text(`Ahorro anual potencial total: ${totalSavings.toLocaleString('es-ES')} €/año`, 20, y);
  y += 15;

  // Footer disclaimer
  doc.setFontSize(8);
  doc.setTextColor(120);
  const disclaimer = 'AVISO: Este informe es una estimacion preliminar basada en datos publicos y modelos estadisticos. ' +
    'Los valores reales pueden variar significativamente. Se recomienda realizar un estudio tecnico detallado ' +
    'antes de tomar decisiones de inversion. Aureon no se hace responsable de decisiones basadas en este informe.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - 30);
  doc.text(disclaimerLines, 15, y);

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Pagina ${i} de ${pageCount}`, pageWidth - 25, doc.internal.pageSize.getHeight() - 10);
    doc.text('Generado por Aureon', 15, doc.internal.pageSize.getHeight() - 10);
  }

  return doc;
}

// Download PDF
export function downloadProspectReport(
  buildings: BuildingResult[],
  metadata: ReportMetadata
): void {
  const confidence = calculateConfidence(buildings, metadata);
  const doc = generateProspectReport(buildings, metadata, confidence);

  const filename = `prospeccion-${metadata.assessmentType}-${metadata.generatedAt.toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
