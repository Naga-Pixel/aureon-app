// Community Energy Proposal Report Generator
// Creates PDF to pitch energy community model to property owners

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

// Draw a horizontal bar chart comparing two values
function drawComparisonBar(
  doc: jsPDF,
  y: number,
  label1: string,
  value1: number,
  color1: [number, number, number],
  label2: string,
  value2: number,
  color2: [number, number, number],
  pageWidth: number
): number {
  const margin = 20;
  const chartWidth = pageWidth - margin * 2;
  const maxValue = Math.max(value1, value2);
  const barHeight = 16;
  const labelWidth = 50;
  const barMaxWidth = chartWidth - labelWidth - 60;

  // Bar 1
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(label1, margin, y + 10);

  const width1 = (value1 / maxValue) * barMaxWidth;
  doc.setFillColor(color1[0], color1[1], color1[2]);
  doc.roundedRect(margin + labelWidth, y, width1, barHeight, 2, 2, 'F');

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`${value1.toLocaleString('es-ES')} EUR/ano`, margin + labelWidth + 5, y + 11);

  y += barHeight + 6;

  // Bar 2
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(label2, margin, y + 10);

  const width2 = (value2 / maxValue) * barMaxWidth;
  doc.setFillColor(color2[0], color2[1], color2[2]);
  doc.roundedRect(margin + labelWidth, y, width2, barHeight, 2, 2, 'F');

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`${value2.toLocaleString('es-ES')} EUR/ano`, margin + labelWidth + 5, y + 11);

  return y + barHeight + 10;
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
  doc.text(`Autoconsumo: ${selfConsumption.toLocaleString('es-ES')} kWh/ano`, margin + 12, y + 6);

  doc.setFillColor(251, 191, 36);
  doc.rect(margin + 100, y, 8, 8, 'F');
  doc.text(`Excedente: ${surplus.toLocaleString('es-ES')} kWh/ano`, margin + 112, y + 6);

  return y + 15;
}

export function generateCommunityProposalReport(data: CommunityProposalData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;

  // ============ HEADER ============
  doc.setFontSize(22);
  doc.setTextColor(34, 47, 48);
  doc.text('Propuesta Comunidad Energetica', pageWidth / 2, y, { align: 'center' });
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
    { label: 'Produccion', value: `${(data.annualProductionKwh / 1000).toFixed(1)} MWh/ano` },
    { label: 'Ahorro', value: `${data.annualSavingsEur.toLocaleString('es-ES')} EUR/ano` },
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
  doc.text('Distribucion de la Energia', 20, y);
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
    doc.text('(consumo medio: 3.500 kWh/ano)', pageWidth - 25, y + 21, { align: 'right' });

    y += 34;
  }

  // ============ REVENUE COMPARISON ============
  doc.setFontSize(13);
  doc.setTextColor(34, 47, 48);
  doc.text('Comparativa de Ingresos por Excedentes', 20, y);
  y += 10;

  y = drawComparisonBar(
    doc, y,
    'Venta a red', data.gridRevenue,
    [156, 163, 175], // Gray
    'Comunidad', data.communityRevenue,
    [251, 191, 36], // Amber
    pageWidth
  );

  // Extra profit highlight
  doc.setFillColor(240, 253, 244); // Light green
  doc.roundedRect(15, y, pageWidth - 30, 22, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setTextColor(34, 47, 48);
  doc.text('Beneficio adicional con comunidad energetica:', 25, y + 10);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52); // Green
  const percentMore = data.gridRevenue > 0 ? Math.round((data.extraProfit / data.gridRevenue) * 100) : 0;
  doc.text(`+${data.extraProfit.toLocaleString('es-ES')} EUR/ano (+${percentMore}%)`, pageWidth - 25, y + 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  y += 32;

  // ============ INVESTMENT COMPARISON TABLE ============
  doc.setFontSize(13);
  doc.setTextColor(34, 47, 48);
  doc.text('Inversion y Amortizacion', 20, y);
  y += 5;

  const incentivePercent = Math.round((1 - data.costWithIncentives / data.installationCost) * 100);

  autoTable(doc, {
    startY: y,
    body: [
      ['Coste instalacion', `${data.installationCost.toLocaleString('es-ES')} EUR`, 'Precio base'],
      ['Con subvenciones*', `${data.costWithIncentives.toLocaleString('es-ES')} EUR`, `-${incentivePercent}% de ayudas`],
      ['Amortizacion sin ayudas', `${data.paybackYears.toFixed(1)} anos`, ''],
      ['Amortizacion con ayudas', `${data.paybackWithIncentives.toFixed(1)} anos`, 'Recuperas tu inversion antes'],
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

  // ============ CALL TO ACTION ============
  doc.setFillColor(34, 47, 48);
  doc.roundedRect(15, y, pageWidth - 30, 35, 3, 3, 'F');

  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Siguiente paso:', 25, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Unete a una comunidad energetica y maximiza el valor de tus excedentes.', 25, y + 22);
  doc.text('Contactanos para un estudio personalizado sin compromiso.', 25, y + 30);

  // ============ FOOTER ============
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')}`, 15, pageHeight - 10);
  doc.text('Aureon - Comunidades Energeticas', pageWidth - 15, pageHeight - 10, { align: 'right' });

  return doc;
}

export function downloadCommunityProposalReport(data: CommunityProposalData): void {
  const doc = generateCommunityProposalReport(data);
  const safeName = data.leadName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const filename = `propuesta-comunidad-${safeName}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
