import type { ProfileSample } from './quarryTerrainModel.ts';

export interface ProfileDxfExportOptions {
  profileLabel: string;
  quarryName: string;
  flightCode?: string;
  flightDate?: string;
}

/**
 * Normalizes text for maximum compatibility across AutoCAD R12, Civil 3D, LibreCAD, and QGIS.
 */
function sanitizeDxfText(input: string): string {
  return input
    .replace(/[–—]/g, '-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '|')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .trim();
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : '0.000';
}

function pickNiceStep(span: number, targetSteps: number): number {
  if (span <= 0) return 10;
  const raw = span / Math.max(1, targetSteps);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

class DxfWriter {
  private lines: string[] = [];

  pair(code: number, value: string | number) {
    this.lines.push(String(code), String(value));
  }

  addLine(
    layer: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    z1 = 0,
    z2 = 0
  ) {
    this.pair(0, 'LINE');
    this.pair(8, layer);
    this.pair(10, fmt(x1));
    this.pair(20, fmt(y1));
    this.pair(30, fmt(z1));
    this.pair(11, fmt(x2));
    this.pair(21, fmt(y2));
    this.pair(31, fmt(z2));
  }

  addPolyline2D(layer: string, pts: Array<{ x: number; y: number }>, closed = false) {
    if (pts.length < 2) return;
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(10, '0.000');
    this.pair(20, '0.000');
    this.pair(30, '0.000');
    this.pair(70, closed ? 1 : 0);
    for (const p of pts) {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.pair(10, fmt(p.x));
      this.pair(20, fmt(p.y));
      this.pair(30, '0.000');
    }
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
  }

  addPolyline3D(layer: string, pts: Array<{ x: number; y: number; z: number }>) {
    if (pts.length < 2) return;
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(10, '0.000');
    this.pair(20, '0.000');
    this.pair(30, '0.000');
    this.pair(70, 8); // 3D polyline flag
    for (const p of pts) {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.pair(10, fmt(p.x));
      this.pair(20, fmt(p.y));
      this.pair(30, fmt(p.z));
      this.pair(70, 32); // 3D polyline vertex flag
    }
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
  }

  addPoint(layer: string, x: number, y: number, z = 0) {
    this.pair(0, 'POINT');
    this.pair(8, layer);
    this.pair(10, fmt(x));
    this.pair(20, fmt(y));
    this.pair(30, fmt(z));
  }

  addText(
    layer: string,
    x: number,
    y: number,
    height: number,
    text: string,
    rotationDeg = 0,
    z = 0
  ) {
    const clean = sanitizeDxfText(text);
    if (!clean) return;
    this.pair(0, 'TEXT');
    this.pair(8, layer);
    this.pair(10, fmt(x));
    this.pair(20, fmt(y));
    this.pair(30, fmt(z));
    this.pair(40, fmt(Math.max(0.1, height)));
    if (rotationDeg !== 0) {
      this.pair(50, fmt(rotationDeg));
    }
    this.pair(1, clean);
  }

  toString(): string {
    return `${this.lines.join('\r\n')}\r\n`;
  }
}

function writeHeaderAndTables(
  w: DxfWriter,
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
  layers: Array<{ name: string; color: number; linetype: 'CONTINUOUS' | 'DASHED' }>
) {
  // HEADER (AutoCAD R12 AC1009, Metric)
  w.pair(0, 'SECTION');
  w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER');
  w.pair(1, 'AC1009');
  w.pair(9, '$MEASUREMENT');
  w.pair(70, 1);
  w.pair(9, '$EXTMIN');
  w.pair(10, fmt(bounds.minX));
  w.pair(20, fmt(bounds.minY));
  w.pair(30, fmt(bounds.minZ));
  w.pair(9, '$EXTMAX');
  w.pair(10, fmt(bounds.maxX));
  w.pair(20, fmt(bounds.maxY));
  w.pair(30, fmt(bounds.maxZ));
  w.pair(0, 'ENDSEC');

  // TABLES (Linetypes + Layers)
  w.pair(0, 'SECTION');
  w.pair(2, 'TABLES');

  // LTYPE table
  w.pair(0, 'TABLE');
  w.pair(2, 'LTYPE');
  w.pair(70, 2);

  w.pair(0, 'LTYPE');
  w.pair(2, 'CONTINUOUS');
  w.pair(70, 0);
  w.pair(3, 'Solid line');
  w.pair(72, 65);
  w.pair(73, 0);
  w.pair(40, '0.0');

  w.pair(0, 'LTYPE');
  w.pair(2, 'DASHED');
  w.pair(70, 0);
  w.pair(3, 'Dashed __ __ __');
  w.pair(72, 65);
  w.pair(73, 2);
  w.pair(40, '3.0');
  w.pair(49, '2.0');
  w.pair(49, '-1.0');

  w.pair(0, 'ENDTAB');

  // LAYER table
  w.pair(0, 'TABLE');
  w.pair(2, 'LAYER');
  w.pair(70, layers.length);
  for (const layer of layers) {
    w.pair(0, 'LAYER');
    w.pair(2, layer.name);
    w.pair(70, 0);
    w.pair(62, layer.color);
    w.pair(6, layer.linetype);
  }
  w.pair(0, 'ENDTAB');

  w.pair(0, 'ENDSEC');
}

function triggerDxfDownload(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'application/dxf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildSafeFileSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates and downloads a 2D Topographic Longitudinal Profile DXF (1:1 metric scale)
 * with terrain polyline, horizontal datum, elevation/distance grid, guitar data band,
 * and header metadata block.
 */
export function exportProfile2DDxf(
  samples: ProfileSample[],
  options: ProfileDxfExportOptions
): void {
  if (samples.length < 2) return;

  const maxDist = Math.max(1, samples[samples.length - 1].distanceM);
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (const s of samples) {
    if (s.elevationM < minElev) minElev = s.elevationM;
    if (s.elevationM > maxElev) maxElev = s.elevationM;
  }

  const elevSpan = Math.max(5, maxElev - minElev);
  const zStep = pickNiceStep(elevSpan, 5);
  const xStep = pickNiceStep(maxDist, 8);

  const datumZ = Math.floor((minElev - zStep * 0.5) / zStep) * zStep;
  const topGridZ = Math.ceil((maxElev + zStep * 0.5) / zStep) * zStep;
  const chartHeight = Math.max(10, topGridZ - datumZ);

  // Proportional CAD text & guitar band heights
  const scaleRef = Math.max(maxDist * 0.018, chartHeight * 0.045, 1.2);
  const textH = Math.min(scaleRef, maxDist * 0.028);
  const bandH = textH * 3.4;
  const labelColW = Math.max(maxDist * 0.14, textH * 11);

  const yRowElevTop = datumZ;
  const yRowElevBot = datumZ - bandH;
  const yRowDistBot = yRowElevBot - bandH;
  const yTitle = topGridZ + textH * 3.6;

  const w = new DxfWriter();
  writeHeaderAndTables(
    w,
    {
      minX: -labelColW - textH * 2,
      minY: yRowDistBot - textH * 2,
      minZ: 0,
      maxX: maxDist + textH * 4,
      maxY: yTitle + textH * 3,
      maxZ: 0,
    },
    [
      { name: 'PERFIL_TERRENO', color: 1, linetype: 'CONTINUOUS' },
      { name: 'PLANO_COMPARACION', color: 5, linetype: 'CONTINUOUS' },
      { name: 'REJILLA', color: 8, linetype: 'DASHED' },
      { name: 'GUITARRA_DATOS', color: 7, linetype: 'CONTINUOUS' },
      { name: 'TEXTOS_Y_ROTULO', color: 7, linetype: 'CONTINUOUS' },
    ]
  );

  w.pair(0, 'SECTION');
  w.pair(2, 'ENTITIES');

  // 1. Main Terrain Profile 2D Polyline (X = distanceM, Y = elevationM)
  w.addPolyline2D(
    'PERFIL_TERRENO',
    samples.map((s) => ({ x: s.distanceM, y: s.elevationM }))
  );

  // 2. Horizontal Datum Baseline & Bounding Verticals
  w.addLine('PLANO_COMPARACION', -labelColW, datumZ, maxDist, datumZ);
  w.addLine('PLANO_COMPARACION', 0, datumZ, 0, samples[0].elevationM);
  w.addLine(
    'PLANO_COMPARACION',
    maxDist,
    datumZ,
    maxDist,
    samples[samples.length - 1].elevationM
  );
  w.addText(
    'TEXTOS_Y_ROTULO',
    -labelColW + textH * 0.4,
    datumZ + textH * 0.4,
    textH * 0.85,
    `P.C. ${datumZ.toFixed(1)} m`
  );

  // 3. Horizontal Elevation Grid Lines
  for (let z = datumZ + zStep; z <= topGridZ + 1e-6; z += zStep) {
    w.addLine('REJILLA', 0, z, maxDist, z);
    w.addText(
      'TEXTOS_Y_ROTULO',
      -textH * 5.2,
      z - textH * 0.35,
      textH * 0.78,
      `${z.toFixed(1)}`
    );
  }

  // 4. Guitar Data Band Frame (Cota Terreno + Distancia Parcial/Origen)
  w.addLine('GUITARRA_DATOS', -labelColW, yRowElevBot, maxDist, yRowElevBot);
  w.addLine('GUITARRA_DATOS', -labelColW, yRowDistBot, maxDist, yRowDistBot);
  w.addLine('GUITARRA_DATOS', -labelColW, yRowElevTop, -labelColW, yRowDistBot);
  w.addLine('GUITARRA_DATOS', 0, yRowElevTop, 0, yRowDistBot);
  w.addLine('GUITARRA_DATOS', maxDist, yRowElevTop, maxDist, yRowDistBot);

  w.addText(
    'TEXTOS_Y_ROTULO',
    -labelColW + textH * 0.4,
    yRowElevBot + bandH * 0.35,
    textH * 0.78,
    'COTA Z (m)'
  );
  w.addText(
    'TEXTOS_Y_ROTULO',
    -labelColW + textH * 0.4,
    yRowDistBot + bandH * 0.35,
    textH * 0.78,
    'DIST. (m)'
  );

  // Interpolate elevation at any station distance along samples
  const sampleElevAtDist = (dist: number): number => {
    if (dist <= samples[0].distanceM) return samples[0].elevationM;
    if (dist >= samples[samples.length - 1].distanceM) return samples[samples.length - 1].elevationM;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (dist >= a.distanceM && dist <= b.distanceM) {
        const span = Math.max(1e-6, b.distanceM - a.distanceM);
        const t = (dist - a.distanceM) / span;
        return a.elevationM + t * (b.elevationM - a.elevationM);
      }
    }
    return samples[samples.length - 1].elevationM;
  };

  // Station ordinates & guitar text labels
  const stationDistances: number[] = [];
  for (let d = 0; d < maxDist - xStep * 0.25; d += xStep) {
    stationDistances.push(d);
  }
  stationDistances.push(maxDist);

  for (const d of stationDistances) {
    const elev = sampleElevAtDist(d);
    if (d > 0 && d < maxDist) {
      w.addLine('REJILLA', d, datumZ, d, elev);
      w.addLine('GUITARRA_DATOS', d, yRowElevTop, d, yRowDistBot);
    }
    w.addText(
      'TEXTOS_Y_ROTULO',
      d + textH * 0.35,
      yRowElevBot + bandH * 0.2,
      textH * 0.72,
      elev.toFixed(2),
      90
    );
    w.addText(
      'TEXTOS_Y_ROTULO',
      d + textH * 0.35,
      yRowDistBot + bandH * 0.2,
      textH * 0.72,
      d.toFixed(1),
      90
    );
  }

  // 5. Title & Technical Metadata Header
  const first = samples[0];
  const last = samples[samples.length - 1];
  const deltaZ = maxElev - minElev;
  const flightMeta = [options.flightCode, options.flightDate].filter(Boolean).join(' - ');

  w.addText(
    'TEXTOS_Y_ROTULO',
    0,
    yTitle,
    textH * 1.15,
    `${options.profileLabel} | ${options.quarryName}${flightMeta ? ` (${flightMeta})` : ''}`
  );
  w.addText(
    'TEXTOS_Y_ROTULO',
    0,
    yTitle - textH * 1.7,
    textH * 0.78,
    `Longitud: ${maxDist.toFixed(1)} m | Z min: ${minElev.toFixed(2)} m | Z max: ${maxElev.toFixed(2)} m | Desnivel: ${deltaZ.toFixed(2)} m | Escala 1:1 (m)`
  );
  w.addText(
    'TEXTOS_Y_ROTULO',
    0,
    yTitle - textH * 3.0,
    textH * 0.7,
    `Inicio UTM: E ${first.easting.toFixed(2)} N ${first.northing.toFixed(2)} | Fin UTM: E ${last.easting.toFixed(2)} N ${last.northing.toFixed(2)}`
  );

  w.pair(0, 'ENDSEC');
  w.pair(0, 'EOF');

  const slugQuarry = buildSafeFileSlug(options.quarryName || 'explotacion');
  const slugProf = buildSafeFileSlug(options.profileLabel || 'perfil');
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerDxfDownload(w.toString(), `perfil-2d-${slugProf}-${slugQuarry}-${dateTag}.dxf`);
}

/**
 * Generates and downloads a georeferenced 3D Polyline DXF in UTM coordinates
 * (X = Easting, Y = Northing, Z = Elevation m) ready for AutoCAD Civil 3D, QGIS, or Global Mapper.
 */
export function exportProfile3DDxf(
  samples: ProfileSample[],
  options: ProfileDxfExportOptions
): void {
  if (samples.length < 2) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const s of samples) {
    if (s.easting < minX) minX = s.easting;
    if (s.easting > maxX) maxX = s.easting;
    if (s.northing < minY) minY = s.northing;
    if (s.northing > maxY) maxY = s.northing;
    if (s.elevationM < minZ) minZ = s.elevationM;
    if (s.elevationM > maxZ) maxZ = s.elevationM;
  }

  const w = new DxfWriter();
  writeHeaderAndTables(
    w,
    { minX, minY, minZ, maxX, maxY, maxZ },
    [
      { name: 'PERFIL_3D_UTM', color: 1, linetype: 'CONTINUOUS' },
      { name: 'VERTICES_PERFIL', color: 3, linetype: 'CONTINUOUS' },
      { name: 'TEXTOS_PERFIL', color: 7, linetype: 'CONTINUOUS' },
    ]
  );

  w.pair(0, 'SECTION');
  w.pair(2, 'ENTITIES');

  w.addPolyline3D(
    'PERFIL_3D_UTM',
    samples.map((s) => ({ x: s.easting, y: s.northing, z: s.elevationM }))
  );

  const first = samples[0];
  const last = samples[samples.length - 1];
  const span = Math.max(10, Math.hypot(maxX - minX, maxY - minY));
  const txtH = Math.max(1.2, span * 0.025);

  w.addPoint('VERTICES_PERFIL', first.easting, first.northing, first.elevationM);
  w.addPoint('VERTICES_PERFIL', last.easting, last.northing, last.elevationM);

  w.addText(
    'TEXTOS_PERFIL',
    first.easting + txtH * 0.5,
    first.northing + txtH * 0.5,
    txtH,
    `INICIO ${options.profileLabel} (Z=${first.elevationM.toFixed(2)}m)`,
    0,
    first.elevationM
  );
  w.addText(
    'TEXTOS_PERFIL',
    last.easting + txtH * 0.5,
    last.northing + txtH * 0.5,
    txtH,
    `FIN ${options.profileLabel} (Z=${last.elevationM.toFixed(2)}m)`,
    0,
    last.elevationM
  );

  w.pair(0, 'ENDSEC');
  w.pair(0, 'EOF');

  const slugQuarry = buildSafeFileSlug(options.quarryName || 'explotacion');
  const slugProf = buildSafeFileSlug(options.profileLabel || 'perfil');
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerDxfDownload(w.toString(), `perfil-3d-utm-${slugProf}-${slugQuarry}-${dateTag}.dxf`);
}
