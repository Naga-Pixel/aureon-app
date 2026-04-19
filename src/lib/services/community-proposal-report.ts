// Community Energy Proposal Report Generator
// Creates PDF to pitch energy community model to property owners

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Aureon star logo - simplified path points (normalized 0-1)
const LOGO_POINTS = [
  [0.901, 0.171], [1.0, 0.345], [0.616, 0.500], [1.0, 0.652],
  [0.895, 0.831], [0.560, 0.596], [0.604, 1.0], [0.397, 1.0],
  [0.438, 0.596], [0.103, 0.834], [0, 0.653], [0.384, 0.498],
  [0, 0.348], [0.102, 0.169], [0.445, 0.407], [0.401, 0],
  [0.611, 0], [0.564, 0.407]
];

function drawAureonLogo(doc: jsPDF, x: number, y: number, size: number, color: [number, number, number]): void {
  doc.setFillColor(color[0], color[1], color[2]);

  // Scale and translate points
  const points = LOGO_POINTS.map(([px, py]) => [
    x + px * size,
    y + py * size
  ]);

  // Draw as filled polygon
  doc.setDrawColor(color[0], color[1], color[2]);

  // Move to first point
  let path = `${points[0][0]} ${points[0][1]} m `;
  // Line to remaining points
  for (let i = 1; i < points.length; i++) {
    path += `${points[i][0]} ${points[i][1]} l `;
  }
  path += 'h f'; // close and fill

  // Use internal API to draw path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).internal.write(path);
}

export interface CommunityProposalData {
  // Lead info
  leadName: string;
  address?: string;

  // Solar system
  systemKwp: number;
  panelCount: number;
  annualProductionKwh: number;
  annualSavingsEur: number;
  installationCost: number;
  paybackYears: number;

  // Community energy metrics
  selfConsumptionKwh: number;
  surplusKwh: number;
  homesServed: number;
  gridRevenue: number;
  communityRevenue: number;
  extraProfit: number;
  costWithIncentives: number;
  paybackWithIncentives: number;
}

// Draw energy flow visualization
function drawEnergyFlowChart(
  doc: jsPDF,
  y: number,
  selfConsumption: number,
  surplus: number,
  pageWidth: number
): number {
  const margin = 20;
  const chartWidth = pageWidth - margin * 2;
  const total = selfConsumption + surplus;
  const barHeight = 24;

  const selfWidth = (selfConsumption / total) * chartWidth;
  const surplusWidth = (surplus / total) * chartWidth;

  // Self-consumption bar (green)
  doc.setFillColor(167, 226, 110); // #a7e26e
  doc.roundedRect(margin, y, selfWidth, barHeight, 3, 3, 'F');

  // Surplus bar (amber)
  doc.setFillColor(251, 191, 36); // amber-400
  doc.roundedRect(margin + selfWidth, y, surplusWidth, barHeight, 3, 3, 'F');

  // Labels inside bars
  doc.setFontSize(9);
  doc.setTextColor(34, 47, 48);

  const selfPercent = Math.round((selfConsumption / total) * 100);
  const surplusPercent = 100 - selfPercent;

  if (selfWidth > 60) {
    doc.text(`Autoconsumo ${selfPercent}%`, margin + 5, y + 15);
  }
  if (surplusWidth > 60) {
    doc.text(`Excedente ${surplusPercent}%`, margin + selfWidth + 5, y + 15);
  }

  // Legend
  y += barHeight + 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);

  doc.setFillColor(167, 226, 110);
  doc.rect(margin, y, 8, 8, 'F');
  doc.text(`Autoconsumo: ${selfConsumption.toLocaleString('es-ES')} kWh/año`, margin + 12, y + 6);

  doc.setFillColor(251, 191, 36);
  doc.rect(margin + 100, y, 8, 8, 'F');
  doc.text(`Excedente: ${surplus.toLocaleString('es-ES')} kWh/año`, margin + 112, y + 6);

  return y + 15;
}

export function generateCommunityProposalReport(data: CommunityProposalData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;

  // ============ HEADER WITH LOGO ============
  // Draw Aureon logo centered
  const logoSize = 20;
  drawAureonLogo(doc, (pageWidth - logoSize) / 2, y, logoSize, [167, 226, 110]); // Aureon green
  y += logoSize + 8;

  doc.setFontSize(22);
  doc.setTextColor(34, 47, 48);
  doc.text('Propuesta Comunidad Energética', pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Lead name
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(data.leadName, pageWidth / 2, y, { align: 'center' });
  y += 7;

  // Address
  if (data.address) {
    doc.setFontSize(10);
    const addressLines = doc.splitTextToSize(data.address, pageWidth - 40);
    doc.text(addressLines[0], pageWidth / 2, y, { align: 'center' });
    y += 6;
  }
  y += 8;

  // ============ SOLAR SYSTEM SUMMARY ============
  doc.setFillColor(247, 247, 245); // Light gray background
  doc.roundedRect(15, y, pageWidth - 30, 28, 3, 3, 'F');

  const cols = [
    { label: 'Potencia', value: `${data.systemKwp.toFixed(1)} kWp` },
    { label: 'Paneles', value: `${data.panelCount}` },
    { label: 'Producción', value: `${(data.annualProductionKwh / 1000).toFixed(1)} MWh/año` },
    { label: 'Ahorro', value: `${data.annualSavingsEur.toLocaleString('es-ES')} €/año` },
  ];

  const colWidth = (pageWidth - 30) / cols.length;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  cols.forEach((col, i) => {
    const x = 15 + colWidth * i + colWidth / 2;
    doc.text(col.label, x, y + 10, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(34, 47, 48);
    doc.setFont('helvetica', 'bold');
    doc.text(col.value, x, y + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
  });

  y += 38;

  // ============ ENERGY FLOW SECTION ============
  doc.setFontSize(13);
  doc.setTextColor(34, 47, 48);
  doc.text('Distribución de la Energía', 20, y);
  y += 8;

  y = drawEnergyFlowChart(doc, y, data.selfConsumptionKwh, data.surplusKwh, pageWidth);
  y += 5;

  // ============ HOMES SERVED CALLOUT ============
  if (data.homesServed > 0) {
    doc.setFillColor(237, 233, 254); // Light purple
    doc.roundedRect(15, y, pageWidth - 30, 26, 3, 3, 'F');

    doc.setFontSize(11);
    doc.setTextColor(109, 40, 217); // Purple
    doc.text('Tu excedente puede abastecer a', 25, y + 11);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.homesServed} viviendas`, 25, y + 21);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text('(consumo medio: 3.500 kWh/año)', pageWidth - 25, y + 21, { align: 'right' });

    y += 34;
  }

  // ============ COMMUNITY REVENUE ============
  doc.setFontSize(13);
  doc.setTextColor(34, 47, 48);
  doc.text('Ingresos por Comunidad Energética', 20, y);
  y += 8;

  // Revenue highlight box
  doc.setFillColor(255, 251, 235); // Light amber background
  doc.roundedRect(15, y, pageWidth - 30, 32, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setTextColor(120, 80, 0);
  doc.text('Vendiendo tu excedente a la comunidad energética:', 25, y + 12);

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 130, 0); // Amber
  doc.text(`${data.communityRevenue.toLocaleString('es-ES')} €/año`, 25, y + 26);
  doc.setFont('helvetica', 'normal');

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text('@0,11 €/kWh', pageWidth - 25, y + 26, { align: 'right' });

  y += 42;

  // ============ INVESTMENT COMPARISON TABLE ============
  doc.setFontSize(13);
  doc.setTextColor(34, 47, 48);
  doc.text('Inversión y Amortización', 20, y);
  y += 5;

  const incentivePercent = Math.round((1 - data.costWithIncentives / data.installationCost) * 100);

  autoTable(doc, {
    startY: y,
    body: [
      ['Coste instalación', `${data.installationCost.toLocaleString('es-ES')} €`, 'Precio base'],
      ['Con subvenciones*', `${data.costWithIncentives.toLocaleString('es-ES')} €`, `-${incentivePercent}% de ayudas`],
      ['Amortización sin ayudas', `${data.paybackYears.toFixed(1)} años`, ''],
      ['Amortización con ayudas', `${data.paybackWithIncentives.toFixed(1)} años`, 'Recuperas tu inversión antes'],
    ],
    theme: 'striped',
    headStyles: { fillColor: [34, 47, 48], fontSize: 9 },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 55, textColor: [80, 80, 80] },
      1: { cellWidth: 50, fontStyle: 'bold', halign: 'right', textColor: [34, 47, 48] },
      2: { cellWidth: 'auto', fontSize: 8, textColor: [120, 120, 120], fontStyle: 'italic' },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (cellData) => {
      // Highlight payback with incentives row
      if (cellData.row.index === 3) {
        cellData.cell.styles.fillColor = [240, 253, 244];
        if (cellData.column.index === 1) {
          cellData.cell.styles.textColor = [22, 101, 52];
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('*Subvenciones estimadas: Next Generation EU, IBI, IRPF. Sujeto a disponibilidad y requisitos.', 20, y);
  y += 12;

  // ============ METHODOLOGY ============
  doc.setFontSize(11);
  doc.setTextColor(34, 47, 48);
  doc.text('Metodología y Supuestos', 20, y);
  y += 6;

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const methodology = [
    'Producción solar: Basada en irradiación local (PVGIS) y área útil de cubierta (70% del total)',
    'Paneles: 400W por panel, 2m² por panel, degradación 0,5%/año',
    'Autoconsumo: Energía consumida directamente en el edificio',
    'Excedente: Energía sobrante vertida a la comunidad energética',
    'Precio comunidad: 0,11 €/kWh (venta entre miembros de comunidad energética)',
    'Viviendas abastecidas: Consumo medio español 3.500 kWh/año por hogar',
    'Subvenciones: ~40% reducción combinando Next Generation EU, bonificación IBI y deducción IRPF',
  ];
  for (const line of methodology) {
    doc.text(`• ${line}`, 20, y);
    y += 4;
  }
  y += 6;

  // ============ CALL TO ACTION ============
  doc.setFillColor(34, 47, 48);
  doc.roundedRect(15, y, pageWidth - 30, 35, 3, 3, 'F');

  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Siguiente paso:', 25, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Únete a una comunidad energética y maximiza el valor de tus excedentes.', 25, y + 22);
  doc.text('Contáctanos para un estudio personalizado sin compromiso.', 25, y + 30);

  // ============ FOOTER ============
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')}`, 15, pageHeight - 10);
  doc.text('Aureon - Comunidades Energéticas', pageWidth - 15, pageHeight - 10, { align: 'right' });

  return doc;
}

export function downloadCommunityProposalReport(data: CommunityProposalData): void {
  const doc = generateCommunityProposalReport(data);
  const safeName = data.leadName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const filename = `propuesta-comunidad-${safeName}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
