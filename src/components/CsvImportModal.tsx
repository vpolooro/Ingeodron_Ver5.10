import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  Plane,
  Package,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Layers,
  Info,
} from 'lucide-react';
import { Client, Quarry, Zone, Survey, Stockpile } from '../types.ts';
import {
  CsvImportMode,
  ParsedFlightPreviewRow,
  ParsedStockpilePreviewRow,
  previewFlightsCsvImport,
  previewStockpilesCsvImport,
  commitFlightsCsvImport,
  commitStockpilesCsvImport,
  downloadFlightsCsvTemplate,
  downloadStockpilesCsvTemplate,
} from '../utils/csvImportUtils.ts';
import { formatDateEu } from '../utils/dateUtils.ts';
import { SortState, sortRowsBy, toggleSortState } from '../utils/tableSortUtils.ts';
import { SortableTh } from './SortableTh.tsx';

interface CsvImportModalProps {
  open: boolean;
  initialMode: CsvImportMode;
  clients: Client[];
  quarries: Quarry[];
  zones: Zone[];
  surveys: Survey[];
  stockpiles: Stockpile[];
  defaultClientId?: number | 'auto';
  onClose: () => void;
  onSuccess: (title: string, message: string) => Promise<void> | void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  open,
  initialMode,
  clients,
  quarries,
  zones,
  surveys,
  stockpiles,
  defaultClientId = 'auto',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<CsvImportMode>(initialMode);
  const [selectedClientId, setSelectedClientId] = useState<number | 'auto'>(defaultClientId);
  const [fallbackZoneId, setFallbackZoneId] = useState<number | undefined>(undefined);
  const [fallbackSurveyId, setFallbackSurveyId] = useState<number | undefined>(undefined);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvText, setCsvText] = useState<string>('');
  const [readError, setReadError] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [flightsSort, setFlightsSort] = useState<SortState<string> | null>(null);
  const [stockpilesSort, setStockpilesSort] = useState<SortState<string> | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setSelectedClientId(defaultClientId ?? 'auto');
      setCsvFileName('');
      setCsvText('');
      setReadError('');
      setIsImporting(false);
    }
  }, [open, initialMode, defaultClientId]);

  const targetClient = useMemo(() => {
    if (selectedClientId === 'auto') return null;
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  const scopedZones = useMemo(() => {
    if (!targetClient) return zones;
    const qIds = new Set(quarries.filter((q) => q.clientId === targetClient.id).map((q) => q.id));
    return zones.filter((z) => qIds.has(z.quarryId));
  }, [targetClient, quarries, zones]);

  const scopedSurveys = useMemo(() => {
    if (!targetClient) return surveys;
    const zIds = new Set(scopedZones.map((z) => z.id));
    return surveys.filter((s) => zIds.has(s.zoneId));
  }, [targetClient, scopedZones, surveys]);

  useEffect(() => {
    if (scopedZones.length > 0) {
      if (!fallbackZoneId || !scopedZones.some((z) => z.id === fallbackZoneId)) {
        setFallbackZoneId(scopedZones[0].id);
      }
    } else {
      setFallbackZoneId(undefined);
    }
  }, [scopedZones, fallbackZoneId]);

  useEffect(() => {
    if (scopedSurveys.length > 0) {
      if (!fallbackSurveyId || !scopedSurveys.some((s) => s.id === fallbackSurveyId)) {
        setFallbackSurveyId(scopedSurveys[0].id);
      }
    } else {
      setFallbackSurveyId(undefined);
    }
  }, [scopedSurveys, fallbackSurveyId]);

  const flightPreview = useMemo<{ delimiter: string; rows: ParsedFlightPreviewRow[] }>(() => {
    if (mode !== 'flights' || !csvText.trim()) {
      return { delimiter: ';', rows: [] };
    }
    return previewFlightsCsvImport(csvText, {
      clients,
      quarries,
      zones,
      surveys,
      selectedClientId,
      fallbackZoneId,
    });
  }, [mode, csvText, clients, quarries, zones, surveys, selectedClientId, fallbackZoneId]);

  const stockpilePreview = useMemo<{ delimiter: string; rows: ParsedStockpilePreviewRow[] }>(() => {
    if (mode !== 'stockpiles' || !csvText.trim()) {
      return { delimiter: ';', rows: [] };
    }
    return previewStockpilesCsvImport(csvText, {
      clients,
      quarries,
      zones,
      surveys,
      stockpiles,
      selectedClientId,
      fallbackSurveyId,
    });
  }, [mode, csvText, clients, quarries, zones, surveys, stockpiles, selectedClientId, fallbackSurveyId]);

  const sortedFlightRows = useMemo(() => {
    return sortRowsBy(flightPreview.rows, flightsSort, (row, key) => {
      switch (key) {
        case 'rowNumber':
          return row.rowNumber;
        case 'action':
          return row.action;
        case 'client':
          return row.client ? `${row.client.code} ${row.client.name}` : '';
        case 'zone':
          return row.zone ? `${row.zone.code} ${row.zone.name}` : '';
        case 'flightCode':
          return row.flightCode;
        case 'missionName':
          return row.missionName;
        case 'surveyDate':
          return row.surveyDate;
        case 'status':
          return row.error || row.status;
        default:
          return '';
      }
    });
  }, [flightPreview.rows, flightsSort]);

  const sortedStockpileRows = useMemo(() => {
    return sortRowsBy(stockpilePreview.rows, stockpilesSort, (row, key) => {
      switch (key) {
        case 'rowNumber':
          return row.rowNumber;
        case 'action':
          return row.action;
        case 'client':
          return row.client ? `${row.client.code} ${row.client.name}` : '';
        case 'flight':
          return row.survey?.flightCode || '';
        case 'code':
          return row.code;
        case 'name':
          return row.name;
        case 'fill':
          return row.fillVolumeM3;
        case 'net':
          return row.netVolumeM3;
        case 'detail':
          return row.error || 'Válido';
        default:
          return '';
      }
    });
  }, [stockpilePreview.rows, stockpilesSort]);

  const activeRows = mode === 'flights' ? flightPreview.rows : stockpilePreview.rows;

  const stats = useMemo(() => {
    let create = 0;
    let update = 0;
    let error = 0;
    for (const r of activeRows) {
      if (r.action === 'create') create++;
      else if (r.action === 'update') update++;
      else error++;
    }
    return { total: activeRows.length, create, update, error, valid: create + update };
  }, [activeRows]);

  if (!open) return null;

  const handleFileChange = async (file: File | undefined) => {
    setReadError('');
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) {
        setReadError('El archivo CSV seleccionado está vacío.');
        setCsvText('');
        setCsvFileName(file.name);
        return;
      }
      setCsvFileName(file.name);
      setCsvText(text);
    } catch {
      setReadError('No se pudo leer el archivo CSV seleccionado.');
    }
  };

  const handleDownloadModel = (templateType: CsvImportMode) => {
    const sampleClient = targetClient || clients[0] || null;
    const sampleClientQuarryIds = sampleClient
      ? new Set(quarries.filter((q) => q.clientId === sampleClient.id).map((q) => q.id))
      : new Set<number>();
    const sampleZones = sampleClient
      ? zones.filter((z) => sampleClientQuarryIds.has(z.quarryId))
      : zones;
    const sampleZoneIds = new Set(sampleZones.map((z) => z.id));
    const sampleSurveys = sampleClient
      ? surveys.filter((s) => sampleZoneIds.has(s.zoneId))
      : surveys;

    if (templateType === 'flights') {
      downloadFlightsCsvTemplate({ client: sampleClient, zones: sampleZones });
    } else {
      downloadStockpilesCsvTemplate({ client: sampleClient, surveys: sampleSurveys });
    }
  };

  const handleConfirmImport = async () => {
    if (stats.valid === 0 || isImporting) return;
    setIsImporting(true);
    try {
      if (mode === 'flights') {
        const res = commitFlightsCsvImport(flightPreview.rows);
        await onSuccess(
          'Vuelos Importados desde CSV',
          `Importación completada: ${res.created} creado(s), ${res.updated} actualizado(s)${
            res.skipped > 0 ? `, ${res.skipped} omitido(s) con error` : ''
          }.`
        );
      } else {
        const res = commitStockpilesCsvImport(stockpilePreview.rows);
        await onSuccess(
          'Acopios Importados desde CSV',
          `Importación completada: ${res.created} creado(s), ${res.updated} actualizado(s)${
            res.skipped > 0 ? `, ${res.skipped} omitido(s) con error` : ''
          }.`
        );
      }
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="glass-panel w-full max-w-5xl p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-3">
          <div>
            <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
              Importación Masiva desde CSV &amp; Descarga de Modelos
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Descarga la plantilla oficial en CSV, complétala en Excel y súbela para crear o actualizar vuelos y acopios de tus clientes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white cursor-pointer p-1"
            aria-label="Cerrar modal de importación CSV"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b0f17]/80 p-2 rounded-xl border border-gray-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('flights');
                setCsvFileName('');
                setCsvText('');
                setReadError('');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                mode === 'flights'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-gray-400 hover:text-white bg-gray-900/60 border border-gray-800'
              }`}
            >
              <Plane className="w-4 h-4" /> 1. Importar Vuelos (Misiones)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('stockpiles');
                setCsvFileName('');
                setCsvText('');
                setReadError('');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                mode === 'stockpiles'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white bg-gray-900/60 border border-gray-800'
              }`}
            >
              <Package className="w-4 h-4" /> 2. Importar Acopios (Cubicación)
            </button>
          </div>

          <span className="text-[11px] text-gray-400 px-2">
            Admite separador <code className="text-cyan-300">;</code> o <code className="text-cyan-300">,</code> y decimales europeos (<code className="text-cyan-300">1,68</code> o <code className="text-cyan-300">1.68</code>).
          </span>
        </div>

        {/* Step 1: Client Scope + Download Model */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
          <div className="bg-[#0b0f17]/75 border border-gray-800 rounded-xl p-3.5 space-y-3">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-amber-400" />
              Paso 1: Cliente Destino y Valor por Defecto
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-gray-400 text-[11px] mb-1">
                  Cliente para esta importación:
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedClientId(val === 'auto' ? 'auto' : parseInt(val, 10));
                  }}
                  className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-amber-300 font-semibold"
                >
                  <option value="auto">
                    Detectar automáticamente por columna codigo_cliente del CSV
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedClientId !== 'auto' && mode === 'flights' && (
                <div>
                  <label className="block text-gray-400 text-[11px] mb-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-cyan-400" />
                    Zona por defecto (si el CSV omite <code className="text-cyan-300">codigo_zona</code>):
                  </label>
                  <select
                    value={fallbackZoneId ?? ''}
                    onChange={(e) => setFallbackZoneId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                    className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-white"
                  >
                    {scopedZones.length === 0 ? (
                      <option value="">Este cliente no tiene zonas creadas</option>
                    ) : (
                      scopedZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.code} — {z.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {selectedClientId !== 'auto' && mode === 'stockpiles' && (
                <div>
                  <label className="block text-gray-400 text-[11px] mb-1 flex items-center gap-1">
                    <Plane className="w-3 h-3 text-sky-400" />
                    Vuelo por defecto (si el CSV omite <code className="text-sky-300">codigo_vuelo</code>):
                  </label>
                  <select
                    value={fallbackSurveyId ?? ''}
                    onChange={(e) => setFallbackSurveyId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                    className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-white"
                  >
                    {scopedSurveys.length === 0 ? (
                      <option value="">Este cliente no tiene vuelos registrados</option>
                    ) : (
                      scopedSurveys.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.flightCode} ({formatDateEu(s.surveyDate)}) — {s.notes || 'Misión'}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#0b0f17]/75 border border-gray-800 rounded-xl p-3.5 space-y-3 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Download className="w-4 h-4 text-emerald-400" />
                Paso 2: Descargar Archivos Modelo CSV
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Los modelos se generan con ejemplos reales de{' '}
                <strong className="text-white">
                  {targetClient ? `${targetClient.code} — ${targetClient.name}` : clients[0]?.name || 'tu cliente'}
                </strong>{' '}
                listos para abrir en Excel.
              </p>
              <div className="text-[10px] text-gray-400 bg-[#111827] border border-gray-800 rounded-lg p-2 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  {mode === 'flights'
                    ? 'Columnas Vuelos: codigo_cliente; codigo_zona; codigo_vuelo; mision; fecha_levantamiento; estado; gsd_cm_px; dron_modelo; operador'
                    : 'Columnas Acopios: codigo_cliente; codigo_vuelo; codigo_acopio; acopio; tipo; material; densidad_t_m3; cota_base_m; superficie_m2; relleno_m3; desmonte_m3; observaciones'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDownloadModel('flights')}
                className="flex-1 min-w-[160px] px-3 py-2 bg-sky-600/20 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/40 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Modelo Vuelos (.csv)
              </button>
              <button
                type="button"
                onClick={() => handleDownloadModel('stockpiles')}
                className="flex-1 min-w-[160px] px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Modelo Acopios (.csv)
              </button>
            </div>
          </div>
        </div>

        {/* Step 3: File Upload Dropzone */}
        <div className="bg-[#0b0f17]/75 border border-dashed border-gray-700 hover:border-blue-500/70 rounded-xl p-4 transition">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-blue-400" />
                Paso 3: Subir Archivo CSV de {mode === 'flights' ? 'Vuelos' : 'Acopios'}
              </div>
              <p className="text-[11px] text-gray-400">
                {csvFileName
                  ? `Archivo cargado: ${csvFileName} (${stats.total} fila(s) detectadas)`
                  : 'Selecciona un archivo .csv con los registros a importar. Si el código ya existe, se actualizará automáticamente.'}
              </p>
            </div>

            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow inline-flex items-center justify-center gap-2 transition cursor-pointer shrink-0">
              <Upload className="w-4 h-4" />
              <span>{csvFileName ? 'Cambiar CSV' : 'Seleccionar Archivo CSV'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  handleFileChange(file);
                }}
              />
            </label>
          </div>

          {readError && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{readError}</span>
            </div>
          )}
        </div>

        {/* Preview Summary & Table */}
        {csvText && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b0f17]/90 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs">
              <span className="font-semibold text-white">Vista Previa y Validación</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                  Crear: {stats.create}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono">
                  Actualizar: {stats.update}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded border font-mono ${
                    stats.error > 0
                      ? 'bg-red-500/15 text-red-300 border-red-500/30'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}
                >
                  Errores: {stats.error}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-64 border border-gray-800 rounded-xl">
              {mode === 'flights' ? (
                <table className="w-full min-w-[780px] text-left text-[11px] border-collapse">
                  <thead className="bg-[#0b0f17] sticky top-0 z-10 border-b border-gray-800 text-gray-400 uppercase text-[10px]">
                    <tr>
                      <SortableTh label="Fila" sortKey="rowNumber" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Acción" sortKey="action" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Cliente" sortKey="client" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Zona" sortKey="zone" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Código Vuelo" sortKey="flightCode" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Misión" sortKey="missionName" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Fecha" sortKey="surveyDate" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Estado / Detalle" sortKey="status" sortState={flightsSort} onSort={(k) => setFlightsSort((p) => toggleSortState(p, k))} className="p-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {sortedFlightRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-gray-400">
                          No se detectaron filas de datos en el archivo CSV.
                        </td>
                      </tr>
                    ) : (
                      sortedFlightRows.map((row) => (
                        <tr
                          key={`fp-${row.rowNumber}`}
                          className={row.action === 'error' ? 'bg-red-950/20' : 'hover:bg-gray-800/40'}
                        >
                          <td className="p-2.5 font-mono text-gray-400">#{row.rowNumber}</td>
                          <td className="p-2.5">
                            {row.action === 'create' ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                                Crear
                              </span>
                            ) : row.action === 'update' ? (
                              <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold">
                                Actualizar
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-semibold">
                                Error
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-gray-200">
                            {row.client ? `${row.client.code} · ${row.client.name}` : '—'}
                          </td>
                          <td className="p-2.5 text-cyan-300">
                            {row.zone ? `${row.zone.code} · ${row.zone.name}` : '—'}
                          </td>
                          <td className="p-2.5 font-mono text-sky-300 font-semibold">
                            {row.flightCode || '—'}
                          </td>
                          <td className="p-2.5 text-white max-w-[200px] truncate">{row.missionName}</td>
                          <td className="p-2.5 font-mono text-gray-300">{formatDateEu(row.surveyDate)}</td>
                          <td className="p-2.5">
                            {row.error ? (
                              <span className="text-red-300">{row.error}</span>
                            ) : (
                              <span className="text-gray-300 font-mono">
                                {row.status} · GSD {row.groundResolutionCm}cm
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[840px] text-left text-[11px] border-collapse">
                  <thead className="bg-[#0b0f17] sticky top-0 z-10 border-b border-gray-800 text-gray-400 uppercase text-[10px]">
                    <tr>
                      <SortableTh label="Fila" sortKey="rowNumber" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Acción" sortKey="action" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Cliente" sortKey="client" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Vuelo" sortKey="flight" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Código" sortKey="code" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Acopio & Material" sortKey="name" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                      <SortableTh label="Relleno / Desmonte" sortKey="fill" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} align="right" className="p-2.5" />
                      <SortableTh label="Neto / Tonelaje" sortKey="net" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} align="right" className="p-2.5" />
                      <SortableTh label="Detalle" sortKey="detail" sortState={stockpilesSort} onSort={(k) => setStockpilesSort((p) => toggleSortState(p, k))} className="p-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {sortedStockpileRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-gray-400">
                          No se detectaron filas de datos en el archivo CSV.
                        </td>
                      </tr>
                    ) : (
                      sortedStockpileRows.map((row) => (
                        <tr
                          key={`sp-${row.rowNumber}`}
                          className={row.action === 'error' ? 'bg-red-950/20' : 'hover:bg-gray-800/40'}
                        >
                          <td className="p-2.5 font-mono text-gray-400">#{row.rowNumber}</td>
                          <td className="p-2.5">
                            {row.action === 'create' ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                                Crear
                              </span>
                            ) : row.action === 'update' ? (
                              <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold">
                                Actualizar
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-semibold">
                                Error
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-gray-200">
                            {row.client ? `${row.client.code} · ${row.client.name}` : '—'}
                          </td>
                          <td className="p-2.5 font-mono text-sky-300">
                            {row.survey ? row.survey.flightCode : '—'}
                          </td>
                          <td className="p-2.5 font-mono text-indigo-300 font-semibold">
                            {row.code || '—'}
                          </td>
                          <td className="p-2.5">
                            <div className="text-white font-medium">{row.name || '—'}</div>
                            <div className="text-[10px] text-gray-400">
                              {row.material} · {row.densityTonM3.toFixed(2)} t/m³
                            </div>
                          </td>
                          <td className="p-2.5 text-right font-mono whitespace-nowrap">
                            <div className="text-emerald-400">+{row.fillVolumeM3.toLocaleString('es-ES')} m³</div>
                            <div className="text-red-400">-{row.cutVolumeM3.toLocaleString('es-ES')} m³</div>
                          </td>
                          <td className="p-2.5 text-right font-mono whitespace-nowrap">
                            <div className="text-blue-400 font-bold">{row.netVolumeM3.toLocaleString('es-ES')} m³</div>
                            <div className="text-cyan-300">{row.tonnageEst.toLocaleString('es-ES')} t</div>
                          </td>
                          <td className="p-2.5">
                            {row.error ? (
                              <span className="text-red-300">{row.error}</span>
                            ) : (
                              <span className="text-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Válido
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-gray-400">
            {stats.error > 0 && stats.valid > 0 && (
              <span className="text-amber-300">
                Las filas con error serán omitidas; solo se importarán las {stats.valid} filas válidas.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={stats.valid === 0 || isImporting}
              onClick={handleConfirmImport}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isImporting
                  ? 'Importando...'
                  : `Importar ${stats.valid} ${mode === 'flights' ? 'Vuelo(s)' : 'Acopio(s)'}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
