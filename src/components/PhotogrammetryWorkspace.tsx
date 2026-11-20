import React, { useEffect, useMemo, useState } from 'react';
import { Box, CheckCircle2, Eye, EyeOff, FileCode2, FolderUp, Image as ImageIcon, Map as MapIcon, Mountain, Plane, Upload } from 'lucide-react';
import { Quarry3DViewer, type External3DSource } from './Quarry3DViewer.tsx';
import { Quarry2DOrthophotoViewer } from './Quarry2DOrthophotoViewer.tsx';
import { buildQuarryTerrainData } from '../utils/quarryTerrainModel.ts';
import {
  isSupported3DFileName,
  isSupportedOrthoFileName,
  loadOrthophotoCanvasFromUrl,
} from '../utils/threeFileLoader.ts';
import type { Deliverable, FlightDxfOverlay, Quarry, Stockpile, Survey, Zone } from '../types.ts';
import { formatDateEu } from '../utils/dateUtils.ts';

interface PhotogrammetryWorkspaceProps {
  quarry: Quarry | null;
  zones: Zone[];
  stockpiles: Stockpile[];
  activeFlight?: Survey;
  deliverables?: Deliverable[];
  dxfOverlay?: FlightDxfOverlay | null;
  isAdmin?: boolean;
  preferredDeliverableId?: number | null;
  onOpenUploadModal?: () => void;
  onOpenDxfSettings?: () => void;
}

function appendAuthToken(rawUrl: string): string {
  if (typeof window === 'undefined' || !rawUrl || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  const token = localStorage.getItem('ingeodron_token');
  if (!token) return rawUrl;
  const separator = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${separator}token=${encodeURIComponent(token)}`;
}

export const PhotogrammetryWorkspace: React.FC<PhotogrammetryWorkspaceProps> = ({
  quarry,
  zones,
  stockpiles,
  activeFlight,
  deliverables = [],
  dxfOverlay = null,
  isAdmin = false,
  preferredDeliverableId = null,
  onOpenUploadModal,
  onOpenDxfSettings,
}) => {
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [showDxfOverlay, setShowDxfOverlay] = useState<boolean>(true);
  const [dxfOpacity, setDxfOpacity] = useState<number>(0.48);

  // Server deliverables strictly scoped to the single active quarry
  const quarryScopedDeliverables = useMemo(() => {
    if (!quarry || quarry.id <= 0) return [];
    return deliverables.filter((d) => d.quarryId === quarry.id);
  }, [deliverables, quarry]);

  // Server deliverables compatible with 3D Viewer & 2D Orthophoto
  const compatible3DDeliverables = useMemo(
    () =>
      quarryScopedDeliverables.filter(
        (d) => (d.hasPhysicalFile || Boolean(d.shareUrl)) && isSupported3DFileName(d.fileName)
      ),
    [quarryScopedDeliverables]
  );

  const compatibleOrthoDeliverables = useMemo(
    () =>
      quarryScopedDeliverables.filter(
        (d) => (d.hasPhysicalFile || Boolean(d.shareUrl)) && isSupportedOrthoFileName(d.fileName)
      ),
    [quarryScopedDeliverables]
  );

  const [selected3DKey, setSelected3DKey] = useState<string>('parametric');
  const [selectedOrthoKey, setSelectedOrthoKey] = useState<string>('parametric');
  const [local3DPreview, setLocal3DPreview] = useState<External3DSource | null>(null);
  const [localOrthoFile, setLocalOrthoFile] = useState<{ url: string; fileName: string } | null>(null);
  const [customOrthoCanvas, setCustomOrthoCanvas] = useState<HTMLCanvasElement | null>(null);
  const [localHintError, setLocalHintError] = useState<string | null>(null);
  const [localSuccessNotice, setLocalSuccessNotice] = useState<string | null>(null);

  // Reset active model/orthophoto selection when switching to another quarry so only one model is shown
  useEffect(() => {
    setSelected3DKey('parametric');
    setSelectedOrthoKey('parametric');
    setLocal3DPreview(null);
    setLocalOrthoFile(null);
    setCustomOrthoCanvas(null);
    setLocalHintError(null);
    setLocalSuccessNotice(null);
  }, [quarry?.id]);

  // Auto-select newly uploaded 3D or Orthophoto deliverable when uploaded from this workspace
  useEffect(() => {
    if (!preferredDeliverableId) return;
    const d3 = compatible3DDeliverables.find((d) => d.id === preferredDeliverableId);
    if (d3) {
      setSelected3DKey(`deliv:${d3.id}`);
      return;
    }
    const dO = compatibleOrthoDeliverables.find((d) => d.id === preferredDeliverableId);
    if (dO) {
      setSelectedOrthoKey(`deliv:${dO.id}`);
    }
  }, [preferredDeliverableId, compatible3DDeliverables, compatibleOrthoDeliverables]);

  // Revoke object URLs on change/unmount
  useEffect(() => {
    return () => {
      if (local3DPreview?.url.startsWith('blob:')) {
        URL.revokeObjectURL(local3DPreview.url);
      }
    };
  }, [local3DPreview]);

  useEffect(() => {
    return () => {
      if (localOrthoFile?.url.startsWith('blob:')) {
        URL.revokeObjectURL(localOrthoFile.url);
      }
    };
  }, [localOrthoFile]);

  const activeExternal3DSource = useMemo<External3DSource | null>(() => {
    if (selected3DKey === 'local' && local3DPreview) {
      return local3DPreview;
    }
    if (selected3DKey.startsWith('deliv:')) {
      const id = Number(selected3DKey.slice(6));
      const d = compatible3DDeliverables.find((item) => item.id === id);
      if (d) {
        return {
          url: appendAuthToken(d.shareUrl || `${d.fileUrl}?inline=1`),
          fileName: d.fileName,
          label: d.title || d.fileName,
        };
      }
    }
    return null;
  }, [selected3DKey, local3DPreview, compatible3DDeliverables]);

  // Load selected Orthophoto canvas when changed
  useEffect(() => {
    let cancelled = false;

    const resolveUrlAndName = (): { url: string; fileName: string } | null => {
      if (selectedOrthoKey === 'local' && localOrthoFile) {
        return localOrthoFile;
      }
      if (selectedOrthoKey.startsWith('deliv:')) {
        const id = Number(selectedOrthoKey.slice(6));
        const d = compatibleOrthoDeliverables.find((item) => item.id === id);
        if (d) {
          return {
            url: appendAuthToken(d.shareUrl || `${d.fileUrl}?inline=1`),
            fileName: d.fileName,
          };
        }
      }
      return null;
    };

    const target = resolveUrlAndName();
    if (!target) {
      setCustomOrthoCanvas(null);
      return;
    }

    loadOrthophotoCanvasFromUrl(target.url, target.fileName)
      .then((canvas) => {
        if (!cancelled) {
          setCustomOrthoCanvas(canvas);
          setLocalHintError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCustomOrthoCanvas(null);
          setLocalHintError(err instanceof Error ? err.message : 'No se pudo cargar la ortofoto.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrthoKey, localOrthoFile, compatibleOrthoDeliverables]);

  useEffect(() => {
    if (isAdmin) return;
    setLocal3DPreview(null);
    setLocalOrthoFile(null);
    setSelected3DKey((k) => (k === 'local' ? 'parametric' : k));
    setSelectedOrthoKey((k) => (k === 'local' ? 'parametric' : k));
  }, [isAdmin]);

  const handleLocalPreviewFile = (file: File | null) => {
    if (!isAdmin || !file) return;
    setLocalHintError(null);
    setLocalSuccessNotice(null);
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.laz')) {
      setLocalHintError(
        'Los archivos comprimidos .LAZ deben convertirse primero a .LAS, .PLY, .XYZ, .OBJ o .GLB para cargarse directamente en el visor web.'
      );
      return;
    }

    if (isSupported3DFileName(file.name)) {
      const url = URL.createObjectURL(file);
      setLocal3DPreview({
        url,
        fileName: file.name,
        label: `Local: ${file.name}`,
      });
      setSelected3DKey('local');
      setViewerMode('3d');
      setLocalSuccessNotice(`Archivo 3D cargado correctamente en el visor: ${file.name}`);
      return;
    }

    if (isSupportedOrthoFileName(file.name)) {
      const url = URL.createObjectURL(file);
      setLocalOrthoFile({ url, fileName: file.name });
      setSelectedOrthoKey('local');
      setLocalSuccessNotice(`Ortofoto cargada correctamente en el visor: ${file.name}`);
      return;
    }

    setLocalHintError(
      'Formato no compatible para vista 3D/Ortofoto. Usa .OBJ, .GLB, .GLTF, .PLY, .STL, .LAS, .XYZ, .PCD, .CSV/.TXT o ortofotos .PNG/.JPG/.TIF.'
    );
  };

  // Scope stockpiles to active flight if one is selected, otherwise latest stockpiles in quarry
  const scopedStockpiles = useMemo(() => {
    if (activeFlight) {
      const flightItems = stockpiles.filter((s) => s.surveyId === activeFlight.id);
      if (flightItems.length > 0) return flightItems;
    }
    return stockpiles;
  }, [stockpiles, activeFlight]);

  const terrain = useMemo(
    () => buildQuarryTerrainData(quarry, zones, scopedStockpiles),
    [quarry, zones, scopedStockpiles]
  );

  return (
    <section className="flex-1 flex flex-col gap-4 min-h-0">
      {/* Header & Workspace Switcher */}
      <div className="glass-panel border border-gray-800 rounded-2xl p-4 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
              <Mountain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-2">
                <span>Visor Fotogramétrico 3D &amp; Planos Georreferenciados</span>
                {activeFlight && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
                    <Plane className="w-3 h-3" /> {activeFlight.flightCode} ({formatDateEu(activeFlight.surveyDate)})
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400">
                {quarry?.name || 'Explotación Activa'} · Cota Z automática
              </p>
            </div>
          </div>

          <div className="inline-flex bg-[#0b0f17] border border-gray-800 rounded-xl p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewerMode('3d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${viewerMode === '3d'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Visor Fotogramétrico 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setViewerMode('2d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${viewerMode === '2d'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Planos 2D &amp; Ortofoto</span>
            </button>
          </div>
        </div>

        {/* Source Selector & Upload Bar */}
        <div className="pt-3 border-t border-gray-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-1.5 text-gray-300">
              <Box className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="font-semibold">Modelo 3D:</span>
              <select
                value={selected3DKey}
                onChange={(e) => setSelected3DKey(e.target.value)}
                className="bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white cursor-pointer max-w-[240px]"
              >
                <option value="parametric">MDE Calculado del Vuelo (Automático)</option>
                {compatible3DDeliverables.map((d) => (
                  <option key={d.id} value={`deliv:${d.id}`}>
                    {d.title || d.fileName} ({d.fileName})
                  </option>
                ))}
                {isAdmin && local3DPreview && (
                  <option value="local">{local3DPreview.label}</option>
                )}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-gray-300">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-semibold">Ortofoto:</span>
              <select
                value={selectedOrthoKey}
                onChange={(e) => setSelectedOrthoKey(e.target.value)}
                className="bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white cursor-pointer max-w-[220px]"
              >
                <option value="parametric">Ortofoto Base Generada</option>
                {compatibleOrthoDeliverables.map((d) => (
                  <option key={d.id} value={`deliv:${d.id}`}>
                    {d.title || d.fileName} ({d.fileName})
                  </option>
                ))}
                {isAdmin && localOrthoFile && (
                  <option value="local">Local: {localOrthoFile.fileName}</option>
                )}
              </select>
            </label>

            {dxfOverlay ? (
              <button
                type="button"
                onClick={() => setShowDxfOverlay((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition cursor-pointer ${
                  showDxfOverlay
                    ? 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-500/45'
                    : 'bg-[#0b0f17] hover:bg-gray-800 text-gray-400 hover:text-white border-gray-700'
                }`}
                title={`Superponer polígonos DXF 3D (${dxfOverlay.fileName}) sobre modelos 3D/2D`}
                aria-pressed={showDxfOverlay}
              >
                <FileCode2 className={`w-3.5 h-3.5 ${showDxfOverlay ? 'text-cyan-400' : 'text-gray-500'}`} />
                <span>DXF 3D ({dxfOverlay.polygons.filter((p) => p.visible !== false).length})</span>
                {showDxfOverlay ? (
                  <Eye className="w-3.5 h-3.5 text-cyan-300" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-gray-500" />
                )}
              </button>
            ) : (
              isAdmin &&
              onOpenDxfSettings && (
                <button
                  type="button"
                  onClick={onOpenDxfSettings}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border border-dashed border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 transition cursor-pointer"
                  title="Ir a Configuración → Perímetros DXF 3D para subir el DXF de este vuelo"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Asignar DXF 3D del vuelo</span>
                </button>
              )
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                title="Cargar temporalmente desde tu equipo (.OBJ, .GLB, .PLY, .STL, .LAS, .XYZ, .PCD, .PNG, .JPG, .TIF)"
              >
                <FolderUp className="w-3.5 h-3.5 text-cyan-400" />
                <span>Abrir Archivo Local</span>
                <input
                  type="file"
                  accept=".glb,.gltf,.obj,.ply,.stl,.las,.laz,.xyz,.pcd,.csv,.txt,.pts,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.target.value = '';
                    handleLocalPreviewFile(f);
                  }}
                />
              </label>

              {onOpenUploadModal && (
                <button
                  type="button"
                  onClick={onOpenUploadModal}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1.5 shadow cursor-pointer transition"
                  title="Subir archivo 3D u ortofoto al servidor del cliente (storage/<Cliente>/<Vuelo>/)"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Modelo 3D / Ortofoto al Cliente</span>
                </button>
              )}
            </div>
          )}
        </div>

        {localSuccessNotice && (
          <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {localSuccessNotice}
            </span>
            <button
              type="button"
              onClick={() => setLocalSuccessNotice(null)}
              className="text-emerald-300 hover:text-white text-[11px] font-semibold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {localHintError && (
          <div className="bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded-xl px-3 py-2 text-xs">
            {localHintError}
          </div>
        )}
      </div>

      {/* Active Viewer (strictly single quarry model) */}
      {viewerMode === '3d' ? (
        <Quarry3DViewer
          key={quarry?.id ?? 'single-quarry'}
          quarry={quarry}
          activeFlight={activeFlight}
          terrain={terrain}
          external3DSource={activeExternal3DSource}
          customOrthoCanvas={customOrthoCanvas}
          onClearExternal3D={() => setSelected3DKey('parametric')}
          dxfOverlay={dxfOverlay}
          dxfStockpiles={scopedStockpiles}
          showDxfOverlay={showDxfOverlay}
          onToggleDxfOverlay={() => setShowDxfOverlay((v) => !v)}
          dxfOpacity={dxfOpacity}
          onChangeDxfOpacity={setDxfOpacity}
        />
      ) : (
        <Quarry2DOrthophotoViewer
          key={quarry?.id ?? 'single-quarry'}
          quarry={quarry}
          activeFlight={activeFlight}
          terrain={terrain}
          customOrthoCanvas={customOrthoCanvas}
          dxfOverlay={dxfOverlay}
          dxfStockpiles={scopedStockpiles}
          showDxfOverlay={showDxfOverlay}
          onToggleDxfOverlay={() => setShowDxfOverlay((v) => !v)}
          dxfOpacity={dxfOpacity}
          onChangeDxfOpacity={setDxfOpacity}
        />
      )}
    </section>
  );
};
