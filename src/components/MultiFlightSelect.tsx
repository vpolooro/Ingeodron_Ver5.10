import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plane, RotateCcw } from 'lucide-react';
import { Survey, Zone } from '../types.ts';
import { formatDateEu } from '../utils/dateUtils.ts';

export interface FlightFilterPreset {
  value: string;
  label: string;
}

interface MultiFlightSelectProps {
  flights: Survey[];
  zones: Zone[];
  mode: string;
  customModeValue?: string;
  selectedFlightIds: number[];
  presets: FlightFilterPreset[];
  onSelectPreset: (presetValue: string) => void;
  onToggleFlight: (flightId: number) => void;
  onSelectSingle?: (flightId: number) => void;
  onClear?: () => void;
  clearLabel?: string;
  clearTitle?: string;
  showStatusIndicator?: boolean;
  variant?: 'default' | 'header';
  align?: 'left' | 'right';
  disabled?: boolean;
  emptyLabel?: string;
  title?: string;
}

export const MultiFlightSelect: React.FC<MultiFlightSelectProps> = ({
  flights,
  zones,
  mode,
  customModeValue = 'custom_flights',
  selectedFlightIds,
  presets,
  onSelectPreset,
  onToggleFlight,
  onSelectSingle,
  onClear,
  clearLabel = 'Limpiar',
  clearTitle = 'Limpiar selección y seleccionar el primer vuelo del listado',
  showStatusIndicator = true,
  variant = 'default',
  align = 'left',
  disabled = false,
  emptyLabel = 'Sin vuelos registrados',
  title,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  const summaryLabel = useMemo(() => {
    if (flights.length === 0) return emptyLabel;
    if (mode === customModeValue && selectedFlightIds.length > 0) {
      const selected = flights.filter((f) => selectedFlightIds.includes(f.id));
      if (selected.length === 1) {
        const f = selected[0];
        if (variant === 'header') {
          return `${f.flightCode} (${formatDateEu(f.surveyDate)})`;
        }
        const z = zoneById.get(f.zoneId);
        return `${f.flightCode} (${formatDateEu(f.surveyDate)})${z ? ` · ${z.code}` : ''}`;
      }
      if (selected.length > 1) {
        const preview = selected
          .slice(0, 2)
          .map((f) => f.flightCode)
          .join(', ');
        return `${selected.length} vuelos (${preview}${selected.length > 2 ? '…' : ''})`;
      }
    }
    return presets.find((p) => p.value === mode)?.label || presets[0]?.label || 'Seleccionar vuelos';
  }, [mode, customModeValue, selectedFlightIds, flights, zoneById, presets, variant, emptyLabel]);

  const filteredFlights = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter((f) => {
      const z = zoneById.get(f.zoneId);
      return (
        f.flightCode.toLowerCase().includes(q) ||
        formatDateEu(f.surveyDate).toLowerCase().includes(q) ||
        (z?.name || '').toLowerCase().includes(q) ||
        (z?.code || '').toLowerCase().includes(q)
      );
    });
  }, [flights, query, zoneById]);

  const isCustomActive = mode === customModeValue && selectedFlightIds.length > 0;
  const isDefaultFirstSelected =
    isCustomActive &&
    selectedFlightIds.length === 1 &&
    flights.length > 0 &&
    selectedFlightIds[0] === flights[0].id;
  const isHeader = variant === 'header';

  return (
    <div
      ref={containerRef}
      className={isHeader ? 'relative flex-1 min-w-0' : 'relative inline-block'}
    >
      <button
        type="button"
        disabled={disabled || flights.length === 0}
        onClick={() => setOpen((prev) => !prev)}
        title={title}
        className={
          isHeader
            ? `w-full bg-transparent text-emerald-400 font-bold text-xs focus:outline-none cursor-pointer inline-flex items-center justify-between gap-1.5 min-w-0 lg:max-w-[220px] disabled:opacity-50 disabled:cursor-not-allowed`
            : `bg-[#111827] border rounded-lg px-2.5 py-1 text-[11px] font-medium outline-none transition cursor-pointer inline-flex items-center justify-between gap-2 min-w-[220px] max-w-[330px] disabled:opacity-50 disabled:cursor-not-allowed ${
                open || isCustomActive
                  ? 'border-cyan-500 text-white'
                  : 'border-gray-700 text-white hover:border-gray-500'
              }`
        }
        aria-expanded={open}
      >
        <span className="truncate">{summaryLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
            isHeader
              ? open
                ? 'rotate-180 text-emerald-300'
                : 'text-emerald-400/80'
              : open
                ? 'rotate-180 text-cyan-400'
                : 'text-gray-400'
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 z-50 w-80 max-w-[90vw] bg-[#0f1623] border border-gray-700 rounded-xl shadow-2xl p-2 space-y-2 text-[11px] ${
            align === 'right' ? 'left-0 sm:left-auto sm:right-0' : 'left-0'
          }`}
        >
          {/* Quick presets */}
          <div className="space-y-1">
            {presets.map((p) => {
              const active = mode === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    onSelectPreset(p.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer ${
                    active
                      ? 'bg-emerald-600/20 text-emerald-300 font-semibold border border-emerald-500/40'
                      : 'text-gray-300 hover:bg-gray-800/80 hover:text-white'
                  }`}
                >
                  <span className="truncate">{p.label}</span>
                  {active && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-800 pt-2 space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1">
                <Plane className="w-3 h-3 text-emerald-400" /> Uno o varios vuelos
              </span>
              {isCustomActive && (
                <span className="text-[10px] font-mono text-emerald-300 font-semibold">
                  {selectedFlightIds.length} sel.
                </span>
              )}
            </div>

            {flights.length > 6 && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar código, fecha o zona..."
                className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-gray-500 outline-none focus:border-emerald-500"
              />
            )}

            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
              {filteredFlights.length === 0 ? (
                <div className="text-center text-gray-500 py-3 text-[10px]">
                  No hay vuelos que coincidan.
                </div>
              ) : (
                filteredFlights.map((flight) => {
                  const isChecked = isCustomActive && selectedFlightIds.includes(flight.id);
                  const isSoleSelected = isChecked && selectedFlightIds.length === 1;
                  const fZone = zoneById.get(flight.zoneId);
                  const statusDot =
                    flight.status === 'active'
                      ? 'bg-emerald-400'
                      : flight.status === 'pending'
                        ? 'bg-amber-400'
                        : 'bg-gray-500';
                  return (
                    <div
                      key={`mfs-${flight.id}`}
                      className={`group w-full rounded-lg flex items-center gap-1 transition ${
                        isChecked
                          ? 'bg-emerald-600/15 text-white font-semibold'
                          : 'text-gray-300 hover:bg-gray-800/70 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleFlight(flight.id)}
                        className="flex-1 min-w-0 text-left px-2 py-1.5 flex items-center gap-2 cursor-pointer"
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-400 text-white'
                              : 'border-gray-600 bg-transparent'
                          }`}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5" />}
                        </span>
                        {showStatusIndicator && (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                        )}
                        <span className="font-mono truncate">{flight.flightCode}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          ({formatDateEu(flight.surveyDate)})
                        </span>
                        {fZone && (
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-cyan-300 font-mono shrink-0">
                            {fZone.code}
                          </span>
                        )}
                      </button>
                      {onSelectSingle && !isSoleSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSingle(flight.id);
                            setOpen(false);
                          }}
                          className="mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-800 hover:bg-emerald-600 text-gray-300 hover:text-white border border-gray-700 hover:border-emerald-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer shrink-0"
                          title={`Seleccionar únicamente el vuelo ${flight.flightCode}`}
                        >
                          Solo
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="border-t border-gray-800 pt-1.5 flex items-center justify-between gap-2">
            {onClear && flights.length > 0 ? (
              <button
                type="button"
                disabled={isDefaultFirstSelected}
                title={clearTitle}
                onClick={() => {
                  onClear();
                  setQuery('');
                  setOpen(false);
                }}
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                {clearLabel}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition cursor-pointer"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
