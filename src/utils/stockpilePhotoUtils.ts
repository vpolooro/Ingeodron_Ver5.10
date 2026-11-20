import { Stockpile } from '../types.ts';

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_PHOTO_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ServerStockpilePhotoEntry {
  stockpileId: number;
  surveyId?: number;
  clientId?: number;
  clientCode?: string;
  clientName?: string;
  clientFolder?: string;
  flightSubFolder?: string;
  fileName: string;
  photoUrl: string;
  updatedAt?: string;
}

export interface UploadStockpilePhotoParams {
  stockpileId: number;
  file: File;
  surveyId?: number;
  stockpileName?: string;
  stockpileCode?: string;
  clientId?: number;
  clientCode?: string;
  clientName?: string;
  flightCode?: string;
  flightNotes?: string;
}

export function buildRenamedStockpilePhotoFileName(
  stockpileName?: string,
  stockpileCode?: string,
  originalFileName?: string,
  stockpileId?: number
): string {
  const rawOrig = (originalFileName || '').trim();
  const dotIdx = rawOrig.lastIndexOf('.');
  const rawExt = dotIdx > 0 ? rawOrig.slice(dotIdx) : '.jpg';
  const sanitizePart = (val?: string) =>
    (val || '')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\.\.+/g, '.')
      .replace(/\.(png|jpe?g|webp)$/i, '')
      .trim();
  const cleanCode = sanitizePart(stockpileCode);
  const cleanName = sanitizePart(stockpileName);
  const safeBase =
    cleanCode && cleanName
      ? `${cleanCode}_${cleanName}`
      : cleanCode || cleanName || (stockpileId ? `acopio_${stockpileId}` : 'acopio');
  return `${safeBase}${rawExt}`;
}

export interface UploadStockpilePhotoResult {
  photoUrl: string;
  photoFileName: string;
  storedOnServer: boolean;
}

export function validateStockpilePhotoFile(file: File): void {
  if (!file) {
    throw new Error('Debes seleccionar un archivo de imagen.');
  }
  const hasValidExt = ALLOWED_PHOTO_EXT.test(file.name || '');
  const hasValidMime = !file.type || ALLOWED_PHOTO_MIME.has(file.type.toLowerCase());
  if (!hasValidExt && !ALLOWED_PHOTO_MIME.has((file.type || '').toLowerCase())) {
    throw new Error('Formato de imagen no admitido. Usa JPG, JPEG, PNG o WebP.');
  }
  if (!hasValidExt && !hasValidMime) {
    throw new Error('Formato de imagen no admitido. Usa JPG, JPEG, PNG o WebP.');
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('La fotografía supera el límite máximo de 25 MB.');
  }
}

export function getAuthToken(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('ingeodron_token') : null;
  } catch {
    return null;
  }
}

export function getAuthenticatedPhotoSrc(photoUrl?: string): string {
  if (!photoUrl) return '';
  if (
    photoUrl.startsWith('data:') ||
    photoUrl.startsWith('blob:') ||
    photoUrl.startsWith('http://') ||
    photoUrl.startsWith('https://')
  ) {
    return photoUrl;
  }
  const token = getAuthToken();
  if (!token || !photoUrl.startsWith('/api/')) return photoUrl;
  const separator = photoUrl.includes('?') ? '&' : '?';
  return `${photoUrl}${separator}token=${encodeURIComponent(token)}`;
}

export function compressPhotoToDataUrl(file: File, maxDim = 1280, quality = 0.84): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('No se pudo procesar la fotografía seleccionada.'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(result);
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round((img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.height || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const isPng = file.type.toLowerCase() === 'image/png';
          resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality));
        } catch {
          resolve(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadStockpilePhoto(
  params: UploadStockpilePhotoParams
): Promise<UploadStockpilePhotoResult> {
  validateStockpilePhotoFile(params.file);

  const renamedTarget = buildRenamedStockpilePhotoFileName(
    params.stockpileName,
    params.stockpileCode,
    params.file.name,
    params.stockpileId
  );

  const formData = new FormData();
  formData.append('file', params.file);
  if (params.surveyId !== undefined) formData.append('surveyId', String(params.surveyId));
  if (params.stockpileName) formData.append('stockpileName', params.stockpileName);
  if (params.stockpileCode) formData.append('stockpileCode', params.stockpileCode);
  if (params.clientId !== undefined) formData.append('clientId', String(params.clientId));
  if (params.clientCode) formData.append('clientCode', params.clientCode);
  if (params.clientName) formData.append('clientName', params.clientName);
  if (params.flightCode) formData.append('flightCode', params.flightCode);
  if (params.flightNotes) formData.append('flightNotes', params.flightNotes);

  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const resp = await fetch(`/api/stockpiles/${params.stockpileId}/photo`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    if (resp.ok) {
      const payload = await resp.json().catch(() => ({}));
      if (payload?.photoUrl) {
        return {
          photoUrl: String(payload.photoUrl),
          photoFileName: String(payload.fileName || renamedTarget),
          storedOnServer: true,
        };
      }
    } else if (resp.status === 400 || resp.status === 403 || responseStatusIsAuthOrTooLarge(resp.status)) {
      const payload = await resp.json().catch(() => ({}));
      throw new Error(payload?.error || 'No se pudo subir la fotografía del acopio.');
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes('admitido') || err.message.includes('límite') || err.message.includes('Acceso') || err.message.includes('No se pudo subir'))) {
      throw err;
    }
    // Network/offline fallback below
  }

  const dataUrl = await compressPhotoToDataUrl(params.file);
  return {
    photoUrl: dataUrl,
    photoFileName: renamedTarget,
    storedOnServer: false,
  };
}

function responseStatusIsAuthOrTooLarge(status: number): boolean {
  return status === 403 || status === 413;
}

export async function deleteStockpilePhotoServer(stockpileId: number): Promise<void> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    await fetch(`/api/stockpiles/${stockpileId}/photo`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
  } catch {
    // Ignore when offline or endpoint unavailable
  }
}

export async function fetchServerStockpilePhotos(): Promise<ServerStockpilePhotoEntry[]> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const resp = await fetch('/api/stockpiles/photos', {
      headers,
      credentials: 'include',
    });
    if (!resp.ok) return [];
    const payload = await resp.json().catch(() => ({}));
    return Array.isArray(payload?.photos) ? payload.photos : [];
  } catch {
    return [];
  }
}

function triggerBrowserBlobDownload(blobUrl: string, fileName: string, revokeAfter = false): void {
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (revokeAfter) {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
  }
}

function inferExtFromMimeOrDataUrl(mimeOrUrl?: string): string {
  const lower = (mimeOrUrl || '').toLowerCase();
  if (lower.includes('image/png')) return '.png';
  if (lower.includes('image/webp')) return '.webp';
  return '.jpg';
}

export async function downloadStockpilePhoto(
  stockpile: Pick<Stockpile, 'id' | 'code' | 'name' | 'photoUrl' | 'photoFileName'>
): Promise<string> {
  const rawUrl = stockpile.photoUrl;
  if (!rawUrl) {
    throw new Error('Este acopio no tiene ninguna fotografía adjunta.');
  }

  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    const extHint = stockpile.photoFileName || `foto${inferExtFromMimeOrDataUrl(rawUrl)}`;
    const downloadName = buildRenamedStockpilePhotoFileName(
      stockpile.name,
      stockpile.code,
      extHint,
      stockpile.id
    );
    triggerBrowserBlobDownload(rawUrl, downloadName, false);
    return downloadName;
  }

  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const sep = rawUrl.includes('?') ? '&' : '?';
  const downloadEndpoint = `${rawUrl}${sep}download=1`;

  const resp = await fetch(downloadEndpoint, {
    headers,
    credentials: 'include',
  });

  if (!resp.ok) {
    const errPayload = await resp.json().catch(() => ({}));
    throw new Error(
      errPayload?.error || 'No se pudo descargar la fotografía del acopio desde el servidor.'
    );
  }

  let serverFileName = stockpile.photoFileName || '';
  const disposition = resp.headers.get('content-disposition');
  if (disposition) {
    const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (utfMatch?.[1]) {
      try {
        serverFileName = decodeURIComponent(utfMatch[1]);
      } catch {
        serverFileName = utfMatch[1];
      }
    } else if (asciiMatch?.[1]) {
      serverFileName = asciiMatch[1];
    }
  }

  const blob = await resp.blob();
  const extHint = serverFileName || `foto${inferExtFromMimeOrDataUrl(blob.type)}`;
  const downloadName = buildRenamedStockpilePhotoFileName(
    stockpile.name,
    stockpile.code,
    extHint,
    stockpile.id
  );
  const objectUrl = URL.createObjectURL(blob);
  triggerBrowserBlobDownload(objectUrl, downloadName, true);
  return downloadName;
}
