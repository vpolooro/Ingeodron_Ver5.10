import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Check,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Layers,
  Palette,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Client,
  DxfPolygonRegion,
  FlightDxfOverlay,
  Quarry,
  Stockpile,
  Survey,
  Zone,
} from '../types.ts';
import {
  DXF_DEFAULT_COLOR_PALETTE,
  autoMatchDxfPolygonsToStockpiles,
} from '../utils/dxfOverlayParser.ts';
import { formatDateEu } from '../utils/dateUtils.ts';
import { formatEsInt, formatEsNumber } from '../utils/numberFormat.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface FlightDxfManagerProps {
  clients: Client[];
  quarries: Quarry[];
  zones: Zone[];
  surveys: Survey[];
  stockpiles: Stockpile[];
  overlays: FlightDxfOverlay[];
  activeClient?: Client | null;
  activeQuarry?: Quarry | null;
  activeFlight?: Survey;
  onOverlaySaved: (overlay: FlightDxfOverlay) => void;
  onOverlayDeleted: (surveyId: number) => void;
  onNotify: (title: string, msg: string, variant?: 'info' | 'success' | 'error') => void;
}

function getAuthHeaderMap(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ingeodron_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(245, 158, 11, ${alpha})`;
}

export const FlightDxfManager: React.FC<FlightDxfManagerProps> = ({
  clients,
  quarries,
  zones,
  surveys,
  stockpiles,
  overlays,
  activeClient,
  activeQuarry,
  activeFlight,
  onOverlaySaved,
  onOverlayDeleted,
  onNotify,
}) => {
  const [selectedClientId, setSelectedClientId] = useState<number>(
    () => activeClient?.id || clients[0]?.id || 0
  );
  const [selectedQuarryId, setSelectedQuarryId] = useState<number>(
    () => activeQuarry?.id || quarries[0]?.id || 0
  );
  const [selectedSurveyId, setSelectedSurveyId] = useState<number>(
    () => activeFlight?.id || surveys[0]?.id || 0
  );

  const [draftPolygons, setDraftPolygons] = useState<DxfPolygonRegion[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedPolyId, setSelectedPolyId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const clientQuarries = useMemo(
    () => quarries.filter((q) => q.clientId === selectedClientId),
    [quarries, selectedClientId]
  );

  useEffect(() => {
    if (clientQuarries.length === 0) {
      setSelectedQuarryId(0);
      return;
    }
    if (!clientQuarries.some((q) => q.id === selectedQuarryId)) {
      setSelectedQuarryId(clientQuarries[0].id);
    }
  }, [clientQuarries, selectedQuarryId]);

  const quarrySurveys = useMemo(() => {
    const zIds = new Set(zones.filter((z) => z.quarryId === selectedQuarryId).map((z) => z.id));
    return surveys
      .filter((s) => zIds.has(s.zoneId))
      .sort((a, b) => (b.surveyDate || '').localeCompare(a.surveyDate || '') || b.id - a.id);
  }, [zones, surveys, selectedQuarryId]);

  useEffect(() => {
    if (quarrySurveys.length === 0) {
      setSelectedSurveyId(0);
      return;
    }
    if (!quarrySurveys.some((s) => s.id === selectedSurveyId)) {
      setSelectedSurveyId(quarrySurveys[0].id);
    }
  }, [quarrySurveys, selectedSurveyId]);

  const currentClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );
  const currentQuarry = useMemo(
    () => quarries.find((q) => q.id === selectedQuarryId) || null,
    [quarries, selectedQuarryId]
  );
  const currentSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedSurveyId) || null,
    [surveys, selectedSurveyId]
  );

  const flightStockpiles = useMemo(
    () => stockpiles.filter((st) => st.surveyId === selectedSurveyId),
    [stockpiles, selectedSurveyId]
  );

  const currentOverlay = useMemo(
    () => overlays.find((o) => o.surveyId === selectedSurveyId) || null,
    [overlays, selectedSurveyId]
  );

  useEffect(() => {
    if (currentOverlay) {
      setDraftPolygons(currentOverlay.polygons.map((p) => ({ ...p })));
      setSelectedPolyId(currentOverlay.polygons[0]?.id ?? null);
    } else {
      setDraftPolygons([]);
      setSelectedPolyId(null);
    }
    setHasUnsavedChanges(false);
  }, [currentOverlay]);

  const handleUploadDxf = async (file: File | null) => {
    if (!file || !currentSurvey) return;
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      onNotify(
        'Formato no compatible',
        'Sube un archivo CAD ASCII en formato .DXF con polígonos y superficies 3D.',
        'error'
      );
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (currentClient) {
        formData.append('clientId', String(currentClient.id));
        formData.append('clientCode', currentClient.code);
        formData.append('clientName', currentClient.name);
      }
      if (currentQuarry) {
        formData.append('quarryId', String(currentQuarry.id));
      }
      formData.append('flightCode', currentSurvey.flightCode);
      formData.append('flightNotes', currentSurvey.notes || 'Vuelo');
      formData.append(
        'stockpilesJson',
        JSON.stringify(
          flightStockpiles.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            material: s.material,
          }))
        )
      );

      const resp = await fetch(`/api/flights/${currentSurvey.id}/dxf`, {
        method: 'POST',
        headers: getAuthHeaderMap(),
        body: formData,
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.overlay) {
        throw new Error(payload?.error || 'No se pudo procesar el archivo DXF.');
      }

      const savedOverlay = payload.overlay as FlightDxfOverlay;
      onOverlaySaved(savedOverlay);
      setDraftPolygons(savedOverlay.polygons);
      setSelectedPolyId(savedOverlay.polygons[0]?.id ?? null);
      setHasUnsavedChanges(false);

      onNotify(
        'DXF 3D Cargado',
        `${savedOverlay.fileName}: ${savedOverlay.polygons.length} polígono(s) y ${formatEsInt(
          savedOverlay.surfaceCount
        )} triángulos 3D guardados para ${currentSurvey.flightCode}.`,
        'success'
      );
    } catch (err: unknown) {
      onNotify(
        'Error al Subir DXF',
        err instanceof Error ? err.message : 'No se pudo leer el archivo DXF.',
        'error'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const updatePolygonDraft = (polyId: string, patch: Partial<DxfPolygonRegion>) => {
    setDraftPolygons((prev) => prev.map((p) => (p.id === polyId ? { ...p, ...patch } : p)));
    setHasUnsavedChanges(true);
  };

  const handleAutoMatch = () => {
    if (draftPolygons.length === 0 || flightStockpiles.length === 0) return;
    const matched = autoMatchDxfPolygonsToStockpiles(draftPolygons, flightStockpiles);
    setDraftPolygons(matched);
    setHasUnsavedChanges(true);
    const assignedCount = matched.filter((p) => Boolean(p.stockpileId)).length;
    onNotify(
      'Emparejamiento Automático',
      `Se han enlazado ${assignedCount} de ${matched.length} polígono(s) con acopios del vuelo. Pulsa «Guardar Asignaciones» para confirmar.`,
      'info'
    );
  };

  const handleSaveAssignments = async () => {
    if (!currentSurvey || !currentOverlay) return;
    setIsSaving(true);
    try {
      const resp = await fetch(`/api/flights/${currentSurvey.id}/dxf/assignments`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaderMap(),
        },
        body: JSON.stringify({
          polygons: draftPolygons.map((p) => ({
            id: p.id,
            color: p.color,
            stockpileId: p.stockpileId ?? null,
            label: p.label,
            visible: p.visible !== false,
          })),
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.overlay) {
        throw new Error(payload?.error || 'No se pudieron guardar las asignaciones.');
      }
      onOverlaySaved(payload.overlay as FlightDxfOverlay);
      setHasUnsavedChanges(false);
      onNotify(
        'Asignaciones Guardadas',
        `Los colores y acopios del DXF ya están sincronizados con el Visor 2D y 3D para ${currentSurvey.flightCode}.`,
        'success'
      );
    } catch (err: unknown) {
      onNotify(
        'Error al Guardar',
        err instanceof Error ? err.message : 'No se pudieron guardar las asignaciones DXF.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDxf = async () => {
    setShowConfirmDelete(false);
    if (!currentSurvey) return;
    try {
      const resp = await fetch(`/api/flights/${currentSurvey.id}/dxf`, {
        method: 'DELETE',
        headers: getAuthHeaderMap(),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo eliminar el archivo DXF.');
      }
      onOverlayDeleted(currentSurvey.id);
      setDraftPolygons([]);
      setHasUnsavedChanges(false);
      onNotify(
        'DXF Eliminado',
        `El archivo DXF 3D de ${currentSurvey.flightCode} se ha eliminado del servidor.`,
        'success'
      );
    } catch (err: unknown) {
      onNotify(
        'Error al Eliminar',
        err instanceof Error ? err.message : 'No se pudo eliminar el archivo DXF.',
        'error'
      );
    }
  };

  const svgProjection = useMemo(() => {
    if (!currentOverlay || draftPolygons.length === 0) return null;
    const { minX, maxX, minY, maxY } = currentOverlay.bounds;
    const spanX = Math.max(1e-3, maxX - minX);
    const spanY = Math.max(1e-3, maxY - minY);
    const viewW = 520;
    const viewH = 360;
    const pad = 28;
    const scale = Math.min((viewW - pad * 2) / spanX, (viewH - pad * 2) / spanY);
    const offsetX = (viewW - spanX * scale) * 0.5;
    const offsetY = (viewH - spanY * scale) * 0.5;

    const toSvg = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: viewH - (offsetY + (y - minY) * scale),
    });

    return { viewW, viewH, toSvg };
  }, [currentOverlay, draftPolygons]);

  const assignedCount = useMemo(
    () => draftPolygons.filter((p) => Boolean(p.stockpileId)).length,
    [draftPolygons]
  );

  return (
    <div className="space-y-5">
      {/* Selector Cliente / Explotación / Vuelo + Subida DXF */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-gray-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>Perímetros y Superficies 3D por Vuelo (.DXF)</span>
            </h3>
            <p className="text-xs text-gray-400">
              Sube un archivo <span className="font-mono text-cyan-300">.DXF</span> por cada vuelo con las superficies 3D de las zonas de acopio delimitadas por sus polígonos. Asigna a cada polígono su{' '}
              <span className="text-amber-300 font-semibold">color identificador</span> y el{' '}
              <span className="text-emerald-300 font-semibold">acopio correspondiente</span> para superponerlo en los visores 2D y 3D.
            </p>
          </div>

          {currentOverlay && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const token = localStorage.getItem('ingeodron_token');
                  const a = document.createElement('a');
                  a.href = `/api/flights/${currentOverlay.surveyId}/dxf/download${
                    token ? `?token=${encodeURIComponent(token)}` : ''
                  }`;
                  a.download = currentOverlay.fileName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="px-3 py-1.5 bg-[#0b0f17] hover:bg-gray-800 text-cyan-300 border border-cyan-500/35 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar DXF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/35 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar DXF</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
              1. Cliente
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(Number(e.target.value))}
              className="w-full bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 rounded-lg p-2.5 text-white outline-none cursor-pointer"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
              2. Explotación / Cantera
            </label>
            <select
              value={selectedQuarryId}
              onChange={(e) => setSelectedQuarryId(Number(e.target.value))}
              disabled={clientQuarries.length === 0}
              className="w-full bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 rounded-lg p-2.5 text-white outline-none cursor-pointer disabled:opacity-50"
            >
              {clientQuarries.length === 0 ? (
                <option value={0}>Sin explotaciones registradas</option>
              ) : (
                clientQuarries.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.code} · {q.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
              3. Vuelo Fotogramétrico
            </label>
            <select
              value={selectedSurveyId}
              onChange={(e) => setSelectedSurveyId(Number(e.target.value))}
              disabled={quarrySurveys.length === 0}
              className="w-full bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 rounded-lg p-2.5 text-white outline-none cursor-pointer disabled:opacity-50"
            >
              {quarrySurveys.length === 0 ? (
                <option value={0}>Sin vuelos en esta explotación</option>
              ) : (
                quarrySurveys.map((s) => {
                  const hasDxf = overlays.some((o) => o.surveyId === s.id);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.flightCode} · {formatDateEu(s.surveyDate)}
                      {hasDxf ? ' [DXF 3D ✓]' : ''}
                    </option>
                  );
                })
              )}
            </select>
          </div>
        </div>

        {/* Upload Dropzone & Summary */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0b0f17]/80 border border-dashed border-cyan-500/40 rounded-xl p-4">
          <div className="space-y-1 text-xs">
            {currentOverlay ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-semibold text-[11px]">
                    <Check className="w-3 h-3" /> Archivo DXF Activo
                  </span>
                  <span className="font-mono font-bold text-white">{currentOverlay.fileName}</span>
                  <span className="text-gray-400">({currentOverlay.fileSize})</span>
                </div>
                <div className="text-[11px] font-mono text-cyan-300/90 break-all">
                  {currentOverlay.relativePath}
                </div>
                <div className="text-[11px] text-gray-400 flex flex-wrap gap-3 pt-0.5">
                  <span>
                    Polígonos 3D: <strong className="text-white">{draftPolygons.length}</strong>
                  </span>
                  <span>
                    Superficies 3DFACE/Malla:{' '}
                    <strong className="text-white">{formatEsInt(currentOverlay.surfaceCount)}</strong>
                  </span>
                  <span>
                    Enlazados a acopios:{' '}
                    <strong className="text-emerald-300">
                      {assignedCount} / {draftPolygons.length}
                    </strong>
                  </span>
                  <span>
                    Acopios en este vuelo:{' '}
                    <strong className="text-amber-300">{flightStockpiles.length}</strong>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-gray-200">
                  {currentSurvey
                    ? `No hay archivo DXF 3D subido todavía para el vuelo ${currentSurvey.flightCode}.`
                    : 'Selecciona un vuelo para asociar su archivo DXF 3D.'}
                </div>
                <div className="text-[11px] text-gray-400">
                  Admite entidades CAD ASCII: <span className="font-mono text-gray-300">POLYLINE 3D</span>,{' '}
                  <span className="font-mono text-gray-300">LWPOLYLINE</span>,{' '}
                  <span className="font-mono text-gray-300">3DFACE</span>, mallas poliédricas y etiquetas{' '}
                  <span className="font-mono text-gray-300">TEXT / MTEXT</span>.
                </div>
              </>
            )}
          </div>

          <label
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition shrink-0 ${
              !currentSurvey || isUploading
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow cursor-pointer'
            }`}
          >
            {isUploading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>
              {isUploading
                ? 'Procesando DXF…'
                : currentOverlay
                  ? 'Reemplazar Archivo .DXF'
                  : 'Subir Archivo .DXF 3D'}
            </span>
            <input
              type="file"
              accept=".dxf"
              disabled={!currentSurvey || isUploading}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                e.target.value = '';
                void handleUploadDxf(file);
              }}
            />
          </label>
        </div>
      </div>

      {/* Preview + Polygon-to-Stockpile Assignment */}
      {currentOverlay && draftPolygons.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Interactive 2D Plan Preview of DXF Polygons */}
          <div className="xl:col-span-5 glass-panel p-4 rounded-2xl border border-gray-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Vista Previa Planta DXF</span>
              </h4>
              <span className="text-[10px] font-mono text-gray-400">
                Clic en un polígono para editar
              </span>
            </div>

            {svgProjection && (
              <div className="bg-[#070b12] border border-gray-800 rounded-xl overflow-hidden">
                <svg
                  viewBox={`0 0 ${svgProjection.viewW} ${svgProjection.viewH}`}
                  className="w-full h-[300px] sm:h-[340px] block"
                >
                  <defs>
                    <pattern id="dxf-preview-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path
                        d="M 32 0 L 0 0 0 32"
                        fill="none"
                        stroke="rgba(56, 189, 248, 0.08)"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width={svgProjection.viewW} height={svgProjection.viewH} fill="url(#dxf-preview-grid)" />

                  {draftPolygons.map((poly) => {
                    const isHidden = poly.visible === false;
                    const isSel = selectedPolyId === poly.id;
                    const pts = poly.vertices.map((v) => svgProjection.toSvg(v.x, v.y));
                    const ptsStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                    const c = svgProjection.toSvg(poly.centroid.x, poly.centroid.y);
                    const linkedStockpile = poly.stockpileId
                      ? flightStockpiles.find((s) => s.id === poly.stockpileId)
                      : undefined;

                    return (
                      <g
                        key={poly.id}
                        className="cursor-pointer"
                        opacity={isHidden ? 0.28 : 1}
                        onClick={() => setSelectedPolyId(poly.id)}
                      >
                        <polygon
                          points={ptsStr}
                          fill={hexToRgba(poly.color, isSel ? 0.42 : 0.24)}
                          stroke={poly.color}
                          strokeWidth={isSel ? 3 : 1.8}
                        />
                        {linkedStockpile ? (
                          <g>
                            <rect
                              x={c.x - 32}
                              y={c.y - 10}
                              width={64}
                              height={20}
                              rx={4}
                              fill="rgba(11, 15, 23, 0.92)"
                              stroke={poly.color}
                              strokeWidth={1.2}
                            />
                            <text
                              x={c.x}
                              y={c.y + 3.5}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="10"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {linkedStockpile.code}
                            </text>
                          </g>
                        ) : (
                          <g>
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r={10}
                              fill="rgba(11, 15, 23, 0.9)"
                              stroke={poly.color}
                              strokeWidth={1.4}
                            />
                            <text
                              x={c.x}
                              y={c.y + 3.5}
                              textAnchor="middle"
                              fill="#e2e8f0"
                              fontSize="9.5"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              #{poly.index}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-[#0b0f17] border border-gray-800 rounded-xl p-2.5 text-gray-300">
              <div>
                <span className="text-gray-500 block font-sans text-[10px]">Rango X / Este</span>
                {formatEsNumber(currentOverlay.bounds.minX, 1)} – {formatEsNumber(currentOverlay.bounds.maxX, 1)}
              </div>
              <div>
                <span className="text-gray-500 block font-sans text-[10px]">Rango Y / Norte</span>
                {formatEsNumber(currentOverlay.bounds.minY, 1)} – {formatEsNumber(currentOverlay.bounds.maxY, 1)}
              </div>
              <div className="col-span-2 pt-1 border-t border-gray-800/80">
                <span className="text-gray-500 font-sans text-[10px] mr-2">Cota Z DXF:</span>
                <span className="text-cyan-300">
                  {formatEsNumber(currentOverlay.bounds.minZ, 2)} m –{' '}
                  {formatEsNumber(currentOverlay.bounds.maxZ, 2)} m
                </span>
              </div>
            </div>
          </div>

          {/* Assignment Table (Color + Stockpile + Label + Visibility) */}
          <div className="xl:col-span-7 glass-panel p-4 rounded-2xl border border-gray-800 flex flex-col space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Asignación de Color y Acopio por Polígono 3D</span>
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Define el color y vincula cada perímetro del DXF con su acopio del vuelo{' '}
                  <span className="font-mono text-blue-300">{currentSurvey?.flightCode}</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {flightStockpiles.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoMatch}
                    className="px-2.5 py-1.5 bg-[#0b0f17] hover:bg-gray-800 text-amber-300 border border-amber-500/35 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                    title="Intentar emparejar automáticamente polígonos y acopios por código o nombre"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-emparejar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveAssignments()}
                  disabled={isSaving}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${
                    hasUnsavedChanges
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow ring-2 ring-emerald-400/40'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow'
                  } disabled:opacity-50`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Guardando…' : 'Guardar Asignaciones'}</span>
                </button>
              </div>
            </div>

            {flightStockpiles.length === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/35 rounded-xl px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Este vuelo no tiene acopios registrados en la pestaña Vuelos. Puedes asignar colores y etiquetas igualmente o registrar los acopios primero.
                </span>
              </div>
            )}

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {draftPolygons.map((poly) => {
                const isSel = selectedPolyId === poly.id;
                const isVisible = poly.visible !== false;
                const assignedStockpile = poly.stockpileId
                  ? flightStockpiles.find((s) => s.id === poly.stockpileId)
                  : undefined;

                return (
                  <div
                    key={poly.id}
                    onClick={() => setSelectedPolyId(poly.id)}
                    className={`rounded-xl border p-3 transition space-y-2.5 ${
                      isSel
                        ? 'bg-[#121c2e] border-cyan-500/60 shadow'
                        : 'bg-[#0b0f17]/80 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-6 h-6 rounded-lg border border-white/25 text-[10px] font-mono font-bold text-white flex items-center justify-center shrink-0 shadow"
                          style={{ backgroundColor: poly.color }}
                        >
                          #{poly.index}
                        </span>
                        <input
                          type="text"
                          value={poly.label}
                          onChange={(e) => updatePolygonDraft(poly.id, { label: e.target.value })}
                          className="bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 rounded-lg px-2.5 py-1 text-xs font-semibold text-white outline-none min-w-[140px] flex-1"
                          placeholder="Etiqueta del polígono DXF"
                        />
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 shrink-0">
                          Capa: {poly.layer}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-gray-400">
                          {formatEsInt(poly.areaM2)} m² · Z {formatEsNumber(poly.minZ, 1)}–
                          {formatEsNumber(poly.maxZ, 1)}m
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updatePolygonDraft(poly.id, { visible: !isVisible });
                          }}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            isVisible
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                              : 'bg-gray-800 text-gray-500 border-gray-700'
                          }`}
                          title={isVisible ? 'Visible en Visor 2D/3D' : 'Oculto en Visor 2D/3D'}
                        >
                          {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      {/* Color picker + swatches */}
                      <div className="sm:col-span-5 flex items-center gap-2 bg-[#070b12] border border-gray-800 rounded-lg px-2.5 py-1.5">
                        <span className="text-[10px] text-gray-400 font-semibold shrink-0">Color:</span>
                        <input
                          type="color"
                          value={poly.color}
                          onChange={(e) => updatePolygonDraft(poly.id, { color: e.target.value })}
                          className="w-6 h-6 rounded bg-transparent border border-gray-700 cursor-pointer p-0 shrink-0"
                          title="Elegir cualquier color para este polígono"
                        />
                        <div className="flex items-center gap-1 flex-wrap">
                          {DXF_DEFAULT_COLOR_PALETTE.slice(0, 6).map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updatePolygonDraft(poly.id, { color: hex });
                              }}
                              className={`w-4 h-4 rounded-full border cursor-pointer transition ${
                                poly.color.toLowerCase() === hex.toLowerCase()
                                  ? 'border-white scale-110'
                                  : 'border-gray-700 opacity-80 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Stockpile selector */}
                      <div className="sm:col-span-7 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-semibold shrink-0">Acopio:</span>
                        <select
                          value={poly.stockpileId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            updatePolygonDraft(poly.id, { stockpileId: val });
                          }}
                          className={`flex-1 bg-[#0b0f17] border rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer ${
                            assignedStockpile
                              ? 'border-emerald-500/50 text-emerald-200 font-semibold'
                              : 'border-gray-700 text-gray-300'
                          }`}
                        >
                          <option value="">— Sin asignar a ningún acopio —</option>
                          {flightStockpiles.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.code} · {st.name} ({st.material} · {formatEsInt(st.netVolumeM3)} m³)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showConfirmDelete}
        title="Eliminar Archivo DXF 3D del Vuelo"
        message={
          currentOverlay
            ? `¿Eliminar el archivo "${currentOverlay.fileName}" y todas las asignaciones de polígonos del vuelo ${currentSurvey?.flightCode || ''}?`
            : ''
        }
        confirmLabel="Eliminar DXF"
        variant="danger"
        onConfirm={() => void handleDeleteDxf()}
        onCancel={() => setShowConfirmDelete(false)}
      />
    </div>
  );
};
