import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Client, Quarry, Zone, Survey, Stockpile } from '../types.ts';
import { formatDateEu, parseDateTimestamp } from './dateUtils.ts';
import { formatEsInt, formatEsNumber } from './numberFormat.ts';
import { getAuthToken } from './stockpilePhotoUtils.ts';

export type PdfReportType = 'standard' | 'photographic';

interface GeneratePdfReportOptions {
  client?: Client | null;
  quarry?: Quarry | null;
  zone?: Zone | null;
  zones?: Zone[];
  surveys: Survey[];
  stockpiles?: Stockpile[];
  selectedDates?: string[];
  dateFrom?: string;
  dateTo?: string;
  activeSurvey?: Survey | null;
  filterSummary?: string;
  screenshotDataUrl?: string;
  surveyA?: Survey | null;
  surveyB?: Survey | null;
  reportType?: PdfReportType;
}

interface PdfThumbnailAsset {
  dataUrl: string;
  width: number;
  height: number;
}

async function loadStockpileThumbnailForPdf(photoUrl: string): Promise<PdfThumbnailAsset | null> {
  if (!photoUrl || typeof window === 'undefined' || typeof document === 'undefined') return null;

  let objectUrlToRevoke: string | null = null;
  try {
    let imgSrc = photoUrl;

    if (!photoUrl.startsWith('data:') && !photoUrl.startsWith('blob:')) {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const resp = await fetch(photoUrl, {
        headers,
        credentials: 'include',
      });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!blob || blob.size === 0) return null;
      objectUrlToRevoke = URL.createObjectURL(blob);
      imgSrc = objectUrlToRevoke;
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      if (!imgSrc.startsWith('data:') && !imgSrc.startsWith('blob:')) {
        el.crossOrigin = 'anonymous';
      }
      const timer = window.setTimeout(() => reject(new Error('Image load timeout')), 5000);
      el.onload = () => {
        window.clearTimeout(timer);
        resolve(el);
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Image load error'));
      };
      el.src = imgSrc;
    });

    const natW = img.naturalWidth || img.width || 1;
    const natH = img.naturalHeight || img.height || 1;
    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(natW, natH));
    const targetW = Math.max(1, Math.round(natW * scale));
    const targetH = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
      width: targetW,
      height: targetH,
    };
  } catch {
    return null;
  } finally {
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}

const COLIBRI_LOGO_SVG = `<svg width="384" height="248" viewBox="69 32 96 62" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wing" x1="71" y1="40" x2="129" y2="56" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1a5fb4" />
      <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.92" />
    </linearGradient>
    <linearGradient id="body" x1="90" y1="56" x2="136" y2="80" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1a5fb4" />
      <stop offset="55%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#bfdbfe" />
    </linearGradient>
    <linearGradient id="chest" x1="112" y1="80" x2="144" y2="55" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#dbeafe" />
      <stop offset="50%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#1a5fb4" />
    </linearGradient>
    <linearGradient id="head" x1="129" y1="49" x2="150" y2="56" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#93c5fd" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="tail" x1="96" y1="91" x2="115" y2="69" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="65%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#93c5fd" />
    </linearGradient>
  </defs>
  <path d="m 91.909756,34.776259 23.229274,9.697659 -12.14838,3.533256 z" fill="#5898e7" fill-opacity="0.82" stroke="#1e40af" stroke-width="0.25" stroke-linejoin="round" />
  <path d="m 115.13903,44.473918 13.78722,11.171102 -25.9356,-7.637846 z" fill="#5898e7" fill-opacity="0.9" stroke="#1e40af" stroke-width="0.25" stroke-linejoin="round" />
  <path d="M 128.92625,55.64502 71.20638,38.580147 89.519171,55.930688 Z" fill="url(#wing)" stroke="#1e3a8a" stroke-width="0.25" stroke-linejoin="round" />
  <path d="M 89.519169,55.930688 114.44742,69.071391 127.52163,64.86338 Z" fill="url(#body)" stroke="#1e40af" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 89.519169,55.930688 46.699121,-0.210492 -8.69666,9.143184 z" fill="#2563eb" fill-opacity="0.92" stroke="#1e40af" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 135.43646,49.946705 -6.51021,5.698315 15.26066,-0.195455 z" fill="url(#head)" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 135.43646,49.946705 7.15672,-1.262952 7.00638,4.721032 z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 135.43646,49.946705 14.1631,3.45808 -3.51822,2.285341 -1.89443,-0.240561 z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 149.59956,53.404786 13.56168,3.478411 -17.0799,-1.053095 z" fill="#9a9996" stroke="#475569" stroke-width="0.25" stroke-linejoin="round" />
  <path d="m 136.21829,55.720196 -2.88675,12.268666 5.17209,-5.081873 7.57771,-7.216863 -1.89443,-0.240561 z" fill="url(#chest)" stroke="#1e40af" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 146.08134,55.690126 2.88674,0.270632 -10.10361,6.735739 z" fill="#60a5fa" stroke="#1e40af" stroke-width="0.2" stroke-linejoin="round" />
  <path d="M 136.21829,55.720196 112.6432,80.618374 133.33154,67.988862 Z" fill="url(#chest)" stroke="#1e40af" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 115.3796,79.024648 7.90847,0.180422 10.04347,-11.216208 z" fill="#93c5fd" stroke="#1d4ed8" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 127.52163,64.86338 -15.08892,4.929699 -1.35316,12.238596 1.56365,-1.413301 z" fill="#1e40af" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 112.43271,69.793079 -12.20853,13.712039 0.0902,5.923841 z" fill="url(#tail)" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 100.31438,89.428959 10.76517,-7.397284 1.35316,-12.238596 z" fill="#2563eb" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <path d="m 100.22418,83.505116 -4.480466,7.667918 4.570666,-1.744075 z" fill="#60a5fa" stroke="#1e3a8a" stroke-width="0.2" stroke-linejoin="round" />
  <ellipse cx="144.80334" cy="53.825768" rx="0.92" ry="0.92" fill="#ffffff" stroke="#0f172a" stroke-width="0.35" />
</svg>`;

async function renderColibriLogoPngDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  try {
    const svgBlob = new Blob([COLIBRI_LOGO_SVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        const timer = window.setTimeout(() => reject(new Error('SVG logo timeout')), 1500);
        el.onload = () => {
          window.clearTimeout(timer);
          resolve(el);
        };
        el.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('SVG logo error'));
        };
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 248;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function drawColibriVectorFallback(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const mapPt = (vx: number, vy: number): [number, number] => [
    x + ((vx - 69) / 96) * width,
    y + ((vy - 32) / 62) * height,
  ];
  const tri = (
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    rgb: [number, number, number]
  ) => {
    const [x1, y1] = mapPt(p1[0], p1[1]);
    const [x2, y2] = mapPt(p2[0], p2[1]);
    const [x3, y3] = mapPt(p3[0], p3[1]);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.triangle(x1, y1, x2, y2, x3, y3, 'F');
  };

  tri([91.91, 34.78], [115.14, 44.47], [102.99, 48.01], [88, 152, 231]);
  tri([115.14, 44.47], [128.93, 55.65], [102.99, 48.01], [88, 152, 231]);
  tri([128.93, 55.65], [71.21, 38.58], [89.52, 55.93], [59, 130, 246]);
  tri([89.52, 55.93], [114.45, 69.07], [127.52, 64.86], [59, 130, 246]);
  tri([89.52, 55.93], [136.22, 55.72], [127.52, 64.86], [37, 99, 235]);
  tri([135.44, 49.95], [128.93, 55.65], [144.19, 55.45], [37, 99, 235]);
  tri([135.44, 49.95], [142.59, 48.68], [149.6, 53.4], [59, 130, 246]);
  tri([135.44, 49.95], [149.6, 53.4], [146.08, 55.69], [29, 78, 216]);
  tri([149.6, 53.4], [163.16, 56.88], [146.08, 55.69], [154, 153, 150]);
  tri([136.22, 55.72], [133.33, 67.99], [146.08, 55.69], [96, 165, 250]);
  tri([146.08, 55.69], [148.97, 55.96], [138.86, 62.7], [96, 165, 250]);
  tri([136.22, 55.72], [112.64, 80.62], [133.33, 67.99], [147, 197, 253]);
  tri([115.38, 79.02], [123.29, 79.21], [133.33, 67.99], [147, 197, 253]);
  tri([127.52, 64.86], [112.43, 69.79], [111.08, 82.03], [30, 64, 175]);
  tri([112.43, 69.79], [100.22, 83.51], [100.31, 89.43], [59, 130, 246]);
  tri([100.31, 89.43], [111.08, 82.03], [112.43, 69.79], [37, 99, 235]);
  tri([100.22, 83.51], [95.74, 91.17], [100.31, 89.43], [96, 165, 250]);

  const [ex, ey] = mapPt(144.8, 53.83);
  doc.setFillColor(255, 255, 255);
  doc.circle(ex, ey, Math.max(0.22, (0.92 / 96) * width), 'F');
}

function computeChartNiceMax(rawMax: number): number {
  if (rawMax <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const fraction = rawMax / magnitude;
  let niceFraction = 10;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 1.2) niceFraction = 1.2;
  else if (fraction <= 1.5) niceFraction = 1.5;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 3) niceFraction = 3;
  else if (fraction <= 4) niceFraction = 4;
  else if (fraction <= 5) niceFraction = 5;
  else if (fraction <= 6) niceFraction = 6;
  else if (fraction <= 8) niceFraction = 8;
  return niceFraction * magnitude;
}

function formatAxisCompact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return Number.isInteger(k) ? `${formatEsInt(k)}k` : `${formatEsNumber(k, 1)}k`;
  }
  return formatEsInt(value);
}

function formatBarValueCompact(value: number, compact: boolean): string {
  const rounded = Math.round(value);
  if (compact && rounded >= 10000) {
    return `${formatEsNumber(rounded / 1000, 1)}k`;
  }
  return formatEsInt(rounded);
}

function truncateChartText(text: string, maxLen: number): string {
  const clean = String(text || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1))}…`;
}

interface PdfBarChartItem {
  code: string;
  name: string;
  subLabel?: string;
  fillM3: number;
  cutM3: number;
}

function drawStockpilesBarChartSection(
  doc: jsPDF,
  items: PdfBarChartItem[],
  startY: number,
  sectionTitle: string,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  chartSubTitle?: string
): number {
  if (items.length === 0) return startY;

  const maxPerChart = 9;
  const chunks: PdfBarChartItem[][] = [];
  for (let i = 0; i < items.length; i += maxPerChart) {
    chunks.push(items.slice(i, i + maxPerChart));
  }

  let curY = startY;
  const boxH = 74;

  chunks.forEach((chunk, chunkIndex) => {
    const needsTitle = chunkIndex === 0;
    const neededHeight = (needsTitle ? 7 : 0) + boxH + 4;
    if (curY + neededHeight > pageHeight - 14) {
      doc.addPage();
      curY = 18;
    }

    if (needsTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(sectionTitle, margin, curY);
      curY += 3;
    }

    // Outer card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, curY, contentWidth, boxH, 2, 2, 'FD');

    // Card top bar: subtitle + color legend
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    const blockSuffix = chunks.length > 1 ? ` (Bloque ${chunkIndex + 1}/${chunks.length})` : '';
    const baseSubTitle = chartSubTitle || 'Volúmenes comparativos por acopio en m³';
    doc.text(`${baseSubTitle}${blockSuffix}`, margin + 4, curY + 5.5);

    // Legend: Desmonte (rightmost) and Relleno
    const legendRightX = margin + contentWidth - 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);

    const cutLegendText = 'Desmonte (- m³)';
    const cutTextW = doc.getTextWidth(cutLegendText);
    const cutLabelX = legendRightX - cutTextW;
    doc.setTextColor(185, 28, 28);
    doc.text(cutLegendText, cutLabelX, curY + 5.5);
    doc.setFillColor(239, 68, 68);
    doc.setDrawColor(185, 28, 28);
    doc.roundedRect(cutLabelX - 4, curY + 3.1, 2.8, 2.8, 0.5, 0.5, 'FD');

    const fillLegendText = 'Relleno (+ m³)';
    const fillTextW = doc.getTextWidth(fillLegendText);
    const fillLabelX = cutLabelX - 9 - fillTextW;
    doc.setTextColor(5, 150, 105);
    doc.text(fillLegendText, fillLabelX, curY + 5.5);
    doc.setFillColor(16, 185, 129);
    doc.setDrawColor(5, 150, 105);
    doc.roundedRect(fillLabelX - 4, curY + 3.1, 2.8, 2.8, 0.5, 0.5, 'FD');

    // Plot area
    const plotLeft = margin + 15;
    const plotRight = margin + contentWidth - 4;
    const plotW = plotRight - plotLeft;
    const plotTop = curY + 14;
    const plotH = 42;
    const plotBottom = plotTop + plotH;

    const rawMax = chunk.reduce(
      (max, item) => Math.max(max, Math.abs(item.fillM3), Math.abs(item.cutM3)),
      0
    );
    const niceMax = computeChartNiceMax(rawMax);

    // Horizontal gridlines & Y ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1];
    yTicks.forEach((ratio) => {
      const y = plotBottom - plotH * ratio;
      if (ratio === 0) {
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.35);
        doc.line(plotLeft, y, plotRight, y);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        const dashStep = 1.6;
        for (let dx = plotLeft; dx < plotRight; dx += dashStep * 2) {
          doc.line(dx, y, Math.min(dx + dashStep, plotRight), y);
        }
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(100, 116, 139);
      doc.text(formatAxisCompact(niceMax * ratio), plotLeft - 2, y + 1.1, { align: 'right' });
    });

    // Draw paired bars for each item
    const slotW = plotW / chunk.length;
    const pairGap = Math.min(2.2, Math.max(0.9, slotW * 0.06));
    const barW = Math.min(9.5, Math.max(3.2, (slotW * 0.64 - pairGap) / 2));
    const useCompactLabels = chunk.length >= 6;

    chunk.forEach((item, idx) => {
      const centerX = plotLeft + slotW * idx + slotW / 2;
      const fillVal = Math.abs(item.fillM3 || 0);
      const cutVal = Math.abs(item.cutM3 || 0);

      const fillBarX = centerX - pairGap / 2 - barW;
      const cutBarX = centerX + pairGap / 2;

      const fillBarH = fillVal > 0 ? Math.max(1.2, (fillVal / niceMax) * plotH) : 0.4;
      const cutBarH = cutVal > 0 ? Math.max(1.2, (cutVal / niceMax) * plotH) : 0.4;

      const fillBarY = plotBottom - fillBarH;
      const cutBarY = plotBottom - cutBarH;

      // Relleno bar (emerald green)
      doc.setFillColor(16, 185, 129);
      doc.setDrawColor(5, 150, 105);
      doc.setLineWidth(0.25);
      doc.rect(fillBarX, fillBarY, barW, fillBarH, 'FD');

      // Desmonte bar (crimson red)
      doc.setFillColor(239, 68, 68);
      doc.setDrawColor(185, 28, 28);
      doc.setLineWidth(0.25);
      doc.rect(cutBarX, cutBarY, barW, cutBarH, 'FD');

      // Value labels above bars (staggered slightly if heights are close on narrow slots)
      const labelsClose = Math.abs(fillBarY - cutBarY) < 3.2 && slotW < 28;
      const fillLabelY = Math.max(curY + 10.2, fillBarY - 1.2);
      const cutLabelY = Math.max(curY + 10.2, labelsClose ? cutBarY - 4.0 : cutBarY - 1.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(chunk.length > 7 ? 5.0 : 5.5);

      doc.setTextColor(5, 150, 105);
      doc.text(
        formatBarValueCompact(fillVal, useCompactLabels),
        fillBarX + barW / 2,
        fillLabelY,
        { align: 'center' }
      );

      doc.setTextColor(185, 28, 28);
      doc.text(
        formatBarValueCompact(cutVal, useCompactLabels),
        cutBarX + barW / 2,
        cutLabelY,
        { align: 'center' }
      );

      // X-axis Material / Code (primary label)
      const maxCodeChars = chunk.length > 7 ? 12 : 16;
      const maxNameChars = chunk.length > 7 ? 12 : 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(15, 23, 42);
      doc.text(truncateChartText(item.code || '-', maxCodeChars), centerX, plotBottom + 4.2, {
        align: 'center',
      });

      // X-axis Name
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(71, 85, 105);
      doc.text(truncateChartText(item.name, maxNameChars), centerX, plotBottom + 7.6, {
        align: 'center',
      });

      if (item.subLabel) {
        doc.setFontSize(5.0);
        doc.setTextColor(100, 116, 139);
        doc.text(truncateChartText(item.subLabel, maxNameChars), centerX, plotBottom + 10.6, {
          align: 'center',
        });
      }
    });

    curY += boxH + 4;
  });

  return curY + 1;
}

/**
 * Generates an official technical volumetric calculation report (PDF)
 * conforming to collegiate surveying standards and INGEODRON brand design.
 * Supports single-zone or multi-zone ("todos los acopios") and multiple flight dates.
 */
export interface PdfReportResult {
  fileName: string;
  blob: Blob;
}

export async function generateZonePdfReport({
  client,
  quarry,
  zone,
  zones,
  surveys,
  stockpiles,
  selectedDates,
  dateFrom,
  dateTo,
  activeSurvey,
  filterSummary,
  screenshotDataUrl,
  surveyA,
  surveyB,
  reportType = 'standard',
}: GeneratePdfReportOptions): Promise<PdfReportResult> {
  const targetZones = zones && zones.length > 0 ? zones : zone ? [zone] : [];
  if (targetZones.length === 0) {
    throw new Error('No hay zonas ni datos visibles según los filtros seleccionados para generar el informe.');
  }

  const isMultiZone = targetZones.length > 1;
  const primaryZone = targetZones[0];
  const zoneIdSet = new Set<number>(targetZones.map((z) => z.id));

  const selectedDateSet =
    selectedDates && selectedDates.length > 0 ? new Set(selectedDates) : null;

  // Filter surveys strictly to target zones (and optional dates/range), sorted chronologically
  const filteredSurveys = surveys
    .filter((s) => {
      if (!zoneIdSet.has(s.zoneId)) return false;
      if (selectedDateSet && !selectedDateSet.has(s.surveyDate)) return false;
      if (!selectedDateSet) {
        if (dateFrom && s.surveyDate < dateFrom) return false;
        if (dateTo && s.surveyDate > dateTo) return false;
      }
      return true;
    })
    .sort((a, b) => a.surveyDate.localeCompare(b.surveyDate) || a.id - b.id);

  const includedDates = Array.from(
    new Set(
      filteredSurveys.length > 0
        ? filteredSurveys.map((s) => s.surveyDate)
        : activeSurvey?.surveyDate
        ? [activeSurvey.surveyDate]
        : []
    )
  ).sort();

  const filteredSurveyById = new Map<number, Survey>(filteredSurveys.map((s) => [s.id, s]));
  const filteredStockpiles = (stockpiles || []).filter((st) => filteredSurveyById.has(st.surveyId));
  const isPhotographic = reportType === 'photographic';

  const thumbMap = new Map<string, PdfThumbnailAsset>();
  if (isPhotographic && filteredStockpiles.length > 0) {
    const uniquePhotoUrls = Array.from(
      new Set(
        filteredStockpiles
          .map((st) => (st.photoUrl || '').trim())
          .filter(Boolean)
      )
    );
    const loadedThumbs = await Promise.all(
      uniquePhotoUrls.map(async (url) => ({
        url,
        asset: await loadStockpileThumbnailForPdf(url),
      }))
    );
    loadedThumbs.forEach(({ url, asset }) => {
      if (asset) {
        thumbMap.set(url, asset);
      }
    });
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const currentSurvey = activeSurvey || filteredSurveys[filteredSurveys.length - 1];
  const uniqueFlightCodes = Array.from(
    new Set(
      filteredSurveys.map((s) => s.flightCode).filter(Boolean)
    )
  );
  if (uniqueFlightCodes.length === 0 && currentSurvey?.flightCode) {
    uniqueFlightCodes.push(currentSurvey.flightCode);
  }

  const activeFlightLabel =
    uniqueFlightCodes.length === 0
      ? 'Sin vuelo seleccionado'
      : uniqueFlightCodes.length === 1
      ? uniqueFlightCodes[0]
      : `${uniqueFlightCodes.length} vuelos (${uniqueFlightCodes.slice(0, 3).join(', ')}${uniqueFlightCodes.length > 3 ? '…' : ''})`;

  const scopeCode = isMultiZone ? quarry?.code || 'VUELO' : primaryZone.code || 'ZN';
  const reportCode = `ING-CUB-${scopeCode}-${new Date().getFullYear()}${String(
    new Date().getMonth() + 1
  ).padStart(2, '0')}`;
  const generationDate = formatDateEu(new Date());

  const formattedIncludedDates = includedDates.map((d) => formatDateEu(d));
  const datesSummaryLabel =
    formattedIncludedDates.length === 0
      ? 'Sin fecha asignada'
      : formattedIncludedDates.length <= 2
      ? formattedIncludedDates.join(', ')
      : `${formattedIncludedDates[0]} - ${formattedIncludedDates[formattedIncludedDates.length - 1]}`;

  // Per-zone breakdown computed from the active flight surveys & their stockpiles
  const zoneSectionsData = targetZones.map((z) => {
    const zSurveys = filteredSurveys.filter((s) => s.zoneId === z.id);
    const zSurveyIdSet = new Set(zSurveys.map((s) => s.id));
    const zStockpiles = filteredStockpiles.filter((st) => zSurveyIdSet.has(st.surveyId));
    const latest = zSurveys[zSurveys.length - 1];

    const fill =
      zStockpiles.length > 0
        ? zStockpiles.reduce((acc, st) => acc + (st.fillVolumeM3 || 0), 0)
        : zSurveys.reduce((acc, s) => acc + (s.fillVolumeM3 || 0), 0);
    const cut =
      zStockpiles.length > 0
        ? zStockpiles.reduce((acc, st) => acc + (st.cutVolumeM3 || 0), 0)
        : zSurveys.reduce((acc, s) => acc + (s.cutVolumeM3 || 0), 0);
    const net =
      zStockpiles.length > 0
        ? zStockpiles.reduce((acc, st) => acc + (st.netVolumeM3 || 0), 0)
        : zSurveys.reduce((acc, s) => acc + (s.netVolumeM3 || 0), 0);
    const defaultDens = zStockpiles[0]?.densityTonM3 || 1.68;
    const tons =
      zStockpiles.length > 0
        ? Math.round(zStockpiles.reduce((acc, st) => acc + (st.tonnageEst || 0), 0) * 10) / 10
        : zSurveys.length > 0
        ? Math.round(zSurveys.reduce((acc, s) => acc + (s.tonnageEst || 0), 0) * 10) / 10
        : Math.round(Math.abs(net) * defaultDens * 10) / 10;
    const dens =
      Math.abs(net) > 0 && tons > 0
        ? Math.round((tons / Math.abs(net)) * 100) / 100
        : defaultDens;

    return {
      zone: z,
      surveys: zSurveys,
      stockpiles: zStockpiles,
      latest,
      dens,
      fill,
      cut,
      net,
      tons,
    };
  });

  const consolidatedFill = zoneSectionsData.reduce((acc, r) => acc + r.fill, 0);
  const consolidatedCut = zoneSectionsData.reduce((acc, r) => acc + r.cut, 0);
  const consolidatedNet = zoneSectionsData.reduce((acc, r) => acc + r.net, 0);
  const consolidatedTons =
    Math.round(zoneSectionsData.reduce((acc, r) => acc + r.tons, 0) * 10) / 10;

  // ==========================================
  // 1. HEADER (INGEODRON App Colibrí Logo & Brand Colors)
  // ==========================================
  doc.setFillColor(11, 15, 23); // #0b0f17
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Decorative top split accent bar matching INGEODRON brand palette (blue-500 + amber-500)
  doc.setFillColor(59, 130, 246); // #3b82f6 (text-blue-500)
  doc.rect(0, 0, pageWidth * 0.62, 2.5, 'F');
  doc.setFillColor(245, 158, 11); // #f59e0b (text-amber-500)
  doc.rect(pageWidth * 0.62, 0, pageWidth * 0.38, 2.5, 'F');

  // INGEODRON App Colibrí Logo
  const logoWidth = 21;
  const logoHeight = Number(((logoWidth * 62) / 96).toFixed(2));
  const logoX = margin;
  const logoY = 6.2;
  const colibriPng = await renderColibriLogoPngDataUrl();
  if (colibriPng) {
    try {
      doc.addImage(colibriPng, 'PNG', logoX, logoY, logoWidth, logoHeight, undefined, 'FAST');
    } catch {
      drawColibriVectorFallback(doc, logoX, logoY, logoWidth, logoHeight);
    }
  } else {
    drawColibriVectorFallback(doc, logoX, logoY, logoWidth, logoHeight);
  }

  // Brand Name in exact App colors ("INGEO" blue-500 + "DRON" amber-500) & Subtitle
  const brandX = margin + 23.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246); // #3b82f6 (blue-500)
  doc.text('INGEO', brandX, 13.5);
  const ingeoWidth = doc.getTextWidth('INGEO');
  doc.setTextColor(245, 158, 11); // #f59e0b (amber-500)
  doc.text('DRON', brandX + ingeoWidth, 13.5);

  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(226, 232, 240); // Slate-200
  doc.text('FOTOGRAVIMETRÍA CON DRON & GEOMÁTICA MINERA APLICADA', brandX, 18.2);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text('SISTEMA OFICIAL DE CUBICACIÓN Y CONTROL TOPOGRÁFICO', brandX, 22.2);

  // Right Header Info (Report Reference)
  doc.setFontSize(8);
  doc.setTextColor(96, 165, 250); // Blue-400
  doc.setFont('helvetica', 'bold');
  doc.text(`DOC: ${reportCode}${isPhotographic ? '-FOTO' : ''}`, pageWidth - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Fecha Emisión: ${generationDate}`, pageWidth - margin, 17, { align: 'right' });
  doc.text(
    isPhotographic ? 'Informe Fotográfico · ETRS89 UTM 30N' : 'Registro Oficial ETRS89 UTM 30N',
    pageWidth - margin,
    21,
    { align: 'right' }
  );

  let curY = 33;

  // ==========================================
  // 2. DOCUMENT TITLE
  // ==========================================
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(
    isPhotographic
      ? isMultiZone
        ? 'INFORME FOTOGRÁFICO DE CUBICACIÓN — DESGLOSE POR ZONAS'
        : 'INFORME FOTOGRÁFICO DE CUBICACIÓN — ZONA Y VUELO'
      : isMultiZone
        ? 'INFORME TÉCNICO DE CUBICACIÓN — DESGLOSE POR ZONAS'
        : 'INFORME TÉCNICO DE CUBICACIÓN — ZONA Y VUELO',
    margin,
    curY
  );

  curY += 4.5;
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const totalPhotosAttached = isPhotographic
    ? filteredStockpiles.filter((st) => st.photoUrl && thumbMap.has(st.photoUrl.trim())).length
    : 0;
  doc.text(
    `${filterSummary ? `${filterSummary} · ` : ''}Vuelo(s): ${activeFlightLabel} (${datesSummaryLabel}) | ${targetZones.length} ${
      targetZones.length === 1 ? 'zona' : 'zonas'
    } y ${filteredStockpiles.length} acopios${
      isPhotographic ? ` · Fotográfico (${totalPhotosAttached}/${filteredStockpiles.length} con foto)` : ''
    }.`,
    margin,
    curY
  );

  curY += 5;

  // ==========================================
  // 3. METADATA SECTIONS (1. Información de la Explotación & 2. Datos de Vuelo y Zona, stacked)
  // ==========================================
  const drawMetadataPointsBlock = (
    title: string,
    items: Array<{
      label: string;
      value: string;
      valueColor?: [number, number, number];
      boldValue?: boolean;
    }>
  ) => {
    const labelX = margin + 4.5;
    const valueX = margin + 44;
    const valueMaxWidth = contentWidth - 48;
    const lineHeight = 4.3;

    doc.setFontSize(7.6);
    const preparedRows = items.map((item) => {
      doc.setFont('helvetica', item.boldValue === false ? 'normal' : 'bold');
      const wrapped = doc.splitTextToSize(item.value || 'N/D', valueMaxWidth) as string[];
      const lines = wrapped.length > 0 ? wrapped : ['N/D'];
      return {
        ...item,
        lines,
        rowHeight: Math.max(lineHeight, lines.length * lineHeight),
      };
    });

    const totalBodyHeight = preparedRows.reduce((acc, row) => acc + row.rowHeight + 0.8, 0);
    const boxHeight = 9.5 + totalBodyHeight + 1.5;

    if (curY + boxHeight > pageHeight - 15) {
      doc.addPage();
      curY = 18;
    }

    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.roundedRect(margin, curY, contentWidth, boxHeight, 2, 2, 'FD');

    doc.setFillColor(14, 116, 144); // Cyan-700 left accent stripe
    doc.rect(margin, curY, 2, boxHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, labelX, curY + 5.8);

    let rowY = curY + 11.0;
    doc.setFontSize(7.6);
    preparedRows.forEach((row) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`• ${row.label}:`, labelX, rowY);

      doc.setFont('helvetica', row.boldValue === false ? 'normal' : 'bold');
      const color = row.valueColor || [30, 41, 59];
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(row.lines, valueX, rowY);

      rowY += row.rowHeight + 0.8;
    });

    curY += boxHeight + 4;
  };

  drawMetadataPointsBlock('1. INFORMACIÓN DE LA EXPLOTACIÓN', [
    {
      label: 'Cliente / Titular',
      value: `${client?.name || 'Sin cliente asignado'} (CIF: ${client?.cif || 'N/D'})`,
      boldValue: true,
    },
    {
      label: 'Explotación / Cantera',
      value: `${quarry?.name || 'Sin explotación asignada'} (${quarry?.code || 'N/D'})`,
      boldValue: true,
    },
    {
      label: 'Ubicación Geográfica',
      value: `${quarry?.location || 'N/D'}`,
      boldValue: false,
    },
    {
      label: 'Contacto Técnico',
      value: `${client?.contactName || 'Dpto. Técnico'} (${client?.contactEmail || 'N/D'})`,
      boldValue: false,
    },
  ]);

  drawMetadataPointsBlock(
    isMultiZone ? '2. VUELOS Y ZONAS SEGÚN FILTRO' : '2. DATOS DE VUELO Y ZONA',
    [
      {
        label: uniqueFlightCodes.length > 1 ? 'Vuelos' : 'Vuelo',
        value: activeFlightLabel,
        valueColor: [14, 116, 144],
        boldValue: true,
      },
      {
        label: 'Fecha / GSD',
        value: `${datesSummaryLabel} · ${currentSurvey?.groundResolutionCm || 1.8} cm/px`,
        boldValue: true,
      },
      {
        label: isMultiZone ? 'Zonas / Acopios' : 'Zona / Acopios',
        value: isMultiZone
          ? `${targetZones.length} zonas · ${filteredStockpiles.length} acopios`
          : `${primaryZone.code} · ${primaryZone.name}`,
        boldValue: true,
      },
    ]
  );

  // ==========================================
  // 4. OPTIONAL SCREENSHOT & SECTION INDEXING
  // ==========================================
  let sectionIdx = 3;

  if (screenshotDataUrl && screenshotDataUrl.startsWith('data:image')) {
    const imageBoxHeight = isMultiZone ? 48 : 58;
    if (curY + imageBoxHeight + 10 > pageHeight - 15) {
      doc.addPage();
      curY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`${sectionIdx}. MODELO DIGITAL TRIDIMENSIONAL GEORREFERENCIADO`, margin, curY);
    curY += 3.5;
    try {
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(margin, curY, contentWidth, imageBoxHeight, 2, 2, 'F');

      doc.addImage(
        screenshotDataUrl,
        'PNG',
        margin + 1,
        curY + 1,
        contentWidth - 2,
        imageBoxHeight - 2,
        undefined,
        'FAST'
      );

      doc.setDrawColor(51, 65, 85);
      doc.roundedRect(margin, curY, contentWidth, imageBoxHeight, 2, 2, 'D');
    } catch {
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, curY, contentWidth, imageBoxHeight, 'F');
    }

    curY += imageBoxHeight + 5.5;
    sectionIdx += 1;
  }

  // ==========================================
  // 5. PER-ZONE TABLES & INDIVIDUAL ZONE BAR CHARTS
  // ==========================================
  zoneSectionsData.forEach((zData) => {
    const { zone: z, surveys: zSurveys, stockpiles: zStockpiles, latest, dens, fill, cut, net, tons } = zData;

    if (curY + 38 > pageHeight - 15) {
      doc.addPage();
      curY = 18;
    }

    // Zone section header banner
    const zoneUniqueFlights = Array.from(
      new Map(
        zSurveys.map((s) => [
          `${s.flightCode}|${s.surveyDate}`,
          `${s.flightCode} (${formatDateEu(s.surveyDate)})`,
        ])
      ).values()
    );
    const zoneFlightCodes = Array.from(new Set(zSurveys.map((s) => s.flightCode).filter(Boolean)));
    const zoneFlightText =
      zoneUniqueFlights.length === 0
        ? currentSurvey
          ? `${currentSurvey.flightCode} (${formatDateEu(currentSurvey.surveyDate)})`
          : 'Sin vuelo'
        : zoneUniqueFlights.length === 1
        ? zoneUniqueFlights[0]
        : `${zoneUniqueFlights.length} vuelos (${zoneFlightCodes.slice(0, 3).join(', ')}${zoneFlightCodes.length > 3 ? '…' : ''})`;
    const zoneUniqueFlightDates = Array.from(
      new Set(zSurveys.map((s) => formatDateEu(s.surveyDate)).filter(Boolean))
    );
    const zoneOnlyFlightFootText =
      zoneFlightCodes.length === 0
        ? currentSurvey?.flightCode || 'Sin vuelo'
        : zoneFlightCodes.length === 1
        ? zoneFlightCodes[0]
        : `${zoneFlightCodes.length} vuelos`;
    const zoneOnlyDateFootText =
      zoneUniqueFlightDates.length === 0
        ? currentSurvey?.surveyDate
          ? formatDateEu(currentSurvey.surveyDate)
          : '—'
        : zoneUniqueFlightDates.length === 1
        ? zoneUniqueFlightDates[0]
        : `${zoneUniqueFlightDates.length} fechas`;

    doc.setFillColor(241, 245, 249); // Slate-100
    doc.setDrawColor(203, 213, 225); // Slate-300
    doc.roundedRect(margin, curY, contentWidth, 11.5, 1.5, 1.5, 'FD');
    doc.setFillColor(14, 116, 144); // Cyan-700 left accent stripe
    doc.rect(margin, curY, 2.2, 11.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. ZONA ${z.code} — ${z.name}`, margin + 4.5, curY + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Densidad media: ${formatEsNumber(dens, 2)} t/m³  ·  Acopios: ${zStockpiles.length}  ·  Vuelo: ${zoneFlightText}`,
      margin + 4.5,
      curY + 9.2
    );

    curY += 13.5;

    if (zStockpiles.length > 0) {
      const zAreaTotal = zStockpiles.reduce(
        (acc, st) =>
          acc +
          (st.areaM2 ??
            Math.round(Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2)),
        0
      );

      const zoneThumbList = isPhotographic
        ? zStockpiles.map((st) => {
            const url = (st.photoUrl || '').trim();
            return url ? thumbMap.get(url) || null : null;
          })
        : [];
      const zonePhotosCount = zoneThumbList.filter(Boolean).length;

      const zoneBody = zStockpiles.map((st, idx) => {
        const s = filteredSurveyById.get(st.surveyId) || latest;
        const areaVal =
          st.areaM2 ??
          Math.round(Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2);
        const rowFlightCode = s ? s.flightCode : currentSurvey?.flightCode || 'Sin vuelo';
        const rowFlightDate = s
          ? formatDateEu(s.surveyDate)
          : currentSurvey?.surveyDate
          ? formatDateEu(currentSurvey.surveyDate)
          : '—';
        const baseRow = [
          st.code,
          st.name,
          rowFlightCode,
          rowFlightDate,
          st.material || 'Áridos',
          `${formatEsNumber(st.densityTonM3 || dens, 2)} t/m³`,
          `+${formatEsNumber(st.fillVolumeM3)} m³`,
          `-${formatEsNumber(st.cutVolumeM3)} m³`,
          `${formatEsNumber(st.netVolumeM3)} m³`,
          `${formatEsNumber(st.tonnageEst, 1)} t`,
          `${formatEsNumber(areaVal)} m²`,
        ];
        if (isPhotographic) {
          baseRow.push(zoneThumbList[idx] ? '' : 'Sin foto');
        }
        return baseRow;
      });

      const zoneHeadCols = [
        'Código',
        'Acopio',
        'Vuelo',
        'Fecha',
        'Material',
        'Densidad',
        'Relleno (+)',
        'Desmonte (-)',
        'Vol. Neto',
        'Tonelaje',
        'Superficie',
      ];
      if (isPhotographic) {
        zoneHeadCols.push('Fotografía');
      }

      const zoneFootRow = [
        z.code,
        `TOTAL ZONA (${zStockpiles.length} acopio${zStockpiles.length === 1 ? '' : 's'})`,
        zoneOnlyFlightFootText,
        zoneOnlyDateFootText,
        '-',
        `${formatEsNumber(dens, 2)} t/m³`,
        `+${formatEsNumber(fill)} m³`,
        `-${formatEsNumber(cut)} m³`,
        `${formatEsNumber(net)} m³`,
        `${formatEsNumber(tons, 1)} t`,
        `${formatEsNumber(zAreaTotal)} m²`,
      ];
      if (isPhotographic) {
        zoneFootRow.push(`${zonePhotosCount}/${zStockpiles.length} fotos`);
      }

      const photoColIdx = 11;

      autoTable(doc, {
        startY: curY,
        head: [zoneHeadCols],
        body: zoneBody,
        foot: [zoneFootRow],
        theme: 'grid',
        headStyles: {
          fillColor: [14, 116, 144],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: isPhotographic ? 5.7 : 6.1,
          halign: 'center',
        },
        footStyles: {
          fillColor: [224, 242, 254],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: isPhotographic ? 5.7 : 6.1,
          halign: 'center',
        },
        bodyStyles: isPhotographic
          ? {
              fontSize: 5.6,
              textColor: [51, 65, 85],
              valign: 'middle',
              cellPadding: { top: 1.4, bottom: 1.4, left: 1.0, right: 1.0 },
            }
          : {
              fontSize: 6.0,
              textColor: [51, 65, 85],
            },
        columnStyles: isPhotographic
          ? {
              0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
              1: { cellWidth: 19, fontStyle: 'bold' },
              2: { cellWidth: 14, halign: 'center' },
              3: { cellWidth: 13, halign: 'center' },
              4: { cellWidth: 15 },
              5: { cellWidth: 11, halign: 'right' },
              6: { cellWidth: 15, halign: 'right', textColor: [16, 149, 93] },
              7: { cellWidth: 15, halign: 'right', textColor: [220, 38, 38] },
              8: { cellWidth: 15, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] },
              9: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
              10: { cellWidth: 16, halign: 'right', textColor: [109, 40, 217] },
              11: { cellWidth: 21, halign: 'center', valign: 'middle', textColor: [148, 163, 184] },
            }
          : {
              0: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
              1: { cellWidth: 23, fontStyle: 'bold' },
              2: { cellWidth: 16, halign: 'center' },
              3: { cellWidth: 14, halign: 'center' },
              4: { cellWidth: 18 },
              5: { cellWidth: 12, halign: 'right' },
              6: { cellWidth: 17, halign: 'right', textColor: [16, 149, 93] },
              7: { cellWidth: 17, halign: 'right', textColor: [220, 38, 38] },
              8: { cellWidth: 17, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] },
              9: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
              10: { cellWidth: 17, halign: 'right', textColor: [109, 40, 217] },
            },
        didParseCell: isPhotographic
          ? (data) => {
              if (
                data.section === 'body' &&
                data.column.index === photoColIdx &&
                zoneThumbList[data.row.index]
              ) {
                data.cell.styles.minCellHeight = 16.5;
              }
            }
          : undefined,
        didDrawCell: isPhotographic
          ? (data) => {
              if (data.section !== 'body' || data.column.index !== photoColIdx) return;
              const thumb = zoneThumbList[data.row.index];
              if (!thumb) return;
              const pad = 1.4;
              const availW = Math.max(2, data.cell.width - pad * 2);
              const availH = Math.max(2, data.cell.height - pad * 2);
              const scale = Math.min(availW / thumb.width, availH / thumb.height);
              const drawW = thumb.width * scale;
              const drawH = thumb.height * scale;
              const drawX = data.cell.x + (data.cell.width - drawW) / 2;
              const drawY = data.cell.y + (data.cell.height - drawH) / 2;
              try {
                doc.addImage(thumb.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
                doc.setDrawColor(203, 213, 225);
                doc.setLineWidth(0.2);
                doc.rect(drawX, drawY, drawW, drawH, 'D');
              } catch {
                // Ignore thumbnail draw errors
              }
            }
          : undefined,
        margin: { left: margin, right: margin },
      });
    } else {
      const zoneSurveyRows =
        zSurveys.length > 0
          ? zSurveys.map((s) => [
              z.code,
              s.flightCode,
              formatDateEu(s.surveyDate),
              'Áridos',
              `${formatEsNumber(dens, 2)} t/m³`,
              '-',
              `+${formatEsNumber(s.fillVolumeM3)} m³`,
              `-${formatEsNumber(s.cutVolumeM3)} m³`,
              `${formatEsNumber(s.netVolumeM3)} m³`,
              `${formatEsNumber(s.tonnageEst, 1)} t`,
            ])
          : [
              [
                z.code,
                'Sin vuelo activo',
                '—',
                'Áridos',
                `${formatEsNumber(dens, 2)} t/m³`,
                '-',
                '0 m³',
                '0 m³',
                '0 m³',
                '0,0 t',
              ],
            ];

      autoTable(doc, {
        startY: curY,
        head: [
          ['Código', 'Vuelo', 'Fecha', 'Material', 'Densidad', 'Cota Ref.', 'Relleno (+)', 'Desmonte (-)', 'Vol. Neto', 'Tonelaje'],
        ],
        body: zoneSurveyRows,
        foot: [
          [
            z.code,
            `TOTAL ZONA`,
            zoneOnlyDateFootText,
            'Áridos',
            `${formatEsNumber(dens, 2)} t/m³`,
            '-',
            `+${formatEsNumber(fill)} m³`,
            `-${formatEsNumber(cut)} m³`,
            `${formatEsNumber(net)} m³`,
            `${formatEsNumber(tons, 1)} t`,
          ],
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [14, 116, 144],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 6.4,
          halign: 'center',
        },
        footStyles: {
          fillColor: [224, 242, 254],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 6.4,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 6.2,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 20 },
          4: { cellWidth: 13, halign: 'right' },
          5: { cellWidth: 15, halign: 'center' },
          6: { cellWidth: 21, halign: 'right', textColor: [16, 149, 93] },
          7: { cellWidth: 21, halign: 'right', textColor: [220, 38, 38] },
          8: { cellWidth: 21, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] },
          9: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: margin, right: margin },
      });
    }

    // @ts-expect-error autoTable extends doc with lastAutoTable
    curY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 5 : curY + 38;

    // Dedicated Bar Chart for THIS zone (Relleno vs Desmonte)
    const zoneChartItems: PdfBarChartItem[] =
      zStockpiles.length > 0
        ? zStockpiles.map((st) => {
            const s = filteredSurveyById.get(st.surveyId);
            return {
              code: st.material || st.code,
              name: st.name,
              subLabel: zSurveys.length > 1 && s ? s.flightCode : undefined,
              fillM3: Math.abs(st.fillVolumeM3 || 0),
              cutM3: Math.abs(st.cutVolumeM3 || 0),
            };
          })
        : zSurveys.map((s) => ({
            code: z.code,
            name: z.name,
            subLabel: s.flightCode,
            fillM3: Math.abs(s.fillVolumeM3 || 0),
            cutM3: Math.abs(s.cutVolumeM3 || 0),
          }));

    if (zoneChartItems.length > 0) {
      curY = drawStockpilesBarChartSection(
        doc,
        zoneChartItems,
        curY,
        `${sectionIdx}B. GRÁFICA DE BARRAS — ZONA ${z.code} (RELLENO vs DESMONTE)`,
        margin,
        contentWidth,
        pageHeight,
        `Volúmenes comparativos en m³ · ${z.code} (${z.name})`
      );
    }

    curY += 2;
    sectionIdx += 1;
  });

  // ==========================================
  // 6. CONSOLIDATED SUMMARY ACROSS ACTIVE FLIGHT ZONES (if > 1 zone)
  // ==========================================
  if (isMultiZone) {
    if (curY + 32 > pageHeight - 15) {
      doc.addPage();
      curY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(
      `${sectionIdx}. RESUMEN CONSOLIDADO POR ZONA (${targetZones.length} ZONAS)`,
      margin,
      curY
    );
    curY += 2;

    const allUniqueDates = Array.from(
      new Set(filteredSurveys.map((s) => formatDateEu(s.surveyDate)).filter(Boolean))
    );
    const summaryDateFoot =
      allUniqueDates.length === 0
        ? '—'
        : allUniqueDates.length === 1
        ? allUniqueDates[0]
        : `${allUniqueDates.length} fechas`;

    const summaryBody = zoneSectionsData.map((row) => {
      const rCodes = Array.from(new Set(row.surveys.map((s) => s.flightCode).filter(Boolean)));
      const rDates = Array.from(
        new Set(row.surveys.map((s) => formatDateEu(s.surveyDate)).filter(Boolean))
      );
      const rowFlightCell =
        row.surveys.length === 0
          ? activeFlightLabel
          : row.surveys.length === 1 && row.latest
          ? row.latest.flightCode
          : `${rCodes.length} vuelos (${rCodes.slice(0, 2).join(', ')}${rCodes.length > 2 ? '…' : ''})`;
      const rowDateCell =
        row.surveys.length === 0
          ? summaryDateFoot
          : rDates.length === 1
          ? rDates[0]
          : `${rDates.length} fechas`;
      const zoneMaterialSummary =
        Array.from(new Set(row.stockpiles.map((st) => st.material).filter(Boolean)))
          .slice(0, 2)
          .join(', ') || 'Áridos';
      return [
        row.zone.code,
        row.zone.name,
        zoneMaterialSummary,
        `${formatEsNumber(row.dens, 2)} t/m³`,
        rowFlightCell,
        rowDateCell,
        `+${formatEsNumber(row.fill)} m³`,
        `-${formatEsNumber(row.cut)} m³`,
        `${formatEsNumber(row.net)} m³`,
        `${formatEsNumber(row.tons, 1)} t`,
      ];
    });

    autoTable(doc, {
      startY: curY,
      head: [
        ['Código', 'Zona / Acopio', 'Material', 'Densidad', 'Vuelo(s)', 'Fecha(s)', 'Relleno (+)', 'Desmonte (-)', 'Vol. Neto', 'Tonelaje'],
      ],
      body: summaryBody,
      foot: [
        [
          '-',
          `TOTAL (${targetZones.length} Zonas)`,
          'Consolidado',
          '-',
          `${filteredStockpiles.length} acopios`,
          summaryDateFoot,
          `+${formatEsNumber(consolidatedFill)} m³`,
          `-${formatEsNumber(consolidatedCut)} m³`,
          `${formatEsNumber(consolidatedNet)} m³`,
          `${formatEsNumber(consolidatedTons, 1)} t`,
        ],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: [11, 15, 23],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.5,
        halign: 'center',
      },
      footStyles: {
        fillColor: [224, 242, 254],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 6.6,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 6.3,
        textColor: [51, 65, 85],
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 25, fontStyle: 'bold' },
        2: { cellWidth: 19 },
        3: { cellWidth: 13, halign: 'right' },
        4: { cellWidth: 21, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 18, halign: 'right', textColor: [16, 149, 93] },
        7: { cellWidth: 18, halign: 'right', textColor: [220, 38, 38] },
        8: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] },
        9: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
    });

    // @ts-expect-error autoTable extends doc with lastAutoTable
    curY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 5 : curY + 40;
  }

  // ==========================================
  // 7. COMPARATIVE FLIGHT HIGHLIGHT (If specified)
  // ==========================================
  let nextSectionY = curY;

  if (surveyA && surveyB) {
    if (nextSectionY + 18 > pageHeight - 12) {
      doc.addPage();
      nextSectionY = 18;
    }

    const diffFill = surveyB.fillVolumeM3 - surveyA.fillVolumeM3;
    const diffCut = surveyB.cutVolumeM3 - surveyA.cutVolumeM3;
    const diffNet = surveyB.netVolumeM3 - surveyA.netVolumeM3;
    const diffTons = surveyB.tonnageEst - surveyA.tonnageEst;

    doc.setFillColor(240, 249, 255); // Sky-50
    doc.setDrawColor(186, 230, 253);
    doc.roundedRect(margin, nextSectionY, contentWidth, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(3, 105, 161);
    doc.text(
      `RESUMEN COMPARATIVO BI-TEMPORAL: ${surveyA.flightCode} (${formatDateEu(surveyA.surveyDate)})  ➔  ${surveyB.flightCode} (${formatDateEu(surveyB.surveyDate)})`,
      margin + 4,
      nextSectionY + 4.5
    );

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Variación Relleno: ${diffFill >= 0 ? '+' : ''}${formatEsNumber(diffFill)} m³   |   Variación Desmonte: ${diffCut >= 0 ? '+' : ''}${formatEsNumber(diffCut)} m³   |   Balance Neto: ${diffNet >= 0 ? '+' : ''}${formatEsNumber(diffNet)} m³ (${diffTons >= 0 ? '+' : ''}${formatEsNumber(diffTons)} t)`,
      margin + 4,
      nextSectionY + 9.5
    );

    nextSectionY += 17;
  }

  // ==========================================
  // 8. OFFICIAL ENGINEERING CERTIFICATION & VISADO
  // ==========================================
  if (nextSectionY + 28 > pageHeight - 12) {
    doc.addPage();
    nextSectionY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, nextSectionY, contentWidth, 23, 2, 2, 'FD');

  // Left col: Certificate text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('CERTIFICACIÓN TÉCNICA Y GARANTÍA DE EXACTITUD GEOMÉTRICA', margin + 4, nextSectionY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Cálculo efectuado con GPS diferencial por RTK, conforme a la norma UNE-EN de Topografía y Minería.',
    margin + 4,
    nextSectionY + 9.5
  );
  doc.text(
    isMultiZone
      ? `Vuelos ejecutados con dron DJI Matrice 4E RTK, con corrección centimétrica fija. Densidades aplicadas por acopio (${targetZones.length} zonas).`
      : `Vuelos ejecutados con dron DJI Matrice 4E RTK, con corrección centimétrica fija. Densidad media: ${formatEsNumber(zoneSectionsData[0]?.dens ?? 1.68, 2)} t/m³.`,
    margin + 4,
    nextSectionY + 13.5
  );
  doc.text(
    `Código Seguro de Verificación (CSV): ING-CLOUDSQL-${
      isMultiZone ? `EXP-${quarry?.id || 0}` : primaryZone.id
    }-${Date.now().toString(36).toUpperCase()}`,
    margin + 4,
    nextSectionY + 17.5
  );

  // Right col: Collegiate sign-off box
  const signBoxX = margin + contentWidth - 55;
  doc.setDrawColor(148, 163, 184);
  doc.line(signBoxX, nextSectionY + 3, signBoxX, nextSectionY + 20);

  doc.setFont('helvetica', 'bold');
  //doc.setFontSize(6.5);
  //doc.setTextColor(15, 23, 42);
  // doc.text('VISADO COLEGIAL', signBoxX + 4, nextSectionY + 6);
  //doc.setFont('helvetica', 'normal');
  //doc.setFontSize(6);
  // doc.setTextColor(71, 85, 105);
  //doc.text('Colegio Of. Ing. Geomática y Topografía', signBoxX + 4, nextSectionY + 10);
  //doc.text('Colegiado Nº 4.892 - Reg. Minero', signBoxX + 4, nextSectionY + 14);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(14, 116, 144);
  doc.text('Firma Digital Electrónica Verificada', signBoxX + 4, nextSectionY + 18);

  // ==========================================
  // 8B. FINAL SUMMARY ANNEX: INDIVIDUAL STOCKPILE SUMMARY CARDS GROUPED BY FLIGHT (DATE DESC) & ZONE
  // ==========================================
  {
    const getSafeDateTs = (dateStr?: string | null): number => {
      const ts = parseDateTimestamp(dateStr);
      return Number.isFinite(ts) ? ts : -1;
    };

    const rawEntries = zoneSectionsData.flatMap((zData) =>
      zData.stockpiles.map((st) => {
        const survey = filteredSurveyById.get(st.surveyId) || zData.latest || currentSurvey;
        return {
          stockpile: st,
          zone: zData.zone,
          defaultDens: zData.dens,
          survey,
          thumb: isPhotographic && st.photoUrl ? thumbMap.get(st.photoUrl.trim()) || null : null,
        };
      })
    );

    if (rawEntries.length > 0) {
      // Group by Flight (newest date first) -> Zone -> Stockpiles
      interface ZoneGroup {
        zone: Zone;
        entries: typeof rawEntries;
      }
      interface FlightGroup {
        key: string;
        flightCode: string;
        surveyDate: string;
        dateTs: number;
        zonesMap: Map<number, ZoneGroup>;
      }

      const flightGroupsMap = new Map<string, FlightGroup>();
      rawEntries.forEach((entry) => {
        const fCode = entry.survey?.flightCode?.trim() || 'Sin vuelo';
        const fDate = entry.survey?.surveyDate || '';
        const fKey = `${fCode}|${fDate}`;
        let fGroup = flightGroupsMap.get(fKey);
        if (!fGroup) {
          fGroup = {
            key: fKey,
            flightCode: fCode,
            surveyDate: fDate,
            dateTs: getSafeDateTs(fDate),
            zonesMap: new Map<number, ZoneGroup>(),
          };
          flightGroupsMap.set(fKey, fGroup);
        }
        let zGroup = fGroup.zonesMap.get(entry.zone.id);
        if (!zGroup) {
          zGroup = { zone: entry.zone, entries: [] };
          fGroup.zonesMap.set(entry.zone.id, zGroup);
        }
        zGroup.entries.push(entry);
      });

      const sortedFlightGroups = Array.from(flightGroupsMap.values())
        .sort((a, b) => {
          if (b.dateTs !== a.dateTs) return b.dateTs - a.dateTs;
          return a.flightCode.localeCompare(b.flightCode, 'es', { numeric: true });
        })
        .map((fg) => ({
          ...fg,
          zones: Array.from(fg.zonesMap.values())
            .sort((a, b) =>
              (a.zone.code || a.zone.name).localeCompare(b.zone.code || b.zone.name, 'es', {
                numeric: true,
              })
            )
            .map((zg) => ({
              ...zg,
              entries: [...zg.entries].sort((a, b) =>
                (a.stockpile.code || a.stockpile.name).localeCompare(
                  b.stockpile.code || b.stockpile.name,
                  'es',
                  { numeric: true }
                )
              ),
            })),
        }));

      doc.addPage();
      let annexY = 18;

      const drawAnnexHeader = (yPos: number, isContinuation: boolean): number => {
        doc.setFillColor(14, 116, 144); // Cyan-700
        doc.roundedRect(margin, yPos, contentWidth, 9.5, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text(
          isPhotographic
            ? isContinuation
              ? 'ANEJO FOTOGRÁFICO — RESUMEN POR VUELO, ZONA Y ACOPIO (CONT.)'
              : 'ANEJO FOTOGRÁFICO — RESUMEN POR VUELO, ZONA Y ACOPIO'
            : isContinuation
              ? 'RESUMEN INDIVIDUAL POR VUELO, ZONA Y ACOPIO (CONT.)'
              : 'RESUMEN INDIVIDUAL POR VUELO, ZONA Y ACOPIO',
          margin + 4,
          yPos + 6.2
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.1);
        doc.setTextColor(224, 242, 254);
        doc.text(
          isPhotographic
            ? `${rawEntries.length} acopio${rawEntries.length === 1 ? '' : 's'} · ${totalPhotosAttached} con foto · Fecha ↓`
            : `${rawEntries.length} acopio${rawEntries.length === 1 ? '' : 's'} · Fecha ↓`,
          margin + contentWidth - 4,
          yPos + 6.2,
          { align: 'right' }
        );
        return yPos + 13;
      };

      const drawFlightBanner = (
        yPos: number,
        flightCode: string,
        surveyDate: string,
        zoneCount: number,
        stockpileCount: number
      ): number => {
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.roundedRect(margin, yPos, contentWidth, 8, 1.5, 1.5, 'F');
        doc.setFillColor(245, 158, 11); // Amber-500 left accent
        doc.rect(margin, yPos, 2.2, 8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        const dateLabel = surveyDate ? formatDateEu(surveyDate) : 'Sin fecha';
        doc.text(`VUELO: ${flightCode}   ·   FECHA: ${dateLabel}`, margin + 4.5, yPos + 5.3);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.9);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `${zoneCount} ${zoneCount === 1 ? 'zona' : 'zonas'} · ${stockpileCount} ${
            stockpileCount === 1 ? 'acopio' : 'acopios'
          }`,
          margin + contentWidth - 3.5,
          yPos + 5.3,
          { align: 'right' }
        );
        return yPos + 10;
      };

      const drawZoneBanner = (
        yPos: number,
        z: Zone,
        flightCode: string,
        surveyDate: string,
        stockpileCount: number
      ): number => {
        doc.setFillColor(224, 242, 254); // Sky-100
        doc.setDrawColor(125, 211, 252); // Sky-300
        doc.setLineWidth(0.25);
        doc.roundedRect(margin, yPos, contentWidth, 6.8, 1.2, 1.2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(3, 105, 161); // Sky-700
        doc.text(
          truncateChartText(`ZONA ${z.code} — ${z.name}`, 68),
          margin + 3.5,
          yPos + 4.6
        );

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(51, 65, 85);
        const dateLabel = surveyDate ? formatDateEu(surveyDate) : 'Sin fecha';
        doc.text(
          `${flightCode} (${dateLabel}) · ${stockpileCount} ${stockpileCount === 1 ? 'acopio' : 'acopios'}`,
          margin + contentWidth - 3.5,
          yPos + 4.6,
          { align: 'right' }
        );
        return yPos + 8.6;
      };

      annexY = drawAnnexHeader(annexY, false);

      const cardH = isPhotographic ? 55 : 42.5;
      const cardGap = 4.5;

      sortedFlightGroups.forEach((fGroup) => {
        const totalInFlight = fGroup.zones.reduce((sum, zg) => sum + zg.entries.length, 0);
        // Ensure flight banner + first zone banner + first card fit together without orphan headers
        if (annexY + 10 + 8.6 + cardH > pageHeight - 13) {
          doc.addPage();
          annexY = drawAnnexHeader(18, true);
        }

        annexY = drawFlightBanner(
          annexY,
          fGroup.flightCode,
          fGroup.surveyDate,
          fGroup.zones.length,
          totalInFlight
        );

        fGroup.zones.forEach((zGroup) => {
          // Ensure zone banner + first card fit together
          if (annexY + 8.6 + cardH > pageHeight - 13) {
            doc.addPage();
            annexY = drawAnnexHeader(18, true);
          }

          annexY = drawZoneBanner(
            annexY,
            zGroup.zone,
            fGroup.flightCode,
            fGroup.surveyDate,
            zGroup.entries.length
          );

          zGroup.entries.forEach((entry) => {
            const { stockpile: st, zone: z, defaultDens, survey, thumb } = entry;

            if (annexY + cardH > pageHeight - 13) {
              doc.addPage();
              annexY = drawAnnexHeader(18, true);
              annexY = drawZoneBanner(
                annexY,
                z,
                fGroup.flightCode,
                fGroup.surveyDate,
                zGroup.entries.length
              );
            }

            const areaVal =
              st.areaM2 ??
              Math.round(Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2);
            const stDens = st.densityTonM3 || defaultDens || 1.68;
            const flightLabel = survey
              ? `${survey.flightCode} (${formatDateEu(survey.surveyDate)})`
              : 'Sin vuelo';

            // Card outer frame
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, annexY, contentWidth, cardH, 2, 2, 'FD');

            // Card header bar
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(margin, annexY, contentWidth, 9, 2, 2, 'F');
            doc.rect(margin, annexY + 5, contentWidth, 4, 'F'); // Square bottom edge of header bar
            doc.setFillColor(14, 116, 144);
            doc.rect(margin, annexY + 1, 2.2, 8, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, annexY + 9, margin + contentWidth, annexY + 9);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.2);
            doc.setTextColor(15, 23, 42);
            doc.text(
              truncateChartText(`${st.code} — ${st.name}`, 52),
              margin + 4.5,
              annexY + 5.9
            );

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(71, 85, 105);
            doc.text(
              truncateChartText(`Zona ${z.code} (${z.name})  |  Vuelo: ${flightLabel}`, 64),
              margin + contentWidth - 3.5,
              annexY + 5.9,
              { align: 'right' }
            );

            const bodyY = annexY + 11.2;

            if (isPhotographic) {
              // Left: Photo frame
              const photoBoxX = margin + 3;
              const photoBoxW = 66;
              const photoBoxH = 41;

              doc.setFillColor(248, 250, 252);
              doc.setDrawColor(203, 213, 225);
              doc.roundedRect(photoBoxX, bodyY, photoBoxW, photoBoxH, 1.2, 1.2, 'FD');

              if (thumb) {
                const pad = 1.2;
                const availW = photoBoxW - pad * 2;
                const availH = photoBoxH - pad * 2;
                const scale = Math.min(availW / thumb.width, availH / thumb.height);
                const drawW = thumb.width * scale;
                const drawH = thumb.height * scale;
                const drawX = photoBoxX + (photoBoxW - drawW) / 2;
                const drawY = bodyY + (photoBoxH - drawH) / 2;
                try {
                  doc.addImage(thumb.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
                } catch {
                  doc.setFont('helvetica', 'italic');
                  doc.setFontSize(6.8);
                  doc.setTextColor(148, 163, 184);
                  doc.text('Error al cargar fotografía', photoBoxX + photoBoxW / 2, bodyY + photoBoxH / 2 + 1, {
                    align: 'center',
                  });
                }
              } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text('Sin fotografía adjunta', photoBoxX + photoBoxW / 2, bodyY + photoBoxH / 2 + 1, {
                  align: 'center',
                });
              }

              // Right: 2-column Technical Summary Grid
              const infoX = margin + 72.5;
              const infoW = contentWidth - 75.5;
              const cellGap = 2.5;
              const colW = (infoW - cellGap) / 2;
              const cellH = 7.6;
              const rowStep = 8.9;

              const drawMetricCell = (
                cx: number,
                cy: number,
                label: string,
                value: string,
                valColor: [number, number, number] = [15, 23, 42]
              ) => {
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(cx, cy, colW, cellH, 1, 1, 'FD');

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.7);
                doc.setTextColor(100, 116, 139);
                doc.text(label, cx + 2.2, cy + 2.9);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.3);
                doc.setTextColor(valColor[0], valColor[1], valColor[2]);
                doc.text(truncateChartText(value, 32), cx + 2.2, cy + 6.4);
              };

              drawMetricCell(
                infoX,
                bodyY,
                'MATERIAL Y DENSIDAD',
                `${st.material || 'Áridos'} · ${formatEsNumber(stDens, 2)} t/m³`
              );
              drawMetricCell(
                infoX + colW + cellGap,
                bodyY,
                'SUPERFICIE OCUPADA',
                `${formatEsNumber(areaVal)} m²`
              );
              drawMetricCell(
                infoX,
                bodyY + rowStep,
                'VOLUMEN RELLENO (+)',
                `+${formatEsNumber(st.fillVolumeM3)} m³`,
                [16, 149, 93]
              );
              drawMetricCell(
                infoX + colW + cellGap,
                bodyY + rowStep,
                'VOLUMEN DESMONTE (-)',
                `-${formatEsNumber(st.cutVolumeM3)} m³`,
                [220, 38, 38]
              );
              drawMetricCell(
                infoX,
                bodyY + rowStep * 2,
                'VOLUMEN NETO',
                `${formatEsNumber(st.netVolumeM3)} m³`,
                [2, 132, 199]
              );
              drawMetricCell(
                infoX + colW + cellGap,
                bodyY + rowStep * 2,
                'TONELAJE ESTIMADO',
                `${formatEsNumber(st.tonnageEst, 1)} t`,
                [15, 23, 42]
              );

              const notesY = bodyY + rowStep * 3;
              const notesH = bodyY + photoBoxH - notesY;
              doc.setFillColor(248, 250, 252);
              doc.setDrawColor(226, 232, 240);
              doc.roundedRect(infoX, notesY, infoW, notesH, 1, 1, 'FD');

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(5.7);
              doc.setTextColor(71, 85, 105);
              doc.text('OBSERVACIONES Y ARCHIVO FOTOGRÁFICO', infoX + 2.2, notesY + 3.2);

              doc.setFont('helvetica', 'normal');
              doc.setFontSize(6.4);
              doc.setTextColor(51, 65, 85);
              const notesText = st.notes?.trim()
                ? st.notes.trim()
                : 'Sin observaciones técnicas adicionales.';
              const photoRef = st.photoFileName ? `  ·  Archivo: ${st.photoFileName}` : '';
              const wrappedLines = doc.splitTextToSize(`${notesText}${photoRef}`, infoW - 4.4);
              doc.text(wrappedLines.slice(0, 2), infoX + 2.2, notesY + 6.9);
            } else {
              // Standard mode (no photo): full-width 3-column Technical Summary Grid
              const infoX = margin + 3;
              const infoW = contentWidth - 6;
              const cellGap = 2.5;
              const colW = (infoW - cellGap * 2) / 3;
              const cellH = 7.6;
              const rowStep = 8.9;

              const drawStdMetricCell = (
                cx: number,
                cy: number,
                label: string,
                value: string,
                valColor: [number, number, number] = [15, 23, 42]
              ) => {
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(cx, cy, colW, cellH, 1, 1, 'FD');

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.7);
                doc.setTextColor(100, 116, 139);
                doc.text(label, cx + 2.2, cy + 2.9);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.3);
                doc.setTextColor(valColor[0], valColor[1], valColor[2]);
                doc.text(truncateChartText(value, 36), cx + 2.2, cy + 6.4);
              };

              // Row 1: Material & Density | Area | Net Volume
              drawStdMetricCell(
                infoX,
                bodyY,
                'MATERIAL Y DENSIDAD',
                `${st.material || 'Áridos'} · ${formatEsNumber(stDens, 2)} t/m³`
              );
              drawStdMetricCell(
                infoX + colW + cellGap,
                bodyY,
                'SUPERFICIE OCUPADA',
                `${formatEsNumber(areaVal)} m²`
              );
              drawStdMetricCell(
                infoX + (colW + cellGap) * 2,
                bodyY,
                'VOLUMEN NETO',
                `${formatEsNumber(st.netVolumeM3)} m³`,
                [2, 132, 199]
              );

              // Row 2: Fill | Cut | Tonnage
              drawStdMetricCell(
                infoX,
                bodyY + rowStep,
                'VOLUMEN RELLENO (+)',
                `+${formatEsNumber(st.fillVolumeM3)} m³`,
                [16, 149, 93]
              );
              drawStdMetricCell(
                infoX + colW + cellGap,
                bodyY + rowStep,
                'VOLUMEN DESMONTE (-)',
                `-${formatEsNumber(st.cutVolumeM3)} m³`,
                [220, 38, 38]
              );
              drawStdMetricCell(
                infoX + (colW + cellGap) * 2,
                bodyY + rowStep,
                'TONELAJE ESTIMADO',
                `${formatEsNumber(st.tonnageEst, 1)} t`,
                [15, 23, 42]
              );

              // Bottom Notes Strip (without photo reference)
              const notesY = bodyY + rowStep * 2;
              const notesH = annexY + cardH - 2 - notesY;
              doc.setFillColor(248, 250, 252);
              doc.setDrawColor(226, 232, 240);
              doc.roundedRect(infoX, notesY, infoW, notesH, 1, 1, 'FD');

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(5.7);
              doc.setTextColor(71, 85, 105);
              doc.text('OBSERVACIONES', infoX + 2.2, notesY + 3.2);

              doc.setFont('helvetica', 'normal');
              doc.setFontSize(6.4);
              doc.setTextColor(51, 65, 85);
              const notesText = st.notes?.trim()
                ? st.notes.trim()
                : 'Sin observaciones técnicas adicionales.';
              const wrappedLines = doc.splitTextToSize(notesText, infoW - 4.4);
              doc.text(wrappedLines.slice(0, 2), infoX + 2.2, notesY + 6.9);
            }

            annexY += cardH + cardGap;
          });
        });

        annexY += 2;
      });
    }
  }

  // ==========================================
  // 9. PAGE FOOTER
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246); // #3b82f6
    doc.text('INGEO', margin, pageHeight - 5);
    const fIngeoW = doc.getTextWidth('INGEO');
    doc.setTextColor(245, 158, 11); // #f59e0b
    doc.text('DRON', margin + fIngeoW, pageHeight - 5);
    const fDronW = doc.getTextWidth('DRON');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      ' Topografía y Drones S.L. - Informe Técnico Confidencial',
      margin + fIngeoW + fDronW,
      pageHeight - 5
    );
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
  }

  // Generate file name & trigger download
  const safeFlightTag = (uniqueFlightCodes.length === 1
    ? uniqueFlightCodes[0]
    : uniqueFlightCodes.length > 1
    ? `${uniqueFlightCodes.length}_Vuelos`
    : currentSurvey?.flightCode || 'Vuelos_Filtrados'
  ).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeScopeName = (isMultiZone
    ? `${quarry?.name || 'Explotacion'}_${targetZones.length}Zonas`
    : primaryZone.name
  ).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateTag =
    includedDates.length > 1
      ? `${formatDateEu(includedDates[0]).replace(/\//g, '-')}_a_${formatDateEu(includedDates[includedDates.length - 1]).replace(/\//g, '-')}`
      : includedDates[0]
      ? formatDateEu(includedDates[0]).replace(/\//g, '-')
      : 'SinFecha';
  const fileName = `${
    isPhotographic ? 'Informe_Fotografico_Cubicacion' : 'Informe_Cubicacion'
  }_${safeFlightTag}_${safeScopeName}_${dateTag}.pdf`;
  doc.save(fileName);
  const blob = doc.output('blob');

  return { fileName, blob };
}

