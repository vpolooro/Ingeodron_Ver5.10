/**
 * Formats an ISO date string (YYYY-MM-DD / ISO timestamp), an existing
 * DD/MM/YYYY string, or a Date instance into European DD/MM/YYYY format.
 */
export function formatDateEu(value?: string | Date | null, fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return fallback;
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = String(value.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return fallback;

  // Match ISO date prefix YYYY-MM-DD (avoid timezone shift)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  // Match already-European DD/MM/YYYY or DD-MM-YYYY
  const euMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (euMatch) {
    const [, dd, mm, yyyy] = euMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  return trimmed;
}

/**
 * Parses an ISO date string (YYYY-MM-DD), European date string (DD/MM/YYYY),
 * or Date instance into a UTC timestamp (ms) for deterministic chronological sorting.
 */
export function parseDateTimestamp(value?: string | Date | null): number {
  if (value === undefined || value === null || value === '') {
    return Number.POSITIVE_INFINITY;
  }

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return Number.POSITIVE_INFINITY;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  const euMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (euMatch) {
    const [, dd, mm, yyyy] = euMatch;
    return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

