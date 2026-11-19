import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Boxes,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
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
  Mountain,
  MousePointer,
  Pencil,
  Pentagon,
  RotateCcw,
  Ruler,
  RotateCw,
  Tag,
  Trash2,
  Undo2,
  Waves,
  X,
} from 'lucide-react';
import {
  ELEV_MAX_M,
  ELEV_MIN_M,
  TERRAIN_HALF_M,
  TERRAIN_SPAN_M,
  extractContours,
  hypsometricColorRgb,
  renderHypsometryCanvas,
  renderOrthophotoCanvas,
  sampleProfileLine,
  type ProfileSample,
  type QuarryTerrainData,
  type StockpileFootprint,
} from '../utils/quarryTerrainModel.ts';
import { formatDateEu } from '../utils/dateUtils.ts';
import {
  createPointCircleSpriteTexture,
  load3DAssetFromUrl,
  type Loaded3DAssetResult,
} from '../utils/threeFileLoader.ts';
import {
  POLYGON_COLOR_PRESETS,
  STOCKPILE_MATERIAL_PRESETS,
  buildDrawnShapesGroup,
  computePolygonVolumeMetrics,
  computeShapeMetrics,
  disposeObject3DTree,
  exportDrawingsCsv,
  pickSurfacePoint3D,
  type DrawToolMode,
  type DrawnPin3D,
  type DrawnPoint3D,
  type DrawnShape3D,
} from '../utils/drawing3DOverlay.ts';
import { exportProfile2DDxf, exportProfile3DDxf } from '../utils/dxfProfileExporter.ts';
import type { Quarry, Survey } from '../types.ts';

type RenderMode3D = 'ortofoto' | 'hipsometria' | 'curvas' | 'nube' | 'tin';
type CameraPresetId = 'oblique' | 'nadir' | 'north' | 'east';
type ProfilePresetId = 'A' | 'B' | 'custom';

export interface External3DSource {
  url: string;
  fileName: string;
  label: string;
}

interface Quarry3DViewerProps {
  quarry: Quarry | null;
  activeFlight?: Survey;
  terrain: QuarryTerrainData;
  external3DSource?: External3DSource | null;
  customOrthoCanvas?: HTMLCanvasElement | null;
  onClearExternal3D?: () => void;
  showFlightStockpiles?: boolean;
  onToggleFlightStockpiles?: () => void;
}

interface CameraGoal {
  active: boolean;
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

function formatElevM(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

function computeDemVisualSpan(zMinM: number, zMaxM: number): number {
  const span = Math.max(0.01, zMaxM - zMinM);
  return span <= 90 ? Math.max(10, span) : 90 + (span - 90) * (50 / 910);
}

function demElevToBaseY(rawDemElevM: number, demMinM: number, demMaxM: number): number {
  const t = (rawDemElevM - demMinM) / Math.max(0.01, demMaxM - demMinM);
  return t * computeDemVisualSpan(demMinM, demMaxM);
}

function demElevToViewerZ(
  rawDemElevM: number,
  demMinM: number,
  demMaxM: number,
  zMinM: number,
  zMaxM: number
): number {
  const t = (rawDemElevM - demMinM) / Math.max(0.01, demMaxM - demMinM);
  return zMinM + t * (zMaxM - zMinM);
}

function baseYToViewerZ(
  baseY: number,
  hasExternal: boolean,
  extHeightSpan: number,
  zMinM: number,
  zMaxM: number
): number {
  const visSpan = hasExternal
    ? Math.max(1e-4, extHeightSpan)
    : computeDemVisualSpan(zMinM, zMaxM);
  return zMinM + (baseY / visSpan) * (zMaxM - zMinM);
}

function viewerZToBaseY(
  elevM: number,
  hasExternal: boolean,
  extHeightSpan: number,
  zMinM: number,
  zMaxM: number
): number {
  const visSpan = hasExternal
    ? Math.max(1e-4, extHeightSpan)
    : computeDemVisualSpan(zMinM, zMaxM);
  return ((elevM - zMinM) / Math.max(0.01, zMaxM - zMinM)) * visSpan;
}

const ELEVATION_STOPS = [
  { elev: 1000, color: '#f8fafc' },
  { elev: 820, color: '#f97316' },
  { elev: 640, color: '#eab308' },
  { elev: 440, color: '#10b981' },
  { elev: 220, color: '#06b6d4' },
  { elev: 0, color: '#1d4ed8' },
];

export const Quarry3DViewer: React.FC<Quarry3DViewerProps> = ({
  quarry,
  activeFlight,
  terrain,
  external3DSource = null,
  customOrthoCanvas = null,
  onClearExternal3D,
  showFlightStockpiles: controlledShowFlightStockpiles,
  onToggleFlightStockpiles,
}) => {
  const viewerWrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const profileChartHostRef = useRef<HTMLDivElement | null>(null);
  const [profileChartSize, setProfileChartSize] = useState<{ w: number; h: number }>({
    w: 960,
    h: 168,
  });

  const [renderMode, setRenderMode] = useState<RenderMode3D>('ortofoto');
  const [exaggeration, setExaggeration] = useState<number>(1.35);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('oblique');

  const [profileMode, setProfileMode] = useState<ProfilePresetId>('A');
  const [customPts, setCustomPts] = useState<Array<{ x: number; z: number }>>([]);
  const [hoverSampleIdx, setHoverSampleIdx] = useState<number | null>(null);
  const [showProfilePanel, setShowProfilePanel] = useState<boolean>(false);
  const [showProfileIn3D, setShowProfileIn3D] = useState<boolean>(true);
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

  const [selectedStockpile, setSelectedStockpile] = useState<StockpileFootprint | null>(null);
  const [dockOpen, setDockOpen] = useState<boolean>(true);
  const [contextLost, setContextLost] = useState<boolean>(false);

  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState<boolean>(false);
  const isFullscreen = isNativeFullscreen || isCssFullscreen;

  const defaultMaterialPreset = STOCKPILE_MATERIAL_PRESETS[2];
  const [drawTool, setDrawTool] = useState<DrawToolMode>('orbit');
  const [activeDrawPoints, setActiveDrawPoints] = useState<DrawnPoint3D[]>([]);
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape3D[]>([]);
  const [drawnPins, setDrawnPins] = useState<DrawnPin3D[]>([]);
  const [drawColor, setDrawColor] = useState<string>(defaultMaterialPreset.color);
  const [drawOpacity, setDrawOpacity] = useState<number>(0.42);
  const [drawMaterial, setDrawMaterial] = useState<string>(defaultMaterialPreset.name);
  const [densityTonM3, setDensityTonM3] = useState<number>(defaultMaterialPreset.densityTonM3);
  const [showShapesPanel, setShowShapesPanel] = useState<boolean>(true);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editingZonePolygonId, setEditingZonePolygonId] = useState<string | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ x: number; z: number; elevM: number } | null>(null);

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

  const [zMinM, setZMinM] = useState<number>(() => demElevationBounds.minM);
  const [zMaxM, setZMaxM] = useState<number>(() => demElevationBounds.maxM);
  const [refPlaneEnabled, setRefPlaneEnabled] = useState<boolean>(false);
  const [refPlaneElevM, setRefPlaneElevM] = useState<number>(
    () => Math.round(((demElevationBounds.minM + demElevationBounds.maxM) * 0.5) * 10) / 10
  );
  const [externalHeightSpan, setExternalHeightSpan] = useState<number>(55);

  const [externalLoading, setExternalLoading] = useState<boolean>(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalInfo, setExternalInfo] = useState<{
    count: number;
    totalCount?: number;
    kind: 'mesh' | 'pointcloud';
  } | null>(null);
  const [externalZUp, setExternalZUp] = useState<boolean>(true);
  const [pointSize, setPointSize] = useState<number>(1.0);
  const [pointMaxCount, setPointMaxCount] = useState<number>(50_000_000);

  // Refs for Three.js imperative objects
  const renderModeRef = useRef<RenderMode3D>(renderMode);
  const exaggerationRef = useRef<number>(exaggeration);
  const demElevationBoundsRef = useRef(demElevationBounds);
  const zMinMRef = useRef<number>(zMinM);
  const zMaxMRef = useRef<number>(zMaxM);
  const externalHeightSpanRef = useRef<number>(externalHeightSpan);
  const profileModeRef = useRef<ProfilePresetId>(profileMode);
  const hasExternalRef = useRef<boolean>(false);
  const pointSizeRef = useRef<number>(pointSize);
  const lastExternalSourceRef = useRef<External3DSource | null>(null);
  const externalZUpRef = useRef<boolean>(externalZUp);
  const drawToolRef = useRef<DrawToolMode>(drawTool);
  const activeDrawPointsRef = useRef<DrawnPoint3D[]>(activeDrawPoints);
  const previewDrawPointRef = useRef<DrawnPoint3D | null>(null);
  const drawnShapesRef = useRef<DrawnShape3D[]>(drawnShapes);
  const drawnPinsRef = useRef<DrawnPin3D[]>(drawnPins);
  const drawColorRef = useRef<string>(drawColor);
  const drawOpacityRef = useRef<number>(drawOpacity);
  const drawMaterialRef = useRef<string>(drawMaterial);
  const densityTonM3Ref = useRef<number>(densityTonM3);
  const selectedShapeIdRef = useRef<string | null>(selectedShapeId);
  const hydratedStorageKeyRef = useRef<string | null>(null);
  const metersPerUnitRef = useRef<number>(1);
  const isCssFullscreenRef = useRef<boolean>(isCssFullscreen);
  const showProfileIn3DRef = useRef<boolean>(showProfileIn3D);
  const showFlightStockpilesRef = useRef<boolean>(showFlightStockpiles);

  renderModeRef.current = renderMode;
  exaggerationRef.current = exaggeration;
  demElevationBoundsRef.current = demElevationBounds;
  zMinMRef.current = zMinM;
  zMaxMRef.current = zMaxM;
  externalHeightSpanRef.current = externalHeightSpan;
  profileModeRef.current = profileMode;
  showProfileIn3DRef.current = showProfileIn3D;
  showFlightStockpilesRef.current = showFlightStockpiles;
  hasExternalRef.current = Boolean(external3DSource);
  pointSizeRef.current = pointSize;
  externalZUpRef.current = externalZUp;
  drawToolRef.current = drawTool;
  activeDrawPointsRef.current = activeDrawPoints;
  drawnShapesRef.current = drawnShapes;
  drawnPinsRef.current = drawnPins;
  drawColorRef.current = drawColor;
  drawOpacityRef.current = drawOpacity;
  drawMaterialRef.current = drawMaterial;
  densityTonM3Ref.current = densityTonM3;
  selectedShapeIdRef.current = selectedShapeId;
  isCssFullscreenRef.current = isCssFullscreen;

  const volumeStorageKey = useMemo(
    () =>
      `ingeodron_3d_volumes_v1_${quarry?.id ?? 'none'}_${activeFlight?.id ?? 'default'}_${
        external3DSource?.fileName || 'dem'
      }`,
    [quarry?.id, activeFlight?.id, external3DSource?.fileName]
  );

  // Hydrate saved volumes, materials, labels & pins for this quarry/flight/model
  useEffect(() => {
    hydratedStorageKeyRef.current = null;
    try {
      const raw = window.localStorage.getItem(volumeStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          shapes?: DrawnShape3D[];
          pins?: DrawnPin3D[];
        };
        if (Array.isArray(parsed.shapes)) {
          setDrawnShapes(
            parsed.shapes.map((s) =>
              s.type === 'polygon'
                ? s.polygonKind === 'zone'
                  ? {
                      ...s,
                      polygonKind: 'zone',
                      note: s.note ?? '',
                      showLabel3D: s.showLabel3D ?? true,
                    }
                  : {
                      ...s,
                      polygonKind: 'stockpile',
                      material: s.material ?? defaultMaterialPreset.name,
                      densityTonM3: s.densityTonM3 ?? defaultMaterialPreset.densityTonM3,
                      showLabel3D: s.showLabel3D ?? true,
                    }
                : s
            )
          );
        } else {
          setDrawnShapes([]);
        }
        setDrawnPins(Array.isArray(parsed.pins) ? parsed.pins : []);
      } else {
        setDrawnShapes([]);
        setDrawnPins([]);
      }
    } catch {
      setDrawnShapes([]);
      setDrawnPins([]);
    }
    setSelectedShapeId(null);
    setEditingAnnotationId(null);
    setEditingZonePolygonId(null);
    hydratedStorageKeyRef.current = volumeStorageKey;
  }, [volumeStorageKey, defaultMaterialPreset.densityTonM3, defaultMaterialPreset.name]);

  // Persist volumes & annotations per quarry/flight/model
  useEffect(() => {
    if (hydratedStorageKeyRef.current !== volumeStorageKey) return;
    try {
      if (drawnShapes.length === 0 && drawnPins.length === 0) {
        window.localStorage.removeItem(volumeStorageKey);
      } else {
        window.localStorage.setItem(
          volumeStorageKey,
          JSON.stringify({ shapes: drawnShapes, pins: drawnPins })
        );
      }
    } catch {
      // Ignore storage quota / restricted iframe errors
    }
  }, [drawnShapes, drawnPins, volumeStorageKey]);

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sunLight: THREE.DirectionalLight;
    terrainMesh: THREE.Mesh;
    terrainGeom: THREE.PlaneGeometry;
    tinWireMesh: THREE.Mesh;
    tinGeom: THREE.PlaneGeometry;
    skirtMesh: THREE.Mesh;
    skirtGeom: THREE.BufferGeometry;
    pointCloud: THREE.Points;
    pointGeom: THREE.BufferGeometry;
    pointMat: THREE.PointsMaterial;
    contourGroup: THREE.Group;
    minorContourLines: THREE.LineSegments;
    masterContourLines: THREE.LineSegments;
    orthoMat: THREE.MeshStandardMaterial;
    hypsoMat: THREE.MeshStandardMaterial;
    contourBaseMat: THREE.MeshStandardMaterial;
    tinBaseMat: THREE.MeshStandardMaterial;
    markersGroup: THREE.Group;
    markerEntries: Array<{
      group: THREE.Group;
      stockpile: StockpileFootprint;
      haloMesh: THREE.Mesh;
      crystalMesh: THREE.Mesh;
    }>;
    profileGroup: THREE.Group;
    profileLine: THREE.Line;
    profileRibbon: THREE.Mesh;
    drawOverlayGroup: THREE.Group;
    refPlaneGroup: THREE.Group;
    externalHost: THREE.Group;
    externalAsset: Loaded3DAssetResult | null;
    defaultOrthoTexture: THREE.CanvasTexture;
    customOrthoTexture: THREE.CanvasTexture | null;
    maxAniso: number;
    cameraGoal: CameraGoal;
    requestRender: () => void;
    updateExaggeration: (ex: number) => void;
    updateRenderVisibility: (mode: RenderMode3D) => void;
    updateProfileGeometry: (
      p0: { x: number; z: number },
      p1: { x: number; z: number },
      ex: number
    ) => void;
    rebuildDrawOverlay: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  // Compute active profile endpoints
  const activeProfileSegment = useMemo(() => {
    if (profileMode === 'A') {
      return {
        label: "Perfil A–A' (Oeste–Este)",
        p0: { x: terrain.defaultProfileA.x0, z: terrain.defaultProfileA.z0 },
        p1: { x: terrain.defaultProfileA.x1, z: terrain.defaultProfileA.z1 },
      };
    }
    if (profileMode === 'B') {
      return {
        label: "Perfil B–B' (Norte–Sur)",
        p0: { x: terrain.defaultProfileB.x0, z: terrain.defaultProfileB.z0 },
        p1: { x: terrain.defaultProfileB.x1, z: terrain.defaultProfileB.z1 },
      };
    }
    if (customPts.length === 2) {
      return {
        label: 'Corte Transversal Libre',
        p0: customPts[0],
        p1: customPts[1],
      };
    }
    return {
      label:
        customPts.length === 1
          ? 'Selecciona el 2.º punto sobre el modelo 3D'
          : 'Haz 2 clics en el modelo 3D para trazar el corte',
      p0: terrain.defaultProfileA.x0 !== undefined ? { x: terrain.defaultProfileA.x0, z: terrain.defaultProfileA.z0 } : { x: -160, z: 0 },
      p1: { x: terrain.defaultProfileA.x1, z: terrain.defaultProfileA.z1 },
    };
  }, [profileMode, customPts, terrain]);

  const profileSamples = useMemo<ProfileSample[]>(() => {
    const raw = sampleProfileLine(
      terrain,
      activeProfileSegment.p0.x,
      activeProfileSegment.p0.z,
      activeProfileSegment.p1.x,
      activeProfileSegment.p1.z,
      120
    );
    return raw.map((s) => ({
      ...s,
      elevationM:
        Math.round(
          demElevToViewerZ(
            s.elevationM,
            demElevationBounds.minM,
            demElevationBounds.maxM,
            zMinM,
            zMaxM
          ) * 100
        ) / 100,
    }));
  }, [terrain, activeProfileSegment, demElevationBounds, zMinM, zMaxM]);

  // Fullscreen state synchronization & CSS fallback body scroll lock
  useEffect(() => {
    const onFsChange = () => {
      const el = viewerWrapperRef.current;
      setIsNativeFullscreen(Boolean(el && document.fullscreenElement === el));
      sceneRef.current?.requestRender();
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

  const toggleFullscreen = async () => {
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
  };

  const updateShape = (id: string, patch: Partial<DrawnShape3D>) => {
    setDrawnShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const applyDrawMaterialPreset = (presetName: string) => {
    setDrawMaterial(presetName);
    const preset = STOCKPILE_MATERIAL_PRESETS.find((m) => m.name === presetName);
    if (preset) {
      setDensityTonM3(preset.densityTonM3);
      setDrawColor(preset.color);
    }
  };

  const commitDrawnShape = (
    type: 'line' | 'polygon',
    pts: DrawnPoint3D[],
    polygonKind: 'stockpile' | 'zone' = 'stockpile'
  ) => {
    if ((type === 'line' && pts.length < 2) || (type === 'polygon' && pts.length < 3)) return;
    const isZone = type === 'polygon' && polygonKind === 'zone';
    const visSpan = hasExternalRef.current
      ? Math.max(1e-4, externalHeightSpanRef.current)
      : computeDemVisualSpan(zMinMRef.current, zMaxMRef.current);
    const vertMetersPerUnit = Math.max(0.01, zMaxMRef.current - zMinMRef.current) / visSpan;

    const metrics = computeShapeMetrics(
      type,
      pts,
      metersPerUnitRef.current,
      vertMetersPerUnit
    );

    let volumeResult: {
      volumeSupported: boolean;
      cutVolumeM3: number;
      fillVolumeM3: number;
      netVolumeM3: number;
      baseMinY?: number;
      baseMaxY?: number;
      baseMinPt?: { x: number; z: number };
      baseMaxPt?: { x: number; z: number };
    } = {
      volumeSupported: false,
      cutVolumeM3: 0,
      fillVolumeM3: 0,
      netVolumeM3: 0,
    };

    if (type === 'polygon' && !isZone) {
      const ctx = sceneRef.current;
      const extMeshes: THREE.Mesh[] = [];
      const extPoints: THREE.Points[] = [];
      if (ctx && hasExternalRef.current) {
        ctx.externalHost.traverse((obj) => {
          if (!obj.visible) return;
          if (obj instanceof THREE.Mesh) extMeshes.push(obj);
          else if (obj instanceof THREE.Points) extPoints.push(obj);
        });
      }
      volumeResult = computePolygonVolumeMetrics(pts, {
        hasExternal: hasExternalRef.current,
        exaggeration: exaggerationRef.current,
        metersPerSceneUnit: metersPerUnitRef.current,
        verticalMetersPerUnit: vertMetersPerUnit,
        sampleDemBaseY: (x, z) =>
          demElevToBaseY(
            terrain.sampleElevationAt(x, z),
            demElevationBoundsRef.current.minM,
            demElevationBoundsRef.current.maxM
          ),
        externalMeshes: extMeshes,
        externalPoints: extPoints,
      });
    }

    const newId = `${isZone ? 'zone' : type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDrawnShapes((prev) => {
      const sameTypeCount =
        type === 'line'
          ? prev.filter((s) => s.type === 'line').length + 1
          : isZone
          ? prev.filter((s) => s.type === 'polygon' && s.polygonKind === 'zone').length + 1
          : prev.filter((s) => s.type === 'polygon' && s.polygonKind !== 'zone').length + 1;
      const newShape: DrawnShape3D = {
        id: newId,
        type,
        polygonKind: type === 'polygon' ? polygonKind : undefined,
        label: isZone
          ? `Polígono ${sameTypeCount}`
          : type === 'polygon'
          ? `Acopio ${sameTypeCount}`
          : `Recta ${sameTypeCount}`,
        note: isZone ? '' : undefined,
        material: type === 'polygon' && !isZone ? drawMaterialRef.current : undefined,
        densityTonM3: type === 'polygon' && !isZone ? densityTonM3Ref.current : undefined,
        showLabel3D: type === 'polygon' ? true : undefined,
        points: pts,
        color: drawColorRef.current,
        opacity: type === 'polygon' ? drawOpacityRef.current : 1,
        visible: true,
        ...metrics,
        ...volumeResult,
      };
      return [...prev, newShape];
    });
    if (isZone) {
      setShowShapesPanel(true);
      setSelectedShapeId(null);
      setEditingAnnotationId(null);
      setEditingZonePolygonId(newId);
    } else if (type === 'polygon') {
      setShowShapesPanel(true);
      setEditingZonePolygonId(null);
      setSelectedShapeId(newId);
    }
    setActiveDrawPoints([]);
    previewDrawPointRef.current = null;
  };

  const commitPin = (pt: DrawnPoint3D) => {
    const newId = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDrawnPins((prev) => {
      const pinCount = prev.filter((p) => p.kind !== 'annotation').length + 1;
      const newPin: DrawnPin3D = {
        id: newId,
        kind: 'pin',
        label: `Cota P-${pinCount}`,
        point: pt,
        color: drawColorRef.current,
        visible: true,
      };
      return [...prev, newPin];
    });
    setShowShapesPanel(true);
    setEditingZonePolygonId(null);
    setEditingAnnotationId(newId);
  };

  const commitAnnotation = (pt: DrawnPoint3D) => {
    const newId = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDrawnPins((prev) => {
      const annCount = prev.filter((p) => p.kind === 'annotation').length + 1;
      const newAnn: DrawnPin3D = {
        id: newId,
        kind: 'annotation',
        label: `Anotación ${annCount}`,
        note: '',
        point: pt,
        color: '#e879f9',
        visible: true,
      };
      return [...prev, newAnn];
    });
    setShowShapesPanel(true);
    setEditingZonePolygonId(null);
    setEditingAnnotationId(newId);
  };

  const captureScreenshotPng = () => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const { renderer, scene, camera, controls } = ctx;
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevPixelRatio = renderer.getPixelRatio();
    const prevAspect = camera.aspect;

    const safePrevW = Math.max(1, prevSize.x);
    const safePrevH = Math.max(1, prevSize.y);
    const aspect = safePrevW / safePrevH;

    // Clamp target Ultra-HD 4K export dimensions safely to GPU hardware limits
    const gl = renderer.getContext();
    const maxRb = Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 4096;
    const maxVpDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | number[] | null;
    const maxVpW = maxVpDims && maxVpDims[0] ? Number(maxVpDims[0]) : 4096;
    const maxVpH = maxVpDims && maxVpDims[1] ? Number(maxVpDims[1]) : 4096;
    const maxTex = renderer.capabilities.maxTextureSize || 4096;
    const maxAllowedW = Math.min(4096, maxRb, maxVpW, maxTex);
    const maxAllowedH = Math.min(4096, maxRb, maxVpH, maxTex);

    const targetLongEdge = 4096;
    let exportW: number;
    let exportH: number;
    if (aspect >= 1) {
      exportW = Math.min(maxAllowedW, targetLongEdge);
      exportH = Math.round(exportW / aspect);
      if (exportH > maxAllowedH) {
        exportH = maxAllowedH;
        exportW = Math.round(exportH * aspect);
      }
    } else {
      exportH = Math.min(maxAllowedH, targetLongEdge);
      exportW = Math.round(exportH * aspect);
      if (exportW > maxAllowedW) {
        exportW = maxAllowedW;
        exportH = Math.round(exportW / aspect);
      }
    }
    exportW = Math.max(safePrevW, exportW);
    exportH = Math.max(safePrevH, exportH);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const exportCtx2d = exportCanvas.getContext('2d');

    let fallbackDataUrl: string | null = null;
    try {
      controls.update();
      renderer.setPixelRatio(1);
      renderer.setSize(exportW, exportH, false);
      camera.aspect = exportW / exportH;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      if (exportCtx2d) {
        exportCtx2d.imageSmoothingEnabled = true;
        exportCtx2d.imageSmoothingQuality = 'high';
        exportCtx2d.drawImage(renderer.domElement, 0, 0, exportW, exportH);
      } else {
        fallbackDataUrl = renderer.domElement.toDataURL('image/png');
      }
    } finally {
      renderer.setPixelRatio(prevPixelRatio);
      renderer.setSize(safePrevW, safePrevH, false);
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    const safeName = (external3DSource?.label || quarry?.name || 'modelo-3d')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const fileName = `captura-3d-${safeName}-${exportW}x${exportH}-${new Date()
      .toISOString()
      .slice(0, 10)}.png`;

    const triggerDownload = (href: string, revokeAfter = false) => {
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (revokeAfter) {
        window.setTimeout(() => URL.revokeObjectURL(href), 1500);
      }
    };

    if (exportCtx2d && typeof exportCanvas.toBlob === 'function') {
      exportCanvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          triggerDownload(url, true);
        } else {
          triggerDownload(exportCanvas.toDataURL('image/png'));
        }
      }, 'image/png');
    } else {
      triggerDownload(fallbackDataUrl ?? exportCanvas.toDataURL('image/png'));
    }
  };

  const resetCameraView = () => {
    setActivePreset('oblique');
    const ctx = sceneRef.current;
    if (!ctx) return;
    const visSpan =
      hasExternalRef.current && ctx.externalAsset
        ? ctx.externalAsset.normalizedHeightSpan
        : computeDemVisualSpan(zMinMRef.current, zMaxMRef.current);
    const targetY = Math.min(80, visSpan * 0.32 * exaggeration);
    ctx.cameraGoal.target.set(0, targetY, 0);
    ctx.cameraGoal.pos.set(270, Math.max(215, visSpan * 1.45 * exaggeration), 285);
    ctx.cameraGoal.active = true;
    ctx.requestRender();
  };

  const focusPin = (pin: DrawnPin3D) => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const yWorld = pin.point.baseY * exaggeration;
    ctx.cameraGoal.target.set(pin.point.x, yWorld + 4, pin.point.z);
    ctx.cameraGoal.pos.set(pin.point.x + 48, yWorld + 44, pin.point.z + 52);
    ctx.cameraGoal.active = true;
    ctx.requestRender();
  };

  const focusShape = (shape: DrawnShape3D) => {
    const ctx = sceneRef.current;
    if (!ctx || shape.points.length === 0) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of shape.points) {
      cx += p.x;
      cy += p.baseY * exaggeration;
      cz += p.z;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    cx /= shape.points.length;
    cy /= shape.points.length;
    cz /= shape.points.length;
    const span = Math.max(28, Math.hypot(maxX - minX, maxZ - minZ));
    ctx.cameraGoal.target.set(cx, cy + 5, cz);
    ctx.cameraGoal.pos.set(cx + span * 1.15, cy + span * 0.95 + 16, cz + span * 1.2);
    ctx.cameraGoal.active = true;
    ctx.requestRender();
  };

  // Keyboard shortcuts ('H' dock, 'F' fullscreen, 'Esc' cancel drawing / exit fullscreen, 'Enter' close polygon, 'Backspace' undo vertex)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockOpen((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (activeDrawPointsRef.current.length > 0) {
          setActiveDrawPoints([]);
          previewDrawPointRef.current = null;
          sceneRef.current?.rebuildDrawOverlay();
          sceneRef.current?.requestRender();
        } else if (drawToolRef.current !== 'orbit') {
          setDrawTool('orbit');
          previewDrawPointRef.current = null;
        } else if (isCssFullscreenRef.current) {
          setIsCssFullscreen(false);
        }
      } else if (
        e.key === 'Enter' &&
        (drawToolRef.current === 'polygon' || drawToolRef.current === 'zone')
      ) {
        if (activeDrawPointsRef.current.length >= 3) {
          e.preventDefault();
          commitDrawnShape(
            'polygon',
            activeDrawPointsRef.current,
            drawToolRef.current === 'zone' ? 'zone' : 'stockpile'
          );
        }
      } else if (
        (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z'))) &&
        drawToolRef.current !== 'orbit' &&
        activeDrawPointsRef.current.length > 0
      ) {
        e.preventDefault();
        setActiveDrawPoints((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Build & manage Three.js scene lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(320, container.clientHeight);

    // Detect software WebGL rasterizer solely to adjust rendering cost
    const probeCanvas = document.createElement('canvas');
    const probeGl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    let rendererStr = '';
    if (probeGl) {
      const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
      rendererStr = dbg ? String(probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    }
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    scene.fog = new THREE.FogExp2('#090d16', 0.00095);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(44, width / height, 1.5, 2400);
    camera.position.set(270, 250, 285);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 42, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 45;
    controls.maxDistance = 850;
    controls.update();

    // Lighting
    const hemiLight = new THREE.HemisphereLight('#bcd6ff', '#2d241c', 0.58);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff2dc', 2.15);
    sunLight.position.set(220, 260, 180);
    if (!isSoftwareGl) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.camera.near = 20;
      sunLight.shadow.camera.far = 950;
      sunLight.shadow.camera.left = -260;
      sunLight.shadow.camera.right = 260;
      sunLight.shadow.camera.top = 260;
      sunLight.shadow.camera.bottom = -260;
      sunLight.shadow.bias = -0.0006;
    }
    scene.add(sunLight);

    // Textures (1024x1024 high-res DEM orthophoto & hypsometry)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const orthoCanvas = renderOrthophotoCanvas(terrain, 1024);
    const orthoTexture = new THREE.CanvasTexture(orthoCanvas);
    orthoTexture.colorSpace = THREE.SRGBColorSpace;
    orthoTexture.anisotropy = maxAniso;
    orthoTexture.minFilter = THREE.LinearMipmapLinearFilter;
    orthoTexture.magFilter = THREE.LinearFilter;

    const hypsoCanvas = renderHypsometryCanvas(terrain, 1024);
    const hypsoTexture = new THREE.CanvasTexture(hypsoCanvas);
    hypsoTexture.colorSpace = THREE.SRGBColorSpace;
    hypsoTexture.anisotropy = maxAniso;
    hypsoTexture.minFilter = THREE.LinearMipmapLinearFilter;
    hypsoTexture.magFilter = THREE.LinearFilter;

    // 1. Main DEM Terrain Mesh
    const gSize = terrain.gridSize;
    const terrainGeom = new THREE.PlaneGeometry(TERRAIN_SPAN_M, TERRAIN_SPAN_M, gSize - 1, gSize - 1);
    terrainGeom.rotateX(-Math.PI / 2);

    const orthoMat = new THREE.MeshStandardMaterial({
      map: orthoTexture,
      roughness: 0.88,
      metalness: 0.04,
    });
    const hypsoMat = new THREE.MeshStandardMaterial({
      map: hypsoTexture,
      roughness: 0.72,
      metalness: 0.06,
    });
    const contourBaseMat = new THREE.MeshStandardMaterial({
      map: orthoTexture,
      color: new THREE.Color('#9ca3af'),
      roughness: 0.9,
      metalness: 0.03,
    });
    const tinBaseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0f172a'),
      roughness: 0.92,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const terrainMesh = new THREE.Mesh(terrainGeom, orthoMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    terrainMesh.castShadow = !isSoftwareGl;
    scene.add(terrainMesh);

    // 2. TIN Delaunay Wireframe Mesh (96x96 high-resolution triangulated grid)
    const tinSeg = 96;
    const tinGeom = new THREE.PlaneGeometry(TERRAIN_SPAN_M, TERRAIN_SPAN_M, tinSeg, tinSeg);
    tinGeom.rotateX(-Math.PI / 2);
    const tinWireMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      wireframe: true,
      transparent: true,
      opacity: 0.82,
    });
    const tinWireMesh = new THREE.Mesh(tinGeom, tinWireMat);
    tinWireMesh.visible = false;
    scene.add(tinWireMesh);

    // 3. Dark Bedrock Skirt / Plinth around DEM perimeter
    const skirtGeom = new THREE.BufferGeometry();
    const skirtMat = new THREE.MeshStandardMaterial({
      color: '#1e2430',
      roughness: 0.92,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
    scene.add(skirtMesh);

    // 4. Photogrammetric Point Cloud (360 x 360 = 129,600 points classified by Z)
    const pcGrid = 360;
    const pcCount = pcGrid * pcGrid;
    const pcPositions = new Float32Array(pcCount * 3);
    const pcColors = new Float32Array(pcCount * 3);
    const pcRawElev = new Float32Array(pcCount);
    for (let r = 0; r < pcGrid; r++) {
      const baseZ = -TERRAIN_HALF_M + (r / (pcGrid - 1)) * TERRAIN_SPAN_M;
      for (let c = 0; c < pcGrid; c++) {
        const baseX = -TERRAIN_HALF_M + (c / (pcGrid - 1)) * TERRAIN_SPAN_M;
        const jx = (Math.sin(r * 19.3 + c * 7.1) * 0.5) * 0.85;
        const jz = (Math.cos(r * 11.7 + c * 23.9) * 0.5) * 0.85;
        const wx = Math.max(-TERRAIN_HALF_M, Math.min(TERRAIN_HALF_M, baseX + jx));
        const wz = Math.max(-TERRAIN_HALF_M, Math.min(TERRAIN_HALF_M, baseZ + jz));
        const elev = terrain.sampleElevationAt(wx, wz);
        const [cr, cg, cb] = hypsometricColorRgb(elev);

        const i = r * pcGrid + c;
        pcPositions[i * 3] = wx;
        pcPositions[i * 3 + 1] = demElevToBaseY(
          elev,
          demElevationBoundsRef.current.minM,
          demElevationBoundsRef.current.maxM
        );
        pcPositions[i * 3 + 2] = wz;
        pcColors[i * 3] = cr / 255;
        pcColors[i * 3 + 1] = cg / 255;
        pcColors[i * 3 + 2] = cb / 255;
        pcRawElev[i] = elev;
      }
    }
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute('position', new THREE.BufferAttribute(pcPositions, 3));
    pointGeom.setAttribute('color', new THREE.BufferAttribute(pcColors, 3));
    const pointSpriteTex = createPointCircleSpriteTexture();
    const pointMat = new THREE.PointsMaterial({
      size: pointSizeRef.current,
      sizeAttenuation: true,
      vertexColors: true,
      map: pointSpriteTex,
      alphaTest: 0.5,
    });
    const pointCloud = new THREE.Points(pointGeom, pointMat);
    pointCloud.visible = false;
    scene.add(pointCloud);

    // 5. 3D Contour Lines (Master 5m + Intermediate 1m)
    const contourSegs = extractContours(terrain, 1);
    const minorSegs = contourSegs.filter((s) => !s.isMaster);
    const masterSegs = contourSegs.filter((s) => s.isMaster);

    const buildContourGeom = (segs: typeof contourSegs) => {
      const arr = new Float32Array(segs.length * 6);
      const elevs = new Float32Array(segs.length);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const y0 =
          demElevToBaseY(
            s.elevationM,
            demElevationBoundsRef.current.minM,
            demElevationBoundsRef.current.maxM
          ) + 0.2;
        arr[i * 6] = s.x1;
        arr[i * 6 + 1] = y0;
        arr[i * 6 + 2] = s.z1;
        arr[i * 6 + 3] = s.x2;
        arr[i * 6 + 4] = y0;
        arr[i * 6 + 5] = s.z2;
        elevs[i] = s.elevationM;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      g.userData.elevs = elevs;
      return g;
    };

    const minorGeom = buildContourGeom(minorSegs);
    const masterGeom = buildContourGeom(masterSegs);
    const minorContourLines = new THREE.LineSegments(
      minorGeom,
      new THREE.LineBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.72 })
    );
    const masterContourLines = new THREE.LineSegments(
      masterGeom,
      new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.96 })
    );
    const contourGroup = new THREE.Group();
    contourGroup.add(minorContourLines);
    contourGroup.add(masterContourLines);
    contourGroup.visible = false;
    scene.add(contourGroup);

    // Reference metric grid beneath plinth
    const baseGrid = new THREE.GridHelper(TERRAIN_SPAN_M + 40, 20, '#1e293b', '#131c2e');
    baseGrid.position.y = -14.2;
    scene.add(baseGrid);

    // 6. Composite 3D Stockpile Markers (4 parts per pin)
    const markersGroup = new THREE.Group();
    const markerEntries: Array<{
      group: THREE.Group;
      stockpile: StockpileFootprint;
      haloMesh: THREE.Mesh;
      crystalMesh: THREE.Mesh;
    }> = [];

    const collarMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.75,
    });
    const mastMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.25,
      metalness: 0.85,
    });

    terrain.stockpiles.forEach((sp) => {
      const pinGroup = new THREE.Group();
      pinGroup.userData.stockpileId = sp.id;

      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.42, 10, 24), collarMat);
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.y = 0.42;
      baseRing.userData.stockpileId = sp.id;
      pinGroup.add(baseRing);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 11.5, 12), mastMat);
      mast.position.y = 6.1;
      mast.castShadow = !isSoftwareGl;
      mast.userData.stockpileId = sp.id;
      pinGroup.add(mast);

      const crystalMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        emissive: '#065f46',
        emissiveIntensity: 0.55,
        roughness: 0.2,
        metalness: 0.35,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(3.1, 0), crystalMat);
      crystal.position.y = 14.2;
      crystal.castShadow = !isSoftwareGl;
      crystal.userData.stockpileId = sp.id;
      pinGroup.add(crystal);

      const haloMat = new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.5,
      });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 10, 28), haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 14.2;
      halo.userData.stockpileId = sp.id;
      pinGroup.add(halo);

      pinGroup.position.set(sp.worldX, 0, sp.worldZ);
      markersGroup.add(pinGroup);
      markerEntries.push({
        group: pinGroup,
        stockpile: sp,
        haloMesh: halo,
        crystalMesh: crystal,
      });
    });
    scene.add(markersGroup);

    // 7. Transverse Profile Line + Vertical Ribbon on terrain
    const profileGroup = new THREE.Group();
    const profileLineGeom = new THREE.BufferGeometry();
    const profileLine = new THREE.Line(
      profileLineGeom,
      new THREE.LineBasicMaterial({ color: '#f43f5e' })
    );
    const profileRibbonGeom = new THREE.BufferGeometry();
    const profileRibbon = new THREE.Mesh(
      profileRibbonGeom,
      new THREE.MeshBasicMaterial({
        color: '#fb7185',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    profileGroup.add(profileRibbon);
    profileGroup.add(profileLine);
    scene.add(profileGroup);

    // 8. Host Group for Uploaded External 3D Meshes & Point Clouds
    const externalHost = new THREE.Group();
    scene.add(externalHost);

    // 9. Interactive 3D Drawings Overlay (Lines, Polygons, Pins, Translucent Shading)
    const drawOverlayGroup = new THREE.Group();
    scene.add(drawOverlayGroup);

    // 10. Horizontal Reference Elevation / Flood / Bench-Floor Plane
    const refPlaneGroup = new THREE.Group();
    const refPlaneGeom = new THREE.PlaneGeometry(TERRAIN_SPAN_M * 1.06, TERRAIN_SPAN_M * 1.06);
    refPlaneGeom.rotateX(-Math.PI / 2);
    const refPlaneMat = new THREE.MeshBasicMaterial({
      color: '#0ea5e9',
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const refPlaneMesh = new THREE.Mesh(refPlaneGeom, refPlaneMat);
    refPlaneMesh.renderOrder = 2;
    const refPlaneEdgesGeom = new THREE.EdgesGeometry(refPlaneGeom);
    const refPlaneEdges = new THREE.LineSegments(
      refPlaneEdgesGeom,
      new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85 })
    );
    refPlaneGroup.add(refPlaneMesh);
    refPlaneGroup.add(refPlaneEdges);
    refPlaneGroup.visible = false;
    scene.add(refPlaneGroup);

    // Helpers for dynamic exaggeration updates
    const updateSkirtGeometry = (ex: number) => {
      const bottomY = -14;
      const positions: number[] = [];
      const addWallStrip = (pts: Array<{ x: number; y: number; z: number }>) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, bottomY, a.z);
          positions.push(b.x, b.y, b.z, b.x, bottomY, b.z, a.x, bottomY, a.z);
        }
      };

      const north: Array<{ x: number; y: number; z: number }> = [];
      const south: Array<{ x: number; y: number; z: number }> = [];
      const west: Array<{ x: number; y: number; z: number }> = [];
      const east: Array<{ x: number; y: number; z: number }> = [];

      const demMin = demElevationBoundsRef.current.minM;
      const demMax = demElevationBoundsRef.current.maxM;

      for (let i = 0; i < gSize; i++) {
        const coord = -TERRAIN_HALF_M + (i / (gSize - 1)) * TERRAIN_SPAN_M;
        north.push({
          x: coord,
          y: demElevToBaseY(terrain.heights[i], demMin, demMax) * ex,
          z: -TERRAIN_HALF_M,
        });
        south.push({
          x: coord,
          y:
            demElevToBaseY(
              terrain.heights[(gSize - 1) * gSize + i],
              demMin,
              demMax
            ) * ex,
          z: TERRAIN_HALF_M,
        });
        west.push({
          x: -TERRAIN_HALF_M,
          y: demElevToBaseY(terrain.heights[i * gSize], demMin, demMax) * ex,
          z: coord,
        });
        east.push({
          x: TERRAIN_HALF_M,
          y:
            demElevToBaseY(
              terrain.heights[i * gSize + (gSize - 1)],
              demMin,
              demMax
            ) * ex,
          z: coord,
        });
      }

      addWallStrip(north);
      addWallStrip(south.reverse());
      addWallStrip(west.reverse());
      addWallStrip(east);

      skirtGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      skirtGeom.computeVertexNormals();
    };

    const updateProfileGeometry = (
      p0: { x: number; z: number },
      p1: { x: number; z: number },
      ex: number
    ) => {
      const steps = 100;
      const linePos = new Float32Array(steps * 3);
      const ribPos: number[] = [];
      const demMin = demElevationBoundsRef.current.minM;
      const demMax = demElevationBoundsRef.current.maxM;

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const wx = p0.x + (p1.x - p0.x) * t;
        const wz = p0.z + (p1.z - p0.z) * t;
        const elev = terrain.sampleElevationAt(wx, wz);
        const ySurf = demElevToBaseY(elev, demMin, demMax) * ex + 0.45;
        const yTop = ySurf + 14;

        linePos[i * 3] = wx;
        linePos[i * 3 + 1] = ySurf;
        linePos[i * 3 + 2] = wz;

        if (i < steps - 1) {
          const t2 = (i + 1) / (steps - 1);
          const wx2 = p0.x + (p1.x - p0.x) * t2;
          const wz2 = p0.z + (p1.z - p0.z) * t2;
          const elev2 = terrain.sampleElevationAt(wx2, wz2);
          const ySurf2 = demElevToBaseY(elev2, demMin, demMax) * ex + 0.45;
          const yTop2 = ySurf2 + 14;

          ribPos.push(wx, ySurf, wz, wx2, ySurf2, wz2, wx, yTop, wz);
          ribPos.push(wx2, ySurf2, wz2, wx2, yTop2, wz2, wx, yTop, wz);
        }
      }

      profileLineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      profileRibbonGeom.setAttribute('position', new THREE.Float32BufferAttribute(ribPos, 3));
      profileLineGeom.computeBoundingSphere();
      profileRibbonGeom.computeBoundingSphere();
    };

    const updateExaggeration = (ex: number) => {
      const zMin = demElevationBoundsRef.current.minM;
      const zMax = demElevationBoundsRef.current.maxM;

      // Main DEM
      const posAttr = terrainGeom.attributes.position as THREE.BufferAttribute;
      for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
          const idx = r * gSize + c;
          const y = demElevToBaseY(terrain.heights[idx], zMin, zMax) * ex;
          posAttr.setY(idx, y);
        }
      }
      posAttr.needsUpdate = true;
      terrainGeom.computeVertexNormals();

      // TIN mesh
      const tinPos = tinGeom.attributes.position as THREE.BufferAttribute;
      const tinCountPerSide = tinSeg + 1;
      for (let r = 0; r < tinCountPerSide; r++) {
        const wz = -TERRAIN_HALF_M + (r / tinSeg) * TERRAIN_SPAN_M;
        for (let c = 0; c < tinCountPerSide; c++) {
          const wx = -TERRAIN_HALF_M + (c / tinSeg) * TERRAIN_SPAN_M;
          const elev = terrain.sampleElevationAt(wx, wz);
          tinPos.setY(r * tinCountPerSide + c, demElevToBaseY(elev, zMin, zMax) * ex + 0.12);
        }
      }
      tinPos.needsUpdate = true;

      // Point Cloud
      const pcAttr = pointGeom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pcCount; i++) {
        pcAttr.setY(i, demElevToBaseY(pcRawElev[i], zMin, zMax) * ex + 0.25);
      }
      pcAttr.needsUpdate = true;

      // Contours
      const liftContours = (geom: THREE.BufferGeometry, offset: number) => {
        const p = geom.attributes.position as THREE.BufferAttribute;
        const elevs = geom.userData.elevs as Float32Array;
        for (let i = 0; i < elevs.length; i++) {
          const y = demElevToBaseY(elevs[i], zMin, zMax) * ex + offset;
          p.setY(i * 2, y);
          p.setY(i * 2 + 1, y);
        }
        p.needsUpdate = true;
      };
      liftContours(minorGeom, 0.22);
      liftContours(masterGeom, 0.34);

      // Skirt
      updateSkirtGeometry(ex);

      // Stockpile 3D Pins grounded on terrain
      markerEntries.forEach((entry) => {
        const yGround =
          demElevToBaseY(
            terrain.sampleElevationAt(entry.stockpile.worldX, entry.stockpile.worldZ),
            zMin,
            zMax
          ) * ex;
        entry.group.position.set(entry.stockpile.worldX, yGround, entry.stockpile.worldZ);
      });
    };

    const updateRenderVisibility = (mode: RenderMode3D) => {
      const extLoaded = Boolean(sceneRef.current?.externalAsset && hasExternalRef.current);
      terrainMesh.visible = !extLoaded && mode !== 'nube';
      skirtMesh.visible = !extLoaded && mode !== 'nube';
      contourGroup.visible = !extLoaded && mode === 'curvas';
      pointCloud.visible = !extLoaded && mode === 'nube';
      tinWireMesh.visible = !extLoaded && mode === 'tin';
      markersGroup.visible = !extLoaded && showFlightStockpilesRef.current;
      profileGroup.visible = !extLoaded && showProfileIn3DRef.current;
      externalHost.visible = extLoaded;

      if (extLoaded && sceneRef.current?.externalAsset) {
        sceneRef.current.externalAsset.setHypsometricMode(mode === 'hipsometria');
        sceneRef.current.externalAsset.setWireframeMode(mode === 'tin');
      }

      if (mode === 'ortofoto') terrainMesh.material = orthoMat;
      else if (mode === 'hipsometria') terrainMesh.material = hypsoMat;
      else if (mode === 'curvas') terrainMesh.material = contourBaseMat;
      else if (mode === 'tin') terrainMesh.material = tinBaseMat;
    };

    // Initial geometric pass
    updateExaggeration(exaggerationRef.current);
    updateRenderVisibility(renderModeRef.current);
    updateProfileGeometry(
      { x: terrain.defaultProfileA.x0, z: terrain.defaultProfileA.z0 },
      { x: terrain.defaultProfileA.x1, z: terrain.defaultProfileA.z1 },
      exaggerationRef.current
    );

    const cameraGoal: CameraGoal = {
      active: false,
      pos: new THREE.Vector3().copy(camera.position),
      target: new THREE.Vector3().copy(controls.target),
    };

    // Coalesced render loop with WebGL fence sync for software GL & smooth camera damping
    let rafId = 0;
    let renderPending = false;
    let lastTime = performance.now();

    const afterDraw = (done: () => void) => {
      const gl = renderer.getContext();
      if (isSoftwareGl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!sync) {
          requestAnimationFrame(done);
          return;
        }
        gl.flush();
        const poll = () => {
          const s = gl.clientWaitSync(sync, 0, 0);
          if (s === gl.TIMEOUT_EXPIRED) {
            setTimeout(poll, 4);
          } else {
            gl.deleteSync(sync);
            done();
          }
        };
        poll();
      } else {
        requestAnimationFrame(done);
      }
    };

    const renderNow = () => {
      renderPending = false;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      let needsMoreFrames = false;
      if (cameraGoal.active) {
        const lambda = 7.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraGoal.pos.x, lambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraGoal.pos.y, lambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraGoal.pos.z, lambda, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, cameraGoal.target.x, lambda, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, cameraGoal.target.y, lambda, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, cameraGoal.target.z, lambda, dt);

        if (
          camera.position.distanceTo(cameraGoal.pos) < 0.6 &&
          controls.target.distanceTo(cameraGoal.target) < 0.4
        ) {
          camera.position.copy(cameraGoal.pos);
          controls.target.copy(cameraGoal.target);
          cameraGoal.active = false;
        } else {
          needsMoreFrames = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (needsMoreFrames) {
        afterDraw(() => requestRender());
      }
    };

    const requestRender = () => {
      if (renderPending) return;
      renderPending = true;
      rafId = requestAnimationFrame(renderNow);
    };

    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      cameraGoal.active = false;
    });

    // Pointer click raycasting (Drawing tools, Stockpile pins & Custom profile clicks)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastHoverRayMs = 0;

    const rebuildDrawOverlay = () => {
      while (drawOverlayGroup.children.length > 0) {
        const child = drawOverlayGroup.children[0];
        drawOverlayGroup.remove(child);
        disposeObject3DTree(child);
      }

      const extMeshes: THREE.Mesh[] = [];
      const extPoints: THREE.Points[] = [];
      if (hasExternalRef.current) {
        externalHost.traverse((obj) => {
          if (!obj.visible) return;
          if (obj instanceof THREE.Mesh) extMeshes.push(obj);
          else if (obj instanceof THREE.Points) extPoints.push(obj);
        });
      }

      const built = buildDrawnShapesGroup(
        drawnShapesRef.current,
        drawnPinsRef.current,
        activeDrawPointsRef.current,
        drawToolRef.current,
        drawColorRef.current,
        drawOpacityRef.current,
        previewDrawPointRef.current,
        {
          exaggeration: exaggerationRef.current,
          hasExternal: hasExternalRef.current,
          sampleDemBaseY: (x, z) =>
            demElevToBaseY(
              terrain.sampleElevationAt(x, z),
              demElevationBoundsRef.current.minM,
              demElevationBoundsRef.current.maxM
            ),
          externalMeshes: extMeshes,
          externalPoints: extPoints,
          defaultDensityTonM3: densityTonM3Ref.current,
          selectedShapeId: selectedShapeIdRef.current,
          baseYToViewerZ: (baseY) =>
            baseYToViewerZ(
              baseY,
              hasExternalRef.current,
              externalHeightSpanRef.current,
              zMinMRef.current,
              zMaxMRef.current
            ),
        }
      );
      drawOverlayGroup.add(built);
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      const tool = drawToolRef.current;

      // Throttle hover raycasting cleanly; skip heavy point-cloud scans while purely orbiting
      const extIsPointCloud =
        hasExternalRef.current &&
        (() => {
          let hasPc = false;
          let hasMesh = false;
          externalHost.traverse((o) => {
            if (!o.visible) return;
            if (o instanceof THREE.Mesh) hasMesh = true;
            else if (o instanceof THREE.Points) hasPc = true;
          });
          return hasPc && !hasMesh;
        })();

      if (tool === 'orbit') {
        if (previewDrawPointRef.current !== null) {
          previewDrawPointRef.current = null;
          rebuildDrawOverlay();
          requestRender();
        }
        if (extIsPointCloud || now - lastHoverRayMs < 80) return;
        lastHoverRayMs = now;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const hoverHit = pickSurfacePoint3D(raycaster, pointer, camera, {
          hasExternal: hasExternalRef.current,
          terrainMesh,
          externalHost,
        });
        if (hoverHit) {
          const baseY = hoverHit.y / Math.max(0.01, exaggerationRef.current);
          setCursorCoords({
            x: hoverHit.x * metersPerUnitRef.current,
            z: hoverHit.z * metersPerUnitRef.current,
            elevM: baseYToViewerZ(
              baseY,
              hasExternalRef.current,
              externalHeightSpanRef.current,
              zMinMRef.current,
              zMaxMRef.current
            ),
          });
        } else {
          setCursorCoords(null);
        }
        return;
      }

      if (now - lastHoverRayMs < 45) return;
      lastHoverRayMs = now;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const hit = pickSurfacePoint3D(raycaster, pointer, camera, {
        hasExternal: hasExternalRef.current,
        terrainMesh,
        externalHost,
        maxPointSamples: 8000,
      });

      if (hit) {
        const baseY = hit.y / Math.max(0.01, exaggerationRef.current);
        previewDrawPointRef.current = { x: hit.x, baseY, z: hit.z };
        setCursorCoords({
          x: hit.x * metersPerUnitRef.current,
          z: hit.z * metersPerUnitRef.current,
          elevM: baseYToViewerZ(
            baseY,
            hasExternalRef.current,
            externalHeightSpanRef.current,
            zMinMRef.current,
            zMaxMRef.current
          ),
        });
      } else {
        previewDrawPointRef.current = null;
        setCursorCoords(null);
      }
      rebuildDrawOverlay();
      requestRender();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // 0. If 3D drawing/pin tool is active, capture surface point
      if (drawToolRef.current !== 'orbit') {
        const hit = pickSurfacePoint3D(raycaster, pointer, camera, {
          hasExternal: hasExternalRef.current,
          terrainMesh,
          externalHost,
          maxPointSamples: 60_000,
        });
        if (!hit) return;

        const clickedPt: DrawnPoint3D = {
          x: hit.x,
          baseY: hit.y / Math.max(0.01, exaggerationRef.current),
          z: hit.z,
        };

        if (drawToolRef.current === 'pin') {
          commitPin(clickedPt);
          return;
        }

        if (drawToolRef.current === 'annotation') {
          commitAnnotation(clickedPt);
          return;
        }

        if (drawToolRef.current === 'line') {
          const curr = activeDrawPointsRef.current;
          if (curr.length === 0) {
            setActiveDrawPoints([clickedPt]);
          } else {
            const p0 = curr[curr.length - 1];
            const dist3D = Math.hypot(
              clickedPt.x - p0.x,
              clickedPt.baseY - p0.baseY,
              clickedPt.z - p0.z
            );
            if (dist3D > 0.25) {
              commitDrawnShape('line', [p0, clickedPt]);
            }
          }
        } else if (drawToolRef.current === 'polygon' || drawToolRef.current === 'zone') {
          const polyKind = drawToolRef.current === 'zone' ? 'zone' : 'stockpile';
          const curr = activeDrawPointsRef.current;
          if (curr.length >= 3) {
            // Snap-to-close if clicking near the first vertex
            const firstWorld = new THREE.Vector3(
              curr[0].x,
              curr[0].baseY * exaggerationRef.current,
              curr[0].z
            );
            if (firstWorld.distanceTo(hit) < 5.5) {
              commitDrawnShape('polygon', curr, polyKind);
              return;
            }
          }
          // Avoid duplicate zero-distance click (e.g., from double click)
          if (curr.length > 0) {
            const prev = curr[curr.length - 1];
            const dPrev = Math.hypot(
              clickedPt.x - prev.x,
              clickedPt.baseY - prev.baseY,
              clickedPt.z - prev.z
            );
            if (dPrev < 0.25) return;
          }
          setActiveDrawPoints([...curr, clickedPt]);
        }
        return;
      }

      raycaster.setFromCamera(pointer, camera);

      // 1. Check 3D Stockpile markers first (only when flight stockpiles are visible)
      const pinHits =
        markersGroup.visible && showFlightStockpilesRef.current
          ? raycaster.intersectObjects(markersGroup.children, true)
          : [];
      if (pinHits.length > 0) {
        const spId = pinHits[0].object.userData.stockpileId as number | undefined;
        const found = terrain.stockpiles.find((s) => s.id === spId);
        if (found) {
          setSelectedStockpile(found);
          const yGround =
            demElevToBaseY(
              terrain.sampleElevationAt(found.worldX, found.worldZ),
              demElevationBoundsRef.current.minM,
              demElevationBoundsRef.current.maxM
            ) * exaggerationRef.current;
          cameraGoal.target.set(found.worldX, yGround + 4, found.worldZ);
          cameraGoal.pos.set(found.worldX + 58, yGround + 52, found.worldZ + 62);
          cameraGoal.active = true;
          requestRender();
          return;
        }
      }

      // 2. If in custom profile mode, allow clicking 2 terrain points
      if (profileModeRef.current === 'custom') {
        const terrainHits = raycaster.intersectObject(terrainMesh, false);
        if (terrainHits.length > 0) {
          const pt = terrainHits[0].point;
          setCustomPts((prev) => {
            if (prev.length >= 2) return [{ x: pt.x, z: pt.z }];
            return [...prev, { x: pt.x, z: pt.z }];
          });
        }
      }
    };

    const onDoubleClick = () => {
      if (
        (drawToolRef.current === 'polygon' || drawToolRef.current === 'zone') &&
        activeDrawPointsRef.current.length >= 3
      ) {
        commitDrawnShape(
          'polygon',
          activeDrawPointsRef.current,
          drawToolRef.current === 'zone' ? 'zone' : 'stockpile'
        );
      }
    };

    const onPointerLeave = () => {
      setCursorCoords(null);
      if (previewDrawPointRef.current !== null) {
        previewDrawPointRef.current = null;
        rebuildDrawOverlay();
        requestRender();
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);

    // ResizeObserver
    const resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = Math.max(320, Math.floor(entry.contentRect.width));
        const ch = Math.max(320, Math.floor(entry.contentRect.height));
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
        renderer.setSize(cw, ch);
        requestRender();
      }
    });
    resizeObs.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      sunLight,
      terrainMesh,
      terrainGeom,
      tinWireMesh,
      tinGeom,
      skirtMesh,
      skirtGeom,
      pointCloud,
      pointGeom,
      pointMat,
      contourGroup,
      minorContourLines,
      masterContourLines,
      orthoMat,
      hypsoMat,
      contourBaseMat,
      tinBaseMat,
      markersGroup,
      markerEntries,
      profileGroup,
      profileLine,
      profileRibbon,
      drawOverlayGroup,
      refPlaneGroup,
      externalHost,
      externalAsset: null,
      defaultOrthoTexture: orthoTexture,
      customOrthoTexture: null,
      maxAniso,
      cameraGoal,
      requestRender,
      updateExaggeration,
      updateRenderVisibility,
      updateProfileGeometry,
      rebuildDrawOverlay,
      isSoftwareGl,
    };

    rebuildDrawOverlay();
    requestRender();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      disposeObject3DTree(drawOverlayGroup);
      disposeObject3DTree(refPlaneGroup);
      if (sceneRef.current?.externalAsset) {
        sceneRef.current.externalAsset.dispose();
        sceneRef.current.externalAsset = null;
      }
      if (sceneRef.current?.customOrthoTexture) {
        sceneRef.current.customOrthoTexture.dispose();
        sceneRef.current.customOrthoTexture = null;
      }
      controls.dispose();
      envTarget.dispose();
      pmrem.dispose();
      orthoTexture.dispose();
      hypsoTexture.dispose();
      terrainGeom.dispose();
      tinGeom.dispose();
      skirtGeom.dispose();
      pointGeom.dispose();
      minorGeom.dispose();
      masterGeom.dispose();
      profileLineGeom.dispose();
      profileRibbonGeom.dispose();
      orthoMat.dispose();
      hypsoMat.dispose();
      contourBaseMat.dispose();
      tinBaseMat.dispose();
      tinWireMat.dispose();
      skirtMat.dispose();
      pointSpriteTex.dispose();
      pointMat.dispose();
      collarMat.dispose();
      mastMat.dispose();
      markerEntries.forEach((m) => {
        (m.haloMesh.material as THREE.Material).dispose();
        (m.crystalMesh.material as THREE.Material).dispose();
      });
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [terrain]);

  // Load / swap external 3D asset (.obj, .glb, .ply, .stl, .las, .xyz, .pcd, .csv)
  // Sync automatic Z min/max when viewing the parametric DEM model
  useEffect(() => {
    if (external3DSource) return;
    zMinMRef.current = demElevationBounds.minM;
    zMaxMRef.current = demElevationBounds.maxM;
    setZMinM(demElevationBounds.minM);
    setZMaxM(demElevationBounds.maxM);
    setRefPlaneElevM(
      Math.round(((demElevationBounds.minM + demElevationBounds.maxM) * 0.5) * 10) / 10
    );
  }, [demElevationBounds, external3DSource]);

  const syncAutoZFromExternalAsset = (asset: Loaded3DAssetResult) => {
    const rawHoriz = Math.max(
      asset.rawBoundsMax.x - asset.rawBoundsMin.x,
      asset.rawBoundsMax.z - asset.rawBoundsMin.z
    );
    metersPerUnitRef.current =
      rawHoriz >= 5 ? rawHoriz / (TERRAIN_SPAN_M * 0.92) : 1;

    const extSpan = Math.max(1e-4, asset.normalizedHeightSpan);
    externalHeightSpanRef.current = extSpan;
    setExternalHeightSpan(extSpan);

    const rawMinY = asset.rawBoundsMin.y;
    const rawMaxY = asset.rawBoundsMax.y;
    const hasValidBounds = Number.isFinite(rawMinY) && Number.isFinite(rawMaxY);
    const nextMin = hasValidBounds ? Math.round(rawMinY * 100) / 100 : 0;
    const rawRoundedMax = hasValidBounds
      ? Math.round(rawMaxY * 100) / 100
      : Math.round(extSpan * metersPerUnitRef.current * 100) / 100;
    const nextMax =
      rawRoundedMax > nextMin ? rawRoundedMax : Math.round((nextMin + 0.1) * 100) / 100;

    zMinMRef.current = nextMin;
    zMaxMRef.current = nextMax;
    setZMinM(nextMin);
    setZMaxM(nextMax);
    setRefPlaneElevM(Math.round(((nextMin + nextMax) * 0.5) * 10) / 10);
  };

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    let cancelled = false;
    const isNewSource = lastExternalSourceRef.current !== external3DSource;
    lastExternalSourceRef.current = external3DSource;

    const clearExistingExternal = () => {
      if (ctx.externalAsset) {
        ctx.externalHost.remove(ctx.externalAsset.group);
        ctx.externalAsset.dispose();
        ctx.externalAsset = null;
      }
    };

    if (!external3DSource) {
      clearExistingExternal();
      metersPerUnitRef.current = 1;
      zMinMRef.current = demElevationBoundsRef.current.minM;
      zMaxMRef.current = demElevationBoundsRef.current.maxM;
      setZMinM(demElevationBoundsRef.current.minM);
      setZMaxM(demElevationBoundsRef.current.maxM);
      setRefPlaneElevM(
        Math.round(
          ((demElevationBoundsRef.current.minM + demElevationBoundsRef.current.maxM) * 0.5) * 10
        ) / 10
      );
      setExternalLoading(false);
      setExternalError(null);
      setExternalInfo(null);
      ctx.updateRenderVisibility(renderModeRef.current);
      ctx.rebuildDrawOverlay();
      ctx.requestRender();
      return;
    }

    setExternalLoading(true);
    setExternalError(null);
    clearExistingExternal();

    const defaultZ = !/\.(glb|gltf)$/i.test(external3DSource.fileName);
    const targetZUp = isNewSource ? defaultZ : externalZUpRef.current;
    if (isNewSource) {
      setExternalZUp(defaultZ);
    }

    load3DAssetFromUrl(external3DSource.url, external3DSource.fileName, ctx.isSoftwareGl, {
      maxPoints: pointMaxCount,
      pointSize: pointSizeRef.current,
      maxAnisotropy: ctx.maxAniso,
    })
      .then((asset) => {
        if (cancelled || !sceneRef.current) {
          asset.dispose();
          return;
        }
        if (!isNewSource) {
          asset.setZUpOrientation(targetZUp);
        }
        asset.setPointSize(pointSizeRef.current);
        ctx.externalAsset = asset;
        asset.group.scale.y = exaggerationRef.current;
        ctx.externalHost.add(asset.group);

        syncAutoZFromExternalAsset(asset);

        setExternalInfo({
          count: asset.pointOrVertexCount,
          totalCount: asset.totalSourcePoints,
          kind: asset.kind,
        });
        setExternalLoading(false);
        ctx.updateRenderVisibility(renderModeRef.current);
        ctx.rebuildDrawOverlay();

        // Smoothly reframe oblique view only when loading a new 3D asset
        if (isNewSource) {
          ctx.cameraGoal.target.set(0, Math.min(40, asset.normalizedHeightSpan * 0.35), 0);
          ctx.cameraGoal.pos.set(240, 215, 250);
          ctx.cameraGoal.active = true;
        }
        ctx.requestRender();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setExternalLoading(false);
        setExternalInfo(null);
        setExternalError(err instanceof Error ? err.message : 'No se pudo cargar el archivo 3D.');
        ctx.updateRenderVisibility(renderModeRef.current);
        ctx.requestRender();
      });

    return () => {
      cancelled = true;
    };
  }, [external3DSource, pointMaxCount]);

  // React instantly to point thickness changes without reloading geometry
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.pointMat.size = pointSize;
    if (ctx.externalAsset) {
      ctx.externalAsset.setPointSize(pointSize);
    }
    ctx.requestRender();
  }, [pointSize]);

  // Swap custom uploaded orthophoto CanvasTexture on DEM
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    if (ctx.customOrthoTexture) {
      ctx.customOrthoTexture.dispose();
      ctx.customOrthoTexture = null;
    }

    if (customOrthoCanvas) {
      const nextTex = new THREE.CanvasTexture(customOrthoCanvas);
      nextTex.colorSpace = THREE.SRGBColorSpace;
      nextTex.anisotropy = ctx.maxAniso;
      nextTex.minFilter = THREE.LinearMipmapLinearFilter;
      nextTex.magFilter = THREE.LinearFilter;
      ctx.customOrthoTexture = nextTex;
      ctx.orthoMat.map = nextTex;
      ctx.contourBaseMat.map = nextTex;
    } else {
      ctx.orthoMat.map = ctx.defaultOrthoTexture;
      ctx.contourBaseMat.map = ctx.defaultOrthoTexture;
    }
    ctx.orthoMat.needsUpdate = true;
    ctx.contourBaseMat.needsUpdate = true;
    ctx.requestRender();
  }, [customOrthoCanvas]);

  // React to renderMode, 3D profile & flight stockpiles visibility change
  useEffect(() => {
    if (!showFlightStockpiles) {
      setSelectedStockpile(null);
    }
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.updateRenderVisibility(renderMode);
    ctx.requestRender();
  }, [renderMode, showProfileIn3D, showFlightStockpiles]);

  // React to exaggeration and Z range change
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.updateExaggeration(exaggeration);
    if (ctx.externalAsset) {
      ctx.externalAsset.group.scale.y = exaggeration;
    }
    ctx.updateProfileGeometry(activeProfileSegment.p0, activeProfileSegment.p1, exaggeration);
    ctx.rebuildDrawOverlay();
    ctx.requestRender();
  }, [exaggeration, activeProfileSegment, zMinM, zMaxM]);

  // Rebuild 3D drawing overlay whenever shapes, pins, active style, density, or selection change
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.rebuildDrawOverlay();
    ctx.requestRender();
  }, [drawnShapes, drawnPins, activeDrawPoints, drawTool, drawColor, drawOpacity, densityTonM3, selectedShapeId]);

  // Update horizontal reference elevation / flood plane
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.refPlaneGroup.visible = refPlaneEnabled;
    const clampedElev = Math.max(zMinM, Math.min(zMaxM, refPlaneElevM));
    const baseY = viewerZToBaseY(
      clampedElev,
      Boolean(external3DSource),
      externalHeightSpan,
      zMinM,
      zMaxM
    );
    ctx.refPlaneGroup.position.y = baseY * exaggeration;
    ctx.requestRender();
  }, [refPlaneEnabled, refPlaneElevM, exaggeration, zMinM, zMaxM, external3DSource, externalHeightSpan]);

  // Highlight selected 3D stockpile marker
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.markerEntries.forEach((entry) => {
      const isSelected = selectedStockpile?.id === entry.stockpile.id;
      const haloMat = entry.haloMesh.material as THREE.MeshStandardMaterial;
      const crystalMat = entry.crystalMesh.material as THREE.MeshStandardMaterial;
      haloMat.color.set(isSelected ? '#fbbf24' : '#38bdf8');
      haloMat.emissive.set(isSelected ? '#d97706' : '#0284c7');
      crystalMat.color.set(isSelected ? '#fbbf24' : '#10b981');
      crystalMat.emissive.set(isSelected ? '#b45309' : '#065f46');
      entry.group.scale.setScalar(isSelected ? 1.25 : 1.0);
    });
    ctx.requestRender();
  }, [selectedStockpile]);

  // Apply Camera Preset smoothly
  const applyCameraPreset = (preset: CameraPresetId) => {
    setActivePreset(preset);
    const ctx = sceneRef.current;
    if (!ctx) return;
    const ex = exaggeration;
    const visSpan =
      hasExternalRef.current && ctx.externalAsset
        ? ctx.externalAsset.normalizedHeightSpan
        : computeDemVisualSpan(zMinM, zMaxM);
    const targetY = Math.min(80, visSpan * 0.32 * ex);
    if (preset === 'nadir') {
      ctx.cameraGoal.pos.set(0, 440, 4);
      ctx.cameraGoal.target.set(0, targetY, 0);
    } else if (preset === 'oblique') {
      ctx.cameraGoal.pos.set(270, Math.max(215, visSpan * 1.45 * ex), 285);
      ctx.cameraGoal.target.set(0, targetY, 0);
    } else if (preset === 'north') {
      ctx.cameraGoal.pos.set(0, Math.max(96, visSpan * 0.85 * ex), -340);
      ctx.cameraGoal.target.set(0, targetY, 0);
    } else if (preset === 'east') {
      ctx.cameraGoal.pos.set(340, Math.max(96, visSpan * 0.85 * ex), 0);
      ctx.cameraGoal.target.set(0, targetY, 0);
    }
    ctx.cameraGoal.active = true;
    ctx.requestRender();
  };

  // Focus camera on stockpile from list or marker
  const focusStockpile = (sp: StockpileFootprint) => {
    setSelectedStockpile(sp);
    const ctx = sceneRef.current;
    if (!ctx) return;
    const yGround =
      demElevToBaseY(
        terrain.sampleElevationAt(sp.worldX, sp.worldZ),
        demElevationBounds.minM,
        demElevationBounds.maxM
      ) * exaggeration;
    ctx.cameraGoal.target.set(sp.worldX, yGround + 4, sp.worldZ);
    ctx.cameraGoal.pos.set(sp.worldX + 58, yGround + 52, sp.worldZ + 62);
    ctx.cameraGoal.active = true;
    ctx.requestRender();
  };

  // Observe profile chart container so the SVG spans 100% of its section width with crisp 1:1 text
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

  // Profile SVG chart paths
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

    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaD =
      pts.length > 0
        ? `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : '';

    const gridLevels = [0.1, 0.4, 0.7, 1.0].map((f) => {
      const value = zMinM + f * spanZ;
      return {
        key: f,
        value,
        label: spanZ < 15 ? value.toFixed(1) : String(Math.round(value)),
      };
    });
    const tickFractions = w >= 860 ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] : [0, 0.25, 0.5, 0.75, 1];
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
      <div
        className={
          isFullscreen
            ? 'gis-canvas-surface relative w-full flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-800 bg-[#090d16] select-none'
            : 'gis-canvas-surface relative w-full flex-1 min-h-[480px] sm:min-h-[520px] rounded-2xl overflow-hidden border border-gray-800 bg-[#090d16] select-none'
        }
      >
      {/* WebGL Canvas Host */}
      <div
        ref={containerRef}
        className={`absolute inset-0 w-full h-full ${
          drawTool !== 'orbit' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      />

      {contextLost && (
        <div className="absolute inset-0 bg-[#090d16]/95 flex items-center justify-center z-40">
          <div className="text-center space-y-2 p-6 rounded-xl border border-amber-500/40 bg-[#111827]">
            <p className="text-sm font-bold text-amber-300">Contexto WebGL pausado</p>
            <p className="text-xs text-gray-400">Restaurando el motor fotogramétrico 3D...</p>
          </div>
        </div>
      )}

      {externalLoading && (
        <div className="absolute inset-0 bg-[#090d16]/85 flex items-center justify-center z-40">
          <div className="text-center space-y-2 p-6 rounded-xl border border-cyan-500/40 bg-[#111827] max-w-sm">
            <p className="text-sm font-bold text-cyan-300">Procesando archivo 3D...</p>
            <p className="text-xs text-gray-400">
              Cargando y normalizando geometría / nube de puntos en WebGL ({external3DSource?.fileName})
            </p>
          </div>
        </div>
      )}

      {externalError && (
        <div className="absolute inset-0 bg-[#090d16]/90 flex items-center justify-center z-40 p-4">
          <div className="text-center space-y-3 p-6 rounded-xl border border-red-500/40 bg-[#111827] max-w-md">
            <p className="text-sm font-bold text-red-300">No se pudo cargar el archivo 3D</p>
            <p className="text-xs text-gray-300 leading-relaxed">{externalError}</p>
            {onClearExternal3D && (
              <button
                type="button"
                onClick={onClearExternal3D}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
              >
                Volver al MDE Paramétrico
              </button>
            )}
          </div>
        </div>
      )}

      {/* TOP-LEFT OVERLAY: Site Badge & Quick Stockpile Pins */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-[280px] pointer-events-none">
        <div className="pointer-events-auto bg-[#0b0f17]/92 border border-gray-800 rounded-xl px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2">
            <Mountain className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {external3DSource ? external3DSource.label : quarry?.name || 'Modelo Digital de Elevaciones'}
              </div>
              <div className="text-[10px] font-mono text-gray-400 truncate">
                {external3DSource && externalInfo
                  ? `${externalInfo.kind === 'pointcloud' ? 'Nube' : 'Malla'} · ${externalInfo.count.toLocaleString('es-ES')}${
                      externalInfo.totalCount && externalInfo.totalCount > externalInfo.count
                        ? ` / ${externalInfo.totalCount.toLocaleString('es-ES')}`
                        : ''
                    } pts`
                  : activeFlight
                  ? `${activeFlight.flightCode} · ${formatDateEu(activeFlight.surveyDate)}`
                  : `MDE 400×400 m · ${formatElevM(zMinM)}–${formatElevM(zMaxM)} m`}
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

          {external3DSource && externalInfo && (
            <div className="mt-2 pt-2 border-t border-gray-800/80 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const nextZUp = !externalZUp;
                    setExternalZUp(nextZUp);
                    const ctx = sceneRef.current;
                    if (ctx?.externalAsset) {
                      ctx.externalAsset.setZUpOrientation(nextZUp);
                      ctx.externalAsset.setHypsometricMode(renderMode === 'hipsometria');
                      ctx.externalAsset.setWireframeMode(renderMode === 'tin');
                      syncAutoZFromExternalAsset(ctx.externalAsset);
                      ctx.rebuildDrawOverlay();
                      ctx.requestRender();
                    }
                  }}
                  className="px-2 py-1 rounded text-[10px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 inline-flex items-center gap-1 cursor-pointer"
                  title="Alternar eje vertical entre Z-up (SIG/CAD) y Y-up"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Eje: {externalZUp ? 'Z-up' : 'Y-up'}</span>
                </button>
                {onClearExternal3D && (
                  <button
                    type="button"
                    onClick={onClearExternal3D}
                    className="px-2 py-1 rounded text-[10px] font-mono bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer"
                  >
                    Ver MDE
                  </button>
                )}
              </div>

              {externalInfo.kind === 'pointcloud' &&
                /\.(las|xyz|csv|txt|pts)$/i.test(external3DSource.fileName) && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-mono text-gray-400 mr-0.5">Resolución:</span>
                    {[
                      { value: 1_000_000, label: '1M' },
                      { value: 5_000_000, label: '5M' },
                      { value: 10_000_000, label: '10M' },
                      { value: 25_000_000, label: '25M' },
                      { value: 50_000_000, label: '50M' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setPointMaxCount(preset.value)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                          pointMaxCount === preset.value
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 font-bold'
                            : 'bg-gray-800/90 text-gray-400 hover:text-white border border-gray-700'
                        }`}
                        title={`Cargar hasta ${preset.value.toLocaleString('es-ES')} puntos`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}

          {!external3DSource && terrain.stockpiles.length > 0 && (
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
                      ? 'Ocultar los acopios del vuelo en el modelo 3D'
                      : 'Mostrar los acopios del vuelo en el modelo 3D'
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

        {/* Selected Stockpile 3D Marker Metrics Card */}
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
                  {selectedStockpile.netVolumeM3.toLocaleString('es-ES')} m³
                </div>
              </div>
              <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                <div className="text-[9px] text-gray-400 uppercase">Tonelaje Est.</div>
                <div className="font-mono font-bold text-amber-300">
                  {selectedStockpile.tonnageEst.toLocaleString('es-ES')} t
                </div>
              </div>
              <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                <div className="text-[9px] text-gray-400 uppercase">Densidad</div>
                <div className="font-mono text-gray-200">
                  {selectedStockpile.densityTonM3.toFixed(2)} t/m³
                </div>
              </div>
              <div className="bg-[#111827] border border-gray-800 rounded-lg p-1.5">
                <div className="text-[9px] text-gray-400 uppercase">Cota Cima</div>
                <div className="font-mono text-cyan-300">
                  {demElevToViewerZ(
                    selectedStockpile.peakElevationM,
                    demElevationBounds.minM,
                    demElevationBounds.maxM,
                    zMinM,
                    zMaxM
                  ).toFixed(1)}{' '}
                  m
                </div>
              </div>
            </div>
            <div className="text-[10px] font-mono text-gray-400 flex items-center justify-between pt-0.5">
              <span>E {selectedStockpile.easting.toFixed(1)}</span>
              <span>N {selectedStockpile.northing.toFixed(1)}</span>
            </div>
          </div>
        )}
        {/* Drawn 3D Stockpile Volumes, Polygons, Measurements & Georeferenced Pins List */}
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
                        quarryName: external3DSource?.label || quarry?.name || 'modelo',
                        densityTonM3,
                        elevMinM: zMinM,
                        elevMaxM: zMaxM,
                        visualHeightSpan: external3DSource
                          ? externalHeightSpan
                          : computeDemVisualSpan(zMinM, zMaxM),
                        metersPerSceneUnit: metersPerUnitRef.current,
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
                          +{Math.round(totalVolM3).toLocaleString('es-ES')} m³
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wider text-amber-300/80">
                          Tonelaje Est.
                        </div>
                        <div className="font-mono text-[11px] font-bold text-amber-300">
                          {Math.round(totalTons).toLocaleString('es-ES')} t
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-0.5">
                    {drawnShapes.map((shape) => {
                      const isZonePolygon = shape.type === 'polygon' && shape.polygonKind === 'zone';
                      const isStockpilePolygon = shape.type === 'polygon' && !isZonePolygon;
                      const shapeDensity = shape.densityTonM3 ?? densityTonM3;
                      const estTons = shape.cutVolumeM3 * shapeDensity;
                      const isEditing = selectedShapeId === shape.id && isStockpilePolygon;
                      const isEditingZone = editingZonePolygonId === shape.id && isZonePolygon;
                      const matchedPreset = STOCKPILE_MATERIAL_PRESETS.find(
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
                      const baseMinElevM = baseYToViewerZ(
                        minPolyBaseY,
                        Boolean(external3DSource),
                        externalHeightSpan,
                        zMinM,
                        zMaxM
                      );
                      const baseMaxElevM = baseYToViewerZ(
                        maxPolyBaseY,
                        Boolean(external3DSource),
                        externalHeightSpan,
                        zMinM,
                        zMaxM
                      );
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
                                  title={
                                    isZonePolygon
                                      ? 'Clic para enfocar la cámara sobre este polígono 3D'
                                      : 'Clic para enfocar la cámara sobre este acopio'
                                  }
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
                                        ? `${(shape.area2DM2 / 10000).toFixed(2)} ha`
                                        : `${Math.round(shape.area2DM2).toLocaleString('es-ES')} m²`}{' '}
                                      · Perím. {shape.length3DM.toFixed(1)} m
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
                                          {shapeDensity.toFixed(2)} t/m³
                                        </span>
                                      </span>
                                    </div>
                                    {shape.volumeSupported && (
                                      <div className="font-mono text-[10px] font-semibold text-emerald-300 truncate">
                                        Vol: +{Math.round(shape.cutVolumeM3).toLocaleString('es-ES')} m³ ·{' '}
                                        {Math.round(estTons).toLocaleString('es-ES')} t
                                      </div>
                                    )}
                                    <div className="font-mono text-[9px] text-gray-400 truncate w-[183.333px]">
                                      {shape.area2DM2 >= 10000
                                        ? `${(shape.area2DM2 / 10000).toFixed(2)} ha`
                                        : `${Math.round(shape.area2DM2).toLocaleString('es-ES')} m²`}{' '}
                                      · Z base: {baseMinElevM.toFixed(1)}–{baseMaxElevM.toFixed(1)} m
                                    </div>
                                  </div>
                                ) : (
                                  <div className="font-mono text-[9.5px] text-gray-400 truncate">
                                    3D {shape.length3DM.toFixed(1)} m · ΔZ {shape.deltaZM >= 0 ? '+' : ''}
                                    {shape.deltaZM.toFixed(1)} m ({shape.slopePct.toFixed(0)}% ·{' '}
                                    {shape.slopeDeg.toFixed(1)}°)
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
                                    title={
                                      isZonePolygon
                                        ? 'Editar nombre, anotación, color y opacidad del polígono 3D'
                                        : 'Editar etiqueta, material y color del volumen'
                                    }
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
                                        ? 'Ocultar etiqueta 3D en el modelo'
                                        : 'Mostrar etiqueta 3D en el modelo'
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
                                title={
                                  shape.visible
                                    ? isZonePolygon
                                      ? 'Ocultar polígono'
                                      : 'Ocultar volumen'
                                    : isZonePolygon
                                    ? 'Mostrar polígono'
                                    : 'Mostrar volumen'
                                }
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
                                title={isZonePolygon ? 'Eliminar polígono' : 'Eliminar volumen'}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Inline Stockpile Volume Editor (Label, Material, Density, Color, Opacity) */}
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
                                      if (val === '__custom__') return;
                                      const preset = STOCKPILE_MATERIAL_PRESETS.find(
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
                                    {STOCKPILE_MATERIAL_PRESETS.map((m) => (
                                      <option key={m.name} value={m.name}>
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
                                  <span>Mostrar etiqueta 3D</span>
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
                      const cotaZ = baseYToViewerZ(
                        pin.point.baseY,
                        Boolean(external3DSource),
                        externalHeightSpan,
                        zMinM,
                        zMaxM
                      );
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
                                className="w-3 h-3 shrink-0 mt-0.5"
                                style={{ color: pin.color }}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              {editingPinId === pin.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={pin.label}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDrawnPins((prev) =>
                                      prev.map((p) => (p.id === pin.id ? { ...p, label: val } : p))
                                    );
                                  }}
                                  onBlur={() => setEditingPinId(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Escape') setEditingPinId(null);
                                  }}
                                  className="w-full bg-[#0b0f17] border border-cyan-500/60 rounded px-1 py-0.5 text-[10px] text-white"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => focusPin(pin)}
                                  onDoubleClick={() =>
                                    isAnnotation
                                      ? setEditingAnnotationId(pin.id)
                                      : setEditingPinId(pin.id)
                                  }
                                  className="font-semibold text-gray-200 hover:text-cyan-300 truncate text-left w-full cursor-pointer"
                                  title={
                                    isAnnotation
                                      ? 'Clic: centrar cámara · Doble clic: editar anotación'
                                      : 'Clic: centrar cámara · Doble clic: renombrar pin'
                                  }
                                >
                                  {pin.label}
                                </button>
                              )}
                              {isAnnotation && pin.note && (
                                <div className="text-[9.5px] text-gray-300 truncate">
                                  {pin.note}
                                </div>
                              )}
                              <div className="font-mono text-[9.5px] text-cyan-300 truncate">
                                Z: {cotaZ.toFixed(2)} m · E {(pin.point.x * metersPerUnitRef.current).toFixed(1)} · N{' '}
                                {(pin.point.z * metersPerUnitRef.current).toFixed(1)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingZonePolygonId(null);
                                setEditingAnnotationId((prev) => (prev === pin.id ? null : pin.id));
                              }}
                              className={`p-1 rounded cursor-pointer ${
                                editingAnnotationId === pin.id
                                  ? isAnnotation
                                    ? 'text-fuchsia-300 bg-fuchsia-500/20'
                                    : 'text-amber-300 bg-amber-500/20'
                                  : isAnnotation
                                  ? 'text-gray-400 hover:text-fuchsia-300'
                                  : 'text-gray-400 hover:text-amber-300'
                              }`}
                              title={
                                isAnnotation
                                  ? 'Editar texto y color de la anotación'
                                  : 'Editar nombre y color del pin de cota'
                              }
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
                              title={
                                pin.visible
                                  ? isAnnotation
                                    ? 'Ocultar anotación'
                                    : 'Ocultar pin'
                                  : isAnnotation
                                  ? 'Mostrar anotación'
                                  : 'Mostrar pin'
                              }
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
                              title={isAnnotation ? 'Eliminar anotación' : 'Eliminar pin'}
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

      {/* TOP-RIGHT OVERLAY: Quick Engineering Actions, Hypsometry & Transverse Profile */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 max-w-[780px] pointer-events-none">
        <div className="pointer-events-auto min-w-[488px] w-max flex flex-wrap items-center justify-end gap-1.5 bg-transparent border-0 shadow-none rounded-xl px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              setDrawTool('orbit');
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              drawTool === 'orbit'
                ? 'bg-blue-500/35 text-blue-100 border border-blue-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-blue-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Navegar y rotar cámara"
          >
            <MousePointer className="w-4 h-4 shrink-0 text-blue-400" strokeWidth={2.2} />
            <span>Navegar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawTool('line');
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              drawTool === 'line'
                ? 'bg-cyan-500/35 text-cyan-100 border border-cyan-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-cyan-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Medir distancia, desnivel y pendiente (%) / ángulo (°)"
          >
            <Minus className="w-4 h-4 shrink-0 text-cyan-400" strokeWidth={2.5} />
            <span>Recta</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawTool('polygon');
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              drawTool === 'polygon'
                ? 'bg-emerald-500/35 text-emerald-100 border border-emerald-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-emerald-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Delimitar un acopio para calcular su volumen, colorearlo, asignar material y añadir etiqueta 3D"
          >
            <Boxes className="w-4 h-4 shrink-0 text-emerald-400" strokeWidth={2.2} />
            <span>Volumen Acopio</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawTool('zone');
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              drawTool === 'zone'
                ? 'bg-lime-500/35 text-lime-100 border border-lime-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-lime-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Dibujar un polígono 3D sobre el modelo, colorearlo y añadirle nombre y anotaciones visibles"
          >
            <Pentagon className="w-4 h-4 shrink-0 text-lime-400" strokeWidth={2.2} />
            <span>Polígono 3D</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawTool('pin');
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              drawTool === 'pin'
                ? 'bg-amber-500/35 text-amber-100 border border-amber-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-amber-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Colocar pin de cota Z y anotación georreferenciada"
          >
            <MapPin className="w-4 h-4 shrink-0 text-amber-400" strokeWidth={2.2} />
            <span>Pin Cota</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawTool('annotation');
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              drawTool === 'annotation'
                ? 'bg-fuchsia-500/35 text-fuchsia-100 border border-fuchsia-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-fuchsia-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Dibujar una anotación 3D con texto y color en cualquier punto del modelo"
          >
            <MessageSquarePlus className="w-4 h-4 shrink-0 text-fuchsia-400" strokeWidth={2.2} />
            <span>Anotación</span>
          </button>

          <div className="w-px h-5 bg-white/35 mx-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />

          <button
            type="button"
            onClick={() => setRefPlaneEnabled((v) => !v)}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)] ${
              refPlaneEnabled
                ? 'bg-sky-500/35 text-sky-100 border border-sky-300/80 backdrop-blur-[2px]'
                : 'text-white/95 hover:text-sky-200 hover:bg-white/15 border border-transparent'
            }`}
            title="Mostrar plano horizontal de rasante / nivel de agua"
          >
            <Waves className="w-4 h-4 shrink-0 text-sky-400" strokeWidth={2.2} />
            <span className="hidden md:inline">Plano Z</span>
          </button>

          <button
            type="button"
            onClick={resetCameraView}
            className="p-1.5 rounded-lg text-violet-400 hover:text-violet-200 hover:bg-white/15 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
            title="Restablecer encuadre 3D"
          >
            <RotateCcw className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>

          <button
            type="button"
            onClick={captureScreenshotPng}
            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-white/15 transition cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
            title="Descargar captura PNG Ultra-HD (4K) del visor 3D"
          >
            <Download className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>
        </div>

        {refPlaneEnabled && (
          <div className="pointer-events-auto bg-[#0b0f17]/94 border border-sky-500/40 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-lg">
            <Waves className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-[10px] font-semibold text-sky-200 whitespace-nowrap">
              Cota Plano:
            </span>
            <input
              type="range"
              min={zMinM}
              max={zMaxM}
              step={zMaxM - zMinM > 150 ? 1 : zMaxM - zMinM > 15 ? 0.5 : 0.1}
              value={Math.max(zMinM, Math.min(zMaxM, refPlaneElevM))}
              onChange={(e) => setRefPlaneElevM(parseFloat(e.target.value))}
              className="w-28 accent-sky-400 cursor-pointer"
            />
            <span className="font-mono text-[10px] text-sky-300 w-16 text-right">
              {Math.max(zMinM, Math.min(zMaxM, refPlaneElevM)).toFixed(1)} m
            </span>
          </div>
        )}

        {renderMode === 'hipsometria' && (
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

      {/* ERGONOMIC COLLAPSIBLE BOTTOM DOCK */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 w-[95%] max-w-[880px] pointer-events-none">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="pointer-events-auto px-3 py-1 rounded-lg bg-[#0b0f17]/95 hover:bg-gray-900 border border-gray-700 text-[11px] font-semibold text-gray-300 hover:text-white inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
          title="Atajo de teclado: H"
        >
          {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          <span>{dockOpen ? 'Ocultar Controles' : 'Mostrar Controles 3D'}</span>
        </button>

        {dockOpen && (
          <div className="pointer-events-auto w-full bg-[#0b0f17]/95 border border-gray-800 rounded-2xl p-2.5 shadow-2xl space-y-2.5">
            {/* Row 1: 5 Render Modes */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold uppercase text-gray-500 mr-1 inline-flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Modo:
                </span>
                {(
                  [
                    { id: 'ortofoto', label: 'Ortofoto RGB' },
                    { id: 'hipsometria', label: 'Hipsometría Z' },
                    { id: 'curvas', label: 'Curvas 3D' },
                    { id: 'nube', label: 'Nube de Puntos' },
                    { id: 'tin', label: 'Malla TIN' },
                  ] as Array<{ id: RenderMode3D; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setRenderMode(m.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                      renderMode === m.id
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#111827] text-gray-300 hover:text-white border border-gray-800'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Camera Presets */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold uppercase text-gray-500 mr-1 inline-flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Cámara:
                </span>
                {(
                  [
                    { id: 'nadir', label: 'Cenital' },
                    { id: 'oblique', label: 'Oblicua 45°' },
                    { id: 'north', label: 'Perfil Norte' },
                    { id: 'east', label: 'Perfil Este' },
                  ] as Array<{ id: CameraPresetId; label: string }>
                ).map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => applyCameraPreset(cam.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      activePreset === cam.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-[#111827] text-gray-400 hover:text-white border border-gray-800'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Vertical Exaggeration + Point Size + Flight Stockpiles Visibility */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-gray-800/80 text-[11px]">
              <div
                className={`grid grid-cols-1 gap-3 flex-1 min-w-[220px] ${
                  externalInfo?.kind === 'pointcloud' || renderMode === 'nube'
                    ? 'sm:grid-cols-2'
                    : 'sm:max-w-md'
                }`}
              >
                <label className="flex items-center gap-2 text-gray-300">
                  <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="whitespace-nowrap">Exageración Z:</span>
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step="0.05"
                    value={exaggeration}
                    onChange={(e) => setExaggeration(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500 cursor-pointer"
                  />
                  <span className="font-mono text-emerald-300 w-9 text-right">
                    {exaggeration.toFixed(2)}x
                  </span>
                </label>

                {(externalInfo?.kind === 'pointcloud' || renderMode === 'nube') && (
                  <label className="flex items-center gap-2 text-gray-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0" />
                    <span className="whitespace-nowrap">Grosor Punto:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="6"
                      step="0.05"
                      value={pointSize}
                      onChange={(e) => setPointSize(parseFloat(e.target.value))}
                      className="flex-1 accent-cyan-500 cursor-pointer"
                    />
                    <span className="font-mono text-cyan-300 w-10 text-right">
                      {pointSize.toFixed(2)}
                    </span>
                  </label>
                )}
              </div>

              {!external3DSource && terrain.stockpiles.length > 0 && (
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
                      ? 'Ocultar los acopios del vuelo en el modelo 3D'
                      : 'Mostrar los acopios del vuelo en el modelo 3D'
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

      {/* BOTTOM-LEFT LIVE XYZ COORDINATE READOUT */}
      {cursorCoords && (
        <div className="hidden md:flex absolute bottom-3 left-3 z-20 pointer-events-none bg-[#0b0f17]/90 border border-gray-800 rounded-lg px-2.5 py-1 text-[10px] font-mono text-gray-300 items-center gap-2 shadow">
          <span>E: {cursorCoords.x.toFixed(1)} m</span>
          <span>N: {cursorCoords.z.toFixed(1)} m</span>
          <span className="text-cyan-300 font-semibold">Z: {cursorCoords.elevM.toFixed(2)} m</span>
        </div>
      )}

      {/* BOTTOM-RIGHT OVERLAY: Fullscreen Toggle */}
      <button
        type="button"
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

      {/* TOP-CENTER ACTIVE HINT: Drawing 3D Tools or Custom Profile */}
      {drawTool !== 'orbit' ? (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-[#0b0f17]/95 border border-emerald-500/50 rounded-xl px-3 py-1.5 text-[11px] text-gray-200 font-medium flex flex-wrap items-center gap-2 shadow-lg max-w-[92%]">
          {drawTool === 'line' ? (
            <>
              <Minus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>
                {activeDrawPoints.length === 0
                  ? 'Recta 3D: haz clic en el punto inicial sobre el modelo (arrastrar = rotar)'
                  : 'Recta 3D: haz clic en el punto final para medir distancia y pendiente'}
              </span>
            </>
          ) : drawTool === 'pin' ? (
            <>
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Pin de Cota: haz clic sobre cualquier punto del modelo para marcar su cota Z y ponerle nombre</span>
            </>
          ) : drawTool === 'annotation' ? (
            <>
              <MessageSquarePlus className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
              <span>Anotación 3D: haz clic sobre cualquier punto del modelo para dibujar una anotación</span>
            </>
          ) : drawTool === 'zone' ? (
            <>
              <Pentagon className="w-3.5 h-3.5 text-lime-400 shrink-0" />
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
                style={{ backgroundColor: drawColor }}
                title={`Color activo: ${drawColor}`}
              />
              <span>
                {activeDrawPoints.length < 3
                  ? `Polígono 3D (${activeDrawPoints.length} pts): haz clic sobre el modelo para trazar vértices`
                  : `Polígono 3D (${activeDrawPoints.length} pts): doble clic, Enter o clic en el 1.º punto para cerrar y nombrar`}
              </span>
            </>
          ) : (
            <>
              <Boxes className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
                style={{ backgroundColor: drawColor }}
                title={`Color activo: ${drawColor}`}
              />
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
              title="Cerrar polígono 3D para colorearlo y añadir nombre/anotaciones (Enter)"
            >
              <Check className="w-3 h-3" />
              <span>Cerrar Polígono</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveDrawPoints([]);
              previewDrawPointRef.current = null;
              setDrawTool('orbit');
            }}
            className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] cursor-pointer"
          >
            Salir
          </button>
        </div>
      ) : (
        profileMode === 'custom' &&
        showProfileIn3D && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-[#0b0f17]/95 border border-rose-500/50 rounded-lg px-3 py-1.5 text-[11px] text-rose-300 font-medium flex items-center gap-2 shadow-lg">
            <Crosshair className="w-3.5 h-3.5" />
            <span>
              {customPts.length === 0
                ? 'Haz clic en el punto inicial sobre el relieve 3D'
                : customPts.length === 1
                ? 'Haz clic en el punto final para generar el corte'
                : 'Corte personalizado activo (clic en el relieve para trazar otro)'}
            </span>
          </div>
        )
      )}

      {/* FLOATING 3D PIN COTA & POINT ANNOTATION COMPOSER */}
      {(() => {
        if (!editingAnnotationId) return null;
        const activePin = drawnPins.find((p) => p.id === editingAnnotationId);
        if (!activePin) return null;
        const isAnnotation = activePin.kind === 'annotation';
        const pinCotaZ = baseYToViewerZ(
          activePin.point.baseY,
          Boolean(external3DSource),
          externalHeightSpan,
          zMinM,
          zMaxM
        );
        const updateActivePin = (patch: Partial<DrawnPin3D>) => {
          setDrawnPins((prev) =>
            prev.map((p) => (p.id === activePin.id ? { ...p, ...patch } : p))
          );
        };
        const swatchColors = ['#e879f9', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#facc15'];

        return (
          <div
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
                  {isAnnotation ? 'Anotación en punto 3D' : 'Pin de Cota 3D'}
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
              <span>Z: {pinCotaZ.toFixed(2)} m</span>
              <span className="text-gray-400">
                E {(activePin.point.x * metersPerUnitRef.current).toFixed(1)} · N{' '}
                {(activePin.point.z * metersPerUnitRef.current).toFixed(1)}
              </span>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-gray-400">
                {isAnnotation ? 'Título de la anotación' : 'Nombre del pin (visible en el modelo 3D)'}
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
                  placeholder="Escribe un comentario visible sobre el modelo 3D..."
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

      {/* FLOATING 3D POLYGON (ZONE) COMPOSER */}
      {(() => {
        if (!editingZonePolygonId) return null;
        const activeZone = drawnShapes.find(
          (s) => s.id === editingZonePolygonId && s.type === 'polygon' && s.polygonKind === 'zone'
        );
        if (!activeZone) return null;
        const areaText =
          activeZone.area2DM2 >= 10000
            ? `${(activeZone.area2DM2 / 10000).toFixed(2)} ha`
            : `${Math.round(activeZone.area2DM2).toLocaleString('es-ES')} m²`;

        return (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[310px] sm:w-[360px] bg-[#0b0f17]/96 border border-lime-400/55 rounded-2xl p-3 shadow-2xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Pentagon className="w-4 h-4 text-lime-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">
                  Polígono 3D sobre el modelo
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
                Perím.: {activeZone.length3DM.toFixed(1)} m · {activeZone.points.length} vért.
              </span>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-gray-400">
                Nombre del polígono (visible en el modelo 3D)
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
                Anotación / observaciones (visible en el modelo 3D)
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
                <span>Mostrar nombre y anotación sobre el modelo 3D</span>
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
                Longitud: {Math.round(profileChartData.maxD)} m · Z mín {profileChartData.minElev.toFixed(1)} m · Z máx{' '}
                {profileChartData.maxElev.toFixed(1)} m · ΔZ {profileChartData.deltaZ.toFixed(1)} m
              </div>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowProfileIn3D((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                showProfileIn3D
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/50 hover:bg-rose-500/30'
                  : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
              }`}
              title={
                showProfileIn3D
                  ? 'Ocultar la línea del perfil sobre el modelo 3D'
                  : 'Mostrar la línea del perfil sobre el modelo 3D'
              }
            >
              {showProfileIn3D ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showProfileIn3D ? 'Perfil en 3D' : 'Perfil oculto'}</span>
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
                      setShowProfileIn3D(true);
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
                    quarryName: external3DSource?.label || quarry?.name || 'Explotacion',
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
                    quarryName: external3DSource?.label || quarry?.name || 'Explotacion',
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
                  <linearGradient id="profileGrad3d" x1="0" y1="0" x2="0" y2="1">
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
                      {Math.round(tick.distM)} m
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

                <path d={profileChartData.areaD} fill="url(#profileGrad3d)" />
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
                      Dist: <strong className="text-white">{hoveredSample.distanceM.toFixed(1)} m</strong>
                    </span>
                    <span className="text-rose-300 font-bold">
                      Cota Z: {hoveredSample.elevationM.toFixed(2)} m
                    </span>
                    <span className="text-gray-400">
                      UTM E {hoveredSample.easting.toFixed(1)} · N {hoveredSample.northing.toFixed(1)}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      Longitud: <strong className="text-white">{Math.round(profileChartData.maxD)} m</strong>
                    </span>
                    <span>
                      Z mín: <strong className="text-white">{profileChartData.minElev.toFixed(1)} m</strong>
                    </span>
                    <span>
                      Z máx: <strong className="text-white">{profileChartData.maxElev.toFixed(1)} m</strong>
                    </span>
                    <span>
                      Desnivel ΔZ: <strong className="text-rose-300">{profileChartData.deltaZ.toFixed(1)} m</strong>
                    </span>
                  </div>
                )}
                <span className="text-[10px] font-sans text-gray-400">
                  Mueve el cursor sobre el perfil para inspeccionar cotas en el modelo 3D
                </span>
              </div>
          </div>
        )}
      </div>
    </div>
  );
};
