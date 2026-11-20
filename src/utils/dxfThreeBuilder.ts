import * as THREE from 'three';
import type { FlightDxfOverlay, Stockpile } from '../types.ts';
import {
  createDxfWorldMapper,
  type DxfCadTransformContext,
} from './dxfOverlayParser.ts';
import { TERRAIN_HALF_M, TERRAIN_SPAN_M } from './quarryTerrainModel.ts';
import { formatEsInt } from './numberFormat.ts';

export interface BuildDxf3DOptions {
  exaggeration: number;
  opacity: number;
  selectedPolygonId: string | null;
  terrainOriginUtm: { e0: number; n0: number };
  demElevMinM: number;
  demElevMaxM: number;
  cadTransform?: DxfCadTransformContext | null;
  hasExternal3D: boolean;
  externalHeightSpan: number;
}

export interface BuiltDxf3DResult {
  group: THREE.Group;
  focusTargets: Map<string, { center: THREE.Vector3; span: number }>;
  alignmentMode: 'external_cad' | 'utm_exact' | 'centered_fit';
}

function createDxfBadgeSprite(
  title: string,
  subtitle: string,
  accentColor: string,
  isSelected: boolean
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 148;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Rounded background pill
    const x = 8;
    const y = 10;
    const w = canvas.width - 16;
    const h = canvas.height - 20;
    const r = 20;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = isSelected ? 'rgba(15, 23, 42, 0.96)' : 'rgba(9, 13, 22, 0.90)';
    ctx.fill();
    ctx.lineWidth = isSelected ? 6 : 4;
    ctx.strokeStyle = isSelected ? '#ffffff' : accentColor;
    ctx.stroke();

    // Color swatch dot
    ctx.beginPath();
    ctx.arc(42, 54, 13, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Title
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const trimmedTitle = title.length > 26 ? `${title.slice(0, 25)}…` : title;
    ctx.fillText(trimmedTitle, 68, 54);

    // Subtitle
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 22px ui-monospace, SFMono-Regular, monospace';
    const trimmedSub = subtitle.length > 36 ? `${subtitle.slice(0, 35)}…` : subtitle;
    ctx.fillText(trimmedSub, 30, 102);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(isSelected ? 40 : 34, isSelected ? 11.5 : 9.8, 1);
  sprite.renderOrder = 12;
  return sprite;
}

export function buildDxfOverlay3DGroup(
  overlay: FlightDxfOverlay,
  stockpiles: Stockpile[],
  opts: BuildDxf3DOptions
): BuiltDxf3DResult {
  const group = new THREE.Group();
  const focusTargets = new Map<string, { center: THREE.Vector3; span: number }>();

  const mapper = createDxfWorldMapper(overlay, {
    terrainOriginUtm: opts.terrainOriginUtm,
    terrainSpanM: TERRAIN_SPAN_M,
    terrainHalfM: TERRAIN_HALF_M,
    demElevMinM: opts.demElevMinM,
    demElevMaxM: opts.demElevMaxM,
    cadTransform: opts.cadTransform,
    hasExternal3D: opts.hasExternal3D,
    externalHeightSpan: opts.externalHeightSpan,
  });

  const ex = Math.max(0.1, opts.exaggeration);
  const surfaceLift = mapper.mode === 'external_cad' ? 0.15 : 0.35;
  const stockpileById = new Map(stockpiles.map((s) => [s.id, s]));

  for (const poly of overlay.polygons) {
    if (poly.visible === false || poly.vertices.length < 3) continue;

    const isSelected = opts.selectedPolygonId === poly.id;
    const polyGroup = new THREE.Group();
    polyGroup.userData.dxfPolygonId = poly.id;

    const worldVerts = poly.vertices.map((v) => {
      const m = mapper.mapPoint(v);
      return new THREE.Vector3(m.worldX, m.baseY * ex + surfaceLift, m.worldZ);
    });

    // Compute bounds & centroid in Three.js world space
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const wv of worldVerts) {
      sumX += wv.x;
      sumY += wv.y;
      sumZ += wv.z;
      if (wv.x < minX) minX = wv.x;
      if (wv.x > maxX) maxX = wv.x;
      if (wv.y < minY) minY = wv.y;
      if (wv.y > maxY) maxY = wv.y;
      if (wv.z < minZ) minZ = wv.z;
      if (wv.z > maxZ) maxZ = wv.z;
    }

    // 1. 3D Surface Geometry (either explicit 3DFACE / Mesh triangles, or triangulated 3D polygon)
    const triPositions: number[] = [];
    if (poly.surfaceTriangles && poly.surfaceTriangles.length > 0) {
      for (const [a, b, c] of poly.surfaceTriangles) {
        const ma = mapper.mapPoint(a);
        const mb = mapper.mapPoint(b);
        const mc = mapper.mapPoint(c);
        const ya = ma.baseY * ex + surfaceLift;
        const yb = mb.baseY * ex + surfaceLift;
        const yc = mc.baseY * ex + surfaceLift;
        triPositions.push(
          ma.worldX, ya, ma.worldZ,
          mb.worldX, yb, mb.worldZ,
          mc.worldX, yc, mc.worldZ
        );
        if (ya > maxY) maxY = ya;
        if (yb > maxY) maxY = yb;
        if (yc > maxY) maxY = yc;
      }
    } else {
      const contour2D = worldVerts.map((v) => new THREE.Vector2(v.x, v.z));
      const faces = THREE.ShapeUtils.triangulateShape(contour2D, []);
      for (const [ia, ib, ic] of faces) {
        const va = worldVerts[ia];
        const vb = worldVerts[ib];
        const vc = worldVerts[ic];
        if (!va || !vb || !vc) continue;
        triPositions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      }
    }

    if (triPositions.length >= 9) {
      const surfGeom = new THREE.BufferGeometry();
      surfGeom.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
      surfGeom.computeVertexNormals();
      const surfMat = new THREE.MeshStandardMaterial({
        color: poly.color,
        emissive: isSelected ? poly.color : '#000000',
        emissiveIntensity: isSelected ? 0.28 : 0.06,
        transparent: true,
        opacity: isSelected ? Math.min(0.88, opts.opacity + 0.2) : opts.opacity,
        roughness: 0.55,
        metalness: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const surfMesh = new THREE.Mesh(surfGeom, surfMat);
      surfMesh.renderOrder = 3;
      surfMesh.userData.dxfPolygonId = poly.id;
      polyGroup.add(surfMesh);
    }

    // 2. Crisp 3D Perimeter Tube Outline
    const curvePath = new THREE.CurvePath<THREE.Vector3>();
    const edgeCount = poly.closed ? worldVerts.length : worldVerts.length - 1;
    for (let i = 0; i < edgeCount; i++) {
      const a = worldVerts[i];
      const b = worldVerts[(i + 1) % worldVerts.length];
      if (a.distanceToSquared(b) > 1e-6) {
        curvePath.add(new THREE.LineCurve3(a, b));
      }
    }
    if (curvePath.curves.length > 0) {
      const tubeSegs = Math.min(240, Math.max(16, curvePath.curves.length * 2));
      const tubeGeom = new THREE.TubeGeometry(curvePath, tubeSegs, isSelected ? 0.72 : 0.42, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: isSelected ? '#ffffff' : poly.color,
      });
      const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
      tubeMesh.renderOrder = 4;
      tubeMesh.userData.dxfPolygonId = poly.id;
      polyGroup.add(tubeMesh);
    }

    // 3. Vertex markers along 3D perimeter (when selected)
    if (isSelected) {
      const loopPts = [...worldVerts, worldVerts[0]];
      const lineGeom = new THREE.BufferGeometry().setFromPoints(loopPts);
      const lineObj = new THREE.Line(
        lineGeom,
        new THREE.LineBasicMaterial({ color: poly.color })
      );
      lineObj.position.y += 0.2;
      lineObj.userData.dxfPolygonId = poly.id;
      polyGroup.add(lineObj);
    }

    // 4. Floating 3D Stockpile Label + Pin Stem
    const cx = sumX / worldVerts.length;
    const cy = Math.max(maxY, sumY / worldVerts.length);
    const cz = sumZ / worldVerts.length;
    const assigned = poly.stockpileId ? stockpileById.get(poly.stockpileId) : undefined;

    const stemTopY = cy + (isSelected ? 11.5 : 8.5);
    const stemGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, cy, cz),
      new THREE.Vector3(cx, stemTopY, cz),
    ]);
    const stemLine = new THREE.Line(
      stemGeom,
      new THREE.LineBasicMaterial({ color: isSelected ? '#ffffff' : poly.color })
    );
    stemLine.userData.dxfPolygonId = poly.id;
    polyGroup.add(stemLine);

    const title = assigned ? `${assigned.code} · ${assigned.name}` : poly.label;
    const subtitle = assigned
      ? `${assigned.material} · ${formatEsInt(assigned.netVolumeM3)} m³ · ${formatEsInt(assigned.tonnageEst)} t`
      : `Área ${formatEsInt(poly.areaM2)} m² · Capa ${poly.layer}`;
    const sprite = createDxfBadgeSprite(title, subtitle, poly.color, isSelected);
    sprite.position.set(cx, stemTopY + 5.5, cz);
    sprite.userData.dxfPolygonId = poly.id;
    polyGroup.add(sprite);

    const span = Math.max(26, Math.hypot(maxX - minX, maxZ - minZ));
    focusTargets.set(poly.id, {
      center: new THREE.Vector3(cx, cy + 2, cz),
      span,
    });

    group.add(polyGroup);
  }

  return {
    group,
    focusTargets,
    alignmentMode: mapper.mode,
  };
}
