import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortState } from '../utils/tableSortUtils.ts';

interface SortableThProps {
  label: React.ReactNode;
  sortKey: string;
  sortState: SortState<string> | null | undefined;
  onSort: (key: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const SortableTh: React.FC<SortableThProps> = ({
  label,
  sortKey,
  sortState,
  onSort,
  align = 'left',
  className = '',
}) => {
  const isActive = sortState?.key === sortKey;
  const direction = isActive ? sortState?.direction : undefined;

  const justifyClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
      ? 'justify-center text-center'
      : 'justify-start text-left';

  return (
    <th
      aria-sort={
        isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      className={`select-none ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Ordenar por esta columna (${
          isActive && direction === 'asc' ? 'descendente' : 'ascendente'
        })`}
        className={`w-full inline-flex items-center gap-1 uppercase font-semibold transition cursor-pointer group ${justifyClass} ${
          isActive ? 'text-blue-400' : 'hover:text-blue-400'
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="w-3 h-3 shrink-0 text-blue-400" />
          ) : (
            <ArrowDown className="w-3 h-3 shrink-0 text-blue-400" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 shrink-0 opacity-45 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </th>
  );
};
