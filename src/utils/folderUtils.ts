const MAX_CODE_LEN = 8;
const MAX_LABEL_LEN = 18;

const LEGAL_SUFFIXES = new Set([
  'sa',
  'sl',
  'slu',
  'sau',
  'slne',
  'scoop',
  'sll',
  'cb',
  'sc',
  'srl',
  'ltd',
  'llc',
  'inc',
  'gmbh',
]);

const STOP_WORDS = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'en']);

/**
 * Normalizes a client code into a compact, lowercase web- & Linux-safe token.
 */
export function sanitizeClientCode(rawCode?: string, fallbackId?: number): string {
  const cleaned = String(rawCode || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase()
    .slice(0, MAX_CODE_LEN);
  if (cleaned) return cleaned;
  if (fallbackId !== undefined && Number.isFinite(fallbackId)) {
    return `c${100 + fallbackId}`;
  }
  return 'c000';
}

/**
 * Normalizes a client name into a compact, lowercase web-hosting-compatible slug
 * (max 18 chars, no accents, no legal suffixes like S.A./S.L., no connectors).
 */
export function sanitizeClientFolderLabel(rawName?: string): string {
  const tokens = String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return 'cliente';

  const coreTokens = tokens.filter((t) => !LEGAL_SUFFIXES.has(t) && !STOP_WORDS.has(t));
  const activeTokens = coreTokens.length > 0 ? coreTokens : tokens;

  let result = '';
  for (const token of activeTokens) {
    if (!result) {
      result = token.slice(0, MAX_LABEL_LEN);
      continue;
    }
    const next = `${result}_${token}`;
    if (next.length <= MAX_LABEL_LEN) {
      result = next;
    } else {
      break;
    }
  }

  return result.replace(/^_+|_+$/g, '') || 'cliente';
}

/**
 * Builds a short, web-hosting & Linux-compatible client folder name:
 * `<code_lower>-<compact_slug>` (e.g. `c110-hormigones_gravas`).
 */
export function buildClientFolderName(
  clientCode?: string,
  clientName?: string,
  fallbackId?: number
): string {
  const code = sanitizeClientCode(clientCode, fallbackId);
  const label = sanitizeClientFolderLabel(clientName);
  return `${code}-${label}`;
}

const MAX_FLIGHT_CODE_LEN = 20;
const MAX_FLIGHT_LABEL_LEN = 30;

/**
 * Sanitizes a flight code for use in a folder name.
 * Keeps alphanumeric characters and common separators like `-`, `_`.
 * Example: "VUE-100-JUN" → "VUE-100-JUN"
 */
export function sanitizeFlightCode(rawCode?: string): string {
  return String(rawCode || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '')
    .slice(0, MAX_FLIGHT_CODE_LEN)
    .replace(/^[-_]+|[-_]+$/g, '') || 'vuelo';
}

/**
 * Sanitizes a flight mission name/notes for use in a folder label.
 * Removes accents, special characters, replaces spaces with underscores.
 * Example: "Misión Fotogramétrica Cantera" → "Mision_Fotogrametrica"
 */
export function sanitizeFlightLabel(rawLabel?: string): string {
  const cleaned = String(rawLabel || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s_-]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, MAX_FLIGHT_LABEL_LEN)
    .replace(/^[_-]+|[_-]+$/g, '');
  return cleaned || 'vuelo';
}

/**
 * Builds a flight subfolder name inside the client folder.
 * Format: `<flightCode>-<missionLabel>` (e.g. `120V-Vuelo_cantera`).
 * Files of each flight (uploaded deliverables and PDF reports) are stored here.
 */
export function buildFlightSubFolderName(
  flightCode?: string,
  flightNotes?: string
): string {
  const code = sanitizeFlightCode(flightCode);
  const label = sanitizeFlightLabel(flightNotes);
  return `${code}-${label}`;
}
