import React, { useEffect, useState } from 'react';
import {
  MATERIALS_UPDATED_EVENT,
  MaterialDensityEntry,
  formatMaterialDisplayName,
  getMaterialCategories,
  getMaterialDensityCatalog,
} from '../utils/materialDensities.ts';
import { formatEsNumber } from '../utils/numberFormat.ts';

interface MaterialDensitySelectorProps {
  density: number;
  materialName?: string;
  canUpdateMaterial?: boolean;
  onSelectDensity: (nextDensity: number, suggestedMaterial?: string) => void;
  onChangeCustomMaterial?: (customMaterial: string) => void;
}

const CUSTOM_MATERIAL_VALUE = '__custom__';

function findCatalogEntryByMaterial(
  catalog: readonly MaterialDensityEntry[],
  materialName?: string
): MaterialDensityEntry | undefined {
  if (!materialName) return undefined;
  const normalized = materialName.trim().toLowerCase();
  if (!normalized) return undefined;
  return catalog.find(
    (item) =>
      item.name.toLowerCase() === normalized ||
      (item.displayName && item.displayName.trim().toLowerCase() === normalized) ||
      formatMaterialDisplayName(item).toLowerCase() === normalized
  );
}

export const MaterialDensitySelector: React.FC<MaterialDensitySelectorProps> = ({
  density,
  materialName,
  canUpdateMaterial = false,
  onSelectDensity,
  onChangeCustomMaterial,
}) => {
  const [catalog, setCatalog] = useState<MaterialDensityEntry[]>(() => getMaterialDensityCatalog());

  useEffect(() => {
    const syncCatalog = () => setCatalog(getMaterialDensityCatalog());
    window.addEventListener(MATERIALS_UPDATED_EVENT, syncCatalog);
    window.addEventListener('storage', syncCatalog);
    return () => {
      window.removeEventListener(MATERIALS_UPDATED_EVENT, syncCatalog);
      window.removeEventListener('storage', syncCatalog);
    };
  }, []);

  const [selectedId, setSelectedId] = useState<string>(() => {
    const matched = findCatalogEntryByMaterial(catalog, materialName);
    if (matched) return matched.id;
    if (materialName && materialName.trim()) return CUSTOM_MATERIAL_VALUE;
    return '';
  });

  useEffect(() => {
    const matched = findCatalogEntryByMaterial(catalog, materialName);
    if (matched) {
      setSelectedId(matched.id);
    } else if (materialName && materialName.trim()) {
      setSelectedId(CUSTOM_MATERIAL_VALUE);
    }
  }, [catalog, materialName]);

  const categories = getMaterialCategories(catalog);
  const selectedEntry: MaterialDensityEntry | undefined = catalog.find(
    (item) => item.id === selectedId
  );

  const handleChooseMaterial = (nextId: string) => {
    setSelectedId(nextId);
    if (!nextId) return;

    if (nextId === CUSTOM_MATERIAL_VALUE) {
      if (canUpdateMaterial && onChangeCustomMaterial) {
        const currentIsCatalog = Boolean(findCatalogEntryByMaterial(catalog, materialName));
        if (currentIsCatalog || !materialName?.trim()) {
          onChangeCustomMaterial('Material personalizado');
        }
      }
      return;
    }

    const entry = catalog.find((item) => item.id === nextId);
    if (!entry) return;
    onSelectDensity(
      entry.defaultDensity,
      canUpdateMaterial ? formatMaterialDisplayName(entry) : undefined
    );
  };

  return (
    <div className="space-y-2 pt-1">
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">
          Tipo de material (lista de densidades de referencia o personalizado):
        </label>
        <select
          value={selectedId}
          onChange={(e) => handleChooseMaterial(e.target.value)}
          className="w-full bg-[#111827] border border-gray-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
        >
          <option value="">Seleccionar material y granulometría...</option>
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {catalog
                .filter((item) => item.category === category)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {(item.displayName && item.displayName.trim()) || item.name} ({formatEsNumber(item.minDensity, 2)} – {formatEsNumber(item.maxDensity, 2)} t/m³)
                  </option>
                ))}
            </optgroup>
          ))}
          <option value={CUSTOM_MATERIAL_VALUE}>Personalizado (especificar material y densidad)...</option>
        </select>
      </div>

      {selectedId === CUSTOM_MATERIAL_VALUE && (
        <div className="bg-[#111827]/90 border border-cyan-500/30 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-cyan-300">Material personalizado</span>
            <span className="text-[10px] text-gray-400">Nombre y densidad libres</span>
          </div>
          {canUpdateMaterial && onChangeCustomMaterial ? (
            <input
              type="text"
              value={materialName || ''}
              onChange={(e) => onChangeCustomMaterial(e.target.value)}
              placeholder="Escribe el nombre del material personalizado..."
              className="w-full bg-[#0b0f17] border border-gray-700 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
            />
          ) : (
            <p className="text-[11px] text-gray-400 leading-snug">
              Indica el nombre del material en el campo superior y ajusta su densidad en t/m³.
            </p>
          )}
        </div>
      )}

      {selectedEntry && (
        <div className="bg-[#111827]/90 border border-amber-500/30 rounded-lg p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-amber-300">
              {selectedEntry.category}: {selectedEntry.name}
            </span>
            <span className="font-mono text-gray-300">
              Rango: {formatEsNumber(selectedEntry.minDensity, 2)} – {formatEsNumber(selectedEntry.maxDensity, 2)} t/m³
            </span>
          </div>
          {selectedEntry.note && (
            <p className="text-[11px] text-gray-400 leading-snug">
              {selectedEntry.note}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-gray-400 mr-1">Aplicar densidad:</span>
            {[
              { label: 'Mín.', val: selectedEntry.minDensity },
              { label: 'Media', val: selectedEntry.defaultDensity },
              { label: 'Máx.', val: selectedEntry.maxDensity },
            ].map((opt) => {
              const isActive = Math.abs((density || 0) - opt.val) < 0.005;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() =>
                    onSelectDensity(
                      opt.val,
                      canUpdateMaterial ? formatMaterialDisplayName(selectedEntry) : undefined
                    )
                  }
                  className={`px-2 py-1 rounded border text-[11px] font-mono font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-[#0b0f17] border-gray-700 text-amber-300 hover:border-amber-400'
                  }`}
                >
                  {opt.label} {formatEsNumber(opt.val, 2)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
