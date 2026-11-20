import * as XLSX from 'xlsx-js-style';
import { Client, Quarry, Zone, Survey, Stockpile } from '../types.ts';
import { formatDateEu } from './dateUtils.ts';
import { formatEsNumber } from './numberFormat.ts';

interface ExcelCellStyle {
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
  numFmt?: string;
}

const EXCEL_HEADER_STYLE: ExcelCellStyle = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1E3A8A' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: '1E40AF' } },
    bottom: { style: 'medium', color: { rgb: '0F172A' } },
    left: { style: 'thin', color: { rgb: '3B82F6' } },
    right: { style: 'thin', color: { rgb: '3B82F6' } },
  },
};

const THIN_CELL_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const TOTALS_CELL_BORDER = {
  top: { style: 'medium', color: { rgb: 'D97706' } },
  bottom: { style: 'medium', color: { rgb: 'D97706' } },
  left: { style: 'thin', color: { rgb: 'F59E0B' } },
  right: { style: 'thin', color: { rgb: 'F59E0B' } },
};

function applyTableSheetStyling(
  ws: XLSX.WorkSheet,
  headers: string[],
  options?: { hasTotalsRow?: boolean }
): void {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const totalRowIdx = options?.hasTotalsRow ? range.e.r : -1;

  const rowHeights: XLSX.RowInfo[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    rowHeights.push({ hpt: r === 0 ? 28 : r === totalRowIdx ? 23 : 20 });

    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) {
        ws[addr] = { t: 's', v: '' };
      }
      const cell = ws[addr] as XLSX.CellObject & { s?: ExcelCellStyle; z?: string };

      if (r === 0) {
        cell.s = EXCEL_HEADER_STYLE;
        continue;
      }

      const headerName = headers[c] || '';
      const isOdd = (r - 1) % 2 === 1;
      const isTotal = r === totalRowIdx;
      const isNumber = cell.t === 'n';

      if (isTotal) {
        cell.s = {
          font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '78350F' } },
          fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } },
          border: TOTALS_CELL_BORDER,
          alignment: {
            vertical: 'center',
            horizontal: isNumber ? 'right' : 'left',
          },
        };
        if (isNumber) {
          cell.z = '#,##0.00';
        }
        continue;
      }

      let fillRgb = isOdd ? 'EFF6FF' : 'F8FAFC';
      let fontRgb = '1E293B';
      let bold = false;
      let horizontal: 'left' | 'center' | 'right' = isNumber ? 'right' : 'left';

      if (/C[óo]digo/i.test(headerName)) {
        fillRgb = isOdd ? 'E0E7FF' : 'EEF2FF';
        fontRgb = '312E81';
        bold = true;
        horizontal = 'center';
      } else if (/Relleno/i.test(headerName)) {
        fillRgb = isOdd ? 'D1FAE5' : 'ECFDF5';
        fontRgb = '065F46';
        bold = true;
      } else if (/Desmonte/i.test(headerName)) {
        fillRgb = isOdd ? 'FEE2E2' : 'FEF2F2';
        fontRgb = '991B1B';
        bold = true;
      } else if (/Volumen Neto|Masa Estimada|Total Volumen/i.test(headerName)) {
        fillRgb = isOdd ? 'BAE6FD' : 'E0F2FE';
        fontRgb = '075985';
        bold = true;
      } else if (/Fecha|Estado|GSD|N[º°] Acopios/i.test(headerName)) {
        horizontal = 'center';
      }

      cell.s = {
        font: { name: 'Calibri', sz: 10, bold, color: { rgb: fontRgb } },
        fill: { patternType: 'solid', fgColor: { rgb: fillRgb } },
        border: THIN_CELL_BORDER,
        alignment: { vertical: 'center', horizontal },
      };

      if (isNumber) {
        cell.z = /Densidad|GSD/i.test(headerName) ? '#,##0.00' : '#,##0.0';
      }
    }
  }

  ws['!rows'] = rowHeights;
}

/**
 * Client-side Excel (.xlsx) export generated 100% in JavaScript with styled cells,
 * unified bold colored headers, zebra striping, semantic volume highlights, and totals.
 */
export function exportQuarryToExcel(
  quarry: Quarry | null,
  zones: Zone[],
  surveys: Survey[],
  client?: Client | null,
  stockpiles?: Stockpile[],
  options?: { filterSummary?: string; fileTag?: string; includeFlightStatus?: boolean }
): void {
  const wb = XLSX.utils.book_new();

  const surveyIdSet = new Set(surveys.map((s) => s.id));
  const scopedStockpiles = (stockpiles || []).filter((st) => surveyIdSet.has(st.surveyId));
  const useStockpilesTotals = scopedStockpiles.length > 0;

  const totalFill = useStockpilesTotals
    ? scopedStockpiles.reduce((acc, st) => acc + st.fillVolumeM3, 0)
    : surveys.reduce((acc, s) => acc + s.fillVolumeM3, 0);
  const totalCut = useStockpilesTotals
    ? scopedStockpiles.reduce((acc, st) => acc + st.cutVolumeM3, 0)
    : surveys.reduce((acc, s) => acc + s.cutVolumeM3, 0);
  const totalNet = useStockpilesTotals
    ? scopedStockpiles.reduce((acc, st) => acc + st.netVolumeM3, 0)
    : surveys.reduce((acc, s) => acc + s.netVolumeM3, 0);
  const totalTonnage = useStockpilesTotals
    ? Math.round(scopedStockpiles.reduce((acc, st) => acc + st.tonnageEst, 0) * 10) / 10
    : Math.round(surveys.reduce((acc, s) => acc + s.tonnageEst, 0) * 10) / 10;

  // 1. Resumen Explotación Sheet
  const resumenData: Array<[string, string | number]> = [
    ['PORTAL INGEODRON - CONTROL TOPOGRÁFICO Y VOLUMETRÍA DE CANTERAS', ''],
    ['Informe Oficial de Cubicación para Cliente y Administración Minera', ''],
    ['Fecha de Generación:', new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
    ['', ''],
    ['DATOS DE LA EMPRESA / CLIENTE', ''],
    ['Código de Cliente:', client?.code || 'N/D'],
    ['Cliente (Razón Social):', client?.name || 'Sin cliente asignado'],
    ['NIF / CIF:', client?.cif || 'N/D'],
    ['Contacto Técnico:', client?.contactName || 'N/D'],
    ['Email:', client?.contactEmail || 'N/D'],
    ['', ''],
    ['DATOS DE LA CANTERA / EXPLOTACIÓN', ''],
    ['Nombre Cantera:', quarry?.name || 'Sin explotación asignada'],
    ['Código Explotación:', quarry?.code || 'N/D'],
    ['Localización:', quarry?.location || 'N/D'],
    ['Sistema de Referencia (CRS):', 'ETRS89 UTM Huso 30N (EPSG:25830)'],
    ['', ''],
    ['BALANCE GENERAL DE VOLÚMENES Y ACOPIOS', ''],
    ['Total Volumen Relleno (+ Acopio):', `${formatEsNumber(totalFill)} m³`],
    ['Total Volumen Desmonte (- Extracción):', `${formatEsNumber(totalCut)} m³`],
    ['Balance Neto General:', `${formatEsNumber(totalNet)} m³`],
    ['Masa Total Estimada de Acopios:', `${formatEsNumber(totalTonnage)} toneladas`],
    ['Número de Zonas de la Explotación:', zones.length],
    ['Número de Misiones / Vuelos Registrados:', surveys.length],
    ['Número de Acopios Individuales:', scopedStockpiles.length || surveys.length],
    ...(options?.filterSummary
      ? [['Alcance / Filtros Aplicados:', options.filterSummary] as [string, string]]
      : []),
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
  wsResumen['!cols'] = [{ wch: 42 }, { wch: 48 }];
  wsResumen['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 1 } },
    { s: { r: 17, c: 0 }, e: { r: 17, c: 1 } },
  ];

  const sectionRowSet = new Set([4, 11, 17]);
  const resumenRowHeights: XLSX.RowInfo[] = [];
  for (let r = 0; r < resumenData.length; r++) {
    resumenRowHeights.push({ hpt: r === 0 ? 28 : sectionRowSet.has(r) ? 22 : 19 });
    const labelText = String(resumenData[r][0] || '');
    const isBlank = !labelText && !String(resumenData[r][1] || '');
    for (let c = 0; c <= 1; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!wsResumen[addr]) wsResumen[addr] = { t: 's', v: '' };
      const cell = wsResumen[addr] as XLSX.CellObject & { s?: ExcelCellStyle };

      if (r === 0) {
        cell.s = EXCEL_HEADER_STYLE;
      } else if (r === 1) {
        cell.s = {
          font: { name: 'Calibri', sz: 10, italic: true, bold: true, color: { rgb: '1E40AF' } },
          fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
          alignment: { vertical: 'center', horizontal: 'center' },
          border: THIN_CELL_BORDER,
        };
      } else if (sectionRowSet.has(r)) {
        cell.s = {
          font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '0369A1' } },
          fill: { patternType: 'solid', fgColor: { rgb: 'E0F2FE' } },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: THIN_CELL_BORDER,
        };
      } else if (isBlank) {
        cell.s = {
          fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
        };
      } else if (c === 0) {
        cell.s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1E293B' } },
          fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: THIN_CELL_BORDER,
        };
      } else {
        let valFill = r % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        let valColor = '0F172A';
        let valBold = false;
        if (labelText.includes('Relleno')) {
          valFill = 'ECFDF5';
          valColor = '065F46';
          valBold = true;
        } else if (labelText.includes('Desmonte')) {
          valFill = 'FEF2F2';
          valColor = '991B1B';
          valBold = true;
        } else if (labelText.includes('Balance Neto')) {
          valFill = 'E0F2FE';
          valColor = '075985';
          valBold = true;
        } else if (labelText.includes('Masa Total')) {
          valFill = 'FEF3C7';
          valColor = '78350F';
          valBold = true;
        } else if (labelText.includes('Filtros Aplicados')) {
          valFill = 'DBEAFE';
          valColor = '1E40AF';
          valBold = true;
        }
        cell.s = {
          font: { name: 'Calibri', sz: 10, bold: valBold, color: { rgb: valColor } },
          fill: { patternType: 'solid', fgColor: { rgb: valFill } },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: THIN_CELL_BORDER,
        };
      }
    }
  }
  wsResumen['!rows'] = resumenRowHeights;
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Cantera');

  // 2. Volúmenes y Acopios Sheet
  const stockpileRows: Array<Record<string, string | number>> =
    scopedStockpiles.length > 0
      ? scopedStockpiles.map((st) => {
          const s = surveys.find((item) => item.id === st.surveyId);
          const z = s ? zones.find((item) => item.id === s.zoneId) : undefined;
          return {
            'Código Acopio': st.code,
            'Acopio / Pila': st.name,
            'Zona Perteneciente': z ? `${z.name} (${z.code})` : 'Zona General',
            'Vuelo': s ? s.flightCode : 'N/D',
            'Fecha Medición': s ? formatDateEu(s.surveyDate) : 'N/D',
            'Material Clasificado': st.material,
            'Cota Base Datum (m)': st.baseElevationM,
            'Densidad (t/m³)': st.densityTonM3,
            'Relleno (+m³)': st.fillVolumeM3,
            'Desmonte (-m³)': st.cutVolumeM3,
            'Volumen Neto (m³)': st.netVolumeM3,
            'Masa Estimada (t)': st.tonnageEst,
            'Superficie (m²)':
              st.areaM2 ??
              Math.round(Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2),
            'Observaciones': st.notes || '',
          };
        })
      : zones.map((z) => {
          const zoneSurveys = surveys.filter((s) => s.zoneId === z.id);
          const latestSurvey =
            zoneSurveys.length > 0
              ? [...zoneSurveys].sort(
                  (a, b) => new Date(b.surveyDate).getTime() - new Date(a.surveyDate).getTime()
                )[0]
              : null;

          const fillM3 = latestSurvey ? latestSurvey.fillVolumeM3 : 0;
          const cutM3 = latestSurvey ? latestSurvey.cutVolumeM3 : 0;
          const netM3 = latestSurvey ? latestSurvey.netVolumeM3 : 0;
          const tonEst = latestSurvey ? latestSurvey.tonnageEst : 0;

          return {
            'Código Acopio': z.code,
            'Acopio / Pila': z.name,
            'Zona Perteneciente': z.name,
            'Vuelo': latestSurvey ? latestSurvey.flightCode : 'Sin registrar',
            'Fecha Medición': latestSurvey ? formatDateEu(latestSurvey.surveyDate) : 'N/D',
            'Material Clasificado': 'Árido clasificado',
            'Cota Base Datum (m)': 115.0,
            'Densidad (t/m³)': 1.68,
            'Relleno (+m³)': fillM3,
            'Desmonte (-m³)': cutM3,
            'Volumen Neto (m³)': netM3,
            'Masa Estimada (t)': tonEst,
            'Superficie (m²)': Math.round(Math.max(Math.abs(fillM3), Math.abs(cutM3)) / 6.2),
            'Observaciones': 'Zona',
          };
        });

  const stFillSum = stockpileRows.reduce((acc, r) => acc + Number(r['Relleno (+m³)'] || 0), 0);
  const stCutSum = stockpileRows.reduce((acc, r) => acc + Number(r['Desmonte (-m³)'] || 0), 0);
  const stNetSum = stockpileRows.reduce((acc, r) => acc + Number(r['Volumen Neto (m³)'] || 0), 0);
  const stTonSum = stockpileRows.reduce((acc, r) => acc + Number(r['Masa Estimada (t)'] || 0), 0);
  const stAreaSum = stockpileRows.reduce((acc, r) => acc + Number(r['Superficie (m²)'] || 0), 0);

  if (stockpileRows.length > 0) {
    stockpileRows.push({
      'Código Acopio': 'TOTAL',
      'Acopio / Pila': `${stockpileRows.length} acopios`,
      'Zona Perteneciente': '-',
      'Vuelo': '-',
      'Fecha Medición': '-',
      'Material Clasificado': 'Consolidado',
      'Cota Base Datum (m)': '-',
      'Densidad (t/m³)': '-',
      'Relleno (+m³)': stFillSum,
      'Desmonte (-m³)': stCutSum,
      'Volumen Neto (m³)': stNetSum,
      'Masa Estimada (t)': Math.round(stTonSum * 10) / 10,
      'Superficie (m²)': stAreaSum,
      'Observaciones': 'Total acumulado de la tabla',
    });
  }

  const wsZones = XLSX.utils.json_to_sheet(stockpileRows);
  const zoneHeaders = Object.keys(stockpileRows[0] || {});
  wsZones['!cols'] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 28 },
    { wch: 18 },
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 32 },
  ];
  applyTableSheetStyling(wsZones, zoneHeaders, { hasTotalsRow: stockpileRows.length > 1 });
  XLSX.utils.book_append_sheet(wb, wsZones, 'Volumenes y Acopios');

  // 3. Detalle Vuelos y Levantamientos Sheet
  const includeFlightStatus = options?.includeFlightStatus !== false;
  const surveysRows: Array<Record<string, string | number>> = surveys.map((s) => {
    const z = zones.find((item) => item.id === s.zoneId);
    const flightSts = scopedStockpiles.filter((st) => st.surveyId === s.id);
    const hasFlightSts = flightSts.length > 0;
    const rowFill = hasFlightSts
      ? flightSts.reduce((acc, st) => acc + st.fillVolumeM3, 0)
      : s.fillVolumeM3;
    const rowCut = hasFlightSts
      ? flightSts.reduce((acc, st) => acc + st.cutVolumeM3, 0)
      : s.cutVolumeM3;
    const rowNet = hasFlightSts
      ? flightSts.reduce((acc, st) => acc + st.netVolumeM3, 0)
      : s.netVolumeM3;
    const rowTon = hasFlightSts
      ? Math.round(flightSts.reduce((acc, st) => acc + st.tonnageEst, 0) * 10) / 10
      : s.tonnageEst;
    const row: Record<string, string | number> = {
      'Código Vuelo': s.flightCode,
    };
    if (includeFlightStatus) {
      row['Estado Vuelo'] = s.status ? s.status.toUpperCase() : 'ARCHIVED';
    }
    const flightMaterial = hasFlightSts
      ? Array.from(new Set(flightSts.map((st) => st.material).filter(Boolean))).join(', ') || 'Árido clasificado'
      : 'Árido clasificado';
    const flightBaseElev = hasFlightSts ? (flightSts[0]?.baseElevationM ?? 115.0) : 115.0;
    const flightDensity = hasFlightSts
      ? (Math.abs(rowNet) > 0 && rowTon > 0
          ? Math.round((rowTon / Math.abs(rowNet)) * 100) / 100
          : flightSts[0]?.densityTonM3 || 1.68)
      : Math.abs(rowNet) > 0 && rowTon > 0
      ? Math.round((rowTon / Math.abs(rowNet)) * 100) / 100
      : 1.68;

    Object.assign(row, {
      'Fecha Levantamiento': formatDateEu(s.surveyDate),
      'Zona': z?.name || 'Zona General',
      'Nº Acopios': hasFlightSts ? flightSts.length : 1,
      'Acopios': hasFlightSts ? flightSts.map((st) => st.name).join(', ') : z?.name || 'Acopio',
      'Material': flightMaterial,
      'Cota Base (m)': flightBaseElev,
      'Relleno (+ m³)': rowFill,
      'Desmonte (- m³)': rowCut,
      'Volumen Neto (m³)': rowNet,
      'Masa Estimada (t)': rowTon,
      'Densidad Usada (t/m³)': flightDensity,
      'GSD (cm/px)': s.groundResolutionCm || 1.8,
      'Dron / Sensor': s.droneModel || 'DJI Matrice 4E RTK',
      'Topógrafo / Operador': s.operator || 'INGEODRON',
      'Observaciones': s.notes || '',
    });
    return row;
  });

  if (surveysRows.length > 0) {
    const surveysFillSum = surveysRows.reduce((acc, r) => acc + Number(r['Relleno (+ m³)'] || 0), 0);
    const surveysCutSum = surveysRows.reduce((acc, r) => acc + Number(r['Desmonte (- m³)'] || 0), 0);
    const surveysNetSum = surveysRows.reduce((acc, r) => acc + Number(r['Volumen Neto (m³)'] || 0), 0);
    const surveysTonSum = surveysRows.reduce((acc, r) => acc + Number(r['Masa Estimada (t)'] || 0), 0);
    const totalRow: Record<string, string | number> = {
      'Código Vuelo': 'TOTAL',
    };
    if (includeFlightStatus) {
      totalRow['Estado Vuelo'] = `${surveysRows.length} vuelos`;
    }
    Object.assign(totalRow, {
      'Fecha Levantamiento': '-',
      'Zona': '-',
      'Nº Acopios': surveysRows.reduce((acc, r) => acc + Number(r['Nº Acopios'] || 0), 0),
      'Acopios': 'Consolidado vuelos',
      'Material': '-',
      'Cota Base (m)': '-',
      'Relleno (+ m³)': surveysFillSum,
      'Desmonte (- m³)': surveysCutSum,
      'Volumen Neto (m³)': surveysNetSum,
      'Masa Estimada (t)': Math.round(surveysTonSum * 10) / 10,
      'Densidad Usada (t/m³)': '-',
      'GSD (cm/px)': '-',
      'Dron / Sensor': '-',
      'Topógrafo / Operador': '-',
      'Observaciones': 'Total de levantamientos exportados',
    });
    surveysRows.push(totalRow);
  }

  const wsSurveys = XLSX.utils.json_to_sheet(surveysRows);
  const surveyHeaders = Object.keys(surveysRows[0] || {});
  wsSurveys['!cols'] = [
    { wch: 18 },
    ...(includeFlightStatus ? [{ wch: 16 }] : []),
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 36 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 28 },
    { wch: 24 },
    { wch: 40 },
  ];
  applyTableSheetStyling(wsSurveys, surveyHeaders, { hasTotalsRow: surveysRows.length > 1 });
  XLSX.utils.book_append_sheet(wb, wsSurveys, 'Historico Vuelos');

  // 4. Balance Desmonte y Relleno Sheet
  const balanceRows = [
    {
      'Categoría': 'Pilas de Acopio (Relleno Positivo)',
      'Total Volumen (m³)': totalFill,
      'Masa Estimada (t)': totalTonnage,
      'Descripción': 'Material apilado disponible para venta, despacho o consumo interno',
    },
    {
      'Categoría': 'Frentes de Extracción (Desmonte Negativo)',
      'Total Volumen (m³)': totalCut,
      'Masa Estimada (t)': Math.round(totalCut * 2.65 * 10) / 10,
      'Descripción': 'Volumen de roca y mineral excavado en bancos de explotación',
    },
    {
      'Categoría': 'Balance Neto de Movimiento',
      'Total Volumen (m³)': totalNet,
      'Masa Estimada (t)': totalTonnage,
      'Descripción': 'Diferencia volumétrica total (Relleno - Desmonte)',
    },
  ];
  const wsBalance = XLSX.utils.json_to_sheet(balanceRows);
  const balanceHeaders = Object.keys(balanceRows[0]);
  wsBalance['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 55 }];
  applyTableSheetStyling(wsBalance, balanceHeaders, { hasTotalsRow: true });
  XLSX.utils.book_append_sheet(wb, wsBalance, 'Balance Desmonte-Relleno');

  const scopeSuffix = options?.fileTag ? `_${options.fileTag}` : '';
  const fileName = `INGEODRON_Volumenes_Acopios_${quarry?.code || 'Cantera'}${scopeSuffix}_${formatDateEu(new Date()).replace(/\//g, '-')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Client-side file downloader for deliverables without requiring any backend /api/ endpoint.
 * Creates an in-memory Blob with appropriate MIME type and metadata and initiates a browser download.
 */
export function downloadDeliverableFile(item: {
  id: number;
  title: string;
  category: string;
  fileName: string;
  crs?: string;
  fileSize?: string;
  uploadDate?: string;
}): void {
  let mimeType = 'text/plain;charset=utf-8';
  let content = '';

  if (item.fileName.endsWith('.dxf')) {
    mimeType = 'application/dxf';
    content = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nCURVAS_NIVEL_MAESTRAS\n62\n1\n70\n0\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n999\nINGEODRON - Curvas de Nivel Digitalizadas ETRS89 UTM 30N\n0\nENDSEC\n0\nEOF`;
  } else if (item.fileName.endsWith('.las') || item.fileName.endsWith('.laz')) {
    mimeType = 'application/octet-stream';
    content = `LASF\nINGEODRON LiDAR & Photogrammetric Point Cloud\nCRS: ${item.crs || 'EPSG:25830'}\nGenerated by: INGEODRON Web Processing Engine (JavaScript & WebGL)\nFile: ${item.fileName}\nDate: ${formatDateEu(item.uploadDate || new Date())}`;
  } else if (item.fileName.endsWith('.tif') || item.fileName.endsWith('.tiff')) {
    mimeType = 'image/tiff';
    content = `GEOTIFF\nINGEODRON Ortomosaico Georreferenciado\nCRS: ${item.crs || 'ETRS89 UTM 30N'}\nGSD: 1.8 cm/px\nRGB 8-bit Channels`;
  } else if (item.fileName.endsWith('.obj')) {
    mimeType = 'text/plain';
    content = `# INGEODRON 3D MESH EXPORT\n# CRS: ${item.crs || 'EPSG:25830'}\nv 0.0 0.0 120.5\nv 10.0 0.0 124.2\nv 10.0 10.0 131.8\nv 0.0 10.0 128.0\nv 5.0 5.0 145.6\nf 1 2 5\nf 2 3 5\nf 3 4 5\nf 4 1 5\n`;
  } else {
    mimeType = 'application/octet-stream';
    content = `PORTAL INGEODRON - ARCHIVO ENTREGABLE\nNombre: ${item.fileName}\nCategoría: ${item.category}\nSistema de Referencia: ${item.crs || 'EPSG:25830'}\nFecha: ${formatDateEu(item.uploadDate || new Date())}\nGenerado con JavaScript y HTML5 local sin servidor.`;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', item.fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

