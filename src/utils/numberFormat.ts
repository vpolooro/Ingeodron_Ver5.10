export interface FormatEsNumberOptions {
  minDecimals?: number;
  maxDecimals?: number;
}

/**
 * Formatea cualquier número usando el punto (.) como separador de miles en todos
 * los grupos (incluidos números de 4 cifras), la coma (,) como separador decimal
 * y un máximo de 2 decimales.
 */
export function formatEsNumber(
  value: number | null | undefined,
  options?: number | FormatEsNumberOptions
): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  let minDecimals = 0;
  let maxDecimals = 2;

  if (typeof options === 'number') {
    minDecimals = options;
    maxDecimals = options;
  } else if (options) {
    minDecimals = options.minDecimals ?? 0;
    maxDecimals = options.maxDecimals ?? Math.max(minDecimals, 2);
  }

  minDecimals = Math.max(0, Math.min(2, Math.trunc(minDecimals)));
  maxDecimals = Math.max(minDecimals, Math.min(2, Math.trunc(maxDecimals)));

  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round((num + Number.EPSILON * (num < 0 ? -1 : 1)) * factor) / factor;
  const safeNum = Object.is(rounded, -0) || Math.abs(rounded) < 1e-12 ? 0 : rounded;

  const sign = safeNum < 0 ? '-' : '';
  const absStr = Math.abs(safeNum).toFixed(maxDecimals);
  const [intPart, rawDecPart = ''] = absStr.split('.');
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (maxDecimals === 0) {
    return `${sign}${groupedInt}`;
  }

  let decPart = rawDecPart;
  while (decPart.length > minDecimals && decPart.endsWith('0')) {
    decPart = decPart.slice(0, -1);
  }

  return decPart.length > 0 ? `${sign}${groupedInt},${decPart}` : `${sign}${groupedInt}`;
}

export function formatEsInt(value: number | null | undefined): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return formatEsNumber(Math.round(num), 0);
}
