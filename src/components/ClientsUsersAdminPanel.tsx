import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Building2,
  Layers,
  Plus,
  Edit,
  Trash2,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Search,
  KeyRound,
  Upload,
  Image as ImageIcon,
  Plane,
  Calendar,
  Boxes,
  Package,
  Box,
  FileSpreadsheet,
  Download,
  Camera,
} from 'lucide-react';
import { AppUser, Client, Quarry, Zone, Survey, Stockpile, SurveyStatus } from '../types.ts';
import { localDataStore } from '../utils/localDataStore.ts';
import { buildClientFolderName } from '../utils/folderUtils.ts';
import { formatDateEu } from '../utils/dateUtils.ts';
import { formatEsNumber } from '../utils/numberFormat.ts';
import { SortState, sortRowsBy, toggleSortState } from '../utils/tableSortUtils.ts';
import { SortableTh } from './SortableTh.tsx';
import {
  CsvImportMode,
  downloadFlightsCsvTemplate,
  downloadStockpilesCsvTemplate,
} from '../utils/csvImportUtils.ts';
import {
  uploadStockpilePhoto,
  deleteStockpilePhotoServer,
  downloadStockpilePhoto,
  getAuthenticatedPhotoSrc,
  validateStockpilePhotoFile,
  buildRenamedStockpilePhotoFileName,
} from '../utils/stockpilePhotoUtils.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { MaterialDensitySelector } from './MaterialDensitySelector.tsx';
import { CsvImportModal } from './CsvImportModal.tsx';

interface ClientsUsersAdminPanelProps {
  clients: Client[];
  users: AppUser[];
  quarries: Quarry[];
  zones: Zone[];
  surveys: Survey[];
  stockpiles: Stockpile[];
  isAdmin?: boolean;
  activeHeaderClient: Client | null;
  selectedHeaderClientId?: number | 'all';
  activeHeaderQuarry?: Quarry | null;
  headerSelectedSurveys?: Survey[];
  isAllHeaderFlights?: boolean;
  currentUserEmail: string;
  onRefreshData: () => Promise<void>;
  onActivateClient?: (clientId: number) => void;
  onSelectQuarry: (quarry: Quarry) => void;
  onNotify: (title: string, message: string) => void;
  onCurrentUserEdited?: (updated: AppUser) => void;
}

export const ClientsUsersAdminPanel: React.FC<ClientsUsersAdminPanelProps> = ({
  clients,
  users,
  quarries,
  zones,
  surveys,
  stockpiles,
  isAdmin = false,
  activeHeaderClient,
  selectedHeaderClientId = 'all',
  activeHeaderQuarry = null,
  headerSelectedSurveys = [],
  isAllHeaderFlights = true,
  currentUserEmail,
  onRefreshData,
  onActivateClient,
  onSelectQuarry,
  onNotify,
  onCurrentUserEdited,
}) => {
  const [subTab, setSubTab] = useState<'clients' | 'users' | 'quarries' | 'zones' | 'flights' | 'stockpiles'>('clients');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [tableSorts, setTableSorts] = useState<Record<string, SortState<string> | null>>({});
  const handleTableSort = (tableKey: string, columnKey: string) => {
    setTableSorts((prev) => ({
      ...prev,
      [tableKey]: toggleSortState(prev[tableKey], columnKey),
    }));
  };
  const [showCsvImportModal, setShowCsvImportModal] = useState<boolean>(false);
  const [csvImportMode, setCsvImportMode] = useState<CsvImportMode>('flights');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    details?: string[];
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    details: [],
    confirmLabel: 'Eliminar',
    onConfirm: () => { },
  });

  // Client Modal state (Create or Edit)
  const [showClientModal, setShowClientModal] = useState<boolean>(false);
  const [clientForm, setClientForm] = useState({
    id: 'new',
    code: '',
    name: '',
    cif: '',
    contactName: '',
    contactEmail: '',
    phone: '',
    notes: '',
    logoUrl: '',
    viewer3dEnabled: false,
    // Optional initial quarry + user when creating a new client
    createQuarryAndUser: true,
    quarryName: '',
    quarryLocation: 'España',
    zonesList: 'Planta de Machaqueo, Frente Principal',
    userPassword: '',
  });

  // User Modal state (Create or Edit)
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [showUserPass, setShowUserPass] = useState<boolean>(false);
  const [userForm, setUserForm] = useState({
    id: 'new',
    displayName: '',
    username: '',
    email: '',
    password: '',
    role: 'client' as 'admin' | 'client',
    clientId: clients[0]?.id || 1,
    active: true,
  });

  // Quarry Modal state (Create or Edit)
  const [showQuarryModal, setShowQuarryModal] = useState<boolean>(false);
  const [quarryForm, setQuarryForm] = useState({
    id: 'new',
    clientId: clients[0]?.id || 1,
    name: '',
    code: '',
    location: '',
    status: 'active' as 'active' | 'in_restoration' | 'inactive',
  });

  // Zone Modal state (Create or Edit)
  const [showZoneModal, setShowZoneModal] = useState<boolean>(false);
  const [zoneForm, setZoneForm] = useState({
    id: 'new',
    quarryId: quarries[0]?.id || 1,
    name: '',
    code: '',
    status: 'active' as Zone['status'],
  });

  // Flight (Survey) Modal state (Create or Edit)
  const [showFlightModal, setShowFlightModal] = useState<boolean>(false);
  const [flightForm, setFlightForm] = useState({
    id: 'new',
    zoneId: zones[0]?.id || 1,
    flightCode: '',
    surveyDate: new Date().toISOString().slice(0, 10),
    notes: '',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    fillVolumeM3: 35000,
    cutVolumeM3: 150,
    groundResolutionCm: 1.8,
    status: 'active' as SurveyStatus,
  });

  // Stockpile (Acopio) Modal state (Create or Edit)
  const [showStockpileModal, setShowStockpileModal] = useState<boolean>(false);
  const [stockpileForm, setStockpileForm] = useState({
    id: 'new',
    surveyId: surveys[0]?.id || 1,
    name: '',
    code: '',
    stockpileType: 'stockpile' as Stockpile['stockpileType'],
    material: 'Grava caliza 12/20',
    densityTonM3: 1.68,
    baseElevationM: 115.0,
    areaM2: 2900,
    fillVolumeM3: 18000,
    cutVolumeM3: 0,
    notes: '',
    photoUrl: '',
    photoFileName: '',
  });
  const [pendingStockpilePhotoFile, setPendingStockpilePhotoFile] = useState<File | null>(null);
  const [pendingStockpilePhotoPreview, setPendingStockpilePhotoPreview] = useState<string>('');
  const [uploadingStockpilePhotoId, setUploadingStockpilePhotoId] = useState<number | null>(null);
  const [previewStockpilePhoto, setPreviewStockpilePhoto] = useState<Stockpile | null>(null);

  // Admin-only scoping strictly synced to header selectors: Cliente -> Explotación -> Vuelos
  const scopedClientId = isAdmin
    ? selectedHeaderClientId !== 'all'
      ? selectedHeaderClientId
      : activeHeaderQuarry
        ? activeHeaderQuarry.clientId
        : null
    : null;

  const effectiveHeaderClient =
    scopedClientId !== null
      ? clients.find((c) => c.id === scopedClientId) || activeHeaderClient
      : null;

  // For administrator, the Clients table in Tab 5 always lists all clients regardless of header filter
  const headerScopedClients = isAdmin
    ? clients
    : scopedClientId !== null
      ? clients.filter((c) => c.id === scopedClientId)
      : clients;

  // For administrator, the Users table in Tab 5 always lists all users regardless of header filter
  const headerScopedUsers = isAdmin
    ? users
    : scopedClientId !== null
      ? users.filter((u) => u.clientId === scopedClientId)
      : users;

  const headerScopedQuarries = !isAdmin
    ? quarries
    : activeHeaderQuarry
      ? quarries.filter((item) => item.id === activeHeaderQuarry.id)
      : scopedClientId !== null
        ? quarries.filter((item) => item.clientId === scopedClientId)
        : quarries;

  const headerScopedQuarryIds = new Set(headerScopedQuarries.map((item) => item.id));

  const headerScopedZones = !isAdmin
    ? zones
    : zones.filter((z) => headerScopedQuarryIds.has(z.quarryId));

  const headerScopedZoneIds = new Set(headerScopedZones.map((z) => z.id));

  const quarryScopedSurveys = !isAdmin
    ? surveys
    : surveys.filter((s) => headerScopedZoneIds.has(s.zoneId));

  const headerSelectedSurveyIdSet = new Set(headerSelectedSurveys.map((s) => s.id));

  const headerScopedSurveys = !isAdmin
    ? surveys
    : isAllHeaderFlights
      ? quarryScopedSurveys
      : headerSelectedSurveys.length > 0
        ? quarryScopedSurveys.filter((s) => headerSelectedSurveyIdSet.has(s.id))
        : [];

  const headerScopedSurveyIds = new Set(headerScopedSurveys.map((s) => s.id));

  const headerScopedStockpiles = !isAdmin
    ? stockpiles
    : stockpiles.filter((st) => headerScopedSurveyIds.has(st.surveyId));

  const q = searchTerm.toLowerCase().trim();

  const filteredClients = headerScopedClients.filter(
    (c) =>
      !q ||
      (c.code || '').toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.cif.toLowerCase().includes(q) ||
      c.contactName.toLowerCase().includes(q) ||
      c.contactEmail.toLowerCase().includes(q)
  );

  const filteredUsers = headerScopedUsers.filter((u) => {
    if (!q) return true;
    const linkedClient = u.clientId ? clients.find((c) => c.id === u.clientId) : null;
    return (
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (linkedClient?.name || '').toLowerCase().includes(q)
    );
  });

  const filteredQuarries = headerScopedQuarries.filter((item) => {
    if (!q) return true;
    const linkedClient = clients.find((c) => c.id === item.clientId);
    return (
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      (linkedClient?.name || '').toLowerCase().includes(q)
    );
  });

  const filteredZones = headerScopedZones.filter((z) => {
    if (!q) return true;
    const linkedQuarry = quarries.find((item) => item.id === z.quarryId);
    const linkedClient = linkedQuarry ? clients.find((c) => c.id === linkedQuarry.clientId) : null;
    return (
      z.name.toLowerCase().includes(q) ||
      z.code.toLowerCase().includes(q) ||
      (linkedQuarry?.name || '').toLowerCase().includes(q) ||
      (linkedClient?.name || '').toLowerCase().includes(q)
    );
  });

  // In Tab 5 -> Vuelos, administrator sees all flights belonging to the header-selected client and quarry
  const filteredFlights = quarryScopedSurveys.filter((s) => {
    if (!q) return true;
    const linkedZone = zones.find((z) => z.id === s.zoneId);
    const linkedQuarry = linkedZone ? quarries.find((item) => item.id === linkedZone.quarryId) : null;
    const linkedClient = linkedQuarry ? clients.find((c) => c.id === linkedQuarry.clientId) : null;
    return (
      s.flightCode.toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q) ||
      s.surveyDate.toLowerCase().includes(q) ||
      formatDateEu(s.surveyDate).toLowerCase().includes(q) ||
      (linkedZone?.name || '').toLowerCase().includes(q) ||
      (linkedQuarry?.name || '').toLowerCase().includes(q) ||
      (linkedClient?.name || '').toLowerCase().includes(q)
    );
  });

  const filteredStockpiles = headerScopedStockpiles.filter((st) => {
    if (!q) return true;
    const linkedSurvey = surveys.find((s) => s.id === st.surveyId);
    const linkedZone = linkedSurvey ? zones.find((z) => z.id === linkedSurvey.zoneId) : null;
    const linkedQuarry = linkedZone ? quarries.find((item) => item.id === linkedZone.quarryId) : null;
    const linkedClient = linkedQuarry ? clients.find((c) => c.id === linkedQuarry.clientId) : null;
    return (
      st.name.toLowerCase().includes(q) ||
      st.code.toLowerCase().includes(q) ||
      st.material.toLowerCase().includes(q) ||
      (linkedSurvey?.flightCode || '').toLowerCase().includes(q) ||
      (linkedZone?.name || '').toLowerCase().includes(q) ||
      (linkedQuarry?.name || '').toLowerCase().includes(q) ||
      (linkedClient?.name || '').toLowerCase().includes(q)
    );
  });

  const sortedClients = sortRowsBy(filteredClients, tableSorts.clients, (c, key) => {
    switch (key) {
      case 'code':
        return c.code || `C${100 + c.id}`;
      case 'name':
        return c.name;
      case 'cif':
        return c.cif;
      case 'contactName':
        return c.contactName;
      case 'contactEmail':
        return c.contactEmail;
      case 'quarriesCount':
        return quarries.filter((item) => item.clientId === c.id).length;
      case 'usersCount':
        return users.filter((u) => u.clientId === c.id).length;
      case 'viewer3dEnabled':
        return c.viewer3dEnabled ? 1 : 0;
      default:
        return '';
    }
  });

  const sortedUsers = sortRowsBy(filteredUsers, tableSorts.users, (u, key) => {
    switch (key) {
      case 'displayName':
        return u.displayName || u.username;
      case 'email':
        return u.email;
      case 'password':
        return u.password ? 1 : 0;
      case 'role':
        return u.role;
      case 'company':
        return u.role === 'admin'
          ? 'Todas las explotaciones'
          : (u.clientId ? clients.find((c) => c.id === u.clientId)?.name : '') || 'Sin asignar';
      case 'active':
        return u.active !== false ? 1 : 0;
      default:
        return '';
    }
  });

  const sortedQuarries = sortRowsBy(filteredQuarries, tableSorts.quarries, (item, key) => {
    switch (key) {
      case 'code':
        return item.code;
      case 'name':
        return item.name;
      case 'clientName':
        return clients.find((c) => c.id === item.clientId)?.name || '';
      case 'location':
        return item.location;
      case 'zonesCount':
        return zones.filter((z) => z.quarryId === item.id).length;
      default:
        return '';
    }
  });

  const sortedZones = sortRowsBy(filteredZones, tableSorts.zones, (z, key) => {
    switch (key) {
      case 'code':
        return z.code;
      case 'name':
        return z.name;
      case 'quarryName':
        return quarries.find((item) => item.id === z.quarryId)?.name || '';
      case 'surveysCount':
        return surveys.filter((s) => s.zoneId === z.id).length;
      default:
        return '';
    }
  });

  const sortedFlights = sortRowsBy(filteredFlights, tableSorts.flights, (s, key) => {
    switch (key) {
      case 'flightCode':
        return s.flightCode;
      case 'mission':
        return s.notes || `Misión ${s.flightCode}`;
      case 'surveyDate':
        return s.surveyDate;
      case 'zoneName':
        return zones.find((z) => z.id === s.zoneId)?.name || '';
      case 'stockpilesCount':
        return stockpiles.filter((st) => st.surveyId === s.id).length;
      case 'status':
        return s.status || 'archived';
      default:
        return '';
    }
  });

  const sortedStockpiles = sortRowsBy(filteredStockpiles, tableSorts.stockpiles, (st, key) => {
    const linkedSurvey = surveys.find((s) => s.id === st.surveyId);
    const linkedZone = linkedSurvey ? zones.find((z) => z.id === linkedSurvey.zoneId) : null;
    switch (key) {
      case 'code':
        return st.code;
      case 'name':
        return st.name;
      case 'flight':
        return linkedSurvey?.flightCode || '';
      case 'zone':
        return linkedZone?.name || '';
      case 'material':
        return st.material;
      case 'density':
        return st.densityTonM3 || 1.68;
      case 'fill':
        return st.fillVolumeM3;
      case 'cut':
        return st.cutVolumeM3;
      case 'net':
        return st.netVolumeM3;
      default:
        return '';
    }
  });

  // --- CLIENT HANDLERS ---
  const processLogoFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('El archivo debe ser una imagen (PNG, JPG, WebP o SVG).'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
      reader.onload = () => {
        const rawDataUrl = String(reader.result || '');
        if (file.type === 'image/svg+xml') {
          if (file.size > 300 * 1024) {
            reject(new Error('El logo SVG supera los 300 KB permitidos.'));
            return;
          }
          resolve(rawDataUrl);
          return;
        }
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagen no válido.'));
        img.onload = () => {
          const maxDim = 256;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleClientLogoUpload = async (file: File | undefined, directClient?: Client) => {
    if (!file) return;
    try {
      const dataUrl = await processLogoFile(file);
      if (directClient) {
        localDataStore.updateClient(directClient.id, { logoUrl: dataUrl });
        onNotify('Logo Actualizado', `Logo de ${directClient.name} guardado correctamente.`);
        await onRefreshData();
      } else {
        setClientForm((prev) => ({ ...prev, logoUrl: dataUrl }));
      }
    } catch (err: any) {
      onNotify('Error al Subir Logo', err.message || 'No se pudo procesar la imagen.');
    }
  };

  const openCreateClient = () => {
    const nextCodeNum =
      clients.length > 0 ? Math.max(...clients.map((c) => 100 + c.id)) + 1 : 101;
    setClientForm({
      id: 'new',
      code: `C${nextCodeNum}`,
      name: '',
      cif: '',
      contactName: '',
      contactEmail: '',
      phone: '',
      notes: '',
      logoUrl: '',
      viewer3dEnabled: false,
      createQuarryAndUser: true,
      quarryName: '',
      quarryLocation: 'España',
      zonesList: 'Planta de Machaqueo, Frente Principal',
      userPassword: '',
    });
    setShowClientModal(true);
  };

  const openEditClient = (c: Client) => {
    setClientForm({
      id: c.id.toString(),
      code: c.code || `C${100 + c.id}`,
      name: c.name,
      cif: c.cif,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      phone: c.phone || '',
      notes: c.notes || '',
      logoUrl: c.logoUrl || '',
      viewer3dEnabled: Boolean(c.viewer3dEnabled),
      createQuarryAndUser: false,
      quarryName: '',
      quarryLocation: '',
      zonesList: '',
      userPassword: '',
    });
    setShowClientModal(true);
  };

  const handleToggleClientViewer3d = async (c: Client) => {
    const nextVal = !Boolean(c.viewer3dEnabled);
    localDataStore.updateClient(c.id, { viewer3dEnabled: nextVal });
    onNotify(
      nextVal ? 'Visor 3D Activado' : 'Visor 3D Desactivado',
      `${c.name}: ${nextVal ? 'el cliente ya tiene acceso al Visor 3D y Planos 2D.' : 'visor fotogramétrico deshabilitado para este cliente.'}`
    );
    await onRefreshData();
  };

  const getAdminAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ingeodron_token') : null;
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const syncServerUsers = async () => {
    try {
      const users = localDataStore.getUsers();
      await fetch('/api/auth/sync-users', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ users }),
      });
    } catch {
      // Non-blocking offline
    }
  };

  const syncServerClients = async () => {
    try {
      const clients = localDataStore.getClients();
      await fetch('/api/auth/sync-clients', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ clients }),
      });
    } catch {
      // Non-blocking offline
    }
  };

  const ensureServerClientFolder = async (clientCode: string, clientName: string) => {
    try {
      await fetch('/api/clients/ensure-folder', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ clientCode, clientName }),
      });
    } catch {
      // Non-blocking when offline
    }
  };

  /** Removes server-stored deliverables matching a deleted client, quarry, or flight. */
  const cleanupServerDeliverables = async (
    predicate: (d: { id: number; surveyId?: number; quarryId?: number; clientFolder?: string }) => boolean
  ) => {
    try {
      const resp = await fetch('/api/deliverables', { headers: getAdminAuthHeaders() });
      if (!resp.ok) return;
      const data = await resp.json();
      const list = Array.isArray(data?.deliverables) ? data.deliverables : [];
      const toDelete = list.filter(predicate);
      if (toDelete.length > 0) {
        await Promise.allSettled(
          toDelete.map((d: { id: number }) =>
            fetch(`/api/deliverables/${d.id}`, {
              method: 'DELETE',
              headers: getAdminAuthHeaders(),
            })
          )
        );
      }
    } catch {
      // Non-blocking when offline
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = clientForm.code.trim();
    const cleanName = clientForm.name.trim();
    if (clientForm.id === 'new') {
      const createdClient = localDataStore.createClient({
        code: cleanCode || undefined,
        name: cleanName,
        cif: clientForm.cif.trim(),
        contactName: clientForm.contactName.trim(),
        contactEmail: clientForm.contactEmail.trim(),
        phone: clientForm.phone.trim(),
        notes: clientForm.notes.trim(),
        logoUrl: clientForm.logoUrl || undefined,
        viewer3dEnabled: clientForm.viewer3dEnabled,
      });

      await ensureServerClientFolder(createdClient.code, createdClient.name);

      if (clientForm.createQuarryAndUser) {
        if (clientForm.quarryName.trim()) {
          const createdQuarry = localDataStore.createQuarry({
            clientId: createdClient.id,
            name: clientForm.quarryName.trim(),
            code: `CAN-${Math.floor(100 + Math.random() * 900)}`,
            location: clientForm.quarryLocation.trim() || 'España',
            status: 'active',
          });
          const rawZones = clientForm.zonesList.split(',').map((s) => s.trim()).filter(Boolean);
          for (const zName of rawZones) {
            localDataStore.createZone({
              quarryId: createdQuarry.id,
              name: zName,
              code: `ZON-${Math.floor(10 + Math.random() * 90)}`,
            });
          }
        }
        if (clientForm.userPassword.trim()) {
          localDataStore.createUser({
            email: clientForm.contactEmail.trim(),
            username: clientForm.contactEmail.trim().split('@')[0],
            password: clientForm.userPassword.trim(),
            displayName: `${clientForm.contactName.trim()} — ${cleanName}`,
            role: 'client',
            clientId: createdClient.id,
            active: true,
          });
        }
      }

      const folderName = buildClientFolderName(createdClient.code, createdClient.name);
      onNotify('Cliente Registrado', `${createdClient.name} (${folderName}) dado de alta correctamente.`);
      await syncServerClients();
      if (clientForm.createQuarryAndUser && clientForm.userPassword.trim()) {
        await syncServerUsers();
      }
      setShowClientModal(false);
      await onRefreshData();
      onActivateClient?.(createdClient.id);
      return;
    } else {
      const clientId = parseInt(clientForm.id, 10);
      const updated = localDataStore.updateClient(clientId, {
        code: cleanCode || `C${100 + clientId}`,
        name: cleanName,
        cif: clientForm.cif.trim(),
        contactName: clientForm.contactName.trim(),
        contactEmail: clientForm.contactEmail.trim(),
        phone: clientForm.phone.trim(),
        notes: clientForm.notes.trim(),
        logoUrl: clientForm.logoUrl || undefined,
        viewer3dEnabled: clientForm.viewer3dEnabled,
      });
      if (updated) {
        await ensureServerClientFolder(updated.code, updated.name);
      }
      onNotify('Cliente Actualizado', `Datos de ${cleanName} guardados.`);
    }

    await syncServerClients();
    setShowClientModal(false);
    await onRefreshData();
  };

  const handleDeleteClient = (c: Client) => {
    const ownedCount = quarries.filter((item) => item.clientId === c.id).length;
    setConfirmDialog({
      open: true,
      title: 'Eliminar Cliente',
      message: `¿Seguro que deseas eliminar el cliente "${c.name}"?`,
      details:
        ownedCount > 0
          ? [`Se eliminarán también sus ${ownedCount} explotaciones exclusivas, zonas, vuelos y usuarios vinculados.`]
          : ['Se eliminará el cliente y sus credenciales asociadas.'],
      confirmLabel: 'Eliminar Cliente',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        const clientFolder = buildClientFolderName(c.code, c.name, c.id);
        await cleanupServerDeliverables((d) => d.clientFolder === clientFolder);
        localDataStore.deleteClient(c.id);
        await syncServerClients();
        await syncServerUsers();
        onNotify('Cliente Eliminado', `${c.name} eliminado del registro.`);
        await onRefreshData();
      },
    });
  };

  // --- USER HANDLERS ---
  const openCreateUser = () => {
    setShowUserPass(false);
    setUserForm({
      id: 'new',
      displayName: '',
      username: '',
      email: '',
      password: '',
      role: 'client',
      clientId: scopedClientId ?? clients[0]?.id ?? 1,
      active: true,
    });
    setShowUserModal(true);
  };

  const openEditUser = (u: AppUser) => {
    setShowUserPass(false);
    setUserForm({
      id: u.id.toString(),
      displayName: u.displayName || '',
      username: u.username || '',
      email: u.email,
      password: u.password || '',
      role: u.role,
      clientId: u.clientId || clients[0]?.id || 1,
      active: u.active !== false,
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = userForm.email.trim();
    const cleanUsername = userForm.username.trim() || cleanEmail.split('@')[0];

    if (userForm.id === 'new') {
      const created = localDataStore.createUser({
        displayName: userForm.displayName.trim() || cleanUsername,
        username: cleanUsername,
        email: cleanEmail,
        password: userForm.password.trim() || 'ingeodron2026',
        role: userForm.role,
        clientId: userForm.role === 'admin' ? undefined : userForm.clientId,
        active: userForm.active,
      });
      onNotify('Usuario Creado', `Acceso habilitado para ${created.email}.`);
    } else {
      const userId = parseInt(userForm.id, 10);
      const updated = localDataStore.updateUser(userId, {
        displayName: userForm.displayName.trim() || cleanUsername,
        username: cleanUsername,
        email: cleanEmail,
        password: userForm.password.trim(),
        role: userForm.role,
        clientId: userForm.role === 'admin' ? undefined : userForm.clientId,
        active: userForm.active,
      });
      if (updated && updated.email === currentUserEmail && onCurrentUserEdited) {
        onCurrentUserEdited(updated);
      }
      onNotify('Usuario Actualizado', `Credenciales y perfil de ${cleanEmail} guardados.`);
    }

    await syncServerUsers();
    setShowUserModal(false);
    await onRefreshData();
  };

  const handleDeleteUser = async (u: AppUser) => {
    if (u.email.toLowerCase() === currentUserEmail.toLowerCase()) {
      onNotify('Acción Bloqueada', 'No puedes eliminar tu propio usuario con sesión iniciada.');
      return;
    }
    setConfirmDialog({
      open: true,
      title: 'Eliminar Usuario',
      message: `¿Seguro que deseas eliminar el usuario "${u.displayName || u.email}"?`,
      confirmLabel: 'Eliminar Usuario',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        localDataStore.deleteUser(u.id);
        await syncServerUsers();
        onNotify('Usuario Eliminado', `Acceso de ${u.email} eliminado.`);
        await onRefreshData();
      },
    });
  };

  // --- QUARRY HANDLERS ---
  const openCreateQuarry = (presetClientId?: number) => {
    if (clients.length === 0) {
      onNotify('Cliente Requerido', 'Cada explotación pertenece a un único cliente. Crea primero un cliente.');
      return;
    }
    setQuarryForm({
      id: 'new',
      clientId: presetClientId ?? scopedClientId ?? clients[0].id,
      name: '',
      code: '',
      location: '',
      status: 'active',
    });
    setShowQuarryModal(true);
  };

  const openEditQuarry = (item: Quarry) => {
    setQuarryForm({
      id: item.id.toString(),
      clientId: item.clientId,
      name: item.name,
      code: item.code,
      location: item.location,
      status: item.status,
    });
    setShowQuarryModal(true);
  };

  const handleSaveQuarry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!quarryForm.clientId || !clients.some((c) => c.id === Number(quarryForm.clientId))) {
        onNotify('Cliente Propietario Requerido', 'Selecciona un único cliente propietario válido para la explotación.');
        return;
      }

      if (quarryForm.id === 'new') {
        localDataStore.createQuarry({
          clientId: Number(quarryForm.clientId),
          name: quarryForm.name.trim(),
          code: quarryForm.code.trim() || `CAN-${Math.floor(100 + Math.random() * 900)}`,
          location: quarryForm.location.trim() || 'España',
          status: quarryForm.status,
        });
        const ownerName = clients.find((c) => c.id === Number(quarryForm.clientId))?.name;
        onNotify('Explotación Creada', `${quarryForm.name} asignada exclusivamente a ${ownerName || 'cliente'}.`);
      } else {
        const qId = parseInt(quarryForm.id, 10);
        localDataStore.updateQuarry(qId, {
          clientId: Number(quarryForm.clientId),
          name: quarryForm.name.trim(),
          code: quarryForm.code.trim(),
          location: quarryForm.location.trim(),
          status: quarryForm.status,
        });
        onNotify('Explotación Actualizada', `Cambios guardados en ${quarryForm.name}.`);
      }

      setShowQuarryModal(false);
      await onRefreshData();
    } catch (err: any) {
      onNotify('Error de Asignación', err.message || 'No se pudo guardar la explotación.');
    }
  };

  const handleDeleteQuarry = (item: Quarry) => {
    const qZonesCount = zones.filter((z) => z.quarryId === item.id).length;
    setConfirmDialog({
      open: true,
      title: 'Eliminar Explotación',
      message: `¿Seguro que deseas eliminar la explotación "${item.name}"?`,
      details:
        qZonesCount > 0
          ? [`Se eliminarán sus ${qZonesCount} zona(s), vuelos y acopios vinculados.`]
          : undefined,
      confirmLabel: 'Eliminar Explotación',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        await cleanupServerDeliverables((d) => d.quarryId === item.id);
        localDataStore.deleteQuarry(item.id);
        onNotify('Explotación Eliminada', `${item.name} borrada del directorio.`);
        await onRefreshData();
      },
    });
  };

  // --- ZONE HANDLERS ---
  const openCreateZone = (defaultQuarryId?: number) => {
    if (headerScopedQuarries.length === 0) {
      onNotify('Sin Explotaciones', 'Crea primero una explotación para este cliente para poder añadir zonas.');
      return;
    }
    setZoneForm({
      id: 'new',
      quarryId: defaultQuarryId || headerScopedQuarries[0].id,
      name: '',
      code: `ZON-${Math.floor(100 + Math.random() * 900)}`,
      status: 'active',
    });
    setShowZoneModal(true);
  };

  const openEditZone = (z: Zone) => {
    setZoneForm({
      id: z.id.toString(),
      quarryId: z.quarryId,
      name: z.name,
      code: z.code,
      status: z.status || 'active',
    });
    setShowZoneModal(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();

    if (zoneForm.id === 'new') {
      localDataStore.createZone({
        quarryId: Number(zoneForm.quarryId),
        name: zoneForm.name.trim(),
        code: zoneForm.code.trim() || `ZON-${Math.floor(100 + Math.random() * 900)}`,
        status: zoneForm.status,
      });
      onNotify('Zona Creada', `Zona "${zoneForm.name.trim()}" registrada correctamente.`);
    } else {
      const zId = parseInt(zoneForm.id, 10);
      localDataStore.updateZone(zId, {
        quarryId: Number(zoneForm.quarryId),
        name: zoneForm.name.trim(),
        code: zoneForm.code.trim(),
        status: zoneForm.status,
      });
      onNotify('Zona Actualizada', `Datos de "${zoneForm.name.trim()}" actualizados.`);
    }

    setShowZoneModal(false);
    await onRefreshData();
  };

  const handleDeleteZone = (z: Zone) => {
    const zSurveys = surveys.filter((s) => s.zoneId === z.id);
    const zSurveyIds = new Set(zSurveys.map((s) => s.id));
    const zStockpilesCount = stockpiles.filter((st) => zSurveyIds.has(st.surveyId)).length;
    const details: string[] = [
      `Se borrará la zona "${z.name}" (${z.code}) del registro de zonas.`,
      zSurveys.length > 0
        ? `Se eliminarán ${zSurveys.length} vuelo(s) vinculados de la lista de vuelos.`
        : 'No hay vuelos vinculados a esta zona.',
    ];
    if (zStockpilesCount > 0) {
      details.push(`Se eliminarán ${zStockpilesCount} acopio(s) asociados.`);
    }

    setConfirmDialog({
      open: true,
      title: 'Eliminar Zona y Vuelos Vinculados',
      message: `¿Seguro que deseas eliminar la zona "${z.name}"?`,
      details,
      confirmLabel: 'Eliminar Zona',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        const result = localDataStore.deleteZone(z.id);
        onNotify(
          'Zona Eliminada',
          result.deletedSurveysCount > 0
            ? `La zona "${z.name}" y sus ${result.deletedSurveysCount} vuelo(s) vinculados han sido eliminados.`
            : `La zona "${z.name}" ha sido eliminada.`
        );
        await onRefreshData();
      },
    });
  };

  // --- FLIGHT (SURVEY) HANDLERS ---
  const openCreateFlight = (defaultZoneId?: number) => {
    if (headerScopedZones.length === 0) {
      onNotify('Sin Zonas', 'Crea primero una zona o acopio para este cliente para registrar vuelos.');
      return;
    }
    setFlightForm({
      id: 'new',
      zoneId: defaultZoneId || headerScopedZones[0].id,
      flightCode: `VUE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      surveyDate: new Date().toISOString().slice(0, 10),
      notes: 'Levantamiento fotogramétrico ordinario',
      droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
      operator: 'Topógrafo Colegiado INGEODRON',
      fillVolumeM3: 0,
      cutVolumeM3: 0,
      groundResolutionCm: 1.8,
      status: 'active',
    });
    setShowFlightModal(true);
  };

  const openEditFlight = (s: Survey) => {
    setFlightForm({
      id: s.id.toString(),
      zoneId: s.zoneId,
      flightCode: s.flightCode,
      surveyDate: s.surveyDate,
      notes: s.notes || '',
      droneModel: s.droneModel || 'DJI Matrice 350 RTK / Zenmuse P1',
      operator: s.operator || 'Topógrafo Colegiado INGEODRON',
      fillVolumeM3: s.fillVolumeM3,
      cutVolumeM3: s.cutVolumeM3,
      groundResolutionCm: s.groundResolutionCm || 1.8,
      status: s.status || 'archived',
    });
    setShowFlightModal(true);
  };

  const handleSaveFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    const fill = Number(flightForm.fillVolumeM3) || 0;
    const cut = Number(flightForm.cutVolumeM3) || 0;
    const gsd = Number(flightForm.groundResolutionCm) || 1.8;

    if (flightForm.id === 'new') {
      localDataStore.createSurvey({
        zoneId: Number(flightForm.zoneId),
        flightCode: flightForm.flightCode.trim(),
        surveyDate: flightForm.surveyDate.trim(),
        notes: flightForm.notes.trim(),
        droneModel: flightForm.droneModel.trim(),
        operator: flightForm.operator.trim(),
        fillVolumeM3: fill,
        cutVolumeM3: cut,
        groundResolutionCm: gsd,
        status: flightForm.status,
      });
      onNotify('Vuelo Creado', `Vuelo ${flightForm.flightCode.trim()} registrado correctamente.`);
    } else {
      const fId = parseInt(flightForm.id, 10);
      const childCount = stockpiles.filter((st) => st.surveyId === fId).length;
      localDataStore.updateSurvey(fId, {
        zoneId: Number(flightForm.zoneId),
        flightCode: flightForm.flightCode.trim(),
        surveyDate: flightForm.surveyDate.trim(),
        notes: flightForm.notes.trim(),
        droneModel: flightForm.droneModel.trim(),
        operator: flightForm.operator.trim(),
        ...(childCount <= 1 ? { fillVolumeM3: fill, cutVolumeM3: cut } : {}),
        groundResolutionCm: gsd,
        status: flightForm.status,
      });
      onNotify('Vuelo Actualizado', `Cambios guardados en el vuelo ${flightForm.flightCode.trim()}.`);
    }

    setShowFlightModal(false);
    await onRefreshData();
  };

  const handleDeleteFlight = (s: Survey) => {
    const childCount = stockpiles.filter((st) => st.surveyId === s.id).length;
    setConfirmDialog({
      open: true,
      title: 'Eliminar Vuelo',
      message: `¿Borrar por completo el vuelo "${s.flightCode}" (${formatDateEu(s.surveyDate)})?`,
      details: childCount > 0 ? [`Se eliminarán sus ${childCount} acopio(s) vinculados.`] : undefined,
      confirmLabel: 'Eliminar Vuelo',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        await cleanupServerDeliverables((d) => d.surveyId === s.id);
        localDataStore.deleteSurvey(s.id);
        onNotify('Vuelo Eliminado', `El vuelo ${s.flightCode} y sus acopios han sido eliminados.`);
        await onRefreshData();
      },
    });
  };

  // --- STOCKPILE (ACOPIO) HANDLERS ---
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
      setStockpileForm((prev) => ({
        ...prev,
        photoFileName: buildRenamedStockpilePhotoFileName(prev.name, prev.code, file.name),
      }));
    } catch (err: any) {
      onNotify('Imagen no válida', err.message || 'Selecciona una imagen JPG, PNG o WebP válida.');
    }
  };

  const handleQuickUploadStockpilePhoto = async (st: Stockpile, file: File | null | undefined) => {
    if (!file) return;
    try {
      setUploadingStockpilePhotoId(st.id);
      const ctx = resolveStockpileUploadContext(st.surveyId);
      const uploaded = await uploadStockpilePhoto({
        stockpileId: st.id,
        file,
        stockpileName: st.name,
        stockpileCode: st.code,
        ...ctx,
      });
      localDataStore.updateStockpile(st.id, {
        photoUrl: uploaded.photoUrl,
        photoFileName: uploaded.photoFileName,
      });
      await onRefreshData();
      onNotify('Fotografía Guardada', `Foto "${uploaded.photoFileName}" asociada al acopio ${st.name}.`);
    } catch (err: any) {
      onNotify('Error al Subir Foto', err.message || 'No se pudo subir la fotografía del acopio.');
    } finally {
      setUploadingStockpilePhotoId(null);
    }
  };

  const handleDownloadStockpilePhoto = async (
    st: Pick<Stockpile, 'id' | 'code' | 'name' | 'photoUrl' | 'photoFileName'>
  ) => {
    try {
      const fileName = await downloadStockpilePhoto(st);
      onNotify('Foto Descargada', `Fotografía "${fileName}" descargada correctamente.`);
    } catch (err: any) {
      onNotify('Error al Descargar Foto', err.message || 'No se pudo descargar la fotografía del acopio.');
    }
  };

  const openCreateStockpile = (defaultSurveyId?: number) => {
    const selectableSurveys = headerScopedSurveys.length > 0 ? headerScopedSurveys : quarryScopedSurveys;
    if (selectableSurveys.length === 0) {
      onNotify('Sin Vuelos', 'Crea primero un vuelo para este cliente para registrar acopios.');
      return;
    }
    const targetSurveyId = defaultSurveyId || selectableSurveys[0].id;
    clearPendingStockpilePhoto();
    setStockpileForm({
      id: 'new',
      surveyId: targetSurveyId,
      name: '',
      code: `ACO-${targetSurveyId}-${Math.floor(10 + Math.random() * 90)}`,
      stockpileType: 'stockpile',
      material: 'Grava caliza 12/20',
      densityTonM3: 1.68,
      baseElevationM: 115.0,
      areaM2: 2420,
      fillVolumeM3: 15000,
      cutVolumeM3: 0,
      notes: '',
      photoUrl: '',
      photoFileName: '',
    });
    setShowStockpileModal(true);
  };

  const openEditStockpile = (st: Stockpile) => {
    clearPendingStockpilePhoto();
    const fallbackArea = Math.max(
      25,
      Math.round(Math.max(Math.abs(st.fillVolumeM3 || 0), Math.abs(st.cutVolumeM3 || 0)) / 6.2)
    );
    setStockpileForm({
      id: st.id.toString(),
      surveyId: st.surveyId,
      name: st.name,
      code: st.code,
      stockpileType: st.stockpileType || 'stockpile',
      material: st.material,
      densityTonM3: st.densityTonM3 || 1.68,
      baseElevationM: st.baseElevationM ?? 115.0,
      areaM2: st.areaM2 ?? fallbackArea,
      fillVolumeM3: st.fillVolumeM3,
      cutVolumeM3: st.cutVolumeM3,
      notes: st.notes || '',
      photoUrl: st.photoUrl || '',
      photoFileName: st.photoFileName || '',
    });
    setShowStockpileModal(true);
  };

  const handleSaveStockpile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const density = Math.max(0.1, Number(stockpileForm.densityTonM3) || 1.68);
      const baseElev = Number(stockpileForm.baseElevationM) || 0;
      const areaM2 = Math.max(0, Math.round(Number(stockpileForm.areaM2) || 0));
      const fill = Number(stockpileForm.fillVolumeM3) || 0;
      const cut = Number(stockpileForm.cutVolumeM3) || 0;

      if (stockpileForm.id === 'new') {
        const targetSurveyId = Number(stockpileForm.surveyId);
        const created = localDataStore.createStockpile({
          surveyId: targetSurveyId,
          name: stockpileForm.name.trim(),
          code: stockpileForm.code.trim() || `ACO-${targetSurveyId}-${Math.floor(10 + Math.random() * 90)}`,
          stockpileType: stockpileForm.stockpileType,
          material: stockpileForm.material.trim(),
          densityTonM3: density,
          baseElevationM: baseElev,
          areaM2,
          fillVolumeM3: fill,
          cutVolumeM3: cut,
          notes: stockpileForm.notes.trim(),
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
        onNotify('Acopio Registrado', `Acopio "${stockpileForm.name.trim()}" añadido al vuelo.`);
      } else {
        const stId = parseInt(stockpileForm.id, 10);
        const targetSurveyId = Number(stockpileForm.surveyId);
        const prevStockpile = stockpiles.find((s) => s.id === stId);
        let nextPhotoUrl: string | undefined = stockpileForm.photoUrl || undefined;
        let nextPhotoFileName: string | undefined = stockpileForm.photoFileName || undefined;

        if (pendingStockpilePhotoFile) {
          const ctx = resolveStockpileUploadContext(targetSurveyId);
          const uploaded = await uploadStockpilePhoto({
            stockpileId: stId,
            file: pendingStockpilePhotoFile,
            stockpileName: stockpileForm.name.trim(),
            stockpileCode: stockpileForm.code.trim(),
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
          name: stockpileForm.name.trim(),
          code: stockpileForm.code.trim(),
          stockpileType: stockpileForm.stockpileType,
          material: stockpileForm.material.trim(),
          densityTonM3: density,
          baseElevationM: baseElev,
          areaM2,
          fillVolumeM3: fill,
          cutVolumeM3: cut,
          notes: stockpileForm.notes.trim(),
          photoUrl: nextPhotoUrl,
          photoFileName: nextPhotoFileName,
        });
        onNotify('Acopio Actualizado', `Cubicación de "${stockpileForm.name.trim()}" guardada y totales del vuelo recalculados.`);
      }

      clearPendingStockpilePhoto();
      setShowStockpileModal(false);
      await onRefreshData();
    } catch (err: any) {
      onNotify('Error en Acopio', err.message || 'No se pudo guardar el acopio.');
    }
  };

  const handleDeleteStockpile = (st: Stockpile) => {
    setConfirmDialog({
      open: true,
      title: 'Eliminar Acopio',
      message: `¿Seguro que deseas eliminar el acopio "${st.name}" (${st.code})?`,
      confirmLabel: 'Eliminar Acopio',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          localDataStore.deleteStockpile(st.id);
          await deleteStockpilePhotoServer(st.id);
          onNotify('Acopio Eliminado', `El acopio "${st.name}" ha sido eliminado y el vuelo actualizado.`);
          await onRefreshData();
        } catch (err: any) {
          onNotify('Operación No Permitida', err.message || 'Cada vuelo debe conservar al menos un acopio.');
        }
      },
    });
  };

  return (
    <section className="space-y-6">
      <div className="glass-panel p-3.5 sm:p-5 rounded-xl border border-gray-800 space-y-5">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-800 pb-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500 shrink-0" /> Administración de Clientes, Usuarios y Explotaciones
            </h2>
            <p className="text-xs text-gray-400">
              Crea, edita o desactiva empresas concesionarias, credenciales de acceso de clientes y canteras asignadas.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {effectiveHeaderClient ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                  {effectiveHeaderClient.logoUrl ? (
                    <img
                      src={effectiveHeaderClient.logoUrl}
                      alt={effectiveHeaderClient.name}
                      className="w-4 h-4 rounded object-contain bg-white/95 p-0.5 shrink-0"
                    />
                  ) : (
                    <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span>
                    Cliente: <strong className="text-white">{effectiveHeaderClient.name}</strong> ({effectiveHeaderClient.cif})
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-200">
                  <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>
                    Cliente: <strong className="text-white">Todos ({clients.length})</strong>
                  </span>
                </div>
              )}

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-200">
                <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>
                  Explotación:{' '}
                  <strong className="text-white">
                    {activeHeaderQuarry
                      ? activeHeaderQuarry.name
                      : `Todas (${headerScopedQuarries.length})`}
                  </strong>
                </span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200">
                <Plane className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  Vuelos:{' '}
                  <strong className="text-white">
                    {headerScopedSurveys.length === 0
                      ? 'Sin vuelos'
                      : isAllHeaderFlights
                        ? `Todos (${headerScopedSurveys.length})`
                        : headerScopedSurveys.length === 1
                          ? `${headerScopedSurveys[0].flightCode} (${formatDateEu(headerScopedSurveys[0].surveyDate)})`
                          : `${headerScopedSurveys.length} seleccionados`}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full xl:w-auto">
            <button
              type="button"
              onClick={openCreateClient}
              className="px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" /> Nuevo Cliente
            </button>
            <button
              type="button"
              onClick={openCreateUser}
              className="px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" /> Nuevo Usuario
            </button>
            <button
              type="button"
              onClick={() => openCreateQuarry()}
              className="px-2.5 sm:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-amber-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" /> Nueva Explotación
            </button>
            <button
              type="button"
              onClick={() => openCreateZone()}
              className="px-2.5 sm:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Boxes className="w-3.5 h-3.5 shrink-0" /> Nueva Zona
            </button>
            <button
              type="button"
              onClick={() => openCreateFlight()}
              className="px-2.5 sm:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sky-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Plane className="w-3.5 h-3.5 shrink-0" /> Nuevo Vuelo
            </button>
            <button
              type="button"
              onClick={() => openCreateStockpile()}
              className="px-2.5 sm:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-gray-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Package className="w-3.5 h-3.5 shrink-0" /> Nuevo Acopio
            </button>
            <button
              type="button"
              onClick={() => {
                setCsvImportMode(subTab === 'stockpiles' ? 'stockpiles' : 'flights');
                setShowCsvImportModal(true);
              }}
              className="px-2.5 sm:px-3 py-1.5 bg-emerald-700/90 hover:bg-emerald-600 text-white border border-emerald-500/40 text-xs font-semibold rounded-lg shadow flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> Importar / Modelo CSV
            </button>
          </div>
        </div>

        {/* Subtabs & Search bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#0b0f17] p-1 rounded-xl border border-gray-800 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setSubTab('clients')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${subTab === 'clients' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Clientes ({headerScopedClients.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${subTab === 'users' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              <KeyRound className="w-3.5 h-3.5" /> Usuarios ({headerScopedUsers.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('quarries')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${subTab === 'quarries' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              <Layers className="w-3.5 h-3.5" /> Explotaciones ({headerScopedQuarries.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('zones')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${subTab === 'zones' ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              <Boxes className="w-3.5 h-3.5" /> Zonas ({headerScopedZones.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('flights')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${subTab === 'flights' ? 'bg-sky-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              <Plane className="w-3.5 h-3.5" /> Vuelos ({quarryScopedSurveys.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('stockpiles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${subTab === 'stockpiles' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              <Package className="w-3.5 h-3.5" /> Acopios ({headerScopedStockpiles.length})
            </button>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, CIF o email..."
              className="w-full bg-[#0b0f17] border border-gray-700 focus:border-blue-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
            />
          </div>
        </div>

        {/* SUBTAB 1: CLIENTS */}
        {subTab === 'clients' && (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[820px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                  <SortableTh label="Código" sortKey="code" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} className="p-3" />
                  <SortableTh label="Razón Social" sortKey="name" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} className="p-3" />
                  <SortableTh label="NIF / CIF" sortKey="cif" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} className="p-3" />
                  <SortableTh label="Responsable / Contacto" sortKey="contactName" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} className="p-3" />
                  <SortableTh label="Email & Teléfono" sortKey="contactEmail" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} className="p-3" />
                  <SortableTh label="Explotaciones" sortKey="quarriesCount" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} align="center" className="p-3" />
                  <SortableTh label="Usuarios" sortKey="usersCount" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} align="center" className="p-3" />
                  <SortableTh label="Visor 3D" sortKey="viewer3dEnabled" sortState={tableSorts.clients} onSort={(k) => handleTableSort('clients', k)} align="center" className="p-3" />
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sortedClients.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-400">
                      No se encontraron clientes con ese criterio.
                    </td>
                  </tr>
                ) : (
                  sortedClients.map((c) => {
                    const clientQuarries = quarries.filter((item) => item.clientId === c.id);
                    const clientUsers = users.filter((u) => u.clientId === c.id);
                    const linuxFolder = buildClientFolderName(c.code, c.name, c.id);
                    return (
                      <tr key={c.id} className="hover:bg-gray-800/40 transition">
                        <td className="p-3 whitespace-nowrap">
                          <span className="code-font text-[11px] font-semibold text-cyan-400">
                            {c.code || `C${100 + c.id}`}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <label
                              className="w-10 h-10 rounded-xl bg-[#0b0f17] border border-gray-700 hover:border-blue-500 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer relative group transition"
                              title="Haz clic para subir o cambiar el logo de este cliente"
                            >
                              {c.logoUrl ? (
                                <img
                                  src={c.logoUrl}
                                  alt={`Logo de ${c.name}`}
                                  className="w-full h-full object-contain p-0.5 bg-white/95"
                                />
                              ) : (
                                <Building2 className="w-4 h-4 text-blue-400" />
                              )}
                              <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Upload className="w-3.5 h-3.5 text-white" />
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  handleClientLogoUpload(file, c);
                                }}
                              />
                            </label>
                            <div className="min-w-0">
                              <div className="font-semibold text-white">{c.name}</div>
                              <div
                                className="text-[10px] font-mono text-emerald-400/90 truncate max-w-[230px]"
                                title={`Carpeta en servidor: storage/${linuxFolder}`}
                              >
                                📁 storage/{linuxFolder}
                              </div>
                              {c.notes && (
                                <div className="text-[11px] text-gray-500 truncate max-w-[210px]" title={c.notes}>
                                  {c.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">{c.cif}</td>
                        <td className="p-3 text-gray-200">{c.contactName}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 text-blue-400">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span>{c.contactEmail}</span>
                          </div>
                          {c.phone && (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{c.phone}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[240px] mx-auto">
                            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono text-[11px] font-bold">
                              {clientQuarries.length}
                            </span>
                            {clientQuarries.map((cq) => (
                              <button
                                key={cq.id}
                                type="button"
                                onClick={() => openEditQuarry(cq)}
                                title={`Explotación exclusiva de ${c.name} (clic para editar)`}
                                className="px-2 py-0.5 rounded bg-[#0b0f17] hover:bg-gray-800 text-gray-300 border border-gray-700 text-[10px] truncate max-w-[145px] transition cursor-pointer"
                              >
                                {cq.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => openCreateQuarry(c.id)}
                              title={`Añadir nueva explotación a ${c.name}`}
                              className="px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold inline-flex items-center gap-0.5 transition cursor-pointer"
                            >
                              <Plus className="w-2.5 h-2.5" /> Añadir
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-[11px]">
                            {clientUsers.length}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleClientViewer3d(c)}
                            title={
                              c.viewer3dEnabled
                                ? 'Visor 3D y Planos 2D activados para este cliente (clic para desactivar)'
                                : 'Visor 3D desactivado para este cliente (clic para activar)'
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 transition cursor-pointer ${c.viewer3dEnabled
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                              : 'bg-gray-800/80 text-gray-400 border-gray-700 hover:text-white'
                              }`}
                          >
                            <Box className="w-3.5 h-3.5" />
                            <span>{c.viewer3dEnabled ? 'Activado' : 'Inactivo'}</span>
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditClient(c)}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 rounded text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(c)}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs transition cursor-pointer"
                              title="Eliminar Cliente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBTAB 2: PORTAL USERS */}
        {subTab === 'users' && (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[700px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                  <SortableTh label="Nombre / Usuario" sortKey="displayName" sortState={tableSorts.users} onSort={(k) => handleTableSort('users', k)} className="p-3" />
                  <SortableTh label="Email de Acceso" sortKey="email" sortState={tableSorts.users} onSort={(k) => handleTableSort('users', k)} className="p-3" />
                  <SortableTh label="Contraseña" sortKey="password" sortState={tableSorts.users} onSort={(k) => handleTableSort('users', k)} className="p-3" />
                  <SortableTh label="Rol" sortKey="role" sortState={tableSorts.users} onSort={(k) => handleTableSort('users', k)} className="p-3" />
                  <SortableTh label="Empresa Asignada" sortKey="company" sortState={tableSorts.users} onSort={(k) => handleTableSort('users', k)} className="p-3" />
                  <SortableTh label="Estado" sortKey="active" sortState={tableSorts.users} onSort={(k) => handleTableSort('users', k)} align="center" className="p-3" />
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      No hay usuarios que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map((u) => {
                    const linkedClient = u.clientId ? clients.find((c) => c.id === u.clientId) : null;
                    const isActive = u.active !== false;
                    return (
                      <tr key={u.id} className="hover:bg-gray-800/40 transition">
                        <td className="p-3">
                          <div className="font-semibold text-white">{u.displayName || u.username}</div>
                          <div className="code-font text-[10px] text-gray-400">@{u.username || u.email.split('@')[0]}</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">{u.email}</td>
                        <td className="p-3 font-mono text-gray-400">{u.password ? '••••••••' : '—'}</td>
                        <td className="p-3">
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                              <ShieldCheck className="w-3 h-3" /> Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[11px] font-semibold">
                              <Building2 className="w-3 h-3" /> Cliente
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-300">
                          {u.role === 'admin' ? (
                            <span className="text-gray-400">Todas las explotaciones</span>
                          ) : linkedClient ? (
                            <div className="flex items-center gap-2">
                              {linkedClient.logoUrl ? (
                                <img
                                  src={linkedClient.logoUrl}
                                  alt={linkedClient.name}
                                  className="w-5 h-5 rounded object-contain bg-white/95 p-0.5 shrink-0"
                                />
                              ) : (
                                <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                              )}
                              <span className="truncate max-w-[180px]">{linkedClient.name}</span>
                            </div>
                          ) : (
                            <span className="text-amber-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                              }`}
                          >
                            {isActive ? 'Activo' : 'Suspendido'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 rounded text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs transition cursor-pointer"
                              title="Eliminar Usuario"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBTAB 3: QUARRIES */}
        {subTab === 'quarries' && (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[760px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                  <SortableTh label="Código" sortKey="code" sortState={tableSorts.quarries} onSort={(k) => handleTableSort('quarries', k)} className="p-3" />
                  <SortableTh label="Explotación" sortKey="name" sortState={tableSorts.quarries} onSort={(k) => handleTableSort('quarries', k)} className="p-3" />
                  <SortableTh label="Cliente Propietario Único" sortKey="clientName" sortState={tableSorts.quarries} onSort={(k) => handleTableSort('quarries', k)} className="p-3" />
                  <SortableTh label="Ubicación" sortKey="location" sortState={tableSorts.quarries} onSort={(k) => handleTableSort('quarries', k)} className="p-3" />
                  <SortableTh label="Zonas" sortKey="zonesCount" sortState={tableSorts.quarries} onSort={(k) => handleTableSort('quarries', k)} align="center" className="p-3" />
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sortedQuarries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      No hay explotaciones registradas para este cliente o criterio de búsqueda.
                    </td>
                  </tr>
                ) : (
                  sortedQuarries.map((item) => {
                    const client = clients.find((c) => c.id === item.clientId);
                    const qZones = zones.filter((z) => z.quarryId === item.id);
                    return (
                      <tr key={item.id} className="hover:bg-gray-800/40 transition">
                        <td className="p-3 whitespace-nowrap">
                          <span className="code-font text-[11px] font-semibold text-cyan-400">
                            {item.code}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-white">
                          {item.name}
                        </td>
                        <td className="p-3 text-gray-300">{client?.name || 'Sin cliente'}</td>
                        <td className="p-3 text-gray-400">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-blue-400" />
                            {item.location}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[11px] font-mono">
                            {qZones.length}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectQuarry(item)}
                              className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 rounded text-xs font-medium transition cursor-pointer"
                            >
                              Abrir
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditQuarry(item)}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 rounded text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuarry(item)}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs transition cursor-pointer"
                              title="Eliminar Explotación"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBTAB 4: ZONES */}
        {subTab === 'zones' && (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[740px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                  <SortableTh label="Código" sortKey="code" sortState={tableSorts.zones} onSort={(k) => handleTableSort('zones', k)} className="p-3" />
                  <SortableTh label="Zona" sortKey="name" sortState={tableSorts.zones} onSort={(k) => handleTableSort('zones', k)} className="p-3" />
                  <SortableTh label="Explotación / Cliente" sortKey="quarryName" sortState={tableSorts.zones} onSort={(k) => handleTableSort('zones', k)} className="p-3" />
                  <SortableTh label="Vuelos" sortKey="surveysCount" sortState={tableSorts.zones} onSort={(k) => handleTableSort('zones', k)} align="center" className="p-3" />
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sortedZones.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-gray-400">
                      No hay zonas que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  sortedZones.map((z) => {
                    const linkedQuarry = quarries.find((item) => item.id === z.quarryId);
                    const linkedClient = linkedQuarry
                      ? clients.find((c) => c.id === linkedQuarry.clientId)
                      : null;
                    const zSurveysCount = surveys.filter((s) => s.zoneId === z.id).length;
                    return (
                      <tr key={z.id} className="hover:bg-gray-800/40 transition">
                        <td className="p-3 whitespace-nowrap">
                          <span className="code-font text-[11px] font-semibold text-cyan-400">
                            {z.code}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-white">
                          {z.name}
                        </td>
                        <td className="p-3">
                          <div className="text-gray-200 font-medium">
                            {linkedQuarry?.name || `Explotación #${z.quarryId}`}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {linkedClient?.name || 'Sin cliente'}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[11px] font-mono">
                            {zSurveysCount}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditZone(z)}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-gray-700 rounded text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(z)}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs transition cursor-pointer"
                              title="Eliminar Zona"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBTAB 5: FLIGHTS */}
        {subTab === 'flights' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b0f17]/70 border border-gray-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-gray-400">
                Carga masiva de vuelos por CSV{effectiveHeaderClient ? ` para ${effectiveHeaderClient.name}` : ''}.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const tplClient = effectiveHeaderClient || clients[0] || null;
                    const tplZones = effectiveHeaderClient || activeHeaderQuarry ? headerScopedZones : zones;
                    downloadFlightsCsvTemplate({ client: tplClient, zones: tplZones });
                    onNotify('Modelo CSV Vuelos Descargado', 'Plantilla CSV lista para completar e importar.');
                  }}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-sky-300 border border-gray-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Modelo CSV Vuelos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvImportMode('flights');
                    setShowCsvImportModal(true);
                  }}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Importar Vuelos CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[820px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                    <SortableTh label="Código" sortKey="flightCode" sortState={tableSorts.flights} onSort={(k) => handleTableSort('flights', k)} className="p-3" />
                    <SortableTh label="Misión" sortKey="mission" sortState={tableSorts.flights} onSort={(k) => handleTableSort('flights', k)} className="p-3" />
                    <SortableTh label="Fecha" sortKey="surveyDate" sortState={tableSorts.flights} onSort={(k) => handleTableSort('flights', k)} className="p-3" />
                    <SortableTh label="Zona / Explotación" sortKey="zoneName" sortState={tableSorts.flights} onSort={(k) => handleTableSort('flights', k)} className="p-3" />
                    <SortableTh label="Acopios" sortKey="stockpilesCount" sortState={tableSorts.flights} onSort={(k) => handleTableSort('flights', k)} align="center" className="p-3" />
                    <SortableTh label="Estado" sortKey="status" sortState={tableSorts.flights} onSort={(k) => handleTableSort('flights', k)} align="center" className="p-3" />
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {sortedFlights.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-400">
                        No hay vuelos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    sortedFlights.map((s) => {
                      const linkedZone = zones.find((z) => z.id === s.zoneId);
                      const linkedQuarry = linkedZone
                        ? quarries.find((item) => item.id === linkedZone.quarryId)
                        : null;
                      const childStockpiles = stockpiles.filter((st) => st.surveyId === s.id);
                      const st = s.status || 'archived';
                      return (
                        <tr key={s.id} className="hover:bg-gray-800/40 transition">
                          <td className="p-3 whitespace-nowrap">
                            <span className="code-font text-[11px] font-semibold text-sky-300">
                              {s.flightCode}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-white max-w-[230px] truncate" title={s.notes || `Misión ${s.flightCode}`}>
                              {s.notes || `Misión ${s.flightCode}`}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {s.droneModel}
                            </div>
                          </td>
                          <td className="p-3 text-gray-300 font-mono">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-sky-400" />
                              {formatDateEu(s.surveyDate)}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="text-cyan-300 font-medium">
                              {linkedZone?.name || `Zona #${s.zoneId}`}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {linkedQuarry?.name || ''}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono text-[11px] font-bold">
                                {childStockpiles.length} acopio{childStockpiles.length === 1 ? '' : 's'}
                              </span>
                              <button
                                type="button"
                                onClick={() => openCreateStockpile(s.id)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                              >
                                + Añadir acopio
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${st === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : st === 'pending'
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                  : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                }`}
                            >
                              {st === 'active' ? 'Activo' : st === 'pending' ? 'Pendiente' : 'Archivado'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditFlight(s)}
                                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-sky-300 border border-gray-700 rounded text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFlight(s)}
                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs transition cursor-pointer"
                                title="Eliminar Vuelo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        )}

        {/* SUBTAB 6: STOCKPILES (ACOPIOS) */}
        {subTab === 'stockpiles' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b0f17]/70 border border-gray-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-gray-400">
                Carga masiva de acopios y cubicaciones por CSV{effectiveHeaderClient ? ` para ${effectiveHeaderClient.name}` : ''}.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const tplClient = effectiveHeaderClient || clients[0] || null;
                    const tplSurveys = headerScopedSurveys.length > 0 ? headerScopedSurveys : surveys;
                    downloadStockpilesCsvTemplate({ client: tplClient, surveys: tplSurveys });
                    onNotify('Modelo CSV Acopios Descargado', 'Plantilla CSV lista para completar e importar.');
                  }}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-gray-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Modelo CSV Acopios
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvImportMode('stockpiles');
                    setShowCsvImportModal(true);
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Importar Acopios CSV
                </button>
              </div>
            </div>
            {/* Resumen sincronizado con selector de vuelos en cabecera */}
            <div className="bg-[#0b0f17]/70 border border-gray-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-gray-400 flex items-center gap-1.5 text-[11px]">
                <Plane className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Mostrando acopios de la selección en cabecera:{' '}
                <strong className="text-white">
                  {headerScopedSurveys.length === 0
                    ? 'Sin vuelos seleccionados'
                    : isAllHeaderFlights
                      ? `Todos los vuelos (${headerScopedSurveys.length})`
                      : headerScopedSurveys.length === 1
                        ? `${headerScopedSurveys[0].flightCode} (${formatDateEu(headerScopedSurveys[0].surveyDate)})`
                        : `${headerScopedSurveys.length} vuelos seleccionados`}
                </strong>
              </span>
              <span className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                {sortedStockpiles.length} acopio{sortedStockpiles.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[920px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold text-[10px]">
                    <SortableTh label="Código" sortKey="code" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} className="p-3" />
                    <SortableTh label="Acopio" sortKey="name" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} className="p-3" />
                    <SortableTh label="Vuelo Vinculado" sortKey="flight" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} className="p-3" />
                    <SortableTh label="Zona / Explotación" sortKey="zone" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} className="p-3" />
                    <SortableTh label="Material" sortKey="material" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} className="p-3" />
                    <SortableTh label="Densidad" sortKey="density" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} align="right" className="p-3 text-amber-300" />
                    <SortableTh label="Relleno" sortKey="fill" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} align="right" className="p-3 text-emerald-400" />
                    <SortableTh label="Desmonte" sortKey="cut" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} align="right" className="p-3 text-red-400" />
                    <SortableTh label="Neto / Tonelaje" sortKey="net" sortState={tableSorts.stockpiles} onSort={(k) => handleTableSort('stockpiles', k)} align="right" className="p-3" />
                    <th className="p-3 text-center">Foto</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {sortedStockpiles.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-gray-400">
                        No hay acopios que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    sortedStockpiles.map((st) => {
                      const linkedSurvey = surveys.find((s) => s.id === st.surveyId);
                      const linkedZone = linkedSurvey ? zones.find((z) => z.id === linkedSurvey.zoneId) : null;
                      const linkedQuarry = linkedZone ? quarries.find((item) => item.id === linkedZone.quarryId) : null;
                      return (
                        <tr key={st.id} className="hover:bg-gray-800/40 transition">
                          <td className="p-3">
                            <span className="code-font text-[11px] font-semibold text-indigo-300 whitespace-nowrap">
                              {st.code}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-white">{st.name}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-mono text-sky-300 font-semibold">
                              {linkedSurvey?.flightCode || `Vuelo #${st.surveyId}`}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {linkedSurvey?.surveyDate ? formatDateEu(linkedSurvey.surveyDate) : ''}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="text-cyan-300 font-medium">{linkedZone?.name || 'Zona'}</div>
                            <div className="text-[10px] text-gray-400">{linkedQuarry?.name || ''}</div>
                          </td>
                          <td className="p-3">
                            <div className="text-blue-400">{st.material}</div>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="font-mono text-[11px] font-semibold text-amber-400">
                              {formatEsNumber(st.densityTonM3 || 1.68, 2)} t/m³
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                            +{formatEsNumber(st.fillVolumeM3)} m³
                          </td>
                          <td className="p-3 text-right font-mono text-[11px] text-red-400 whitespace-nowrap">
                            -{formatEsNumber(st.cutVolumeM3)} m³
                          </td>
                          <td className="p-3 text-right font-mono whitespace-nowrap">
                            <div className="text-blue-400 font-bold">{formatEsNumber(st.netVolumeM3)} m³</div>
                            <div className="text-[10px] text-cyan-300">{formatEsNumber(st.tonnageEst)} t</div>
                            <div className="text-[10px] text-purple-300">
                              {formatEsNumber(st.areaM2 ?? Math.round(Math.max(Math.abs(st.fillVolumeM3), Math.abs(st.cutVolumeM3)) / 6.2))} m²
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex items-center justify-center gap-1.5">
                              {st.photoUrl && (
                                <>
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
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadStockpilePhoto(st)}
                                    className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                    title={`Descargar foto (${st.photoFileName || st.code})`}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <label
                                className={`px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                                  uploadingStockpilePhotoId === st.id ? 'opacity-60 pointer-events-none' : ''
                                }`}
                                title={st.photoUrl ? 'Sustituir fotografía del acopio' : 'Subir fotografía del acopio'}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>
                                  {uploadingStockpilePhotoId === st.id ? '...' : st.photoUrl ? '' : 'Subir'}
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
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditStockpile(st)}
                                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-gray-700 rounded text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStockpile(st)}
                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs transition cursor-pointer"
                                title="Eliminar Acopio"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        )}
      </div>

      {/* MODAL CREATE / EDIT CLIENT */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-lg p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                {clientForm.id === 'new' ? 'Nuevo Cliente Concesionario' : 'Editar Datos del Cliente'}
              </h3>
              <button
                type="button"
                onClick={() => setShowClientModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="space-y-3 text-xs">
              {/* Client Logo Upload & Preview */}
              <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#111827] border border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                    {clientForm.logoUrl ? (
                      <img
                        src={clientForm.logoUrl}
                        alt="Vista previa logo"
                        className="w-full h-full object-contain p-1 bg-white/95"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white text-xs">Logo / Icono del Cliente</div>
                    <p className="text-[11px] text-gray-400">
                      PNG, JPG, WebP o SVG. Se mostrará en la cabecera, login y listado.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{clientForm.logoUrl ? 'Cambiar' : 'Subir Logo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        handleClientLogoUpload(file);
                      }}
                    />
                  </label>
                  {clientForm.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setClientForm({ ...clientForm, logoUrl: '' })}
                      className="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[11px] font-medium transition cursor-pointer"
                      title="Quitar logo y usar icono por defecto"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Código de Cliente:</label>
                  <input
                    type="text"
                    required
                    value={clientForm.code}
                    onChange={(e) => setClientForm({ ...clientForm, code: e.target.value })}
                    placeholder="Ej. C110"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-cyan-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Razón Social / Empresa:</label>
                  <input
                    type="text"
                    required
                    value={clientForm.name}
                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                    placeholder="Ej. Hormigones y Gravas Madrid"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="sm:col-span-2 bg-[#0b0f17]/75 border border-emerald-500/30 rounded-lg px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gray-400">Carpeta Linux en servidor:</span>
                  <span className="font-mono text-emerald-400 font-semibold break-all">
                    storage/{buildClientFolderName(clientForm.code, clientForm.name)}
                  </span>
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">NIF / CIF:</label>
                  <input
                    type="text"
                    required
                    value={clientForm.cif}
                    onChange={(e) => setClientForm({ ...clientForm, cif: e.target.value })}
                    placeholder="B-45129384"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Teléfono:</label>
                  <input
                    type="text"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    placeholder="+34 912 345 678"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Persona de Contacto:</label>
                  <input
                    type="text"
                    required
                    value={clientForm.contactName}
                    onChange={(e) => setClientForm({ ...clientForm, contactName: e.target.value })}
                    placeholder="Nombre y cargo técnico"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Email de Contacto:</label>
                  <input
                    type="email"
                    required
                    value={clientForm.contactEmail}
                    onChange={(e) => setClientForm({ ...clientForm, contactEmail: e.target.value })}
                    placeholder="tecnico@empresa.es"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-gray-300 font-medium mb-1">Notas / Contrato:</label>
                  <textarea
                    rows={2}
                    value={clientForm.notes}
                    onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                    placeholder="Observaciones de campaña o periodicidad de vuelos..."
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="sm:col-span-2 bg-[#0b0f17]/80 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5" /> Acceso a Visor Fotogramétrico 3D y Planos 2D
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Permite que los usuarios de este cliente exploren el MDE 3D, perfiles topográficos y ortofoto georreferenciada.
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-white cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={clientForm.viewer3dEnabled}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, viewer3dEnabled: e.target.checked })
                      }
                      className="rounded border-gray-700 bg-[#111827] text-cyan-500 w-4 h-4"
                    />
                    <span>{clientForm.viewer3dEnabled ? 'Activado' : 'Desactivado'}</span>
                  </label>
                </div>
              </div>

              {clientForm.id === 'new' && (
                <div className="pt-2 border-t border-gray-800 space-y-2.5">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clientForm.createQuarryAndUser}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, createQuarryAndUser: e.target.checked })
                      }
                      className="rounded border-gray-700 bg-[#0b0f17] text-blue-600"
                    />
                    Crear también explotación inicial y clave de acceso al portal
                  </label>

                  {clientForm.createQuarryAndUser && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0b0f17]/70 p-3 rounded-xl border border-gray-800">
                      <div>
                        <label className="block text-gray-400 mb-1">Nombre Explotación (opcional):</label>
                        <input
                          type="text"
                          value={clientForm.quarryName}
                          onChange={(e) => setClientForm({ ...clientForm, quarryName: e.target.value })}
                          placeholder="Ej. Cantera San Rafael"
                          className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 mb-1">Contraseña Portal Cliente (opcional):</label>
                        <input
                          type="text"
                          value={clientForm.userPassword}
                          onChange={(e) => setClientForm({ ...clientForm, userPassword: e.target.value })}
                          placeholder="Ej. clave2026"
                          className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-white font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-gray-400 mb-1">Zonas iniciales (separadas por comas):</label>
                        <input
                          type="text"
                          value={clientForm.zonesList}
                          onChange={(e) => setClientForm({ ...clientForm, zonesList: e.target.value })}
                          className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowClientModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow cursor-pointer"
                >
                  {clientForm.id === 'new' ? 'Crear Cliente' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREATE / EDIT PORTAL USER */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-400" />
                {userForm.id === 'new' ? 'Nuevo Usuario de Acceso' : 'Editar Datos de Usuario'}
              </h3>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">Nombre Completo / Etiqueta:</label>
                <input
                  type="text"
                  required
                  value={userForm.displayName}
                  onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  placeholder="Ej. Elena Ramos — Gravas Madrid"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Usuario:</label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    placeholder="eramos"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Email de Login:</label>
                  <input
                    type="email"
                    required
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="usuario@empresa.es"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Contraseña de Acceso:</label>
                <div className="relative">
                  <input
                    type={showUserPass ? 'text' : 'password'}
                    required
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 pr-9 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPass((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                  >
                    {showUserPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Rol en el Portal:</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'admin' | 'client' })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                  >
                    <option value="client">Cliente (Explotación asignada)</option>
                    <option value="admin">Administrador Técnico</option>
                  </select>
                </div>

                {userForm.role === 'client' && (
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">Empresa / Cliente Asignado:</label>
                    <select
                      value={userForm.clientId}
                      onChange={(e) => setUserForm({ ...userForm, clientId: parseInt(e.target.value, 10) })}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-gray-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={userForm.active}
                  onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })}
                  className="rounded border-gray-700 bg-[#0b0f17] text-emerald-500"
                />
                Cuenta habilitada para iniciar sesión
              </label>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow cursor-pointer"
                >
                  {userForm.id === 'new' ? 'Crear Usuario' : 'Guardar Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREATE / EDIT QUARRY */}
      {showQuarryModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                {quarryForm.id === 'new' ? 'Nueva Explotación' : 'Editar Explotación'}
              </h3>
              <button
                type="button"
                onClick={() => setShowQuarryModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuarry} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">
                  Cliente Propietario Único (obligatorio):
                </label>
                <select
                  required
                  value={quarryForm.clientId}
                  onChange={(e) => setQuarryForm({ ...quarryForm, clientId: parseInt(e.target.value, 10) })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cif})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Cada explotación pertenece exclusivamente a un único cliente. Un mismo cliente puede tener varias explotaciones asignadas.
                </p>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Nombre de la Explotación:</label>
                <input
                  type="text"
                  required
                  value={quarryForm.name}
                  onChange={(e) => setQuarryForm({ ...quarryForm, name: e.target.value })}
                  placeholder="Ej. Cantera El Peñón"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Código:</label>
                <input
                  type="text"
                  required
                  value={quarryForm.code}
                  onChange={(e) => setQuarryForm({ ...quarryForm, code: e.target.value })}
                  placeholder="CAN-01"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Ubicación:</label>
                <input
                  type="text"
                  required
                  value={quarryForm.location}
                  onChange={(e) => setQuarryForm({ ...quarryForm, location: e.target.value })}
                  placeholder="Municipio - Provincia"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuarryModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg shadow cursor-pointer"
                >
                  {quarryForm.id === 'new' ? 'Crear Explotación' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREATE / EDIT ZONE */}
      {showZoneModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Boxes className="w-5 h-5 text-cyan-400" />
                {zoneForm.id === 'new' ? 'Nueva Zona / Acopio' : 'Editar Zona / Acopio'}
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
              <div>
                <label className="block text-gray-300 font-medium mb-1">Explotación Asignada:</label>
                <select
                  required
                  value={zoneForm.quarryId}
                  onChange={(e) => setZoneForm({ ...zoneForm, quarryId: parseInt(e.target.value, 10) })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                >
                  {headerScopedQuarries.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Nombre de la Zona:</label>
                <input
                  type="text"
                  required
                  value={zoneForm.name}
                  onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                  placeholder="Ej. Pila Acopio Grava 12/20"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Código:</label>
                <input
                  type="text"
                  required
                  value={zoneForm.code}
                  onChange={(e) => setZoneForm({ ...zoneForm, code: e.target.value })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Estado:</label>
                <select
                  value={zoneForm.status}
                  onChange={(e) => setZoneForm({ ...zoneForm, status: e.target.value as Zone['status'] })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
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
                  {zoneForm.id === 'new' ? 'Crear Zona' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREATE / EDIT FLIGHT */}
      {showFlightModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-lg p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Plane className="w-5 h-5 text-sky-400" />
                {flightForm.id === 'new' ? 'Nuevo Vuelo Fotogramétrico' : 'Editar Datos del Vuelo'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFlightModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFlight} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">Zona / Acopio Vinculada:</label>
                <select
                  required
                  value={flightForm.zoneId}
                  onChange={(e) => setFlightForm({ ...flightForm, zoneId: parseInt(e.target.value, 10) })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                >
                  {headerScopedZones.map((z) => {
                    const qItem = quarries.find((item) => item.id === z.quarryId);
                    return (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code}){qItem ? ` — ${qItem.name}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Código de Vuelo:</label>
                  <input
                    type="text"
                    required
                    value={flightForm.flightCode}
                    onChange={(e) => setFlightForm({ ...flightForm, flightCode: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Fecha Levantamiento:</label>
                  <input
                    type="date"
                    required
                    value={flightForm.surveyDate}
                    onChange={(e) => setFlightForm({ ...flightForm, surveyDate: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Título / Notas de Misión:</label>
                <input
                  type="text"
                  required
                  value={flightForm.notes}
                  onChange={(e) => setFlightForm({ ...flightForm, notes: e.target.value })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Modelo de Dron / Sensor:</label>
                  <input
                    type="text"
                    required
                    value={flightForm.droneModel}
                    onChange={(e) => setFlightForm({ ...flightForm, droneModel: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Operador:</label>
                  <input
                    type="text"
                    required
                    value={flightForm.operator}
                    onChange={(e) => setFlightForm({ ...flightForm, operator: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              {flightForm.id !== 'new' && (() => {
                const editingFlightId = parseInt(flightForm.id, 10);
                const childCount = stockpiles.filter((st) => st.surveyId === editingFlightId).length;
                const isMultiStockpile = childCount > 1;
                return (
                  <>
                    {isMultiStockpile && (
                      <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-2 text-[11px] text-indigo-300">
                        Este vuelo agrupa <strong>{childCount} acopios</strong>. Edita cada acopio individualmente en la pestaña Acopios para modificar su cubicación.
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
                          value={flightForm.fillVolumeM3}
                          onChange={(e) =>
                            setFlightForm({ ...flightForm, fillVolumeM3: parseFloat(e.target.value) || 0 })
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
                          value={flightForm.cutVolumeM3}
                          onChange={(e) =>
                            setFlightForm({ ...flightForm, cutVolumeM3: parseFloat(e.target.value) || 0 })
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
                          value={flightForm.groundResolutionCm}
                          onChange={(e) =>
                            setFlightForm({ ...flightForm, groundResolutionCm: parseFloat(e.target.value) || 1.8 })
                          }
                          className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-blue-300 font-mono"
                        />
                      </div>
                    </div>
                  </>
                );
              })()}

              <div>
                <label className="block text-gray-300 font-medium mb-1">Estado del Vuelo:</label>
                <select
                  value={flightForm.status}
                  onChange={(e) => setFlightForm({ ...flightForm, status: e.target.value as SurveyStatus })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                >
                  <option value="active">Activo (Active)</option>
                  <option value="pending">Pendiente (Pending)</option>
                  <option value="archived">Archivado</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFlightModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow cursor-pointer"
                >
                  {flightForm.id === 'new' ? 'Crear Vuelo' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREATE / EDIT STOCKPILE (ACOPIO) */}
      {showStockpileModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel w-full max-w-md p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-400" />
                {stockpileForm.id === 'new' ? 'Nuevo Acopio en Vuelo' : 'Editar Acopio'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  clearPendingStockpilePhoto();
                  setShowStockpileModal(false);
                }}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockpile} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">Vuelo / Levantamiento Único:</label>
                <select
                  required
                  value={stockpileForm.surveyId}
                  onChange={(e) => setStockpileForm({ ...stockpileForm, surveyId: parseInt(e.target.value, 10) })}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white cursor-pointer"
                >
                  {(quarryScopedSurveys.length > 0 ? quarryScopedSurveys : headerScopedSurveys).map((s) => {
                    const zItem = zones.find((z) => z.id === s.zoneId);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.flightCode} ({formatDateEu(s.surveyDate)}){zItem ? ` — ${zItem.name}` : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Cada vuelo puede contener uno o varios acopios. El total del vuelo se recalcula automáticamente.
                </p>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Nombre del Acopio:</label>
                <input
                  type="text"
                  required
                  value={stockpileForm.name}
                  onChange={(e) => setStockpileForm({ ...stockpileForm, name: e.target.value })}
                  placeholder="Ej. Pila Grava 12/20 Sector Norte"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Código Acopio:</label>
                  <input
                    type="text"
                    required
                    value={stockpileForm.code}
                    onChange={(e) => setStockpileForm({ ...stockpileForm, code: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Material:</label>
                  <input
                    type="text"
                    required
                    value={stockpileForm.material}
                    onChange={(e) => setStockpileForm({ ...stockpileForm, material: e.target.value })}
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Densidad (t/m³):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="5.0"
                    required
                    value={stockpileForm.densityTonM3}
                    onChange={(e) =>
                      setStockpileForm({ ...stockpileForm, densityTonM3: parseFloat(e.target.value) || 1.68 })
                    }
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-amber-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Cota Base (m):</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={stockpileForm.baseElevationM}
                    onChange={(e) =>
                      setStockpileForm({ ...stockpileForm, baseElevationM: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-cyan-300 font-mono"
                  />
                </div>
              </div>

              <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3">
                <MaterialDensitySelector
                  density={stockpileForm.densityTonM3}
                  materialName={stockpileForm.material}
                  canUpdateMaterial={true}
                  onSelectDensity={(nextDensity, suggestedMaterial) =>
                    setStockpileForm((prev) => ({
                      ...prev,
                      densityTonM3: nextDensity,
                      ...(suggestedMaterial ? { material: suggestedMaterial } : {}),
                    }))
                  }
                  onChangeCustomMaterial={(customMaterial) =>
                    setStockpileForm((prev) => ({
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
                    required
                    value={stockpileForm.fillVolumeM3}
                    onChange={(e) =>
                      setStockpileForm({ ...stockpileForm, fillVolumeM3: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-emerald-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Desmonte (-m³):</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={stockpileForm.cutVolumeM3}
                    onChange={(e) =>
                      setStockpileForm({ ...stockpileForm, cutVolumeM3: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-red-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Superficie (m²):</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={stockpileForm.areaM2}
                    onChange={(e) =>
                      setStockpileForm({ ...stockpileForm, areaM2: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-purple-300 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Observaciones (opcional):</label>
                <input
                  type="text"
                  value={stockpileForm.notes}
                  onChange={(e) => setStockpileForm({ ...stockpileForm, notes: e.target.value })}
                  placeholder="Ej. Pila principal sector norte"
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              {/* Fotografía del Acopio */}
              {(() => {
                const previewSrc =
                  pendingStockpilePhotoPreview ||
                  (stockpileForm.photoUrl ? getAuthenticatedPhotoSrc(stockpileForm.photoUrl) : '');
                return (
                  <div className="bg-[#0b0f17]/80 border border-gray-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-[#111827] border border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
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
                          {stockpileForm.photoFileName
                            ? stockpileForm.photoFileName
                            : 'JPG, PNG o WebP. Descargable por el cliente.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {stockpileForm.photoUrl && !pendingStockpilePhotoFile && stockpileForm.id !== 'new' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadStockpilePhoto({
                              id: parseInt(stockpileForm.id, 10),
                              code: stockpileForm.code,
                              name: stockpileForm.name,
                              photoUrl: stockpileForm.photoUrl,
                              photoFileName: stockpileForm.photoFileName,
                            })
                          }
                          className="px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                          title="Descargar fotografía"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <label className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{previewSrc ? 'Cambiar' : 'Subir Foto'}</span>
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
                            setStockpileForm((prev) => ({
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
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const netM3 = (stockpileForm.fillVolumeM3 || 0) - (stockpileForm.cutVolumeM3 || 0);
                const tons = Math.round(Math.abs(netM3) * (stockpileForm.densityTonM3 || 1.68) * 10) / 10;
                return (
                  <div className="bg-indigo-950/30 border border-indigo-800/60 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-indigo-300 font-semibold block">
                        Balance Acopio ({formatEsNumber(stockpileForm.densityTonM3 || 1.68, 2)} t/m³)
                      </span>
                      <span className="font-mono text-xs text-white">
                        Neto: {formatEsNumber(netM3)} m³
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-cyan-300">
                      {formatEsNumber(tons, 1)} t
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
                  {stockpileForm.id === 'new' ? 'Crear Acopio' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA AMPLIADA DE FOTO DE ACOPIO */}
      {previewStockpilePhoto && previewStockpilePhoto.photoUrl && (
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
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        details={confirmDialog.details}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />

      <CsvImportModal
        open={showCsvImportModal}
        initialMode={csvImportMode}
        clients={clients}
        quarries={quarries}
        zones={zones}
        surveys={surveys}
        stockpiles={stockpiles}
        defaultClientId={effectiveHeaderClient?.id ?? 'auto'}
        onClose={() => setShowCsvImportModal(false)}
        onSuccess={async (title, message) => {
          await onRefreshData();
          onNotify(title, message);
        }}
      />
    </section>
  );
};
