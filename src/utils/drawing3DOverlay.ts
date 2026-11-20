import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { formatEsInt, formatEsNumber } from './numberFormat.ts';
import {
  MATERIALS_UPDATED_EVENT,
  formatMaterialDisplayName,
  getMaterialDensityCatalog,
} from './materialDensities.ts';

export type DrawToolMode = 'orbit' | 'line' | 'polygon' | 'zone' | 'pin' | 'annotation';

export interface DrawnPoint3D {
  x: number;
  baseY: number;
  z: number;
}

export interface DrawnShape3D {
  id: string;
  type: 'line' | 'polygon';
  polygonKind?: 'stockpile' | 'zone';
  label: string;
  note?: string;
  material?: string;
  densityTonM3?: number;
  showLabel3D?: boolean;
  points: DrawnPoint3D[];
  color: string;
  opacity: number;
  visible: boolean;
  /** Real-world (or normalized) metrics computed in base meters/units */
  length3DM: number;
  length2DM: number;
  area2DM2: number;
  deltaZM: number;
  slopePct: number;
  slopeDeg: number;
  volumeSupported: boolean;
  cutVolumeM3: number;
  fillVolumeM3: number;
  netVolumeM3: number;
  /** Lowest and highest Z (baseY) along the delimiting polygon perimeter defining the volume base plane */
  baseMinY?: number;
  baseMaxY?: number;
  baseMinPt?: { x: number; z: number };
  baseMaxPt?: { x: number; z: number };
}

export interface DrawnPin3D {
  id: string;
  kind?: 'pin' | 'annotation';
  label: string;
  note?: string;
  point: DrawnPoint3D;
  color: string;
  visible: boolean;
}

export interface StockpileMaterialPreset {
  id?: string;
  name: string;
  category: string;
  densityTonM3: number;
  minDensity: number;
  maxDensity: number;
  note: string;
  color: string;
}

export function getStockpileMaterialPresets(): StockpileMaterialPreset[] {
  return getMaterialDensityCatalog().map((entry) => ({
    id: entry.id,
    name: formatMaterialDisplayName(entry),
    category: entry.category,
    densityTonM3: entry.defaultDensity,
    minDensity: entry.minDensity,
    maxDensity: entry.maxDensity,
    note: entry.note,
    color: entry.color,
  }));
}

export function useStockpileMaterialPresets(): StockpileMaterialPreset[] {
  const [presets, setPresets] = useState<StockpileMaterialPreset[]>(() => getStockpileMaterialPresets());

  useEffect(() => {
    const sync = () => setPresets(getStockpileMaterialPresets());
    window.addEventListener(MATERIALS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MATERIALS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return presets;
}

export const POLYGON_COLOR_PRESETS = [
  { name: 'Esmeralda', hex: '#10b981' },
  { name: 'Cian', hex: '#06b6d4' },
  { name: 'Ámbar', hex: '#f59e0b' },
  { name: 'Coral', hex: '#f43f5e' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Violeta', hex: '#8b5cf6' },
  { name: 'Lima', hex: '#84cc16' },
  { name: 'Oro', hex: '#eab308' },
] as const;

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpMatWorld = new THREE.Matrix4();
const _downRay = new THREE.Raycaster();
const _downOrigin = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);

/**
 * Picks a 3D surface point from pointer coordinates.
 * Handles DEM terrain meshes, uploaded 3D meshes, and massive 1M–50M point clouds
 * without scanning all points synchronously.
 */
export function pickSurfacePoint3D(
  raycaster: THREE.Raycaster,
  pointerNdc: THREE.Vector2,
  camera: THREE.Camera,
  options: {
    hasExternal: boolean;
    terrainMesh: THREE.Mesh;
    externalHost: THREE.Group;
    maxPointSamples?: number;
  }
): THREE.Vector3 | null {
  raycaster.setFromCamera(pointerNdc, camera);

  if (!options.hasExternal) {
    const hits = raycaster.intersectObject(options.terrainMesh, false);
    return hits.length > 0 ? hits[0].point.clone() : null;
  }

  const meshes: THREE.Mesh[] = [];
  const pointClouds: THREE.Points[] = [];
  options.externalHost.traverse((obj) => {
    if (!obj.visible) return;
    if (obj instanceof THREE.Mesh) {
      meshes.push(obj);
    } else if (obj instanceof THREE.Points) {
      pointClouds.push(obj);
    }
  });

  if (meshes.length > 0) {
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      return hits[0].point.clone();
    }
  }

  if (pointClouds.length > 0) {
    let totalPoints = 0;
    for (const pc of pointClouds) {
      const pos = pc.geometry.attributes.position;
      if (pos) totalPoints += pos.count;
    }
    if (totalPoints === 0) return null;

    const sampleBudget = Math.max(2000, options.maxPointSamples ?? 60_000);
    const step = Math.max(1, Math.floor(totalPoints / sampleBudget));
    const ray = raycaster.ray;

    let bestDistCam = Infinity;
    let bestPoint: THREE.Vector3 | null = null;
    let fallbackAngular = Infinity;
    let fallbackPoint: THREE.Vector3 | null = null;

    for (const pc of pointClouds) {
      const pos = pc.geometry.attributes.position as THREE.BufferAttribute | undefined;
      if (!pos) continue;
      _tmpMatWorld.copy(pc.matrixWorld);

      for (let i = 0; i < pos.count; i += step) {
        _tmpVecA.fromBufferAttribute(pos, i).applyMatrix4(_tmpMatWorld);
        const distCam = _tmpVecA.distanceTo(ray.origin);
        if (distCam < 0.5) continue;
        const distRay = ray.distanceToPoint(_tmpVecA);
        const angularErr = distRay / distCam;

        if (angularErr < 0.022 && distCam < bestDistCam) {
          bestDistCam = distCam;
          if (!bestPoint) bestPoint = new THREE.Vector3();
          bestPoint.copy(_tmpVecA);
        } else if (angularErr < 0.055 && angularErr < fallbackAngular) {
          fallbackAngular = angularErr;
          if (!fallbackPoint) fallbackPoint = new THREE.Vector3();
          fallbackPoint.copy(_tmpVecA);
        }
      }
    }

    return bestPoint ?? fallbackPoint;
  }

  return null;
}

export function computeShapeMetrics(
  type: 'line' | 'polygon',
  points: DrawnPoint3D[],
  metersPerSceneUnit = 1,
  verticalMetersPerUnit = metersPerSceneUnit
): {
  length3DM: number;
  length2DM: number;
  area2DM2: number;
  deltaZM: number;
  slopePct: number;
  slopeDeg: number;
} {
  if (points.length < 2) {
    return { length3DM: 0, length2DM: 0, area2DM2: 0, deltaZM: 0, slopePct: 0, slopeDeg: 0 };
  }

  let length3D = 0;
  let length2D = 0;
  const edgeCount = type === 'polygon' && points.length >= 3 ? points.length : points.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = (b.x - a.x) * metersPerSceneUnit;
    const dy = (b.baseY - a.baseY) * verticalMetersPerUnit;
    const dz = (b.z - a.z) * metersPerSceneUnit;
    length2D += Math.hypot(dx, dz);
    length3D += Math.hypot(dx, dy, dz);
  }

  let area2DM2 = 0;
  if (type === 'polygon' && points.length >= 3) {
    let doubleArea = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      doubleArea += a.x * b.z - b.x * a.z;
    }
    area2DM2 = Math.abs(doubleArea) * 0.5 * metersPerSceneUnit * metersPerSceneUnit;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.baseY < minY) minY = p.baseY;
    if (p.baseY > maxY) maxY = p.baseY;
  }
  const deltaZM =
    type === 'line'
      ? (points[points.length - 1].baseY - points[0].baseY) * verticalMetersPerUnit
      : (maxY - minY) * verticalMetersPerUnit;

  const slopePct =
    type === 'line' && length2D > 1e-4 ? (Math.abs(deltaZM) / length2D) * 100 : 0;
  const slopeDeg =
    type === 'line' && length2D > 1e-4
      ? (Math.atan2(Math.abs(deltaZM), length2D) * 180) / Math.PI
      : 0;

  return {
    length3DM: length3D,
    length2DM: length2D,
    area2DM2,
    deltaZM,
    slopePct,
    slopeDeg,
  };
}

function pointInPolygonXZ(x: number, z: number, poly: DrawnPoint3D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Evaluates the sloped reference plane defined strictly by the lowest Z point (minPt)
 * and highest Z point (maxPt) along the client's delimiting polygon perimeter.
 * Clamped to [minPt.baseY, maxPt.baseY] so it never extrapolates outside the polygon's Z bounds.
 */
function evaluateMinMaxBasePlaneY(
  x: number,
  z: number,
  minPt: { x: number; z: number; baseY: number },
  maxPt: { x: number; z: number; baseY: number }
): number {
  const dx = maxPt.x - minPt.x;
  const dz = maxPt.z - minPt.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    return (minPt.baseY + maxPt.baseY) * 0.5;
  }
  const t = Math.max(0, Math.min(1, ((x - minPt.x) * dx + (z - minPt.z) * dz) / lenSq));
  return minPt.baseY + t * (maxPt.baseY - minPt.baseY);
}

/**
 * Integrates cut/stockpile (+m3) and fill/excavation (-m3) volume inside a polygon
 * using the reference plane defined by the lowest Z (Z_min) and highest Z (Z_max)
 * along the client's delimiting polygon perimeter (vertices + sampled boundary edges).
 * Supported for DEM, external triangle meshes, and external point clouds.
 */
export function computePolygonVolumeMetrics(
  points: DrawnPoint3D[],
  options: {
    hasExternal: boolean;
    exaggeration: number;
    metersPerSceneUnit: number;
    verticalMetersPerUnit?: number;
    sampleDemBaseY?: (x: number, z: number) => number;
    externalMeshes?: THREE.Mesh[];
    externalPoints?: THREE.Points[];
  }
): {
  volumeSupported: boolean;
  cutVolumeM3: number;
  fillVolumeM3: number;
  netVolumeM3: number;
  baseMinY?: number;
  baseMaxY?: number;
  baseMinPt?: { x: number; z: number };
  baseMaxPt?: { x: number; z: number };
} {
  if (points.length < 3) {
    return { volumeSupported: false, cutVolumeM3: 0, fillVolumeM3: 0, netVolumeM3: 0 };
  }

  const canSampleDem = !options.hasExternal && Boolean(options.sampleDemBaseY);
  const canSampleExtMesh =
    options.hasExternal && Boolean(options.externalMeshes && options.externalMeshes.length > 0);
  const canSampleExtPoints =
    options.hasExternal &&
    !canSampleExtMesh &&
    Boolean(options.externalPoints && options.externalPoints.length > 0);

  if (!canSampleDem && !canSampleExtMesh && !canSampleExtPoints) {
    return { volumeSupported: false, cutVolumeM3: 0, fillVolumeM3: 0, netVolumeM3: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minPerimPt = { x: points[0].x, z: points[0].z, baseY: points[0].baseY };
  let maxPerimPt = { x: points[0].x, z: points[0].z, baseY: points[0].baseY };

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    if (p.baseY < minPerimPt.baseY) {
      minPerimPt = { x: p.x, z: p.z, baseY: p.baseY };
    }
    if (p.baseY > maxPerimPt.baseY) {
      maxPerimPt = { x: p.x, z: p.z, baseY: p.baseY };
    }
  }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX < 1e-3 || spanZ < 1e-3) {
    return { volumeSupported: false, cutVolumeM3: 0, fillVolumeM3: 0, netVolumeM3: 0 };
  }

  const vertScale = options.verticalMetersPerUnit ?? options.metersPerSceneUnit;
  const scaleVol = options.metersPerSceneUnit * options.metersPerSceneUnit * vertScale;
  const safeExag = Math.max(0.01, options.exaggeration);

  if (canSampleExtPoints && options.externalPoints) {
    const steps = 28;
    const dx = spanX / steps;
    const dz = spanZ / steps;
    const cellAreaScene = dx * dz;
    const totalCells = steps * steps;
    const sumY = new Float64Array(totalCells);
    const cnt = new Uint32Array(totalCells);

    let totalPoints = 0;
    for (const pc of options.externalPoints) {
      const pos = pc.geometry.attributes.position;
      if (pos) totalPoints += pos.count;
    }
    if (totalPoints === 0) {
      return { volumeSupported: false, cutVolumeM3: 0, fillVolumeM3: 0, netVolumeM3: 0 };
    }

    const stride = Math.max(1, Math.floor(totalPoints / 450_000));
    for (const pc of options.externalPoints) {
      const pos = pc.geometry.attributes.position as THREE.BufferAttribute | undefined;
      if (!pos) continue;
      pc.updateWorldMatrix(true, false);
      _tmpMatWorld.copy(pc.matrixWorld);

      for (let i = 0; i < pos.count; i += stride) {
        _tmpVecA.fromBufferAttribute(pos, i).applyMatrix4(_tmpMatWorld);
        if (_tmpVecA.x < minX || _tmpVecA.x > maxX || _tmpVecA.z < minZ || _tmpVecA.z > maxZ) {
          continue;
        }
        const ix = Math.min(steps - 1, Math.max(0, Math.floor((_tmpVecA.x - minX) / dx)));
        const iz = Math.min(steps - 1, Math.max(0, Math.floor((_tmpVecA.z - minZ) / dz)));
        const cIdx = iz * steps + ix;
        sumY[cIdx] += _tmpVecA.y / safeExag;
        cnt[cIdx] += 1;
      }
    }

    const sampleCellBaseY = (ix: number, iz: number): number | null => {
      const cIdx = iz * steps + ix;
      if (cnt[cIdx] > 0) return sumY[cIdx] / cnt[cIdx];
      let nSum = 0;
      let nCnt = 0;
      for (let ox = -1; ox <= 1; ox++) {
        const nx = ix + ox;
        if (nx < 0 || nx >= steps) continue;
        for (let oz = -1; oz <= 1; oz++) {
          const nz = iz + oz;
          if (nz < 0 || nz >= steps) continue;
          const nIdx = nz * steps + nx;
          if (cnt[nIdx] > 0) {
            nSum += sumY[nIdx] / cnt[nIdx];
            nCnt += 1;
          }
        }
      }
      return nCnt > 0 ? nSum / nCnt : null;
    };

    // Sample all perimeter edges on the point-cloud elevation grid to find lowest and highest perimeter Z
    const minCellStep = Math.max(1e-3, Math.min(dx, dz));
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const edgeLen = Math.hypot(b.x - a.x, b.z - a.z);
      const edgeSamples = Math.max(4, Math.min(48, Math.ceil(edgeLen / minCellStep)));
      for (let s = 1; s < edgeSamples; s++) {
        const t = s / edgeSamples;
        const px = a.x + (b.x - a.x) * t;
        const pz = a.z + (b.z - a.z) * t;
        const ix = Math.min(steps - 1, Math.max(0, Math.floor((px - minX) / dx)));
        const iz = Math.min(steps - 1, Math.max(0, Math.floor((pz - minZ) / dz)));
        const edgeY = sampleCellBaseY(ix, iz);
        if (edgeY !== null) {
          if (edgeY < minPerimPt.baseY) minPerimPt = { x: px, z: pz, baseY: edgeY };
          if (edgeY > maxPerimPt.baseY) maxPerimPt = { x: px, z: pz, baseY: edgeY };
        }
      }
    }

    let posVolScene = 0;
    let negVolScene = 0;
    let sampledInsideCells = 0;

    for (let ix = 0; ix < steps; ix++) {
      const x = minX + (ix + 0.5) * dx;
      for (let iz = 0; iz < steps; iz++) {
        const z = minZ + (iz + 0.5) * dz;
        if (!pointInPolygonXZ(x, z, points)) continue;

        const surfBaseY = sampleCellBaseY(ix, iz);
        if (surfBaseY === null) continue;
        sampledInsideCells += 1;
        const refBaseY = evaluateMinMaxBasePlaneY(x, z, minPerimPt, maxPerimPt);
        const dh = surfBaseY - refBaseY;
        if (dh >= 0) {
          posVolScene += dh * cellAreaScene;
        } else {
          negVolScene += -dh * cellAreaScene;
        }
      }
    }

    if (sampledInsideCells === 0) {
      return { volumeSupported: false, cutVolumeM3: 0, fillVolumeM3: 0, netVolumeM3: 0 };
    }
    const cutVolumeM3 = posVolScene * scaleVol;
    const fillVolumeM3 = negVolScene * scaleVol;
    return {
      volumeSupported: true,
      cutVolumeM3,
      fillVolumeM3,
      netVolumeM3: cutVolumeM3 - fillVolumeM3,
      baseMinY: minPerimPt.baseY,
      baseMaxY: maxPerimPt.baseY,
      baseMinPt: { x: minPerimPt.x, z: minPerimPt.z },
      baseMaxPt: { x: maxPerimPt.x, z: maxPerimPt.z },
    };
  }

  const rayTopY = maxPerimPt.baseY * options.exaggeration + 300;

  // Sample densely along every perimeter edge to find exact lowest (Z_min) and highest (Z_max) points
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const edgeLen = Math.hypot(b.x - a.x, b.z - a.z);
    const edgeSamples = canSampleDem
      ? Math.max(4, Math.min(64, Math.ceil(edgeLen / 1.5)))
      : Math.max(3, Math.min(24, Math.ceil(edgeLen / 3)));

    for (let s = 1; s < edgeSamples; s++) {
      const t = s / edgeSamples;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      let edgeBaseY: number | null = null;
      if (canSampleDem && options.sampleDemBaseY) {
        edgeBaseY = options.sampleDemBaseY(px, pz);
      } else if (canSampleExtMesh && options.externalMeshes) {
        _downOrigin.set(px, rayTopY, pz);
        _downRay.set(_downOrigin, _downDir);
        const hits = _downRay.intersectObjects(options.externalMeshes, false);
        if (hits.length > 0) {
          edgeBaseY = hits[0].point.y / safeExag;
        }
      }
      if (edgeBaseY !== null) {
        if (edgeBaseY < minPerimPt.baseY) minPerimPt = { x: px, z: pz, baseY: edgeBaseY };
        if (edgeBaseY > maxPerimPt.baseY) maxPerimPt = { x: px, z: pz, baseY: edgeBaseY };
      }
    }
  }

  const steps = canSampleDem ? 44 : 22;
  const dx = spanX / steps;
  const dz = spanZ / steps;
  const cellAreaScene = dx * dz;

  let posVolScene = 0;
  let negVolScene = 0;

  for (let ix = 0; ix < steps; ix++) {
    const x = minX + (ix + 0.5) * dx;
    for (let iz = 0; iz < steps; iz++) {
      const z = minZ + (iz + 0.5) * dz;
      if (!pointInPolygonXZ(x, z, points)) continue;

      let surfBaseY: number | null = null;
      if (canSampleDem && options.sampleDemBaseY) {
        surfBaseY = options.sampleDemBaseY(x, z);
      } else if (canSampleExtMesh && options.externalMeshes) {
        _downOrigin.set(x, rayTopY, z);
        _downRay.set(_downOrigin, _downDir);
        const hits = _downRay.intersectObjects(options.externalMeshes, false);
        if (hits.length > 0) {
          surfBaseY = hits[0].point.y / safeExag;
        }
      }

      if (surfBaseY === null) continue;
      const refBaseY = evaluateMinMaxBasePlaneY(x, z, minPerimPt, maxPerimPt);
      const dh = surfBaseY - refBaseY;
      if (dh >= 0) {
        posVolScene += dh * cellAreaScene;
      } else {
        negVolScene += -dh * cellAreaScene;
      }
    }
  }

  const cutVolumeM3 = posVolScene * scaleVol;
  const fillVolumeM3 = negVolScene * scaleVol;
  return {
    volumeSupported: true,
    cutVolumeM3,
    fillVolumeM3,
    netVolumeM3: cutVolumeM3 - fillVolumeM3,
    baseMinY: minPerimPt.baseY,
    baseMaxY: maxPerimPt.baseY,
    baseMinPt: { x: minPerimPt.x, z: minPerimPt.z },
    baseMaxPt: { x: maxPerimPt.x, z: maxPerimPt.z },
  };
}

function createCylinderSegmentMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material
): THREE.Mesh | null {
  const dir = _tmpVecB.subVectors(end, start);
  const len = dir.length();
  if (len < 1e-4) return null;
  const geom = new THREE.CylinderGeometry(radius, radius, len, 8, 1);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(start).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.renderOrder = 6;
  return mesh;
}

function buildPolyLineObjects(
  pts: THREE.Vector3[],
  closed: boolean,
  color: string,
  tubeRadius: number,
  opacity = 1
): THREE.Group {
  const grp = new THREE.Group();
  if (pts.length < 2) return grp;

  const loopPts = closed ? [...pts, pts[0]] : pts;
  const lineGeom = new THREE.BufferGeometry().setFromPoints(loopPts);
  const lineMat = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthTest: true,
  });
  const line = new THREE.Line(lineGeom, lineMat);
  line.renderOrder = 7;
  grp.add(line);

  const tubeMat = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
  });
  for (let i = 0; i < loopPts.length - 1; i++) {
    const segMesh = createCylinderSegmentMesh(loopPts[i], loopPts[i + 1], tubeRadius, tubeMat);
    if (segMesh) grp.add(segMesh);
  }
  return grp;
}

function computeNewellNormal(pts: THREE.Vector3[]): THREE.Vector3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const n = new THREE.Vector3(nx, ny, nz);
  if (n.lengthSq() < 1e-6) return new THREE.Vector3(0, 1, 0);
  return n.normalize();
}

function subdivideTrianglePositions(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  depth: number,
  sampleY: ((x: number, z: number, fallbackY: number) => number) | null,
  out: number[]
) {
  if (depth <= 0) {
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    return;
  }
  const ab = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const bc = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5);
  const ca = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5);
  if (sampleY) {
    ab.y = sampleY(ab.x, ab.z, ab.y);
    bc.y = sampleY(bc.x, bc.z, bc.y);
    ca.y = sampleY(ca.x, ca.z, ca.y);
  }
  subdivideTrianglePositions(a, ab, ca, depth - 1, sampleY, out);
  subdivideTrianglePositions(ab, b, bc, depth - 1, sampleY, out);
  subdivideTrianglePositions(ca, bc, c, depth - 1, sampleY, out);
  subdivideTrianglePositions(ab, bc, ca, depth - 1, sampleY, out);
}

export interface OverlayRebuildContext {
  exaggeration: number;
  hasExternal: boolean;
  sampleDemBaseY?: (x: number, z: number) => number;
  externalMeshes?: THREE.Mesh[];
  externalPoints?: THREE.Points[];
  defaultDensityTonM3?: number;
  selectedShapeId?: string | null;
  baseYToViewerZ?: (baseY: number) => number;
}

function buildPolygonFillMesh(
  worldPts: THREE.Vector3[],
  color: string,
  opacity: number,
  ctx: OverlayRebuildContext
): THREE.Mesh | null {
  if (worldPts.length < 3) return null;

  const normal = computeNewellNormal(worldPts);
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  // Project onto dominant 2D plane so triangulateShape works on terrain or steep faces
  const contour2D = worldPts.map((p) => {
    if (absY >= absX && absY >= absZ) return new THREE.Vector2(p.x, p.z);
    if (absX >= absZ) return new THREE.Vector2(p.y, p.z);
    return new THREE.Vector2(p.x, p.y);
  });

  let tris = THREE.ShapeUtils.triangulateShape(contour2D, []);
  if (tris.length === 0) {
    // Fallback fan triangulation
    tris = [];
    for (let i = 1; i < worldPts.length - 1; i++) {
      tris.push([0, i, i + 1]);
    }
  }

  let sampleY: ((x: number, z: number, fallbackY: number) => number) | null = null;
  const surfaceLift = 0.38;

  if (!ctx.hasExternal && ctx.sampleDemBaseY && absY >= 0.35) {
    const fn = ctx.sampleDemBaseY;
    sampleY = (x, z) => fn(x, z) * ctx.exaggeration + surfaceLift;
  } else if (
    ctx.hasExternal &&
    ctx.externalMeshes &&
    ctx.externalMeshes.length > 0 &&
    absY >= 0.45 &&
    tris.length <= 16
  ) {
    const meshes = ctx.externalMeshes;
    let maxMeshY = -Infinity;
    for (const p of worldPts) {
      if (p.y > maxMeshY) maxMeshY = p.y;
    }
    const cache = new Map<string, number>();
    sampleY = (x, z, fallbackY) => {
      const key = `${Math.round(x * 10)}_${Math.round(z * 10)}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      if (cache.size >= 64) return fallbackY;
      _downOrigin.set(x, maxMeshY + 120, z);
      _downRay.set(_downOrigin, _downDir);
      const hits = _downRay.intersectObjects(meshes, false);
      const res = hits.length > 0 ? hits[0].point.y + surfaceLift : fallbackY;
      cache.set(key, res);
      return res;
    };
  }

  // Subdivide triangles on mostly-horizontal terrain so colored stockpile drapes smoothly over relief
  const subDepth = sampleY ? (!ctx.hasExternal ? (tris.length <= 8 ? 3 : 2) : tris.length <= 6 ? 2 : 1) : 0;
  const positions: number[] = [];

  for (const [ia, ib, ic] of tris) {
    const va = worldPts[ia].clone();
    const vb = worldPts[ib].clone();
    const vc = worldPts[ic].clone();
    if (sampleY) {
      va.y = sampleY(va.x, va.z, va.y);
      vb.y = sampleY(vb.x, vb.z, vb.y);
      vc.y = sampleY(vc.x, vc.z, vc.y);
    } else {
      // Slight offset along polygon normal to avoid Z-fighting
      va.addScaledVector(normal, surfaceLift);
      vb.addScaledVector(normal, surfaceLift);
      vc.addScaledVector(normal, surfaceLift);
    }
    subdivideTrianglePositions(va, vb, vc, subDepth, sampleY, positions);
  }

  const fillGeom = new THREE.BufferGeometry();
  fillGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  fillGeom.computeVertexNormals();

  const fillMat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.28,
    roughness: 0.58,
    metalness: 0.05,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.Mesh(fillGeom, fillMat);
  mesh.renderOrder = 4;
  return mesh;
}

function truncateText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1))}…`;
}

function wrapTextLines(rawText: string, maxCharsPerLine: number, maxLines: number): string[] {
  const clean = rawText.trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxCharsPerLine) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      if (lines.length === maxLines - 1) {
        const rest = [w, ...words.slice(i + 1)].join(' ');
        lines.push(truncateText(rest, maxCharsPerLine));
        cur = '';
        break;
      }
      cur = w;
    }
  }
  if (cur && lines.length < maxLines) {
    lines.push(truncateText(cur, maxCharsPerLine));
  }
  return lines;
}

function drawRoundedRectPath(
  ctx2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx2d.beginPath();
  ctx2d.moveTo(x + rad, y);
  ctx2d.lineTo(x + w - rad, y);
  ctx2d.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx2d.lineTo(x + w, y + h - rad);
  ctx2d.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx2d.lineTo(x + rad, y + h);
  ctx2d.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx2d.lineTo(x, y + rad);
  ctx2d.quadraticCurveTo(x, y, x + rad, y);
  ctx2d.closePath();
}

function createVolumeLabelGroup(
  shape: DrawnShape3D,
  worldPts: THREE.Vector3[],
  ctx: OverlayRebuildContext
): THREE.Group | null {
  if (typeof document === 'undefined' || worldPts.length < 3) return null;

  let cx = 0;
  let cz = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let peakWorldY = -Infinity;

  for (const wp of worldPts) {
    cx += wp.x;
    cz += wp.z;
    if (wp.x < minX) minX = wp.x;
    if (wp.x > maxX) maxX = wp.x;
    if (wp.z < minZ) minZ = wp.z;
    if (wp.z > maxZ) maxZ = wp.z;
    if (wp.y > peakWorldY) peakWorldY = wp.y;
  }
  cx /= worldPts.length;
  cz /= worldPts.length;

  // Sample interior crest height so label floats cleanly above the stockpile summit
  if (!ctx.hasExternal && ctx.sampleDemBaseY) {
    const samplePts: Array<[number, number]> = [[cx, cz]];
    for (const wp of worldPts) {
      samplePts.push([(cx + wp.x) * 0.5, (cz + wp.z) * 0.5]);
    }
    for (const [sx, sz] of samplePts) {
      const sy = ctx.sampleDemBaseY(sx, sz) * ctx.exaggeration;
      if (sy > peakWorldY) peakWorldY = sy;
    }
  } else if (ctx.hasExternal && ctx.externalMeshes && ctx.externalMeshes.length > 0) {
    _downOrigin.set(cx, peakWorldY + 140, cz);
    _downRay.set(_downOrigin, _downDir);
    const hits = _downRay.intersectObjects(ctx.externalMeshes, false);
    if (hits.length > 0 && hits[0].point.y > peakWorldY) {
      peakWorldY = hits[0].point.y;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 860;
  canvas.height = 316;
  const c2d = canvas.getContext('2d');
  if (!c2d) return null;

  const isSelected = ctx.selectedShapeId === shape.id;
  const density = shape.densityTonM3 ?? ctx.defaultDensityTonM3 ?? 1.65;
  const tons = shape.cutVolumeM3 * density;

  const cardX = 12;
  const cardY = 10;
  const cardW = canvas.width - 24;
  const pointerH = 22;
  const cardH = canvas.height - cardY - pointerH - 8;

  c2d.clearRect(0, 0, canvas.width, canvas.height);

  // Background card
  drawRoundedRectPath(c2d, cardX, cardY, cardW, cardH, 28);
  c2d.fillStyle = isSelected ? 'rgba(12, 20, 34, 0.97)' : 'rgba(9, 14, 24, 0.94)';
  c2d.fill();
  c2d.lineWidth = isSelected ? 7 : 5;
  c2d.strokeStyle = shape.color;
  c2d.stroke();

  // Bottom pointer triangle
  const midX = canvas.width / 2;
  c2d.beginPath();
  c2d.moveTo(midX - 20, cardY + cardH - 2);
  c2d.lineTo(midX + 20, cardY + cardH - 2);
  c2d.lineTo(midX, cardY + cardH + pointerH);
  c2d.closePath();
  c2d.fillStyle = shape.color;
  c2d.fill();

  // Left color accent bar
  drawRoundedRectPath(c2d, cardX + 20, cardY + 24, 16, cardH - 48, 8);
  c2d.fillStyle = shape.color;
  c2d.fill();

  const textX = cardX + 58;
  const maxTextW = cardW - 82;

  // Row 1: Volume label title
  c2d.textBaseline = 'middle';
  c2d.fillStyle = '#ffffff';
  c2d.font = '700 50px "Inter", system-ui, -apple-system, sans-serif';
  c2d.fillText(truncateText(shape.label || 'Acopio', 24), textX, cardY + 66, maxTextW);

  // Row 2: Assigned material + density
  const matLabel = shape.material?.trim()
    ? `${truncateText(shape.material, 24)} · ${formatEsNumber(density, 2)} t/m³`
    : `Sin material · ${formatEsNumber(density, 2)} t/m³`;
  c2d.fillStyle = '#e2e8f0';
  c2d.font = '600 34px "Inter", system-ui, -apple-system, sans-serif';
  c2d.fillText(matLabel, textX, cardY + 142, maxTextW);

  // Row 3: Calculated volume + tonnage (or area fallback)
  const metricText = shape.volumeSupported
    ? `+${formatEsInt(shape.cutVolumeM3)} m³  ·  ${formatEsInt(tons)} t`
    : `${formatEsInt(shape.area2DM2)} m² · Perím. ${formatEsNumber(shape.length3DM, 1)} m`;
  c2d.fillStyle = '#34d399';
  c2d.font = '700 40px "JetBrains Mono", ui-monospace, monospace';
  c2d.fillText(metricText, textX, cardY + 218, maxTextW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const grp = new THREE.Group();
  const stemHeight = 14;
  const baseY = peakWorldY + 0.6;
  const topY = baseY + stemHeight;

  // Vertical leader line from stockpile summit to billboard
  const stemGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cx, baseY, cz),
    new THREE.Vector3(cx, topY, cz),
  ]);
  const stemMat = new THREE.LineBasicMaterial({
    color: shape.color,
    transparent: true,
    opacity: 0.94,
    toneMapped: false,
  });
  const stem = new THREE.Line(stemGeom, stemMat);
  stem.renderOrder = 11;
  grp.add(stem);

  // Base summit anchor dot
  const dotGeom = new THREE.SphereGeometry(1.15, 10, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: shape.color, toneMapped: false });
  const dot = new THREE.Mesh(dotGeom, dotMat);
  dot.position.set(cx, baseY, cz);
  dot.renderOrder = 11;
  grp.add(dot);

  // Floating billboard sprite
  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  const footprintSpan = Math.hypot(maxX - minX, maxZ - minZ);
  const spriteWidth = Math.max(60, Math.min(96, 56 + footprintSpan * 0.24));
  const spriteHeight = spriteWidth * (canvas.height / canvas.width);
  sprite.scale.set(spriteWidth, spriteHeight, 1);
  sprite.center.set(0.5, 0);
  sprite.position.set(cx, topY + 0.4, cz);
  sprite.renderOrder = 14;
  grp.add(sprite);

  return grp;
}

function createZonePolygonLabelGroup(
  shape: DrawnShape3D,
  worldPts: THREE.Vector3[],
  ctx: OverlayRebuildContext
): THREE.Group | null {
  if (typeof document === 'undefined' || worldPts.length < 3) return null;

  let cx = 0;
  let cz = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let peakWorldY = -Infinity;

  for (const wp of worldPts) {
    cx += wp.x;
    cz += wp.z;
    if (wp.x < minX) minX = wp.x;
    if (wp.x > maxX) maxX = wp.x;
    if (wp.z < minZ) minZ = wp.z;
    if (wp.z > maxZ) maxZ = wp.z;
    if (wp.y > peakWorldY) peakWorldY = wp.y;
  }
  cx /= worldPts.length;
  cz /= worldPts.length;

  if (!ctx.hasExternal && ctx.sampleDemBaseY) {
    const samplePts: Array<[number, number]> = [[cx, cz]];
    for (const wp of worldPts) {
      samplePts.push([(cx + wp.x) * 0.5, (cz + wp.z) * 0.5]);
    }
    for (const [sx, sz] of samplePts) {
      const sy = ctx.sampleDemBaseY(sx, sz) * ctx.exaggeration;
      if (sy > peakWorldY) peakWorldY = sy;
    }
  } else if (ctx.hasExternal && ctx.externalMeshes && ctx.externalMeshes.length > 0) {
    _downOrigin.set(cx, peakWorldY + 140, cz);
    _downRay.set(_downOrigin, _downDir);
    const hits = _downRay.intersectObjects(ctx.externalMeshes, false);
    if (hits.length > 0 && hits[0].point.y > peakWorldY) {
      peakWorldY = hits[0].point.y;
    }
  }

  const noteLines = wrapTextLines(shape.note || '', 30, 2);
  const canvas = document.createElement('canvas');
  canvas.width = 880;
  canvas.height = noteLines.length === 0 ? 236 : noteLines.length === 1 ? 302 : 358;
  const c2d = canvas.getContext('2d');
  if (!c2d) return null;

  const isSelected = ctx.selectedShapeId === shape.id;
  const cardX = 12;
  const cardY = 10;
  const cardW = canvas.width - 24;
  const pointerH = 22;
  const cardH = canvas.height - cardY - pointerH - 8;

  c2d.clearRect(0, 0, canvas.width, canvas.height);

  // Card body
  drawRoundedRectPath(c2d, cardX, cardY, cardW, cardH, 28);
  c2d.fillStyle = isSelected ? 'rgba(12, 20, 34, 0.97)' : 'rgba(9, 14, 24, 0.94)';
  c2d.fill();
  c2d.lineWidth = isSelected ? 7 : 5;
  c2d.strokeStyle = shape.color;
  c2d.stroke();

  // Bottom pointer triangle
  const midX = canvas.width / 2;
  c2d.beginPath();
  c2d.moveTo(midX - 20, cardY + cardH - 2);
  c2d.lineTo(midX + 20, cardY + cardH - 2);
  c2d.lineTo(midX, cardY + cardH + pointerH);
  c2d.closePath();
  c2d.fillStyle = shape.color;
  c2d.fill();

  // Left color accent bar
  drawRoundedRectPath(c2d, cardX + 20, cardY + 22, 16, cardH - 44, 8);
  c2d.fillStyle = shape.color;
  c2d.fill();

  const textX = cardX + 58;
  const maxTextW = cardW - 82;

  // Row 1: Polygon name
  c2d.textBaseline = 'middle';
  c2d.fillStyle = '#ffffff';
  c2d.font = '700 50px "Inter", system-ui, -apple-system, sans-serif';
  c2d.fillText(truncateText(shape.label || 'Polígono 3D', 26), textX, cardY + 62, maxTextW);

  // Optional note lines
  if (noteLines.length > 0) {
    c2d.fillStyle = '#f1f5f9';
    c2d.font = '600 36px "Inter", system-ui, -apple-system, sans-serif';
    noteLines.forEach((line, idx) => {
      c2d.fillText(line, textX, cardY + 128 + idx * 50, maxTextW);
    });
  }

  // Bottom metrics line (Area & Perimeter)
  const areaLabel =
    shape.area2DM2 >= 10000
      ? `${formatEsNumber(shape.area2DM2 / 10000, 2)} ha`
      : `${formatEsInt(shape.area2DM2)} m²`;
  const metricText = `Área ${areaLabel}  ·  Perím. ${formatEsNumber(shape.length3DM, 1)} m`;
  c2d.fillStyle = '#67e8f9';
  c2d.font = '700 34px "JetBrains Mono", ui-monospace, monospace';
  c2d.fillText(metricText, textX, cardY + cardH - 46, maxTextW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const grp = new THREE.Group();
  const stemHeight = 14;
  const baseY = peakWorldY + 0.6;
  const topY = baseY + stemHeight;

  const stemGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cx, baseY, cz),
    new THREE.Vector3(cx, topY, cz),
  ]);
  const stemMat = new THREE.LineBasicMaterial({
    color: shape.color,
    transparent: true,
    opacity: 0.94,
    toneMapped: false,
  });
  const stem = new THREE.Line(stemGeom, stemMat);
  stem.renderOrder = 11;
  grp.add(stem);

  const dotGeom = new THREE.SphereGeometry(1.15, 10, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: shape.color, toneMapped: false });
  const dot = new THREE.Mesh(dotGeom, dotMat);
  dot.position.set(cx, baseY, cz);
  dot.renderOrder = 11;
  grp.add(dot);

  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  const footprintSpan = Math.hypot(maxX - minX, maxZ - minZ);
  const spriteWidth = Math.max(60, Math.min(96, 56 + footprintSpan * 0.24));
  const spriteHeight = spriteWidth * (canvas.height / canvas.width);
  sprite.scale.set(spriteWidth, spriteHeight, 1);
  sprite.center.set(0.5, 0);
  sprite.position.set(cx, topY + 0.4, cz);
  sprite.renderOrder = 14;
  grp.add(sprite);

  return grp;
}

function createLineLabelGroup(
  shape: DrawnShape3D,
  worldPts: THREE.Vector3[]
): THREE.Group | null {
  if (typeof document === 'undefined' || worldPts.length < 2) return null;

  const a = worldPts[0];
  const b = worldPts[worldPts.length - 1];
  const mx = (a.x + b.x) * 0.5;
  const my = Math.max(a.y, b.y, (a.y + b.y) * 0.5);
  const mz = (a.z + b.z) * 0.5;

  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 232;
  const c2d = canvas.getContext('2d');
  if (!c2d) return null;

  const cardX = 12;
  const cardY = 10;
  const cardW = canvas.width - 24;
  const pointerH = 20;
  const cardH = canvas.height - cardY - pointerH - 8;

  c2d.clearRect(0, 0, canvas.width, canvas.height);

  drawRoundedRectPath(c2d, cardX, cardY, cardW, cardH, 26);
  c2d.fillStyle = 'rgba(9, 14, 24, 0.94)';
  c2d.fill();
  c2d.lineWidth = 5;
  c2d.strokeStyle = shape.color;
  c2d.stroke();

  const midX = canvas.width / 2;
  c2d.beginPath();
  c2d.moveTo(midX - 18, cardY + cardH - 2);
  c2d.lineTo(midX + 18, cardY + cardH - 2);
  c2d.lineTo(midX, cardY + cardH + pointerH);
  c2d.closePath();
  c2d.fillStyle = shape.color;
  c2d.fill();

  drawRoundedRectPath(c2d, cardX + 18, cardY + 22, 15, cardH - 44, 7);
  c2d.fillStyle = shape.color;
  c2d.fill();

  const textX = cardX + 54;
  const maxTextW = cardW - 76;

  c2d.textBaseline = 'middle';
  c2d.fillStyle = '#ffffff';
  c2d.font = '700 46px "Inter", system-ui, -apple-system, sans-serif';
  c2d.fillText(truncateText(shape.label || 'Recta', 24), textX, cardY + 62, maxTextW);

  const sign = shape.deltaZM >= 0 ? '+' : '';
  const metricText = `${formatEsNumber(shape.length3DM, 1)} m · ΔZ ${sign}${formatEsNumber(shape.deltaZM, 1)} m · ${formatEsInt(shape.slopePct)}%`;
  c2d.fillStyle = '#67e8f9';
  c2d.font = '700 36px "JetBrains Mono", ui-monospace, monospace';
  c2d.fillText(metricText, textX, cardY + 136, maxTextW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const grp = new THREE.Group();
  const baseY = my + 0.8;
  const topY = baseY + 11;

  const stemGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(mx, baseY, mz),
    new THREE.Vector3(mx, topY, mz),
  ]);
  const stemMat = new THREE.LineBasicMaterial({
    color: shape.color,
    transparent: true,
    opacity: 0.92,
    toneMapped: false,
  });
  const stem = new THREE.Line(stemGeom, stemMat);
  stem.renderOrder = 11;
  grp.add(stem);

  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  const spriteWidth = 56;
  const spriteHeight = spriteWidth * (canvas.height / canvas.width);
  sprite.scale.set(spriteWidth, spriteHeight, 1);
  sprite.center.set(0.5, 0);
  sprite.position.set(mx, topY + 0.3, mz);
  sprite.renderOrder = 14;
  grp.add(sprite);

  return grp;
}

function buildDrapedEdges(
  worldPts: THREE.Vector3[],
  closed: boolean,
  ctx: OverlayRebuildContext
): THREE.Vector3[] {
  if (!ctx.hasExternal && ctx.sampleDemBaseY && closed && worldPts.length >= 3) {
    const fn = ctx.sampleDemBaseY;
    const draped: THREE.Vector3[] = [];
    for (let i = 0; i < worldPts.length; i++) {
      const a = worldPts[i];
      const b = worldPts[(i + 1) % worldPts.length];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.min(20, Math.ceil(dist / 6)));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = fn(x, z) * ctx.exaggeration + 0.48;
        draped.push(new THREE.Vector3(x, y, z));
      }
    }
    return draped;
  }

  return worldPts.map((p) => new THREE.Vector3(p.x, p.y + 0.45, p.z));
}

export function buildDrawnShapesGroup(
  shapes: DrawnShape3D[],
  pins: DrawnPin3D[],
  activePoints: DrawnPoint3D[],
  activeTool: DrawToolMode,
  activeColor: string,
  activeOpacity: number,
  previewPoint: DrawnPoint3D | null,
  ctx: OverlayRebuildContext
): THREE.Group {
  const root = new THREE.Group();

  const toWorld = (pt: DrawnPoint3D) =>
    new THREE.Vector3(pt.x, pt.baseY * ctx.exaggeration, pt.z);

  // 1. Completed shapes
  for (const shape of shapes) {
    if (!shape.visible || shape.points.length < 2) continue;
    const shapeGrp = new THREE.Group();
    const worldPts = shape.points.map(toWorld);

    if (shape.type === 'polygon' && worldPts.length >= 3) {
      const fillMesh = buildPolygonFillMesh(worldPts, shape.color, shape.opacity, ctx);
      if (fillMesh) shapeGrp.add(fillMesh);

      if (shape.polygonKind !== 'zone') {
        // Reference base plane defined by the lowest Z (Z_min) and highest Z (Z_max) of the delimiting stockpile polygon
        let fallbackMin = shape.points[0];
        let fallbackMax = shape.points[0];
        for (const p of shape.points) {
          if (p.baseY < fallbackMin.baseY) fallbackMin = p;
          if (p.baseY > fallbackMax.baseY) fallbackMax = p;
        }
        const refMinPt = {
          x: shape.baseMinPt?.x ?? fallbackMin.x,
          z: shape.baseMinPt?.z ?? fallbackMin.z,
          baseY: shape.baseMinY ?? fallbackMin.baseY,
        };
        const refMaxPt = {
          x: shape.baseMaxPt?.x ?? fallbackMax.x,
          z: shape.baseMaxPt?.z ?? fallbackMax.z,
          baseY: shape.baseMaxY ?? fallbackMax.baseY,
        };

        if (Number.isFinite(refMinPt.baseY) && Number.isFinite(refMaxPt.baseY)) {
          const refWorldYAt = (x: number, z: number) =>
            evaluateMinMaxBasePlaneY(x, z, refMinPt, refMaxPt) * ctx.exaggeration + 0.1;

          const baseContour2D = worldPts.map((p) => new THREE.Vector2(p.x, p.z));
          let baseTris = THREE.ShapeUtils.triangulateShape(baseContour2D, []);
          if (baseTris.length === 0) {
            baseTris = [];
            for (let i = 1; i < worldPts.length - 1; i++) {
              baseTris.push([0, i, i + 1]);
            }
          }
          const basePos: number[] = [];
          for (const [ia, ib, ic] of baseTris) {
            const a = worldPts[ia];
            const b = worldPts[ib];
            const c = worldPts[ic];
            basePos.push(
              a.x,
              refWorldYAt(a.x, a.z),
              a.z,
              b.x,
              refWorldYAt(b.x, b.z),
              b.z,
              c.x,
              refWorldYAt(c.x, c.z),
              c.z
            );
          }
          const baseGeom = new THREE.BufferGeometry();
          baseGeom.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3));
          baseGeom.computeVertexNormals();
          const baseMat = new THREE.MeshBasicMaterial({
            color: shape.color,
            transparent: true,
            opacity: Math.min(0.18, shape.opacity * 0.4),
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          });
          const basePlaneMesh = new THREE.Mesh(baseGeom, baseMat);
          basePlaneMesh.renderOrder = 3;
          shapeGrp.add(basePlaneMesh);

          // Dashed perimeter contour on the Z_min -> Z_max reference plane
          const baseLoopPts = [...worldPts, worldPts[0]].map(
            (p) => new THREE.Vector3(p.x, refWorldYAt(p.x, p.z) + 0.08, p.z)
          );
          const baseLoopGeom = new THREE.BufferGeometry().setFromPoints(baseLoopPts);
          const baseLoopMat = new THREE.LineDashedMaterial({
            color: shape.color,
            dashSize: 2.5,
            gapSize: 1.5,
            transparent: true,
            opacity: 0.78,
          });
          const baseLoopLine = new THREE.Line(baseLoopGeom, baseLoopMat);
          baseLoopLine.computeLineDistances();
          baseLoopLine.renderOrder = 5;
          shapeGrp.add(baseLoopLine);

          // Vertical drop lines where perimeter vertices deviate from the reference plane
          const dropPts: THREE.Vector3[] = [];
          for (const wp of worldPts) {
            const ry = refWorldYAt(wp.x, wp.z) + 0.08;
            if (Math.abs(wp.y - ry) > 0.45) {
              dropPts.push(new THREE.Vector3(wp.x, wp.y + 0.35, wp.z));
              dropPts.push(new THREE.Vector3(wp.x, ry, wp.z));
            }
          }
          if (dropPts.length > 0) {
            const dropGeom = new THREE.BufferGeometry().setFromPoints(dropPts);
            const dropMat = new THREE.LineBasicMaterial({
              color: shape.color,
              transparent: true,
              opacity: 0.5,
            });
            const dropSegs = new THREE.LineSegments(dropGeom, dropMat);
            dropSegs.renderOrder = 5;
            shapeGrp.add(dropSegs);
          }
        }
      }
    }

    const edgePts =
      shape.type === 'polygon'
        ? buildDrapedEdges(worldPts, true, ctx)
        : worldPts.map((p) => new THREE.Vector3(p.x, p.y + 0.45, p.z));

    shapeGrp.add(
      buildPolyLineObjects(
        edgePts,
        shape.type === 'polygon',
        shape.color,
        shape.type === 'line' ? 0.55 : 0.45,
        0.96
      )
    );

    // Vertex nodes
    const nodeMat = new THREE.MeshBasicMaterial({ color: shape.color, toneMapped: false });
    const nodeGeom = new THREE.SphereGeometry(1.05, 10, 10);
    for (const wp of worldPts) {
      const node = new THREE.Mesh(nodeGeom, nodeMat);
      node.position.set(wp.x, wp.y + 0.5, wp.z);
      node.renderOrder = 8;
      shapeGrp.add(node);
    }

    // 3D floating label (stockpile volume card, custom 3D polygon name + annotation, or 3D line metrics)
    if (shape.type === 'polygon' && worldPts.length >= 3 && shape.showLabel3D !== false) {
      const labelGrp =
        shape.polygonKind === 'zone'
          ? createZonePolygonLabelGroup(shape, worldPts, ctx)
          : createVolumeLabelGroup(shape, worldPts, ctx);
      if (labelGrp) shapeGrp.add(labelGrp);
    } else if (shape.type === 'line' && worldPts.length >= 2 && shape.showLabel3D !== false) {
      const lineLabelGrp = createLineLabelGroup(shape, worldPts);
      if (lineLabelGrp) shapeGrp.add(lineLabelGrp);
    }

    root.add(shapeGrp);
  }

  // 2. Active in-progress drawing + rubber-band preview
  const isPolygonTool = activeTool === 'polygon' || activeTool === 'zone';
  if (activeTool !== 'orbit' && activePoints.length > 0) {
    const activeGrp = new THREE.Group();
    const worldPts = activePoints.map(toWorld);
    const previewVec = previewPoint ? toWorld(previewPoint) : null;

    if (worldPts.length >= 2) {
      const committedEdges = worldPts.map((p) => new THREE.Vector3(p.x, p.y + 0.5, p.z));
      activeGrp.add(buildPolyLineObjects(committedEdges, false, activeColor, 0.48, 0.98));
    }

    // Live translucent polygon preview when >= 2 committed points + hover preview (or >= 3 committed)
    if (isPolygonTool) {
      const previewPolyPts = previewVec ? [...worldPts, previewVec] : worldPts;
      if (previewPolyPts.length >= 3) {
        const previewFill = buildPolygonFillMesh(
          previewPolyPts,
          activeColor,
          Math.max(0.15, activeOpacity * 0.75),
          ctx
        );
        if (previewFill) activeGrp.add(previewFill);
      }
    }

    // Rubber-band line from last vertex to cursor (and closing segment in polygon/zone mode)
    if (previewVec) {
      const lastPt = worldPts[worldPts.length - 1];
      const rubberPts = [
        new THREE.Vector3(lastPt.x, lastPt.y + 0.55, lastPt.z),
        new THREE.Vector3(previewVec.x, previewVec.y + 0.55, previewVec.z),
      ];
      if (isPolygonTool && worldPts.length >= 2) {
        rubberPts.push(new THREE.Vector3(worldPts[0].x, worldPts[0].y + 0.55, worldPts[0].z));
      }
      const rubberGeom = new THREE.BufferGeometry().setFromPoints(rubberPts);
      const rubberMat = new THREE.LineDashedMaterial({
        color: '#f8fafc',
        dashSize: 3.5,
        gapSize: 2.0,
        transparent: true,
        opacity: 0.9,
      });
      const rubberLine = new THREE.Line(rubberGeom, rubberMat);
      rubberLine.computeLineDistances();
      rubberLine.renderOrder = 8;
      activeGrp.add(rubberLine);
    }

    // Active vertex spheres (first vertex highlighted larger in polygon/zone mode so user can snap-close)
    worldPts.forEach((wp, idx) => {
      const isCloseAnchor = isPolygonTool && idx === 0 && worldPts.length >= 3;
      const g = new THREE.SphereGeometry(isCloseAnchor ? 1.8 : 1.15, 12, 12);
      const m = new THREE.MeshBasicMaterial({
        color: isCloseAnchor ? '#ffffff' : activeColor,
        toneMapped: false,
      });
      const s = new THREE.Mesh(g, m);
      s.position.set(wp.x, wp.y + 0.55, wp.z);
      s.renderOrder = 9;
      activeGrp.add(s);
    });

    root.add(activeGrp);
  } else if (activeTool !== 'orbit' && previewPoint) {
    // Cursor reticle sphere before placing 1st point
    const wp = toWorld(previewPoint);
    const g = new THREE.SphereGeometry(1.15, 12, 12);
    const m = new THREE.MeshBasicMaterial({
      color: activeColor,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const s = new THREE.Mesh(g, m);
    s.position.set(wp.x, wp.y + 0.55, wp.z);
    s.renderOrder = 9;
    root.add(s);
  }

  // 3. Georeferenced 3D Survey Pins & Point Annotations
  if (pins.length > 0) {
    const ringGeom = new THREE.RingGeometry(1.4, 2.2, 20);
    ringGeom.rotateX(-Math.PI / 2);
    const mastGeom = new THREE.CylinderGeometry(0.28, 0.35, 9.5, 10);
    const headGeom = new THREE.SphereGeometry(1.75, 14, 14);
    const anchorSphereGeom = new THREE.SphereGeometry(1.35, 14, 14);

    const buildAnnotationSprite = (pin: DrawnPin3D): THREE.Sprite | null => {
      if (typeof document === 'undefined') return null;
      const title = truncateText(pin.label || 'Anotación', 28);
      const noteLines = wrapTextLines(pin.note || '', 30, 2);

      const canvas = document.createElement('canvas');
      canvas.width = 880;
      canvas.height = noteLines.length === 0 ? 226 : noteLines.length === 1 ? 298 : 358;
      const c2 = canvas.getContext('2d');
      if (!c2) return null;

      const cardX = 12;
      const cardY = 10;
      const cardW = canvas.width - 24;
      const pointerH = 24;
      const cardH = canvas.height - cardY - pointerH - 8;

      c2.clearRect(0, 0, canvas.width, canvas.height);

      // Card body
      drawRoundedRectPath(c2, cardX, cardY, cardW, cardH, 28);
      c2.fillStyle = 'rgba(9, 13, 22, 0.95)';
      c2.fill();
      c2.lineWidth = 6;
      c2.strokeStyle = pin.color;
      c2.stroke();

      // Bottom callout pointer triangle
      const midX = canvas.width / 2;
      c2.beginPath();
      c2.moveTo(midX - 22, cardY + cardH - 2);
      c2.lineTo(midX + 22, cardY + cardH - 2);
      c2.lineTo(midX, cardY + cardH + pointerH);
      c2.closePath();
      c2.fillStyle = pin.color;
      c2.fill();

      // Left color accent bar
      drawRoundedRectPath(c2, cardX + 20, cardY + 24, 16, cardH - 48, 8);
      c2.fillStyle = pin.color;
      c2.fill();

      const textX = cardX + 58;
      const maxTextW = cardW - 82;

      // Title
      c2.textBaseline = 'middle';
      c2.font = '700 52px "Inter", system-ui, -apple-system, sans-serif';
      c2.fillStyle = '#ffffff';
      c2.fillText(title, textX, cardY + (noteLines.length === 0 ? cardH * 0.5 : 68), maxTextW);

      // Optional note lines
      if (noteLines.length > 0) {
        c2.font = '600 38px "Inter", system-ui, -apple-system, sans-serif';
        c2.fillStyle = '#f1f5f9';
        noteLines.forEach((line, idx) => {
          c2.fillText(line, textX, cardY + 144 + idx * 54, maxTextW);
        });
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      const aspect = canvas.width / canvas.height;
      const spriteH = noteLines.length === 0 ? 19.5 : noteLines.length === 1 ? 25.5 : 30.8;
      sprite.scale.set(spriteH * aspect, spriteH, 1);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 14;
      return sprite;
    };

    const buildPinLabelSprite = (pin: DrawnPin3D, elevM: number | null): THREE.Sprite | null => {
      if (typeof document === 'undefined') return null;
      const title = truncateText(pin.label || 'Pin Cota', 24);
      const hasElev = elevM !== null && Number.isFinite(elevM);

      const canvas = document.createElement('canvas');
      canvas.width = 740;
      canvas.height = hasElev ? 244 : 182;
      const c2 = canvas.getContext('2d');
      if (!c2) return null;

      const cardX = 12;
      const cardY = 10;
      const cardW = canvas.width - 24;
      const pointerH = 20;
      const cardH = canvas.height - cardY - pointerH - 8;

      c2.clearRect(0, 0, canvas.width, canvas.height);

      // Card body
      drawRoundedRectPath(c2, cardX, cardY, cardW, cardH, 26);
      c2.fillStyle = 'rgba(9, 13, 22, 0.95)';
      c2.fill();
      c2.lineWidth = 6;
      c2.strokeStyle = pin.color;
      c2.stroke();

      // Bottom pointer triangle toward pin head
      const midX = canvas.width / 2;
      c2.beginPath();
      c2.moveTo(midX - 18, cardY + cardH - 2);
      c2.lineTo(midX + 18, cardY + cardH - 2);
      c2.lineTo(midX, cardY + cardH + pointerH);
      c2.closePath();
      c2.fillStyle = pin.color;
      c2.fill();

      // Left color accent bar
      drawRoundedRectPath(c2, cardX + 18, cardY + 22, 15, cardH - 44, 7);
      c2.fillStyle = pin.color;
      c2.fill();

      const textX = cardX + 54;
      const maxTextW = cardW - 76;

      // Pin Name
      c2.textBaseline = 'middle';
      c2.font = '700 50px "Inter", system-ui, -apple-system, sans-serif';
      c2.fillStyle = '#ffffff';
      c2.fillText(title, textX, cardY + (hasElev ? 66 : cardH * 0.5), maxTextW);

      // Pin Elevation Z
      if (hasElev && elevM !== null) {
        c2.font = '700 42px "JetBrains Mono", ui-monospace, monospace';
        c2.fillStyle = '#67e8f9';
        c2.fillText(`Z: ${formatEsNumber(elevM, 2)} m`, textX, cardY + 140, maxTextW);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      const aspect = canvas.width / canvas.height;
      const spriteH = hasElev ? 19.8 : 15.0;
      sprite.scale.set(spriteH * aspect, spriteH, 1);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 14;
      return sprite;
    };

    for (const pin of pins) {
      if (!pin.visible) continue;
      const wp = toWorld(pin.point);
      const pinMat = new THREE.MeshBasicMaterial({ color: pin.color, toneMapped: false });
      const ringMat = new THREE.MeshBasicMaterial({
        color: pin.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
      });

      const pinGrp = new THREE.Group();
      pinGrp.position.set(wp.x, wp.y, wp.z);

      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.y = 0.35;
      ring.renderOrder = 8;
      pinGrp.add(ring);

      if (pin.kind === 'annotation') {
        const anchor = new THREE.Mesh(anchorSphereGeom, pinMat);
        anchor.position.y = 1.0;
        anchor.renderOrder = 9;
        pinGrp.add(anchor);

        const stemTopY = 14.5;
        const stemGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 1.0, 0),
          new THREE.Vector3(0, stemTopY, 0),
        ]);
        const stemMat = new THREE.LineBasicMaterial({
          color: pin.color,
          transparent: true,
          opacity: 0.95,
          toneMapped: false,
        });
        const stem = new THREE.Line(stemGeom, stemMat);
        stem.renderOrder = 10;
        pinGrp.add(stem);

        const sprite = buildAnnotationSprite(pin);
        if (sprite) {
          sprite.position.set(0, stemTopY, 0);
          pinGrp.add(sprite);
        }
      } else {
        const mast = new THREE.Mesh(mastGeom, pinMat);
        mast.position.y = 5.0;
        mast.renderOrder = 8;
        pinGrp.add(mast);

        const head = new THREE.Mesh(headGeom, pinMat);
        head.position.y = 10.6;
        head.renderOrder = 9;
        pinGrp.add(head);

        const elevM = ctx.baseYToViewerZ ? ctx.baseYToViewerZ(pin.point.baseY) : null;
        const pinSprite = buildPinLabelSprite(pin, elevM);
        if (pinSprite) {
          pinSprite.position.set(0, 13.0, 0);
          pinGrp.add(pinSprite);
        }
      }

      root.add(pinGrp);
    }
  }

  return root;
}

export function exportDrawingsCsv(
  shapes: DrawnShape3D[],
  pins: DrawnPin3D[],
  options: {
    quarryName: string;
    densityTonM3: number;
    elevMinM: number;
    elevMaxM: number;
    visualHeightSpan: number;
    metersPerSceneUnit: number;
  }
) {
  const rows: string[][] = [
    [
      'Tipo',
      'Etiqueta',
      'Anotacion',
      'Material',
      'Densidad_t_m3',
      'Color',
      'Area_m2',
      'Longitud_3D_m',
      'Distancia_2D_m',
      'Desnivel_Z_m',
      'Pendiente_pct',
      'Angulo_deg',
      'Volumen_Positivo_m3',
      'Volumen_Negativo_m3',
      'Volumen_Neto_m3',
      'Tonelaje_Est_t',
      'Cota_Base_Min_Z_m',
      'Cota_Base_Max_Z_m',
      'Este_X_m',
      'Norte_Z_m',
      'Cota_Z_m',
    ],
  ];

  const baseYToElevM = (baseY: number) => {
    const t = baseY / Math.max(1e-4, options.visualHeightSpan);
    return options.elevMinM + t * (options.elevMaxM - options.elevMinM);
  };

  for (const s of shapes) {
    const isZone = s.type === 'polygon' && s.polygonKind === 'zone';
    const isStockpile = s.type === 'polygon' && !isZone;
    const shapeDensity = s.densityTonM3 ?? options.densityTonM3;
    const tonnage = isStockpile && s.volumeSupported ? s.cutVolumeM3 * shapeDensity : 0;
    const centroidX =
      s.points.reduce((acc, p) => acc + p.x, 0) / Math.max(1, s.points.length);
    const centroidZ =
      s.points.reduce((acc, p) => acc + p.z, 0) / Math.max(1, s.points.length);
    const meanBaseY =
      s.points.reduce((acc, p) => acc + p.baseY, 0) / Math.max(1, s.points.length);
    const minBaseY =
      s.baseMinY ?? s.points.reduce((acc, p) => Math.min(acc, p.baseY), Infinity);
    const maxBaseY =
      s.baseMaxY ?? s.points.reduce((acc, p) => Math.max(acc, p.baseY), -Infinity);
    const cotaZ = baseYToElevM(meanBaseY);
    const cotaBaseMinZ = Number.isFinite(minBaseY) ? baseYToElevM(minBaseY) : cotaZ;
    const cotaBaseMaxZ = Number.isFinite(maxBaseY) ? baseYToElevM(maxBaseY) : cotaZ;

    rows.push([
      isZone ? 'Poligono_3D' : isStockpile ? 'Volumen_Acopio' : 'Recta',
      s.label,
      s.note || '',
      isStockpile ? s.material || '' : '',
      isStockpile ? formatEsNumber(shapeDensity, 2) : '',
      s.color,
      formatEsNumber(s.area2DM2, 2),
      formatEsNumber(s.length3DM, 2),
      formatEsNumber(s.length2DM, 2),
      formatEsNumber(s.deltaZM, 2),
      formatEsNumber(s.slopePct, 2),
      formatEsNumber(s.slopeDeg, 2),
      isStockpile && s.volumeSupported ? formatEsNumber(s.cutVolumeM3, 2) : '',
      isStockpile && s.volumeSupported ? formatEsNumber(s.fillVolumeM3, 2) : '',
      isStockpile && s.volumeSupported ? formatEsNumber(s.netVolumeM3, 2) : '',
      isStockpile && s.volumeSupported ? formatEsNumber(tonnage, 2) : '',
      isStockpile ? formatEsNumber(cotaBaseMinZ, 2) : '',
      isStockpile ? formatEsNumber(cotaBaseMaxZ, 2) : '',
      formatEsNumber(centroidX * options.metersPerSceneUnit, 2),
      formatEsNumber(centroidZ * options.metersPerSceneUnit, 2),
      formatEsNumber(cotaZ, 2),
    ]);
  }

  for (const p of pins) {
    const cotaZ = baseYToElevM(p.point.baseY);
    const isAnnotation = p.kind === 'annotation';
    rows.push([
      isAnnotation ? 'Anotacion_3D' : 'Pin_Cota',
      p.label,
      p.note || '',
      '',
      '',
      p.color,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      formatEsNumber(p.point.x * options.metersPerSceneUnit, 2),
      formatEsNumber(p.point.z * options.metersPerSceneUnit, 2),
      formatEsNumber(cotaZ, 2),
    ]);
  }

  const csvContent =
    '\uFEFF' +
    rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = options.quarryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.href = url;
  a.download = `volumenes-acopios-3d-${safeName || 'modelo'}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function disposeObject3DTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Line ||
      obj instanceof THREE.Points ||
      obj instanceof THREE.Sprite
    ) {
      if ('geometry' in obj && obj.geometry) {
        geometries.add(obj.geometry);
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        materials.add(m);
        if ('map' in m && m.map instanceof THREE.Texture) {
          textures.add(m.map);
        }
      }
    }
  });

  textures.forEach((t) => t.dispose());
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
