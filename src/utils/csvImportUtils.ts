import { Client, Quarry, Zone, Survey, Stockpile, SurveyStatus } from '../types.ts';
import { localDataStore } from './localDataStore.ts';
import { formatDateEu } from './dateUtils.ts';

export type CsvImportMode = 'flights' | 'stockpiles';

export interface ParsedFlightPreviewRow {
  rowNumber: number;
  client: Client | null;
  zone: Zone | null;
  existingSurvey: Survey | null;
  action: 'create' | 'update' | 'error';
  error?: string;
  flightCode: string;
  missionName: string;
  surveyDate: string;
  status: SurveyStatus;
  groundResolutionCm: number;
  droneModel: string;
  operator: string;
  notes: string;
}

export interface ParsedStockpilePreviewRow {
  rowNumber: number;
  client: Client | null;
  survey: Survey | null;
  existingStockpile: Stockpile | null;
  action: 'create' | 'update' | 'error';
  error?: string;
  code: string;
  name: string;
  stockpileType: Stockpile['stockpileType'];
  material: string;
  densityTonM3: number;
  baseElevationM: number;
  areaM2?: number;
  fillVolumeM3: number;
  cutVolumeM3: number;
  netVolumeM3: number;
  tonnageEst: number;
  notes: string;
}

function normalizeHeaderKey(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeMatchToken(raw?: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function parseFlexibleNumber(raw: string | undefined, fallback: number): number {
  const txt = String(raw ?? '').trim();
  if (!txt) return fallback;
  let cleaned = txt.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!cleaned) return fallback;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // European format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Only comma present: treat comma as decimal separator unless exact 3-digit grouping like 25,000
    const afterComma = cleaned.slice(lastComma + 1);
    if (afterComma.length === 3 && /^\d{1,3},\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSurveyStatus(raw?: string): SurveyStatus {
  const val = normalizeMatchToken(raw);
  if (val === 'active' || val === 'activo' || val === 'act') return 'active';
  if (val === 'pending' || val === 'pendiente' || val === 'pend') return 'pending';
  if (val === 'archived' || val === 'archivado' || val === 'arch') return 'archived';
  return 'active';
}

function parseStockpileType(raw?: string): Stockpile['stockpileType'] {
  const val = normalizeMatchToken(raw);
  if (val.includes('extr') || val.includes('bench') || val.includes('frente')) {
    return 'bench_extraction';
  }
  if (val.includes('vert') || val.includes('fill') || val.includes('escomb')) {
    return 'fill_dump';
  }
  if (val.includes('bals') || val.includes('basin')) {
    return 'basin';
  }
  return 'stockpile';
}

function detectCsvDelimiter(headerLine: string): string {
  let semicolons = 0;
  let commas = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ';') semicolons++;
      else if (ch === ',') commas++;
      else if (ch === '\t') tabs++;
    }
  }
  if (tabs >= semicolons && tabs >= commas && tabs > 0) return '\t';
  if (semicolons >= commas) return ';';
  return ',';
}

function splitCsvRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsvRecords(text: string): {
  delimiter: string;
  headers: string[];
  rows: Array<{ rowNumber: number; record: Record<string, string> }>;
} {
  const cleanText = String(text || '').replace(/^\uFEFF/, '');
  const rawLines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

  if (rawLines.length === 0) {
    return { delimiter: ';', headers: [], rows: [] };
  }

  const delimiter = detectCsvDelimiter(rawLines[0]);
  const rawHeaders = splitCsvRow(rawLines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeaderKey);

  const rows: Array<{ rowNumber: number; record: Record<string, string> }> = [];
  for (let idx = 1; idx < rawLines.length; idx++) {
    const values = splitCsvRow(rawLines[idx], delimiter);
    if (values.every((v) => v === '')) continue;
    const record: Record<string, string> = {};
    headers.forEach((key, colIdx) => {
      if (key) {
        record[key] = (values[colIdx] ?? '').trim();
      }
    });
    rows.push({ rowNumber: idx + 1, record });
  }

  return { delimiter, headers, rows };
}

function pickField(record: Record<string, string>, aliases: string[]): string {
  for (const key of aliases) {
    const val = record[key];
    if (val !== undefined && val !== '') return val;
  }
  return '';
}

function normalizeIsoDate(raw?: string): string {
  const txt = String(raw || '').trim();
  if (!txt) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
  const slashMatch = txt.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
  }
  return txt;
}

function resolveClientForRow(
  record: Record<string, string>,
  clients: Client[],
  selectedClientId: number | 'auto'
): Client | null {
  if (selectedClientId !== 'auto') {
    return clients.find((c) => c.id === selectedClientId) || null;
  }
  const clientCodeRaw = pickField(record, ['codigo_cliente', 'cod_cliente', 'cliente_codigo', 'client_code']);
  const clientNameRaw = pickField(record, ['cliente', 'nombre_cliente', 'razon_social', 'client_name']);
  if (clientCodeRaw) {
    const targetCode = normalizeMatchToken(clientCodeRaw);
    const byCode = clients.find((c) => normalizeMatchToken(c.code) === targetCode);
    if (byCode) return byCode;
  }
  if (clientNameRaw) {
    const targetName = normalizeMatchToken(clientNameRaw);
    const byName = clients.find((c) => normalizeMatchToken(c.name) === targetName);
    if (byName) return byName;
  }
  return null;
}

export function previewFlightsCsvImport(
  csvText: string,
  context: {
    clients: Client[];
    quarries: Quarry[];
    zones: Zone[];
    surveys: Survey[];
    selectedClientId: number | 'auto';
    fallbackZoneId?: number;
  }
): {
  delimiter: string;
  rows: ParsedFlightPreviewRow[];
} {
  const { delimiter, rows } = parseCsvRecords(csvText);
  const { clients, quarries, zones, surveys, selectedClientId, fallbackZoneId } = context;

  const previewRows: ParsedFlightPreviewRow[] = rows.map(({ rowNumber, record }) => {
    const client = resolveClientForRow(record, clients, selectedClientId);
    const flightCode = pickField(record, ['codigo_vuelo', 'codigo', 'cod_vuelo', 'flight_code', 'vuelo']);
    const missionName = pickField(record, ['mision', 'titulo_mision', 'notas', 'notes', 'mission']);
    const surveyDate = normalizeIsoDate(
      pickField(record, ['fecha_levantamiento', 'fecha', 'survey_date', 'fecha_vuelo'])
    );
    const status = parseSurveyStatus(pickField(record, ['estado', 'status', 'estado_vuelo']));
    const gsd = Math.max(
      0.2,
      parseFlexibleNumber(pickField(record, ['gsd_cm_px', 'gsd', 'ground_resolution_cm']), 1.8)
    );
    const droneModel =
      pickField(record, ['dron_modelo', 'dron', 'drone_model', 'sensor']) || 'DJI Matrice 4E RTK';
    const operator =
      pickField(record, ['operador', 'topografo', 'operator']) || 'INGEODRON';

    if (!flightCode) {
      return {
        rowNumber,
        client,
        zone: null,
        existingSurvey: null,
        action: 'error',
        error: 'Falta el "codigo_vuelo" en esta fila.',
        flightCode: '',
        missionName,
        surveyDate,
        status,
        groundResolutionCm: gsd,
        droneModel,
        operator,
        notes: missionName,
      };
    }

    if (!client) {
      return {
        rowNumber,
        client: null,
        zone: null,
        existingSurvey: null,
        action: 'error',
        error:
          selectedClientId === 'auto'
            ? 'Cliente no identificado. Indica "codigo_cliente" válido o selecciona un cliente arriba.'
            : 'Cliente destino no encontrado.',
        flightCode,
        missionName,
        surveyDate,
        status,
        groundResolutionCm: gsd,
        droneModel,
        operator,
        notes: missionName,
      };
    }

    const clientQuarryIds = new Set(quarries.filter((q) => q.clientId === client.id).map((q) => q.id));
    const clientZones = zones.filter((z) => clientQuarryIds.has(z.quarryId));
    const zoneRefRaw = pickField(record, ['codigo_zona', 'cod_zona', 'zona', 'zone_code', 'zone']);
    let zone: Zone | null = null;
    if (zoneRefRaw) {
      const tok = normalizeMatchToken(zoneRefRaw);
      zone =
        clientZones.find(
          (z) => normalizeMatchToken(z.code) === tok || normalizeMatchToken(z.name) === tok
        ) || null;
    } else if (fallbackZoneId) {
      zone = clientZones.find((z) => z.id === fallbackZoneId) || clientZones[0] || null;
    } else {
      zone = clientZones[0] || null;
    }

    if (!zone) {
      return {
        rowNumber,
        client,
        zone: null,
        existingSurvey: null,
        action: 'error',
        error: zoneRefRaw
          ? `Zona "${zoneRefRaw}" no encontrada en las explotaciones de ${client.name}.`
          : `El cliente ${client.name} no tiene zonas creadas.`,
        flightCode,
        missionName,
        surveyDate,
        status,
        groundResolutionCm: gsd,
        droneModel,
        operator,
        notes: missionName,
      };
    }

    const clientZoneIds = new Set(clientZones.map((z) => z.id));
    const existingSurvey =
      surveys.find(
        (s) =>
          clientZoneIds.has(s.zoneId) &&
          normalizeMatchToken(s.flightCode) === normalizeMatchToken(flightCode)
      ) || null;

    return {
      rowNumber,
      client,
      zone,
      existingSurvey,
      action: existingSurvey ? 'update' : 'create',
      flightCode,
      missionName: missionName || `Misión ${flightCode}`,
      surveyDate,
      status,
      groundResolutionCm: gsd,
      droneModel,
      operator,
      notes: missionName || `Misión ${flightCode}`,
    };
  });

  return { delimiter, rows: previewRows };
}

export function previewStockpilesCsvImport(
  csvText: string,
  context: {
    clients: Client[];
    quarries: Quarry[];
    zones: Zone[];
    surveys: Survey[];
    stockpiles: Stockpile[];
    selectedClientId: number | 'auto';
    fallbackSurveyId?: number;
  }
): {
  delimiter: string;
  rows: ParsedStockpilePreviewRow[];
} {
  const { delimiter, rows } = parseCsvRecords(csvText);
  const { clients, quarries, zones, surveys, stockpiles, selectedClientId, fallbackSurveyId } =
    context;

  const previewRows: ParsedStockpilePreviewRow[] = rows.map(({ rowNumber, record }) => {
    const client = resolveClientForRow(record, clients, selectedClientId);
    const flightRefRaw = pickField(record, [
      'codigo_vuelo',
      'vuelo_vinculado',
      'vuelo',
      'flight_code',
      'cod_vuelo',
    ]);
    const code = pickField(record, ['codigo_acopio', 'codigo', 'cod_acopio', 'stockpile_code']);
    const name = pickField(record, ['acopio', 'nombre_acopio', 'nombre', 'stockpile', 'pila']);
    const stockpileType = parseStockpileType(pickField(record, ['tipo', 'type', 'stockpile_type']));
    const material = pickField(record, ['material', 'arido']) || 'Grava 20/40';
    const density = Math.max(
      0.1,
      parseFlexibleNumber(pickField(record, ['densidad_t_m3', 'densidad', 'density']), 1.68)
    );
    const baseElev = parseFlexibleNumber(
      pickField(record, ['cota_base_m', 'cota_base', 'cota', 'base_elevation_m']),
      115.0
    );
    const fillVol = Math.max(
      0,
      parseFlexibleNumber(pickField(record, ['relleno_m3', 'relleno', 'fill_m3', 'fill']), 0)
    );
    const cutVol = Math.max(
      0,
      parseFlexibleNumber(pickField(record, ['desmonte_m3', 'desmonte', 'cut_m3', 'cut']), 0)
    );
    const rawArea = pickField(record, ['superficie_m2', 'superficie', 'area_m2', 'area']);
    const parsedArea = rawArea ? Math.max(0, Math.round(parseFlexibleNumber(rawArea, 0))) : undefined;
    const netVol = Math.round((fillVol - cutVol) * 10) / 10;
    const tonnageEst = Math.round(Math.abs(netVol) * density * 10) / 10;
    const notes = pickField(record, ['observaciones', 'notas', 'notes']);

    if (!name && !code) {
      return {
        rowNumber,
        client,
        survey: null,
        existingStockpile: null,
        action: 'error',
        error: 'Falta el "codigo_acopio" y el nombre "acopio".',
        code: '',
        name: '',
        stockpileType,
        material,
        densityTonM3: density,
        baseElevationM: baseElev,
        areaM2: parsedArea,
        fillVolumeM3: fillVol,
        cutVolumeM3: cutVol,
        netVolumeM3: netVol,
        tonnageEst,
        notes,
      };
    }

    if (!client) {
      return {
        rowNumber,
        client: null,
        survey: null,
        existingStockpile: null,
        action: 'error',
        error:
          selectedClientId === 'auto'
            ? 'Cliente no identificado. Indica "codigo_cliente" válido o selecciona un cliente arriba.'
            : 'Cliente destino no encontrado.',
        code,
        name: name || code,
        stockpileType,
        material,
        densityTonM3: density,
        baseElevationM: baseElev,
        areaM2: parsedArea,
        fillVolumeM3: fillVol,
        cutVolumeM3: cutVol,
        netVolumeM3: netVol,
        tonnageEst,
        notes,
      };
    }

    const clientQuarryIds = new Set(quarries.filter((q) => q.clientId === client.id).map((q) => q.id));
    const clientZoneIds = new Set(
      zones.filter((z) => clientQuarryIds.has(z.quarryId)).map((z) => z.id)
    );
    const clientSurveys = surveys.filter((s) => clientZoneIds.has(s.zoneId));

    let survey: Survey | null = null;
    if (flightRefRaw) {
      const tok = normalizeMatchToken(flightRefRaw);
      survey = clientSurveys.find((s) => normalizeMatchToken(s.flightCode) === tok) || null;
    } else if (fallbackSurveyId) {
      survey = clientSurveys.find((s) => s.id === fallbackSurveyId) || clientSurveys[0] || null;
    } else {
      survey = clientSurveys[0] || null;
    }

    if (!survey) {
      return {
        rowNumber,
        client,
        survey: null,
        existingStockpile: null,
        action: 'error',
        error: flightRefRaw
          ? `Vuelo "${flightRefRaw}" no encontrado para ${client.name}. Importa o crea primero el vuelo.`
          : `El cliente ${client.name} no tiene vuelos registrados.`,
        code,
        name: name || code,
        stockpileType,
        material,
        densityTonM3: density,
        baseElevationM: baseElev,
        areaM2: parsedArea,
        fillVolumeM3: fillVol,
        cutVolumeM3: cutVol,
        netVolumeM3: netVol,
        tonnageEst,
        notes,
      };
    }

    const existingStockpile = code
      ? stockpiles.find(
          (st) =>
            st.surveyId === survey!.id &&
            normalizeMatchToken(st.code) === normalizeMatchToken(code)
        ) || null
      : null;

    return {
      rowNumber,
      client,
      survey,
      existingStockpile,
      action: existingStockpile ? 'update' : 'create',
      code: code || `ACO-${survey.id}-${rowNumber}`,
      name: name || code,
      stockpileType,
      material,
      densityTonM3: density,
      baseElevationM: baseElev,
      areaM2: parsedArea,
      fillVolumeM3: fillVol,
      cutVolumeM3: cutVol,
      netVolumeM3: netVol,
      tonnageEst,
      notes,
    };
  });

  return { delimiter, rows: previewRows };
}

export function commitFlightsCsvImport(rows: ParsedFlightPreviewRow[]): {
  created: number;
  updated: number;
  skipped: number;
} {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.action === 'error' || !row.zone) {
      skipped++;
      continue;
    }
    if (row.existingSurvey) {
      localDataStore.updateSurvey(row.existingSurvey.id, {
        zoneId: row.zone.id,
        flightCode: row.flightCode,
        surveyDate: row.surveyDate,
        status: row.status,
        groundResolutionCm: row.groundResolutionCm,
        droneModel: row.droneModel,
        operator: row.operator,
        notes: row.notes,
      });
      updated++;
    } else {
      localDataStore.createSurvey({
        zoneId: row.zone.id,
        flightCode: row.flightCode,
        surveyDate: row.surveyDate,
        status: row.status,
        groundResolutionCm: row.groundResolutionCm,
        droneModel: row.droneModel,
        operator: row.operator,
        notes: row.notes,
        fillVolumeM3: 0,
        cutVolumeM3: 0,
        netVolumeM3: 0,
        tonnageEst: 0,
      });
      created++;
    }
  }

  return { created, updated, skipped };
}

export function commitStockpilesCsvImport(rows: ParsedStockpilePreviewRow[]): {
  created: number;
  updated: number;
  skipped: number;
} {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.action === 'error' || !row.survey) {
      skipped++;
      continue;
    }
    if (row.existingStockpile) {
      localDataStore.updateStockpile(row.existingStockpile.id, {
        surveyId: row.survey.id,
        code: row.code,
        name: row.name,
        stockpileType: row.stockpileType,
        material: row.material,
        densityTonM3: row.densityTonM3,
        baseElevationM: row.baseElevationM,
        areaM2: row.areaM2,
        fillVolumeM3: row.fillVolumeM3,
        cutVolumeM3: row.cutVolumeM3,
        notes: row.notes,
      });
      updated++;
    } else {
      localDataStore.createStockpile({
        surveyId: row.survey.id,
        code: row.code,
        name: row.name,
        stockpileType: row.stockpileType,
        material: row.material,
        densityTonM3: row.densityTonM3,
        baseElevationM: row.baseElevationM,
        areaM2: row.areaM2,
        fillVolumeM3: row.fillVolumeM3,
        cutVolumeM3: row.cutVolumeM3,
        notes: row.notes,
      });
      created++;
    }
  }

  return { created, updated, skipped };
}

function triggerCsvDownload(fileName: string, lines: string[]): void {
  const content = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadFlightsCsvTemplate(options?: {
  client?: Client | null;
  zones?: Zone[];
}): void {
  const clientCode = options?.client?.code || 'C110';
  const z1 = options?.zones?.[0]?.code || 'ZON-AC-01';
  const z2 = options?.zones?.[1]?.code || z1;
  const today = formatDateEu(new Date());

  const header = [
    'codigo_cliente',
    'codigo_zona',
    'codigo_vuelo',
    'mision',
    'fecha_levantamiento',
    'estado',
    'gsd_cm_px',
    'dron_modelo',
    'operador',
  ].join(';');

  const sample1 = [
    clientCode,
    z1,
    'VUE-MOD-001',
    'Levantamiento Mensual Acopios',
    today,
    'active',
    '1.8',
    'DJI Matrice 4E RTK',
    'INGEODRON',
  ].join(';');

  const sample2 = [
    clientCode,
    z2,
    'VUE-MOD-002',
    'Control Frente Norte',
    today,
    'pending',
    '2.0',
    'DJI Matrice 4E RTK',
    'INGEODRON',
  ].join(';');

  const safeCode = clientCode.replace(/[^A-Za-z0-9_-]/g, '');
  triggerCsvDownload(`Modelo_Vuelos_${safeCode}.csv`, [header, sample1, sample2]);
}

export function downloadStockpilesCsvTemplate(options?: {
  client?: Client | null;
  surveys?: Survey[];
}): void {
  const clientCode = options?.client?.code || 'C110';
  const s1 = options?.surveys?.[0]?.flightCode || 'VUE-MOD-001';
  const s2 = options?.surveys?.[1]?.flightCode || s1;

  const header = [
    'codigo_cliente',
    'codigo_vuelo',
    'codigo_acopio',
    'acopio',
    'tipo',
    'material',
    'densidad_t_m3',
    'cota_base_m',
    'superficie_m2',
    'relleno_m3',
    'desmonte_m3',
    'observaciones',
  ].join(';');

  const sample1 = [
    clientCode,
    s1,
    'ACO-MOD-01',
    'Acopio Grava 20/40 Norte',
    'stockpile',
    'Grava 20/40',
    '1.68',
    '115.0',
    '4250',
    '28400',
    '0',
    'Medicion fotogrametrica RTK',
  ].join(';');

  const sample2 = [
    clientCode,
    s2,
    'ACO-MOD-02',
    'Frente Extraccion Sur',
    'bench_extraction',
    'Zahorra ZA',
    '1.72',
    '112.5',
    '2100',
    '1200',
    '14500',
    'Avance mensual frente sur',
  ].join(';');

  const safeCode = clientCode.replace(/[^A-Za-z0-9_-]/g, '');
  triggerCsvDownload(`Modelo_Acopios_${safeCode}.csv`, [header, sample1, sample2]);
}
