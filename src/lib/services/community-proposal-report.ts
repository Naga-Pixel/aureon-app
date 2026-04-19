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
  const barHeight = 18;

  const selfWidth = (selfConsumption / total) * chartWidth;
  const surplusWidth = (surplus / total) * chartWidth;

  // Self-consumption bar (green)
  doc.setFillColor(167, 226, 110); // #a7e26e
  doc.roundedRect(margin, y, selfWidth, barHeight, 3, 3, 'F');

  // Surplus bar (amber)
  doc.setFillColor(251, 191, 36); // amber-400
  doc.roundedRect(margin + selfWidth, y, surplusWidth, barHeight, 3, 3, 'F');

  // Labels inside bars
  doc.setFontSize(8);
  doc.setTextColor(34, 47, 48);

  const selfPercent = Math.round((selfConsumption / total) * 100);
  const surplusPercent = 100 - selfPercent;

  if (selfWidth > 50) {
    doc.text(`Autoconsumo ${selfPercent}%`, margin + 4, y + 11);
  }
  if (surplusWidth > 50) {
    doc.text(`Excedente ${surplusPercent}%`, margin + selfWidth + 4, y + 11);
  }

  // Legend
  y += barHeight + 5;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);

  doc.setFillColor(167, 226, 110);
  doc.rect(margin, y, 6, 6, 'F');
  doc.text(`Autoconsumo: ${selfConsumption.toLocaleString('es-ES')} kWh/año`, margin + 9, y + 5);

  doc.setFillColor(251, 191, 36);
  doc.rect(margin + 90, y, 6, 6, 'F');
  doc.text(`Excedente: ${surplus.toLocaleString('es-ES')} kWh/año`, margin + 99, y + 5);

  return y + 10;
}

export function generateCommunityProposalReport(data: CommunityProposalData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 15;

  // ============ HEADER ============

  doc.setFontSize(20);
  doc.setTextColor(34, 47, 48);
  doc.text('Propuesta Comunidad Energética', pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Lead name
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(data.leadName, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Address
  if (data.address) {
    doc.setFontSize(9);
    const addressLines = doc.splitTextToSize(data.address, pageWidth - 40);
    doc.text(addressLines[0], pageWidth / 2, y, { align: 'center' });
    y += 5;
  }
  y += 5;

  // ============ SOLAR SYSTEM SUMMARY ============
  doc.setFillColor(247, 247, 245); // Light gray background
  doc.roundedRect(15, y, pageWidth - 30, 22, 3, 3, 'F');

  const cols = [
    { label: 'Potencia', value: `${data.systemKwp.toFixed(1)} kWp` },
    { label: 'Paneles', value: `${data.panelCount}` },
    { label: 'Producción', value: `${(data.annualProductionKwh / 1000).toFixed(1)} MWh/año` },
    { label: 'Ahorro', value: `${data.annualSavingsEur.toLocaleString('es-ES')} €/año` },
  ];

  const colWidth = (pageWidth - 30) / cols.length;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  cols.forEach((col, i) => {
    const x = 15 + colWidth * i + colWidth / 2;
    doc.text(col.label, x, y + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(34, 47, 48);
    doc.setFont('helvetica', 'bold');
    doc.text(col.value, x, y + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
  });

  y += 28;

  // ============ ENERGY FLOW SECTION ============
  doc.setFontSize(11);
  doc.setTextColor(34, 47, 48);
  doc.text('Distribución de la Energía', 20, y);
  y += 6;

  y = drawEnergyFlowChart(doc, y, data.selfConsumptionKwh, data.surplusKwh, pageWidth);
  y += 3;

  // ============ HOMES SERVED CALLOUT ============
  if (data.homesServed > 0) {
    doc.setFillColor(237, 233, 254); // Light purple
    doc.roundedRect(15, y, pageWidth - 30, 20, 3, 3, 'F');

    doc.setFontSize(9);
    doc.setTextColor(109, 40, 217); // Purple
    doc.text('Tu excedente puede abastecer a', 25, y + 8);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.homesServed} viviendas`, 25, y + 16);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('(consumo medio: 3.500 kWh/año)', pageWidth - 25, y + 16, { align: 'right' });

    y += 26;
  }

  // ============ COMMUNITY REVENUE ============
  doc.setFontSize(11);
  doc.setTextColor(34, 47, 48);
  doc.text('Ingresos por Comunidad Energética', 20, y);
  y += 6;

  // Revenue highlight box
  doc.setFillColor(255, 251, 235); // Light amber background
  doc.roundedRect(15, y, pageWidth - 30, 24, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setTextColor(120, 80, 0);
  doc.text('Vendiendo tu excedente a la comunidad energética:', 25, y + 9);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 130, 0); // Amber
  doc.text(`${data.communityRevenue.toLocaleString('es-ES')} €/año`, 25, y + 19);
  doc.setFont('helvetica', 'normal');

  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text('@0,11 €/kWh', pageWidth - 25, y + 19, { align: 'right' });

  y += 30;

  // ============ INVESTMENT COMPARISON TABLE ============
  doc.setFontSize(11);
  doc.setTextColor(34, 47, 48);
  doc.text('Inversión y Amortización', 20, y);
  y += 4;

  const incentivePercent = Math.round((1 - data.costWithIncentives / data.installationCost) * 100);

  const costPerKwp = Math.round(data.installationCost / data.systemKwp);

  autoTable(doc, {
    startY: y,
    body: [
      ['Coste por kWp', `${costPerKwp.toLocaleString('es-ES')} €/kWp`, 'Referencia de mercado'],
      ['Coste instalación', `${data.installationCost.toLocaleString('es-ES')} €`, 'Precio base'],
      ['Con subvenciones*', `${data.costWithIncentives.toLocaleString('es-ES')} €`, `-${incentivePercent}% de ayudas`],
      ['Amortización sin ayudas', `${data.paybackYears.toFixed(1)} años`, ''],
      ['Amortización con ayudas', `${data.paybackWithIncentives.toFixed(1)} años`, 'Recuperas tu inversión antes'],
    ],
    theme: 'striped',
    headStyles: { fillColor: [34, 47, 48], fontSize: 8 },
    bodyStyles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 50, textColor: [80, 80, 80] },
      1: { cellWidth: 45, fontStyle: 'bold', halign: 'right', textColor: [34, 47, 48] },
      2: { cellWidth: 'auto', fontSize: 7, textColor: [120, 120, 120], fontStyle: 'italic' },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (cellData) => {
      // Highlight payback with incentives row
      if (cellData.row.index === 4) {
        cellData.cell.styles.fillColor = [240, 253, 244];
        if (cellData.column.index === 1) {
          cellData.cell.styles.textColor = [22, 101, 52];
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4;

  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text('*Subvenciones estimadas: Next Generation EU, IBI, IRPF. Sujeto a disponibilidad y requisitos.', 20, y);
  y += 8;

  // ============ METHODOLOGY ============
  doc.setFontSize(9);
  doc.setTextColor(34, 47, 48);
  doc.text('Metodología y Supuestos', 20, y);
  y += 5;

  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  const methodology = [
    'Producción solar: Basada en irradiación local (PVGIS) y área útil de cubierta (70% del total)',
    'Paneles: 400W por panel, 2m² por panel, degradación 0,5%/año',
    'Autoconsumo: Energía consumida directamente en el edificio • Excedente: Energía vertida a comunidad',
    'Precio comunidad: 0,11 €/kWh • Viviendas: consumo medio 3.500 kWh/año',
    'Subvenciones: ~40% reducción combinando Next Generation EU, IBI y deducción IRPF',
  ];
  for (const line of methodology) {
    doc.text(`• ${line}`, 20, y);
    y += 3.5;
  }
  y += 4;

  // ============ CALL TO ACTION ============
  // Check if we need a new page
  if (y + 30 > pageHeight - 15) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(34, 47, 48);
  doc.roundedRect(15, y, pageWidth - 30, 28, 3, 3, 'F');

  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Siguiente paso:', 25, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Únete a una comunidad energética y maximiza el valor de tus excedentes.', 25, y + 18);
  doc.text('Contáctanos para un estudio personalizado sin compromiso.', 25, y + 25);

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
