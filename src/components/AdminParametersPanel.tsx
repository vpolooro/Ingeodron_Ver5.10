import React, { useEffect, useMemo, useState } from 'react';
import {
  Sliders,
  Plus,
  Edit,
  Trash2,
  Search,
  RotateCcw,
  X,
  CheckCircle,
  Layers,
  FileCode2,
} from 'lucide-react';
import {
  MATERIALS_UPDATED_EVENT,
  MaterialDensityEntry,
  deleteMaterialDensityEntry,
  formatDefaultMaterialDisplayName,
  formatMaterialDisplayName,
  getMaterialCategories,
  getMaterialDensityCatalog,
  resetMaterialDensityCatalog,
  upsertMaterialDensityEntry,
} from '../utils/materialDensities.ts';
import { formatEsNumber } from '../utils/numberFormat.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { FlightDxfManager } from './FlightDxfManager.tsx';
import type { Client, FlightDxfOverlay, Quarry, Stockpile, Survey, Zone } from '../types.ts';

interface AdminParametersPanelProps {
  onNotify: (title: string, msg: string, variant?: 'info' | 'success' | 'error') => void;
  clients?: Client[];
  quarries?: Quarry[];
  zones?: Zone[];
  surveys?: Survey[];
  stockpiles?: Stockpile[];
  dxfOverlays?: FlightDxfOverlay[];
  activeClient?: Client | null;
  activeQuarry?: Quarry | null;
  activeFlight?: Survey;
  onDxfOverlaySaved?: (overlay: FlightDxfOverlay) => void;
  onDxfOverlayDeleted?: (surveyId: number) => void;
  initialSection?: 'materials' | 'dxf';
}

const MATERIAL_COLOR_SWATCHES = [
  '#eab308',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#f43f5e',
  '#84cc16',
  '#10b981',
  '#3b82f6',
] as const;

interface MaterialFormState {
  id?: string;
  category: string;
  name: string;
  displayName: string;
  minDensity: string;
  defaultDensity: string;
  maxDensity: string;
  note: string;
  color: string;
}

const EMPTY_FORM: MaterialFormState = {
  category: 'Caliza',
  name: '',
  displayName: '',
  minDensity: '1.50',
  defaultDensity: '1.58',
  maxDensity: '1.65',
  note: '',
  color: '#eab308',
};

export const AdminParametersPanel: React.FC<AdminParametersPanelProps> = ({
  onNotify,
  clients = [],
  quarries = [],
  zones = [],
  surveys = [],
  stockpiles = [],
  dxfOverlays = [],
  activeClient = null,
  activeQuarry = null,
  activeFlight,
  onDxfOverlaySaved,
  onDxfOverlayDeleted,
  initialSection = 'materials',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'materials' | 'dxf'>(initialSection);
  useEffect(() => {
    setActiveSubTab(initialSection);
  }, [initialSection]);

  const [materials, setMaterials] = useState<MaterialDensityEntry[]>(() =>
    getMaterialDensityCatalog()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [showModal, setShowModal] = useState(false);
  const [formState, setFormState] = useState<MaterialFormState>(EMPTY_FORM);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    onConfirm: () => {},
  });

  useEffect(() => {
    const sync = () => setMaterials(getMaterialDensityCatalog());
    window.addEventListener(MATERIALS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MATERIALS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const syncServerMaterials = async (nextList: MaterialDensityEntry[]) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('ingeodron_token') : null;
      await fetch('/api/materials/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ materials: nextList }),
      });
    } catch {
      // Non-blocking when offline
    }
  };

  const categories = useMemo(() => getMaterialCategories(materials), [materials]);

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        formatMaterialDisplayName(item).toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q)
      );
    });
  }, [materials, searchQuery, categoryFilter]);

  const avgDensity = useMemo(() => {
    if (materials.length === 0) return 0;
    const sum = materials.reduce((acc, m) => acc + (m.defaultDensity || 0), 0);
    return sum / materials.length;
  }, [materials]);

  const handleOpenCreate = () => {
    setFormState({
      ...EMPTY_FORM,
      category: categoryFilter !== 'all' ? categoryFilter : categories[0] || 'Caliza',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (entry: MaterialDensityEntry) => {
    setFormState({
      id: entry.id,
      category: entry.category,
      name: entry.name,
      displayName: formatMaterialDisplayName(entry),
      minDensity: entry.minDensity.toFixed(2),
      defaultDensity: entry.defaultDensity.toFixed(2),
      maxDensity: entry.maxDensity.toFixed(2),
      note: entry.note,
      color: entry.color || '#eab308',
    });
    setShowModal(true);
  };

  const handleAutoMidpoint = () => {
    const minVal = parseFloat(formState.minDensity.replace(',', '.'));
    const maxVal = parseFloat(formState.maxDensity.replace(',', '.'));
    if (Number.isFinite(minVal) && Number.isFinite(maxVal) && maxVal >= minVal) {
      const mid = Math.round(((minVal + maxVal) / 2) * 100) / 100;
      setFormState((prev) => ({ ...prev, defaultDensity: mid.toFixed(2) }));
    }
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCategory = formState.category.trim();
    const cleanName = formState.name.trim();
    if (!cleanCategory || !cleanName) {
      onNotify(
        'Datos Incompletos',
        'Indica la categoría y el nombre del material antes de guardar.',
        'error'
      );
      return;
    }

    const minVal = parseFloat(formState.minDensity.replace(',', '.'));
    const maxVal = parseFloat(formState.maxDensity.replace(',', '.'));
    const defVal = parseFloat(formState.defaultDensity.replace(',', '.'));

    if (!Number.isFinite(minVal) || minVal <= 0 || !Number.isFinite(maxVal) || maxVal <= 0) {
      onNotify(
        'Densidades Inválidas',
        'Introduce valores numéricos positivos válidos para la densidad mínima y máxima.',
        'error'
      );
      return;
    }

    if (maxVal < minVal) {
      onNotify(
        'Rango Incorrecto',
        'La densidad máxima debe ser mayor o igual que la densidad mínima.',
        'error'
      );
      return;
    }

    const safeDefault =
      Number.isFinite(defVal) && defVal >= minVal && defVal <= maxVal
        ? defVal
        : Math.round(((minVal + maxVal) / 2) * 100) / 100;

    const cleanDisplayName = formState.displayName.trim();
    const autoDefaultDisplayName = formatDefaultMaterialDisplayName(cleanCategory, cleanName);

    const updatedList = upsertMaterialDensityEntry({
      id: formState.id,
      category: cleanCategory,
      name: cleanName,
      displayName:
        cleanDisplayName && cleanDisplayName !== autoDefaultDisplayName
          ? cleanDisplayName
          : undefined,
      minDensity: minVal,
      maxDensity: maxVal,
      defaultDensity: safeDefault,
      note: formState.note.trim(),
      color: formState.color || '#eab308',
    });

    setMaterials(updatedList);
    await syncServerMaterials(updatedList);
    setShowModal(false);

    onNotify(
      formState.id ? 'Material Actualizado' : 'Nuevo Material Creado',
      `${cleanCategory} · ${cleanName} (${formatEsNumber(minVal, 2)} – ${formatEsNumber(maxVal, 2)} t/m³) ya está disponible para los clientes.`,
      'success'
    );
  };

  const handleRequestDelete = (entry: MaterialDensityEntry) => {
    setConfirmState({
      open: true,
      title: 'Eliminar Material del Catálogo',
      message: `¿Eliminar "${entry.name}" (${entry.category}) del catálogo de densidades? Los acopios ya existentes mantendrán su valor actual, pero dejará de aparecer como opción para los clientes.`,
      confirmLabel: 'Eliminar material',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, open: false }));
        const updatedList = deleteMaterialDensityEntry(entry.id);
        setMaterials(updatedList);
        await syncServerMaterials(updatedList);
        onNotify(
          'Material Eliminado',
          `"${entry.name}" eliminado del catálogo de parámetros.`,
          'success'
        );
      },
    });
  };

  const handleRequestResetDefaults = () => {
    setConfirmState({
      open: true,
      title: 'Restaurar Catálogo de Materiales Base',
      message:
        '¿Restaurar los 23 materiales y densidades de referencia originales? Se perderán los materiales personalizados creados o modificados en esta tabla.',
      confirmLabel: 'Restaurar catálogo',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, open: false }));
        const restored = resetMaterialDensityCatalog();
        setMaterials(restored);
        await syncServerMaterials(restored);
        setCategoryFilter('all');
        setSearchQuery('');
        onNotify(
          'Catálogo Restaurado',
          'Se han restaurado los 23 materiales de referencia por defecto.',
          'success'
        );
      },
    });
  };

  return (
    <section className="space-y-5">
      {/* Selector de subsección en Configuración */}
      <div className="glass-panel p-2 rounded-2xl border border-gray-800 inline-flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSubTab('materials')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'materials'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Materiales y Densidades ({materials.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('dxf')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'dxf'
              ? 'bg-cyan-600 text-white shadow'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          <span>Perímetros DXF 3D por Vuelo ({dxfOverlays.length})</span>
        </button>
      </div>

      {activeSubTab === 'dxf' ? (
        <FlightDxfManager
          clients={clients}
          quarries={quarries}
          zones={zones}
          surveys={surveys}
          stockpiles={stockpiles}
          overlays={dxfOverlays}
          activeClient={activeClient}
          activeQuarry={activeQuarry}
          activeFlight={activeFlight}
          onOverlaySaved={(ov) => onDxfOverlaySaved?.(ov)}
          onOverlayDeleted={(sid) => onDxfOverlayDeleted?.(sid)}
          onNotify={onNotify}
        />
      ) : (
        <>
      {/* Cabecera y KPIs */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-gray-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>6. Configuración de Parámetros y Materiales</span>
            </h2>
            <p className="text-xs text-gray-400">
              Crea, edita o elimina materiales y rangos de densidad (t/m³). Todos los cambios quedan disponibles inmediatamente para que los clientes los elijan en sus acopios y visores 2D/3D.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRequestResetDefaults}
              className="px-3 py-2 bg-[#0b0f17] hover:bg-gray-800 text-gray-300 border border-gray-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              title="Restaurar los 23 materiales de referencia iniciales"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Restaurar Base</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Material</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
                Materiales Activos
              </span>
              <span className="text-lg font-extrabold text-white font-mono">
                {materials.length}
              </span>
            </div>
            <CheckCircle className="w-5 h-5 text-emerald-400/80" />
          </div>

          <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
                Categorías / Familias
              </span>
              <span className="text-lg font-extrabold text-cyan-300 font-mono">
                {categories.length}
              </span>
            </div>
            <Layers className="w-5 h-5 text-cyan-400/80" />
          </div>

          <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
                Densidad Media Catálogo
              </span>
              <span className="text-lg font-extrabold text-amber-300 font-mono">
                {formatEsNumber(avgDensity, 2)} t/m³
              </span>
            </div>
            <Sliders className="w-5 h-5 text-amber-400/80" />
          </div>
        </div>

        {/* Filtros y búsqueda */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar material, granulometría, categoría o nota técnica..."
              className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white outline-none cursor-pointer sm:w-64"
          >
            <option value="all">Todas las categorías ({materials.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({materials.filter((m) => m.category === cat).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla Desktop / Tarjetas Móvil */}
      <div className="glass-panel rounded-2xl border border-gray-800 overflow-hidden">
        {filteredMaterials.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-gray-300">
              No hay materiales que coincidan con el filtro aplicado.
            </p>
            <p className="text-xs text-gray-500">
              Prueba con otra búsqueda o pulsa «Nuevo Material» para añadir uno nuevo al catálogo.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-800">
              {filteredMaterials.map((item) => (
                <div key={item.id} className="p-3.5 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full mt-1 shrink-0 border border-white/20"
                        style={{ backgroundColor: item.color || '#eab308' }}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-white leading-snug">{item.name}</div>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[10px] text-blue-300 font-medium">
                          {item.category}
                        </span>
                        <div className="mt-1 text-[11px] text-cyan-300 font-medium">
                          Desplegable cliente: {formatMaterialDisplayName(item)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg transition cursor-pointer"
                        title="Editar material"
                        aria-label={`Editar ${item.name}`}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestDelete(item)}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition cursor-pointer"
                        title="Eliminar material"
                        aria-label={`Eliminar ${item.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-[#0b0f17]/70 border border-gray-800 rounded-lg p-2 font-mono text-[11px]">
                    <div>
                      <span className="block text-[9px] text-gray-400 font-sans uppercase">Mínima</span>
                      <span className="text-gray-200">{formatEsNumber(item.minDensity, 2)} t/m³</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-sans uppercase">Media</span>
                      <span className="text-amber-300 font-bold">
                        {formatEsNumber(item.defaultDensity, 2)} t/m³
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-sans uppercase">Máxima</span>
                      <span className="text-gray-200">{formatEsNumber(item.maxDensity, 2)} t/m³</span>
                    </div>
                  </div>

                  {item.note && <p className="text-[11px] text-gray-400">{item.note}</p>}
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0b0f17]/90 border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="p-3 font-semibold">Categoría</th>
                    <th className="p-3 font-semibold">Material / Granulometría</th>
                    <th className="p-3 font-semibold">Nombre en Desplegable Cliente</th>
                    <th className="p-3 font-semibold text-right">Mín. (t/m³)</th>
                    <th className="p-3 font-semibold text-right">Media (t/m³)</th>
                    <th className="p-3 font-semibold text-right">Máx. (t/m³)</th>
                    <th className="p-3 font-semibold">Observación / Nota Técnica</th>
                    <th className="p-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/80">
                  {filteredMaterials.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-800/35 transition">
                      <td className="p-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px] font-medium">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                            style={{ backgroundColor: item.color || '#eab308' }}
                          />
                          {item.category}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-white">{item.name}</td>
                      <td className="p-3">
                        <div className="text-cyan-300 font-medium">
                          {formatMaterialDisplayName(item)}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Opción: {(item.displayName && item.displayName.trim()) || item.name} ({formatEsNumber(item.minDensity, 2)} – {formatEsNumber(item.maxDensity, 2)} t/m³)
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-gray-300 whitespace-nowrap">
                        {formatEsNumber(item.minDensity, 2)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-300 whitespace-nowrap">
                        {formatEsNumber(item.defaultDensity, 2)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-300 whitespace-nowrap">
                        {formatEsNumber(item.maxDensity, 2)}
                      </td>
                      <td className="p-3 text-gray-400 max-w-xs">{item.note || '—'}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded border border-gray-700 text-[11px] font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            title="Editar material y densidades"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDelete(item)}
                            className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded border border-red-500/30 text-[11px] font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            title="Borrar material"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Borrar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal Crear / Editar Material */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <span>{formState.id ? 'Editar Material del Catálogo' : 'Nuevo Material de Catálogo'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">
                  Categoría / Familia:
                </label>
                <input
                  type="text"
                  required
                  list="ingeodron-material-categories"
                  value={formState.category}
                  onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                  placeholder="Ej. Caliza, Granito / Basalto, Árido reciclado..."
                  className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-lg p-2 text-white outline-none"
                />
                <datalist id="ingeodron-material-categories">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">
                  Nombre del Material y Granulometría:
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="Ej. Zahorra artificial ZA-25 (0–25 mm)"
                  className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-lg p-2 text-white outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-cyan-300 font-medium">
                    Nombre en Desplegable Cliente:
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormState((prev) => ({
                        ...prev,
                        displayName: formatDefaultMaterialDisplayName(prev.category, prev.name),
                      }))
                    }
                    className="text-[10px] text-gray-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    Generar automático
                  </button>
                </div>
                <input
                  type="text"
                  value={formState.displayName}
                  onChange={(e) => setFormState({ ...formState, displayName: e.target.value })}
                  placeholder={
                    formatDefaultMaterialDisplayName(formState.category, formState.name) ||
                    'Ej. Caliza — Zahorra artificial (0–25 mm)'
                  }
                  className="w-full bg-[#0b0f17] border border-cyan-500/40 focus:border-cyan-400 rounded-lg p-2 text-cyan-200 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Es el nombre que verá el cliente en el desplegable y el que se asignará al acopio (si se deja vacío, se genera con Categoría + Nombre).
                </p>
              </div>

              <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-semibold">Rango de Densidad (t/m³)</span>
                  <button
                    type="button"
                    onClick={handleAutoMidpoint}
                    className="text-[10px] text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                  >
                    Calcular media automática
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Mínima</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="10"
                      required
                      value={formState.minDensity}
                      onChange={(e) => setFormState({ ...formState, minDensity: e.target.value })}
                      className="w-full bg-[#111827] border border-gray-700 focus:border-amber-400 rounded-lg p-2 text-right text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-amber-300 font-semibold mb-1">
                      Media (defecto)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="10"
                      required
                      value={formState.defaultDensity}
                      onChange={(e) => setFormState({ ...formState, defaultDensity: e.target.value })}
                      className="w-full bg-[#111827] border border-amber-500/50 focus:border-amber-400 rounded-lg p-2 text-right text-amber-300 font-mono font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Máxima</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="10"
                      required
                      value={formState.maxDensity}
                      onChange={(e) => setFormState({ ...formState, maxDensity: e.target.value })}
                      className="w-full bg-[#111827] border border-gray-700 focus:border-amber-400 rounded-lg p-2 text-right text-white font-mono outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">
                  Color Identificador en Visor 2D / 3D:
                </label>
                <div className="flex items-center justify-between gap-2 bg-[#0b0f17] border border-gray-700 rounded-lg p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {MATERIAL_COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setFormState({ ...formState, color: hex })}
                        className={`w-5 h-5 rounded-full border transition cursor-pointer ${
                          formState.color.toLowerCase() === hex.toLowerCase()
                            ? 'border-white scale-110 ring-1 ring-white/60'
                            : 'border-gray-700 opacity-85 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={formState.color}
                    onChange={(e) => setFormState({ ...formState, color: e.target.value })}
                    className="w-7 h-7 rounded bg-transparent border border-gray-700 cursor-pointer p-0 shrink-0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">
                  Nota Técnica / Observación (opcional):
                </label>
                <input
                  type="text"
                  value={formState.note}
                  onChange={(e) => setFormState({ ...formState, note: e.target.value })}
                  placeholder="Ej. Curva continua, mayor compacidad con humedad..."
                  className="w-full bg-[#0b0f17] border border-gray-700 focus:border-emerald-500 rounded-lg p-2 text-white outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow cursor-pointer"
                >
                  {formState.id ? 'Guardar Cambios' : 'Crear Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant="danger"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />
        </>
      )}
    </section>
  );
};
