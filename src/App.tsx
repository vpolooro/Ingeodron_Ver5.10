import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plane,
  Boxes as CubesIcon,
  Layers,
  Download,
  Building,
  Users,
  Plus,
  Trash2,
  Edit,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  LogOut,
  Sliders,
  X,
  Calendar,
  Clock,
  Archive,
  Filter,
  Package,
  Upload,
  Share2,
  Check,
  FolderOpen,
  Box,
  Sun,
  Moon,
  Camera,
  Eye,
} from 'lucide-react';
import { IngeodronLogo } from './components/IngeodronLogo.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { ClientsUsersAdminPanel } from './components/ClientsUsersAdminPanel.tsx';
import { ActiveFlightStockpilesChart } from './components/ActiveFlightStockpilesChart.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { CsvImportModal } from './components/CsvImportModal.tsx';
import { PhotogrammetryWorkspace } from './components/PhotogrammetryWorkspace.tsx';
import { SortableTh } from './components/SortableTh.tsx';
import { MultiFlightSelect } from './components/MultiFlightSelect.tsx';
import { MaterialDensitySelector } from './components/MaterialDensitySelector.tsx';
import { AdminParametersPanel } from './components/AdminParametersPanel.tsx';
import { saveMaterialDensityCatalog } from './utils/materialDensities.ts';
import { AppUser, Client, Quarry, Zone, Survey, Stockpile, Deliverable, SurveyStatus } from './types.ts';
import { generateZonePdfReport, PdfReportType } from './utils/pdfReportGenerator.ts';
import { localDataStore } from './utils/localDataStore.ts';
import { buildClientFolderName, buildFlightSubFolderName } from './utils/folderUtils.ts';
import { formatDateEu, parseDateTimestamp } from './utils/dateUtils.ts';
import { SortState, sortRowsBy, toggleSortState } from './utils/tableSortUtils.ts';
import { exportQuarryToExcel, downloadDeliverableFile } from './utils/exportUtils.ts';
import {
  CsvImportMode,
  downloadFlightsCsvTemplate,
  downloadStockpilesCsvTemplate,
} from './utils/csvImportUtils.ts';
import { formatEsInt, formatEsNumber } from './utils/numberFormat.ts';
import {
  uploadStockpilePhoto,
  deleteStockpilePhotoServer,
  downloadStockpilePhoto,
  fetchServerStockpilePhotos,
  getAuthenticatedPhotoSrc,
  validateStockpilePhotoFile,
  buildRenamedStockpilePhotoFileName,
} from './utils/stockpilePhotoUtils.ts';

function sortSurveysNewestFirst(list: Survey[]): Survey[] {
  return [...list].sort((a, b) => {
    const timeA = parseDateTimestamp(a.surveyDate);
    const timeB = parseDateTimestamp(b.surveyDate);
    const aValid = Number.isFinite(timeA);
    const bValid = Number.isFinite(timeB);
    if (aValid && bValid && timeA !== timeB) return timeB - timeA;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return b.flightCode.localeCompare(a.flightCode, 'es', { numeric: true }) || b.id - a.id;
  });
}

interface InlineDensityCellProps {
  value: number;
  stockpileName: string;
  onCommit: (nextDensity: number) => void;
}

function InlineDensityCell({ value, stockpileName, onCommit }: InlineDensityCellProps) {
  const safeVal = Number.isFinite(value) && value >= 0.1 ? value : 1.68;
  const [draft, setDraft] = useState<string>(formatEsNumber(safeVal, 2));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(formatEsNumber(safeVal, 2));
    }
  }, [safeVal, isFocused]);

  const commitValue = () => {
    const normalized = draft.replace(/\s+/g, '').replace(',', '.').trim();
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 10) {
      setDraft(formatEsNumber(safeVal, 2));
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    setDraft(formatEsNumber(rounded, 2));
    if (Math.abs(rounded - safeVal) >= 0.005) {
      onCommit(rounded);
    }
  };

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Densidad de ${stockpileName} en t/m³`}
        title="Haz clic para modificar la densidad del material (Enter o salir para aplicar)"
        value={draft}
        onFocus={(e) => {
          setIsFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setIsFocused(false);
          commitValue();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(formatEsNumber(safeVal, 2));
            e.currentTarget.blur();
          }
        }}
        className="w-16 bg-[#0b0f17] border border-amber-500/35 hover:border-amber-400/80 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-md px-1.5 py-1 text-right font-mono text-amber-300 font-semibold text-xs outline-none transition"
      />
      <span className="text-[10px] font-mono text-amber-400/80">t/m³</span>
    </div>
  );
}

function getInitialSession(): AppUser | null {
  try {
    const raw = localStorage.getItem('ingeodron_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUser;
    if (!parsed || !parsed.email) return null;

    // Sync with live editable users store so admin changes (clientId, active status, role) take immediate effect
    const liveUsers = localDataStore.getUsers();
    const live = liveUsers.find(
      (u) => u.id === parsed.id || u.email.toLowerCase() === parsed.email.toLowerCase()
    );
    if (live) {
      if (live.active === false) {
        localStorage.removeItem('ingeodron_session');
        return null;
      }
      const { password: _omitted, ...safeUser } = live;
      localStorage.setItem('ingeodron_session', JSON.stringify(safeUser));
      return safeUser;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ingeodron_token') : null;
  const headers: Record<string, string> = { ...customHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function uploadFormDataWithProgress(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void
): Promise<{ status: number; ok: boolean; payload: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    Object.entries(headers).forEach(([key, val]) => {
      xhr.setRequestHeader(key, val);
    });

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      let payload: any = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        payload = { error: xhr.responseText || 'Respuesta no válida del servidor.' };
      }
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        payload,
      });
    };

    xhr.onerror = () => {
      reject(new Error('Error de conexión de red al intentar subir el archivo al servidor.'));
    };

    xhr.onabort = () => {
      reject(new Error('La subida del archivo fue cancelada.'));
    };

    xhr.send(formData);
  });
}

export default function App() {
  const initialSession = useMemo(() => getInitialSession(), []);

  // Session & Role state (defaults to LoginPage when no session exists)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(Boolean(initialSession));
  const [authenticatedRole, setAuthenticatedRole] = useState<'admin' | 'client'>(
    initialSession?.role === 'admin' ? 'admin' : 'client'
  );
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'manager'>(
    initialSession?.role === 'admin' ? 'admin' : 'manager'
  );
  const [userEmail, setUserEmail] = useState<string>(initialSession?.email || '');
  const [loggedUserName, setLoggedUserName] = useState<string>(
    initialSession?.displayName || initialSession?.email || 'Usuario INGEODRON'
  );
  const [loggedClientId, setLoggedClientId] = useState<number | null>(
    initialSession?.role === 'admin' ? null : (initialSession?.clientId ?? null)
  );
  const [adminSelectedClientId, setAdminSelectedClientId] = useState<number | 'all'>('all');

  // Navigation Tabs matching INGEODRON
  const [activeTab, setActiveTab] = useState<
    'tab-flights' | 'tab-dashboard' | 'tab-viewer3d' | 'tab-downloads' | 'tab-clients-admin' | 'tab-settings'
  >('tab-flights');

  // Light / Dark Theme preference (persisted)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('ingeodron_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    try {
      localStorage.setItem('ingeodron_theme', theme);
    } catch {
      // ignore storage failure
    }
  }, [theme]);

  // Database Entities
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [quarries, setQuarries] = useState<Quarry[]>([]);
  const [selectedQuarryId, setSelectedQuarryId] = useState<number | 'all'>('all');
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stockpiles, setStockpiles] = useState<Stockpile[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);

  // Active flight selection & Filters
  const [activeFlightId, setActiveFlightId] = useState<number | 'all' | 'multi'>(0);
  const [selectedHeaderFlightIds, setSelectedHeaderFlightIds] = useState<number[]>([]);
  const [activeZoneFilter, setActiveZoneFilter] = useState<string>('all');
  const [flightStatusFilter, setFlightStatusFilter] = useState<'all' | SurveyStatus>('all');
  const [pdfReportType, setPdfReportType] = useState<PdfReportType>('standard');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Modals state
  const [showZoneModal, setShowZoneModal] = useState<boolean>(false);
  const [showStockpileModal, setShowStockpileModal] = useState<boolean>(false);
  const [showAddFlightModal, setShowAddFlightModal] = useState<boolean>(false);
  const [showUploadDeliverableModal, setShowUploadDeliverableModal] = useState<boolean>(false);
  const [showWorkspaceCsvModal, setShowWorkspaceCsvModal] = useState<boolean>(false);
  const [workspaceCsvMode, setWorkspaceCsvMode] = useState<CsvImportMode>('flights');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    details?: string[];
    confirmLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    details: [],
    confirmLabel: 'Eliminar',
    variant: 'danger',
    onConfirm: () => { },
  });

  // Zone Create/Edit form state
  const [modalZoneData, setModalZoneData] = useState({
    id: 'new',
    quarryId: 0,
    name: '',
    code: '',
    status: 'active' as Zone['status'],
  });

  // Stockpile (Acopio) Create/Edit form state
  const [modalStockpileData, setModalStockpileData] = useState({
    id: 'new',
    surveyId: 1,
    zoneName: '',
    name: '',
    stockpileType: 'stockpile' as Stockpile['stockpileType'],
    baseElevationM: 115.0,
    areaM2: 2900,
    material: 'Grava 20/40',
    densidad: 1.68,
    relleno: 18000,
    desmonte: 0,
    notes: '',
    photoUrl: '',
    photoFileName: '',
  });
  const [pendingStockpilePhotoFile, setPendingStockpilePhotoFile] = useState<File | null>(null);
  const [pendingStockpilePhotoPreview, setPendingStockpilePhotoPreview] = useState<string>('');
  const [uploadingStockpilePhotoId, setUploadingStockpilePhotoId] = useState<number | null>(null);
  const [previewStockpilePhoto, setPreviewStockpilePhoto] = useState<Stockpile | null>(null);

  const [modalFlightData, setModalFlightData] = useState({
    id: 'new',
    zoneId: 1,
    code: `VUE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    date: new Date().toISOString().slice(0, 10),
    title: 'Misión Fotogramétrica Ordinaria',
    droneModel: 'DJI Matrice 4E rtk',
    operator: 'INGEODRON',
    fillVolumeM3: 42000,
    cutVolumeM3: 150,
    gsd: 1.8,
    status: 'active' as SurveyStatus,
  });

  const [modalFlightStockpiles, setModalFlightStockpiles] = useState<
    Array<{
      name: string;
      code: string;
      material: string;
      densityTonM3: number;
      fillVolumeM3: number;
      cutVolumeM3: number;
    }>
  >([
    {
      name: 'Acopio Principal',
      code: 'ACO-01',
      material: 'Grava caliza 12/20',
      densityTonM3: 1.68,
      fillVolumeM3: 42000,
      cutVolumeM3: 150,
    },
  ]);

  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [isUploadingDeliverable, setIsUploadingDeliverable] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'verifying' | 'verified' | 'error'>('idle');
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string>('');
  const [verifiedUploadNotice, setVerifiedUploadNotice] = useState<{
    id: number;
    fileName: string;
    title: string;
    fileSize: string;
    bytesStored: number;
    relativePath: string;
    overwritten: boolean;
  } | null>(null);
  const [copiedDeliverableId, setCopiedDeliverableId] = useState<number | null>(null);
  const [lastUploadedDeliverableId, setLastUploadedDeliverableId] = useState<number | null>(null);
  const [uploadConflictInfo, setUploadConflictInfo] = useState<{
    exists: boolean;
    fileName: string;
    relativePath: string;
  } | null>(null);
  const [modalUploadData, setModalUploadData] = useState({
    quarryId: 0,
    surveyId: 0,
    category: 'pdf_report',
    fileName: '',
    title: '',
    fileSize: '',
  });

  const [toast, setToast] = useState<{
    title: string;
    message: string;
    variant?: 'info' | 'success' | 'error';
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (
    title: string,
    message: string,
    variant: 'info' | 'success' | 'error' = 'info',
    durationMs = 4200
  ) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ title, message, variant });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  };

  // Table column sorting state
  const [flightsTableSort, setFlightsTableSort] = useState<SortState<string> | null>({
    key: 'surveyDate',
    direction: 'desc',
  });
  const [stockpilesTableSort, setStockpilesTableSort] = useState<SortState<string> | null>(null);

  // Generate official PDF technical report strictly from the filtered & sorted data shown in the table
  const handleGenerateZonePdf = async (
    surveyA?: Survey,
    surveyB?: Survey,
    forceSingleActiveZone = false,
    reportTypeOverride?: PdfReportType
  ) => {
    if (!hasQuarryScope || tableFilteredSurveys.length === 0 || tableFilteredZones.length === 0) {
      showToast(
        'Informe PDF',
        'No hay datos visibles en la tabla según los filtros actuales para generar el informe PDF.'
      );
      return;
    }

    const singleZone =
      (activeZone && tableFilteredZones.find((z) => z.id === activeZone.id)) ||
      tableFilteredZones[0];
    const resolvedZones = forceSingleActiveZone
      ? singleZone
        ? [singleZone]
        : []
      : tableFilteredZones;

    if (resolvedZones.length === 0) {
      showToast('Informe PDF', 'No hay zonas visibles en la tabla según los filtros seleccionados.');
      return;
    }

    const selectedReportType: PdfReportType = reportTypeOverride ?? pdfReportType;
    const resolvedZoneIds = new Set(resolvedZones.map((z) => z.id));
    const surveysForReport = surveyA
      ? [surveyA]
      : tableFilteredSurveys.filter((s) => resolvedZoneIds.has(s.zoneId));
    const surveyIdsForReport = new Set(surveysForReport.map((s) => s.id));
    const stockpilesForReport = surveyA
      ? currentStockpiles.filter((st) => surveyIdsForReport.has(st.surveyId))
      : tableFilteredStockpiles.filter((st) => surveyIdsForReport.has(st.surveyId));
    const selectedReportDates = Array.from(
      new Set(surveysForReport.map((s) => s.surveyDate).filter(Boolean))
    );

    setIsGeneratingPdf(true);
    try {
      const { fileName, blob } = await generateZonePdfReport({
        client: activeClient,
        quarry: consolidatedQuarryForExport,
        zone: resolvedZones[0],
        zones: resolvedZones,
        surveys: surveysForReport,
        stockpiles: stockpilesForReport,
        selectedDates: selectedReportDates,
        activeSurvey:
          (activeFlight && surveyIdsForReport.has(activeFlight.id) ? activeFlight : null) ||
          surveysForReport[0],
        filterSummary: tableFilterSummary,
        surveyA,
        surveyB,
        reportType: selectedReportType,
      });

      // Guardar automáticamente el informe en el servidor dentro de la subcarpeta del vuelo
      let savedOnServer = false;
      const targetFlight =
        surveysForReport.length === 1
          ? surveysForReport[0]
          : (activeFlight && surveyIdsForReport.has(activeFlight.id) ? activeFlight : null) ||
            surveysForReport[0] ||
            surveyA;
      if (targetFlight && activeClient && consolidatedQuarryForExport) {
        try {
          const clientCode = activeClient.code || 'C000';
          const clientName = activeClient.name || 'Cliente';
          const clientFolder = buildClientFolderName(clientCode, clientName, activeClient.id);
          const flightCode = targetFlight.flightCode;
          const flightNotes = targetFlight.notes || 'Vuelo';

          const formData = new FormData();
          formData.append('quarryId', String(consolidatedQuarryForExport.id));
          formData.append('surveyId', String(targetFlight.id));
          formData.append('clientCode', clientCode);
          formData.append('clientName', clientName);
          formData.append('clientFolder', clientFolder);
          formData.append('flightCode', flightCode);
          formData.append('flightNotes', flightNotes);
          formData.append(
            'title',
            `${
              selectedReportType === 'photographic'
                ? 'Informe Fotográfico de Cubicación'
                : 'Informe de Cubicación'
            } ${flightCode} - ${resolvedZones[0]?.name || 'Explotación'}`
          );
          formData.append('category', 'pdf_report');
          formData.append('fileName', fileName);
          formData.append('overwrite', 'true');
          formData.append('file', blob, fileName);

          const uploadResp = await fetch('/api/deliverables/upload', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData,
          });
          const uploadPayload = await uploadResp.json().catch(() => ({}));

          if (uploadResp.ok && uploadPayload?.verified && uploadPayload?.deliverable?.id) {
            const verifyResp = await fetch(`/api/deliverables/${uploadPayload.deliverable.id}/verify`, {
              headers: getAuthHeaders(),
            });
            const verifyPayload = await verifyResp.json().catch(() => ({}));
            if (verifyResp.ok && verifyPayload?.verified && verifyPayload?.hasPhysicalFile) {
              savedOnServer = true;
              const savedDeliv: Deliverable = verifyPayload.deliverable || uploadPayload.deliverable;
              setLastUploadedDeliverableId(savedDeliv.id);
              setVerifiedUploadNotice({
                id: savedDeliv.id,
                fileName: savedDeliv.fileName,
                title: savedDeliv.title,
                fileSize: savedDeliv.fileSize,
                bytesStored: verifyPayload.bytesStored || uploadPayload.bytesStored || 0,
                relativePath: savedDeliv.relativePath || '',
                overwritten: Boolean(uploadPayload.overwritten),
              });
              await fetchData();
            }
          }
        } catch (uploadErr) {
          console.warn('No se pudo guardar automáticamente el informe en el servidor:', uploadErr);
        }
      }

      const modePrefix = selectedReportType === 'photographic' ? 'Informe Fotográfico PDF' : 'Informe PDF';
      showToast(
        savedOnServer ? `${modePrefix} Generado y Subido` : `${modePrefix} Generado`,
        savedOnServer
          ? `Descargado y verificado en servidor: ${fileName}`
          : `Descargado en el navegador: ${fileName}`,
        savedOnServer ? 'success' : 'info',
        savedOnServer ? 5500 : 4000
      );
    } catch (err: any) {
      console.error('Error generating PDF report:', err);
      showToast('Error PDF', 'No se pudo generar el reporte: ' + err.message, 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Load all initial data from client-side store (Zero API, 100% JavaScript / HTML / CSS)
  const fetchData = async (preferredClientId?: number | null, preferredRole?: 'admin' | 'client') => {
    try {
      const cData = localDataStore.getClients();
      const uData = localDataStore.getUsers();
      const qData = localDataStore.getQuarries();
      const zData = localDataStore.getZones();
      const sData = localDataStore.getSurveys();
      const stData = localDataStore.getStockpiles();
      const localDeliverables = localDataStore.getDeliverables();

      const isAdminSession = (preferredRole ?? authenticatedRole) === 'admin';
      const effectiveClientId = preferredClientId !== undefined ? preferredClientId : loggedClientId;

      // Ensure all Linux-safe client directories exist on disk (<CODE>-<Name>) - Admin only
      if (isAdminSession) {
        try {
          await fetch('/api/clients/sync-folders', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              clients: cData.map((c) => ({ code: c.code, name: c.name })),
            }),
          });
        } catch {
          // Ignore when offline or server endpoint unavailable
        }
      }

      let serverDeliverables: Deliverable[] = [];
      try {
        const resp = await fetch('/api/deliverables', {
          headers: getAuthHeaders(),
        });
        if (resp.ok) {
          const payload = await resp.json();
          if (Array.isArray(payload?.deliverables)) {
            serverDeliverables = payload.deliverables;
          }
        }
      } catch {
        // Fallback silently to local deliverables when backend is unavailable
      }

      try {
        const matResp = await fetch('/api/materials', {
          headers: getAuthHeaders(),
        });
        if (matResp.ok) {
          const matPayload = await matResp.json();
          if (Array.isArray(matPayload?.materials)) {
            saveMaterialDensityCatalog(matPayload.materials);
          }
        }
      } catch {
        // Fallback silently to local material catalog when offline
      }

      const serverIds = new Set(serverDeliverables.map((d) => d.id));
      const dData = [...serverDeliverables, ...localDeliverables.filter((d) => !serverIds.has(d.id))];

      const serverPhotos = await fetchServerStockpilePhotos();
      const photoMap = new Map(serverPhotos.map((p) => [p.stockpileId, p]));
      const mergedStockpiles = stData.map((st) => {
        const srvPhoto = photoMap.get(st.id);
        if (srvPhoto) {
          return {
            ...st,
            photoUrl: srvPhoto.photoUrl,
            photoFileName: srvPhoto.fileName,
          };
        }
        if (st.photoUrl && st.photoUrl.startsWith('/api/')) {
          return { ...st, photoUrl: undefined, photoFileName: undefined };
        }
        return st;
      });

      setClients(cData);
      setUsers(uData);
      setQuarries(qData);
      setZones(zData);
      setSurveys(sData);
      setStockpiles(mergedStockpiles);
      setDeliverables(dData);

      let effectiveAdminClientFilter = adminSelectedClientId;
      if (isAdminSession && effectiveAdminClientFilter !== 'all' && !cData.some((c) => c.id === effectiveAdminClientFilter)) {
        effectiveAdminClientFilter = 'all';
        setAdminSelectedClientId('all');
      }

      // Strict scoping: clients ONLY ever see quarries assigned to their clientId (never fall back to all quarries)
      const availableQuarries = isAdminSession
        ? effectiveAdminClientFilter === 'all'
          ? qData
          : qData.filter((q) => q.clientId === effectiveAdminClientFilter)
        : effectiveClientId
          ? qData.filter((q) => q.clientId === effectiveClientId)
          : [];

      if (availableQuarries.length > 0) {
        const keepAllQuarries = selectedQuarryId === 'all';
        const matchedQuarry =
          !keepAllQuarries && typeof selectedQuarryId === 'number'
            ? availableQuarries.find((q) => q.id === selectedQuarryId) || availableQuarries[0]
            : null;
        const resolvedQuarrySelection: number | 'all' = keepAllQuarries
          ? 'all'
          : matchedQuarry
            ? matchedQuarry.id
            : availableQuarries[0].id;
        setSelectedQuarryId(resolvedQuarrySelection);

        const targetQuarryIds = new Set(
          resolvedQuarrySelection === 'all'
            ? availableQuarries.map((q) => q.id)
            : [resolvedQuarrySelection]
        );
        const qZones = zData.filter((z) => targetQuarryIds.has(z.quarryId));
        if (activeZoneFilter !== 'all' && !qZones.some((z) => z.name === activeZoneFilter)) {
          setActiveZoneFilter('all');
        }
        const currentZ =
          (activeZone && qZones.find((z) => z.id === activeZone.id)) ||
          qZones[0] ||
          null;

        if (currentZ) {
          const qZoneIds = qZones.map((z) => z.id);
          const scopedSurveys = sortSurveysNewestFirst(
            sData.filter((s) => qZoneIds.includes(s.zoneId))
          );
          const firstFlight = scopedSurveys[0];

          if (activeFlightId === 'all') {
            setActiveZone(currentZ);
            setActiveFlightId(scopedSurveys.length > 0 ? 'all' : 0);
            setSelectedHeaderFlightIds([]);
          } else if (activeFlightId === 'multi') {
            setActiveZone(currentZ);
            const validIds = selectedHeaderFlightIds.filter((id) =>
              scopedSurveys.some((s) => s.id === id)
            );
            if (validIds.length >= 2) {
              setSelectedHeaderFlightIds(validIds);
            } else if (validIds.length === 1) {
              setActiveFlightId(validIds[0]);
              setSelectedHeaderFlightIds([]);
            } else {
              setActiveFlightId(firstFlight ? firstFlight.id : 0);
              setSelectedHeaderFlightIds([]);
            }
          } else {
            const matchedFlight =
              (activeFlightId > 0 && scopedSurveys.find((s) => s.id === activeFlightId)) ||
              firstFlight;
            const matchedZone =
              (matchedFlight && qZones.find((z) => z.id === matchedFlight.zoneId)) || currentZ;
            setActiveZone(matchedZone);
            setActiveFlightId(matchedFlight ? matchedFlight.id : 0);
            setSelectedHeaderFlightIds([]);
          }
        } else {
          setActiveZone(null);
          setActiveFlightId(0);
        }
      } else {
        setSelectedQuarryId('all');
        setActiveZone(null);
        setActiveFlightId(0);
      }
    } catch (err) {
      console.error('Error loading local data:', err);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn, loggedClientId, authenticatedRole]);

  const handleLoginSuccess = (user: AppUser) => {
    const isAdmin = user.role === 'admin';
    const nextClientId = isAdmin ? null : (user.clientId ?? null);
    setAuthenticatedRole(isAdmin ? 'admin' : 'client');
    setCurrentUserRole(isAdmin ? 'admin' : 'manager');
    setUserEmail(user.email);
    setLoggedUserName(user.displayName || user.email);
    setLoggedClientId(nextClientId);
    setAdminSelectedClientId('all');
    setActiveTab('tab-flights');
    setActiveZoneFilter('all');
    setFlightStatusFilter('all');
    setSelectedHeaderFlightIds([]);
    setIsLoggedIn(true);

    // Scope active quarry & zone strictly to the newly authenticated account
    const allQuarries = localDataStore.getQuarries();
    const allZones = localDataStore.getZones();
    const allSurveys = localDataStore.getSurveys();
    const scoped = isAdmin
      ? allQuarries
      : nextClientId
        ? allQuarries.filter((q) => q.clientId === nextClientId)
        : [];
    const targetQuarry = scoped[0] || null;
    setSelectedQuarryId(targetQuarry ? targetQuarry.id : 'all');
    if (targetQuarry) {
      const qZones = allZones.filter((z) => z.quarryId === targetQuarry.id);
      const qZoneIds = new Set(qZones.map((z) => z.id));
      const sortedQSurveys = sortSurveysNewestFirst(
        allSurveys.filter((s) => qZoneIds.has(s.zoneId))
      );
      const firstSurvey = sortedQSurveys[0];
      const firstZone =
        (firstSurvey && qZones.find((z) => z.id === firstSurvey.zoneId)) ||
        qZones[0] ||
        null;
      setActiveZone(firstZone);
      setActiveFlightId(firstSurvey ? firstSurvey.id : 0);
    } else {
      setActiveZone(null);
      setActiveFlightId(0);
    }
    showToast(
      'Sesión Iniciada',
      isAdmin ? `Acceso Técnico Admin (${user.email})` : `Bienvenido, ${user.displayName || user.email}`
    );
  };

  const handleLogout = () => {
    try {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      }).catch(() => { });
    } catch {
      // Non-blocking
    }
    localStorage.removeItem('ingeodron_session');
    localStorage.removeItem('ingeodron_token');
    setIsLoggedIn(false);
    setLoggedClientId(null);
    setAdminSelectedClientId('all');
    setAuthenticatedRole('client');
    setCurrentUserRole('manager');
    setUserEmail('');
    setLoggedUserName('');
    setSelectedQuarryId('all');
    setActiveZone(null);
    setActiveFlightId(0);
    setActiveZoneFilter('all');
    setFlightStatusFilter('all');
    setSelectedHeaderFlightIds([]);
    setActiveTab('tab-flights');
  };

  // Explicitly activate a single flight or 'all' flights across the active quarry scope
  const handleActivateFlight = (
    flightSelection: number | 'all',
    navigateToTab?: 'tab-flights' | 'tab-dashboard'
  ) => {
    setSelectedHeaderFlightIds([]);
    if (flightSelection === 'all') {
      if (activeTab === 'tab-viewer3d') {
        const fallbackFlight = headerSortedViewer3DSurveys[0] || headerSortedSurveys[0];
        if (fallbackFlight) {
          setActiveFlightId(fallbackFlight.id);
        }
        showToast(
          'Modelo Único en Visor 3D',
          'En el Visor 3D solo se visualiza un vuelo y una explotación a la vez.'
        );
        return;
      }
      setActiveFlightId(currentSurveys.length > 0 ? 'all' : 0);
      showToast(
        'Todos los Vuelos Seleccionados',
        `Mostrando datos consolidados de ${currentSurveys.length} vuelo(s).`
      );
      if (navigateToTab) {
        setActiveTab(navigateToTab);
      }
      return;
    }

    const flight = currentSurveys.find((s) => s.id === flightSelection);
    if (!flight) return;

    setActiveFlightId(flightSelection);
    const targetZone = currentQuarryZones.find((z) => z.id === flight.zoneId);
    if (targetZone) {
      setActiveZone(targetZone);
    }
    showToast('Vuelo Seleccionado', `Cargado ${flight.flightCode} (${formatDateEu(flight.surveyDate)}) para cálculos volumétricos.`);
    if (navigateToTab) {
      setActiveTab(navigateToTab);
    }
  };

  // Toggle one or multiple flights in the header selector (disabled in Visor 3D where only 1 flight is allowed)
  const handleToggleHeaderFlight = (flightId: number) => {
    if (activeTab === 'tab-viewer3d') {
      handleActivateFlight(flightId);
      return;
    }
    const validSurveyIds = new Set(currentSurveys.map((s) => s.id));
    if (!validSurveyIds.has(flightId)) return;

    const baseIds: number[] =
      activeFlightId === 'all'
        ? []
        : activeFlightId === 'multi'
          ? selectedHeaderFlightIds.filter((id) => validSurveyIds.has(id))
          : typeof activeFlightId === 'number' && validSurveyIds.has(activeFlightId)
            ? [activeFlightId]
            : [];

    const nextIds = baseIds.includes(flightId)
      ? baseIds.filter((id) => id !== flightId)
      : [...baseIds, flightId];

    if (nextIds.length === 0) {
      const firstFlight = headerSortedSurveys[0];
      setSelectedHeaderFlightIds([]);
      if (firstFlight) {
        setActiveFlightId(firstFlight.id);
        const targetZone = currentQuarryZones.find((z) => z.id === firstFlight.zoneId);
        if (targetZone) {
          setActiveZone(targetZone);
        }
      } else {
        setActiveFlightId(0);
      }
      return;
    }

    if (nextIds.length === 1) {
      const onlyId = nextIds[0];
      setActiveFlightId(onlyId);
      setSelectedHeaderFlightIds([]);
      const onlyFlight = currentSurveys.find((s) => s.id === onlyId);
      const targetZone = onlyFlight
        ? currentQuarryZones.find((z) => z.id === onlyFlight.zoneId)
        : undefined;
      if (targetZone) {
        setActiveZone(targetZone);
      }
      return;
    }

    setActiveFlightId('multi');
    setSelectedHeaderFlightIds(nextIds);
  };

  // Clear header flight selection and automatically select the first flight in the sorted list
  const handleResetHeaderFlightToFirst = () => {
    const firstFlight = headerSortedSurveys[0];
    setSelectedHeaderFlightIds([]);
    if (!firstFlight) {
      setActiveFlightId(0);
      return;
    }
    setActiveFlightId(firstFlight.id);
    const targetZone = currentQuarryZones.find((z) => z.id === firstFlight.zoneId);
    if (targetZone) {
      setActiveZone(targetZone);
    }
    showToast(
      'Selección Limpiada',
      `Seleccionado el primer vuelo del listado: ${firstFlight.flightCode} (${formatDateEu(firstFlight.surveyDate)}).`
    );
  };

  // Quarries visible to the active user (clients ONLY see their own quarries; admins can filter by selected client)
  const visibleQuarries = useMemo(() => {
    if (authenticatedRole === 'admin') {
      return adminSelectedClientId === 'all'
        ? quarries
        : quarries.filter((q) => q.clientId === adminSelectedClientId);
    }
    if (!loggedClientId) return [];
    return quarries.filter((q) => q.clientId === loggedClientId);
  }, [quarries, authenticatedRole, loggedClientId, adminSelectedClientId]);

  const isAllQuarries = selectedQuarryId === 'all' && visibleQuarries.length > 0;

  const activeQuarry = useMemo(() => {
    if (selectedQuarryId === 'all') return null;
    return visibleQuarries.find((q) => q.id === selectedQuarryId) || null;
  }, [selectedQuarryId, visibleQuarries]);

  const scopedQuarries = useMemo(() => {
    if (selectedQuarryId === 'all') return visibleQuarries;
    return activeQuarry ? [activeQuarry] : [];
  }, [selectedQuarryId, visibleQuarries, activeQuarry]);

  const hasQuarryScope = scopedQuarries.length > 0;

  const scopedQuarryIds = useMemo(
    () => new Set(scopedQuarries.map((q) => q.id)),
    [scopedQuarries]
  );

  // Apply quarry selection state (shared by header selector, admin client switch, and admin directory)
  const selectQuarryRecord = (q: Quarry | 'all' | null, notifyChange = true) => {
    setActiveZoneFilter('all');
    setSelectedHeaderFlightIds([]);

    if (q === 'all') {
      setSelectedQuarryId('all');
      const vIds = new Set(visibleQuarries.map((item) => item.id));
      const allZones = zones.filter((z) => vIds.has(z.quarryId));
      const allZoneIds = new Set(allZones.map((z) => z.id));
      const sortedAllSurvs = sortSurveysNewestFirst(
        surveys.filter((s) => allZoneIds.has(s.zoneId))
      );
      const firstSurvey = sortedAllSurvs[0];
      const firstZone =
        (firstSurvey && allZones.find((z) => z.id === firstSurvey.zoneId)) ||
        allZones[0] ||
        null;
      setActiveZone(firstZone);
      setActiveFlightId(firstSurvey ? firstSurvey.id : 0);
      if (notifyChange) {
        showToast('Todas las Explotaciones', `Mostrando ${visibleQuarries.length} explotación(es) asignadas.`);
      }
      return;
    }

    if (!q) {
      setSelectedQuarryId('all');
      setActiveZone(null);
      setActiveFlightId(0);
      return;
    }

    setSelectedQuarryId(q.id);
    const qZones = zones.filter((z) => z.quarryId === q.id);
    if (qZones.length > 0) {
      const qZoneIds = new Set(qZones.map((z) => z.id));
      const sortedQSurveys = sortSurveysNewestFirst(
        surveys.filter((s) => qZoneIds.has(s.zoneId))
      );
      const firstSurvey = sortedQSurveys[0];
      const matchedZone =
        (firstSurvey && qZones.find((z) => z.id === firstSurvey.zoneId)) || qZones[0];
      setActiveZone(matchedZone);
      setActiveFlightId(firstSurvey ? firstSurvey.id : 0);
    } else {
      setActiveZone(null);
      setActiveFlightId(0);
    }
    if (notifyChange) {
      showToast('Explotación Cambiada', `Cargada ${q.name}`);
    }
  };

  // Change active quarry (single or all within visibleQuarries)
  const handleQuarryChange = (selection: number | 'all') => {
    if (selection === 'all') {
      if (activeTab === 'tab-viewer3d') {
        const fallbackQuarry = activeQuarry || visibleQuarries[0] || null;
        if (fallbackQuarry) {
          selectQuarryRecord(fallbackQuarry, false);
        }
        showToast(
          'Vista Individual en Visor 3D',
          'El Visor 3D solo permite visualizar una única cantera a la vez.'
        );
        return;
      }
      selectQuarryRecord('all', true);
      return;
    }
    const q = visibleQuarries.find((item) => item.id === selection);
    if (!q) return;
    selectQuarryRecord(q, true);
  };

  // Admin-only: switch inspected client from header
  const handleAdminClientChange = (clientSelection: number | 'all') => {
    if (authenticatedRole !== 'admin') return;
    setAdminSelectedClientId(clientSelection);

    const scoped =
      clientSelection === 'all'
        ? quarries
        : quarries.filter((q) => q.clientId === clientSelection);
    const firstQuarry = scoped[0] || null;
    selectQuarryRecord(firstQuarry, false);

    if (clientSelection === 'all') {
      showToast('Vista Global Admin', 'Mostrando las explotaciones de todos los clientes.');
    } else {
      const targetClient = clients.find((c) => c.id === clientSelection);
      showToast(
        'Cliente Seleccionado',
        `Visualizando datos de ${targetClient?.name || 'cliente'}${firstQuarry ? ` (${firstQuarry.name})` : ''}.`
      );
    }
  };

  // Zones mapped strictly to active quarry selection (single or all visible)
  const currentQuarryZones = useMemo(() => {
    if (!hasQuarryScope) return [];
    return zones.filter((z) => scopedQuarryIds.has(z.quarryId));
  }, [zones, hasQuarryScope, scopedQuarryIds]);

  // Filtered surveys & stockpiles for active quarry scope
  const currentSurveys = useMemo(() => {
    if (!hasQuarryScope) return [];
    const qZoneIds = new Set(currentQuarryZones.map((z) => z.id));
    return surveys.filter((s) => qZoneIds.has(s.zoneId));
  }, [surveys, currentQuarryZones, hasQuarryScope]);

  const headerSortedSurveys = useMemo(
    () => sortSurveysNewestFirst(currentSurveys),
    [currentSurveys]
  );

  const currentStockpiles = useMemo(() => {
    const surveyIds = new Set(currentSurveys.map((s) => s.id));
    return stockpiles.filter((st) => surveyIds.has(st.surveyId));
  }, [stockpiles, currentSurveys]);

  const isAdminView = authenticatedRole === 'admin' && currentUserRole === 'admin';

  // Status-filtered surveys for Tab 1 (Listado de Vuelos shows all flights of the header-selected Explotación; status filter applies to admins only)
  const displayedSurveys = useMemo(() => {
    if (!isAdminView || flightStatusFilter === 'all') return currentSurveys;
    return currentSurveys.filter((s) => (s.status || 'archived') === flightStatusFilter);
  }, [currentSurveys, flightStatusFilter, isAdminView]);

  const sortedDisplayedSurveys = useMemo(() => {
    return sortRowsBy(displayedSurveys, flightsTableSort, (flight, key) => {
      switch (key) {
        case 'flightCode':
          return flight.flightCode;
        case 'mission':
          return flight.notes || flight.flightCode;
        case 'surveyDate': {
          const ts = parseDateTimestamp(flight.surveyDate);
          return Number.isFinite(ts) ? ts : null;
        }
        case 'zone':
          return currentQuarryZones.find((z) => z.id === flight.zoneId)?.name || '';
        case 'status':
          return isAdminView ? flight.status || 'archived' : '';
        case 'volume':
          return flight.fillVolumeM3;
        case 'gsd':
          return flight.groundResolutionCm || 1.8;
        default:
          return '';
      }
    });
  }, [displayedSurveys, flightsTableSort, currentQuarryZones, isAdminView]);

  // Status counts for visual filtering chips
  const flightStatusCounts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let archived = 0;
    currentSurveys.forEach((s) => {
      const st = s.status || 'archived';
      if (st === 'active') active++;
      else if (st === 'pending') pending++;
      else if (st === 'archived') archived++;
    });
    return { all: currentSurveys.length, active, pending, archived };
  }, [currentSurveys]);

  const isAllFlights = activeFlightId === 'all' && currentSurveys.length > 0;
  const isMultiFlights =
    activeFlightId === 'multi' &&
    selectedHeaderFlightIds.some((id) => currentSurveys.some((s) => s.id === id)) &&
    currentSurveys.length > 0;

  const activeFlight = useMemo(() => {
    if (activeFlightId === 'all' || activeFlightId === 'multi') return undefined;
    return (
      headerSortedSurveys.find((s) => s.id === activeFlightId) ||
      headerSortedSurveys[0]
    );
  }, [headerSortedSurveys, activeFlightId]);

  // Resolved list of flights currently selected in the header (1 flight, N selected flights, or all flights)
  const headerSelectedSurveys = useMemo(() => {
    if (currentSurveys.length === 0) return [];
    if (activeFlightId === 'all') return currentSurveys;
    if (activeFlightId === 'multi') {
      const idSet = new Set(selectedHeaderFlightIds);
      const matched = currentSurveys.filter((s) => idSet.has(s.id));
      return matched.length > 0 ? matched : currentSurveys;
    }
    return activeFlight ? [activeFlight] : [];
  }, [currentSurveys, activeFlightId, selectedHeaderFlightIds, activeFlight]);

  const headerSelectedSurveyIds = useMemo(
    () => new Set(headerSelectedSurveys.map((s) => s.id)),
    [headerSelectedSurveys]
  );

  const headerFlightSelectionIds = useMemo(() => {
    if (isAllFlights) return [];
    if (isMultiFlights) {
      const validIds = new Set(currentSurveys.map((s) => s.id));
      return selectedHeaderFlightIds.filter((id) => validIds.has(id));
    }
    return activeFlight ? [activeFlight.id] : [];
  }, [isAllFlights, isMultiFlights, selectedHeaderFlightIds, currentSurveys, activeFlight]);

  const headerMultiFlightPreview = useMemo(() => {
    if (!isMultiFlights) return '';
    const codes = headerSelectedSurveys.map((s) => s.flightCode);
    return `${codes.slice(0, 2).join(', ')}${codes.length > 2 ? '…' : ''}`;
  }, [isMultiFlights, headerSelectedSurveys]);

  // Aggregate stats (reflects the single, multiple, or all flights selected in the header)
  const totals = useMemo(() => {
    let totalFill = 0;
    let totalCut = 0;
    let totalTonnage = 0;

    const sourceSurveys = headerSelectedSurveys.length > 0 ? headerSelectedSurveys : currentSurveys;
    sourceSurveys.forEach((s) => {
      totalFill += s.fillVolumeM3;
      totalCut += s.cutVolumeM3;
      totalTonnage += s.tonnageEst;
    });

    return { totalFill, totalCut, totalTonnage };
  }, [headerSelectedSurveys, currentSurveys]);

  const filteredQuarryZones = useMemo(() => {
    if (activeZoneFilter === 'all') return currentQuarryZones;
    const matched = currentQuarryZones.filter((z) => z.name === activeZoneFilter);
    return matched.length > 0 ? matched : currentQuarryZones;
  }, [currentQuarryZones, activeZoneFilter]);

  const activeClient = useMemo(() => {
    if (activeQuarry) {
      return clients.find((c) => c.id === activeQuarry.clientId) || null;
    }
    if (authenticatedRole === 'admin' && adminSelectedClientId !== 'all') {
      return clients.find((c) => c.id === adminSelectedClientId) || null;
    }
    if (authenticatedRole !== 'admin' && loggedClientId) {
      return clients.find((c) => c.id === loggedClientId) || null;
    }
    if (scopedQuarries.length === 1) {
      return clients.find((c) => c.id === scopedQuarries[0].clientId) || null;
    }
    return null;
  }, [clients, activeQuarry, scopedQuarries, authenticatedRole, loggedClientId, adminSelectedClientId]);

  const canAccessViewer3d = useMemo(() => {
    if (authenticatedRole === 'admin' && currentUserRole === 'admin') {
      return true;
    }
    return Boolean(activeClient?.viewer3dEnabled);
  }, [authenticatedRole, currentUserRole, activeClient]);

  // Prevent unauthorized access to Admin tabs or disabled Visor 3D tab
  useEffect(() => {
    if (
      authenticatedRole !== 'admin' &&
      (activeTab === 'tab-clients-admin' || activeTab === 'tab-settings')
    ) {
      setActiveTab('tab-flights');
    } else if (!canAccessViewer3d && activeTab === 'tab-viewer3d') {
      setActiveTab('tab-flights');
    }
  }, [authenticatedRole, canAccessViewer3d, activeTab]);

  const consolidatedQuarryForExport = useMemo<Quarry | null>(() => {
    if (activeQuarry) return activeQuarry;
    if (scopedQuarries.length === 0) return null;
    const uniqueLocations = Array.from(new Set(scopedQuarries.map((q) => q.location).filter(Boolean)));
    return {
      id: 0,
      clientId: activeClient?.id || scopedQuarries[0].clientId,
      name: `Todas las Explotaciones (${scopedQuarries.length})`,
      code: activeClient ? `ALL-${activeClient.cif.replace(/[^A-Z0-9]/gi, '').slice(0, 6)}` : 'INGEODRON-ALL',
      location: uniqueLocations.slice(0, 2).join(' / ') || 'Multi-ubicación',
      status: 'active',
    };
  }, [activeQuarry, scopedQuarries, activeClient]);

  // Strictly single-quarry & single-flight scope for the 3D Viewer (never multiple/all quarries)
  const viewer3DQuarry = useMemo<Quarry | null>(() => {
    if (activeQuarry) return activeQuarry;
    return visibleQuarries[0] || null;
  }, [activeQuarry, visibleQuarries]);

  const viewer3DZones = useMemo(() => {
    if (!viewer3DQuarry) return [];
    return zones.filter((z) => z.quarryId === viewer3DQuarry.id);
  }, [zones, viewer3DQuarry]);

  const viewer3DSurveys = useMemo(() => {
    const zIds = new Set(viewer3DZones.map((z) => z.id));
    return surveys.filter((s) => zIds.has(s.zoneId));
  }, [surveys, viewer3DZones]);

  const headerSortedViewer3DSurveys = useMemo(
    () => sortSurveysNewestFirst(viewer3DSurveys),
    [viewer3DSurveys]
  );

  const viewer3DFlight = useMemo(() => {
    if (activeFlight && headerSortedViewer3DSurveys.some((s) => s.id === activeFlight.id)) {
      return activeFlight;
    }
    if (activeFlightId === 'multi' && selectedHeaderFlightIds.length > 0) {
      const firstSelected = headerSortedViewer3DSurveys.find((s) =>
        selectedHeaderFlightIds.includes(s.id)
      );
      if (firstSelected) return firstSelected;
    }
    return headerSortedViewer3DSurveys[0];
  }, [activeFlight, activeFlightId, selectedHeaderFlightIds, headerSortedViewer3DSurveys]);

  const viewer3DStockpiles = useMemo(() => {
    const sIds = new Set(viewer3DSurveys.map((s) => s.id));
    return stockpiles.filter((st) => sIds.has(st.surveyId));
  }, [stockpiles, viewer3DSurveys]);

  const viewer3DDeliverables = useMemo(() => {
    if (!viewer3DQuarry) return [];
    return deliverables.filter((d) => d.quarryId === viewer3DQuarry.id);
  }, [deliverables, viewer3DQuarry]);

  // Auto-switch from "Todas las explotaciones" / "Todos los vuelos" / multi-flight to a single quarry/flight on entering Visor 3D
  useEffect(() => {
    if (activeTab !== 'tab-viewer3d') return;
    if (visibleQuarries.length === 0) return;

    if (selectedQuarryId === 'all' || !activeQuarry) {
      selectQuarryRecord(visibleQuarries[0], false);
      return;
    }

    if ((activeFlightId === 'all' || activeFlightId === 'multi') && viewer3DFlight) {
      setActiveFlightId(viewer3DFlight.id);
      setSelectedHeaderFlightIds([]);
      const targetZone = viewer3DZones.find((z) => z.id === viewer3DFlight.zoneId);
      if (targetZone) {
        setActiveZone(targetZone);
      }
    }
  }, [activeTab, selectedQuarryId, activeQuarry, visibleQuarries, activeFlightId, viewer3DFlight, viewer3DZones]);

  // Deliverables strictly for active quarry selection
  const currentDeliverables = useMemo(() => {
    if (!hasQuarryScope) return [];
    return deliverables.filter((d) => scopedQuarryIds.has(d.quarryId));
  }, [deliverables, hasQuarryScope, scopedQuarryIds]);

  // Official Deliverables strictly filtered by header selection: Cliente + Explotación + Vuelo
  const officialDeliverables = useMemo(() => {
    if (!hasQuarryScope) return [];

    const expectedClientId =
      authenticatedRole !== 'admin'
        ? loggedClientId
        : adminSelectedClientId !== 'all'
          ? adminSelectedClientId
          : activeQuarry?.clientId ?? null;

    const expectedClient = expectedClientId
      ? clients.find((c) => c.id === expectedClientId) || null
      : null;
    const expectedClientFolder = expectedClient
      ? buildClientFolderName(expectedClient.code, expectedClient.name, expectedClient.id)
      : null;
    const expectedClientCode = expectedClient?.code?.trim().toLowerCase() || '';

    const quarryById = new Map(scopedQuarries.map((q) => [q.id, q]));
    const currentSurveyIds = new Set(currentSurveys.map((s) => s.id));

    return deliverables.filter((d) => {
      // 1. Cliente y Explotación seleccionados en la cabecera
      const matchedQuarry = quarryById.get(Number(d.quarryId));
      if (!matchedQuarry) return false;
      if (expectedClientId !== null && matchedQuarry.clientId !== expectedClientId) {
        return false;
      }
      if (expectedClient && d.isServerStored) {
        const itemCode = d.clientCode?.trim().toLowerCase() || '';
        const folderMatches = Boolean(expectedClientFolder && d.clientFolder === expectedClientFolder);
        const codeMatches = Boolean(expectedClientCode && itemCode && itemCode === expectedClientCode);
        if ((d.clientFolder || itemCode) && !folderMatches && !codeMatches) {
          return false;
        }
      }

      // 2. Vuelo(s) seleccionado(s) en la cabecera
      if (isAllFlights) {
        return d.surveyId ? currentSurveyIds.has(Number(d.surveyId)) : true;
      }

      if (isMultiFlights) {
        return d.surveyId ? headerSelectedSurveyIds.has(Number(d.surveyId)) : false;
      }

      if (!activeFlight) {
        return false;
      }

      return Number(d.surveyId) === activeFlight.id;
    });
  }, [
    deliverables,
    hasQuarryScope,
    authenticatedRole,
    loggedClientId,
    adminSelectedClientId,
    activeQuarry,
    clients,
    scopedQuarries,
    currentSurveys,
    isAllFlights,
    isMultiFlights,
    headerSelectedSurveyIds,
    activeFlight,
  ]);

  // Shared single source of truth for the "Desglose de Acopios por Zona y Vuelo" table AND its PDF export
  // Strictly reflects the flights selected in the header flight selector (filtered by zone if selected)
  const tableFilteredSurveys = useMemo(() => {
    const filteredZoneIds = new Set(filteredQuarryZones.map((z) => z.id));
    return headerSelectedSurveys.filter((s) => filteredZoneIds.has(s.zoneId));
  }, [filteredQuarryZones, headerSelectedSurveys]);

  const tableSortedStockpileRows = useMemo(() => {
    const targetSurveyIds = new Set(tableFilteredSurveys.map((s) => s.id));
    const rawRows = currentStockpiles
      .filter((st) => targetSurveyIds.has(st.surveyId))
      .map((st) => {
        const survey = currentSurveys.find((s) => s.id === st.surveyId);
        const zone = survey
          ? currentQuarryZones.find((z) => z.id === survey.zoneId)
          : undefined;
        return { st, survey, zone };
      });

    return sortRowsBy(rawRows, stockpilesTableSort, (r, key) => {
      switch (key) {
        case 'code':
          return r.st.code;
        case 'name':
          return r.st.name;
        case 'flight':
          return r.survey?.flightCode || '';
        case 'zone':
          return r.zone?.name || '';
        case 'material':
          return r.st.material;
        case 'density':
          return r.st.densityTonM3 || 1.68;
        case 'fill':
          return r.st.fillVolumeM3;
        case 'cut':
          return r.st.cutVolumeM3;
        case 'net':
          return r.st.netVolumeM3;
        default:
          return '';
      }
    });
  }, [
    tableFilteredSurveys,
    currentStockpiles,
    currentSurveys,
    currentQuarryZones,
    stockpilesTableSort,
  ]);

  const tableFilteredStockpiles = useMemo(
    () => tableSortedStockpileRows.map((r) => r.st),
    [tableSortedStockpileRows]
  );

  const tableFilteredZones = useMemo(() => {
    if (tableSortedStockpileRows.length > 0) {
      const rowZoneIds = new Set(
        tableSortedStockpileRows
          .map((r) => r.zone?.id ?? r.survey?.zoneId)
          .filter((id): id is number => typeof id === 'number')
      );
      return filteredQuarryZones.filter((z) => rowZoneIds.has(z.id));
    }
    if (tableFilteredSurveys.length > 0) {
      const surveyZoneIds = new Set(tableFilteredSurveys.map((s) => s.zoneId));
      return filteredQuarryZones.filter((z) => surveyZoneIds.has(z.id));
    }
    return [];
  }, [filteredQuarryZones, tableSortedStockpileRows, tableFilteredSurveys]);

  const tableFilterSummary = useMemo(() => {
    const zonePart =
      activeZoneFilter === 'all' ? 'Todas las zonas' : `Zona ${activeZoneFilter}`;
    const flightPart = isAllFlights
      ? 'Todos los vuelos'
      : isMultiFlights
        ? `${headerSelectedSurveys.length} vuelos (${headerMultiFlightPreview})`
        : `Vuelo (${activeFlight?.flightCode || 'N/D'})`;
    return `Filtro tabla: ${zonePart} · ${flightPart}`;
  }, [
    activeZoneFilter,
    isAllFlights,
    isMultiFlights,
    headerSelectedSurveys.length,
    headerMultiFlightPreview,
    activeFlight,
  ]);

  // Zone Create & Edit (1 Quarry -> 1..N Zones unique to that Quarry)
  const handleOpenAddZone = () => {
    const defaultQuarry = activeQuarry || scopedQuarries[0];
    if (!defaultQuarry) return;
    setModalZoneData({
      id: 'new',
      quarryId: defaultQuarry.id,
      name: '',
      code: `ZON-${Math.floor(100 + Math.random() * 900)}`,
      status: 'active',
    });
    setShowZoneModal(true);
  };

  const handleOpenEditZone = (zone: Zone) => {
    setModalZoneData({
      id: zone.id.toString(),
      quarryId: zone.quarryId,
      name: zone.name,
      code: zone.code,
      status: zone.status || 'active',
    });
    setShowZoneModal(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetQuarry =
      quarries.find((q) => q.id === Number(modalZoneData.quarryId)) ||
      activeQuarry ||
      scopedQuarries[0];
    if (!targetQuarry) return;

    try {
      if (currentUserRole !== 'admin') {
        showToast('Acceso Limitado', 'Solo el administrador puede crear o editar zonas.');
        return;
      } else if (modalZoneData.id === 'new') {
        localDataStore.createZone({
          quarryId: targetQuarry.id,
          name: modalZoneData.name.trim(),
          code: modalZoneData.code.trim() || `ZON-${Math.floor(100 + Math.random() * 900)}`,
          status: modalZoneData.status,
        });
        showToast('Zona Creada', `Zona "${modalZoneData.name.trim()}" registrada en ${targetQuarry.name}.`);
      } else {
        const zId = parseInt(modalZoneData.id, 10);
        localDataStore.updateZone(zId, {
          name: modalZoneData.name.trim(),
          code: modalZoneData.code.trim(),
          status: modalZoneData.status,
        });
        showToast('Zona Actualizada', `Zona "${modalZoneData.name.trim()}" guardada correctamente.`);
      }
      setShowZoneModal(false);
      await fetchData();
    } catch (err: any) {
      showToast('Error de Zona', err.message || 'No se pudo guardar la zona.');
    }
  };

  const handleDeleteZone = (zone: Zone) => {
    if (authenticatedRole !== 'admin' || currentUserRole !== 'admin') return;
    const zSurveys = currentSurveys.filter((s) => s.zoneId === zone.id);
    const zSurveyIds = new Set(zSurveys.map((s) => s.id));
    const zStockpilesCount = currentStockpiles.filter((st) => zSurveyIds.has(st.surveyId)).length;

    const details: string[] = [
      `Se eliminará la zona "${zone.name}" (${zone.code}) del listado de zonas.`,
      zSurveys.length > 0
        ? `Se borrarán ${zSurveys.length} vuelo(s) vinculados de la lista de vuelos.`
        : 'No hay vuelos vinculados a esta zona.',
    ];
    if (zStockpilesCount > 0) {
      details.push(`Se eliminarán ${zStockpilesCount} acopio(s) asociados a esos vuelos.`);
    }

    setConfirmDialog({
      open: true,
      title: 'Eliminar Zona y Vuelos Vinculados',
      message: `¿Seguro que deseas eliminar por completo la zona "${zone.name}"? Esta acción no se puede deshacer.`,
      details,
      confirmLabel: 'Eliminar Zona',
      onConfirm: async () => {
        const result = localDataStore.deleteZone(zone.id);
        if (activeZoneFilter === zone.name) setActiveZoneFilter('all');
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        await fetchData();
        showToast(
          'Zona Eliminada',
          result.deletedSurveysCount > 0
            ? `Se ha borrado "${zone.name}" junto con ${result.deletedSurveysCount} vuelo(s) y ${result.deletedStockpilesCount} acopio(s).`
            : `La zona "${zone.name}" ha sido eliminada.`
        );
      },
    });
  };

  // Stockpile (Acopio) Create & Edit (1 Survey -> 1..N Stockpiles)
  const clearPendingStockpilePhoto = () => {
    if (pendingStockpilePhotoPreview && pendingStockpilePhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(pendingStockpilePhotoPreview);
    }
    setPendingStockpilePhotoFile(null);
    setPendingStockpilePhotoPreview('');
  };

  const resolveStockpileUploadContext = (surveyId: number) => {
    const survey = surveys.find((s) => s.id === surveyId);
    const zone = survey ? zones.find((z) => z.id === survey.zoneId) : undefined;
    const quarry = zone ? quarries.find((q) => q.id === zone.quarryId) : undefined;
    const client = quarry ? clients.find((c) => c.id === quarry.clientId) : undefined;
    return {
      surveyId,
      clientId: client?.id ?? quarry?.clientId,
      clientCode: client?.code,
      clientName: client?.name,
      flightCode: survey?.flightCode,
      flightNotes: survey?.notes,
    };
  };

  const handleSelectModalStockpilePhoto = (file: File | null | undefined) => {
    if (!file) return;
    try {
      validateStockpilePhotoFile(file);
      if (pendingStockpilePhotoPreview && pendingStockpilePhotoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(pendingStockpilePhotoPreview);
      }
      const objectUrl = URL.createObjectURL(file);
      setPendingStockpilePhotoFile(file);
      setPendingStockpilePhotoPreview(objectUrl);
      setModalStockpileData((prev) => ({
        ...prev,
        photoFileName: buildRenamedStockpilePhotoFileName(prev.zoneName, prev.name, file.name),
      }));
    } catch (err: any) {
      showToast('Imagen no válida', err.message || 'Selecciona una imagen JPG, PNG o WebP válida.');
    }
  };

  const handleQuickUploadStockpilePhoto = async (stockpile: Stockpile, file: File | null | undefined) => {
    if (!file || currentUserRole !== 'admin') return;
    try {
      setUploadingStockpilePhotoId(stockpile.id);
      const ctx = resolveStockpileUploadContext(stockpile.surveyId);
      const uploaded = await uploadStockpilePhoto({
        stockpileId: stockpile.id,
        file,
        stockpileName: stockpile.name,
        stockpileCode: stockpile.code,
        ...ctx,
      });
      localDataStore.updateStockpile(stockpile.id, {
        photoUrl: uploaded.photoUrl,
        photoFileName: uploaded.photoFileName,
      });
      await fetchData();
      showToast(
        'Fotografía Guardada',
        `Foto "${uploaded.photoFileName}" asociada al acopio ${stockpile.name}.`
      );
    } catch (err: any) {
      showToast('Error al Subir Foto', err.message || 'No se pudo subir la fotografía del acopio.');
    } finally {
      setUploadingStockpilePhotoId(null);
    }
  };

  const handleDownloadStockpilePhoto = async (
    stockpile: Pick<Stockpile, 'id' | 'code' | 'name' | 'photoUrl' | 'photoFileName'>
  ) => {
    try {
      const fileName = await downloadStockpilePhoto(stockpile);
      showToast('Foto Descargada', `Fotografía "${fileName}" descargada correctamente.`);
    } catch (err: any) {
      showToast('Error al Descargar Foto', err.message || 'No se pudo descargar la fotografía del acopio.');
    }
  };

  const handleOpenAddStockpile = (presetSurveyId?: number) => {
    const targetSurveyId = presetSurveyId || activeFlight?.id || currentSurveys[0]?.id;
    if (!targetSurveyId) {
      showToast('Vuelo Requerido', 'Primero debes registrar un vuelo en una zona para añadir acopios.');
      return;
    }
    clearPendingStockpilePhoto();
    setModalStockpileData({
      id: 'new',
      surveyId: targetSurveyId,
      zoneName: '',
      name: `ACO-${targetSurveyId}-${Math.floor(10 + Math.random() * 90)}`,
      stockpileType: 'stockpile',
      baseElevationM: 115.0,
      areaM2: 2980,
      material: 'Grava 20/40',
      densidad: 1.68,
      relleno: 18500,
      desmonte: 0,
      notes: '',
      photoUrl: '',
      photoFileName: '',
    });
    setShowStockpileModal(true);
  };

  const handleOpenEditStockpile = (stockpile: Stockpile) => {
    clearPendingStockpilePhoto();
    const fallbackArea = Math.max(
      25,
      Math.round(Math.max(Math.abs(stockpile.fillVolumeM3 || 0), Math.abs(stockpile.cutVolumeM3 || 0)) / 6.2)
    );
    setModalStockpileData({
      id: stockpile.id.toString(),
      surveyId: stockpile.surveyId,
      zoneName: stockpile.name,
      name: stockpile.code,
      stockpileType: stockpile.stockpileType || 'stockpile',
      baseElevationM: stockpile.baseElevationM ?? 115.0,
      areaM2: stockpile.areaM2 ?? fallbackArea,
      material: stockpile.material,
      densidad: stockpile.densityTonM3 || 1.68,
      relleno: stockpile.fillVolumeM3,
      desmonte: stockpile.cutVolumeM3,
      notes: stockpile.notes || '',
      photoUrl: stockpile.photoUrl || '',
      photoFileName: stockpile.photoFileName || '',
    });
    setShowStockpileModal(true);
  };

  const handleQuickUpdateStockpileDensity = async (stockpile: Stockpile, nextDensity: number) => {
    try {
      const clamped = Math.max(0.1, Math.min(10, Math.round(nextDensity * 100) / 100));
      const updated = localDataStore.updateStockpile(stockpile.id, { densityTonM3: clamped });
      await fetchData();
      if (updated) {
        showToast(
          'Densidad Actualizada',
          `${stockpile.name}: ${formatEsNumber(clamped, 2)} t/m³ → ${formatEsNumber(updated.tonnageEst, 1)} t`
        );
      }
    } catch (err: any) {
      showToast('Error de Densidad', err.message || 'No se pudo actualizar la densidad.');
    }
  };

  const handleSaveStockpile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasQuarryScope) return;

    const density = Math.max(0.1, Math.min(10, Number(modalStockpileData.densidad) || 1.68));
    const baseElev = Number(modalStockpileData.baseElevationM) || 0;
    const fillVol = Number(modalStockpileData.relleno) || 0;
    const cutVol = Number(modalStockpileData.desmonte) || 0;
    const netVol = fillVol - cutVol;
    const calculatedTonnage = Math.round(Math.abs(netVol) * density * 10) / 10;

    try {
      if (currentUserRole !== 'admin') {
        if (modalStockpileData.id === 'new') {
          showToast('Acceso Limitado', 'Solo el administrador puede crear nuevos acopios.');
          return;
        }
        const stId = parseInt(modalStockpileData.id, 10);
        const nextMaterial = modalStockpileData.material.trim() || 'Material personalizado';
        const updated = localDataStore.updateStockpile(stId, {
          material: nextMaterial,
          densityTonM3: density,
        });
        const finalTons = updated?.tonnageEst ?? calculatedTonnage;
        showToast(
          'Material y Densidad Actualizados',
          `${modalStockpileData.zoneName}: ${nextMaterial} (${formatEsNumber(density, 2)} t/m³) → ${formatEsNumber(finalTons, 1)} t.`
        );
      } else if (modalStockpileData.id === 'new') {
        const targetSurveyId = Number(modalStockpileData.surveyId);
        const targetCode =
          modalStockpileData.name.trim() || `ACO-${targetSurveyId}-${Math.floor(10 + Math.random() * 90)}`;
        const created = localDataStore.createStockpile({
          surveyId: targetSurveyId,
          name: modalStockpileData.zoneName.trim(),
          code: targetCode,
          stockpileType: modalStockpileData.stockpileType,
          material: modalStockpileData.material.trim(),
          densityTonM3: density,
          baseElevationM: baseElev,
          areaM2: Math.max(0, Math.round(Number(modalStockpileData.areaM2) || 0)),
          fillVolumeM3: fillVol,
          cutVolumeM3: cutVol,
          notes: modalStockpileData.notes.trim(),
        });
        if (pendingStockpilePhotoFile) {
          const ctx = resolveStockpileUploadContext(targetSurveyId);
          const uploaded = await uploadStockpilePhoto({
            stockpileId: created.id,
            file: pendingStockpilePhotoFile,
            stockpileName: created.name,
            stockpileCode: created.code,
            ...ctx,
          });
          localDataStore.updateStockpile(created.id, {
            photoUrl: uploaded.photoUrl,
            photoFileName: uploaded.photoFileName,
          });
        }
        showToast(
          'Acopio Registrado',
          `Acopio '${modalStockpileData.zoneName.trim()}' añadido al vuelo (${formatEsNumber(density, 2)} t/m³ → ${formatEsNumber(calculatedTonnage)} t).`
        );
      } else {
        const stId = parseInt(modalStockpileData.id, 10);
        const targetSurveyId = Number(modalStockpileData.surveyId);
        const prevStockpile = stockpiles.find((s) => s.id === stId);
        let nextPhotoUrl: string | undefined = modalStockpileData.photoUrl || undefined;
        let nextPhotoFileName: string | undefined = modalStockpileData.photoFileName || undefined;

        if (pendingStockpilePhotoFile) {
          const ctx = resolveStockpileUploadContext(targetSurveyId);
          const uploaded = await uploadStockpilePhoto({
            stockpileId: stId,
            file: pendingStockpilePhotoFile,
            stockpileName: modalStockpileData.zoneName.trim(),
            stockpileCode: modalStockpileData.name.trim(),
            ...ctx,
          });
          nextPhotoUrl = uploaded.photoUrl;
          nextPhotoFileName = uploaded.photoFileName;
        } else if (!nextPhotoUrl && prevStockpile?.photoUrl) {
          await deleteStockpilePhotoServer(stId);
          nextPhotoUrl = undefined;
          nextPhotoFileName = undefined;
        }

        localDataStore.updateStockpile(stId, {
          surveyId: targetSurveyId,
          name: modalStockpileData.zoneName.trim(),
          code: modalStockpileData.name.trim(),
          stockpileType: modalStockpileData.stockpileType,
          baseElevationM: baseElev,
          areaM2: Math.max(0, Math.round(Number(modalStockpileData.areaM2) || 0)),
          material: modalStockpileData.material.trim(),
          densityTonM3: density,
          fillVolumeM3: fillVol,
          cutVolumeM3: cutVol,
          notes: modalStockpileData.notes.trim(),
          photoUrl: nextPhotoUrl,
          photoFileName: nextPhotoFileName,
        });
        showToast(
          'Acopio Actualizado',
          `${modalStockpileData.zoneName} actualizado (${formatEsNumber(density, 2)} t/m³ → ${formatEsNumber(calculatedTonnage)} t).`
        );
      }

      clearPendingStockpilePhoto();
      setShowStockpileModal(false);
      await fetchData();
    } catch (err: any) {
      showToast('Error en Acopio', err.message || 'No se pudo guardar el acopio.');
    }
  };

  const handleDeleteStockpile = (stockpile: Stockpile) => {
    setConfirmDialog({
      open: true,
      title: 'Eliminar Acopio',
      message: `¿Seguro que deseas eliminar el acopio "${stockpile.name}" (${stockpile.code})?`,
      details: ['Los totales del vuelo vinculado se recalcularán automáticamente.'],
      confirmLabel: 'Eliminar Acopio',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          localDataStore.deleteStockpile(stockpile.id);
          await deleteStockpilePhotoServer(stockpile.id);
          showToast('Acopio Eliminado', `El acopio "${stockpile.name}" ha sido borrado y el vuelo recalculado.`);
          await fetchData();
        } catch (err: any) {
          showToast('Acción No Permitida', err.message || 'Cada vuelo debe mantener al menos un acopio.');
        }
      },
    });
  };

  // Open Flight modal (Create or Edit)
  const handleOpenAddFlight = () => {
    const defaultZone = activeZone || currentQuarryZones[0];
    if (!defaultZone) {
      showToast('Zona Requerida', 'Crea primero una zona en esta explotación para registrar vuelos.');
      return;
    }
    setModalFlightData({
      id: 'new',
      zoneId: defaultZone.id,
      code: `VUE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      date: new Date().toISOString().slice(0, 10),
      title: 'Misión Fotogramétrica Ordinaria',
      droneModel: 'DJI Matrice 4E RTK',
      operator: 'INGEODRON',
      fillVolumeM3: 0,
      cutVolumeM3: 0,
      gsd: 1.8,
      status: 'active',
    });
    setModalFlightStockpiles([
      {
        name: `Acopio ${defaultZone.name}`,
        code: `ACO-${Math.floor(100 + Math.random() * 900)}`,
        material: 'Grava caliza',
        densityTonM3: 1.68,
        fillVolumeM3: 0,
        cutVolumeM3: 0,
      },
    ]);
    setShowAddFlightModal(true);
  };

  const handleOpenEditFlight = (flight: Survey) => {
    setModalFlightData({
      id: flight.id.toString(),
      zoneId: flight.zoneId,
      code: flight.flightCode,
      date: flight.surveyDate,
      title: flight.notes || '',
      droneModel: flight.droneModel || 'DJI Matrice 4E RTK',
      operator: flight.operator || 'INGEODRON',
      fillVolumeM3: flight.fillVolumeM3,
      cutVolumeM3: flight.cutVolumeM3,
      gsd: flight.groundResolutionCm || 1.8,
      status: flight.status || 'archived',
    });
    setShowAddFlightModal(true);
  };

  // Save new or edited flight
  const handleSaveFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetZoneId = Number(modalFlightData.zoneId) || activeZone?.id || currentQuarryZones[0]?.id;
    if (!targetZoneId) return;

    const gsd = Number(modalFlightData.gsd) || 1.8;

    try {
      if (modalFlightData.id === 'new') {
        const sanitizedStockpiles =
          modalFlightStockpiles.length > 0
            ? modalFlightStockpiles.map((st, idx) => ({
              name: st.name.trim() || `Acopio #${idx + 1}`,
              code: st.code.trim() || `ACO-${idx + 1}`,
              stockpileType: 'stockpile' as Stockpile['stockpileType'],
              material: st.material.trim() || 'Árido clasificado',
              densityTonM3: Math.max(0.1, Number(st.densityTonM3) || 1.68),
              baseElevationM: 115.0,
              fillVolumeM3: Number(st.fillVolumeM3) || 0,
              cutVolumeM3: Number(st.cutVolumeM3) || 0,
            }))
            : undefined;

        const fillTotal = sanitizedStockpiles
          ? sanitizedStockpiles.reduce((acc, st) => acc + st.fillVolumeM3, 0)
          : Number(modalFlightData.fillVolumeM3) || 0;
        const cutTotal = sanitizedStockpiles
          ? sanitizedStockpiles.reduce((acc, st) => acc + st.cutVolumeM3, 0)
          : Number(modalFlightData.cutVolumeM3) || 0;

        localDataStore.createSurvey(
          {
            zoneId: targetZoneId,
            status: modalFlightData.status,
            surveyDate: modalFlightData.date,
            flightCode: modalFlightData.code.trim(),
            droneModel: modalFlightData.droneModel.trim(),
            operator: modalFlightData.operator.trim(),
            cutVolumeM3: cutTotal,
            fillVolumeM3: fillTotal,
            pointCount: 320000,
            groundResolutionCm: gsd,
            notes: modalFlightData.title.trim(),
          },
          sanitizedStockpiles
        );

        showToast(
          'Vuelo Creado',
          `Nuevo vuelo ${modalFlightData.code} registrado con ${sanitizedStockpiles?.length || 1} acopio(s).`
        );
      } else {
        const flightId = parseInt(modalFlightData.id, 10);
        const childCount = currentStockpiles.filter((st) => st.surveyId === flightId).length;
        const fill = Number(modalFlightData.fillVolumeM3) || 0;
        const cut = Number(modalFlightData.cutVolumeM3) || 0;
        const updated = localDataStore.updateSurvey(flightId, {
          zoneId: targetZoneId,
          status: modalFlightData.status,
          surveyDate: modalFlightData.date,
          flightCode: modalFlightData.code.trim(),
          droneModel: modalFlightData.droneModel.trim(),
          operator: modalFlightData.operator.trim(),
          ...(childCount <= 1 ? { cutVolumeM3: cut, fillVolumeM3: fill } : {}),
          groundResolutionCm: gsd,
          notes: modalFlightData.title.trim(),
        });

        if (updated && updated.id === activeFlightId) {
          const z = currentQuarryZones.find((item) => item.id === updated.zoneId);
          if (z) {
            setActiveZone(z);
          }
        }

        showToast('Vuelo Actualizado', `Cambios guardados en ${modalFlightData.code}.`);
      }

      setShowAddFlightModal(false);
      await fetchData();
    } catch (err: any) {
      showToast('Error al Guardar Vuelo', err.message || 'No se pudo guardar el vuelo.');
    }
  };

  // Quick status toggle / change for flights
  const handleUpdateFlightStatus = (surveyId: number, newStatus: SurveyStatus) => {
    localDataStore.updateSurveyStatus(surveyId, newStatus);
    fetchData();
    showToast('Estado de Vuelo', `Vuelo actualizado a estado "${newStatus.toUpperCase()}"`);
  };

  // Delete an entire flight (survey + linked deliverables) — Admin only
  const handleDeleteFlight = (flight: Survey) => {
    if (authenticatedRole !== 'admin' || currentUserRole !== 'admin') return;

    const linkedDeliverablesCount = deliverables.filter((d) => d.surveyId === flight.id).length;
    const childStockpilesCount = currentStockpiles.filter((st) => st.surveyId === flight.id).length;
    const details = [
      `Vuelo ${flight.flightCode} (${formatDateEu(flight.surveyDate)})`,
      ...(childStockpilesCount > 0 ? [`Se eliminarán ${childStockpilesCount} acopio(s) vinculados.`] : []),
      ...(linkedDeliverablesCount > 0 ? [`Se eliminarán ${linkedDeliverablesCount} entregable(s) vinculados.`] : []),
    ];

    setConfirmDialog({
      open: true,
      title: 'Eliminar Vuelo',
      message: `¿Borrar por completo el vuelo "${flight.flightCode}" y su cubicación registrada?`,
      details,
      confirmLabel: 'Eliminar Vuelo',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          const linkedServerDeliverables = deliverables.filter(
            (d) => d.surveyId === flight.id && d.isServerStored
          );
          if (linkedServerDeliverables.length > 0) {
            await Promise.allSettled(
              linkedServerDeliverables.map((d) =>
                fetch(`/api/deliverables/${d.id}`, {
                  method: 'DELETE',
                  headers: getAuthHeaders(),
                })
              )
            );
          }
          localDataStore.deleteSurvey(flight.id);
          await fetchData();
          showToast(
            'Vuelo Eliminado',
            `El vuelo ${flight.flightCode} ha sido borrado por completo.`
          );
        } catch (err: any) {
          showToast('Error al Eliminar', err.message || 'No se pudo eliminar el vuelo.');
        }
      },
    });
  };

  useEffect(() => {
    if (!showUploadDeliverableModal) {
      setUploadConflictInfo(null);
      return;
    }
    const candidateFileName = modalUploadData.fileName.trim();
    if (!candidateFileName) {
      setUploadConflictInfo(null);
      return;
    }

    const targetQuarry =
      quarries.find((q) => q.id === Number(modalUploadData.quarryId)) ||
      activeQuarry ||
      scopedQuarries[0];
    const targetClient =
      clients.find((c) => c.id === targetQuarry?.clientId) || activeClient;
    const clientCode = targetClient?.code || 'C000';
    const clientName = targetClient?.name || 'Cliente General';
    const clientFolder = buildClientFolderName(clientCode, clientName, targetClient?.id);
    const targetFlight = surveys.find((s) => s.id === Number(modalUploadData.surveyId));
    const flightCode = targetFlight?.flightCode || 'GENERAL';
    const flightNotes = targetFlight?.notes || 'Vuelo';
    const flightSubFolder = buildFlightSubFolderName(flightCode, flightNotes);

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          clientCode,
          clientName,
          clientFolder,
          flightCode,
          flightNotes,
          fileName: candidateFileName,
        });
        const resp = await fetch(`/api/deliverables/check?${params.toString()}`, {
          headers: getAuthHeaders(),
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (cancelled) return;
        if (data?.exists) {
          const fallbackRelPath = `storage/${clientFolder}/${flightSubFolder}/${candidateFileName}`;
          setUploadConflictInfo({
            exists: true,
            fileName: data.fileName || candidateFileName,
            relativePath: data.relativePath || fallbackRelPath,
          });
        } else {
          setUploadConflictInfo(null);
        }
      } catch {
        if (!cancelled) setUploadConflictInfo(null);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    showUploadDeliverableModal,
    modalUploadData.fileName,
    modalUploadData.quarryId,
    modalUploadData.surveyId,
    surveys,
    quarries,
    clients,
    activeQuarry,
    scopedQuarries,
    activeClient,
  ]);

  const handleOpenUploadDeliverableModal = (defaultCategory: string | React.MouseEvent = 'pdf_report') => {
    const resolvedCategory = typeof defaultCategory === 'string' ? defaultCategory : 'pdf_report';
    const defaultQuarry = activeQuarry || scopedQuarries[0];
    setSelectedUploadFile(null);
    setUploadConflictInfo(null);
    setUploadProgress(0);
    setUploadStage('idle');
    setUploadErrorMessage('');
    setModalUploadData({
      quarryId: defaultQuarry?.id || 0,
      surveyId: activeFlight?.id || 0,
      category: resolvedCategory,
      fileName: '',
      title: '',
      fileSize: '',
    });
    setShowUploadDeliverableModal(true);
  };

  const handleSelectUploadFile = (file: File | null) => {
    setSelectedUploadFile(file);
    setUploadProgress(0);
    setUploadStage('idle');
    setUploadErrorMessage('');
    if (!file) return;

    const lower = file.name.toLowerCase();
    let detectedCategory = modalUploadData.category;
    if (lower.endsWith('.pdf')) detectedCategory = 'pdf_report';
    else if (lower.endsWith('.dxf') || lower.endsWith('.dwg')) detectedCategory = 'contour_dxf';
    else if (
      lower.endsWith('.las') ||
      lower.endsWith('.laz') ||
      lower.endsWith('.ply') ||
      lower.endsWith('.xyz') ||
      lower.endsWith('.pcd') ||
      lower.endsWith('.pts') ||
      lower.endsWith('.csv') ||
      lower.endsWith('.txt')
    ) {
      detectedCategory = 'pointcloud_las';
    } else if (
      lower.endsWith('.tif') ||
      lower.endsWith('.tiff') ||
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp')
    ) {
      detectedCategory = 'orthophoto';
    } else if (
      lower.endsWith('.obj') ||
      lower.endsWith('.glb') ||
      lower.endsWith('.gltf') ||
      lower.endsWith('.stl')
    ) {
      detectedCategory = 'mesh_obj';
    }

    const sizeFormatted =
      file.size < 1024 * 1024
        ? `${formatEsInt(Math.max(1, Math.round(file.size / 1024)))} KB`
        : `${formatEsNumber(file.size / (1024 * 1024), 1)} MB`;

    const baseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

    setModalUploadData((prev) => ({
      ...prev,
      category: detectedCategory,
      fileName: file.name,
      title: prev.title.trim() ? prev.title : baseTitle || file.name,
      fileSize: sizeFormatted,
    }));
  };

  const promptOverwriteConfirm = (
    targetQuarry: Quarry,
    clientCode: string,
    clientName: string,
    clientFolder: string,
    flightCode: string,
    flightNotes: string,
    fileName: string,
    relativePath: string
  ) => {
    setConfirmDialog({
      open: true,
      variant: 'warning',
      title: 'Archivo existente — ¿Sobrescribir?',
      message: `Ya existe un archivo llamado "${fileName}" en la subcarpeta del vuelo. Si continúas, se sobrescribirá el archivo anterior.`,
      details: [
        `Ruta afectada: ${relativePath}`,
        'Si prefieres conservar el archivo original, pulsa Cancelar y cambia el "Nombre del Archivo en Servidor".',
      ],
      confirmLabel: 'Sobrescribir Archivo',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        await performDeliverableUpload(
          targetQuarry,
          clientCode,
          clientName,
          clientFolder,
          flightCode,
          flightNotes,
          true
        );
      },
    });
  };

  const performDeliverableUpload = async (
    targetQuarry: Quarry,
    clientCode: string,
    clientName: string,
    clientFolder: string,
    flightCode: string,
    flightNotes: string,
    overwrite: boolean
  ) => {
    if (!selectedUploadFile) return;

    setIsUploadingDeliverable(true);
    setUploadProgress(0);
    setUploadStage('uploading');
    setUploadErrorMessage('');
    try {
      const targetFileName = modalUploadData.fileName.trim() || selectedUploadFile.name;
      const formData = new FormData();
      formData.append('quarryId', String(targetQuarry.id));
      if (modalUploadData.surveyId) {
        formData.append('surveyId', String(modalUploadData.surveyId));
      }
      formData.append('clientCode', clientCode);
      formData.append('clientName', clientName);
      formData.append('clientFolder', clientFolder);
      if (flightCode) {
        formData.append('flightCode', flightCode);
      }
      if (flightNotes) {
        formData.append('flightNotes', flightNotes);
      }
      formData.append('title', modalUploadData.title.trim() || selectedUploadFile.name);
      formData.append('category', modalUploadData.category);
      formData.append('fileName', targetFileName);
      formData.append('crs', 'ETRS89 / UTM zone 30N (EPSG:25830)');
      formData.append('overwrite', overwrite ? 'true' : 'false');
      formData.append('file', selectedUploadFile);

      const { status, ok, payload } = await uploadFormDataWithProgress(
        '/api/deliverables/upload',
        formData,
        getAuthHeaders(),
        (pct) => setUploadProgress(pct)
      );

      if (status === 409 && payload?.code === 'FILE_EXISTS' && !overwrite) {
        setUploadStage('idle');
        setUploadProgress(0);
        promptOverwriteConfirm(
          targetQuarry,
          clientCode,
          clientName,
          clientFolder,
          flightCode,
          flightNotes,
          payload.fileName || targetFileName,
          payload.relativePath ||
          `storage/${clientFolder}/${flightCode ? `${buildFlightSubFolderName(flightCode, flightNotes)}/` : ''}${targetFileName}`
        );
        return;
      }

      if (status === 401) {
        throw new Error(
          'Tu sesión en el servidor ha caducado o no tiene token de acceso. Cierra sesión e inicia sesión de nuevo para subir archivos.'
        );
      }

      if (!ok) {
        throw new Error(payload?.error || 'No se pudo almacenar el archivo en el servidor.');
      }

      const saved: Deliverable | undefined = payload?.deliverable;
      if (!saved?.id) {
        throw new Error('El servidor no devolvió el registro del archivo subido.');
      }

      // Verify physically on server that the uploaded file exists and is readable
      setUploadStage('verifying');
      setUploadProgress(100);
      const verifyResp = await fetch(`/api/deliverables/${saved.id}/verify`, {
        headers: getAuthHeaders(),
      });
      const verifyData = await verifyResp.json().catch(() => ({}));
      if (!verifyResp.ok || !verifyData?.verified || !verifyData?.hasPhysicalFile) {
        throw new Error(
          verifyData?.error ||
          'El archivo se envió, pero no se pudo verificar su presencia física en el servidor.'
        );
      }

      const verifiedDeliverable: Deliverable = verifyData.deliverable || saved;
      const bytesStored = Number(verifyData.bytesStored ?? payload?.bytesStored ?? selectedUploadFile.size ?? 0);
      const resolvedRelPath =
        verifiedDeliverable.relativePath ||
        `storage/${clientFolder}/${targetFileName}`;

      await fetchData();

      setLastUploadedDeliverableId(verifiedDeliverable.id);
      setUploadConflictInfo(null);
      setVerifiedUploadNotice({
        id: verifiedDeliverable.id,
        fileName: verifiedDeliverable.fileName,
        title: verifiedDeliverable.title,
        fileSize: verifiedDeliverable.fileSize,
        bytesStored,
        relativePath: resolvedRelPath,
        overwritten: Boolean(payload?.overwritten),
      });
      setUploadStage('verified');

      showToast(
        payload?.overwritten ? 'Archivo Sobrescrito y Verificado' : 'Archivo Subido y Verificado',
        `Se ha subido "${verifiedDeliverable.fileName}" (${verifiedDeliverable.fileSize}) correctamente en ${resolvedRelPath}`,
        'success',
        6500
      );
    } catch (err: any) {
      const msg = err?.message || 'No se pudo subir el archivo.';
      setUploadStage('error');
      setUploadErrorMessage(msg);
      showToast('Error al Subir Entregable', msg, 'error', 6000);
    } finally {
      setIsUploadingDeliverable(false);
    }
  };

  // Upload real deliverable file to server storage: ./storage/<Codigo>-<Nombre_del_Cliente>/<CodigoVuelo>-<Mision>/
  const handleSaveUploadDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUploadFile) {
      showToast('Archivo Requerido', 'Selecciona un archivo desde tu equipo para subirlo al servidor.');
      return;
    }

    const targetQuarry =
      quarries.find((q) => q.id === Number(modalUploadData.quarryId)) ||
      activeQuarry ||
      scopedQuarries[0];
    if (!targetQuarry) {
      showToast('Explotación Requerida', 'Selecciona una explotación válida.');
      return;
    }

    const targetClient =
      clients.find((c) => c.id === targetQuarry.clientId) || activeClient;
    const clientCode = targetClient?.code || 'C000';
    const clientName = targetClient?.name || 'Cliente General';
    const clientFolder = buildClientFolderName(clientCode, clientName, targetClient?.id);
    const targetFlight = surveys.find((s) => s.id === Number(modalUploadData.surveyId));
    const flightCode = targetFlight?.flightCode || 'GENERAL';
    const flightNotes = targetFlight?.notes || 'Vuelo';
    const flightSubFolder = buildFlightSubFolderName(flightCode, flightNotes);
    const targetFileName = modalUploadData.fileName.trim() || selectedUploadFile.name;

    try {
      const params = new URLSearchParams({
        clientCode,
        clientName,
        clientFolder,
        flightCode,
        flightNotes,
        fileName: targetFileName,
      });
      const checkResp = await fetch(`/api/deliverables/check?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (checkResp.ok) {
        const checkData = await checkResp.json();
        if (checkData?.exists) {
          const fallbackRelPath = `storage/${clientFolder}/${flightSubFolder}/${targetFileName}`;
          setUploadConflictInfo({
            exists: true,
            fileName: checkData.fileName || targetFileName,
            relativePath: checkData.relativePath || fallbackRelPath,
          });
          promptOverwriteConfirm(
            targetQuarry,
            clientCode,
            clientName,
            clientFolder,
            flightCode,
            flightNotes,
            checkData.fileName || targetFileName,
            checkData.relativePath || fallbackRelPath
          );
          return;
        }
      }
    } catch {
      // If check endpoint fails transiently, server POST will still enforce 409 check
    }

    await performDeliverableUpload(
      targetQuarry,
      clientCode,
      clientName,
      clientFolder,
      flightCode,
      flightNotes,
      false
    );
  };

  const handleCopyShareLink = async (item: Deliverable) => {
    const pathUrl = item.shareUrl || (item.isServerStored ? `/api/deliverables/${item.id}/download` : item.fileUrl);
    const fullUrl = `${window.location.origin}${pathUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedDeliverableId(item.id);
      setTimeout(() => {
        setCopiedDeliverableId((prev) => (prev === item.id ? null : prev));
      }, 2200);
      showToast('Enlace Copiado', `URL lista para compartir: ${pathUrl}`);
    } catch {
      showToast('Enlace Disponible', fullUrl);
    }
  };

  const handleDeleteDeliverable = (item: Deliverable) => {
    if (authenticatedRole !== 'admin' || currentUserRole !== 'admin') return;
    setConfirmDialog({
      open: true,
      title: 'Eliminar Entregable',
      message: `¿Eliminar "${item.fileName}"${item.isServerStored ? ' del directorio compartido del servidor' : ''}?`,
      details: item.relativePath ? [`Ruta: ${item.relativePath}`] : undefined,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          if (item.isServerStored) {
            const resp = await fetch(`/api/deliverables/${item.id}`, {
              method: 'DELETE',
              headers: getAuthHeaders(),
            });
            if (!resp.ok) {
              const errData = await resp.json().catch(() => ({}));
              throw new Error(errData?.error || 'No se pudo eliminar el archivo del servidor.');
            }
          } else {
            localDataStore.deleteDeliverable(item.id);
          }
          showToast('Entregable Eliminado', `"${item.fileName}" eliminado correctamente.`);
          await fetchData();
        } catch (err: any) {
          showToast('Error al Eliminar', err.message || 'No se pudo eliminar el entregable.');
        }
      },
    });
  };

  const getDeliverableMeta = (cat: string) => {
    switch (cat) {
      case 'pdf_report':
        return { icon: FileText, color: 'text-red-400', label: 'Informe Volumétrico PDF' };
      case 'contour_dxf':
        return { icon: FileCode, color: 'text-blue-400', label: 'Curvas de Nivel DXF' };
      case 'pointcloud_las':
        return { icon: Layers, color: 'text-emerald-400', label: 'Nube de Puntos LAZ' };
      case 'orthophoto':
        return { icon: ImageIcon, color: 'text-amber-400', label: 'Ortomosaico GeoTIFF' };
      case 'mesh_obj':
        return { icon: Box, color: 'text-purple-400', label: 'Modelo 3D OBJ / GLB' };
      case 'gis_geotiff':
        return { icon: Layers, color: 'text-cyan-400', label: 'Capa Raster GIS GeoTIFF' };
      default:
        return { icon: FileText, color: 'text-gray-400', label: 'Archivo Técnico' };
    }
  };

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="bg-[#070a10] text-gray-200 antialiased min-h-screen flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-[70] pointer-events-none max-w-sm">
          <div
            className={`glass-panel p-3 px-4 rounded-xl border text-xs shadow-2xl flex items-start gap-3 pointer-events-auto ${
              toast.variant === 'success'
                ? 'border-emerald-500/60 bg-emerald-950/90'
                : toast.variant === 'error'
                  ? 'border-red-500/60 bg-red-950/90'
                  : 'border-blue-500/40'
            }`}
          >
            <div
              className={`p-1 rounded shrink-0 mt-0.5 ${
                toast.variant === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : toast.variant === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {toast.variant === 'error' ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-white text-xs">{toast.title}</h4>
              <p className="text-[11px] text-gray-200 break-words">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-white shrink-0 cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* CABECERA PRINCIPAL (Responsive) */}
      <header className="border-b border-gray-800 bg-[#111827]/95 backdrop-blur sticky top-0 z-40 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 lg:gap-3">
        {/* Left branding & Active Client / Quarry Badge */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 order-1">
          <IngeodronLogo
            subtitleText="Fotogravimetria con dron"
            iconClassName="w-[60px] h-[51px]"
            brandSpanClassName="text-[23px]"
            subtitleClassName={`text-[9px] leading-[17px] font-bold tracking-wider uppercase ${theme === 'light' ? 'text-slate-700' : 'text-[#e5e3ef]'
              }`}
          />

          <div className="h-6 w-[1px] bg-gray-700 mx-1 hidden xl:block" />

          {/* Active Client & Quarry display card */}
          <div className="flex items-center gap-2.5 bg-[#0b0f17]/90 border border-gray-700/80 rounded-xl px-3 py-1.5 shadow-inner min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center overflow-hidden shrink-0">
              {activeClient?.logoUrl ? (
                <img
                  src={activeClient.logoUrl}
                  alt={`Logo de ${activeClient.name}`}
                  className="w-full h-full object-contain bg-white/95 p-0.5"
                />
              ) : activeClient ? (
                <Building className="w-4 h-4 text-blue-400" />
              ) : (
                <Layers className="w-4 h-4 text-blue-400" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className="text-[10px] sm:text-[11px] text-amber-300 uppercase tracking-wide font-bold leading-tight whitespace-normal sm:whitespace-nowrap"
                title={activeClient?.name}
              >
                {activeClient ? activeClient.name : isAllQuarries ? 'Vista Multi-Explotación' : 'Explotación Activa'}
              </span>
              <span className="text-xs font-semibold text-white whitespace-normal sm:whitespace-nowrap leading-tight">
                {isAllQuarries
                  ? `Todas (${visibleQuarries.length})`
                  : activeQuarry?.name || 'Sin explotación asignada'}
              </span>
            </div>
          </div>
        </div>

        {/* Center Selectors (full-width grid on mobile/tablet, inline on desktop) */}
        <div className="order-3 lg:order-2 w-full lg:w-auto grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 min-h-[36px] lg:h-[36px]">
          {/* Admin-only Client Switcher to inspect any client's data */}
          {authenticatedRole === 'admin' && (() => {
            const switcherClient =
              adminSelectedClientId === 'all'
                ? null
                : clients.find((c) => c.id === adminSelectedClientId) || null;
            return (
              <div className="flex items-center bg-[#0b0f17] border border-amber-500/40 hover:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs transition min-w-0 h-[33px]">
                {switcherClient?.logoUrl ? (
                  <img
                    src={switcherClient.logoUrl}
                    alt={switcherClient.name}
                    className="w-4 h-4 rounded object-contain bg-white/95 p-0.5 mr-2 shrink-0"
                  />
                ) : (
                  <Building className="w-3.5 h-3.5 text-amber-400 mr-2 shrink-0" />
                )}
                <span className="text-gray-400 mr-1.5 shrink-0">Cliente:</span>
                <select
                  value={adminSelectedClientId}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
                    handleAdminClientChange(val);
                  }}
                  className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer flex-1 min-w-0 sm:min-w-[210px] lg:max-w-none"
                  title="Seleccionar cliente para visualizar exclusivamente sus explotaciones y datos"
                >
                  <option value="all" className="bg-[#111827] text-white">
                    Todos los clientes ({clients.length})
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#111827] text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}

          {/* Quarry Selector (One or All; strictly single-quarry in 3D Viewer) */}
          <div className="flex items-center bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs min-w-0">
            <Layers className="w-3.5 h-3.5 text-blue-400 mr-2 shrink-0" />
            <span className="text-gray-400 mr-1.5 shrink-0">Explotación:</span>
            <select
              value={
                activeTab === 'tab-viewer3d'
                  ? viewer3DQuarry?.id || ''
                  : isAllQuarries
                  ? 'all'
                  : activeQuarry?.id || ''
              }
              disabled={visibleQuarries.length === 0}
              onChange={(e) =>
                handleQuarryChange(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
              }
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer flex-1 min-w-0 lg:max-w-[180px] truncate disabled:opacity-50"
              title={
                activeTab === 'tab-viewer3d'
                  ? 'En el Visor 3D solo se visualiza una explotación a la vez'
                  : 'Seleccionar una explotación o todas las asignadas'
              }
            >
              {visibleQuarries.length === 0 ? (
                <option value="" className="bg-[#111827] text-gray-400">
                  Sin explotaciones asignadas
                </option>
              ) : (
                <>
                  {activeTab !== 'tab-viewer3d' && (
                    <option value="all" className="bg-[#111827] text-white">
                      Todas las explotaciones ({visibleQuarries.length})
                    </option>
                  )}
                  {visibleQuarries.map((q) => (
                    <option key={q.id} value={q.id} className="bg-[#111827] text-white">
                      {q.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Active Flight Display & Global Selector (One, Several or All; strictly single-flight in 3D Viewer) */}
          <div className={`flex items-center bg-[#0b0f17] border border-gray-700 hover:border-emerald-500/50 rounded-lg px-2.5 py-1.5 text-xs transition min-w-0 ${authenticatedRole === 'admin' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
            <Plane className="w-3.5 h-3.5 text-emerald-400 mr-2 shrink-0" />
            <span className="text-gray-400 mr-1.5 shrink-0">Vuelo:</span>
            {activeTab === 'tab-viewer3d' ? (
              <select
                value={viewer3DFlight?.id || ''}
                disabled={viewer3DSurveys.length === 0}
                onChange={(e) => handleActivateFlight(parseInt(e.target.value, 10))}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer flex-1 min-w-0 lg:max-w-[200px] truncate disabled:opacity-50"
                title="En el Visor 3D solo se puede seleccionar un vuelo de la explotación activa"
              >
                {headerSortedViewer3DSurveys.length === 0 ? (
                  <option value="" className="bg-[#111827] text-gray-400">
                    Sin vuelos registrados
                  </option>
                ) : (
                  headerSortedViewer3DSurveys.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#111827] text-white">
                      {f.flightCode} ({formatDateEu(f.surveyDate)})
                    </option>
                  ))
                )}
              </select>
            ) : (
              <MultiFlightSelect
                flights={headerSortedSurveys}
                zones={currentQuarryZones}
                mode={isAllFlights ? 'all' : 'custom_flights'}
                customModeValue="custom_flights"
                selectedFlightIds={headerFlightSelectionIds}
                showStatusIndicator={isAdminView}
                variant="header"
                align="right"
                disabled={currentSurveys.length === 0}
                emptyLabel="Sin vuelos registrados"
                title="Seleccionar un vuelo, varios vuelos o todos los vuelos"
                presets={[
                  {
                    value: 'all',
                    label: `Todos los vuelos (${currentSurveys.length})`,
                  },
                ]}
                onSelectPreset={(preset) => {
                  if (preset === 'all') {
                    handleActivateFlight('all');
                  }
                }}
                onToggleFlight={handleToggleHeaderFlight}
                onSelectSingle={(flightId) => handleActivateFlight(flightId)}
                onClear={handleResetHeaderFlightToFirst}
                clearLabel="Limpiar"
                clearTitle="Limpiar selección y seleccionar el primer vuelo del listado"
              />
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 order-2 lg:order-3 shrink-0">
          {/* Light / Dark Mode Selector (available to clients & admins) */}
          <div
            className="flex items-center bg-[#0b0f17] p-0.5 sm:p-1 rounded-lg border border-gray-700 text-xs"
            role="group"
            aria-label="Selector de tema claro u oscuro"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              title="Activar diseño en modo claro"
              className={`px-2 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${theme === 'light'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Claro</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              title="Activar diseño en modo oscuro"
              className={`px-2 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${theme === 'dark'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Oscuro</span>
            </button>
          </div>

          {authenticatedRole === 'admin' && (
            <div className="flex items-center bg-[#0b0f17] p-0.5 sm:p-1 rounded-lg border border-gray-700 text-xs">
              <button
                type="button"
                onClick={() => {
                  setCurrentUserRole('admin');
                  showToast('Perfil Cambiado', 'Modo Administrador / Técnico');
                }}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${currentUserRole === 'admin' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentUserRole('manager');
                  if (activeTab === 'tab-clients-admin' || activeTab === 'tab-settings') {
                    setActiveTab('tab-flights');
                  }
                  showToast('Perfil Cambiado', 'Vista previa Modo Cliente');
                }}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${currentUserRole === 'manager' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
              >
                Cliente
              </button>
            </div>
          )}

          {/* Logout button */}
          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* PANEL PRINCIPAL: Mobile Horizontal Nav + Desktop Sidebar + Main Views */}
      <div className="flex flex-col md:flex-row flex-1 min-w-0 overflow-hidden">
        {/* MOBILE NAVIGATION BAR (< md) */}
        <nav
          aria-label="Navegación principal móvil"
          className="md:hidden border-b border-gray-800 bg-[#111827]/90 px-2.5 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0"
        >
          <button
            type="button"
            onClick={() => setActiveTab('tab-flights')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${activeTab === 'tab-flights'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'bg-[#0b0f17]/70 text-gray-400 border border-gray-800 hover:text-white'
              }`}
          >
            <Plane className="w-3.5 h-3.5 shrink-0 text-sky-400" />
            <span>1. Vuelos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tab-dashboard')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${activeTab === 'tab-dashboard'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'bg-[#0b0f17]/70 text-gray-400 border border-gray-800 hover:text-white'
              }`}
          >
            <CubesIcon className="w-3.5 h-3.5 shrink-0 text-violet-400" />
            <span>2. Acopios</span>
          </button>

          {canAccessViewer3d && (
            <button
              type="button"
              onClick={() => setActiveTab('tab-viewer3d')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${activeTab === 'tab-viewer3d'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-[#0b0f17]/70 text-gray-400 border border-gray-800 hover:text-white'
                }`}
            >
              <Box className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              <span>3. Visor 3D</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('tab-downloads')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${activeTab === 'tab-downloads'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'bg-[#0b0f17]/70 text-gray-400 border border-gray-800 hover:text-white'
              }`}
          >
            <Download className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>{canAccessViewer3d ? '4.' : '3.'} Entregables</span>
          </button>

          {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('tab-clients-admin')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${activeTab === 'tab-clients-admin'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-[#0b0f17]/70 text-gray-400 border border-gray-800 hover:text-white'
                  }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>{canAccessViewer3d ? '5.' : '4.'} Clientes</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('tab-settings')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${activeTab === 'tab-settings'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-[#0b0f17]/70 text-gray-400 border border-gray-800 hover:text-white'
                  }`}
              >
                <Sliders className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>{canAccessViewer3d ? '6.' : '5.'} Parámetros</span>
              </button>
            </>
          )}
        </nav>

        {/* DESKTOP/TABLET ASIDE BAR (>= md) */}
        <aside className="hidden md:flex md:w-56 lg:w-64 border-r border-gray-800 bg-[#101724] flex-col justify-between shrink-0">
          <nav className="p-3 lg:p-4 space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab('tab-flights')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${activeTab === 'tab-flights'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
            >
              <Plane className="w-5 h-5 shrink-0 text-center text-sky-400" />
              <span className="truncate">1. Listado de Vuelos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tab-dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${activeTab === 'tab-dashboard'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
            >
              <CubesIcon className="w-5 h-5 shrink-0 text-center text-violet-400" />
              <span className="truncate">2. Volúmenes de Acopios</span>
            </button>

            {canAccessViewer3d && (
              <button
                type="button"
                onClick={() => setActiveTab('tab-viewer3d')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${activeTab === 'tab-viewer3d'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
              >
                <Box className="w-5 h-5 shrink-0 text-center text-cyan-400" />
                <span className="truncate">3. Visor 3D &amp; Planos</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('tab-downloads')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${activeTab === 'tab-downloads'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
            >
              <Download className="w-5 h-5 shrink-0 text-center text-rose-400" />
              <span className="truncate">{canAccessViewer3d ? '4.' : '3.'} Entregables Oficiales</span>
            </button>

            {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('tab-clients-admin')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${activeTab === 'tab-clients-admin'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                >
                  <Users className="w-5 h-5 shrink-0 text-amber-400 text-center" />
                  <span className="truncate">{canAccessViewer3d ? '5.' : '4.'} Clientes y Usuarios</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('tab-settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${activeTab === 'tab-settings'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                >
                  <Sliders className="w-5 h-5 shrink-0 text-emerald-400 text-center" />
                  <span className="truncate">{canAccessViewer3d ? '6.' : '5.'} Configuración Parámetros</span>
                </button>
              </>
            )}
          </nav>

          {/* Sidebar Footer User Box */}
          <div className="p-3 border-t border-gray-800 bg-[#0b0f17]/40 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0 uppercase">
                {(loggedUserName || 'ID').slice(0, 2)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate" title={loggedUserName}>
                  {loggedUserName}
                </p>
                <p className="text-[10px] text-blue-400 font-mono truncate" title={userEmail}>
                  {userEmail || (currentUserRole === 'admin' ? 'admin@ingeodron.es' : 'cliente@portal.es')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 pt-1 border-t border-gray-800/60">
              <span className="font-extrabold tracking-wide">
                <span className="text-blue-500">INGEO</span>
                <span className="text-amber-500">DRON</span>
              </span>
              <span className="text-cyan-400 font-semibold">v5.20</span>
            </div>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <main
          className={`flex-1 min-w-0 w-full overflow-y-auto p-3 sm:p-4 md:p-6 bg-[#070a10] ${
            activeTab === 'tab-viewer3d' ? 'flex flex-col' : 'space-y-4 sm:space-y-6'
          }`}
        >

          {/* EMPTY STATE: Client has no assigned quarries */}
          {!hasQuarryScope && activeTab !== 'tab-clients-admin' && activeTab !== 'tab-settings' && (
            <section className="glass-panel p-8 rounded-2xl border border-gray-800 text-center space-y-4 max-w-xl mx-auto my-12">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white">
                  Sin explotaciones asignadas
                </h2>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {activeClient
                    ? `La empresa "${activeClient.name}" no tiene actualmente ninguna cantera o explotación asignada en tu sesión.`
                    : 'Tu cuenta de acceso no tiene ninguna cantera o explotación vinculada actualmente.'}{' '}
                  Por seguridad, solo se muestran los datos de tus propias explotaciones. Contacta con el administrador técnico de INGEODRON para asignar una cantera a tu empresa.
                </p>
              </div>
              {authenticatedRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('tab-clients-admin')}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer"
                >
                  Gestionar Clientes y Explotaciones
                </button>
              )}
            </section>
          )}

          {/* TAB 1: LISTADO DE VUELOS */}
          {hasQuarryScope && activeTab === 'tab-flights' && (
            <section className="space-y-6">
              <div className="glass-panel p-3.5 sm:p-5 rounded-xl border border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-4 p-4 rounded-xl border border-gray-800 bg-gray-900/60">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-2">
                      <Plane className="w-5 h-5 text-blue-500 shrink-0" /> Histórico de Vuelos de{' '}
                      <span className="text-blue-400">
                        {isAllQuarries
                          ? `Todas las Explotaciones (${scopedQuarries.length})`
                          : activeQuarry?.name || 'Explotación Activa'}
                      </span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                      {isAdminView
                        ? `Registro de todos los vuelos (${currentSurveys.length}) con control visual de estado operativo (Activo, Pendiente, Archivado).`
                        : `Listado completo de vuelos y levantamientos topográficos de la explotación seleccionada (${currentSurveys.length}).`}
                    </p>
                  </div>

                  {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          downloadFlightsCsvTemplate({
                            client: activeClient || clients[0] || null,
                            zones: currentQuarryZones,
                          });
                          showToast('Modelo CSV Vuelos', 'Plantilla CSV de vuelos descargada para rellenar e importar.');
                        }}
                        className="flex-1 sm:flex-initial justify-center px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sky-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                        title="Descargar archivo CSV modelo para carga masiva de vuelos"
                      >
                        <Download className="w-3.5 h-3.5" /> Modelo CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceCsvMode('flights');
                          setShowWorkspaceCsvModal(true);
                        }}
                        className="flex-1 sm:flex-initial justify-center px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1.5 transition cursor-pointer"
                        title="Importar vuelos masivamente desde un archivo CSV"
                      >
                        <Upload className="w-3.5 h-3.5" /> Importar CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenAddFlight}
                        className="flex-1 sm:flex-initial justify-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Nuevo Vuelo
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter Chips by Survey Status (Admin only) */}
                {isAdminView && (
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-[#303742] p-2.5 rounded-xl border border-gray-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-400 font-medium mr-1 flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-blue-400" /> Filtrar por Estado:
                      </span>
                      <button
                        type="button"
                        onClick={() => setFlightStatusFilter('all')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${flightStatusFilter === 'all'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700/60'
                          }`}
                      >
                        Todos ({flightStatusCounts.all})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlightStatusFilter('active')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${flightStatusFilter === 'active'
                          ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                          : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 border border-emerald-500/30'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Activos ({flightStatusCounts.active})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlightStatusFilter('pending')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${flightStatusFilter === 'pending'
                          ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400/50'
                          : 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 border border-amber-500/30'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        Pendientes ({flightStatusCounts.pending})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlightStatusFilter('archived')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${flightStatusFilter === 'archived'
                          ? 'bg-slate-600 text-white shadow-sm ring-1 ring-slate-400/50'
                          : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        Archivados ({flightStatusCounts.archived})
                      </button>
                    </div>

                    <span className="text-[11px] text-gray-400 font-mono">
                      Mostrando <strong className="text-white">{displayedSurveys.length}</strong> de {currentSurveys.length} vuelos
                    </span>
                  </div>
                )}

                {/* Admin Zone Management Strip inside Flights Tab */}
                {authenticatedRole === 'admin' && currentUserRole === 'admin' && currentQuarryZones.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-4 bg-[#0b0f17]/60 p-2.5 rounded-xl border border-gray-800 text-xs">
                    <span className="text-xs text-gray-400 font-medium mr-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" /> Zonas ({currentQuarryZones.length}):
                    </span>
                    {currentQuarryZones.map((z) => {
                      const zFlightsCount = currentSurveys.filter((s) => s.zoneId === z.id).length;
                      return (
                        <div
                          key={`flight-zone-chip-${z.id}`}
                          className="inline-flex items-center gap-1.5 bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1"
                        >
                          <span className="text-cyan-300 font-medium">{z.name}</span>
                          <span className="text-[10px] font-mono text-gray-400">
                            ({zFlightsCount} {zFlightsCount === 1 ? 'vuelo' : 'vuelos'})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenEditZone(z)}
                            className="p-0.5 text-cyan-400 hover:text-cyan-300 hover:bg-gray-800 rounded cursor-pointer"
                            title={`Editar zona ${z.name}`}
                            aria-label={`Editar zona ${z.name}`}
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteZone(z)}
                            className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded cursor-pointer"
                            title={`Eliminar zona ${z.name} y sus ${zFlightsCount} vuelo(s)`}
                            aria-label={`Eliminar zona ${z.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* MOBILE CARDS VIEW (< md) */}
                <div className="md:hidden space-y-3">
                  {sortedDisplayedSurveys.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400 border border-dashed border-gray-800 rounded-xl">
                      {isAdminView
                        ? 'No hay vuelos que coincidan con el filtro de estado seleccionado.'
                        : 'No hay vuelos registrados para esta explotación.'}
                    </div>
                  ) : (
                    sortedDisplayedSurveys.map((flight) => {
                      const isActiveFlightSession =
                        !isAllFlights && headerSelectedSurveyIds.has(flight.id);
                      const linkedZone = currentQuarryZones.find((z) => z.id === flight.zoneId);
                      const linkedQuarry = linkedZone ? quarries.find((q) => q.id === linkedZone.quarryId) : undefined;
                      const flightStockpiles = currentStockpiles.filter((st) => st.surveyId === flight.id);
                      const currentStatus = flight.status || 'archived';

                      return (
                        <div
                          key={`mob-flight-${flight.id}`}
                          className={`p-3.5 rounded-xl border space-y-3 transition ${isActiveFlightSession
                            ? 'bg-emerald-950/20 border-emerald-500/50'
                            : 'bg-[#0b0f17]/75 border-gray-800'
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div
                                className={`p-2 rounded-lg shrink-0 ${isActiveFlightSession
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-gray-800 text-blue-400'
                                  }`}
                              >
                                <Plane className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white leading-snug">
                                  {flight.notes || flight.flightCode}
                                </div>
                                <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                                  {flight.flightCode} · {formatDateEu(flight.surveyDate)}
                                </div>
                              </div>
                            </div>

                            {isAdminView && (
                              currentStatus === 'active' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                                  Activo
                                </span>
                              ) : currentStatus === 'pending' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                                  Pendiente
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30 shrink-0">
                                  Archivado
                                </span>
                              )
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {isAllQuarries && linkedQuarry && (
                              <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold">
                                {linkedQuarry.name}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-[#111827] border border-gray-700 text-cyan-300 font-medium">
                              {linkedZone ? linkedZone.name : `Zona #${flight.zoneId}`}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono text-[10px] font-bold">
                              {flightStockpiles.length} acopio{flightStockpiles.length === 1 ? '' : 's'}
                            </span>
                            <span className="text-[10px] text-blue-400 font-mono ml-auto">
                              GSD {formatEsNumber(flight.groundResolutionCm || 1.8, { minDecimals: 1, maxDecimals: 2 })} cm/px
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-[#111827]/80 border border-gray-800 rounded-lg p-2.5 text-[11px] font-mono">
                            <div>
                              <span className="block text-[9px] text-gray-400 font-sans uppercase">Relleno</span>
                              <span className="text-emerald-400 font-bold">+{formatEsNumber(flight.fillVolumeM3)} m³</span>
                            </div>
                            <div>
                              <span className="block text-[9px] text-gray-400 font-sans uppercase">Desmonte</span>
                              <span className="text-red-400 font-bold">-{formatEsNumber(flight.cutVolumeM3)} m³</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {isAdminView && (
                              <button
                                type="button"
                                onClick={() => handleActivateFlight(flight.id)}
                                className={`flex-1 justify-center px-3 py-2 rounded-lg text-xs font-semibold shadow flex items-center gap-1.5 transition cursor-pointer ${isActiveFlightSession
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white'
                                  }`}
                              >
                                {isActiveFlightSession ? (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5" /> Activo
                                  </>
                                ) : (
                                  <>
                                    <Plane className="w-3.5 h-3.5" /> Activar
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleActivateFlight(flight.id, 'tab-dashboard')}
                              className={`${isAdminView ? '' : 'flex-1 justify-center '}px-3 py-2 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded-lg text-xs font-medium border border-gray-700 transition cursor-pointer`}
                            >
                              Cubicación
                            </button>
                            {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditFlight(flight)}
                                  className="p-2 bg-gray-800 hover:bg-gray-700 text-sky-300 rounded-lg border border-gray-700 text-xs transition cursor-pointer"
                                  aria-label={`Editar vuelo ${flight.flightCode}`}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFlight(flight)}
                                  className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 text-xs transition cursor-pointer"
                                  aria-label={`Borrar vuelo ${flight.flightCode}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP/TABLET TABLE (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                        <SortableTh
                          label="Código"
                          sortKey="flightCode"
                          sortState={flightsTableSort}
                          onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                          className="p-3"
                        />
                        <SortableTh
                          label="Misión"
                          sortKey="mission"
                          sortState={flightsTableSort}
                          onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                          className="p-3"
                        />
                        <SortableTh
                          label="Fecha Levantamiento"
                          sortKey="surveyDate"
                          sortState={flightsTableSort}
                          onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                          className="p-3"
                        />
                        <SortableTh
                          label="Zona Vinculada"
                          sortKey="zone"
                          sortState={flightsTableSort}
                          onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                          className="p-3"
                        />
                        {isAdminView && (
                          <SortableTh
                            label="Estado del Vuelo"
                            sortKey="status"
                            sortState={flightsTableSort}
                            onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                            align="center"
                            className="p-3"
                          />
                        )}
                        <SortableTh
                          label="Cubicación Registrada"
                          sortKey="volume"
                          sortState={flightsTableSort}
                          onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                          className="p-3"
                        />
                        <SortableTh
                          label="GSD & Precisión GNSS"
                          sortKey="gsd"
                          sortState={flightsTableSort}
                          onSort={(key) => setFlightsTableSort((prev) => toggleSortState(prev, key))}
                          className="p-3"
                        />
                        <th className="p-3 text-right">
                          {isAdminView ? 'Acción de Trabajo' : 'Cubicación'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {sortedDisplayedSurveys.length === 0 ? (
                        <tr>
                          <td colSpan={isAdminView ? 8 : 7} className="p-8 text-center text-gray-400">
                            {isAdminView
                              ? 'No hay vuelos que coincidan con el filtro de estado seleccionado.'
                              : 'No hay vuelos registrados para esta explotación.'}
                          </td>
                        </tr>
                      ) : (
                        sortedDisplayedSurveys.map((flight, rowIdx) => {
                          const isActiveFlightSession =
                            !isAllFlights && headerSelectedSurveyIds.has(flight.id);
                          const linkedZone = currentQuarryZones.find((z) => z.id === flight.zoneId);
                          const linkedQuarry = linkedZone ? quarries.find((q) => q.id === linkedZone.quarryId) : undefined;
                          const flightStockpiles = currentStockpiles.filter((st) => st.surveyId === flight.id);
                          const currentStatus = flight.status || 'archived';

                          return (
                            <tr
                              key={flight.id}
                              className={`transition ${isActiveFlightSession ? 'bg-emerald-950/25 border-l-2 border-emerald-400' : 'hover:bg-gray-800/50'
                                }`}
                            >
                              <td className="p-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className={`p-1.5 rounded-lg shrink-0 ${isActiveFlightSession ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-blue-400'}`}>
                                    <Plane className="w-3.5 h-3.5" />
                                  </div>
                                  <span
                                    className={`code-font text-[11px] font-semibold ${rowIdx === 1 ? 'text-[#74d4ff]' : 'text-sky-300'
                                      }`}
                                  >
                                    {flight.flightCode}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 font-semibold text-white">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-white text-xs font-bold">
                                    {flight.notes || `Misión ${flight.flightCode}`}
                                  </span>
                                  {isAdminView && isActiveFlightSession && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono border border-emerald-500/40 flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" /> ACTIVO PARA TRABAJAR
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-gray-400 block mt-0.5">
                                  {flight.droneModel}
                                </span>
                              </td>
                              <td className="p-3 text-gray-300">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                  <span>{formatDateEu(flight.surveyDate)}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {isAllQuarries && linkedQuarry && (
                                      <span className="inline-block px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-semibold">
                                        {linkedQuarry.name}
                                      </span>
                                    )}
                                    <span className="inline-block px-2 py-0.5 rounded bg-[#0b0f17] border border-gray-700 text-cyan-300 text-[11px] font-medium">
                                      {linkedZone ? linkedZone.name : `Zona #${flight.zoneId}`}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono text-[10px] font-bold">
                                      {flightStockpiles.length} acopio{flightStockpiles.length === 1 ? '' : 's'}
                                    </span>
                                    {currentUserRole === 'admin' && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAddStockpile(flight.id)}
                                        className="px-1.5 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-[10px] font-semibold transition cursor-pointer"
                                        title={`Añadir acopio al vuelo ${flight.flightCode}`}
                                      >
                                        + Acopio
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Indicador Visual de Estado (Admin only) */}
                              {isAdminView && (
                                <td className="p-3 text-center">
                                  <div className="inline-flex flex-col items-center gap-1">
                                    {currentStatus === 'active' && (
                                      <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
                                        title="Vuelo Activo: Procesado y disponible para cálculos volumétricos"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>Activo (Active)</span>
                                      </span>
                                    )}

                                    {currentStatus === 'pending' && (
                                      <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm"
                                        title="Vuelo Pendiente: En revisión, validación o calibración de puntos de apoyo GNSS"
                                      >
                                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Pendiente (Pending)</span>
                                      </span>
                                    )}

                                    {currentStatus === 'archived' && (
                                      <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30 shadow-sm"
                                        title="Vuelo Archivado: Histórico de campañas anteriores"
                                      >
                                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                        <Archive className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Archivado</span>
                                      </span>
                                    )}

                                    {/* Selector rápido para Administrador */}
                                    <div className="flex items-center justify-center gap-1 mt-1">
                                      <select
                                        value={currentStatus}
                                        onChange={(e) => handleUpdateFlightStatus(flight.id, e.target.value as SurveyStatus)}
                                        className="bg-[#0b0f17] text-[10px] text-gray-300 border border-gray-700 rounded px-1.5 py-0.5 focus:outline-none hover:border-gray-500 cursor-pointer"
                                        title="Cambiar estado del vuelo (Admin)"
                                      >
                                        <option value="active">Cambiar a Activo</option>
                                        <option value="pending">Cambiar a Pendiente</option>
                                        <option value="archived">Cambiar a Archivado</option>
                                      </select>
                                    </div>
                                  </div>
                                </td>
                              )}

                              <td className="p-3 font-mono text-[11px]">
                                <div>
                                  <span className="text-gray-400">Rell:</span>{' '}
                                  <span className="text-emerald-400 font-bold">+{formatEsNumber(flight.fillVolumeM3)} m³</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Desm:</span>{' '}
                                  <span className="text-red-400 font-bold">-{formatEsNumber(flight.cutVolumeM3)} m³</span>
                                </div>
                              </td>
                              <td className="p-3 text-blue-400 font-mono text-[11px]">
                                <div>GSD: {formatEsNumber(flight.groundResolutionCm || 1.8, { minDecimals: 1, maxDecimals: 2 })} cm/px</div>
                                <div className="text-emerald-400 text-[10px]">RTK Fijo (Centimétrico)</div>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {isAdminView && (
                                    <button
                                      type="button"
                                      onClick={() => handleActivateFlight(flight.id)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow flex items-center gap-1.5 transition cursor-pointer ${isActiveFlightSession
                                        ? 'bg-emerald-600 text-white cursor-default ring-1 ring-emerald-400'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                        }`}
                                      title={isActiveFlightSession ? 'Vuelo actualmente activo para cálculos' : 'Activar este vuelo para trabajar'}
                                    >
                                      {isActiveFlightSession ? (
                                        <>
                                          <CheckCircle className="w-3.5 h-3.5" />
                                          <span>Activo</span>
                                        </>
                                      ) : (
                                        <>
                                          <Plane className="w-3.5 h-3.5" />
                                          <span>Activar para Trabajar</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleActivateFlight(flight.id, 'tab-dashboard')}
                                    className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded-lg text-xs font-medium border border-gray-700 transition cursor-pointer"
                                    title="Ver cubicación y tablas en Volúmenes de Acopios"
                                  >
                                    Cubicación
                                  </button>
                                  {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditFlight(flight)}
                                        className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-sky-300 rounded-lg border border-gray-700 text-xs transition cursor-pointer inline-flex items-center gap-1"
                                        title="Editar vuelo completo (Admin)"
                                        aria-label={`Editar vuelo ${flight.flightCode}`}
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFlight(flight)}
                                        className="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 text-xs transition cursor-pointer"
                                        title="Borrar vuelo completo (Admin)"
                                        aria-label={`Borrar vuelo ${flight.flightCode}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* TAB 2: VOLÚMENES DE ACOPIOS */}
          {hasQuarryScope && activeTab === 'tab-dashboard' && (
            <section className="space-y-6">
              {/* Working Flight Selection Banner */}
              <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-gray-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs shadow-lg">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-lg border border-emerald-500/30 shrink-0">
                    <Plane className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {isAdminView ? 'Vuelo de Trabajo Activo:' : 'Vuelo Seleccionado:'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono border border-emerald-500/40 font-bold">
                        {isAllFlights
                          ? `Todos los vuelos (${currentSurveys.length})`
                          : isMultiFlights
                            ? `${headerSelectedSurveys.length} vuelos (${headerMultiFlightPreview})`
                            : activeFlight
                              ? activeFlight.flightCode
                              : 'Sin vuelos'}
                      </span>
                      {!isAllFlights && !isMultiFlights && activeFlight?.surveyDate && (
                        <span className="text-gray-400 text-xs">({formatDateEu(activeFlight.surveyDate)})</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {isAllFlights || isMultiFlights ? (
                        <>
                          <span>
                            Explotaciones:{' '}
                            <strong className="text-gray-200">{scopedQuarries.length}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            Vuelos sel.: <strong className="text-emerald-400">{headerSelectedSurveys.length}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            Zonas: <strong className="text-emerald-400">{currentQuarryZones.length}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            Acopios: <strong className="text-cyan-400">{tableFilteredStockpiles.length}</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <span>Dron: <strong className="text-gray-200">{activeFlight?.droneModel || 'DJI Matrice 4E RTK'}</strong></span>
                          <span className="hidden sm:inline">•</span>
                          <span>GSD: <strong className="text-emerald-400">{formatEsNumber(activeFlight?.groundResolutionCm || 1.8, { minDecimals: 1, maxDecimals: 2 })} cm/px</strong></span>
                          <span className="hidden sm:inline">•</span>
                          <span>Operador: <strong className="text-cyan-400">{activeFlight?.operator || 'INGEODRON'}</strong></span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end w-full lg:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('tab-flights')}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-semibold border border-gray-700 transition shrink-0 cursor-pointer"
                  >
                    Ver Lista
                  </button>
                </div>
              </div>

              {/* 4 Executive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="glass-panel p-4 rounded-xl border border-gray-800 relative overflow-hidden group hover:border-blue-500/40 transition">
                  <div className="flex items-center justify-between text-xs text-gray-400 font-medium uppercase tracking-wider">
                    <span>Volumen Relleno</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold">+R</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mt-1.5 code-font">
                    +{formatEsNumber(totals.totalFill)} <span className="text-xs font-normal text-gray-400">m³</span>
                  </h3>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Desmonte: <strong className="text-red-400 font-semibold">-{formatEsNumber(totals.totalCut)} m³</strong>
                  </span>
                </div>

                <div className="glass-panel p-4 rounded-xl border border-gray-800 relative overflow-hidden group hover:border-emerald-500/40 transition">
                  <div className="flex items-center justify-between text-xs text-gray-400 font-medium uppercase tracking-wider">
                    <span>Balance Neto (ΔV)</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">Neto</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mt-1.5 code-font">
                    {formatEsNumber(totals.totalFill - totals.totalCut)} <span className="text-xs font-normal text-gray-400">m³</span>
                  </h3>
                  <span className="text-[11px] text-emerald-400 mt-1 block font-medium">
                    {tableFilteredStockpiles.length} acopios en {currentQuarryZones.length} zonas
                  </span>
                </div>

                <div className="glass-panel p-4 rounded-xl border border-gray-800 relative overflow-hidden group hover:border-cyan-500/40 transition">
                  <div className="flex items-center justify-between text-xs text-gray-400 font-medium uppercase tracking-wider">
                    <span>Tonelaje Estimado</span>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">Masa</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mt-1.5 code-font">
                    {formatEsNumber(totals.totalTonnage, { maxDecimals: 1 })} <span className="text-xs font-normal text-gray-400">t</span>
                  </h3>
                  <span className="text-[11px] text-cyan-400 mt-1 block">
                    Densidad ponderada: {totals.totalFill > 0 ? formatEsNumber(totals.totalTonnage / totals.totalFill, 2) : '1,68'} t/m³
                  </span>
                </div>

                <div className="glass-panel p-4 rounded-xl border border-gray-800 relative overflow-hidden group hover:border-purple-500/40 transition">
                  <div className="flex items-center justify-between text-xs text-gray-400 font-medium uppercase tracking-wider">
                    <span>{isAdminView ? 'Vuelo Activo' : 'Vuelo Seleccionado'}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mt-1.5 truncate">
                    {isAllFlights
                      ? `Todos (${currentSurveys.length})`
                      : isMultiFlights
                        ? `${headerSelectedSurveys.length} vuelos sel.`
                        : activeFlight
                          ? activeFlight.flightCode
                          : 'Sin vuelos'}
                  </h3>
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="text-gray-400 truncate">
                      {isAllFlights
                        ? `${currentStockpiles.length} acopios totales`
                        : isMultiFlights
                          ? headerMultiFlightPreview
                          : activeFlight?.surveyDate
                            ? formatDateEu(activeFlight.surveyDate)
                            : 'Sin fecha'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('tab-flights')}
                      className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>
                </div>
              </div>

              {/* Full-width Stockpiles breakdown + Official PDF Report below */}
              <div className="space-y-6">
                {/* Table of Stockpiles per Zone/Flight */}
                <div className="glass-panel p-3.5 sm:p-5 rounded-xl border border-gray-800 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <CubesIcon className="w-5 h-5 text-blue-500" /> Desglose de Acopios por Zona y Vuelo
                        </h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Explotación única → Zonas únicas → Vuelos → 1 o varios Acopios medidos
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                downloadStockpilesCsvTemplate({
                                  client: activeClient || clients[0] || null,
                                  surveys: currentSurveys,
                                });
                                showToast('Modelo CSV Acopios', 'Plantilla CSV de acopios descargada para rellenar e importar.');
                              }}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition cursor-pointer"
                              title="Descargar archivo CSV modelo para carga masiva de acopios"
                            >
                              <Download className="w-3.5 h-3.5" /> Modelo CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setWorkspaceCsvMode('stockpiles');
                                setShowWorkspaceCsvModal(true);
                              }}
                              className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1 transition cursor-pointer"
                              title="Importar acopios masivamente desde un archivo CSV"
                            >
                              <Upload className="w-3.5 h-3.5" /> Importar CSV
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenAddZone}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Nueva Zona
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAddStockpile(activeFlight?.id)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Nuevo Acopio
                            </button>
                          </>
                        )}
                        <div
                          className="inline-flex items-center bg-[#0b0f17] border border-gray-700 rounded-lg p-0.5 text-[11px]"
                          role="group"
                          aria-label="Tipo de informe PDF"
                        >
                          <button
                            type="button"
                            onClick={() => setPdfReportType('standard')}
                            className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                              pdfReportType === 'standard'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white'
                            }`}
                            title="Informe PDF estándar (formato actual sin fotografías)"
                          >
                            <FileText className="w-3 h-3" /> Estándar
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfReportType('photographic')}
                            className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                              pdfReportType === 'photographic'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white'
                            }`}
                            title="Informe PDF fotográfico (añade columna final con miniaturas de las fotos de los acopios)"
                          >
                            <Camera className="w-3 h-3" /> Fotográfico
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={isGeneratingPdf || tableFilteredSurveys.length === 0 || tableFilteredZones.length === 0}
                          onClick={() => handleGenerateZonePdf(undefined, undefined, false, pdfReportType)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1.5 transition cursor-pointer"
                          title={
                            pdfReportType === 'photographic'
                              ? 'Descargar Informe Fotográfico PDF con miniaturas de los acopios'
                              : 'Descargar Informe Técnico PDF estándar con los datos visibles en la tabla según los filtros'
                          }
                        >
                          <FileText className="w-3.5 h-3.5" />{' '}
                          {isGeneratingPdf
                            ? 'Generando...'
                            : pdfReportType === 'photographic'
                              ? 'PDF Fotográfico'
                              : 'Reporte PDF'}
                        </button>
                        <button
                          type="button"
                          disabled={tableFilteredSurveys.length === 0 || tableFilteredZones.length === 0}
                          onClick={() => {
                            if (tableFilteredSurveys.length === 0 || tableFilteredZones.length === 0) {
                              showToast(
                                'Exportación Excel',
                                'No hay datos visibles en la tabla según los filtros actuales para exportar a Excel.',
                                'error'
                              );
                              return;
                            }
                            exportQuarryToExcel(
                              consolidatedQuarryForExport,
                              tableFilteredZones,
                              tableFilteredSurveys,
                              activeClient,
                              tableFilteredStockpiles,
                              {
                                filterSummary: tableFilterSummary,
                                fileTag: 'Tabla_Filtrada',
                                includeFlightStatus: isAdminView,
                              }
                            );
                            showToast(
                              'Exportación Excel',
                              `Libro Excel descargado según los filtros de la tabla (${tableFilteredStockpiles.length} ${tableFilteredStockpiles.length === 1 ? 'acopio' : 'acopios'}, ${tableFilteredSurveys.length} ${tableFilteredSurveys.length === 1 ? 'vuelo' : 'vuelos'}, ${tableFilteredZones.length} ${tableFilteredZones.length === 1 ? 'zona' : 'zonas'}).`,
                              'success'
                            );
                          }}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg shadow flex items-center gap-1 transition font-semibold cursor-pointer"
                          title="Descargar libro Excel con los datos visibles en la tabla según los filtros aplicados"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                        </button>
                      </div>
                    </div>

                    {/* Zone Filter Chips (flights strictly follow the header flight selector) */}
                    <div className="space-y-2 mb-4 bg-[#0b0f17]/60 p-2.5 rounded-xl border border-gray-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-400 font-medium mr-1 flex items-center gap-1">
                          <Sliders className="w-3.5 h-3.5 text-blue-500" /> Filtrar Zona:
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveZoneFilter('all')}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${activeZoneFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#0b0f17] text-gray-300 border border-gray-700 hover:bg-gray-800'
                            }`}
                        >
                          Todas las Zonas
                        </button>
                        {currentQuarryZones.map((z) => (
                          <div key={z.id} className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setActiveZoneFilter(z.name)}
                              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${activeZoneFilter === z.name
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#0b0f17] text-gray-300 border border-gray-700 hover:bg-gray-800'
                                }`}
                            >
                              {z.name}
                            </button>
                            {currentUserRole === 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditZone(z)}
                                className="p-1 text-cyan-400 hover:text-cyan-300 hover:bg-gray-800 rounded cursor-pointer"
                                title={`Editar zona ${z.name}`}
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            )}
                            {authenticatedRole === 'admin' && currentUserRole === 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteZone(z)}
                                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded cursor-pointer"
                                title={`Eliminar zona ${z.name} y sus vuelos vinculados`}
                                aria-label={`Eliminar zona ${z.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Table of individual Stockpiles (Desktop/Tablet) + Mobile Cards */}
                    <div>
                      {(() => {
                        const rows = tableSortedStockpileRows;

                        const sumFill = rows.reduce((acc, r) => acc + r.st.fillVolumeM3, 0);
                        const sumCut = rows.reduce((acc, r) => acc + r.st.cutVolumeM3, 0);
                        const sumTon = Math.round(rows.reduce((acc, r) => acc + r.st.tonnageEst, 0) * 10) / 10;
                        const sumArea = rows.reduce((acc, r) => {
                          const area =
                            r.st.areaM2 ??
                            Math.round(
                              Math.max(Math.abs(r.st.fillVolumeM3 || 0), Math.abs(r.st.cutVolumeM3 || 0)) / 6.2
                            );
                          return acc + area;
                        }, 0);

                        return (
                          <>
                            {/* MOBILE CARDS VIEW (< md) */}
                            <div className="md:hidden space-y-3">
                              {rows.length === 0 ? (
                                <div className="p-6 text-center text-xs text-gray-400 border border-dashed border-gray-800 rounded-xl">
                                  No hay acopios registrados para el filtro seleccionado.
                                </div>
                              ) : (
                                <>
                                  {rows.map(({ st, survey, zone }) => {
                                    const areaVal =
                                      st.areaM2 ??
                                      Math.round(
                                        Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2
                                      );
                                    return (
                                      <div
                                        key={`mob-st-${st.id}`}
                                        className="p-3.5 rounded-xl bg-[#0b0f17]/75 border border-gray-800 space-y-2.5 text-xs"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="font-bold text-white leading-snug">{st.name}</div>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                              <span className="code-font text-[10px] text-indigo-300">{st.code}</span>
                                              {zone && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#111827] border border-gray-800 text-[10px] text-cyan-300">
                                                  {zone.name}
                                                </span>
                                              )}
                                              {survey && (
                                                <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-[10px] font-mono text-sky-300">
                                                  {survey.flightCode} ({formatDateEu(survey.surveyDate)})
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {currentUserRole !== 'admin' ? (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenEditStockpile(st)}
                                              className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-medium shrink-0 inline-flex items-center gap-1 transition cursor-pointer"
                                              title="Cambiar material o densidad del acopio"
                                            >
                                              <span>{st.material}</span>
                                              <Sliders className="w-2.5 h-2.5 opacity-80" />
                                            </button>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-medium shrink-0">
                                              {st.material}
                                            </span>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 bg-[#111827]/80 border border-gray-800 rounded-lg p-2.5 font-mono text-[11px]">
                                          <div>
                                            <span className="block text-[9px] text-gray-400 font-sans uppercase">Relleno</span>
                                            <span className="text-emerald-400 font-bold">+{formatEsNumber(st.fillVolumeM3)} m³</span>
                                          </div>
                                          <div>
                                            <span className="block text-[9px] text-gray-400 font-sans uppercase">Desmonte</span>
                                            <span className="text-red-400 font-bold">-{formatEsNumber(st.cutVolumeM3)} m³</span>
                                          </div>
                                          <div>
                                            <span className="block text-[9px] text-gray-400 font-sans uppercase">Toneladas</span>
                                            <span className="text-cyan-300 font-bold">
                                              {formatEsNumber(st.tonnageEst, 1)} t
                                            </span>
                                          </div>
                                          <div>
                                            <span className="block text-[9px] text-gray-400 font-sans uppercase">Superficie</span>
                                            <span className="text-purple-300 font-bold">{formatEsNumber(areaVal)} m²</span>
                                          </div>
                                        </div>

                                        {/* Foto del Acopio (Mobile) */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111827]/70 border border-gray-800 rounded-lg px-2.5 py-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            {st.photoUrl ? (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => setPreviewStockpilePhoto(st)}
                                                  className="w-10 h-10 rounded-lg overflow-hidden border border-gray-700 hover:border-cyan-400 transition shrink-0 cursor-pointer"
                                                  title="Ampliar fotografía del acopio"
                                                >
                                                  <img
                                                    src={getAuthenticatedPhotoSrc(st.photoUrl)}
                                                    alt={`Foto de ${st.name}`}
                                                    className="w-full h-full object-cover"
                                                  />
                                                </button>
                                                <div className="min-w-0">
                                                  <div className="text-[10px] font-semibold text-white truncate">
                                                    {st.photoFileName || `Foto ${st.code}`}
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => setPreviewStockpilePhoto(st)}
                                                    className="text-[10px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 cursor-pointer"
                                                  >
                                                    <Eye className="w-3 h-3" /> Ver ampliada
                                                  </button>
                                                </div>
                                              </>
                                            ) : (
                                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                                <Camera className="w-3.5 h-3.5" />
                                                <span>Sin fotografía</span>
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {st.photoUrl && (
                                              <button
                                                type="button"
                                                onClick={() => handleDownloadStockpilePhoto(st)}
                                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                              >
                                                <Download className="w-3 h-3" /> Bajar Foto
                                              </button>
                                            )}
                                            {currentUserRole === 'admin' && (
                                              <label
                                                className={`px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                                                  uploadingStockpilePhotoId === st.id ? 'opacity-60 pointer-events-none' : ''
                                                }`}
                                              >
                                                <Upload className="w-3 h-3" />
                                                <span>
                                                  {uploadingStockpilePhotoId === st.id
                                                    ? 'Subiendo...'
                                                    : st.photoUrl
                                                      ? 'Cambiar'
                                                      : 'Subir Foto'}
                                                </span>
                                                <input
                                                  type="file"
                                                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                                  className="hidden"
                                                  onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    e.target.value = '';
                                                    handleQuickUploadStockpilePhoto(st, file);
                                                  }}
                                                />
                                              </label>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] text-amber-400 font-semibold">Densidad:</span>
                                            {currentUserRole === 'admin' ? (
                                              <InlineDensityCell
                                                value={st.densityTonM3 || 1.68}
                                                stockpileName={st.name}
                                                onCommit={(nextDensity) => handleQuickUpdateStockpileDensity(st, nextDensity)}
                                              />
                                            ) : (
                                              <span className="font-mono text-amber-300 font-semibold text-xs">
                                                {formatEsNumber(st.densityTonM3 || 1.68, 2)} t/m³
                                              </span>
                                            )}
                                          </div>

                                          {currentUserRole === 'admin' && (
                                            <div className="inline-flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => handleOpenEditStockpile(st)}
                                                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer"
                                              >
                                                <Edit className="w-3.5 h-3.5" /> Editar
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleDeleteStockpile(st)}
                                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs transition cursor-pointer"
                                                title="Borrar Acopio"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Mobile Filtered Totals Summary */}
                                  <div className="p-3 rounded-xl bg-[#0b0f17] border border-gray-700 space-y-1.5 text-xs">
                                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                      Totales Filtrados ({rows.length} acopios)
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                                      <div className="text-emerald-400 font-bold">Rell: +{formatEsNumber(sumFill)} m³</div>
                                      <div className="text-red-400 font-bold">Desm: -{formatEsNumber(sumCut)} m³</div>
                                      <div className="text-cyan-300 font-bold">
                                        {formatEsNumber(sumTon, 1)} t
                                      </div>
                                      <div className="text-purple-300 font-bold">{formatEsNumber(sumArea)} m²</div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* DESKTOP/TABLET TABLE (>= md) */}
                            <div className="hidden md:block overflow-x-auto">
                              <table className="w-full min-w-[880px] text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                                    <SortableTh
                                      label="Código"
                                      sortKey="code"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      className="p-3"
                                    />
                                    <SortableTh
                                      label="Acopio"
                                      sortKey="name"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      className="p-3"
                                    />
                                    <SortableTh
                                      label="Vuelo Vinculado"
                                      sortKey="flight"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      className="p-3"
                                    />
                                    <SortableTh
                                      label="Zona / Explotación"
                                      sortKey="zone"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      className="p-3"
                                    />
                                    <SortableTh
                                      label="Material"
                                      sortKey="material"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      className="p-3"
                                    />
                                    <SortableTh
                                      label="Densidad"
                                      sortKey="density"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      align="right"
                                      className="p-3 text-amber-300"
                                    />
                                    <SortableTh
                                      label="Relleno"
                                      sortKey="fill"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      align="right"
                                      className="p-3 text-emerald-400"
                                    />
                                    <SortableTh
                                      label="Desmonte"
                                      sortKey="cut"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      align="right"
                                      className="p-3 text-red-400"
                                    />
                                    <SortableTh
                                      label="Neto / Tonelaje"
                                      sortKey="net"
                                      sortState={stockpilesTableSort}
                                      onSort={(key) => setStockpilesTableSort((prev) => toggleSortState(prev, key))}
                                      align="right"
                                      className="p-3 text-cyan-300"
                                    />
                                    <th className="p-3 text-center">Foto</th>
                                    {currentUserRole === 'admin' && <th className="p-3 text-center">Acciones</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/60">
                                  {rows.length === 0 ? (
                                    <tr>
                                      <td colSpan={currentUserRole === 'admin' ? 11 : 10} className="p-6 text-center text-gray-400">
                                        No hay acopios registrados para el filtro seleccionado.
                                      </td>
                                    </tr>
                                  ) : (
                                    rows.map(({ st, survey, zone }) => {
                                      const areaVal =
                                        st.areaM2 ??
                                        Math.round(
                                          Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2
                                        );
                                      const linkedQuarry = zone
                                        ? quarries.find((q) => q.id === zone.quarryId)
                                        : activeQuarry;
                                      return (
                                        <tr key={st.id} className="hover:bg-gray-800/50 transition">
                                          <td className="p-3">
                                            <span className="code-font text-[11px] font-semibold text-indigo-300 whitespace-nowrap">
                                              {st.code}
                                            </span>
                                          </td>
                                          <td className="p-3 font-semibold text-white">
                                            {st.name}
                                          </td>
                                          <td className="p-3">
                                            {survey ? (
                                              <div>
                                                <div className="font-mono text-sky-300 font-semibold">
                                                  {survey.flightCode}
                                                </div>
                                                <div className="text-[10px] text-gray-400 font-mono">
                                                  {formatDateEu(survey.surveyDate)}
                                                </div>
                                              </div>
                                            ) : (
                                              <span className="text-gray-500">—</span>
                                            )}
                                          </td>
                                          <td className="p-3">
                                            {zone ? (
                                              <div>
                                                <div className="text-cyan-300 font-medium">{zone.name}</div>
                                                <div className="text-[10px] text-gray-400">
                                                  {linkedQuarry?.name || zone.code}
                                                </div>
                                              </div>
                                            ) : (
                                              <span className="text-gray-500">—</span>
                                            )}
                                          </td>
                                          <td className="p-3">
                                            {currentUserRole !== 'admin' ? (
                                              <button
                                                type="button"
                                                onClick={() => handleOpenEditStockpile(st)}
                                                className="text-left text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5 group cursor-pointer"
                                                title="Cambiar material (catálogo o personalizado) y densidad"
                                              >
                                                <span>{st.material}</span>
                                                <span className="p-1 bg-gray-800/80 group-hover:bg-gray-700 text-blue-400 rounded border border-gray-700 transition shrink-0">
                                                  <Sliders className="w-3 h-3" />
                                                </span>
                                              </button>
                                            ) : (
                                              <div className="text-blue-400">{st.material}</div>
                                            )}
                                          </td>
                                          <td className="p-3 text-right whitespace-nowrap">
                                            {currentUserRole === 'admin' ? (
                                              <InlineDensityCell
                                                value={st.densityTonM3 || 1.68}
                                                stockpileName={st.name}
                                                onCommit={(nextDensity) => handleQuickUpdateStockpileDensity(st, nextDensity)}
                                              />
                                            ) : (
                                              <span className="font-mono text-amber-300 font-semibold text-xs">
                                                {formatEsNumber(st.densityTonM3 || 1.68, 2)} t/m³
                                              </span>
                                            )}
                                          </td>
                                          <td className="p-3 text-right font-mono text-emerald-400 whitespace-nowrap">
                                            +{formatEsNumber(st.fillVolumeM3)} m³
                                          </td>
                                          <td className="p-3 text-right font-mono text-red-400 whitespace-nowrap">
                                            -{formatEsNumber(st.cutVolumeM3)} m³
                                          </td>
                                          <td className="p-3 text-right font-mono whitespace-nowrap">
                                            <div className="text-blue-400 font-bold">
                                              {formatEsNumber(st.netVolumeM3)} m³
                                            </div>
                                            <div className="text-[11px] text-cyan-300 font-bold">
                                              {formatEsNumber(st.tonnageEst, 1)} t
                                            </div>
                                            <div className="text-[10px] text-purple-300">
                                              {formatEsNumber(areaVal)} m²
                                            </div>
                                          </td>
                                          <td className="p-3 text-center">
                                            <div className="inline-flex items-center justify-center gap-1.5">
                                              {st.photoUrl ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setPreviewStockpilePhoto(st)}
                                                  className="w-9 h-9 rounded-lg overflow-hidden border border-gray-700 hover:border-cyan-400 transition shrink-0 cursor-pointer"
                                                  title={`Ver fotografía de ${st.name}`}
                                                >
                                                  <img
                                                    src={getAuthenticatedPhotoSrc(st.photoUrl)}
                                                    alt={`Foto ${st.name}`}
                                                    className="w-full h-full object-cover"
                                                  />
                                                </button>
                                              ) : (
                                                currentUserRole !== 'admin' && (
                                                  <span className="text-[11px] text-gray-500">Sin foto</span>
                                                )
                                              )}
                                              {currentUserRole === 'admin' && (
                                                <label
                                                  className={`px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                                                    uploadingStockpilePhotoId === st.id ? 'opacity-60 pointer-events-none' : ''
                                                  }`}
                                                  title={st.photoUrl ? 'Sustituir fotografía del acopio' : 'Subir fotografía del acopio'}
                                                >
                                                  <Upload className="w-3.5 h-3.5" />
                                                  <span>
                                                    {uploadingStockpilePhotoId === st.id
                                                      ? '...'
                                                      : st.photoUrl
                                                        ? ''
                                                        : 'Subir'}
                                                  </span>
                                                  <input
                                                    type="file"
                                                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                      const file = e.target.files?.[0];
                                                      e.target.value = '';
                                                      handleQuickUploadStockpilePhoto(st, file);
                                                    }}
                                                  />
                                                </label>
                                              )}
                                            </div>
                                          </td>
                                          {currentUserRole === 'admin' && (
                                            <td className="p-3 text-center">
                                              <div className="inline-flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenEditStockpile(st)}
                                                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer"
                                                  title="Editar acopio, vuelo, densidad, superficie y cubicación"
                                                >
                                                  <Edit className="w-3.5 h-3.5" />
                                                  <span className="hidden xl:inline">Editar</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteStockpile(st)}
                                                  className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs transition cursor-pointer"
                                                  title="Borrar Acopio"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                                <tfoot className="bg-[#0b0f17]/90 font-bold border-t border-gray-700">
                                  <tr>
                                    <td colSpan={6} className="p-3 text-right text-gray-300 uppercase text-[10px]">
                                      Totales Filtrados ({rows.length} acopios):
                                    </td>
                                    <td className="p-3 text-right font-mono text-emerald-400 whitespace-nowrap">
                                      +{formatEsNumber(sumFill)} m³
                                    </td>
                                    <td className="p-3 text-right font-mono text-red-400 whitespace-nowrap">
                                      -{formatEsNumber(sumCut)} m³
                                    </td>
                                    <td className="p-3 text-right font-mono whitespace-nowrap">
                                      <div className="text-blue-400">
                                        {formatEsNumber(sumFill - sumCut)} m³
                                      </div>
                                      <div className="text-[11px] text-cyan-300">
                                        {formatEsNumber(sumTon, 1)} t
                                      </div>
                                      <div className="text-[10px] text-purple-300">
                                        {formatEsNumber(sumArea)} m²
                                      </div>
                                    </td>
                                    <td />
                                    {currentUserRole === 'admin' && <td />}
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Below Table: Active Flight & Table Stockpiles Bar Chart (synced 1:1 with table filters & sort) */}
                <ActiveFlightStockpilesChart
                  activeFlight={activeFlight}
                  isAllFlights={isAllFlights || isMultiFlights}
                  surveysCount={tableFilteredSurveys.length}
                  quarryLabel={
                    isAllQuarries
                      ? `Todas las explotaciones (${scopedQuarries.length})`
                      : activeQuarry?.name
                  }
                  filterSummary={tableFilterSummary}
                  surveys={tableFilteredSurveys}
                  stockpiles={tableFilteredStockpiles}
                  zones={tableFilteredZones}
                  theme={theme}
                />

                {/* Bottom: Official PDF Report Generator Card (Synced 1:1 with visible table filters) */}
                <div className="glass-panel p-3.5 sm:p-5 rounded-xl border border-gray-800 space-y-4 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-500" /> Informe Técnico PDF según Filtros de Tabla
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        El informe se genera con los mismos datos visualizados en la tabla según los filtros de zona, vuelo y ordenación activos, separado en tablas y gráficas por zona.
                      </p>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-cyan-950/70 text-cyan-300 border border-cyan-800 rounded shrink-0">
                      Según Filtros de Tabla
                    </span>
                  </div>

                  <div className="bg-[#0b0f17]/70 p-3.5 rounded-xl border border-gray-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center text-xs">
                    <div className="lg:col-span-4 space-y-1.5">
                      <span className="text-gray-400 text-[11px] flex items-center gap-1">
                        <Plane className="w-3 h-3 text-cyan-400" /> Vuelo(s) en Tabla (según filtro):
                      </span>
                      <div className="bg-[#0b0f17] border border-gray-700/80 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-cyan-300 font-bold truncate">
                            {tableFilteredSurveys.length === 0
                              ? 'Sin vuelos en filtro'
                              : tableFilteredSurveys.length === 1
                                ? tableFilteredSurveys[0].flightCode
                                : `${tableFilteredSurveys.length} vuelos (${tableFilteredSurveys
                                    .map((s) => s.flightCode)
                                    .slice(0, 2)
                                    .join(', ')}${tableFilteredSurveys.length > 2 ? '…' : ''})`}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {isAllFlights
                              ? isAdminView
                                ? 'Modo: Todos los vuelos activos'
                                : 'Modo: Todos los vuelos seleccionados'
                              : isMultiFlights
                                ? `Selección en cabecera (${headerSelectedSurveys.length} vuelos)`
                                : tableFilteredSurveys[0]?.surveyDate
                                  ? `${isAdminView ? 'Vuelo activo' : 'Vuelo seleccionado'} · ${formatDateEu(tableFilteredSurveys[0].surveyDate)}`
                                  : isAdminView
                                    ? 'Vuelo activo'
                                    : 'Vuelo seleccionado'}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold shrink-0">
                          {tableFilteredSurveys.length} {tableFilteredSurveys.length === 1 ? 'vuelo' : 'vuelos'}
                        </span>
                      </div>
                    </div>

                    <div className="lg:col-span-4 space-y-2 lg:border-l lg:border-r lg:border-gray-800 lg:px-4">
                      <div>
                        <span className="text-gray-400 text-[11px] block mb-1">
                          Zona(s) visualizadas en tabla e informe (tabla + gráfica por zona):
                        </span>
                        <select
                          value={activeZoneFilter}
                          disabled={currentQuarryZones.length === 0}
                          onChange={(e) => {
                            const val = e.target.value;
                            setActiveZoneFilter(val);
                            if (val !== 'all') {
                              const z = currentQuarryZones.find((item) => item.name === val);
                              if (z) setActiveZone(z);
                            }
                          }}
                          className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-medium focus:border-blue-500 outline-none disabled:opacity-50"
                        >
                          <option value="all">
                            Todas las zonas ({tableFilteredZones.length}{' '}
                            {tableFilteredZones.length === 1 ? 'zona visible' : 'zonas visibles'})
                          </option>
                          {currentQuarryZones.map((z) => (
                            <option key={z.id} value={z.name}>
                              {z.code} — {z.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-gray-400 text-[11px] block mb-1">
                          Modalidad de Informe PDF:
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPdfReportType('standard')}
                            className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                              pdfReportType === 'standard'
                                ? 'bg-blue-600/20 border-blue-500 text-white'
                                : 'bg-[#0b0f17] border-gray-700 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              Estándar
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                              Tabla técnica actual sin fotos
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfReportType('photographic')}
                            className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                              pdfReportType === 'photographic'
                                ? 'bg-amber-600/20 border-amber-500 text-white'
                                : 'bg-[#0b0f17] border-gray-700 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                              <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              Fotográfico
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                              Añade columna final con miniaturas ({tableFilteredStockpiles.filter((s) => Boolean(s.photoUrl)).length}/{tableFilteredStockpiles.length})
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-4 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-gray-500 block">Zonas:</span>
                          <span className="text-cyan-400 font-mono font-semibold">
                            {tableFilteredZones.length} {tableFilteredZones.length === 1 ? 'zona' : 'zonas'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Acopios:</span>
                          <span className="text-white font-mono font-semibold">
                            {tableFilteredStockpiles.length} reg.
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Vuelos:</span>
                          <span className="text-emerald-400 font-mono font-semibold">
                            {tableFilteredSurveys.length} sel.
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isGeneratingPdf || tableFilteredSurveys.length === 0 || tableFilteredZones.length === 0}
                        onClick={() => handleGenerateZonePdf(undefined, undefined, false, pdfReportType)}
                        className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        {pdfReportType === 'photographic' ? (
                          <Camera className="w-4 h-4 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 shrink-0" />
                        )}
                        {isGeneratingPdf
                          ? 'Generando PDF...'
                          : pdfReportType === 'photographic'
                            ? `Descargar PDF Fotográfico (${tableFilteredStockpiles.length} ${
                                tableFilteredStockpiles.length === 1 ? 'acopio' : 'acopios'
                              })`
                            : `Descargar PDF Estándar (${tableFilteredStockpiles.length} ${
                                tableFilteredStockpiles.length === 1 ? 'acopio' : 'acopios'
                              })`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )
          }

          {/* TAB 3: VISOR FOTOGRAMÉTRICO 3D Y PLANOS 2D (estrictamente una sola explotación/modelo) */}
          {
            viewer3DQuarry && activeTab === 'tab-viewer3d' && canAccessViewer3d && (
              <PhotogrammetryWorkspace
                quarry={viewer3DQuarry}
                zones={viewer3DZones}
                stockpiles={viewer3DStockpiles}
                activeFlight={viewer3DFlight}
                deliverables={viewer3DDeliverables}
                isAdmin={authenticatedRole === 'admin' && currentUserRole === 'admin'}
                preferredDeliverableId={lastUploadedDeliverableId}
                onOpenUploadModal={() => handleOpenUploadDeliverableModal('mesh_obj')}
              />
            )
          }

          {/* TAB 5: DESCARGAS Y ENTREGABLES OFICIALES */}
          {hasQuarryScope && activeTab === 'tab-downloads' && (
            <section className="space-y-6">
              <div className="glass-panel p-3.5 sm:p-5 rounded-xl border border-gray-800 space-y-5 sm:space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-b border-gray-800 pb-4">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-2">
                      <Download className="w-5 h-5 text-blue-500 shrink-0" /> Entregables Oficiales -{' '}
                      <span className="text-blue-400">
                        {isAllQuarries
                          ? `Todas las Explotaciones (${scopedQuarries.length})`
                          : activeQuarry?.name}
                      </span>
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        {officialDeliverables.length}{' '}
                        {officialDeliverables.length === 1 ? 'archivo' : 'archivos'}
                      </span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                      {activeClient && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                          <Building className="w-3 h-3 shrink-0" /> {activeClient.name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                        <Layers className="w-3 h-3 shrink-0" />{' '}
                        {isAllQuarries
                          ? `Todas las explotaciones (${scopedQuarries.length})`
                          : activeQuarry?.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-semibold">
                        <Plane className="w-3 h-3 shrink-0" />{' '}
                        {isAllFlights
                          ? `Todos los vuelos (${currentSurveys.length})`
                          : isMultiFlights
                            ? `${headerSelectedSurveys.length} vuelos (${headerMultiFlightPreview})`
                            : activeFlight
                              ? `${activeFlight.flightCode} (${formatDateEu(activeFlight.surveyDate)})`
                              : 'Sin vuelo seleccionado'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Archivos guardados en el servidor dentro de{' '}
                      <span className="font-mono text-emerald-400">
                        storage/&lt;Codigo&gt;-&lt;Cliente_Linux&gt;/&lt;CodigoVuelo&gt;-&lt;Mision&gt;/
                      </span>{' '}
                      filtrados según el cliente, explotación y vuelo seleccionados en la cabecera.
                    </p>
                  </div>

                  {currentUserRole === 'admin' && (
                    <button
                      type="button"
                      onClick={handleOpenUploadDeliverableModal}
                      className="w-full sm:w-auto justify-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" /> Subir archivos
                    </button>
                  )}
                </div>

                {verifiedUploadNotice && (
                  <div
                    role="status"
                    className="bg-emerald-950/50 border border-emerald-500/50 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-emerald-300">
                          {verifiedUploadNotice.overwritten
                            ? 'Archivo sobrescrito, subido y verificado correctamente en el servidor'
                            : 'Archivo subido y verificado correctamente en el servidor'}
                        </div>
                        <div className="text-gray-200 break-words">
                          <span className="font-semibold text-white">{verifiedUploadNotice.fileName}</span>{' '}
                          ({verifiedUploadNotice.fileSize}
                          {verifiedUploadNotice.bytesStored > 0
                            ? ` · ${formatEsInt(verifiedUploadNotice.bytesStored)} bytes`
                            : ''}
                          )
                        </div>
                        <div className="text-[11px] font-mono text-emerald-300/90 break-all">
                          {verifiedUploadNotice.relativePath}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVerifiedUploadNotice(null)}
                      className="text-gray-400 hover:text-white shrink-0 cursor-pointer"
                      aria-label="Cerrar aviso de subida"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                  {officialDeliverables.length === 0 ? (
                    <div className="col-span-full py-10 text-center text-xs text-gray-400 border border-dashed border-gray-800 rounded-xl">
                      No hay entregables oficiales registrados para{' '}
                      {activeClient ? `${activeClient.name} · ` : ''}
                      {isAllQuarries ? 'las explotaciones seleccionadas' : activeQuarry?.name}
                      {isAllFlights
                        ? ' (todos los vuelos)'
                        : isMultiFlights
                          ? ` · ${headerSelectedSurveys.length} vuelos (${headerMultiFlightPreview})`
                          : activeFlight
                            ? ` · Vuelo ${activeFlight.flightCode}`
                            : ' (sin vuelo seleccionado)'}
                      .
                    </div>
                  ) : (
                    officialDeliverables.map((item) => {
                      const meta = getDeliverableMeta(item.category);
                      const Icon = meta.icon;
                      const linkedFlight = item.surveyId
                        ? surveys.find((s) => s.id === item.surveyId)
                        : undefined;
                      const linkedQuarry = quarries.find((q) => q.id === item.quarryId);
                      const linkedClient = clients.find((c) => c.id === linkedQuarry?.clientId);
                      const displayClientFolder =
                        item.clientFolder ||
                        buildClientFolderName(
                          item.clientCode || linkedClient?.code,
                          item.clientName || linkedClient?.name,
                          linkedClient?.id
                        );
                      const flightSub =
                        item.flightSubFolder ||
                        (linkedFlight ? buildFlightSubFolderName(linkedFlight.flightCode, linkedFlight.notes) : '');
                      const displayPath =
                        item.relativePath ||
                        `storage/${displayClientFolder}/${flightSub ? `${flightSub}/` : ''}${item.fileName}`;
                      const isCopied = copiedDeliverableId === item.id;
                      const isRecentlyUploaded = lastUploadedDeliverableId === item.id;

                      return (
                        <div
                          key={item.id}
                          className={`glass-panel p-4 rounded-xl border flex flex-col justify-between space-y-3 transition ${
                            isRecentlyUploaded
                              ? 'border-emerald-500/70 ring-1 ring-emerald-500/30'
                              : 'border-gray-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`p-3 rounded-lg bg-[#0b0f17] border border-gray-800 ${meta.color} text-xl shrink-0`}>
                                <Icon className="w-6 h-6" />
                              </div>
                              <div className="overflow-hidden">
                                {isRecentlyUploaded && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold uppercase">
                                    <CheckCircle className="w-2.5 h-2.5" /> Subido y verificado
                                  </span>
                                )}
                                <h4 className="font-bold text-white text-xs truncate" title={item.fileName}>
                                  {item.fileName}
                                </h4>
                                <p className="text-[11px] text-gray-300 truncate" title={item.title}>
                                  {item.title}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  {meta.label} · {item.fileSize}
                                </p>
                              </div>
                            </div>
                            {currentUserRole === 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDeliverable(item)}
                                className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition cursor-pointer shrink-0"
                                title="Eliminar entregable"
                                aria-label={`Eliminar ${item.fileName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="space-y-1 text-[10px] text-gray-400 font-mono bg-[#0b0f17]/60 p-2 rounded border border-gray-800">
                            <div className="flex items-start gap-1">
                              <FolderOpen className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                              <span className="text-emerald-400 break-all">{displayPath}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <span>📅 {formatDateEu(item.uploadDate)}</span>
                              {linkedFlight && (
                                <span className="text-blue-300 truncate">{linkedFlight.flightCode}</span>
                              )}
                            </div>
                            <div className="text-[9px]">
                              {item.isServerStored && item.hasPhysicalFile ? (
                                <span className="text-emerald-400">● Archivo real compartido en servidor</span>
                              ) : (
                                <span className="text-amber-400/80">○ Registro de muestra (descarga generada)</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (item.isServerStored && item.hasPhysicalFile) {
                                  const a = document.createElement('a');
                                  const token = localStorage.getItem('ingeodron_token');
                                  a.href = `/api/deliverables/${item.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
                                  a.download = item.fileName;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  showToast('Descarga Entregable', `Descargando ${item.fileName} desde ${displayPath}`);
                                } else {
                                  downloadDeliverableFile(item);
                                  showToast('Descarga Entregable', `Descargando ${item.fileName} en el navegador.`);
                                }
                              }}
                              className="flex-1 py-2 px-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Descargar archivo"
                            >
                              <Download className="w-3.5 h-3.5" /> Descargar
                            </button>
                            {item.isServerStored && item.hasPhysicalFile && (
                              <button
                                type="button"
                                onClick={() => handleCopyShareLink(item)}
                                className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition flex items-center justify-center gap-1 cursor-pointer ${isCopied
                                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                                    : 'bg-[#0b0f17] hover:bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
                                  }`}
                                title="Copiar enlace directo para compartir este archivo"
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          )}

          {/* TAB 6: ADMINISTRACIÓN GLOBAL DE CLIENTES, USUARIOS Y EXPLOTACIONES (Admin Only) */}
          {authenticatedRole === 'admin' && currentUserRole === 'admin' && activeTab === 'tab-clients-admin' && (
            <ClientsUsersAdminPanel
              clients={clients}
              users={users}
              quarries={quarries}
              zones={zones}
              surveys={surveys}
              stockpiles={stockpiles}
              isAdmin={isAdminView}
              activeHeaderClient={activeClient}
              selectedHeaderClientId={adminSelectedClientId}
              activeHeaderQuarry={activeQuarry}
              headerSelectedSurveys={headerSelectedSurveys}
              isAllHeaderFlights={isAllFlights}
              currentUserEmail={userEmail}
              onRefreshData={fetchData}
              onActivateClient={(clientId) => {
                handleAdminClientChange(clientId);
                setActiveTab('tab-flights');
              }}
              onSelectQuarry={(quarry) => {
                setAdminSelectedClientId(quarry.clientId);
                selectQuarryRecord(quarry, true);
                setActiveTab('tab-flights');
              }}
              onNotify={showToast}
              onCurrentUserEdited={(updated) => {
                setUserEmail(updated.email);
                setLoggedUserName(updated.displayName || updated.email);
                try {
                  if (localStorage.getItem('ingeodron_session')) {
                    localStorage.setItem('ingeodron_session', JSON.stringify(updated));
                  }
                } catch {
                  // ignore storage errors
                }
              }}
            />
          )}

          {/* TAB 6: CONFIGURACIÓN DE PARÁMETROS Y MATERIALES (Admin Only) */}
          {authenticatedRole === 'admin' && currentUserRole === 'admin' && activeTab === 'tab-settings' && (
            <AdminParametersPanel onNotify={showToast} />
          )}
        </main>
      </div>

      {/* MODAL EDICIÓN / CREACIÓN DE ZONA (Única por Explotación) */}
      {
        showZoneModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <CubesIcon className="w-5 h-5 text-cyan-400" />
                  {modalZoneData.id === 'new' ? 'Nueva Zona de Explotación' : 'Editar Zona'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowZoneModal(false)}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveZone} className="space-y-3 text-xs">
                {modalZoneData.id === 'new' && currentUserRole === 'admin' && scopedQuarries.length > 1 ? (
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Explotación asignada:</label>
                    <select
                      value={modalZoneData.quarryId}
                      onChange={(e) =>
                        setModalZoneData({ ...modalZoneData, quarryId: parseInt(e.target.value, 10) })
                      }
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-cyan-300 font-semibold cursor-pointer"
                    >
                      {scopedQuarries.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="bg-[#0b0f17]/70 border border-gray-800 rounded-lg p-2.5 text-[11px] text-gray-300">
                    Explotación asignada:{' '}
                    <strong className="text-cyan-300">
                      {quarries.find((q) => q.id === modalZoneData.quarryId)?.name ||
                        activeQuarry?.name ||
                        scopedQuarries[0]?.name}
                    </strong>{' '}
                    (única)
                  </div>
                )}

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Nombre de la Zona:</label>
                  <input
                    type="text"
                    required
                    disabled={currentUserRole !== 'admin'}
                    value={modalZoneData.name}
                    onChange={(e) => setModalZoneData({ ...modalZoneData, name: e.target.value })}
                    placeholder="Ej. Planta de Machaqueo Norte"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Código:</label>
                  <input
                    type="text"
                    required
                    disabled={currentUserRole !== 'admin'}
                    value={modalZoneData.code}
                    onChange={(e) => setModalZoneData({ ...modalZoneData, code: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Estado:</label>
                  <select
                    disabled={currentUserRole !== 'admin'}
                    value={modalZoneData.status}
                    onChange={(e) => setModalZoneData({ ...modalZoneData, status: e.target.value as Zone['status'] })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                  </select>
                </div>

                <div className="pt-3 flex justify-between items-center gap-2">
                  {modalZoneData.id !== 'new' && currentUserRole === 'admin' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const z = currentQuarryZones.find((item) => item.id === parseInt(modalZoneData.id, 10));
                        if (z) {
                          setShowZoneModal(false);
                          handleDeleteZone(z);
                        }
                      }}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg cursor-pointer"
                    >
                      Eliminar Zona
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowZoneModal(false)}
                      className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow cursor-pointer"
                    >
                      {modalZoneData.id === 'new' ? 'Crear Zona' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* MODAL EDICIÓN / CREACIÓN DE ACOPIO EN VUELO */}
      {
        showStockpileModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-400" />
                  {currentUserRole !== 'admin'
                    ? 'Material y Densidad del Acopio'
                    : modalStockpileData.id === 'new'
                      ? 'Nuevo Acopio en Vuelo'
                      : 'Editar Acopio y Densidad'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowStockpileModal(false)}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveStockpile} className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Vuelo / Levantamiento Vinculado:</label>
                  <select
                    required
                    disabled={currentUserRole !== 'admin'}
                    value={modalStockpileData.surveyId}
                    onChange={(e) => setModalStockpileData({ ...modalStockpileData, surveyId: parseInt(e.target.value, 10) })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer disabled:opacity-60"
                  >
                    {currentSurveys.map((s) => {
                      const z = currentQuarryZones.find((item) => item.id === s.zoneId);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.flightCode} ({formatDateEu(s.surveyDate)}){z ? ` — ${z.name}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Nombre del Acopio:</label>
                  <input
                    type="text"
                    required
                    disabled={currentUserRole !== 'admin'}
                    value={modalStockpileData.zoneName}
                    onChange={(e) => setModalStockpileData({ ...modalStockpileData, zoneName: e.target.value })}
                    placeholder="Ej. Pila Grava 12/20 Sector Norte"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Código Acopio:</label>
                    <input
                      type="text"
                      required
                      disabled={currentUserRole !== 'admin'}
                      value={modalStockpileData.name}
                      onChange={(e) => setModalStockpileData({ ...modalStockpileData, name: e.target.value })}
                      placeholder="Ej. ACO-105-A"
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Material:</label>
                    <input
                      type="text"
                      required
                      value={modalStockpileData.material}
                      onChange={(e) => setModalStockpileData({ ...modalStockpileData, material: e.target.value })}
                      placeholder="Ej. Caliza, Zahorra o personalizado"
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>

                {currentUserRole === 'admin' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-gray-300 font-medium mb-1">Tipo de Acopio:</label>
                      <select
                        value={modalStockpileData.stockpileType}
                        onChange={(e) =>
                          setModalStockpileData({
                            ...modalStockpileData,
                            stockpileType: e.target.value as Stockpile['stockpileType'],
                          })
                        }
                        className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                      >
                        <option value="stockpile">Acopio / Pila</option>
                        <option value="bench_extraction">Extracción</option>
                        <option value="fill_dump">Vertedero</option>
                        <option value="basin">Balsa</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-300 font-medium mb-1">Cota Base (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={modalStockpileData.baseElevationM}
                        onChange={(e) =>
                          setModalStockpileData({
                            ...modalStockpileData,
                            baseElevationM: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-cyan-300 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Material Density (t/m3) & Preset Selector */}
                <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="stockpile-density" className="text-amber-400 font-semibold">
                      Densidad del Material (t/m³):
                    </label>
                    <input
                      id="stockpile-density"
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="10.0"
                      required
                      value={modalStockpileData.densidad}
                      onChange={(e) =>
                        setModalStockpileData({
                          ...modalStockpileData,
                          densidad: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-24 bg-[#111827] border border-amber-500/50 rounded-lg px-2.5 py-1 text-right text-amber-300 font-mono font-bold outline-none focus:border-amber-400"
                    />
                  </div>
                  <MaterialDensitySelector
                    density={modalStockpileData.densidad}
                    materialName={modalStockpileData.material}
                    canUpdateMaterial={true}
                    onSelectDensity={(nextDensity, suggestedMaterial) =>
                      setModalStockpileData((prev) => ({
                        ...prev,
                        densidad: nextDensity,
                        ...(suggestedMaterial ? { material: suggestedMaterial } : {}),
                      }))
                    }
                    onChangeCustomMaterial={(customMaterial) =>
                      setModalStockpileData((prev) => ({
                        ...prev,
                        material: customMaterial,
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Relleno (+m³):</label>
                    <input
                      type="number"
                      step="0.1"
                      disabled={currentUserRole !== 'admin'}
                      value={modalStockpileData.relleno}
                      onChange={(e) => setModalStockpileData({ ...modalStockpileData, relleno: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Desmonte (-m³):</label>
                    <input
                      type="number"
                      step="0.1"
                      disabled={currentUserRole !== 'admin'}
                      value={modalStockpileData.desmonte}
                      onChange={(e) => setModalStockpileData({ ...modalStockpileData, desmonte: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Superficie (m²):</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      disabled={currentUserRole !== 'admin'}
                      value={modalStockpileData.areaM2}
                      onChange={(e) => setModalStockpileData({ ...modalStockpileData, areaM2: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-purple-300 font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Observaciones (opcional):</label>
                  <input
                    type="text"
                    disabled={currentUserRole !== 'admin'}
                    value={modalStockpileData.notes}
                    onChange={(e) => setModalStockpileData({ ...modalStockpileData, notes: e.target.value })}
                    placeholder="Ej. Pila principal de expedición"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Fotografía del Acopio */}
                {(() => {
                  const previewSrc =
                    pendingStockpilePhotoPreview ||
                    (modalStockpileData.photoUrl ? getAuthenticatedPhotoSrc(modalStockpileData.photoUrl) : '');
                  return (
                    <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 h-14 rounded-xl bg-[#111827] border border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                          {previewSrc ? (
                            <img
                              src={previewSrc}
                              alt="Vista previa acopio"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Camera className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white text-xs">Fotografía del Acopio</div>
                          <p className="text-[11px] text-gray-400 truncate">
                            {modalStockpileData.photoFileName
                              ? modalStockpileData.photoFileName
                              : 'JPG, PNG o WebP. Disponible para descarga del cliente.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {modalStockpileData.photoUrl && !pendingStockpilePhotoFile && modalStockpileData.id !== 'new' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadStockpilePhoto({
                                id: parseInt(modalStockpileData.id, 10),
                                code: modalStockpileData.name,
                                name: modalStockpileData.zoneName,
                                photoUrl: modalStockpileData.photoUrl,
                                photoFileName: modalStockpileData.photoFileName,
                              })
                            }
                            className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Descargar
                          </button>
                        )}
                        {currentUserRole === 'admin' && (
                          <>
                            <label className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{previewSrc ? 'Cambiar Foto' : 'Subir Foto'}</span>
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  handleSelectModalStockpilePhoto(file);
                                }}
                              />
                            </label>
                            {previewSrc && (
                              <button
                                type="button"
                                onClick={() => {
                                  clearPendingStockpilePhoto();
                                  setModalStockpileData((prev) => ({
                                    ...prev,
                                    photoUrl: '',
                                    photoFileName: '',
                                  }));
                                }}
                                className="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[11px] transition cursor-pointer"
                                title="Quitar fotografía"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Live Tonnage Preview */}
                {(() => {
                  const netM3 = Math.abs((modalStockpileData.relleno || 0) - (modalStockpileData.desmonte || 0));
                  const dens = Number(modalStockpileData.densidad) || 0;
                  const calcTons = Math.round(netM3 * dens * 10) / 10;
                  return (
                    <div className="bg-cyan-950/30 border border-cyan-800/60 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold block">
                          Tonelaje Estimado (m³ × t/m³)
                        </span>
                        <span className="code-font text-[11px] text-gray-400">
                          {formatEsNumber(netM3)} m³ × {formatEsNumber(dens, 2)} t/m³
                        </span>
                      </div>
                      <span className="code-font text-base font-extrabold text-cyan-300">
                        {formatEsNumber(calcTons, 1)} t
                      </span>
                    </div>
                  );
                })()}

                <div className="pt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearPendingStockpilePhoto();
                      setShowStockpileModal(false);
                    }}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow cursor-pointer"
                  >
                    {modalStockpileData.id === 'new' ? 'Crear Acopio' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* MODAL VISTA PREVIA AMPLIADA DE FOTO DE ACOPIO */}
      {
        previewStockpilePhoto && previewStockpilePhoto.photoUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
            onClick={() => setPreviewStockpilePhoto(null)}
          >
            <div
              className="glass-panel w-full max-w-3xl p-4 sm:p-5 rounded-2xl border border-gray-700 shadow-2xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-gray-800 pb-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm sm:text-base truncate flex items-center gap-2">
                    <Camera className="w-4 h-4 text-cyan-400 shrink-0" />
                    {previewStockpilePhoto.name} ({previewStockpilePhoto.code})
                  </h3>
                  <p className="text-xs text-gray-400 truncate">
                    {previewStockpilePhoto.material}
                    {previewStockpilePhoto.photoFileName ? ` · ${previewStockpilePhoto.photoFileName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownloadStockpilePhoto(previewStockpilePhoto)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Descargar Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewStockpilePhoto(null)}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="bg-[#0b0f17] rounded-xl border border-gray-800 p-2 flex items-center justify-center max-h-[75vh] overflow-hidden">
                <img
                  src={getAuthenticatedPhotoSrc(previewStockpilePhoto.photoUrl)}
                  alt={`Fotografía de ${previewStockpilePhoto.name}`}
                  className="max-h-[70vh] w-auto object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL CREAR / EDITAR VUELO */}
      {
        showAddFlightModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="glass-panel w-full max-w-lg p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Plane className="w-5 h-5 text-blue-500" />
                  {modalFlightData.id === 'new' ? 'Registrar Nuevo Vuelo y Acopios' : 'Editar Datos del Vuelo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddFlightModal(false)}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFlight} className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Zona Única Vinculada:</label>
                  <select
                    required
                    value={modalFlightData.zoneId}
                    onChange={(e) => setModalFlightData({ ...modalFlightData, zoneId: parseInt(e.target.value, 10) })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                  >
                    {currentQuarryZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Código de Misión:</label>
                    <input
                      type="text"
                      required
                      value={modalFlightData.code}
                      onChange={(e) => setModalFlightData({ ...modalFlightData, code: e.target.value })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Fecha del Vuelo:</label>
                    <input
                      type="date"
                      required
                      value={modalFlightData.date}
                      onChange={(e) => setModalFlightData({ ...modalFlightData, date: e.target.value })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Título / Notas de la Misión:</label>
                  <input
                    type="text"
                    required
                    value={modalFlightData.title}
                    onChange={(e) => setModalFlightData({ ...modalFlightData, title: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Modelo de Dron / Sensor:</label>
                    <input
                      type="text"
                      required
                      value={modalFlightData.droneModel}
                      onChange={(e) => setModalFlightData({ ...modalFlightData, droneModel: e.target.value })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Operador:</label>
                    <input
                      type="text"
                      required
                      value={modalFlightData.operator}
                      onChange={(e) => setModalFlightData({ ...modalFlightData, operator: e.target.value })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>

                {modalFlightData.id === 'new' ? (
                  <div className="space-y-2.5 bg-[#0b0f17]/80 border border-indigo-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-indigo-300 uppercase">
                        Acopios del Vuelo ({modalFlightStockpiles.length}) — Mínimo 1
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setModalFlightStockpiles((prev) => [
                            ...prev,
                            {
                              name: `Acopio #${prev.length + 1}`,
                              code: `ACO-${prev.length + 1}`,
                              material: 'Grava caliza',
                              densityTonM3: 1.68,
                              fillVolumeM3: 0,
                              cutVolumeM3: 0,
                            },
                          ]);
                        }}
                        className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Añadir acopio
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {modalFlightStockpiles.map((stItem, idx) => (
                        <div key={idx} className="bg-[#111827] border border-gray-800 rounded-lg p-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              required
                              value={stItem.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setModalFlightStockpiles((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, name: val } : it))
                                );
                              }}
                              placeholder="Nombre acopio"
                              className="flex-1 bg-[#0b0f17] border border-gray-700 rounded px-2 py-1 text-white"
                            />
                            {modalFlightStockpiles.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setModalFlightStockpiles((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-1 text-red-400 hover:bg-red-500/15 rounded cursor-pointer"
                                title="Quitar acopio"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div>
                            <input
                              type="text"
                              required
                              value={stItem.material}
                              onChange={(e) => {
                                const val = e.target.value;
                                setModalFlightStockpiles((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, material: val } : it))
                                );
                              }}
                              placeholder="Material"
                              className="w-full bg-[#0b0f17] border border-gray-700 rounded px-2 py-1 text-white"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  (() => {
                    const editingId = parseInt(modalFlightData.id, 10);
                    const childCount = currentStockpiles.filter((st) => st.surveyId === editingId).length;
                    const isMultiStockpile = childCount > 1;
                    return (
                      <div className="space-y-2.5">
                        {isMultiStockpile && (
                          <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-2 text-[11px] text-indigo-300">
                            Este vuelo agrupa <strong>{childCount} acopios</strong>. Edita cada acopio individualmente para modificar su cubicación.
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-gray-300 font-medium mb-1">Relleno (+m³):</label>
                            <input
                              type="number"
                              step="0.1"
                              required
                              disabled={isMultiStockpile}
                              value={modalFlightData.fillVolumeM3}
                              onChange={(e) =>
                                setModalFlightData({ ...modalFlightData, fillVolumeM3: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-emerald-400 font-mono disabled:opacity-60"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-300 font-medium mb-1">Desmonte (-m³):</label>
                            <input
                              type="number"
                              step="0.1"
                              required
                              disabled={isMultiStockpile}
                              value={modalFlightData.cutVolumeM3}
                              onChange={(e) =>
                                setModalFlightData({ ...modalFlightData, cutVolumeM3: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-red-400 font-mono disabled:opacity-60"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-300 font-medium mb-1">GSD (cm/px):</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              required
                              value={modalFlightData.gsd}
                              onChange={(e) =>
                                setModalFlightData({ ...modalFlightData, gsd: parseFloat(e.target.value) || 1.8 })
                              }
                              className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-blue-300 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Estado Operativo del Vuelo:</label>
                  <select
                    value={modalFlightData.status}
                    onChange={(e) => setModalFlightData({ ...modalFlightData, status: e.target.value as SurveyStatus })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                  >
                    <option value="active">🟢 Activo (Active) - Listo para cálculo de volúmenes</option>
                    <option value="pending">🟡 Pendiente (Pending) - En proceso de revisión / calibración GNSS</option>
                    <option value="archived">⚪ Archivado - Histórico consolidado</option>
                  </select>
                </div>

                <div className="pt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddFlightModal(false)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow cursor-pointer"
                  >
                    {modalFlightData.id === 'new' ? 'Crear Vuelo' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* MODAL SUBIDA ENTREGABLES */}
      {
        showUploadDeliverableModal && (() => {
          const selectedUploadQuarry =
            quarries.find((q) => q.id === Number(modalUploadData.quarryId)) ||
            activeQuarry ||
            scopedQuarries[0];
          const selectedUploadClient = clients.find(
            (c) => c.id === selectedUploadQuarry?.clientId
          ) || activeClient;
          const uploadClientCode = selectedUploadClient?.code || 'C000';
          const uploadClientName = selectedUploadClient?.name || 'Cliente General';
          const uploadClientFolder = buildClientFolderName(
            uploadClientCode,
            uploadClientName,
            selectedUploadClient?.id
          );
          const uploadQuarryZoneIds = new Set(
            zones.filter((z) => z.quarryId === selectedUploadQuarry?.id).map((z) => z.id)
          );
          const uploadSurveysForQuarry = surveys.filter((s) => uploadQuarryZoneIds.has(s.zoneId));
          const selectedFlight = uploadSurveysForQuarry.find((s) => s.id === Number(modalUploadData.surveyId));
          const uploadFlightFolder = selectedFlight
            ? buildFlightSubFolderName(selectedFlight.flightCode, selectedFlight.notes)
            : buildFlightSubFolderName('GENERAL', 'Vuelo');

          return (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
              <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-400" />
                    Subir Entregable Compartido
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowUploadDeliverableModal(false)}
                    className="text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveUploadDeliverable} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">
                      Seleccionar Archivo del Equipo:
                    </label>
                    <label className="flex flex-col items-center justify-center gap-1.5 w-full border border-dashed border-blue-500/50 hover:border-blue-400 bg-[#0b0f17] rounded-xl p-4 cursor-pointer transition text-center">
                      <Upload className="w-5 h-5 text-blue-400" />
                      <span className="text-gray-200 font-semibold">
                        {selectedUploadFile ? selectedUploadFile.name : 'Haz clic para elegir archivo (OBJ, GLB, PLY, STL, LAS, XYZ, TIF, PNG, JPG, DXF, PDF)'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {selectedUploadFile
                          ? `Tamaño detectado: ${modalUploadData.fileSize}`
                          : 'Se guardará físicamente en el servidor para compartir'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => handleSelectUploadFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-300 font-medium mb-1">Explotación:</label>
                      <select
                        required
                        value={selectedUploadQuarry?.id || ''}
                        onChange={(e) => {
                          const qId = parseInt(e.target.value, 10) || 0;
                          const zIds = new Set(zones.filter((z) => z.quarryId === qId).map((z) => z.id));
                          const firstFlight = surveys.find((s) => zIds.has(s.zoneId));
                          setModalUploadData((prev) => ({
                            ...prev,
                            quarryId: qId,
                            surveyId: firstFlight?.id || 0,
                          }));
                        }}
                        className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                      >
                        {scopedQuarries.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-300 font-medium mb-1">Vuelo Asociado:</label>
                      <select
                        value={modalUploadData.surveyId || ''}
                        onChange={(e) =>
                          setModalUploadData({
                            ...modalUploadData,
                            surveyId: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                      >
                        <option value="">General (sin vuelo específico)</option>
                        {uploadSurveysForQuarry.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.flightCode} - {s.notes || 'Misión'} ({formatDateEu(s.surveyDate)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Tipo de Archivo:</label>
                    <select
                      value={modalUploadData.category}
                      onChange={(e) => setModalUploadData({ ...modalUploadData, category: e.target.value })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                    >
                      <option value="pdf_report">Informe Volumétrico (PDF)</option>
                      <option value="mesh_obj">Modelo / Malla 3D (OBJ, GLB, GLTF, STL)</option>
                      <option value="pointcloud_las">Nube de Puntos 3D (LAS, PLY, XYZ, PCD, CSV)</option>
                      <option value="orthophoto">Ortomosaico 2D/3D (GeoTIFF, PNG, JPG)</option>
                      <option value="contour_dxf">Curvas de Nivel (DXF)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Título del Entregable:</label>
                    <input
                      type="text"
                      required
                      value={modalUploadData.title}
                      onChange={(e) => setModalUploadData({ ...modalUploadData, title: e.target.value })}
                      placeholder="Ej: Informe Técnico Visado Noviembre 2026"
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Nombre del Archivo en Servidor:</label>
                    <input
                      type="text"
                      required
                      value={modalUploadData.fileName}
                      onChange={(e) => setModalUploadData({ ...modalUploadData, fileName: e.target.value })}
                      placeholder="archivo_entregable.pdf"
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>

                  <div className="p-3 bg-[#0b0f17]/60 rounded-lg border border-gray-800 text-[11px] text-gray-400 space-y-1">
                    <div>
                      <strong>Cliente Propietario:</strong>{' '}
                      <span className="text-cyan-300 font-mono font-semibold">{uploadClientCode}</span>{' '}
                      <span className="text-white font-semibold">— {uploadClientName}</span>
                    </div>
                    {uploadFlightFolder && (
                      <div>
                        <strong>Subcarpeta del Vuelo:</strong>{' '}
                        <span className="text-cyan-300 font-mono text-[10px] font-semibold">{uploadFlightFolder}</span>
                      </div>
                    )}
                    <div>
                      <strong>Ruta en Directorio Raíz (Linux):</strong>{' '}
                      <span className="text-emerald-400 font-mono text-[10px] break-all">
                        storage/{uploadClientFolder}/{uploadFlightFolder ? `${uploadFlightFolder}/` : ''}{modalUploadData.fileName || '<archivo>'}
                      </span>
                    </div>
                  </div>

                  {uploadStage === 'verified' && verifiedUploadNotice ? (
                    <div className="space-y-4 text-xs">
                      <div
                        role="status"
                        className="p-4 bg-emerald-950/45 border border-emerald-500/60 rounded-xl space-y-2.5"
                      >
                        <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                          <span>
                            {verifiedUploadNotice.overwritten
                              ? 'Archivo sobrescrito, subido y verificado'
                              : '¡Archivo subido y verificado correctamente!'}
                          </span>
                        </div>
                        <p className="text-gray-200 leading-relaxed">
                          Se ha comprobado en el servidor que el archivo existe físicamente en disco y ya está disponible para descargar y compartir.
                        </p>
                        <div className="bg-[#0b0f17]/80 border border-emerald-500/30 rounded-lg p-3 space-y-1 text-[11px]">
                          <div>
                            <strong className="text-gray-400">Archivo:</strong>{' '}
                            <span className="text-white font-semibold">{verifiedUploadNotice.fileName}</span>
                          </div>
                          <div>
                            <strong className="text-gray-400">Tamaño verificado:</strong>{' '}
                            <span className="text-cyan-300 font-mono">
                              {verifiedUploadNotice.fileSize}
                              {verifiedUploadNotice.bytesStored > 0
                                ? ` (${formatEsInt(verifiedUploadNotice.bytesStored)} bytes)`
                                : ''}
                            </span>
                          </div>
                          <div>
                            <strong className="text-gray-400">Ruta en servidor:</strong>{' '}
                            <span className="text-emerald-400 font-mono break-all">
                              {verifiedUploadNotice.relativePath}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-1 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUploadFile(null);
                            setUploadProgress(0);
                            setUploadStage('idle');
                            setUploadErrorMessage('');
                            setModalUploadData((prev) => ({
                              ...prev,
                              fileName: '',
                              title: '',
                              fileSize: '',
                            }));
                          }}
                          className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold rounded-lg border border-gray-700 cursor-pointer"
                        >
                          Subir otro archivo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowUploadDeliverableModal(false);
                            setSelectedUploadFile(null);
                            setUploadStage('idle');
                            setActiveTab('tab-downloads');
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow cursor-pointer"
                        >
                          Aceptar y Ver Entregables
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  {uploadConflictInfo?.exists && (
                    <div
                      role="alert"
                      className="p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-200"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-amber-300">
                          Aviso: archivo existente en el directorio del cliente
                        </p>
                        <p className="text-amber-200/90">
                          Ya existe <span className="font-mono font-semibold">{uploadConflictInfo.fileName}</span> en{' '}
                          <span className="font-mono">{uploadConflictInfo.relativePath}</span>. Si continúas, se pedirá confirmación para <strong>sobrescribirlo</strong> (o cambia el nombre arriba).
                        </p>
                      </div>
                    </div>
                  )}

                  {(uploadStage === 'uploading' || uploadStage === 'verifying') && (
                    <div className="p-3 bg-blue-950/35 border border-blue-500/40 rounded-xl space-y-2 text-[11px]">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-blue-300">
                          {uploadStage === 'verifying'
                            ? 'Verificando archivo en el servidor...'
                            : 'Subiendo archivo al servidor...'}
                        </span>
                        <span className="font-mono text-cyan-300">{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-[#0b0f17] rounded-full overflow-hidden border border-gray-800">
                        <div
                          className={`h-full transition-all duration-200 ${
                            uploadStage === 'verifying' ? 'bg-emerald-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadStage === 'error' && uploadErrorMessage && (
                    <div
                      role="alert"
                      className="p-3 bg-red-950/50 border border-red-500/60 rounded-xl flex items-start gap-2.5 text-[11px] text-red-200"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-red-300">No se pudo completar la subida</p>
                        <p>{uploadErrorMessage}</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUploadDeliverableModal(false)}
                      disabled={isUploadingDeliverable}
                      className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingDeliverable || !selectedUploadFile}
                      className={`px-4 py-2 text-white font-bold rounded-lg shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${uploadConflictInfo?.exists
                        ? 'bg-amber-600 hover:bg-amber-500'
                        : 'bg-blue-600 hover:bg-blue-500'
                        }`}
                    >
                      {uploadStage === 'verifying'
                        ? 'Verificando en servidor...'
                        : isUploadingDeliverable
                          ? `Subiendo (${uploadProgress}%)...`
                          : uploadConflictInfo?.exists
                            ? 'Subir (Sobrescribir)'
                            : 'Subir y Guardar'}
                    </button>
                  </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          );
        })()
      }

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        details={confirmDialog.details}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />

      <CsvImportModal
        open={showWorkspaceCsvModal}
        initialMode={workspaceCsvMode}
        clients={clients}
        quarries={quarries}
        zones={zones}
        surveys={surveys}
        stockpiles={stockpiles}
        defaultClientId={activeClient?.id ?? 'auto'}
        onClose={() => setShowWorkspaceCsvModal(false)}
        onSuccess={async (title, message) => {
          await fetchData();
          showToast(title, message);
        }}
      />
    </div>
  );
}
