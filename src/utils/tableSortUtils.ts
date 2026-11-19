export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export type SortableValue = string | number | boolean | null | undefined;

export function toggleSortState<K extends string>(
  prev: SortState<K> | null | undefined,
  key: K
): SortState<K> {
  if (prev && prev.key === key) {
    return {
      key,
      direction: prev.direction === 'asc' ? 'desc' : 'asc',
    };
  }
  return { key, direction: 'asc' };
}

export function compareSortableValues(
  a: SortableValue,
  b: SortableValue,
  direction: SortDirection
): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let base = 0;

  if (typeof a === 'number' && typeof b === 'number') {
    base = a - b;
  } else if (typeof a === 'boolean' && typeof b === 'boolean') {
    base = Number(a) - Number(b);
  } else {
    base = String(a).localeCompare(String(b), 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  return direction === 'asc' ? base : -base;
}

export function sortRowsBy<T>(
  rows: readonly T[],
  sort: SortState<string> | null | undefined,
  getValue: (row: T, key: string) => SortableValue
): T[] {
  if (!sort) return [...rows];
  return [...rows].sort((rowA, rowB) =>
    compareSortableValues(getValue(rowA, sort.key), getValue(rowB, sort.key), sort.direction)
  );
}
