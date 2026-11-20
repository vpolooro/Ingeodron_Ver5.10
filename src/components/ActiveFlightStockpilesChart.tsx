import React, { useMemo, useState } from 'react';
import { BarChart3, Layers, Plane } from 'lucide-react';
import { Stockpile, Survey, Zone } from '../types.ts';
import { estimateStockpileAreaM2 } from '../utils/localDataStore.ts';
import { formatDateEu } from '../utils/dateUtils.ts';
import { formatEsInt, formatEsNumber } from '../utils/numberFormat.ts';

interface ActiveFlightStockpilesChartProps {
  activeFlight: Survey | undefined;
  isAllFlights?: boolean;
  surveysCount?: number;
  quarryLabel?: string;
  filterSummary?: string;
  surveys?: Survey[];
  stockpiles: Stockpile[];
  zones: Zone[];
  theme?: 'dark' | 'light';
}

type ChartMetric = 'volume' | 'tonnage' | 'area';

const STOCKPILE_PALETTE = [
  { hex: '#38bdf8', soft: '#0284c7', labelLight: '#0369a1', name: 'Azul Cielo' },
  { hex: '#10b981', soft: '#059669', labelLight: '#047857', name: 'Esmeralda' },
  { hex: '#f59e0b', soft: '#d97706', labelLight: '#b45309', name: 'Ámbar' },
  { hex: '#a855f7', soft: '#7e22ce', labelLight: '#6d28d9', name: 'Púrpura' },
  { hex: '#f43f5e', soft: '#e11d48', labelLight: '#be123c', name: 'Coral' },
  { hex: '#6366f1', soft: '#4f46e5', labelLight: '#4338ca', name: 'Índigo' },
  { hex: '#14b8a6', soft: '#0d9488', labelLight: '#0f766e', name: 'Turquesa' },
  { hex: '#fb923c', soft: '#ea580c', labelLight: '#c2410c', name: 'Naranja' },
  { hex: '#eab308', soft: '#ca8a04', labelLight: '#a16207', name: 'Dorado' },
  { hex: '#ec4899', soft: '#db2777', labelLight: '#be185d', name: 'Magenta' },
];

function computeNiceMax(rawMax: number): number {
  if (rawMax <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const fraction = rawMax / magnitude;
  let niceFraction = 10;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 1.2) niceFraction = 1.2;
  else if (fraction <= 1.5) niceFraction = 1.5;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 3) niceFraction = 3;
  else if (fraction <= 4) niceFraction = 4;
  else if (fraction <= 5) niceFraction = 5;
  else if (fraction <= 6) niceFraction = 6;
  else if (fraction <= 8) niceFraction = 8;
  return niceFraction * magnitude;
}

function formatAxisTick(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return Number.isInteger(k) ? `${formatEsInt(k)}k` : `${formatEsNumber(k, 1)}k`;
  }
  return formatEsInt(value);
}

function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

export const ActiveFlightStockpilesChart: React.FC<ActiveFlightStockpilesChartProps> = ({
  activeFlight,
  isAllFlights = false,
  surveysCount,
  quarryLabel,
  filterSummary,
  surveys = [],
  stockpiles,
  zones,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const desmonteStroke = isLight ? '#e11d48' : '#fb7185';
  const rellenoSwatch = isLight ? '#0284c7' : '#38bdf8';

  const [metric, setMetric] = useState<ChartMetric>('volume');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const hasFlightSelection = surveys.length > 0 || Boolean(activeFlight) || Boolean(isAllFlights);

  const zoneById = useMemo(() => {
    const map = new Map<number, Zone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  const surveyById = useMemo(() => {
    const map = new Map<number, Survey>();
    surveys.forEach((s) => map.set(s.id, s));
    return map;
  }, [surveys]);

  const representedSurveys = useMemo(() => {
    const seen = new Set<number>();
    const list: Survey[] = [];
    stockpiles.forEach((st) => {
      const s = surveyById.get(st.surveyId);
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        list.push(s);
      }
    });
    if (list.length === 0) return surveys;
    return list;
  }, [stockpiles, surveyById, surveys]);

  const representedZones = useMemo(() => {
    const seen = new Set<number>();
    const list: Zone[] = [];
    representedSurveys.forEach((s) => {
      const z = zoneById.get(s.zoneId);
      if (z && !seen.has(z.id)) {
        seen.add(z.id);
        list.push(z);
      }
    });
    if (list.length === 0) return zones;
    return list;
  }, [representedSurveys, zoneById, zones]);

  const singleFlight = representedSurveys.length === 1 ? representedSurveys[0] : activeFlight;
  const activeZone =
    representedZones.length === 1
      ? representedZones[0]
      : singleFlight
        ? zoneById.get(singleFlight.zoneId)
        : undefined;

  const chartItems = useMemo(() => {
    return stockpiles.map((st, idx) => {
      const color = STOCKPILE_PALETTE[idx % STOCKPILE_PALETTE.length];
      const fillM3 = Math.abs(st.fillVolumeM3 || 0);
      const cutM3 = Math.abs(st.cutVolumeM3 || 0);
      const volumeM3 = Math.abs(st.netVolumeM3);
      const tonnage = st.tonnageEst;
      const areaM2 = st.areaM2 ?? estimateStockpileAreaM2(st.fillVolumeM3, st.cutVolumeM3);

      const value = metric === 'volume' ? fillM3 : metric === 'tonnage' ? tonnage : areaM2;

      return {
        st,
        color,
        fillM3,
        cutM3,
        volumeM3,
        tonnage,
        areaM2,
        value,
      };
    });
  }, [stockpiles, metric]);

  const totalFillM3 = useMemo(
    () => chartItems.reduce((acc, item) => acc + item.fillM3, 0),
    [chartItems]
  );

  const totalCutM3 = useMemo(
    () => chartItems.reduce((acc, item) => acc + item.cutM3, 0),
    [chartItems]
  );

  const totalValue = useMemo(
    () => chartItems.reduce((acc, item) => acc + item.value, 0),
    [chartItems]
  );

  const rawMax = useMemo(
    () =>
      chartItems.reduce((max, item) => {
        if (metric === 'volume') {
          return Math.max(max, item.fillM3, item.cutM3);
        }
        return Math.max(max, item.value);
      }, 0),
    [chartItems, metric]
  );

  const niceMax = useMemo(() => computeNiceMax(rawMax), [rawMax]);

  const unitLabel = metric === 'volume' ? 'm³' : metric === 'tonnage' ? 't' : 'm²';
  const metricTitle =
    metric === 'volume'
      ? 'Relleno y Desmonte (+m³)'
      : metric === 'tonnage'
      ? 'Masa Estimada (t)'
      : 'Superficie (m²)';

  const formatMetricVal = (val: number) => {
    if (metric === 'tonnage') {
      return `${formatEsNumber(val, 1)} t`;
    }
    return `${formatEsInt(val)} ${unitLabel}`;
  };

  // SVG coordinate space (expands cleanly when viewing multiple flights/zones)
  const svgW = Math.max(860, chartItems.length * (metric === 'volume' ? 112 : 84));
  const svgH = 308;
  const padLeft = 62;
  const padRight = 24;
  const padTop = 34;
  const padBottom = 76;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const hoveredItem = hoveredIdx !== null ? chartItems[hoveredIdx] : null;
  const hoveredSurvey = hoveredItem ? surveyById.get(hoveredItem.st.surveyId) : undefined;
  const hoveredZone = hoveredSurvey ? zoneById.get(hoveredSurvey.zoneId) : undefined;

  const flightCountBadge = representedSurveys.length || surveysCount || surveys.length;

  return (
    <div className="glass-panel p-3.5 sm:p-5 rounded-xl border border-gray-800 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400 shrink-0" />
            Gráfica de Acopios por Acopio y Vuelo
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-400">
            {representedSurveys.length > 1 ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-semibold">
                  <Plane className="w-3 h-3" /> {flightCountBadge} vuelos ({representedSurveys.map((s) => s.flightCode).slice(0, 3).join(', ')}{representedSurveys.length > 3 ? '…' : ''})
                </span>
                {representedZones.length === 1 && activeZone ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0b0f17] border border-gray-800 text-cyan-300">
                    <Layers className="w-3 h-3" /> {activeZone.name}
                  </span>
                ) : representedZones.length > 1 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0b0f17] border border-gray-800 text-cyan-300">
                    <Layers className="w-3 h-3" /> {representedZones.length} zonas
                  </span>
                ) : quarryLabel ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0b0f17] border border-gray-800 text-cyan-300">
                    <Layers className="w-3 h-3" /> {quarryLabel}
                  </span>
                ) : null}
                <span>
                  • {chartItems.length} acopio{chartItems.length === 1 ? '' : 's'} • {metricTitle}
                </span>
              </>
            ) : singleFlight ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-semibold">
                  <Plane className="w-3 h-3" /> {singleFlight.flightCode} ({formatDateEu(singleFlight.surveyDate)})
                </span>
                {activeZone && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0b0f17] border border-gray-800 text-cyan-300">
                    <Layers className="w-3 h-3" /> {activeZone.name}
                  </span>
                )}
                <span>
                  • {chartItems.length} acopio{chartItems.length === 1 ? '' : 's'} • {metricTitle}
                </span>
              </>
            ) : (
              <span>{filterSummary || 'Selecciona vuelos o zonas en la tabla para visualizar sus acopios'}</span>
            )}
          </div>
        </div>

        {/* Metric Switcher */}
        <div className="grid grid-cols-3 sm:inline-flex items-center bg-[#0b0f17] p-1 rounded-lg border border-gray-800 text-[11px] sm:text-xs w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setMetric('volume')}
            className={`px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-md font-semibold transition cursor-pointer text-center ${
              metric === 'volume'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="sm:hidden">Vol. (m³)</span>
            <span className="hidden sm:inline">Relleno y Desmonte (m³)</span>
          </button>
          <button
            type="button"
            onClick={() => setMetric('tonnage')}
            className={`px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-md font-semibold transition cursor-pointer text-center ${
              metric === 'tonnage'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="sm:hidden">Ton. (t)</span>
            <span className="hidden sm:inline">Toneladas (t)</span>
          </button>
          <button
            type="button"
            onClick={() => setMetric('area')}
            className={`px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-md font-semibold transition cursor-pointer text-center ${
              metric === 'area'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="sm:hidden">Sup. (m²)</span>
            <span className="hidden sm:inline">Superficie (m²)</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas or Empty State */}
      {!hasFlightSelection || chartItems.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-400 border border-dashed border-gray-800 rounded-xl bg-[#0b0f17]/40">
          No hay acopios visibles en la tabla según los filtros de zona y vuelo seleccionados.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative bg-[#0b0f17]/75 border border-gray-800/90 rounded-xl p-3 sm:p-4">
            {/* Hover Detail & Series Key Strip */}
            <div className="min-h-[28px] mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] px-1">
              {hoveredItem ? (
                <div className="flex flex-wrap items-center gap-3 text-gray-200">
                  <span className="inline-flex items-center gap-1.5 font-bold text-white">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <rect
                        x="0.5"
                        y="0.5"
                        width="9"
                        height="9"
                        rx="2"
                        fill={isLight ? hoveredItem.color.soft : hoveredItem.color.hex}
                        stroke={isLight ? hoveredItem.color.labelLight : 'none'}
                        strokeWidth={isLight ? 0.75 : 0}
                      />
                    </svg>
                    {hoveredItem.st.name}
                    <span className="font-mono text-indigo-300 font-normal">({hoveredItem.st.code})</span>
                  </span>
                  {hoveredSurvey && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                      {hoveredSurvey.flightCode} ({formatDateEu(hoveredSurvey.surveyDate)})
                    </span>
                  )}
                  {hoveredZone && (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px]">
                      {hoveredZone.name}
                    </span>
                  )}
                  <span className="text-blue-400">{hoveredItem.st.material}</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    Relleno: {formatEsNumber(hoveredItem.fillM3)} m³
                  </span>
                  <span className="font-mono text-rose-400 font-semibold">
                    Desmonte: {formatEsNumber(hoveredItem.cutM3)} m³
                  </span>
                  <span className="font-mono text-amber-300">
                    {formatEsNumber(hoveredItem.st.densityTonM3 || 1.68, 2)} t/m³
                  </span>
                  <span className="font-mono text-cyan-300 font-bold">
                    {formatEsNumber(hoveredItem.tonnage, 1)} t
                  </span>
                  <span className="font-mono text-purple-300">
                    {formatEsNumber(hoveredItem.areaM2)} m²
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4 text-gray-400">
                  {metric === 'volume' ? (
                    <>
                      <span className="inline-flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                          <rect x="0" y="0" width="11" height="11" rx="2" fill={rellenoSwatch} />
                        </svg>
                        <span>
                          <strong className="text-gray-200">Relleno</strong> (barra sólida)
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                          <defs>
                            <pattern id="key-hatch" width="4" height="4" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                              <rect width="4" height="4" fill={desmonteStroke} fillOpacity={isLight ? '0.18' : '0.25'} />
                              <line x1="0" y1="0" x2="0" y2="4" stroke={desmonteStroke} strokeWidth="2" />
                            </pattern>
                          </defs>
                          <rect x="0.5" y="0.5" width="10" height="10" rx="2" fill="url(#key-hatch)" stroke={desmonteStroke} />
                        </svg>
                        <span>
                          <strong className="text-rose-300">Desmonte</strong> (en positivo, barra rayada)
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-500">
                      Pasa el cursor sobre cualquier barra para ver el detalle completo del acopio.
                    </span>
                  )}
                </div>
              )}

              <span className="font-mono text-gray-400">
                {metric === 'volume' ? (
                  <>
                    Rell: <strong className="text-emerald-300">{formatEsNumber(totalFillM3)} m³</strong>
                    {' · '}
                    Desm: <strong className="text-rose-300">{formatEsNumber(totalCutM3)} m³</strong>
                  </>
                ) : (
                  <>
                    Total tabla ({representedSurveys.length}{' '}
                    {representedSurveys.length === 1 ? 'vuelo' : 'vuelos'}):{' '}
                    <strong className="text-white">{formatMetricVal(totalValue)}</strong>
                  </>
                )}
              </span>
            </div>

            <div className="overflow-x-auto -mx-1 px-1">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className={`w-full h-auto max-h-[330px] select-none ${
                  chartItems.length > 10
                    ? 'min-w-[1150px]'
                    : chartItems.length > 7
                    ? 'min-w-[860px]'
                    : 'min-w-[540px] sm:min-w-0'
                }`}
                role="img"
                aria-label="Gráfica de barras de acopios y vuelos mostrados en la tabla"
              >
              <defs>
                {chartItems.map((item, idx) => (
                  <React.Fragment key={`defs-${item.st.id}`}>
                    <linearGradient
                      id={`stockpile-bar-grad-${idx}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={isLight ? item.color.soft : item.color.hex} stopOpacity="0.98" />
                      <stop offset="100%" stopColor={isLight ? item.color.labelLight : item.color.soft} stopOpacity={isLight ? '0.82' : '0.58'} />
                    </linearGradient>
                    <pattern
                      id={`stockpile-cut-hatch-${idx}`}
                      width="6"
                      height="6"
                      patternTransform="rotate(45 0 0)"
                      patternUnits="userSpaceOnUse"
                    >
                      <rect width="6" height="6" fill={isLight ? item.color.soft : item.color.hex} fillOpacity={isLight ? '0.2' : '0.22'} />
                      <line x1="0" y1="0" x2="0" y2="6" stroke={isLight ? item.color.soft : item.color.hex} strokeWidth="2.4" strokeOpacity={isLight ? '0.92' : '0.88'} />
                    </pattern>
                  </React.Fragment>
                ))}
              </defs>

              {/* Y-Axis Gridlines & Labels */}
              {yTicks.map((ratio) => {
                const tickVal = niceMax * ratio;
                const y = padTop + plotH - plotH * ratio;
                return (
                  <g key={`grid-${ratio}`}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgW - padRight}
                      y2={y}
                      stroke={ratio === 0 ? 'var(--chart-baseline)' : 'var(--chart-grid)'}
                      strokeWidth={ratio === 0 ? 1.5 : 1}
                      strokeDasharray={ratio === 0 ? undefined : '4 4'}
                    />
                    <text
                      x={padLeft - 10}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--chart-axis-text)"
                      fontSize="11"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {formatAxisTick(tickVal)}
                    </text>
                  </g>
                );
              })}

              {/* Bars */}
              {chartItems.map((item, idx) => {
                const slotW = plotW / chartItems.length;
                const centerX = padLeft + slotW * idx + slotW / 2;
                const isHovered = hoveredIdx === idx;
                const isDimmed = hoveredIdx !== null && hoveredIdx !== idx;
                const itemSurvey = surveyById.get(item.st.surveyId);

                if (metric === 'volume') {
                  const pairGap = Math.min(10, Math.max(4, slotW * 0.04));
                  const barW = Math.min(54, Math.max(20, (slotW * 0.56 - pairGap) / 2));
                  const fillBarX = centerX - pairGap / 2 - barW;
                  const cutBarX = centerX + pairGap / 2;
                  const fillCenterX = fillBarX + barW / 2;
                  const cutCenterX = cutBarX + barW / 2;

                  const rawFillH = niceMax > 0 ? (item.fillM3 / niceMax) * plotH : 0;
                  const fillBarH = item.fillM3 > 0 ? Math.max(6, rawFillH) : 2;
                  const fillBarY = padTop + plotH - fillBarH;

                  const rawCutH = niceMax > 0 ? (item.cutM3 / niceMax) * plotH : 0;
                  const cutBarH = item.cutM3 > 0 ? Math.max(8, rawCutH) : 2;
                  const cutBarY = padTop + plotH - cutBarH;

                  // Avoid label overlap if fill & cut are very close in height
                  const labelsCloseY = Math.abs(fillBarY - cutBarY) < 18 && slotW < 180;
                  const cutLabelY = labelsCloseY
                    ? Math.max(12, cutBarY - 20)
                    : Math.max(12, cutBarY - 8);

                  const showUnit = chartItems.length <= 4;
                  const fillLabel = showUnit
                    ? `${formatEsInt(item.fillM3)} m³`
                    : formatEsInt(item.fillM3);
                  const cutLabel = showUnit
                    ? `${formatEsInt(item.cutM3)} m³`
                    : formatEsInt(item.cutM3);

                  return (
                    <g
                      key={item.st.id}
                      className="cursor-pointer transition-opacity duration-200"
                      opacity={isDimmed ? 0.55 : 1}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => setHoveredIdx(isHovered ? null : idx)}
                    >
                      {isHovered && (
                        <rect
                          x={fillBarX - 8}
                          y={padTop}
                          width={barW * 2 + pairGap + 16}
                          height={plotH}
                          rx={8}
                          fill="var(--chart-hover-bg)"
                          fillOpacity="0.45"
                        />
                      )}

                      {/* Relleno Bar (solid acopio color gradient) */}
                      <rect
                        x={fillBarX}
                        y={fillBarY}
                        width={barW}
                        height={fillBarH}
                        rx={5}
                        fill={`url(#stockpile-bar-grad-${idx})`}
                        stroke={isLight ? item.color.soft : item.color.hex}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      {fillBarH >= 8 && (
                        <rect
                          x={fillBarX + 2}
                          y={fillBarY + 1}
                          width={Math.max(4, barW - 4)}
                          height={2.5}
                          rx={1.5}
                          fill="#ffffff"
                          fillOpacity={isHovered ? 0.65 : 0.35}
                        />
                      )}

                      {/* Desmonte Bar (positive upward, hatched pattern in acopio color + rose accent) */}
                      <rect
                        x={cutBarX}
                        y={cutBarY}
                        width={barW}
                        height={cutBarH}
                        rx={5}
                        fill={`url(#stockpile-cut-hatch-${idx})`}
                        stroke={desmonteStroke}
                        strokeWidth={isHovered ? 2 : 1.4}
                      />

                      {/* Value Labels */}
                      <text
                        x={fillCenterX}
                        y={Math.max(12, fillBarY - 8)}
                        textAnchor="middle"
                        fill={isHovered ? 'var(--chart-code-text)' : isLight ? item.color.labelLight : item.color.hex}
                        fontSize="10.5"
                        fontWeight="700"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {fillLabel}
                      </text>
                      <text
                        x={cutCenterX}
                        y={cutLabelY}
                        textAnchor="middle"
                        fill={isHovered ? 'var(--chart-code-text)' : 'var(--chart-cut-label)'}
                        fontSize="10.5"
                        fontWeight="700"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {cutLabel}
                      </text>

                      {/* Mini series tags right beneath baseline */}
                      <text
                        x={fillCenterX}
                        y={padTop + plotH + 13}
                        textAnchor="middle"
                        fill={isLight ? item.color.labelLight : item.color.hex}
                        fontSize="9"
                        fontWeight="700"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        Rell.
                      </text>
                      <text
                        x={cutCenterX}
                        y={padTop + plotH + 13}
                        textAnchor="middle"
                        fill="var(--chart-cut-label)"
                        fontSize="9"
                        fontWeight="700"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        Desm.
                      </text>

                      {/* X-axis Code */}
                      <text
                        x={centerX}
                        y={padTop + plotH + 29}
                        textAnchor="middle"
                        fill="var(--chart-code-text)"
                        fontSize="11"
                        fontWeight="700"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {truncateLabel(item.st.code, chartItems.length > 5 ? 11 : 16)}
                      </text>

                      {/* X-axis Stockpile Name */}
                      <text
                        x={centerX}
                        y={padTop + plotH + 44}
                        textAnchor="middle"
                        fill="var(--chart-axis-text)"
                        fontSize="10.5"
                      >
                        {truncateLabel(item.st.name, chartItems.length > 4 ? 16 : 26)}
                      </text>

                      {/* X-axis Flight Code */}
                      {itemSurvey && (
                        <text
                          x={centerX}
                          y={padTop + plotH + 60}
                          textAnchor="middle"
                          fill="var(--chart-flight-text)"
                          fontSize="9.5"
                          fontWeight="600"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {truncateLabel(itemSurvey.flightCode, chartItems.length > 5 ? 12 : 18)}
                        </text>
                      )}
                    </g>
                  );
                }

                // Single bar for Tonnage or Area mode
                const barW = Math.min(84, Math.max(28, slotW * 0.46));
                const barX = centerX - barW / 2;
                const rawH = niceMax > 0 ? (item.value / niceMax) * plotH : 0;
                const barH = item.value > 0 ? Math.max(6, rawH) : 2;
                const barY = padTop + plotH - barH;

                return (
                  <g
                    key={item.st.id}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={isDimmed ? 0.55 : 1}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => setHoveredIdx(isHovered ? null : idx)}
                  >
                    {isHovered && (
                      <rect
                        x={barX - 8}
                        y={padTop}
                        width={barW + 16}
                        height={plotH}
                        rx={8}
                        fill="var(--chart-hover-bg)"
                        fillOpacity="0.45"
                      />
                    )}

                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barH}
                      rx={6}
                      fill={`url(#stockpile-bar-grad-${idx})`}
                      stroke={isLight ? item.color.soft : item.color.hex}
                      strokeWidth={isHovered ? 2 : 1}
                    />

                    {barH >= 8 && (
                      <rect
                        x={barX + 2}
                        y={barY + 1}
                        width={Math.max(4, barW - 4)}
                        height={2.5}
                        rx={1.5}
                        fill="#ffffff"
                        fillOpacity={isHovered ? 0.65 : 0.35}
                      />
                    )}

                    <text
                      x={centerX}
                      y={Math.max(14, barY - 8)}
                      textAnchor="middle"
                      fill={isHovered ? 'var(--chart-code-text)' : isLight ? item.color.labelLight : item.color.hex}
                      fontSize="11.5"
                      fontWeight="700"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {formatMetricVal(item.value)}
                    </text>

                    <text
                      x={centerX}
                      y={padTop + plotH + 22}
                      textAnchor="middle"
                      fill="var(--chart-code-text)"
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {truncateLabel(item.st.code, chartItems.length > 5 ? 11 : 16)}
                    </text>

                    <text
                      x={centerX}
                      y={padTop + plotH + 38}
                      textAnchor="middle"
                      fill="var(--chart-axis-text)"
                      fontSize="10.5"
                    >
                      {truncateLabel(item.st.name, chartItems.length > 4 ? 16 : 26)}
                    </text>

                    {itemSurvey && (
                      <text
                        x={centerX}
                        y={padTop + plotH + 54}
                        textAnchor="middle"
                        fill="var(--chart-flight-text)"
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {truncateLabel(itemSurvey.flightCode, chartItems.length > 5 ? 12 : 18)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            </div>
          </div>

          {/* Per-Stockpile Color Legend */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {chartItems.map((item, idx) => {
              const sharePct = totalValue > 0 ? Math.round((item.value / totalValue) * 1000) / 10 : 0;
              const isHovered = hoveredIdx === idx;
              const itemSurvey = surveyById.get(item.st.surveyId);
              const itemZone = itemSurvey ? zoneById.get(itemSurvey.zoneId) : undefined;
              return (
                <div
                  key={`legend-${item.st.id}`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center justify-between gap-2.5 p-2.5 rounded-lg border transition cursor-default ${
                    isHovered
                      ? 'bg-gray-800/80 border-gray-600'
                      : 'bg-[#0b0f17]/70 border-gray-800/90 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" aria-hidden="true">
                      <rect
                        x="0.5"
                        y="0.5"
                        width="11"
                        height="11"
                        rx="2.5"
                        fill={isLight ? item.color.soft : item.color.hex}
                        stroke={isLight ? item.color.labelLight : 'none'}
                        strokeWidth={isLight ? 0.75 : 0}
                      />
                    </svg>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate" title={item.st.name}>
                        {item.st.name}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 truncate">
                        {item.st.code}
                        {itemSurvey ? ` • ${itemSurvey.flightCode}` : ''}
                        {itemZone ? ` • ${itemZone.code}` : ''}
                        {' • '}
                        {item.st.material}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {metric === 'volume' ? (
                      <>
                        <div className="text-[11px] font-mono font-bold text-emerald-300">
                          Rell: {formatEsNumber(item.fillM3)} m³
                        </div>
                        <div className="text-[10px] font-mono font-semibold text-rose-300">
                          Desm: {formatEsNumber(item.cutM3)} m³
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-mono font-bold text-white">
                          {formatMetricVal(item.value)}
                        </div>
                        <div className="text-[10px] font-mono text-gray-400">
                          {formatEsNumber(sharePct, 1)}%
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
