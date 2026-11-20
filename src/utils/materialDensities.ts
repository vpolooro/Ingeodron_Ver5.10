export interface MaterialDensityEntry {
  id: string;
  category: string;
  name: string;
  displayName?: string;
  minDensity: number;
  maxDensity: number;
  defaultDensity: number;
  note: string;
  color: string;
}

export const STORAGE_KEY_MATERIALS = 'ingeodron_materials_v1';
export const MATERIALS_UPDATED_EVENT = 'ingeodron-materials-updated';

export const MATERIAL_DENSITY_CATEGORIES: readonly string[] = [
  'Caliza',
  'Granito / Basalto',
  'Grava (canto rodado)',
  'Arena',
  'Arcilla',
  'Tierra vegetal / Estéril',
] as const;

export const MATERIAL_DENSITY_CATALOG: readonly MaterialDensityEntry[] = [
  // Caliza
  {
    id: 'caliza-polvo-arena',
    category: 'Caliza',
    name: 'Polvo / Arena caliza (0–4 mm)',
    minDensity: 1.50,
    maxDensity: 1.65,
    defaultDensity: 1.58,
    note: 'Mayor compacidad si tiene humedad',
    color: '#eab308',
  },
  {
    id: 'caliza-gravilla-garbancillo',
    category: 'Caliza',
    name: 'Gravilla / Garbancillo (4–12 / 6–12 mm)',
    minDensity: 1.40,
    maxDensity: 1.50,
    defaultDensity: 1.45,
    note: 'Granulometría abierta, muchos huecos',
    color: '#eab308',
  },
  {
    id: 'caliza-grava-gruesa',
    category: 'Caliza',
    name: 'Grava gruesa (12–20 / 20–40 mm)',
    minDensity: 1.42,
    maxDensity: 1.55,
    defaultDensity: 1.49,
    note: 'Acopio drenado',
    color: '#eab308',
  },
  {
    id: 'caliza-zahorra-artificial',
    category: 'Caliza',
    name: 'Zahorra artificial (0–20 / 0–32 mm)',
    minDensity: 1.65,
    maxDensity: 1.85,
    defaultDensity: 1.75,
    note: 'Curva continua (finos rellenan huecos)',
    color: '#eab308',
  },
  {
    id: 'caliza-escollera-todo-uno',
    category: 'Caliza',
    name: 'Escollera / Todo-uno voladura (> 100 mm)',
    minDensity: 1.45,
    maxDensity: 1.60,
    defaultDensity: 1.53,
    note: 'Depende mucho de la forma del bloque',
    color: '#eab308',
  },

  // Granito / Basalto
  {
    id: 'granito-arena-triturada',
    category: 'Granito / Basalto',
    name: 'Arena triturada (0–4 / 0–5 mm)',
    minDensity: 1.55,
    maxDensity: 1.70,
    defaultDensity: 1.63,
    note: 'El basalto tiende al rango superior',
    color: '#8b5cf6',
  },
  {
    id: 'granito-gravilla-balasto-fino',
    category: 'Granito / Basalto',
    name: 'Gravilla / Balasto fino (6–12 / 12–20 mm)',
    minDensity: 1.45,
    maxDensity: 1.60,
    defaultDensity: 1.53,
    note: 'Fracción limpia (sin finos)',
    color: '#8b5cf6',
  },
  {
    id: 'granito-balasto-ferroviario',
    category: 'Granito / Basalto',
    name: 'Balasto ferroviario (31,5–50 mm)',
    minDensity: 1.48,
    maxDensity: 1.62,
    defaultDensity: 1.55,
    note: 'Alta porosidad intergranular',
    color: '#8b5cf6',
  },
  {
    id: 'granito-zahorra-todo-uno',
    category: 'Granito / Basalto',
    name: 'Zahorra / Todo-uno chancado (0–32 mm)',
    minDensity: 1.70,
    maxDensity: 1.90,
    defaultDensity: 1.80,
    note: 'Máxima densidad en acopio suelto',
    color: '#8b5cf6',
  },
  {
    id: 'granito-bloques-escollera',
    category: 'Granito / Basalto',
    name: 'Bloques / Escollera (> 150 mm)',
    minDensity: 1.55,
    maxDensity: 1.75,
    defaultDensity: 1.65,
    note: 'Roca dura fracturada',
    color: '#8b5cf6',
  },

  // Grava (canto rodado)
  {
    id: 'grava-rodada-fina',
    category: 'Grava (canto rodado)',
    name: 'Gravilla fina (4–12 mm)',
    minDensity: 1.50,
    maxDensity: 1.65,
    defaultDensity: 1.58,
    note: 'Forma redondeada acomoda mejor',
    color: '#06b6d4',
  },
  {
    id: 'grava-rodada-media',
    category: 'Grava (canto rodado)',
    name: 'Grava media (12–25 mm)',
    minDensity: 1.52,
    maxDensity: 1.68,
    defaultDensity: 1.60,
    note: 'Estándar para hormigón',
    color: '#06b6d4',
  },
  {
    id: 'grava-rodada-gruesa',
    category: 'Grava (canto rodado)',
    name: 'Grava gruesa / Canto (25–60 mm)',
    minDensity: 1.55,
    maxDensity: 1.70,
    defaultDensity: 1.63,
    note: 'Acopio limpio',
    color: '#06b6d4',
  },
  {
    id: 'grava-rodada-todo-uno',
    category: 'Grava (canto rodado)',
    name: 'Grava todo-uno natural (0–40 mm)',
    minDensity: 1.70,
    maxDensity: 1.85,
    defaultDensity: 1.78,
    note: 'Mezcla natural con arena',
    color: '#06b6d4',
  },

  // Arena
  {
    id: 'arena-fina',
    category: 'Arena',
    name: 'Arena fina (0–1 / 0–2 mm)',
    minDensity: 1.35,
    maxDensity: 1.50,
    defaultDensity: 1.43,
    note: 'Muy sensible al esponjamiento por humedad',
    color: '#f59e0b',
  },
  {
    id: 'arena-media-rio',
    category: 'Arena',
    name: 'Arena media / de río (0–4 mm)',
    minDensity: 1.45,
    maxDensity: 1.60,
    defaultDensity: 1.53,
    note: 'Seca: ~1,45 / Húmeda: ~1,60',
    color: '#f59e0b',
  },
  {
    id: 'arena-gruesa-mortero',
    category: 'Arena',
    name: 'Arena gruesa / Mortero (2–5 mm)',
    minDensity: 1.50,
    maxDensity: 1.65,
    defaultDensity: 1.58,
    note: 'Menos retención de agua que la fina',
    color: '#f59e0b',
  },

  // Arcilla
  {
    id: 'arcilla-terrones-gruesos',
    category: 'Arcilla',
    name: 'En terrones gruesos (excavación)',
    minDensity: 1.15,
    maxDensity: 1.30,
    defaultDensity: 1.23,
    note: 'Muchos huecos de aire entre bloques',
    color: '#f43f5e',
  },
  {
    id: 'arcilla-desmenuzada-seca',
    category: 'Arcilla',
    name: 'Desmenuzada / Seca (< 20 mm)',
    minDensity: 1.25,
    maxDensity: 1.40,
    defaultDensity: 1.33,
    note: 'Acopio aireado',
    color: '#f43f5e',
  },
  {
    id: 'arcilla-plastica-humeda',
    category: 'Arcilla',
    name: 'Plástica / Húmeda en masa',
    minDensity: 1.40,
    maxDensity: 1.55,
    defaultDensity: 1.48,
    note: 'Se apelmaza por su propio peso',
    color: '#f43f5e',
  },

  // Tierra vegetal / Estéril
  {
    id: 'tierra-cribada-fina',
    category: 'Tierra vegetal / Estéril',
    name: 'Cribada / Fina (0–15 mm)',
    minDensity: 1.15,
    maxDensity: 1.30,
    defaultDensity: 1.23,
    note: 'Muy esponjada, alto contenido orgánico',
    color: '#84cc16',
  },
  {
    id: 'tierra-sin-cribar',
    category: 'Tierra vegetal / Estéril',
    name: 'Sin cribar / Todo-uno (0–100 mm)',
    minDensity: 1.25,
    maxDensity: 1.45,
    defaultDensity: 1.35,
    note: 'Mezcla de tierra, raíces y cantos',
    color: '#84cc16',
  },
  {
    id: 'tierra-esteril-montera',
    category: 'Tierra vegetal / Estéril',
    name: 'Estéril de montera (roca blanda + tierra)',
    minDensity: 1.35,
    maxDensity: 1.55,
    defaultDensity: 1.45,
    note: 'Mayor proporción de fracción pétrea',
    color: '#84cc16',
  },
] as const;

export function formatDefaultMaterialDisplayName(category: string, name: string): string {
  const cleanCategory = category.trim();
  const cleanName = name.trim();
  if (!cleanCategory) return cleanName;
  const firstWord = cleanCategory.split(' ')[0].toLowerCase();
  if (firstWord && cleanName.toLowerCase().includes(firstWord)) {
    return cleanName;
  }
  return `${cleanCategory} — ${cleanName}`;
}

export function formatMaterialDisplayName(entry: MaterialDensityEntry): string {
  if (entry.displayName && entry.displayName.trim()) {
    return entry.displayName.trim();
  }
  return formatDefaultMaterialDisplayName(entry.category, entry.name);
}

function sanitizeDensityNumber(val: unknown, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(0.1, Math.min(10, Math.round(num * 100) / 100));
}

export function sanitizeMaterialEntry(raw: Partial<MaterialDensityEntry>, index = 0): MaterialDensityEntry {
  const minD = sanitizeDensityNumber(raw.minDensity, 1.5);
  const maxD = Math.max(minD, sanitizeDensityNumber(raw.maxDensity, Math.max(minD, 1.65)));
  const rawDefault = sanitizeDensityNumber(
    raw.defaultDensity,
    Math.round(((minD + maxD) / 2) * 100) / 100
  );
  const defD = Math.max(minD, Math.min(maxD, rawDefault));
  const cleanCategory = String(raw.category || 'Otros materiales').trim() || 'Otros materiales';
  const cleanName = String(raw.name || `Material ${index + 1}`).trim() || `Material ${index + 1}`;
  const cleanDisplayName = raw.displayName ? String(raw.displayName).trim() : '';
  const cleanId =
    String(raw.id || '').trim() ||
    `${cleanCategory}-${cleanName}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    `mat-${Date.now()}-${index}`;

  return {
    id: cleanId,
    category: cleanCategory,
    name: cleanName,
    ...(cleanDisplayName ? { displayName: cleanDisplayName } : {}),
    minDensity: minD,
    maxDensity: maxD,
    defaultDensity: defD,
    note: String(raw.note || '').trim(),
    color: String(raw.color || '#eab308').trim() || '#eab308',
  };
}

export function getMaterialDensityCatalog(): MaterialDensityEntry[] {
  if (typeof window === 'undefined') {
    return MATERIAL_DENSITY_CATALOG.map((item) => ({ ...item }));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MATERIALS);
    if (!raw) {
      return MATERIAL_DENSITY_CATALOG.map((item) => ({ ...item }));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return MATERIAL_DENSITY_CATALOG.map((item) => ({ ...item }));
    }
    return parsed.map((item, idx) => sanitizeMaterialEntry(item, idx));
  } catch {
    return MATERIAL_DENSITY_CATALOG.map((item) => ({ ...item }));
  }
}

function notifyMaterialsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MATERIALS_UPDATED_EVENT));
  }
}

export function saveMaterialDensityCatalog(entries: MaterialDensityEntry[]): MaterialDensityEntry[] {
  const sanitized = entries.map((item, idx) => sanitizeMaterialEntry(item, idx));
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_MATERIALS, JSON.stringify(sanitized));
    } catch {
      // ignore storage quota errors
    }
    notifyMaterialsUpdated();
  }
  return sanitized;
}

export function upsertMaterialDensityEntry(
  input: Omit<MaterialDensityEntry, 'id'> & { id?: string }
): MaterialDensityEntry[] {
  const current = getMaterialDensityCatalog();
  const isEdit = Boolean(input.id && current.some((item) => item.id === input.id));
  const entry = sanitizeMaterialEntry(
    isEdit
      ? input
      : {
          ...input,
          id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }
  );

  const next = isEdit
    ? current.map((item) => (item.id === entry.id ? entry : item))
    : [...current, entry];

  return saveMaterialDensityCatalog(next);
}

export function deleteMaterialDensityEntry(id: string): MaterialDensityEntry[] {
  const current = getMaterialDensityCatalog();
  const next = current.filter((item) => item.id !== id);
  return saveMaterialDensityCatalog(next);
}

export function resetMaterialDensityCatalog(): MaterialDensityEntry[] {
  const defaults = MATERIAL_DENSITY_CATALOG.map((item) => ({ ...item }));
  return saveMaterialDensityCatalog(defaults);
}

export function getMaterialCategories(entries?: readonly MaterialDensityEntry[]): string[] {
  const source = entries ?? getMaterialDensityCatalog();
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const baseCat of MATERIAL_DENSITY_CATEGORIES) {
    if (source.some((item) => item.category === baseCat) && !seen.has(baseCat)) {
      seen.add(baseCat);
      ordered.push(baseCat);
    }
  }
  for (const item of source) {
    if (!seen.has(item.category)) {
      seen.add(item.category);
      ordered.push(item.category);
    }
  }
  return ordered;
}
