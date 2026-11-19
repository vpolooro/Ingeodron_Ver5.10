import type { Quarry, Stockpile, Zone } from '../types.ts';

export const TERRAIN_SPAN_M = 400; // 400m x 400m metric site
export const TERRAIN_HALF_M = TERRAIN_SPAN_M / 2;
export const ELEV_MIN_M = 705;
export const ELEV_MAX_M = 755;

export interface StockpileFootprint {
  id: number;
  name: string;
  code: string;
  material: string;
  densityTonM3: number;
  fillVolumeM3: number;
  cutVolumeM3: number;
  netVolumeM3: number;
  tonnageEst: number;
  worldX: number;
  worldZ: number;
  baseElevationM: number;
  peakElevationM: number;
  radiusM: number;
  easting: number;
  northing: number;
  polygon: Array<{ x: number; z: number }>;
}

export interface ContourSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  elevationM: number;
  isMaster: boolean;
}

export interface ProfileSample {
  distanceM: number;
  elevationM: number;
  worldX: number;
  worldZ: number;
  easting: number;
  northing: number;
}

export interface QuarryTerrainData {
  gridSize: number;
  heights: Float32Array; // gridSize * gridSize elevations in meters (705..755)
  utmOriginE: number;
  utmOriginN: number;
  stockpiles: StockpileFootprint[];
  defaultProfileA: { x0: number; z0: number; x1: number; z1: number };
  defaultProfileB: { x0: number; z0: number; x1: number; z1: number };
  sampleElevationAt: (worldX: number, worldZ: number) => number;
  worldToUtm: (worldX: number, worldZ: number) => { easting: number; northing: number };
}

function hash2D(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const a = hash2D(xi, zi, seed);
  const b = hash2D(xi + 1, zi, seed);
  const c = hash2D(xi, zi + 1, seed);
  const d = hash2D(xi + 1, zi + 1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number, seed: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    val += amp * valueNoise(x * freq, z * freq, seed + i * 19);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-5)));
  return t * t * (3 - 2 * t);
}

function parseUtmOrigin(quarry: Quarry | null): { e0: number; n0: number } {
  const baseId = quarry?.id || 1;
  let lat = 37.185;
  let lon = -5.782;
  if (quarry?.coordinates) {
    const parts = quarry.coordinates.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      lat = parts[0];
      lon = parts[1];
    }
  }
  const e0 = Math.round(254200 + (lon + 5.782) * 8500 + baseId * 340);
  const n0 = Math.round(4118600 + (lat - 37.185) * 111000 + baseId * 210);
  return { e0, n0 };
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { dist: number; t: number } {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
  const dx = px - (ax + t * vx);
  const dz = pz - (az + t * vz);
  return { dist: Math.hypot(dx, dz), t };
}

// Winding haul ramp segments descending from rim (NE) down to pit pad (center-south)
const HAUL_RAMP_WAYPOINTS: Array<{ x: number; z: number; elev: number }> = [
  { x: 162, z: -135, elev: 749.5 },
  { x: 132, z: -48, elev: 741.0 },
  { x: 120, z: 58, elev: 732.0 },
  { x: 48, z: 112, elev: 722.5 },
  { x: -38, z: 102, elev: 715.5 },
  { x: -64, z: 54, elev: 711.2 },
];

export function evaluateHaulRampInfo(
  x: number,
  z: number
): { dist: number; elev: number; isRoad: boolean } {
  let minDist = Infinity;
  let roadElev = 711.2;

  for (let i = 0; i < HAUL_RAMP_WAYPOINTS.length - 1; i++) {
    const a = HAUL_RAMP_WAYPOINTS[i];
    const b = HAUL_RAMP_WAYPOINTS[i + 1];
    const { dist, t } = distToSegment(x, z, a.x, a.z, b.x, b.z);
    if (dist < minDist) {
      minDist = dist;
      roadElev = a.elev + (b.elev - a.elev) * t;
    }
  }

  return {
    dist: minDist,
    elev: roadElev,
    isRoad: minDist < 9.5,
  };
}

export function hypsometricColorRgb(elevM: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (elevM - ELEV_MIN_M) / (ELEV_MAX_M - ELEV_MIN_M)));
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [29, 78, 216]],   // 705m Deep Blue
    [0.22, [6, 182, 212]],  // 716m Cyan
    [0.44, [16, 185, 129]], // 727m Emerald
    [0.64, [234, 179, 8]],  // 737m Yellow
    [0.82, [249, 115, 22]], // 746m Orange
    [0.95, [220, 38, 38]],  // 752.5m Crimson
    [1.0, [248, 250, 252]], // 755m Ridge Highlight
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return [248, 250, 252];
}

export function buildQuarryTerrainData(
  quarry: Quarry | null,
  zones: Zone[],
  stockpilesInput: Stockpile[]
): QuarryTerrainData {
  const seed = (quarry?.id || 1) * 17 + 7;
  const { e0, n0 } = parseUtmOrigin(quarry);
  const gridSize = 256;
  const heights = new Float32Array(gridSize * gridSize);

  const worldToUtm = (worldX: number, worldZ: number) => ({
    easting: Math.round((e0 + worldX + TERRAIN_HALF_M) * 10) / 10,
    northing: Math.round((n0 - worldZ + TERRAIN_HALF_M) * 10) / 10,
  });

  // 1. Place stockpile footprints inside the flat loading pad (x in [-85, 65], z in [-55, 68])
  const effectiveSource: Array<Partial<Stockpile> & { id: number; name: string }> =
    stockpilesInput.length > 0
      ? stockpilesInput
      : zones.length > 0
      ? zones.map((z, idx) => ({
          id: z.id || idx + 1,
          name: z.name,
          code: z.code,
          material: z.targetMaterial,
          densityTonM3: z.densityTonM3,
          fillVolumeM3: 18500 + idx * 4200,
          cutVolumeM3: 120,
          netVolumeM3: 18380 + idx * 4200,
          tonnageEst: Math.round((18380 + idx * 4200) * (z.densityTonM3 || 1.68)),
        }))
      : [
          {
            id: 1,
            name: 'Acopio Principal Grava 12/20',
            code: 'ACO-01',
            material: 'Grava caliza 12/20',
            densityTonM3: 1.68,
            fillVolumeM3: 24500,
            cutVolumeM3: 0,
            netVolumeM3: 24500,
            tonnageEst: 41160,
          },
          {
            id: 2,
            name: 'Acopio Arena Silícea',
            code: 'ACO-02',
            material: 'Arena lavada 0/4',
            densityTonM3: 1.55,
            fillVolumeM3: 14200,
            cutVolumeM3: 0,
            netVolumeM3: 14200,
            tonnageEst: 22010,
          },
          {
            id: 3,
            name: 'Acopio Zahorra Artificial ZA-25',
            code: 'ACO-03',
            material: 'Zahorra ZA-25',
            densityTonM3: 1.72,
            fillVolumeM3: 19800,
            cutVolumeM3: 0,
            netVolumeM3: 19800,
            tonnageEst: 34056,
          },
        ];

  const padSlots: Array<{ x: number; z: number }> = [
    { x: -34, z: -18 },
    { x: 24, z: -24 },
    { x: -12, z: 26 },
    { x: 42, z: 22 },
    { x: -64, z: 16 },
    { x: 8, z: -54 },
    { x: -58, z: -48 },
    { x: 56, z: -42 },
  ];

  const limitedSource = effectiveSource.slice(0, 8);
  const footprints: StockpileFootprint[] = limitedSource.map((st, idx) => {
    const slot = padSlots[idx % padSlots.length];
    const jitterX = (hash2D(idx, 1, seed) - 0.5) * 6;
    const jitterZ = (hash2D(idx, 2, seed) - 0.5) * 6;
    const worldX = slot.x + jitterX;
    const worldZ = slot.z + jitterZ;

    const fillVol = Math.max(1500, Number(st.fillVolumeM3) || 12000);
    const cutVol = Number(st.cutVolumeM3) || 0;
    const netVol = Number(st.netVolumeM3 ?? fillVol - cutVol);
    const density = Number(st.densityTonM3) || 1.68;
    const tons = Number(st.tonnageEst ?? Math.round(Math.abs(netVol) * density * 10) / 10);

    const radiusM = Math.max(15, Math.min(28, 12 + Math.pow(fillVol / 1000, 0.36) * 3.4));
    const heightM = Math.max(5.5, Math.min(16.5, 4.5 + Math.pow(fillVol / 1000, 0.34) * 2.5));
    const baseElev = 711.2;

    const poly: Array<{ x: number; z: number }> = [];
    const verts = 16;
    for (let v = 0; v < verts; v++) {
      const ang = (v / verts) * Math.PI * 2;
      const radialMod = 0.88 + 0.22 * hash2D(v + idx * 13, idx, seed);
      poly.push({
        x: worldX + Math.cos(ang) * radiusM * radialMod,
        z: worldZ + Math.sin(ang) * radiusM * radialMod,
      });
    }

    return {
      id: st.id,
      name: st.name,
      code: st.code || `ACO-0${idx + 1}`,
      material: st.material || 'Grava caliza',
      densityTonM3: density,
      fillVolumeM3: fillVol,
      cutVolumeM3: cutVol,
      netVolumeM3: netVol,
      tonnageEst: tons,
      worldX,
      worldZ,
      baseElevationM: baseElev,
      peakElevationM: Math.round((baseElev + heightM) * 10) / 10,
      radiusM,
      easting: worldToUtm(worldX, worldZ).easting,
      northing: worldToUtm(worldX, worldZ).northing,
      polygon: poly,
    };
  });

  // 2. Base elevation sampler (benches + pit + haul ramp + stockpile mounds)
  const computeElevation = (wx: number, wz: number): number => {
    // Elliptical open-pit geometry slightly offset northwest so south-east opens cleanly for ramp
    const cx = wx + 10;
    const cz = wz + 8;
    const warp = (fbm(wx * 0.012, wz * 0.012, seed) - 0.5) * 28;
    const radial = Math.hypot(cx * 0.92, cz * 1.05) + warp;

    // 4 stepped quarry benches between radial 58m and 172m
    // Pit floor ~710.8m, benches at ~718m, 727m, 736m, 745m, outer rim ~751m-754m
    let elev = 710.8;
    const benchLevels = [
      { rStart: 62, rEnd: 74, hFrom: 710.8, hTo: 718.8 },
      { rStart: 88, rEnd: 100, hFrom: 718.8, hTo: 727.6 },
      { rStart: 114, rEnd: 126, hFrom: 727.6, hTo: 736.8 },
      { rStart: 140, rEnd: 154, hFrom: 736.8, hTo: 745.8 },
      { rStart: 164, rEnd: 180, hFrom: 745.8, hTo: 752.4 },
    ];

    for (const b of benchLevels) {
      if (radial > b.rStart) {
        const step = smoothstep(b.rStart, b.rEnd, radial);
        elev += (b.hTo - b.hFrom) * step;
      }
    }

    // Deepen eastern sump slightly to reach 706m minimum for realistic drainage basin
    const sumpDist = Math.hypot(wx - 78, wz + 62);
    if (sumpDist < 34) {
      elev -= (1 - smoothstep(8, 34, sumpDist)) * 5.2;
    }

    // Subtle natural rock micro-relief
    const micro = (fbm(wx * 0.055, wz * 0.055, seed + 51) - 0.5) * 1.4;
    elev += micro;

    // Carve smooth haul ramp along the eastern-southern benches
    const ramp = evaluateHaulRampInfo(wx, wz);
    if (ramp.dist < 19) {
      const roadBlend = 1 - smoothstep(8.5, 19, ramp.dist);
      elev = elev * (1 - roadBlend) + ramp.elev * roadBlend;
    }

    // Flatten central stockpile pad
    const padDistX = Math.max(0, Math.abs(wx + 6) - 68);
    const padDistZ = Math.max(0, Math.abs(wz + 6) - 56);
    const padDist = Math.hypot(padDistX, padDistZ);
    if (padDist < 16) {
      const padBlend = 1 - smoothstep(0, 16, padDist);
      elev = elev * (1 - padBlend) + 711.2 * padBlend;
    }

    // Add stockpile mounds
    for (let i = 0; i < footprints.length; i++) {
      const fp = footprints[i];
      const dx = wx - fp.worldX;
      const dz = wz - fp.worldZ;
      const d = Math.hypot(dx, dz);
      if (d < fp.radiusM) {
        const moundH = fp.peakElevationM - fp.baseElevationM;
        const norm = d / fp.radiusM;
        // Truncated conical aggregate pile with slight ridge texture
        const cone = Math.max(0, 1 - Math.pow(norm, 1.45));
        const ridge = (fbm(wx * 0.14 + i * 7, wz * 0.14, seed + 99) - 0.5) * 0.85 * (1 - norm);
        elev = Math.max(elev, fp.baseElevationM + cone * moundH + ridge);
      }
    }

    return Math.max(ELEV_MIN_M, Math.min(ELEV_MAX_M, elev));
  };

  for (let row = 0; row < gridSize; row++) {
    const wz = -TERRAIN_HALF_M + (row / (gridSize - 1)) * TERRAIN_SPAN_M;
    for (let col = 0; col < gridSize; col++) {
      const wx = -TERRAIN_HALF_M + (col / (gridSize - 1)) * TERRAIN_SPAN_M;
      heights[row * gridSize + col] = computeElevation(wx, wz);
    }
  }

  const sampleElevationAt = (worldX: number, worldZ: number): number => {
    const fx = ((worldX + TERRAIN_HALF_M) / TERRAIN_SPAN_M) * (gridSize - 1);
    const fz = ((worldZ + TERRAIN_HALF_M) / TERRAIN_SPAN_M) * (gridSize - 1);
    const c0 = Math.max(0, Math.min(gridSize - 2, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(gridSize - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - c0));
    const tz = Math.max(0, Math.min(1, fz - r0));

    const h00 = heights[r0 * gridSize + c0];
    const h10 = heights[r0 * gridSize + (c0 + 1)];
    const h01 = heights[(r0 + 1) * gridSize + c0];
    const h11 = heights[(r0 + 1) * gridSize + (c0 + 1)];

    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  };

  return {
    gridSize,
    heights,
    utmOriginE: e0,
    utmOriginN: n0,
    stockpiles: footprints,
    defaultProfileA: { x0: -170, z0: 0, x1: 170, z1: 0 },
    defaultProfileB: { x0: 0, z0: -170, x1: 0, z1: 170 },
    sampleElevationAt,
    worldToUtm,
  };
}

export function extractContours(
  terrain: QuarryTerrainData,
  intervalM: 1 | 5 | 2 = 2
): ContourSegment[] {
  const { gridSize, heights } = terrain;
  const segments: ContourSegment[] = [];
  const step = TERRAIN_SPAN_M / (gridSize - 1);

  for (let level = ELEV_MIN_M + intervalM; level < ELEV_MAX_M; level += intervalM) {
    const isMaster = level % 5 === 0;
    for (let r = 0; r < gridSize - 1; r++) {
      const z0 = -TERRAIN_HALF_M + r * step;
      const z1 = z0 + step;
      for (let c = 0; c < gridSize - 1; c++) {
        const x0 = -TERRAIN_HALF_M + c * step;
        const x1 = x0 + step;

        const v00 = heights[r * gridSize + c];
        const v10 = heights[r * gridSize + c + 1];
        const v11 = heights[(r + 1) * gridSize + c + 1];
        const v01 = heights[(r + 1) * gridSize + c];

        const idx =
          (v00 >= level ? 8 : 0) |
          (v10 >= level ? 4 : 0) |
          (v11 >= level ? 2 : 0) |
          (v01 >= level ? 1 : 0);

        if (idx === 0 || idx === 15) continue;

        const interp = (va: number, vb: number) =>
          Math.abs(vb - va) < 1e-5 ? 0.5 : (level - va) / (vb - va);

        const top = () => ({ x: x0 + interp(v00, v10) * step, z: z0 });
        const right = () => ({ x: x1, z: z0 + interp(v10, v11) * step });
        const bottom = () => ({ x: x0 + interp(v01, v11) * step, z: z1 });
        const left = () => ({ x: x0, z: z0 + interp(v00, v01) * step });

        const pushSeg = (p: { x: number; z: number }, q: { x: number; z: number }) => {
          segments.push({
            x1: p.x,
            z1: p.z,
            x2: q.x,
            z2: q.z,
            elevationM: level,
            isMaster,
          });
        };

        switch (idx) {
          case 1:
          case 14:
            pushSeg(left(), bottom());
            break;
          case 2:
          case 13:
            pushSeg(bottom(), right());
            break;
          case 3:
          case 12:
            pushSeg(left(), right());
            break;
          case 4:
          case 11:
            pushSeg(top(), right());
            break;
          case 5:
            pushSeg(left(), top());
            pushSeg(bottom(), right());
            break;
          case 6:
          case 9:
            pushSeg(top(), bottom());
            break;
          case 7:
          case 8:
            pushSeg(left(), top());
            break;
          case 10:
            pushSeg(top(), right());
            pushSeg(left(), bottom());
            break;
        }
      }
    }
  }

  return segments;
}

export function sampleProfileLine(
  terrain: QuarryTerrainData,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  sampleCount = 120
): ProfileSample[] {
  const totalDist = Math.hypot(x1 - x0, z1 - z0);
  const out: ProfileSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const wx = x0 + (x1 - x0) * t;
    const wz = z0 + (z1 - z0) * t;
    const elev = terrain.sampleElevationAt(wx, wz);
    const utm = terrain.worldToUtm(wx, wz);
    out.push({
      distanceM: Math.round(t * totalDist * 10) / 10,
      elevationM: Math.round(elev * 100) / 100,
      worldX: wx,
      worldZ: wz,
      easting: utm.easting,
      northing: utm.northing,
    });
  }
  return out;
}

export function renderOrthophotoCanvas(terrain: QuarryTerrainData, size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let py = 0; py < size; py++) {
    const wz = -TERRAIN_HALF_M + (py / (size - 1)) * TERRAIN_SPAN_M;
    for (let px = 0; px < size; px++) {
      const wx = -TERRAIN_HALF_M + (px / (size - 1)) * TERRAIN_SPAN_M;
      const elev = terrain.sampleElevationAt(wx, wz);
      const ex = terrain.sampleElevationAt(Math.min(TERRAIN_HALF_M, wx + 2.5), wz);
      const ez = terrain.sampleElevationAt(wx, Math.min(TERRAIN_HALF_M, wz + 2.5));

      const slopeX = (ex - elev) / 2.5;
      const slopeZ = (ez - elev) / 2.5;
      const slopeMag = Math.hypot(slopeX, slopeZ);
      const hillshade = Math.max(0.58, Math.min(1.18, 0.92 - slopeX * 0.25 - slopeZ * 0.2));

      const grain = hash2D(px * 0.9, py * 0.9, 13) * 18 - 9;
      const patch = fbm(wx * 0.04, wz * 0.04, 41);

      let r = 165;
      let g = 158;
      let b = 144;

      if (elev > 748.5) {
        // Outer Mediterranean scrub & topsoil rim
        const veg = smoothstep(0.45, 0.72, patch);
        r = 122 * (1 - veg) + 78 * veg;
        g = 116 * (1 - veg) + 98 * veg;
        b = 88 * (1 - veg) + 60 * veg;
      } else if (slopeMag > 0.42) {
        // Steep limestone bench risers (stratified warm ochre/gray rock)
        r = 178 + patch * 22;
        g = 164 + patch * 18;
        b = 142 + patch * 14;
      } else {
        // Flat quarry working benches & crushed limestone floor
        r = 156 + patch * 18;
        g = 152 + patch * 16;
        b = 145 + patch * 14;
      }

      // Haul road track texture
      const ramp = evaluateHaulRampInfo(wx, wz);
      if (ramp.dist < 8.5) {
        const tire = Math.sin(ramp.dist * 1.4) * 6;
        r = 132 + tire;
        g = 130 + tire;
        b = 126 + tire;
        if (ramp.dist > 7.1) {
          // Safety berm highlight
          r += 24;
          g += 20;
          b += 14;
        }
      }

      // Stockpile material tinting
      for (let i = 0; i < terrain.stockpiles.length; i++) {
        const sp = terrain.stockpiles[i];
        const d = Math.hypot(wx - sp.worldX, wz - sp.worldZ);
        if (d < sp.radiusM * 0.98) {
          const matLower = sp.material.toLowerCase();
          if (matLower.includes('arena')) {
            r = 204;
            g = 184;
            b = 142;
          } else if (matLower.includes('zahorra')) {
            r = 146;
            g = 144;
            b = 138;
          } else if (matLower.includes('hormig')) {
            r = 162;
            g = 166;
            b = 170;
          } else {
            // Pale limestone gravel
            r = 194;
            g = 190;
            b = 182;
          }
          break;
        }
      }

      const idx = (py * size + px) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(r * hillshade + grain)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * hillshade + grain)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * hillshade + grain)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function renderHypsometryCanvas(terrain: QuarryTerrainData, size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let py = 0; py < size; py++) {
    const wz = -TERRAIN_HALF_M + (py / (size - 1)) * TERRAIN_SPAN_M;
    for (let px = 0; px < size; px++) {
      const wx = -TERRAIN_HALF_M + (px / (size - 1)) * TERRAIN_SPAN_M;
      const elev = terrain.sampleElevationAt(wx, wz);
      const ex = terrain.sampleElevationAt(Math.min(TERRAIN_HALF_M, wx + 2.5), wz);
      const ez = terrain.sampleElevationAt(wx, Math.min(TERRAIN_HALF_M, wz + 2.5));
      const slopeX = (ex - elev) / 2.5;
      const slopeZ = (ez - elev) / 2.5;
      const hillshade = Math.max(0.68, Math.min(1.15, 0.95 - slopeX * 0.22 - slopeZ * 0.18));

      const [r, g, b] = hypsometricColorRgb(elev);
      const idx = (py * size + px) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(r * hillshade)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * hillshade)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * hillshade)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
