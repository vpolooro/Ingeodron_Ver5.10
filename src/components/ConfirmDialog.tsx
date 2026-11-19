import React from 'react';
import { AlertTriangle, Trash2, Upload, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  details = [],
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const isWarning = variant === 'warning';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={`glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl shadow-2xl space-y-4 border ${
          isWarning ? 'border-amber-500/50' : 'border-red-500/40'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border shrink-0 ${
                isWarning
                  ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                  : 'bg-red-500/15 border-red-500/30 text-red-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id="confirm-dialog-title" className="font-bold text-white text-sm sm:text-base">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white cursor-pointer p-1"
            aria-label="Cerrar confirmación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs text-gray-300 leading-relaxed">
          <p>{message}</p>
          {details.length > 0 && (
            <ul
              className={`rounded-xl p-3 space-y-1 text-[11px] list-disc list-inside border ${
                isWarning
                  ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                  : 'bg-red-950/25 border-red-500/25 text-red-200'
              }`}
            >
              {details.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-white text-xs font-bold rounded-lg shadow flex items-center justify-center gap-1.5 transition cursor-pointer ${
              isWarning
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {isWarning ? <Upload className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
