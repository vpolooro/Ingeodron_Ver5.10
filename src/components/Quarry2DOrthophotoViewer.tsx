import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Layers,
  MapPin,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Minus,
  MousePointer,
  Pencil,
  Pentagon,
  RotateCcw,
  Ruler,
  Tag,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ELEV_MAX_M,
  ELEV_MIN_M,
  TERRAIN_HALF_M,
  TERRAIN_SPAN_M,
  extractContours,
  renderHypsometryCanvas,
  renderOrthophotoCanvas,
  sampleProfileLine,
  type ProfileSample,
  type QuarryTerrainData,
  type StockpileFootprint,
} from '../utils/quarryTerrainModel.ts';
import {
  POLYGON_COLOR_PRESETS,
  computePolygonVolumeMetrics,
  computeShapeMetrics,
  exportDrawingsCsv,
  useStockpileMaterialPresets,
  type DrawToolMode,
  type DrawnPin3D,
  type DrawnPoint3D,
  type DrawnShape3D,
} from '../utils/drawing3DOverlay.ts';
import { exportProfile2DDxf, exportProfile3DDxf } from '../utils/dxfProfileExporter.ts';
import type { Quarry, Survey } from '../types.ts';
import { formatDateEu } from '../utils/dateUtils.ts';
import { formatEsInt, formatEsNumber } from '../utils/numberFormat.ts';

type BaseLayer2D = 'ortofoto' | 'hipsometria';
type ProfilePresetId = 'A' | 'B' | 'custom';

interface Quarry2DOrthophotoViewerProps {
  quarry: Quarry | null;
  activeFlight?: Survey;
  terrain: QuarryTerrainData;
  customOrthoCanvas?: HTMLCanvasElement | null;
  showFlightStockpiles?: boolean;
  onToggleFlightStockpiles?: () => void;
}

const BASE_CANVAS_PX = 800; // 2 px per meter at zoom 1.0 (800px = 400m)

const ELEVATION_STOPS = [
  { elev: 1000, color: '#f8fafc' },
  { elev: 820, color: '#f97316' },
  { elev: 640, color: '#eab308' },
  { elev: 440, color: '#10b981' },
  { elev: 220, color: '#06b6d4' },
  { elev: 0, color: '#1d4ed8' },
];

function formatElevM(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return Math.abs(v - Math.round(v)) < 0.05 ? formatEsInt(v) : formatEsNumber(v, 1);
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(16, 185, 129, ${alpha})`;
}

export const Quarry2DOrthophotoViewer: React.FC<Quarry2DOrthophotoViewerProps> = ({
  quarry,
  activeFlight,
  terrain,
  customOrthoCanvas = null,
  showFlightStockpiles: controlledShowFlightStockpiles,
  onToggleFlightStockpiles,
}) => {
  const viewerWrapperRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const orthoHostRef = useRef<HTMLCanvasElement | null>(null);
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const profileChartHostRef = useRef<HTMLDivElement | null>(null);

  // Layer & Dock Controls (2D-specific)
  const [baseLayer, setBaseLayer] = useState<BaseLayer2D>('ortofoto');
  const [showContours, setShowContours] = useState<boolean>(true);
  const [contourStepM, setContourStepM] = useState<1 | 5>(5);
  const [showUtmGrid, setShowUtmGrid] = useState<boolean>(true);
  const [dockOpen, setDockOpen] = useState<boolean>(true);

  const [internalShowFlightStockpiles, setInternalShowFlightStockpiles] = useState<boolean>(true);
  const showFlightStockpiles =
    controlledShowFlightStockpiles !== undefined
      ? controlledShowFlightStockpiles
      : internalShowFlightStockpiles;
  const toggleFlightStockpiles = () => {
    if (onToggleFlightStockpiles) {
      onToggleFlightStockpiles();
    } else {
      setInternalShowFlightStockpiles((v) => !v);
    }
  };

  // Fullscreen state (native + CSS fallback for iframes)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState<boolean>(false);
  const isFullscreen = isNativeFullscreen || isCssFullscreen;
  const isCssFullscreenRef = useRef<boolean>(false);
  isCssFullscreenRef.current = isCssFullscreen;

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
  });

  // Drawing, Volume, Polygon, Pin & Annotation Tools (matching Visor 3D)
  const materialPresets = useStockpileMaterialPresets();
  const defaultMaterialPreset = materialPresets[2] ??
    materialPresets[0] ?? { name: 'Caliza', densityTonM3: 1.65, color: '#eab308' };
  const [drawTool, setDrawTool] = useState<DrawToolMode>('orbit');
  const [activeDrawPoints, setActiveDrawPoints] = useState<DrawnPoint3D[]>([]);
  const [previewPoint, setPreviewPoint] = useState<DrawnPoint3D | null>(null);
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape3D[]>([]);
  const [drawnPins, setDrawnPins] = useState<DrawnPin3D[]>([]);
  const [drawColor] = useState<string>(defaultMaterialPreset.color);
  const [drawOpacity] = useState<number>(0.42);
  const [drawMaterial] = useState<string>(defaultMaterialPreset.name);
  const [densityTonM3] = useState<number>(defaultMaterialPreset.densityTonM3);
  const [showShapesPanel, setShowShapesPanel] = useState<boolean>(true);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editingZonePolygonId, setEditingZonePolygonId] = useState<string | null>(null);

  // Stockpile selection & live cursor readout
  const [selectedStockpile, setSelectedStockpile] = useState<StockpileFootprint | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{
    easting: number;
    northing: number;
    elevM: number;
    worldX: number;
    worldZ: number;
  } | null>(null);

  // Topographic Profile Tool (minimized by default, expandable on demand)
  const [profileMode, setProfileMode] = useState<ProfilePresetId>('A');
  const [customPts, setCustomPts] = useState<Array<{ x: number; z: number }>>([]);
  const [showProfilePanel, setShowProfilePanel] = useState<boolean>(false);
  const [showProfileIn2D, setShowProfileIn2D] = useState<boolean>(true);
  const [hoverSampleIdx, setHoverSampleIdx] = useState<number | null>(null);
  const [profileChartSize, setProfileChartSize] = useState<{ w: number; h: number }>({
    w: 760,
    h: 170,
  });

  // Automatic elevation bounds from terrain heights (exact match to Visor 3D)
  const demElevationBounds = useMemo(() => {
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i < terrain.heights.length; i++) {
      const h = terrain.heights[i];
      if (Number.isFinite(h)) {
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    if (!Number.isFinite(minH) || !Number.isFinite(maxH) || maxH <= minH) {
      return { minM: ELEV_MIN_M, maxM: ELEV_MAX_M };
    }
    return {
      minM: Math.round(minH * 100) / 100,
      maxM: Math.round(maxH * 100) / 100,
    };
  }, [terrain]);

  const zMinM = demElevationBounds.minM;
  const zMaxM = demElevationBounds.maxM;
  const zSpanM = Math.max(0.01, zMaxM - zMinM);

  const elevToBaseY = useCallback(
    (elevM: number) => elevM - zMinM,
    [zMinM]
  );

  const baseYToElevM = useCallback(
    (baseY: number) => zMinM + baseY,
    [zMinM]
  );

  // Close selected stockpile card when flight stockpiles are hidden
  useEffect(() => {
    if (!showFlightStockpiles) {
      setSelectedStockpile(null);
    }
  }, [showFlightStockpiles]);

  // Pre-rendered raster canvases (cached per terrain)
  const orthoBitmap = useMemo(() => renderOrthophotoCanvas(terrain, 640), [terrain]);
  const hypsoBitmap = useMemo(() => renderHypsometryCanvas(terrain, 640), [terrain]);

  // Paint active base raster onto the scaled canvas
  useEffect(() => {
    const canvas = orthoHostRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const src = baseLayer === 'ortofoto' ? customOrthoCanvas || orthoBitmap : hypsoBitmap;
    ctx.clearRect(0, 0, BASE_CANVAS_PX, BASE_CANVAS_PX);
    ctx.drawImage(src, 0, 0, BASE_CANVAS_PX, BASE_CANVAS_PX);
  }, [baseLayer, customOrthoCanvas, orthoBitmap, hypsoBitmap]);

  // Vector contours
  const contours = useMemo(
    () => (showContours ? extractContours(terrain, contourStepM) : []),
    [terrain, showContours, contourStepM]
  );

  // Fullscreen listeners & CSS fallback body scroll lock
  useEffect(() => {
    const onFsChange = () => {
      const el = viewerWrapperRef.current;
      setIsNativeFullscreen(Boolean(el && document.fullscreenElement === el));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!isCssFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isCssFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const wrapper = viewerWrapperRef.current;
    if (!wrapper) return;

    if (document.fullscreenElement === wrapper) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsNativeFullscreen(false);
      }
      return;
    }

    if (isCssFullscreenRef.current) {
      setIsCssFullscreen(false);
      return;
    }

    if (typeof wrapper.requestFullscreen === 'function') {
      try {
        await wrapper.requestFullscreen();
        return;
      } catch {
        // Fallback for restricted iframes / browsers
      }
    }
    setIsCssFullscreen(true);
  }, []);

  // Coordinate conversions: world meters [-200..200] <-> SVG/Canvas px [0..BASE_CANVAS_PX]
  const worldToSvg = useCallback(
    (wx: number, wz: number) => ({
      x: ((wx + TERRAIN_HALF_M) / TERRAIN_SPAN_M) * BASE_CANVAS_PX,
      y: ((wz + TERRAIN_HALF_M) / TERRAIN_SPAN_M) * BASE_CANVAS_PX,
    }),
    []
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2 + pan.x;
      const cy = rect.height / 2 + pan.y;
      const scaledSize = BASE_CANVAS_PX * zoom;
      const relX = (clientX - rect.left - (cx - scaledSize / 2)) / scaledSize;
      const relY = (clientY - rect.top - (cy - scaledSize / 2)) / scaledSize;
      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
      const wx = -TERRAIN_HALF_M + relX * TERRAIN_SPAN_M;
      const wz = -TERRAIN_HALF_M + relY * TERRAIN_SPAN_M;
      return { wx, wz };
    },
    [pan.x, pan.y, zoom]
  );

  // Smooth pan to center on any world coordinate (used by Stockpiles, Shapes & Pins)
  const focusWorldPoint = useCallback(
    (wx: number, wz: number, targetZoom?: number) => {
      const nextZoom = targetZoom ?? Math.max(zoom, 1.8);
      const svgPt = worldToSvg(wx, wz);
      const dxFromCenter = svgPt.x - BASE_CANVAS_PX / 2;
      const dyFromCenter = svgPt.y - BASE_CANVAS_PX / 2;
      setZoom(nextZoom);
      setPan({
        x: Math.round(-dxFromCenter * nextZoom),
        y: Math.round(-dyFromCenter * nextZoom),
      });
    },
    [worldToSvg, zoom]
  );

  const focusStockpile = useCallback(
    (sp: StockpileFootprint) => {
      setSelectedStockpile(sp);
      focusWorldPoint(sp.worldX, sp.worldZ, Math.max(zoom, 1.9));
    },
    [focusWorldPoint, zoom]
  );

  const focusShape = useCallback(
    (shape: DrawnShape3D) => {
      if (shape.points.length === 0) return;
      const cx = shape.points.reduce((acc, p) => acc + p.x, 0) / shape.points.length;
      const cz = shape.points.reduce((acc, p) => acc + p.z, 0) / shape.points.length;
      focusWorldPoint(cx, cz, Math.max(zoom, 1.75));
    },
    [focusWorldPoint, zoom]
  );

  const focusPin = useCallback(
    (pin: DrawnPin3D) => {
      focusWorldPoint(pin.point.x, pin.point.z, Math.max(zoom, 2.0));
    },
    [focusWorldPoint, zoom]
  );

  const resetView = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // Update shape helper
  const updateShape = useCallback((id: string, patch: Partial<DrawnShape3D>) => {
    setDrawnShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // Commit drawn line, stockpile volume polygon, or 2D zone polygon
  const commitDrawnShape = useCallback(
    (
      type: 'line' | 'polygon',
      pts: DrawnPoint3D[],
      polygonKind: 'stockpile' | 'zone' = 'stockpile'
    ) => {
      if (type === 'line' && pts.length < 2) return;
      if (type === 'polygon' && pts.length < 3) return;

      const metrics = computeShapeMetrics(type, pts, 1, 1);
      const volMetrics =
        type === 'polygon' && polygonKind === 'stockpile'
          ? computePolygonVolumeMetrics(pts, {
              hasExternal: false,
              exaggeration: 1,
              metersPerSceneUnit: 1,
              verticalMetersPerUnit: 1,
              sampleDemBaseY: (x, z) => elevToBaseY(terrain.sampleElevationAt(x, z)),
            })
          : { volumeSupported: false, cutVolumeM3: 0, fillVolumeM3: 0, netVolumeM3: 0 };

      const newId = `shape2d-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const isZone = type === 'polygon' && polygonKind === 'zone';
      const isStockpile = type === 'polygon' && !isZone;
      const shapeColor = isZone
        ? '#84cc16'
        : isStockpile
        ? drawColor
        : '#38bdf8';

      setDrawnShapes((prev) => {
        const count =
          prev.filter((s) =>
            type === 'line'
              ? s.type === 'line'
              : isZone
              ? s.type === 'polygon' && s.polygonKind === 'zone'
              : s.type === 'polygon' && s.polygonKind !== 'zone'
          ).length + 1;

        const next: DrawnShape3D = {
          id: newId,
          type,
          polygonKind: type === 'polygon' ? polygonKind : undefined,
          label:
            type === 'line'
              ? `Recta #${count}`
              : isZone
              ? `Polígono #${count}`
              : `Acopio #${count}`,
          note: '',
          material: isStockpile ? drawMaterial : undefined,
          densityTonM3: isStockpile ? densityTonM3 : undefined,
          showLabel3D: true,
          points: pts,
          color: shapeColor,
          opacity: isZone ? 0.32 : drawOpacity,
          visible: true,
          ...metrics,
          ...volMetrics,
        };
        return [...prev, next];
      });

      setActiveDrawPoints([]);
      setPreviewPoint(null);
      setShowShapesPanel(true);

      if (isStockpile) {
        setEditingAnnotationId(null);
        setEditingZonePolygonId(null);
        setSelectedShapeId(newId);
      } else if (isZone) {
        setEditingAnnotationId(null);
        setSelectedShapeId(null);
        setEditingZonePolygonId(newId);
      }
    },
    [densityTonM3, drawColor, drawMaterial, drawOpacity, elevToBaseY, terrain]
  );

  // Commit pin or point annotation
  const commitDrawnPin = useCallback(
    (pt: DrawnPoint3D, kind: 'pin' | 'annotation') => {
      const newId = `pin2d-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      setDrawnPins((prev) => {
        const count =
          prev.filter((p) => (p.kind || 'pin') === kind).length + 1;
        const next: DrawnPin3D = {
          id: newId,
          kind,
          label: kind === 'annotation' ? `Anotación #${count}` : `Pin #${count}`,
          note: '',
          point: pt,
          color: kind === 'annotation' ? '#e879f9' : '#f59e0b',
          visible: true,
        };
        return [...prev, next];
      });
      setSelectedShapeId(null);
      setEditingZonePolygonId(null);
      setEditingAnnotationId(newId);
      setShowShapesPanel(true);
    },
    []
  );

  // Keyboard shortcuts (Escape, Enter, Backspace, H toggle dock, F fullscreen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setDockOpen((v) => !v);
      } else if (e.key === 'f' || e.key === 'F') {
        void toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (drawTool !== 'orbit') {
          setActiveDrawPoints([]);
          setPreviewPoint(null);
          setDrawTool('orbit');
        } else if (editingAnnotationId || editingZonePolygonId || selectedShapeId) {
          setEditingAnnotationId(null);
          setEditingZonePolygonId(null);
          setSelectedShapeId(null);
        }
      } else if (e.key === 'Backspace' && activeDrawPoints.length > 0) {
        e.preventDefault();
        setActiveDrawPoints((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (drawTool === 'polygon' && activeDrawPoints.length >= 3) {
          e.preventDefault();
          commitDrawnShape('polygon', activeDrawPoints, 'stockpile');
        } else if (drawTool === 'zone' && activeDrawPoints.length >= 3) {
          e.preventDefault();
          commitDrawnShape('polygon', activeDrawPoints, 'zone');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeDrawPoints,
    commitDrawnShape,
    drawTool,
    editingAnnotationId,
    editingZonePolygonId,
    selectedShapeId,
    toggleFullscreen,
  ]);

  // Pointer Interactions on 2D Map Viewport
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.14 : 0.88;
    setZoom((z) => Math.max(0.65, Math.min(6.0, Math.round(z * factor * 100) / 100)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
      }
    }

    const w = screenToWorld(e.clientX, e.clientY);
    if (w) {
      const utm = terrain.worldToUtm(w.wx, w.wz);
      const elevM = terrain.sampleElevationAt(w.wx, w.wz);
      setCursorCoords({
        easting: utm.easting,
        northing: utm.northing,
        elevM,
        worldX: w.wx,
        worldZ: w.wz,
      });
      if (drawTool === 'line' || drawTool === 'polygon' || drawTool === 'zone') {
        setPreviewPoint({ x: w.wx, z: w.wz, baseY: elevToBaseY(elevM) });
      } else if (previewPoint) {
        setPreviewPoint(null);
      }
    } else {
      setCursorCoords(null);
      if (previewPoint) setPreviewPoint(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    if (wasMoved || e.button !== 0) return;

    const w = screenToWorld(e.clientX, e.clientY);
    if (!w) return;
    const elevM = terrain.sampleElevationAt(w.wx, w.wz);
    const pt: DrawnPoint3D = { x: w.wx, z: w.wz, baseY: elevToBaseY(elevM) };

    // 1. Drawing tools take priority
    if (drawTool === 'pin') {
      commitDrawnPin(pt, 'pin');
      return;
    }

    if (drawTool === 'annotation') {
      commitDrawnPin(pt, 'annotation');
      return;
    }

    if (drawTool === 'line') {
      if (activeDrawPoints.length === 0) {
        setActiveDrawPoints([pt]);
      } else {
        commitDrawnShape('line', [activeDrawPoints[0], pt]);
      }
      return;
    }

    if (drawTool === 'polygon' || drawTool === 'zone') {
      const kind = drawTool === 'zone' ? 'zone' : 'stockpile';
      // Close polygon if clicking close to the 1st vertex (when >= 3 points)
      if (activeDrawPoints.length >= 3) {
        const firstSvg = worldToSvg(activeDrawPoints[0].x, activeDrawPoints[0].z);
        const curSvg = worldToSvg(pt.x, pt.z);
        const distScreenPx = Math.hypot(curSvg.x - firstSvg.x, curSvg.y - firstSvg.y) * zoom;
        if (distScreenPx <= 14) {
          commitDrawnShape('polygon', activeDrawPoints, kind);
          return;
        }
      }
      setActiveDrawPoints((prev) => [...prev, pt]);
      return;
    }

    // 2. Custom Free Profile placement when in Navegar mode + Libre profile active
    if (profileMode === 'custom' && showProfileIn2D) {
      setCustomPts((prev) => {
        if (prev.length >= 2) {
          return [{ x: w.wx, z: w.wz }];
        }
        return [...prev, { x: w.wx, z: w.wz }];
      });
      setShowProfilePanel(true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (drawTool === 'polygon' && activeDrawPoints.length >= 3) {
      e.preventDefault();
      commitDrawnShape('polygon', activeDrawPoints, 'stockpile');
    } else if (drawTool === 'zone' && activeDrawPoints.length >= 3) {
      e.preventDefault();
      commitDrawnShape('polygon', activeDrawPoints, 'zone');
    }
  };

  // Export High-Res PNG Screenshot of 2D Orthophoto + SVG Vector Overlays
  const captureScreenshotPng = useCallback(() => {
    const baseCanvas = orthoHostRef.current;
    const svgEl = svgOverlayRef.current;
    if (!baseCanvas) return;

    const exportSize = 1600;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = exportSize;
    outCanvas.height = exportSize;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, exportSize, exportSize);
    ctx.drawImage(baseCanvas, 0, 0, exportSize, exportSize);

    const triggerDownload = () => {
      const a = document.createElement('a');
      const safeName = (quarry?.name || 'plano-2d')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      a.href = outCanvas.toDataURL('image/png');
      a.download = `ingeodron-${safeName || 'plano-2d'}-2d.png`;
      a.click();
    };

    if (!svgEl) {
      triggerDownload();
      return;
    }

    const serialized = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, exportSize, exportSize);
      URL.revokeObjectURL(url);
      triggerDownload();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      triggerDownload();
    };
    img.src = url;
  }, [quarry?.name]);

  // Compute active profile endpoints & samples (exact match to Visor 3D)
  const activeProfileSegment = useMemo(() => {
    if (profileMode === 'A') {
      return {
        label: "Perfil A–A' (Oeste–Este)",
        startTag: 'A',
        endTag: "A'",
        p0: { x: terrain.defaultProfileA.x0, z: terrain.defaultProfileA.z0 },
        p1: { x: terrain.defaultProfileA.x1, z: terrain.defaultProfileA.z1 },
      };
    }
    if (profileMode === 'B') {
      return {
        label: "Perfil B–B' (Norte–Sur)",
        startTag: 'B',
        endTag: "B'",
        p0: { x: terrain.defaultProfileB.x0, z: terrain.defaultProfileB.z0 },
        p1: { x: terrain.defaultProfileB.x1, z: terrain.defaultProfileB.z1 },
      };
    }
    if (customPts.length === 2) {
      return {
        label: 'Corte Transversal Libre',
        startTag: 'P1',
        endTag: 'P2',
        p0: customPts[0],
        p1: customPts[1],
      };
    }
    return {
      label:
        customPts.length === 1
          ? 'Selecciona el 2.º punto sobre el plano 2D'
          : 'Haz 2 clics en el plano 2D para trazar el corte',
      startTag: 'A',
      endTag: "A'",
      p0: { x: terrain.defaultProfileA.x0, z: terrain.defaultProfileA.z0 },
      p1: { x: terrain.defaultProfileA.x1, z: terrain.defaultProfileA.z1 },
    };
  }, [profileMode, customPts, terrain]);

  const profileSamples = useMemo<ProfileSample[]>(() => {
    return sampleProfileLine(
      terrain,
      activeProfileSegment.p0.x,
      activeProfileSegment.p0.z,
      activeProfileSegment.p1.x,
      activeProfileSegment.p1.z,
      120
    );
  }, [terrain, activeProfileSegment]);

  // Observe profile chart container so the SVG spans 100% width crisply
  useEffect(() => {
    if (!showProfilePanel) return;
    const host = profileChartHostRef.current;
    if (!host) return;

    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      const nextW = Math.max(280, Math.round(rect.width));
      const nextH = Math.max(110, Math.round(rect.height));
      setProfileChartSize((prev) =>
        prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }
      );
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(host);
    return () => ro.disconnect();
  }, [showProfilePanel, isFullscreen]);

  // Profile SVG chart paths (exact match to Visor 3D)
  const profileChartData = useMemo(() => {
    const w = profileChartSize.w;
    const h = profileChartSize.h;
    const padL = 48;
    const padR = 14;
    const padT = 10;
    const padB = 22;
    const plotW = Math.max(10, w - padL - padR);
    const plotH = Math.max(10, h - padT - padB);
    const maxD = profileSamples[profileSamples.length - 1]?.distanceM || 1;
    const spanZ = Math.max(0.01, zMaxM - zMinM);

    const pts = profileSamples.map((s, idx) => {
      const x = padL + (s.distanceM / maxD) * plotW;
      const yNorm = Math.max(0, Math.min(1, (s.elevationM - zMinM) / spanZ));
      const y = padT + (1 - yNorm) * plotH;
      return { x, y, sample: s, idx };
    });

    const lineD = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const areaD =
      pts.length > 0
        ? `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : '';

    const gridLevels = [0.1, 0.4, 0.7, 1.0].map((f) => {
      const value = zMinM + f * spanZ;
      return {
        key: f,
        value,
        label: spanZ < 15 ? formatEsNumber(value, 1) : formatEsInt(value),
      };
    });
    const tickFractions =
      w >= 860
        ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
        : [0, 0.25, 0.5, 0.75, 1];
    const xTicks = tickFractions.map((f) => ({
      frac: f,
      x: padL + f * plotW,
      distM: maxD * f,
    }));

    let minElev = zMinM;
    let maxElev = zMaxM;
    if (profileSamples.length > 0) {
      minElev = Infinity;
      maxElev = -Infinity;
      for (const s of profileSamples) {
        if (s.elevationM < minElev) minElev = s.elevationM;
        if (s.elevationM > maxElev) maxElev = s.elevationM;
      }
    }
    const deltaZ = Math.max(0, maxElev - minElev);

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      maxD,
      pts,
      lineD,
      areaD,
      gridLevels,
      xTicks,
      minElev,
      maxElev,
      deltaZ,
    };
  }, [profileSamples, zMinM, zMaxM, profileChartSize]);

  const hoveredSample =
    hoverSampleIdx !== null && profileSamples[hoverSampleIdx]
      ? profileSamples[hoverSampleIdx]
      : null;

  // Dynamic Graphic Scale Bar (50m / 100m)
  const pxPerMeter = (BASE_CANVAS_PX / TERRAIN_SPAN_M) * zoom;
  const scaleMeters = zoom >= 2.6 ? 50 : 100;
  const scaleBarWidthPx = Math.min(220, Math.max(48, Math.round(scaleMeters * pxPerMeter)));

  const utmGridOffsets = [-150, -50, 50, 150];
  const invScale = 1 / Math.max(0.85, Math.sqrt(zoom));

  return (
    <div
      ref={viewerWrapperRef}
      className={
        isCssFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-[#090d16] p-2.5 flex flex-col gap-2.5 overflow-hidden'
          : isNativeFullscreen
          ? 'w-full h-full bg-[#090d16] p-2.5 flex flex-col gap-2.5 overflow-hidden'
          : 'flex-1 min-h-0 flex flex-col gap-3'
      }
    >
      {/* Main 2D Interactive Viewport (Full-Section Height matching Visor 3D) */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          dragRef.current.active = false;
          setCursorCoords(null);
          setPreviewPoint(null);
        }}
        className={`${
          isFullscreen
            ? 'gis-canvas-surface relative w-full flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-800 bg-[#090d16] select-none'
            : 'gis-canvas-surface relative w-full flex-1 min-h-[480px] sm:min-h-[520px] rounded-2xl overflow-hidden border border-gray-800 bg-[#090d16] select-none'
        } ${
          drawTool !== 'orbit' || (profileMode === 'custom' && showProfileIn2D)
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        {/* Panned & Zoomed 2D Orthophoto Canvas + Vector SVG Overlay */}
        <div
          style={{
            width: BASE_CANVAS_PX,
            height: BASE_CANVAS_PX,
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          className="shadow-2xl border border-gray-700"
        >
          <canvas
            ref={orthoHostRef}
            width={BASE_CANVAS_PX}
            height={BASE_CANVAS_PX}
            className="block w-full h-full"
          />

          <svg
            ref={svgOverlayRef}
            viewBox={`0 0 ${BASE_CANVAS_PX} ${BASE_CANVAS_PX}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {/* Vector UTM Coordinate Grid */}
            {showUtmGrid &&
              utmGridOffsets.map((offset) => {
                const posPx = ((offset + TERRAIN_HALF_M) / TERRAIN_SPAN_M) * BASE_CANVAS_PX;
                const utmH = terrain.worldToUtm(offset, 0);
                const utmV = terrain.worldToUtm(0, offset);
                return (
                  <g key={offset}>
                    <line
                      x1={posPx}
                      y1={0}
                      x2={posPx}
                      y2={BASE_CANVAS_PX}
                      stroke="#38bdf8"
                      strokeOpacity={0.32}
                      strokeWidth={1 / Math.max(1, zoom * 0.7)}
                      strokeDasharray="6 6"
                    />
                    <text
                      x={posPx + 4}
                      y={14}
                      fill="#7dd3fc"
                      fontSize={10 * invScale}
                      fontFamily="monospace"
                    >
                      E {formatEsInt(utmH.easting)}
                    </text>

                    <line
                      x1={0}
                      y1={posPx}
                      x2={BASE_CANVAS_PX}
                      y2={posPx}
                      stroke="#38bdf8"
                      strokeOpacity={0.32}
                      strokeWidth={1 / Math.max(1, zoom * 0.7)}
                      strokeDasharray="6 6"
                    />
                    <text
                      x={6}
                      y={posPx - 4}
                      fill="#7dd3fc"
                      fontSize={10 * invScale}
                      fontFamily="monospace"
                    >
                      N {formatEsInt(utmV.northing)}
                    </text>
                  </g>
                );
              })}

            {/* Vector Contour Lines */}
            {showContours &&
              contours.map((seg, idx) => {
                const a = worldToSvg(seg.x1, seg.z1);
                const b = worldToSvg(seg.x2, seg.z2);
                return (
                  <line
                    key={idx}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={seg.isMaster ? '#fef08a' : '#f59e0b'}
                    strokeOpacity={seg.isMaster ? 0.88 : 0.55}
                    strokeWidth={(seg.isMaster ? 1.5 : 0.85) * invScale}
                  />
                );
              })}

            {/* Interactive Flight Stockpile Polygons */}
            {showFlightStockpiles &&
              terrain.stockpiles.map((sp) => {
                const pts = sp.polygon.map((p) => worldToSvg(p.x, p.z));
                const polyStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const center = worldToSvg(sp.worldX, sp.worldZ);
                const isSel = selectedStockpile?.id === sp.id;
                return (
                  <g
                    key={sp.id}
                    className={drawTool === 'orbit' ? 'pointer-events-auto cursor-pointer' : ''}
                    onClick={(e) => {
                      if (drawTool !== 'orbit' || (profileMode === 'custom' && showProfileIn2D)) {
                        return;
                      }
                      e.stopPropagation();
                      setSelectedStockpile(sp);
                    }}
                  >
                    <polygon
                      points={polyStr}
                      fill={isSel ? 'rgba(251, 191, 36, 0.28)' : 'rgba(16, 185, 129, 0.20)'}
                      stroke={isSel ? '#fbbf24' : '#34d399'}
                      strokeWidth={2 * invScale}
                    />
                    <rect
                      x={center.x - 36 * invScale}
                      y={center.y - 12 * invScale}
                      width={72 * invScale}
                      height={22 * invScale}
                      rx={4 * invScale}
                      fill="rgba(11, 15, 23, 0.88)"
                      stroke={isSel ? '#fbbf24' : '#10b981'}
                      strokeWidth={1 * invScale}
                    />
                    <text
                      x={center.x}
                      y={center.y - 1.5 * invScale}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize={9.5 * invScale}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {sp.code}
                    </text>
                    <text
                      x={center.x}
                      y={center.y + 8 * invScale}
                      textAnchor="middle"
                      fill="#34d399"
                      fontSize={8 * invScale}
                      fontFamily="monospace"
                    >
                      {formatEsInt(sp.netVolumeM3)} m³
                    </text>
                  </g>
                );
              })}

            {/* Drawn 2D Stockpile Volumes, Zone Polygons & Measurement Lines */}
            {drawnShapes
              .filter((s) => s.visible)
              .map((shape) => {
                const svgPts = shape.points.map((p) => worldToSvg(p.x, p.z));
                const polyStr = svgPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const cx = svgPts.reduce((acc, p) => acc + p.x, 0) / Math.max(1, svgPts.length);
                const cy = svgPts.reduce((acc, p) => acc + p.y, 0) / Math.max(1, svgPts.length);
                const isZone = shape.type === 'polygon' && shape.polygonKind === 'zone';
                const isStockpile = shape.type === 'polygon' && !isZone;
                const estTons = shape.cutVolumeM3 * (shape.densityTonM3 ?? densityTonM3);
                const subText =
                  shape.type === 'line'
                    ? `${formatEsNumber(shape.length2DM, 1)} m · ΔZ ${shape.deltaZM >= 0 ? '+' : ''}${formatEsNumber(shape.deltaZM, 1)}m (${formatEsInt(shape.slopePct)}%)`
                    : isStockpile && shape.volumeSupported
                    ? `+${formatEsInt(shape.cutVolumeM3)} m³ · ${formatEsInt(estTons)} t`
                    : shape.area2DM2 >= 10000
                    ? `${formatEsNumber(shape.area2DM2 / 10000, 2)} ha · ${formatEsNumber(shape.length2DM, 1)} m`
                    : `${formatEsInt(shape.area2DM2)} m² · ${formatEsNumber(shape.length2DM, 1)} m`;

                return (
                  <g key={shape.id}>
                    {shape.type === 'polygon' ? (
                      <polygon
                        points={polyStr}
                        fill={hexToRgba(shape.color, shape.opacity)}
                        stroke={shape.color}
                        strokeWidth={2.4 * invScale}
                      />
                    ) : (
                      <polyline
                        points={polyStr}
                        fill="none"
                        stroke={shape.color}
                        strokeWidth={2.6 * invScale}
                      />
                    )}
                    {svgPts.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r={3.5 * invScale}
                        fill="#ffffff"
                        stroke={shape.color}
                        strokeWidth={1.8 * invScale}
                      />
                    ))}
                    {shape.showLabel3D !== false && (
                      <g>
                        <rect
                          x={cx - 64 * invScale}
                          y={cy - 16 * invScale}
                          width={128 * invScale}
                          height={(shape.note ? 36 : 26) * invScale}
                          rx={5 * invScale}
                          fill="rgba(11, 15, 23, 0.90)"
                          stroke={shape.color}
                          strokeWidth={1.2 * invScale}
                        />
                        <text
                          x={cx}
                          y={cy - 4 * invScale}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={9.5 * invScale}
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          {shape.label.slice(0, 22)}
                        </text>
                        <text
                          x={cx}
                          y={cy + 6.5 * invScale}
                          textAnchor="middle"
                          fill={isStockpile ? '#6ee7b7' : isZone ? '#bef264' : '#7dd3fc'}
                          fontSize={8 * invScale}
                          fontFamily="monospace"
                        >
                          {subText}
                        </text>
                        {shape.note && (
                          <text
                            x={cx}
                            y={cy + 16 * invScale}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize={7.5 * invScale}
                            fontFamily="sans-serif"
                          >
                            {shape.note.slice(0, 26)}
                          </text>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}

            {/* Drawn Pins & Point Annotations */}
            {drawnPins
              .filter((p) => p.visible)
              .map((pin) => {
                const pos = worldToSvg(pin.point.x, pin.point.z);
                const cotaZ = baseYToElevM(pin.point.baseY);
                const isAnnotation = pin.kind === 'annotation';
                return (
                  <g key={pin.id}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={5 * invScale}
                      fill={pin.color}
                      stroke="#ffffff"
                      strokeWidth={1.8 * invScale}
                    />
                    <line
                      x1={pos.x}
                      y1={pos.y - 5 * invScale}
                      x2={pos.x}
                      y2={pos.y - 16 * invScale}
                      stroke={pin.color}
                      strokeWidth={1.6 * invScale}
                    />
                    <rect
                      x={pos.x - 56 * invScale}
                      y={pos.y - (pin.note ? 48 : 38) * invScale}
                      width={112 * invScale}
                      height={(pin.note ? 32 : 22) * invScale}
                      rx={4 * invScale}
                      fill="rgba(11, 15, 23, 0.92)"
                      stroke={pin.color}
                      strokeWidth={1.2 * invScale}
                    />
                    <text
                      x={pos.x}
                      y={pos.y - (pin.note ? 36 : 26) * invScale}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={9 * invScale}
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {pin.label.slice(0, 20)}
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y - (pin.note ? 26 : 19) * invScale}
                      textAnchor="middle"
                      fill={isAnnotation ? '#f0abfc' : '#fcd34d'}
                      fontSize={8 * invScale}
                      fontFamily="monospace"
                    >
                      Z {formatEsNumber(cotaZ, 2)} m
                    </text>
                    {pin.note && (
                      <text
                        x={pos.x}
                        y={pos.y - 19 * invScale}
                        textAnchor="middle"
                        fill="#cbd5e1"
                        fontSize={7.2 * invScale}
                        fontFamily="sans-serif"
                      >
                        {pin.note.slice(0, 24)}
                      </text>
                    )}
                  </g>
                );
              })}

            {/* Active In-Progress Drawing Preview */}
            {activeDrawPoints.length > 0 && (() => {
              const allPts = previewPoint ? [...activeDrawPoints, previewPoint] : activeDrawPoints;
              const svgPts = allPts.map((p) => worldToSvg(p.x, p.z));
              const polyStr = svgPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
              const activeStroke =
                drawTool === 'line'
                  ? '#38bdf8'
                  : drawTool === 'zone'
                  ? '#a3e635'
                  : drawColor;
              return (
                <g>
                  {(drawTool === 'polygon' || drawTool === 'zone') && svgPts.length >= 3 && (
                    <polygon
                      points={polyStr}
                      fill={hexToRgba(activeStroke, 0.22)}
                      stroke="none"
                    />
                  )}
                  <polyline
                    points={polyStr}
                    fill="none"
                    stroke={activeStroke}
                    strokeWidth={2.4 * invScale}
                    strokeDasharray="6 4"
                  />
                  {activeDrawPoints.map((p, idx) => {
                    const s = worldToSvg(p.x, p.z);
                    return (
                      <circle
                        key={idx}
                        cx={s.x}
                        cy={s.y}
                        r={(idx === 0 && activeDrawPoints.length >= 3 ? 6 : 4.2) * invScale}
                        fill={idx === 0 && activeDrawPoints.length >= 3 ? activeStroke : '#ffffff'}
                        stroke={idx === 0 && activeDrawPoints.length >= 3 ? '#ffffff' : activeStroke}
                        strokeWidth={2 * invScale}
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* Transverse Topographic Profile Line on 2D Plan */}
            {showProfileIn2D && (() => {
              const isDrawingCustom = profileMode === 'custom' && customPts.length === 1;
              const p0Svg = isDrawingCustom
                ? worldToSvg(customPts[0].x, customPts[0].z)
                : worldToSvg(activeProfileSegment.p0.x, activeProfileSegment.p0.z);
              const p1Svg =
                isDrawingCustom && cursorCoords
                  ? worldToSvg(cursorCoords.worldX, cursorCoords.worldZ)
                  : worldToSvg(activeProfileSegment.p1.x, activeProfileSegment.p1.z);

              const startLabel = isDrawingCustom ? 'P1' : activeProfileSegment.startTag;
              const endLabel = isDrawingCustom ? 'P2' : activeProfileSegment.endTag;

              return (
                <g>
                  {/* Contrast halo line */}
                  <line
                    x1={p0Svg.x}
                    y1={p0Svg.y}
                    x2={p1Svg.x}
                    y2={p1Svg.y}
                    stroke="rgba(9, 13, 22, 0.85)"
                    strokeWidth={5.2 * invScale}
                    strokeLinecap="round"
                  />
                  {/* Main rose profile section line */}
                  <line
                    x1={p0Svg.x}
                    y1={p0Svg.y}
                    x2={p1Svg.x}
                    y2={p1Svg.y}
                    stroke="#fb7185"
                    strokeWidth={2.6 * invScale}
                    strokeDasharray={isDrawingCustom ? '7 5' : undefined}
                    strokeLinecap="round"
                  />

                  {/* Endpoint badges (A / A', B / B', or P1 / P2) */}
                  {[
                    { pt: p0Svg, lbl: startLabel },
                    { pt: p1Svg, lbl: endLabel },
                  ].map(({ pt, lbl }, idx) => (
                    <g key={idx}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={5 * invScale}
                        fill="#fb7185"
                        stroke="#ffffff"
                        strokeWidth={1.8 * invScale}
                      />
                      <rect
                        x={pt.x - 13 * invScale}
                        y={pt.y - 23 * invScale}
                        width={26 * invScale}
                        height={15 * invScale}
                        rx={4 * invScale}
                        fill="rgba(11, 15, 23, 0.92)"
                        stroke="#fb7185"
                        strokeWidth={1.2 * invScale}
                      />
                      <text
                        x={pt.x}
                        y={pt.y - 12.5 * invScale}
                        textAnchor="middle"
                        fill="#fda4af"
                        fontSize={9.5 * invScale}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {lbl}
                      </text>
                    </g>
                  ))}

                  {/* Synchronized Hover Sample Marker from Bottom Profile Chart */}
                  {hoveredSample && (() => {
                    const hs = worldToSvg(hoveredSample.worldX, hoveredSample.worldZ);
                    return (
                      <g>
                        <circle
                          cx={hs.x}
                          cy={hs.y}
                          r={8.5 * invScale}
                          fill="rgba(251, 113, 133, 0.28)"
                          stroke="#ffffff"
                          strokeWidth={1.5 * invScale}
                        />
                        <circle
                          cx={hs.x}
                          cy={hs.y}
                          r={4 * invScale}
                          fill="#fb7185"
                          stroke="#ffffff"
                          strokeWidth={1.5 * invScale}
                        />
                        <rect
                          x={hs.x - 32 * invScale}
                          y={hs.y + 10 * invScale}
                          width={64 * invScale}
                          height={16 * invScale}
                          rx={4 * invScale}
                          fill="rgba(11, 15, 23, 0.95)"
                          stroke="#fb7185"
                          strokeWidth={1 * invScale}
                        />
                        <text
                          x={hs.x}
                          y={hs.y + 21 * invScale}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={8.5 * invScale}
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          Z {formatEsNumber(hoveredSample.elevationM, 1)}m
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })()}
          </svg>
        </div>

        {/* TOP-LEFT OVERLAY: Site Badge, Quick Stockpile Pins & Drawn Volumes/Measurements List */}
        <div
          className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-[280px] pointer-events-none"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-auto bg-[#0b0f17]/92 border border-gray-800 rounded-xl px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {quarry?.name || 'Ortofoto Georreferenciada'}
                </div>
                <div className="text-[10px] font-mono text-gray-400 truncate">
                  {activeFlight
                    ? `${activeFlight.flightCode} · ${formatDateEu(activeFlight.surveyDate)}`
                    : `ETRS89 / UTM 30N · 400×400 m`}
                </div>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-gray-800/80 flex items-center justify-between gap-2 text-[10px]">
              <span className="text-gray-400 font-semibold whitespace-nowrap">Cota Z (auto):</span>
              <span
                className="font-mono text-cyan-300 font-semibold whitespace-nowrap"
                title="Rango automático calculado con la cota Z mínima y máxima del modelo abierto"
              >
                {formatElevM(zMinM)} – {formatElevM(zMaxM)} m
              </span>
            </div>

            {terrain.stockpiles.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-800/80 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-400 font-semibold">
                    Acopios vuelo ({terrain.stockpiles.length})
                  </span>
                  <button
                    type="button"
                    onClick={toggleFlightStockpiles}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 border transition cursor-pointer ${
                      showFlightStockpiles
                        ? 'bg-amber-500/20 text-amber-200 border-amber-500/45 hover:bg-amber-500/30'
                        : 'bg-gray-800 text-gray-400 hover:text-white border-gray-700'
                    }`}
                    title={
                      showFlightStockpiles
                        ? 'Ocultar los acopios del vuelo sobre el plano 2D'
                        : 'Mostrar los acopios del vuelo sobre el plano 2D'
                    }
                    aria-pressed={showFlightStockpiles}
                  >
                    {showFlightStockpiles ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                    <span>{showFlightStockpiles ? 'Visibles' : 'Ocultos'}</span>
                  </button>
                </div>
                {showFlightStockpiles && (
                  <div className="flex flex-wrap gap-1">
                    {terrain.stockpiles.slice(0, 5).map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => focusStockpile(sp)}
                        title={`Enfocar ${sp.name}`}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                          selectedStockpile?.id === sp.id
                            ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                            : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        {sp.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected Stockpile 2D Marker Metrics Card */}
          {showFlightStockpiles && selectedStockpile && (
            <div className="pointer-events-auto bg-[#0b0f17]/95 border border-amber-500/40 rounded-xl p-3 shadow-xl space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    {selectedStockpile.code}
                  </span>
                  <h4 className="text-xs font-bold text-white mt-1 truncate">
                    {selectedStockpile.name}
                  </h4>
                  <p className="text-[11px] text-gray-400 truncate">{selectedStockpile.material}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStockpile(null)}
                  className="p-1 text-gray-400 hover:text-white rounded cursor-pointer"
                  aria-label="Cerrar ficha de acopio"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                  <div className="text-[9px] text-gray-400 uppercase">Volumen</div>
                  <div className="font-mono font-bold text-emerald-400">
                    {formatEsNumber(selectedStockpile.netVolumeM3)} m³
                  </div>
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                  <div className="text-[9px] text-gray-400 uppercase">Tonelaje Est.</div>
                  <div className="font-mono font-bold text-amber-300">
                    {formatEsNumber(selectedStockpile.tonnageEst)} t
                  </div>
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                  <div className="text-[9px] text-gray-400 uppercase">Densidad</div>
                  <div className="font-mono text-gray-200">
                    {formatEsNumber(selectedStockpile.densityTonM3, 2)} t/m³
                  </div>
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                  <div className="text-[9px] text-gray-400 uppercase">Cota Cima</div>
                  <div className="font-mono text-cyan-300">
                    {formatEsNumber(selectedStockpile.peakElevationM, 1)} m
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-mono text-gray-400 flex items-center justify-between pt-0.5">
                <span>E {formatEsNumber(selectedStockpile.easting, 1)}</span>
                <span>N {formatEsNumber(selectedStockpile.northing, 1)}</span>
              </div>
            </div>
          )}

          {/* Drawn 2D Stockpile Volumes, Polygons, Measurements & Georeferenced Pins List */}
          {(drawnShapes.length > 0 || drawnPins.length > 0) && (() => {
            const volumePolys = drawnShapes.filter(
              (s) => s.type === 'polygon' && s.polygonKind !== 'zone' && s.visible && s.volumeSupported
            );
            const totalVolM3 = volumePolys.reduce((acc, s) => acc + s.cutVolumeM3, 0);
            const totalTons = volumePolys.reduce(
              (acc, s) => acc + s.cutVolumeM3 * (s.densityTonM3 ?? densityTonM3),
              0
            );
            return (
              <div className="pointer-events-auto bg-[#0b0f17]/95 border border-gray-800 rounded-xl p-2.5 shadow-lg space-y-2 w-[315px] max-w-[85vw]">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowShapesPanel((v) => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-white cursor-pointer"
                  >
                    <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Volúmenes y Mediciones ({drawnShapes.length + drawnPins.length})</span>
                    {showShapesPanel ? (
                      <ChevronUp className="w-3 h-3 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportDrawingsCsv(drawnShapes, drawnPins, {
                          quarryName: quarry?.name || 'plano-2d',
                          densityTonM3,
                          elevMinM: zMinM,
                          elevMaxM: zMaxM,
                          visualHeightSpan: zSpanM,
                          metersPerSceneUnit: 1,
                        })
                      }
                      className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-0.5 cursor-pointer"
                      title="Exportar volúmenes, polígonos, etiquetas, anotaciones y cotas a CSV (Excel)"
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrawnShapes([]);
                        setDrawnPins([]);
                        setSelectedShapeId(null);
                        setEditingAnnotationId(null);
                        setEditingZonePolygonId(null);
                      }}
                      className="text-[10px] font-mono text-rose-300 hover:text-rose-200 cursor-pointer"
                      title="Eliminar todos los volúmenes, polígonos, rectas, pines y anotaciones"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                {showShapesPanel && (
                  <div className="space-y-2">
                    {volumePolys.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 bg-emerald-950/35 border border-emerald-500/30 rounded-lg px-2 py-1.5">
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">
                            Total Acopios ({volumePolys.length})
                          </div>
                          <div className="font-mono text-[11px] font-bold text-emerald-300">
                            +{formatEsInt(totalVolM3)} m³
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] uppercase tracking-wider text-amber-300/80">
                            Tonelaje Est.
                          </div>
                          <div className="font-mono text-[11px] font-bold text-amber-300">
                            {formatEsInt(totalTons)} t
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-0.5">
                      {drawnShapes.map((shape) => {
                        const isZonePolygon = shape.type === 'polygon' && shape.polygonKind === 'zone';
                        const isStockpilePolygon = shape.type === 'polygon' && !isZonePolygon;
                        const shapeDensity = shape.densityTonM3 ?? densityTonM3;
                        const estTons = shape.cutVolumeM3 * shapeDensity;
                        const isEditing = selectedShapeId === shape.id && isStockpilePolygon;
                        const isEditingZone = editingZonePolygonId === shape.id && isZonePolygon;
                        const matchedPreset = materialPresets.find(
                          (m) => m.name === shape.material
                        );
                        const minPolyBaseY =
                          shape.baseMinY ??
                          (shape.points.length > 0
                            ? shape.points.reduce((acc, p) => Math.min(acc, p.baseY), Infinity)
                            : 0);
                        const maxPolyBaseY =
                          shape.baseMaxY ??
                          (shape.points.length > 0
                            ? shape.points.reduce((acc, p) => Math.max(acc, p.baseY), -Infinity)
                            : 0);
                        const baseMinElevM = baseYToElevM(minPolyBaseY);
                        const baseMaxElevM = baseYToElevM(maxPolyBaseY);

                        return (
                          <div
                            key={shape.id}
                            className={`rounded-lg px-2 py-1.5 text-[10px] border transition ${
                              isEditing
                                ? 'bg-[#121c2e] border-emerald-500/60'
                                : isEditingZone
                                ? 'bg-[#121c2e] border-lime-400/60'
                                : 'bg-[#111827] border-gray-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-start gap-1.5 min-w-0 flex-1">
                                {isZonePolygon ? (
                                  <Pentagon
                                    className="w-3.5 h-3.5 shrink-0 mt-0.5"
                                    style={{ color: shape.color }}
                                  />
                                ) : (
                                  <span
                                    className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/30 mt-0.5"
                                    style={{
                                      backgroundColor: shape.color,
                                      opacity: shape.type === 'polygon' ? Math.max(0.55, shape.opacity) : 1,
                                    }}
                                  />
                                )}
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => focusShape(shape)}
                                    className={`font-semibold text-gray-100 truncate text-left w-full cursor-pointer ${
                                      isZonePolygon ? 'hover:text-lime-300' : 'hover:text-emerald-300'
                                    }`}
                                    title="Clic para centrar el plano 2D sobre este elemento"
                                  >
                                    {shape.label || (isZonePolygon ? 'Polígono sin nombre' : 'Acopio sin etiqueta')}
                                  </button>
                                  {isZonePolygon ? (
                                    <div className="space-y-0.5 mt-0.5">
                                      {shape.note && (
                                        <div className="text-[9.5px] text-gray-300 truncate">
                                          {shape.note}
                                        </div>
                                      )}
                                      <div className="font-mono text-[9.5px] text-cyan-300 truncate">
                                        Área{' '}
                                        {shape.area2DM2 >= 10000
                                          ? `${formatEsNumber(shape.area2DM2 / 10000, 2)} ha`
                                          : `${formatEsInt(shape.area2DM2)} m²`}{' '}
                                        · Perím. {formatEsNumber(shape.length2DM, 1)} m
                                      </div>
                                    </div>
                                  ) : isStockpilePolygon ? (
                                    <div className="space-y-0.5 mt-0.5">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800/90 border border-gray-700 text-[9px] text-cyan-200 max-w-full truncate">
                                          <span className="truncate">
                                            {shape.material || 'Material sin asignar'}
                                          </span>
                                          <span className="text-gray-400 font-mono">
                                            {formatEsNumber(shapeDensity, 2)} t/m³
                                          </span>
                                        </span>
                                      </div>
                                      {shape.volumeSupported && (
                                        <div className="font-mono text-[10px] font-semibold text-emerald-300 truncate">
                                          Vol: +{formatEsInt(shape.cutVolumeM3)} m³ ·{' '}
                                          {formatEsInt(estTons)} t
                                        </div>
                                      )}
                                      <div className="font-mono text-[9px] text-gray-400 truncate">
                                        {shape.area2DM2 >= 10000
                                          ? `${formatEsNumber(shape.area2DM2 / 10000, 2)} ha`
                                          : `${formatEsInt(shape.area2DM2)} m²`}{' '}
                                        · Z base: {formatEsNumber(baseMinElevM, 1)}–{formatEsNumber(baseMaxElevM, 1)} m
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[9.5px] text-gray-400 truncate">
                                      2D {formatEsNumber(shape.length2DM, 1)} m · ΔZ {shape.deltaZM >= 0 ? '+' : ''}
                                      {formatEsNumber(shape.deltaZM, 1)} m ({formatEsInt(shape.slopePct)}% ·{' '}
                                      {formatEsNumber(shape.slopeDeg, 1)}°)
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-0.5 shrink-0">
                                {shape.type === 'polygon' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isZonePolygon) {
                                          setEditingAnnotationId(null);
                                          setSelectedShapeId(null);
                                          setEditingZonePolygonId((prev) =>
                                            prev === shape.id ? null : shape.id
                                          );
                                        } else {
                                          setEditingZonePolygonId(null);
                                          setSelectedShapeId((prev) =>
                                            prev === shape.id ? null : shape.id
                                          );
                                        }
                                      }}
                                      className={`p-1 rounded cursor-pointer ${
                                        isEditing
                                          ? 'text-emerald-300 bg-emerald-500/20'
                                          : isEditingZone
                                          ? 'text-lime-300 bg-lime-500/20'
                                          : isZonePolygon
                                          ? 'text-gray-400 hover:text-lime-300'
                                          : 'text-gray-400 hover:text-emerald-300'
                                      }`}
                                      title="Editar etiqueta, color y propiedades"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateShape(shape.id, {
                                          showLabel3D: shape.showLabel3D === false,
                                        })
                                      }
                                      className={`p-1 rounded cursor-pointer ${
                                        shape.showLabel3D !== false
                                          ? 'text-cyan-300 hover:text-cyan-200'
                                          : 'text-gray-600 hover:text-gray-400'
                                      }`}
                                      title={
                                        shape.showLabel3D !== false
                                          ? 'Ocultar etiqueta en el plano 2D'
                                          : 'Mostrar etiqueta en el plano 2D'
                                      }
                                    >
                                      <Tag className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => updateShape(shape.id, { visible: !shape.visible })}
                                  className="p-1 text-gray-400 hover:text-white rounded cursor-pointer"
                                  title={shape.visible ? 'Ocultar' : 'Mostrar'}
                                >
                                  {shape.visible ? (
                                    <Eye className="w-3 h-3" />
                                  ) : (
                                    <EyeOff className="w-3 h-3 text-gray-600" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDrawnShapes((prev) => prev.filter((s) => s.id !== shape.id));
                                    if (selectedShapeId === shape.id) setSelectedShapeId(null);
                                    if (editingZonePolygonId === shape.id) setEditingZonePolygonId(null);
                                  }}
                                  className="p-1 text-gray-400 hover:text-rose-400 rounded cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Stockpile Volume Editor */}
                            {isEditing && (
                              <div className="mt-2 pt-2 border-t border-gray-800 space-y-2">
                                <div>
                                  <label className="block text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">
                                    Etiqueta del volumen
                                  </label>
                                  <input
                                    type="text"
                                    value={shape.label}
                                    onChange={(e) => updateShape(shape.id, { label: e.target.value })}
                                    placeholder="Ej: Acopio Norte Grava"
                                    className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-md px-2 py-1 text-[10.5px] text-white outline-none"
                                  />
                                </div>

                                <div className="grid grid-cols-[1fr_74px] gap-1.5">
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">
                                      Material
                                    </label>
                                    <select
                                      value={matchedPreset ? matchedPreset.name : '__custom__'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '__custom__') {
                                          if (matchedPreset || !shape.material?.trim()) {
                                            updateShape(shape.id, { material: 'Material personalizado' });
                                          }
                                          return;
                                        }
                                        const preset = materialPresets.find(
                                          (m) => m.name === val
                                        );
                                        if (preset) {
                                          updateShape(shape.id, {
                                            material: preset.name,
                                            densityTonM3: preset.densityTonM3,
                                          });
                                        }
                                      }}
                                      className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-md px-1.5 py-1 text-[10px] text-gray-100 outline-none cursor-pointer"
                                    >
                                      {materialPresets.map((m, idx) => (
                                        <option key={m.id || `${m.name}-${idx}`} value={m.name}>
                                          {m.name}
                                        </option>
                                      ))}
                                      <option value="__custom__">Personalizado…</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">
                                      Dens. t/m³
                                    </label>
                                    <input
                                      type="number"
                                      min={0.5}
                                      max={4.5}
                                      step={0.05}
                                      value={shapeDensity}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (Number.isFinite(v) && v > 0) {
                                          updateShape(shape.id, { densityTonM3: v });
                                        }
                                      }}
                                      className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-md px-1.5 py-1 text-right font-mono text-[10px] text-amber-300 outline-none"
                                    />
                                  </div>
                                </div>

                                <input
                                  type="text"
                                  value={shape.material || ''}
                                  onChange={(e) => updateShape(shape.id, { material: e.target.value })}
                                  placeholder="Nombre personalizado del material..."
                                  className="w-full bg-[#0b0f17] border border-gray-800 focus:border-cyan-500 rounded-md px-2 py-1 text-[10px] text-cyan-200 outline-none"
                                />

                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] uppercase tracking-wider text-gray-400">
                                      Color del volumen
                                    </span>
                                    <span className="font-mono text-[9px] text-gray-400 uppercase">
                                      {shape.color}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {POLYGON_COLOR_PRESETS.map((preset) => (
                                        <button
                                          key={preset.hex}
                                          type="button"
                                          onClick={() => updateShape(shape.id, { color: preset.hex })}
                                          title={`Color ${preset.name}`}
                                          className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                                            shape.color.toLowerCase() === preset.hex.toLowerCase()
                                              ? 'border-white scale-110 ring-1 ring-white/60'
                                              : 'border-gray-700 opacity-85 hover:opacity-100'
                                          }`}
                                          style={{ backgroundColor: preset.hex }}
                                        />
                                      ))}
                                    </div>
                                    <input
                                      type="color"
                                      value={shape.color}
                                      onChange={(e) => updateShape(shape.id, { color: e.target.value })}
                                      title="Elegir cualquier color"
                                      className="w-5 h-5 rounded bg-transparent border border-gray-700 cursor-pointer p-0 shrink-0"
                                    />
                                  </div>

                                  <label className="flex items-center justify-between gap-2 text-[9.5px] text-gray-300">
                                    <span className="text-gray-400">Opacidad relleno</span>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="range"
                                        min="0.15"
                                        max="0.85"
                                        step="0.05"
                                        value={shape.opacity}
                                        onChange={(e) =>
                                          updateShape(shape.id, {
                                            opacity: parseFloat(e.target.value),
                                          })
                                        }
                                        className="w-24 accent-emerald-500 cursor-pointer"
                                      />
                                      <span className="font-mono text-[9.5px] text-emerald-300 w-7 text-right">
                                        {Math.round(shape.opacity * 100)}%
                                      </span>
                                    </div>
                                  </label>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                  <label className="inline-flex items-center gap-1.5 text-[9.5px] text-gray-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={shape.showLabel3D !== false}
                                      onChange={(e) =>
                                        updateShape(shape.id, { showLabel3D: e.target.checked })
                                      }
                                      className="accent-emerald-500 cursor-pointer"
                                    />
                                    <span>Mostrar etiqueta</span>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedShapeId(null)}
                                    className="px-2 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 text-[9.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Listo</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {drawnPins.map((pin) => {
                        const isAnnotation = pin.kind === 'annotation';
                        const cotaZ = baseYToElevM(pin.point.baseY);
                        const utm = terrain.worldToUtm(pin.point.x, pin.point.z);
                        return (
                          <div
                            key={pin.id}
                            className="flex items-start justify-between gap-2 bg-[#111827] border border-gray-800 rounded-lg px-2 py-1.5 text-[10px]"
                          >
                            <div className="flex items-start gap-1.5 min-w-0 flex-1">
                              {isAnnotation ? (
                                <MessageSquarePlus
                                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                                  style={{ color: pin.color }}
                                />
                              ) : (
                                <MapPin
                                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                                  style={{ color: pin.color }}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => focusPin(pin)}
                                  className="font-semibold text-gray-100 hover:text-cyan-300 truncate text-left w-full cursor-pointer"
                                  title="Centrar plano 2D en este punto"
                                >
                                  {pin.label}
                                </button>
                                {pin.note && (
                                  <div className="text-[9.5px] text-gray-300 truncate">
                                    {pin.note}
                                  </div>
                                )}
                                <div className="font-mono text-[9px] text-gray-400 truncate">
                                  Z {formatEsNumber(cotaZ, 2)} m · E {formatEsInt(utm.easting)} · N {formatEsInt(utm.northing)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedShapeId(null);
                                  setEditingZonePolygonId(null);
                                  setEditingAnnotationId(pin.id);
                                }}
                                className="p-1 text-gray-400 hover:text-cyan-300 rounded cursor-pointer"
                                title="Editar"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDrawnPins((prev) =>
                                    prev.map((p) =>
                                      p.id === pin.id ? { ...p, visible: !p.visible } : p
                                    )
                                  )
                                }
                                className="p-1 text-gray-400 hover:text-white rounded cursor-pointer"
                                title={pin.visible ? 'Ocultar' : 'Mostrar'}
                              >
                                {pin.visible ? (
                                  <Eye className="w-3 h-3" />
                                ) : (
                                  <EyeOff className="w-3 h-3 text-gray-600" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawnPins((prev) => prev.filter((p) => p.id !== pin.id));
                                  if (editingAnnotationId === pin.id) setEditingAnnotationId(null);
                                }}
                                className="p-1 text-gray-400 hover:text-rose-400 rounded cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* TOP-RIGHT OVERLAY: Transparent Engineering Toolbar (2D Tools, matching Visor 3D style) */}
        <div
          className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 max-w-[780px] pointer-events-none"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 bg-transparent border-0 shadow-none rounded-xl px-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                setDrawTool('orbit');
                setActiveDrawPoints([]);
                setPreviewPoint(null);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
                drawTool === 'orbit'
                  ? 'bg-blue-500/35 text-blue-100 border border-blue-300/80 backdrop-blur-[2px]'
                  : 'text-white/95 hover:text-blue-200 hover:bg-white/15 border border-transparent'
              }`}
              title="Navegar y desplazar el plano 2D"
            >
              <MousePointer className="w-4 h-4 shrink-0 text-blue-400" strokeWidth={2.2} />
              <span>Navegar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawTool('line');
                setActiveDrawPoints([]);
                setPreviewPoint(null);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
                drawTool === 'line'
                  ? 'bg-cyan-500/35 text-cyan-100 border border-cyan-300/80 backdrop-blur-[2px]'
                  : 'text-white/95 hover:text-cyan-200 hover:bg-white/15 border border-transparent'
              }`}
              title="Medir distancia, desnivel y pendiente (%) / ángulo (°) sobre el plano 2D"
            >
              <Minus className="w-4 h-4 shrink-0 text-cyan-400" strokeWidth={2.5} />
              <span>Recta</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawTool('polygon');
                setActiveDrawPoints([]);
                setPreviewPoint(null);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
                drawTool === 'polygon'
                  ? 'bg-emerald-500/35 text-emerald-100 border border-emerald-300/80 backdrop-blur-[2px]'
                  : 'text-white/95 hover:text-emerald-200 hover:bg-white/15 border border-transparent'
              }`}
              title="Delimitar un acopio sobre el plano 2D para calcular su volumen, material y etiqueta"
            >
              <Boxes className="w-4 h-4 shrink-0 text-emerald-400" strokeWidth={2.2} />
              <span>Volumen Acopio</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawTool('zone');
                setActiveDrawPoints([]);
                setPreviewPoint(null);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
                drawTool === 'zone'
                  ? 'bg-lime-500/35 text-lime-100 border border-lime-300/80 backdrop-blur-[2px]'
                  : 'text-white/95 hover:text-lime-200 hover:bg-white/15 border border-transparent'
              }`}
              title="Dibujar un polígono 2D sobre la ortofoto para medir área (m²/ha), colorear y anotar"
            >
              <Pentagon className="w-4 h-4 shrink-0 text-lime-400" strokeWidth={2.2} />
              <span>Polígono 2D</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawTool('pin');
                setActiveDrawPoints([]);
                setPreviewPoint(null);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
                drawTool === 'pin'
                  ? 'bg-amber-500/35 text-amber-100 border border-amber-300/80 backdrop-blur-[2px]'
                  : 'text-white/95 hover:text-amber-200 hover:bg-white/15 border border-transparent'
              }`}
              title="Colocar pin de cota Z y coordenadas UTM sobre el plano 2D"
            >
              <MapPin className="w-4 h-4 shrink-0 text-amber-400" strokeWidth={2.2} />
              <span>Pin Cota</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawTool('annotation');
                setActiveDrawPoints([]);
                setPreviewPoint(null);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
                drawTool === 'annotation'
                  ? 'bg-fuchsia-500/35 text-fuchsia-100 border border-fuchsia-300/80 backdrop-blur-[2px]'
                  : 'text-white/95 hover:text-fuchsia-200 hover:bg-white/15 border border-transparent'
              }`}
              title="Añadir una anotación con texto y color en cualquier punto del plano 2D"
            >
              <MessageSquarePlus className="w-4 h-4 shrink-0 text-fuchsia-400" strokeWidth={2.2} />
              <span>Anotación</span>
            </button>

            <div className="w-px h-5 bg-white/35 mx-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />

            <button
              type="button"
              onClick={resetView}
              className="p-1.5 rounded-lg text-violet-400 hover:text-violet-200 hover:bg-white/15 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
              title="Restablecer encuadre 2D"
            >
              <RotateCcw className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </button>

            <button
              type="button"
              onClick={captureScreenshotPng}
              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-white/15 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
              title="Descargar captura PNG en alta resolución del plano 2D"
            >
              <Download className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </button>
          </div>

          {baseLayer === 'hipsometria' && (
            <div className="pointer-events-auto bg-[#0b0f17]/92 border border-gray-800 rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
              <span className="text-[10px] font-semibold uppercase text-gray-400">Cota Z</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-blue-300">{formatElevM(zMinM)}m</span>
                <div
                  className="w-28 h-2.5 rounded"
                  style={{
                    background: `linear-gradient(to right, ${[...ELEVATION_STOPS]
                      .reverse()
                      .map((s) => s.color)
                      .join(', ')})`,
                  }}
                />
                <span className="text-[10px] font-mono text-slate-100">{formatElevM(zMaxM)}m</span>
              </div>
            </div>
          )}
        </div>

        {/* ERGONOMIC COLLAPSIBLE BOTTOM DOCK (2D Layers, Zoom & Flight Stockpiles — exact Visor 3D design) */}
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 w-[95%] max-w-[820px] pointer-events-none"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            className="pointer-events-auto px-3 py-1 rounded-lg bg-[#0b0f17]/95 hover:bg-gray-900 border border-gray-700 text-[11px] font-semibold text-gray-300 hover:text-white inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
            title="Atajo de teclado: H"
          >
            {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{dockOpen ? 'Ocultar Controles' : 'Mostrar Controles 2D'}</span>
          </button>

          {dockOpen && (
            <div className="pointer-events-auto w-full bg-[#0b0f17]/95 border border-gray-800 rounded-2xl p-2.5 shadow-2xl space-y-2.5">
              {/* Row 1: 2D Base Modes + GIS Vector Overlays */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase text-gray-500 mr-1 inline-flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Modo:
                  </span>
                  {(
                    [
                      { id: 'ortofoto', label: 'Ortofoto RGB' },
                      { id: 'hipsometria', label: 'Hipsometría Z (MDE)' },
                    ] as Array<{ id: BaseLayer2D; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setBaseLayer(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        baseLayer === m.id
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-[#111827] text-gray-300 hover:text-white border border-gray-800'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase text-gray-500 mr-1">
                    Capas:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowContours((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                      showContours
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-[#111827] text-gray-400 hover:text-white border-gray-800'
                    }`}
                  >
                    Curvas
                  </button>
                  {showContours && (
                    <button
                      type="button"
                      onClick={() => setContourStepM((s) => (s === 5 ? 1 : 5))}
                      className="px-2 py-1 rounded-lg text-[11px] font-mono bg-[#111827] hover:bg-gray-800 text-amber-200 border border-gray-700 cursor-pointer"
                      title="Cambiar equidistancia entre 1 m y 5 m"
                    >
                      {contourStepM}m
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowUtmGrid((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                      showUtmGrid
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-[#111827] text-gray-400 hover:text-white border-gray-800'
                    }`}
                  >
                    Malla UTM
                  </button>
                </div>
              </div>

              {/* Row 2: Zoom Controls + Scale Bar + Flight Stockpiles Visibility */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-gray-800/80 text-[11px]">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.65, Math.round((z - 0.25) * 100) / 100))}
                    className="p-1 rounded-lg bg-[#111827] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer"
                    aria-label="Alejar"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min="0.65"
                    max="6"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-28 sm:w-36 accent-cyan-500 cursor-pointer"
                    aria-label="Nivel de zoom"
                  />
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(6.0, Math.round((z + 0.25) * 100) / 100))}
                    className="p-1 rounded-lg bg-[#111827] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer"
                    aria-label="Acercar"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-cyan-300 w-10 text-right">
                    {Math.round(zoom * 100)}%
                  </span>

                  <div className="hidden sm:flex items-center gap-2 ml-2 pl-2 border-l border-gray-800">
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between text-[9px] font-mono text-gray-400">
                        <span>0</span>
                        <span>{scaleMeters} m</span>
                      </div>
                      <div
                        className="h-1.5 border border-gray-400 flex overflow-hidden"
                        style={{ width: `${Math.min(120, Math.max(52, scaleBarWidthPx * 0.65))}px` }}
                      >
                        <div className="w-1/2 h-full bg-white" />
                        <div className="w-1/2 h-full bg-gray-900" />
                      </div>
                    </div>
                  </div>
                </div>

                {terrain.stockpiles.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleFlightStockpiles}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border transition cursor-pointer shrink-0 ${
                      showFlightStockpiles
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/45'
                        : 'bg-[#111827] hover:bg-gray-800 text-gray-400 hover:text-white border-gray-700'
                    }`}
                    title={
                      showFlightStockpiles
                        ? 'Ocultar los acopios del vuelo en el plano 2D'
                        : 'Mostrar los acopios del vuelo en el plano 2D'
                    }
                    aria-pressed={showFlightStockpiles}
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>
                      {showFlightStockpiles
                        ? `Acopios vuelo (${terrain.stockpiles.length})`
                        : 'Acopios ocultos'}
                    </span>
                    {showFlightStockpiles ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM-LEFT LIVE UTM / Z COORDINATE READOUT */}
        {cursorCoords && (
          <div className="hidden md:flex absolute bottom-3 left-3 z-20 pointer-events-none bg-[#0b0f17]/90 border border-gray-800 rounded-lg px-2.5 py-1 text-[10px] font-mono text-gray-300 items-center gap-2 shadow">
            <span>E: {formatEsNumber(cursorCoords.easting, 1)} m</span>
            <span>N: {formatEsNumber(cursorCoords.northing, 1)} m</span>
            <span className="text-cyan-300 font-semibold">Z: {formatEsNumber(cursorCoords.elevM, 2)} m</span>
          </div>
        )}

        {/* BOTTOM-RIGHT OVERLAY: Fullscreen Toggle */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={() => void toggleFullscreen()}
          className={`absolute bottom-3 right-3 z-30 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 shadow-lg transition cursor-pointer ${
            isFullscreen
              ? 'bg-blue-600 text-white border border-blue-400/50'
              : 'bg-[#0b0f17]/95 text-gray-200 hover:text-white hover:bg-gray-900 border border-gray-700'
          }`}
          title={isFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pantalla completa</span>
            </>
          )}
        </button>

        {/* TOP-CENTER ACTIVE HINT: Drawing Tools or Custom Free Profile */}
        {drawTool !== 'orbit' ? (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="absolute top-14 sm:top-3 left-1/2 -translate-x-1/2 z-20 bg-[#0b0f17]/95 border border-emerald-500/50 rounded-xl px-3 py-1.5 text-[11px] text-gray-200 font-medium flex flex-wrap items-center gap-2 shadow-lg max-w-[92%]"
          >
            {drawTool === 'line' ? (
              <>
                <Minus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>
                  {activeDrawPoints.length === 0
                    ? 'Recta 2D: haz clic en el punto inicial sobre el plano (arrastrar = desplazar)'
                    : 'Recta 2D: haz clic en el punto final para medir distancia y pendiente'}
                </span>
              </>
            ) : drawTool === 'pin' ? (
              <>
                <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Pin de Cota: haz clic sobre cualquier punto del plano para marcar su cota Z y ponerle nombre</span>
              </>
            ) : drawTool === 'annotation' ? (
              <>
                <MessageSquarePlus className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                <span>Anotación 2D: haz clic sobre cualquier punto del plano para añadir una anotación</span>
              </>
            ) : drawTool === 'zone' ? (
              <>
                <Pentagon className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                <span>
                  {activeDrawPoints.length < 3
                    ? `Polígono 2D (${activeDrawPoints.length} pts): haz clic sobre el plano para trazar vértices`
                    : `Polígono 2D (${activeDrawPoints.length} pts): doble clic, Enter o clic en el 1.º punto para cerrar`}
                </span>
              </>
            ) : (
              <>
                <Boxes className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-cyan-300 font-semibold text-[10px]">{drawMaterial}</span>
                <span>
                  {activeDrawPoints.length < 3
                    ? `· Volumen Acopio (${activeDrawPoints.length} pts): haz clic rodeando la base del acopio`
                    : `· Volumen Acopio (${activeDrawPoints.length} pts): doble clic o clic en el 1.º punto para calcular`}
                </span>
              </>
            )}

            {activeDrawPoints.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveDrawPoints((prev) => prev.slice(0, -1))}
                className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-[10px] inline-flex items-center gap-1 cursor-pointer"
                title="Deshacer último vértice (Backspace)"
              >
                <Undo2 className="w-3 h-3" />
                <span>Deshacer</span>
              </button>
            )}

            {drawTool === 'polygon' && activeDrawPoints.length >= 3 && (
              <button
                type="button"
                onClick={() => commitDrawnShape('polygon', activeDrawPoints, 'stockpile')}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                title="Cerrar perímetro y calcular volumen del acopio (Enter)"
              >
                <Check className="w-3 h-3" />
                <span>Calcular Volumen</span>
              </button>
            )}

            {drawTool === 'zone' && activeDrawPoints.length >= 3 && (
              <button
                type="button"
                onClick={() => commitDrawnShape('polygon', activeDrawPoints, 'zone')}
                className="px-2 py-0.5 rounded bg-lime-500 hover:bg-lime-400 text-slate-950 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                title="Cerrar polígono 2D (Enter)"
              >
                <Check className="w-3 h-3" />
                <span>Cerrar Polígono</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveDrawPoints([]);
                setPreviewPoint(null);
                setDrawTool('orbit');
              }}
              className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] cursor-pointer"
            >
              Salir
            </button>
          </div>
        ) : (
          profileMode === 'custom' &&
          showProfileIn2D && (
            <div className="absolute top-14 sm:top-3 left-1/2 -translate-x-1/2 z-20 bg-[#0b0f17]/95 border border-rose-500/50 rounded-lg px-3 py-1.5 text-[11px] text-rose-300 font-medium flex items-center gap-2 shadow-lg pointer-events-none">
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>
                {customPts.length === 0
                  ? 'Haz clic en el punto inicial sobre el plano 2D'
                  : customPts.length === 1
                  ? 'Haz clic en el punto final para generar el corte'
                  : 'Corte personalizado activo (clic en el plano para trazar otro)'}
              </span>
            </div>
          )
        )}

        {/* FLOATING PIN COTA & POINT ANNOTATION COMPOSER */}
        {(() => {
          if (!editingAnnotationId) return null;
          const activePin = drawnPins.find((p) => p.id === editingAnnotationId);
          if (!activePin) return null;
          const isAnnotation = activePin.kind === 'annotation';
          const pinCotaZ = baseYToElevM(activePin.point.baseY);
          const utm = terrain.worldToUtm(activePin.point.x, activePin.point.z);
          const updateActivePin = (patch: Partial<DrawnPin3D>) => {
            setDrawnPins((prev) =>
              prev.map((p) => (p.id === activePin.id ? { ...p, ...patch } : p))
            );
          };
          const swatchColors = [
            '#e879f9',
            '#f43f5e',
            '#f59e0b',
            '#10b981',
            '#06b6d4',
            '#3b82f6',
            '#8b5cf6',
            '#facc15',
          ];

          return (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              className={`absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[300px] sm:w-[340px] bg-[#0b0f17]/96 border rounded-2xl p-3 shadow-2xl space-y-2.5 ${
                isAnnotation ? 'border-fuchsia-500/50' : 'border-amber-500/55'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isAnnotation ? (
                    <MessageSquarePlus className="w-4 h-4 text-fuchsia-400 shrink-0" />
                  ) : (
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-white truncate">
                    {isAnnotation ? 'Anotación en plano 2D' : 'Pin de Cota 2D'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAnnotationId(null)}
                  className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer"
                  title="Cerrar editor"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[10px] font-mono text-cyan-300 bg-[#111827] border border-gray-800 rounded-lg px-2 py-1 flex items-center justify-between">
                <span>Z: {formatEsNumber(pinCotaZ, 2)} m</span>
                <span className="text-gray-400">
                  E {formatEsNumber(utm.easting, 1)} · N {formatEsNumber(utm.northing, 1)}
                </span>
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-gray-400">
                  {isAnnotation ? 'Título de la anotación' : 'Nombre del pin (visible en el plano)'}
                </span>
                <input
                  type="text"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={activePin.label}
                  onChange={(e) => updateActivePin({ label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingAnnotationId(null);
                  }}
                  placeholder={
                    isAnnotation
                      ? 'Ej: Talud sur / Acceso maquinaria'
                      : 'Ej: Banco Norte / Vértice V-1'
                  }
                  className={`w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none ${
                    isAnnotation ? 'focus:border-fuchsia-400' : 'focus:border-amber-400'
                  }`}
                />
              </label>

              {isAnnotation && (
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold text-gray-400">
                    Nota / observación (opcional)
                  </span>
                  <textarea
                    rows={2}
                    value={activePin.note || ''}
                    onChange={(e) => updateActivePin({ note: e.target.value })}
                    placeholder="Escribe un comentario visible sobre el plano 2D..."
                    className="w-full bg-[#111827] border border-gray-700 focus:border-fuchsia-400 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-100 outline-none resize-none"
                  />
                </label>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-gray-400">Color:</span>
                <div className="flex items-center gap-1.5">
                  {swatchColors.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateActivePin({ color: hex })}
                      className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                        activePin.color.toLowerCase() === hex.toLowerCase()
                          ? 'border-white scale-115 ring-2 ring-white/40'
                          : 'border-gray-700 hover:scale-110'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={`Color ${hex}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={activePin.color}
                    onChange={(e) => updateActivePin({ color: e.target.value })}
                    title="Elegir cualquier color"
                    className="w-5 h-5 rounded bg-transparent border border-gray-700 cursor-pointer p-0 shrink-0"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setDrawnPins((prev) => prev.filter((p) => p.id !== activePin.id));
                    setEditingAnnotationId(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Eliminar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAnnotationId(null)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow cursor-pointer ${
                    isAnnotation
                      ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* FLOATING 2D POLYGON (ZONE) COMPOSER */}
        {(() => {
          if (!editingZonePolygonId) return null;
          const activeZone = drawnShapes.find(
            (s) => s.id === editingZonePolygonId && s.type === 'polygon' && s.polygonKind === 'zone'
          );
          if (!activeZone) return null;
          const areaText =
            activeZone.area2DM2 >= 10000
              ? `${formatEsNumber(activeZone.area2DM2 / 10000, 2)} ha`
              : `${formatEsInt(activeZone.area2DM2)} m²`;

          return (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[310px] sm:w-[360px] bg-[#0b0f17]/96 border border-lime-400/55 rounded-2xl p-3 shadow-2xl space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Pentagon className="w-4 h-4 text-lime-400 shrink-0" />
                  <span className="text-xs font-bold text-white truncate">
                    Polígono 2D sobre la ortofoto
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingZonePolygonId(null)}
                  className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer"
                  title="Cerrar editor"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[10px] font-mono text-cyan-300 bg-[#111827] border border-gray-800 rounded-lg px-2 py-1 flex items-center justify-between">
                <span>Área: {areaText}</span>
                <span className="text-gray-400">
                  Perím.: {formatEsNumber(activeZone.length2DM, 1)} m · {activeZone.points.length} vért.
                </span>
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-gray-400">
                  Nombre del polígono (visible en el plano)
                </span>
                <input
                  type="text"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={activeZone.label}
                  onChange={(e) => updateShape(activeZone.id, { label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingZonePolygonId(null);
                  }}
                  placeholder="Ej: Zona de voladura / Frente Este"
                  className="w-full bg-[#111827] border border-gray-700 focus:border-lime-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-gray-400">
                  Anotación / observaciones (visible en el plano)
                </span>
                <textarea
                  rows={2}
                  value={activeZone.note || ''}
                  onChange={(e) => updateShape(activeZone.id, { note: e.target.value })}
                  placeholder="Añade una anotación o descripción del polígono..."
                  className="w-full bg-[#111827] border border-gray-700 focus:border-lime-400 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-100 outline-none resize-none"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-gray-400">Color del polígono:</span>
                  <div className="flex items-center gap-1.5">
                    {POLYGON_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => updateShape(activeZone.id, { color: preset.hex })}
                        title={`Color ${preset.name}`}
                        className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                          activeZone.color.toLowerCase() === preset.hex.toLowerCase()
                            ? 'border-white scale-115 ring-2 ring-white/40'
                            : 'border-gray-700 hover:scale-110'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                    <input
                      type="color"
                      value={activeZone.color}
                      onChange={(e) => updateShape(activeZone.id, { color: e.target.value })}
                      title="Elegir cualquier color"
                      className="w-5 h-5 rounded bg-transparent border border-gray-700 cursor-pointer p-0 shrink-0"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 text-[10px] text-gray-300">
                  <span className="text-gray-400 font-semibold">Opacidad del relleno:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.15"
                      max="0.85"
                      step="0.05"
                      value={activeZone.opacity}
                      onChange={(e) =>
                        updateShape(activeZone.id, { opacity: parseFloat(e.target.value) })
                      }
                      className="w-28 accent-lime-400 cursor-pointer"
                    />
                    <span className="font-mono text-lime-300 w-8 text-right">
                      {Math.round(activeZone.opacity * 100)}%
                    </span>
                  </div>
                </label>

                <label className="inline-flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeZone.showLabel3D !== false}
                    onChange={(e) =>
                      updateShape(activeZone.id, { showLabel3D: e.target.checked })
                    }
                    className="accent-lime-400 cursor-pointer"
                  />
                  <span>Mostrar nombre y anotación sobre el plano 2D</span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setDrawnShapes((prev) => prev.filter((s) => s.id !== activeZone.id));
                    setEditingZonePolygonId(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Eliminar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingZonePolygonId(null)}
                  className="px-3 py-1 rounded-lg bg-lime-500 hover:bg-lime-400 text-slate-950 text-[11px] font-bold inline-flex items-center gap-1 shadow cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar</span>
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Transverse Topographic Profile Card (minimized at bottom by default, expandable in normal & fullscreen) */}
      <div
        className={`${
          isFullscreen
            ? `gis-canvas-surface bg-[#0f172a]/95 border border-gray-800 rounded-xl shrink-0 ${
                showProfilePanel ? 'p-3 h-[225px] sm:h-[250px]' : 'px-3 py-2'
              }`
            : `glass-panel border border-gray-800 rounded-2xl shrink-0 ${
                showProfilePanel ? 'p-3.5 sm:p-4 h-[305.333px]' : 'px-3.5 py-2.5'
              }`
        } shadow-lg flex flex-col transition-all`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowProfilePanel((v) => !v)}
            className="flex items-center gap-2 min-w-0 text-left group cursor-pointer"
            title={showProfilePanel ? 'Minimizar sección de perfiles' : 'Desplegar sección de perfiles'}
            aria-expanded={showProfilePanel}
          >
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/35 flex items-center justify-center shrink-0 group-hover:bg-rose-500/25 transition">
              <Ruler className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-white truncate flex items-center gap-2">
                <span className="truncate">{activeProfileSegment.label}</span>
                {!showProfilePanel && (
                  <span className="text-[10px] font-medium text-rose-300/90 hidden sm:inline">
                    · Minimizado
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-gray-400">
                Longitud: {formatEsInt(profileChartData.maxD)} m · Z mín {formatEsNumber(profileChartData.minElev, 1)} m · Z máx{' '}
                {formatEsNumber(profileChartData.maxElev, 1)} m · ΔZ {formatEsNumber(profileChartData.deltaZ, 1)} m
              </div>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowProfileIn2D((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                showProfileIn2D
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/50 hover:bg-rose-500/30'
                  : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
              }`}
              title={
                showProfileIn2D
                  ? 'Ocultar la línea del perfil sobre el plano 2D'
                  : 'Mostrar la línea del perfil sobre el plano 2D'
              }
            >
              {showProfileIn2D ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showProfileIn2D ? 'Perfil en 2D' : 'Perfil oculto'}</span>
            </button>

            <div className="h-5 w-px bg-gray-800 mx-0.5 hidden sm:block" />

            <div className="flex items-center gap-1">
              {(['A', 'B', 'custom'] as ProfilePresetId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => {
                    setProfileMode(pid);
                    setShowProfilePanel(true);
                    if (pid === 'custom') {
                      setCustomPts([]);
                      setShowProfileIn2D(true);
                      setDrawTool('orbit');
                      setActiveDrawPoints([]);
                      setPreviewPoint(null);
                    }
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer ${
                    profileMode === pid
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                >
                  {pid === 'A' ? "A-A'" : pid === 'B' ? "B-B'" : 'Libre'}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-gray-800 mx-0.5 hidden sm:block" />

            <button
              type="button"
              onClick={() =>
                exportProfile2DDxf(profileSamples, {
                  profileLabel:
                    profileMode === 'custom' && customPts.length < 2
                      ? "Perfil A-A' (Oeste-Este)"
                      : activeProfileSegment.label,
                  quarryName: quarry?.name || 'Explotacion',
                  flightCode: activeFlight?.flightCode,
                  flightDate: activeFlight ? formatDateEu(activeFlight.surveyDate) : undefined,
                })
              }
              className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/40 text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              title="Descargar perfil topográfico 2D en AutoCAD DXF (escala 1:1 en metros, rejilla y guitarra de cotas)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DXF 2D</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportProfile3DDxf(profileSamples, {
                  profileLabel:
                    profileMode === 'custom' && customPts.length < 2
                      ? "Perfil A-A' (Oeste-Este)"
                      : activeProfileSegment.label,
                  quarryName: quarry?.name || 'Explotacion',
                  flightCode: activeFlight?.flightCode,
                  flightDate: activeFlight ? formatDateEu(activeFlight.surveyDate) : undefined,
                })
              }
              className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              title="Descargar polilínea 3D georreferenciada en coordenadas UTM (AutoCAD / Civil 3D / QGIS)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DXF 3D (UTM)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowProfilePanel((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border transition cursor-pointer ${
                showProfilePanel
                  ? 'text-gray-300 hover:text-white bg-gray-800/80 border-gray-700 hover:border-gray-600'
                  : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-500/45'
              }`}
              title={showProfilePanel ? 'Minimizar perfil' : 'Mostrar gráfico de perfil'}
              aria-expanded={showProfilePanel}
            >
              <span>{showProfilePanel ? 'Minimizar' : 'Ver perfil'}</span>
              {showProfilePanel ? (
                isFullscreen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )
              ) : isFullscreen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {showProfilePanel && (
          <div className="gis-canvas-surface bg-[#0b0f17] border border-gray-800 rounded-xl p-3 mt-3 flex-1 min-h-0 flex flex-col gap-2">
            <div ref={profileChartHostRef} className="w-full flex-1 min-h-0">
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${profileChartData.w} ${profileChartData.h}`}
                className="block w-full h-full cursor-crosshair"
                onMouseLeave={() => setHoverSampleIdx(null)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width) * profileChartData.w;
                  const t = Math.max(
                    0,
                    Math.min(1, (relX - profileChartData.padL) / profileChartData.plotW)
                  );
                  const idx = Math.round(t * (profileSamples.length - 1));
                  setHoverSampleIdx(idx);
                }}
              >
                <defs>
                  <linearGradient id="profileGrad2d" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity="0.42" />
                    <stop offset="100%" stopColor="#fb7185" stopOpacity="0.03" />
                  </linearGradient>
                </defs>

                {/* Reference vertical distance grid */}
                {profileChartData.xTicks.map((tick) => (
                  <g key={tick.frac}>
                    {tick.frac > 0 && tick.frac < 1 && (
                      <line
                        x1={tick.x}
                        y1={profileChartData.padT}
                        x2={tick.x}
                        y2={profileChartData.padT + profileChartData.plotH}
                        stroke="#1f2937"
                        strokeDasharray="2 4"
                        strokeWidth={1}
                      />
                    )}
                    <text
                      x={tick.x}
                      y={profileChartData.h - 5}
                      textAnchor={tick.frac === 0 ? 'start' : tick.frac === 1 ? 'end' : 'middle'}
                      fill="#9ca3af"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {formatEsInt(tick.distM)} m
                    </text>
                  </g>
                ))}

                {/* Reference horizontal elevation grid */}
                {profileChartData.gridLevels.map((lvl) => {
                  const yNorm = Math.max(
                    0,
                    Math.min(1, (lvl.value - zMinM) / Math.max(0.01, zMaxM - zMinM))
                  );
                  const y = profileChartData.padT + (1 - yNorm) * profileChartData.plotH;
                  return (
                    <g key={lvl.key}>
                      <line
                        x1={profileChartData.padL}
                        y1={y}
                        x2={profileChartData.w - profileChartData.padR}
                        y2={y}
                        stroke="#1f2937"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      />
                      <text
                        x={profileChartData.padL - 6}
                        y={y + 3.5}
                        textAnchor="end"
                        fill="#9ca3af"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {lvl.label}m
                      </text>
                    </g>
                  );
                })}

                <path d={profileChartData.areaD} fill="url(#profileGrad2d)" />
                <path d={profileChartData.lineD} fill="none" stroke="#fb7185" strokeWidth={2} />

                {/* Hover Crosshair */}
                {hoverSampleIdx !== null && profileChartData.pts[hoverSampleIdx] && (
                  <g>
                    <line
                      x1={profileChartData.pts[hoverSampleIdx].x}
                      y1={profileChartData.padT}
                      x2={profileChartData.pts[hoverSampleIdx].x}
                      y2={profileChartData.padT + profileChartData.plotH}
                      stroke="#f8fafc"
                      strokeWidth={1.1}
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={profileChartData.pts[hoverSampleIdx].x}
                      cy={profileChartData.pts[hoverSampleIdx].y}
                      r={4}
                      fill="#fb7185"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  </g>
                )}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-gray-300 px-1 pt-1.5 border-t border-gray-800/80 shrink-0">
              {hoveredSample ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Dist: <strong className="text-white">{formatEsNumber(hoveredSample.distanceM, 1)} m</strong>
                  </span>
                  <span className="text-rose-300 font-bold">
                    Cota Z: {formatEsNumber(hoveredSample.elevationM, 2)} m
                  </span>
                  <span className="text-gray-400">
                    UTM E {formatEsNumber(hoveredSample.easting, 1)} · N {formatEsNumber(hoveredSample.northing, 1)}
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Longitud: <strong className="text-white">{formatEsInt(profileChartData.maxD)} m</strong>
                  </span>
                  <span>
                    Z mín: <strong className="text-white">{formatEsNumber(profileChartData.minElev, 1)} m</strong>
                  </span>
                  <span>
                    Z máx: <strong className="text-white">{formatEsNumber(profileChartData.maxElev, 1)} m</strong>
                  </span>
                  <span>
                    Desnivel ΔZ: <strong className="text-rose-300">{formatEsNumber(profileChartData.deltaZ, 1)} m</strong>
                  </span>
                </div>
              )}
              <span className="text-[10px] font-sans text-gray-400">
                Mueve el cursor sobre el perfil para inspeccionar cotas en el plano 2D
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
