import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'ingeodron_secure_auth_secret_key_2026_topografia_v4';

const FILES_ROOT_DIR = path.resolve(
  process.env.FILES_ROOT_DIR || path.join(process.cwd(), 'storage')
);
const STORAGE_DIR = FILES_ROOT_DIR;
const TMP_UPLOAD_DIR = path.join(STORAGE_DIR, '.tmp');
const DELIVERABLES_INDEX_PATH = path.join(STORAGE_DIR, 'deliverables-index.json');
const LEGACY_DELIVERABLES_INDEX_PATH = path.join(STORAGE_DIR, 'vuelos', 'deliverables-index.json');
const STOCKPILE_PHOTOS_INDEX_PATH = path.join(STORAGE_DIR, 'stockpile-photos.json');
const USERS_FILE_PATH = path.join(FILES_ROOT_DIR, 'users.json');
const CLIENTS_FILE_PATH = path.join(FILES_ROOT_DIR, 'clients.json');
const MATERIALS_FILE_PATH = path.join(FILES_ROOT_DIR, 'materials.json');

interface StoredUser {
  id: number;
  uid: string;
  username?: string;
  email: string;
  password?: string;
  passwordHash?: string;
  displayName?: string;
  role: 'admin' | 'client';
  clientId?: number;
  active?: boolean;
  createdAt?: string;
}

interface StoredClient {
  id: number;
  code: string;
  name: string;
  cif?: string;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  notes?: string;
  viewer3dEnabled?: boolean;
  createdAt?: string;
}

interface AuthTokenPayload {
  userId: number;
  email: string;
  role: 'admin' | 'client';
  clientId?: number;
  clientCode?: string;
  clientFolder?: string;
  exp: number;
}

interface ServerDeliverableRecord {
  id: number;
  quarryId: number;
  surveyId?: number;
  clientCode?: string;
  clientName: string;
  clientFolder: string;
  flightSubFolder?: string;
  title: string;
  category: string;
  fileUrl: string;
  shareUrl: string;
  relativePath: string;
  fileName: string;
  storedFileName: string;
  fileSize: string;
  crs: string;
  uploadDate: string;
  hasPhysicalFile: boolean;
  isServerStored: boolean;
  createdAt: string;
}

interface ServerStockpilePhotoRecord {
  stockpileId: number;
  surveyId?: number;
  clientId?: number;
  clientCode?: string;
  clientName?: string;
  clientFolder: string;
  flightSubFolder: string;
  fileName: string;
  storedFileName: string;
  photoUrl: string;
  relativePath: string;
  updatedAt: string;
}

function ensureStorageDirectories(): void {
  fs.mkdirSync(FILES_ROOT_DIR, { recursive: true });
  fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
}

const MAX_FOLDER_CODE_LEN = 8;
const MAX_FOLDER_LABEL_LEN = 18;
const FOLDER_LEGAL_SUFFIXES = new Set([
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
const FOLDER_STOP_WORDS = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'en']);

function sanitizeClientCode(rawCode?: string): string {
  const cleaned = String(rawCode || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase()
    .slice(0, MAX_FOLDER_CODE_LEN);
  return cleaned || 'c000';
}

function sanitizeClientFolderLabel(rawName?: string): string {
  const tokens = String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return 'cliente';

  const coreTokens = tokens.filter(
    (t) => !FOLDER_LEGAL_SUFFIXES.has(t) && !FOLDER_STOP_WORDS.has(t)
  );
  const activeTokens = coreTokens.length > 0 ? coreTokens : tokens;

  let result = '';
  for (const token of activeTokens) {
    if (!result) {
      result = token.slice(0, MAX_FOLDER_LABEL_LEN);
      continue;
    }
    const next = `${result}_${token}`;
    if (next.length <= MAX_FOLDER_LABEL_LEN) {
      result = next;
    } else {
      break;
    }
  }

  return result.replace(/^_+|_+$/g, '') || 'cliente';
}

function buildClientFolderName(clientCode?: string, clientName?: string): string {
  return `${sanitizeClientCode(clientCode)}-${sanitizeClientFolderLabel(clientName)}`;
}

const MAX_FLIGHT_CODE_LEN = 20;
const MAX_FLIGHT_LABEL_LEN = 30;

/**
 * Sanitizes a flight code for use in a subfolder name.
 * Keeps alphanumeric characters and common separators.
 * Example: "VUE-100-JUN" → "VUE-100-JUN"
 */
function sanitizeFlightCode(rawCode?: string): string {
  return String(rawCode || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '')
    .slice(0, MAX_FLIGHT_CODE_LEN)
    .replace(/^[-_]+|[-_]+$/g, '') || 'vuelo';
}

/**
 * Sanitizes a flight mission name/notes for use in a subfolder label.
 * Removes accents, special characters, replaces spaces with underscores.
 * Example: "Misión Fotogramétrica Cantera" → "Mision_Fotogrametrica_Cantera"
 */
function sanitizeFlightLabel(rawLabel?: string): string {
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
 * Builds the flight subfolder name: `<flightCode>-<missionLabel>`.
 * Example: "120V" + "Vuelo cantera" → "120V-Vuelo_cantera"
 */
function buildFlightSubFolderName(flightCode?: string, flightNotes?: string): string {
  const code = sanitizeFlightCode(flightCode);
  const label = sanitizeFlightLabel(flightNotes);
  return `${code}-${label}`;
}

function sanitizeFolderSegment(rawName: string): string {
  const cleaned = String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, MAX_FOLDER_CODE_LEN + 1 + MAX_FOLDER_LABEL_LEN);
  return cleaned || 'c000-cliente';
}

function sanitizeFlightSubFolderSegment(rawName: string): string {
  const cleaned = String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, MAX_FLIGHT_CODE_LEN + 1 + MAX_FLIGHT_LABEL_LEN);
  return cleaned || 'vuelo';
}

function ensureClientDirectoryOnDisk(
  clientCode?: string,
  clientName?: string,
  explicitFolder?: string
): {
  clientFolder: string;
  clientDir: string;
  created: boolean;
} {
  const clientFolder =
    explicitFolder && explicitFolder.trim()
      ? sanitizeFolderSegment(explicitFolder)
      : buildClientFolderName(clientCode, clientName);
  const clientDir = path.join(STORAGE_DIR, clientFolder);
  if (!isPathInsideDir(clientDir, STORAGE_DIR)) {
    throw new Error('Nombre de cliente no válido para carpeta.');
  }
  const existed = fs.existsSync(clientDir);
  if (!existed) {
    fs.mkdirSync(clientDir, { recursive: true });
  }
  return { clientFolder, clientDir, created: !existed };
}

/**
 * Ensures the flight subfolder exists inside the client directory.
 * Structure: storage/<clientFolder>/<flightCode>-<flightLabel>/
 * Returns the subfolder name and its absolute path.
 */
function ensureFlightSubDirectory(
  clientDir: string,
  flightCode?: string,
  flightNotes?: string
): {
  flightSubFolder: string;
  flightDir: string;
} {
  const flightSubFolder = buildFlightSubFolderName(flightCode, flightNotes);
  const flightDir = path.join(clientDir, flightSubFolder);
  if (!isPathInsideDir(flightDir, clientDir)) {
    throw new Error('Nombre de vuelo no válido para subcarpeta.');
  }
  if (!fs.existsSync(flightDir)) {
    fs.mkdirSync(flightDir, { recursive: true });
  }
  return { flightSubFolder, flightDir };
}

function sanitizeFileName(rawName: string): string {
  const base = path.basename(String(rawName || ''));
  const cleaned = base
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\.\.+/g, '.')
    .trim();
  return cleaned || `entregable_${Date.now()}`;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function isPathInsideDir(targetPath: string, baseDir: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep);
}

// ----------------------------------------------------------------------------
// PASSWORD HASHING & USERS/CLIENTS REPOSITORY
// ----------------------------------------------------------------------------
function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return `${actualSalt}:${derived}`;
}

function verifyPassword(user: StoredUser, attempt: string): boolean {
  if (user.passwordHash) {
    const [salt, hash] = user.passwordHash.split(':');
    if (!salt || !hash) return false;
    const attemptHash = crypto.scryptSync(attempt, salt, 64).toString('hex');
    const bHash = Buffer.from(hash, 'hex');
    const bAttempt = Buffer.from(attemptHash, 'hex');
    return bHash.length === bAttempt.length && crypto.timingSafeEqual(bHash, bAttempt);
  }
  if (user.password) {
    return user.password === attempt;
  }
  return false;
}

const DEFAULT_USERS: StoredUser[] = [
  {
    id: 1,
    uid: 'user_admin_01',
    username: 'admin',
    email: 'admin@ingeodron.es',
    passwordHash: hashPassword('admin123', 'ingeodron_salt_01'),
    displayName: 'Administrador Técnico INGEODRON',
    role: 'admin',
    active: true,
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 2,
    uid: 'user_client_01',
    username: 'cmorales',
    email: 'cmorales@aridosdelsur.es',
    passwordHash: hashPassword('aridos2026', 'ingeodron_salt_02'),
    displayName: 'Carlos M. Morales — Áridos del Sur',
    role: 'client',
    clientId: 1,
    active: true,
    createdAt: '2026-01-15T08:30:00.000Z',
  },
  {
    id: 3,
    uid: 'user_client_02',
    username: 'eramos',
    email: 'eramos@gravasmadrid.es',
    passwordHash: hashPassword('jarama2026', 'ingeodron_salt_03'),
    displayName: 'Elena Ramos — Gravas Madrid',
    role: 'client',
    clientId: 2,
    active: true,
    createdAt: '2026-03-10T09:45:00.000Z',
  },
  {
    id: 4,
    uid: 'user_client_03',
    username: 'fvidal',
    email: 'f.vidal@mineriaridos.es',
    passwordHash: hashPassword('levante2026', 'ingeodron_salt_04'),
    displayName: 'Francisco Vidal — Minería Levante',
    role: 'client',
    clientId: 3,
    active: true,
    createdAt: '2026-04-22T10:30:00.000Z',
  },
];

const DEFAULT_CLIENTS: StoredClient[] = [
  {
    id: 1,
    code: 'C101',
    name: 'Áridos y Canteras del Sur S.A.',
    cif: 'B-91823746',
    contactName: 'Carlos M. Morales (Jefe de Explotación)',
    contactEmail: 'cmorales@aridosdelsur.es',
    viewer3dEnabled: true,
  },
  {
    id: 2,
    code: 'C110',
    name: 'Hormigones y Gravas Madrid S.L.',
    cif: 'B-28941029',
    contactName: 'Elena Ramos (Directora Técnica)',
    contactEmail: 'eramos@gravasmadrid.es',
    viewer3dEnabled: false,
  },
  {
    id: 3,
    code: 'C120',
    name: 'Minería y Áridos del Levante S.A.',
    cif: 'A-03194821',
    contactName: 'Francisco Vidal',
    contactEmail: 'f.vidal@mineriaridos.es',
    viewer3dEnabled: false,
  },
];

function readUsers(): StoredUser[] {
  ensureStorageDirectories();
  if (!fs.existsSync(USERS_FILE_PATH)) {
    writeUsers(DEFAULT_USERS);
    return DEFAULT_USERS;
  }
  try {
    const raw = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function writeUsers(users: StoredUser[]): void {
  ensureStorageDirectories();
  const sanitized = users.map((u) => {
    if (u.password && !u.passwordHash) {
      return {
        ...u,
        passwordHash: hashPassword(u.password),
        password: undefined,
      };
    }
    return u;
  });
  fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(sanitized, null, 2), 'utf-8');
}

function readClients(): StoredClient[] {
  ensureStorageDirectories();
  if (!fs.existsSync(CLIENTS_FILE_PATH)) {
    writeClients(DEFAULT_CLIENTS);
    return DEFAULT_CLIENTS;
  }
  try {
    const raw = fs.readFileSync(CLIENTS_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_CLIENTS;
  } catch {
    return DEFAULT_CLIENTS;
  }
}

function writeClients(clients: StoredClient[]): void {
  ensureStorageDirectories();
  fs.writeFileSync(CLIENTS_FILE_PATH, JSON.stringify(clients, null, 2), 'utf-8');
}

// ----------------------------------------------------------------------------
// SESSION TOKENS & CRYPTO SIGNING (HMAC-SHA256)
// ----------------------------------------------------------------------------
function generateSessionToken(user: StoredUser, client?: StoredClient): string {
  const clientFolder =
    user.role === 'client' && client
      ? buildClientFolderName(client.code, client.name)
      : undefined;
  const payload: AuthTokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    clientCode: client ? sanitizeClientCode(client.code) : undefined,
    clientFolder,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days validity
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token: string): AuthTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;
  const encoded = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!encoded || !signature) return null;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const bSig = Buffer.from(signature);
  const bExpected = Buffer.from(expectedSig);
  if (bSig.length !== bExpected.length || !crypto.timingSafeEqual(bSig, bExpected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((chunk) => {
    const parts = chunk.split('=');
    const name = parts[0]?.trim();
    if (name) {
      cookies[name] = safeDecodeUriComponent(parts.slice(1).join('=').trim());
    }
  });
  return cookies;
}

function extractTokenFromRequest(req: Request): string | null {
  // 1. Authorization header: "Bearer <token>"
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  // 2. Cookie header: "ingeodron_session_token=<token>"
  const cookies = parseCookies(req.headers.cookie);
  if (cookies['ingeodron_session_token']) {
    return cookies['ingeodron_session_token'];
  }
  // 3. Query string parameter (?token=<token>)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  return null;
}

function getAuthenticatedUser(req: Request): AuthTokenPayload | null {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  return verifySessionToken(token);
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({
      error: 'Acceso no autorizado. Inicia sesión en el portal para acceder a los archivos.',
      code: 'UNAUTHORIZED',
    });
    return;
  }
  (req as unknown as { authUser: AuthTokenPayload }).authUser = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as unknown as { authUser?: AuthTokenPayload }).authUser;
  if (!user || user.role !== 'admin') {
    res.status(403).json({
      error: 'Acceso denegado: esta operación requiere privilegios de Administrador Técnico.',
      code: 'FORBIDDEN',
    });
    return;
  }
  next();
}

// ----------------------------------------------------------------------------
// DELIVERABLES REPOSITORY
// ----------------------------------------------------------------------------

/**
 * Returns the absolute filesystem path of a stored deliverable.
 * Supports both new structure (with flightSubFolder) and legacy (direct in clientFolder).
 */
function getDeliverableFilePath(item: ServerDeliverableRecord): string {
  const storedName = item.storedFileName || item.fileName || '';
  if (item.flightSubFolder) {
    const directPath = path.join(STORAGE_DIR, item.clientFolder, item.flightSubFolder, storedName);
    if (fs.existsSync(directPath)) return directPath;
    const legacyPath = path.join(STORAGE_DIR, 'vuelos', item.clientFolder, item.flightSubFolder, storedName);
    if (fs.existsSync(legacyPath)) return legacyPath;
    return directPath;
  }
  const directPath = path.join(STORAGE_DIR, item.clientFolder, storedName);
  if (fs.existsSync(directPath)) return directPath;
  const legacyPath = path.join(STORAGE_DIR, 'vuelos', item.clientFolder, storedName);
  if (fs.existsSync(legacyPath)) return legacyPath;
  return directPath;
}

function readDeliverablesIndex(): ServerDeliverableRecord[] {
  ensureStorageDirectories();
  let indexPath = DELIVERABLES_INDEX_PATH;
  if (!fs.existsSync(indexPath) && fs.existsSync(LEGACY_DELIVERABLES_INDEX_PATH)) {
    indexPath = LEGACY_DELIVERABLES_INDEX_PATH;
  }
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: ServerDeliverableRecord) => {
      const candidatePath = getDeliverableFilePath(item);
      const exists = Boolean(
        item.clientFolder &&
        (item.storedFileName || item.fileName) &&
        isPathInsideDir(candidatePath, STORAGE_DIR) &&
        fs.existsSync(candidatePath)
      );
      return {
        ...item,
        hasPhysicalFile: exists,
        isServerStored: true,
      };
    });
  } catch {
    return [];
  }
}

function writeDeliverablesIndex(items: ServerDeliverableRecord[]): void {
  ensureStorageDirectories();
  fs.writeFileSync(DELIVERABLES_INDEX_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

const ALLOWED_PHOTO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function getStockpilePhotoFilePath(item: ServerStockpilePhotoRecord): string {
  const storedName = item.storedFileName || item.fileName || '';
  if (item.flightSubFolder) {
    const primaryPath = path.join(STORAGE_DIR, item.clientFolder, item.flightSubFolder, 'imagenes_acopios', storedName);
    if (fs.existsSync(primaryPath)) return primaryPath;
    const legacyPath = path.join(STORAGE_DIR, item.clientFolder, item.flightSubFolder, 'fotos_acopios', storedName);
    if (fs.existsSync(legacyPath)) return legacyPath;
    return primaryPath;
  }
  const primaryPath = path.join(STORAGE_DIR, item.clientFolder, 'imagenes_acopios', storedName);
  if (fs.existsSync(primaryPath)) return primaryPath;
  const legacyPath = path.join(STORAGE_DIR, item.clientFolder, 'fotos_acopios', storedName);
  if (fs.existsSync(legacyPath)) return legacyPath;
  return primaryPath;
}

function readStockpilePhotosIndex(): ServerStockpilePhotoRecord[] {
  ensureStorageDirectories();
  if (!fs.existsSync(STOCKPILE_PHOTOS_INDEX_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(STOCKPILE_PHOTOS_INDEX_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: ServerStockpilePhotoRecord) => {
      if (!item || !item.clientFolder || !(item.storedFileName || item.fileName)) return false;
      const p = getStockpilePhotoFilePath(item);
      return isPathInsideDir(p, STORAGE_DIR) && fs.existsSync(p);
    });
  } catch {
    return [];
  }
}

function writeStockpilePhotosIndex(items: ServerStockpilePhotoRecord[]): void {
  ensureStorageDirectories();
  fs.writeFileSync(STOCKPILE_PHOTOS_INDEX_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

function moveFileSafe(srcPath: string, destPath: string): void {
  try {
    fs.renameSync(srcPath, destPath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr && nodeErr.code === 'EXDEV') {
      fs.copyFileSync(srcPath, destPath);
      fs.unlinkSync(srcPath);
    } else {
      throw err;
    }
  }
}

// Allowed extensions for GIS, photogrammetry, 3D, and reports
const ALLOWED_DELIVERABLE_EXTENSIONS = new Set([
  '.las',
  '.laz',
  '.obj',
  '.ply',
  '.stl',
  '.xyz',
  '.pcd',
  '.pts',
  '.txt',
  '.csv',
  '.tif',
  '.tiff',
  '.geotiff',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.pdf',
  '.dxf',
  '.dwg',
  '.json',
  '.zip',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.xml',
  '.php',
  '.exe',
  '.sh',
  '.bat',
  '.cmd',
  '.js',
  '.mjs',
  '.cgi',
  '.pl',
]);

ensureStorageDirectories();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureStorageDirectories();
      cb(null, TMP_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${sanitizeFileName(file.originalname)}`;
      cb(null, unique);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2 GB max per deliverable
  },
});

async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // Basic health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      version: '5.20',
      filesRootDir: FILES_ROOT_DIR,
      storageDir: STORAGE_DIR,
      security: {
        clientIsolation: true,
        sessionAuth: true,
      },
    });
  });

  // --------------------------------------------------------------------------
  // AUTHENTICATION ENDPOINTS
  // --------------------------------------------------------------------------
  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { usernameOrEmail, password } = req.body || {};
      if (!usernameOrEmail || !password) {
        res.status(400).json({ error: 'Debes introducir usuario/email y contraseña.' });
        return;
      }
      const users = readUsers();
      const clean = String(usernameOrEmail).trim().toLowerCase();
      const cleanPass = String(password).trim();

      const matched = users.find(
        (u) =>
          (u.email.toLowerCase() === clean || (u.username && u.username.toLowerCase() === clean)) &&
          u.active !== false
      );

      if (!matched || !verifyPassword(matched, cleanPass)) {
        res.status(401).json({
          error: 'Credenciales incorrectas o cuenta desactivada.',
          code: 'INVALID_CREDENTIALS',
        });
        return;
      }

      const clients = readClients();
      const client = matched.clientId ? clients.find((c) => c.id === matched.clientId) : undefined;
      const clientFolder =
        matched.role === 'client' && client
          ? buildClientFolderName(client.code, client.name)
          : undefined;

      const token = generateSessionToken(matched, client);

      // Set HTTP-Only Cookie with 7 days validity
      res.setHeader(
        'Set-Cookie',
        `ingeodron_session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
      );

      // Return sanitized user (strip internal password hashes)
      const { password: _, passwordHash: __, ...safeUser } = matched;

      res.json({
        ok: true,
        token,
        user: safeUser,
        clientFolder,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al autenticar usuario.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.setHeader(
      'Set-Cookie',
      'ingeodron_session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    res.json({ ok: true, user });
  });

  // Admin user list sync
  app.post('/api/auth/sync-users', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const bodyUsers = req.body?.users;
    if (Array.isArray(bodyUsers)) {
      writeUsers(bodyUsers);
      res.json({ ok: true, count: bodyUsers.length });
      return;
    }
    res.status(400).json({ error: 'Formato de lista de usuarios inválido.' });
  });

  // Admin client list sync
  app.post('/api/auth/sync-clients', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const bodyClients = req.body?.clients;
    if (Array.isArray(bodyClients)) {
      writeClients(bodyClients);
      res.json({ ok: true, count: bodyClients.length });
      return;
    }
    res.status(400).json({ error: 'Formato de lista de clientes inválido.' });
  });

  // Materials & Densities catalog (shared between admin & clients)
  app.get('/api/materials', requireAuth, (_req: Request, res: Response) => {
    ensureStorageDirectories();
    if (!fs.existsSync(MATERIALS_FILE_PATH)) {
      res.json({ materials: null });
      return;
    }
    try {
      const raw = fs.readFileSync(MATERIALS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      res.json({ materials: Array.isArray(parsed) ? parsed : null });
    } catch {
      res.json({ materials: null });
    }
  });

  app.post('/api/materials/sync', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const bodyMaterials = req.body?.materials;
    if (!Array.isArray(bodyMaterials)) {
      res.status(400).json({ error: 'Formato de lista de materiales inválido.' });
      return;
    }
    try {
      ensureStorageDirectories();
      fs.writeFileSync(MATERIALS_FILE_PATH, JSON.stringify(bodyMaterials, null, 2), 'utf-8');
      res.json({ ok: true, count: bodyMaterials.length });
    } catch {
      res.status(500).json({ error: 'No se pudo guardar el catálogo de materiales en el servidor.' });
    }
  });

  // --------------------------------------------------------------------------
  // CLIENT DIRECTORY MANAGEMENT (Admin Only)
  // --------------------------------------------------------------------------
  app.post('/api/clients/ensure-folder', requireAuth, requireAdmin, (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        clientCode?: string;
        clientName?: string;
        clientFolder?: string;
      };
      const { clientFolder, created } = ensureClientDirectoryOnDisk(
        body.clientCode,
        body.clientName,
        body.clientFolder
      );
      res.json({
        ok: true,
        created,
        clientFolder,
        relativePath: `storage/${clientFolder}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la carpeta del cliente.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/clients/sync-folders', requireAuth, requireAdmin, (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        clients?: Array<{ code?: string; name?: string }>;
      };
      const inputClients = Array.isArray(body.clients) ? body.clients : [];
      const results = inputClients.map((c) => {
        const ensured = ensureClientDirectoryOnDisk(c.code, c.name);
        return {
          clientFolder: ensured.clientFolder,
          relativePath: `storage/${ensured.clientFolder}`,
          created: ensured.created,
        };
      });
      res.json({ ok: true, folders: results });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudieron sincronizar las carpetas.';
      res.status(400).json({ error: msg });
    }
  });

  // --------------------------------------------------------------------------
  // DELIVERABLES ENDPOINTS (Protected with Strict Client-Isolation)
  // --------------------------------------------------------------------------

  // List deliverables: Admin sees all; Clients see ONLY their own company's deliverables
  app.get('/api/deliverables', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    const all = readDeliverablesIndex();

    let deliverables = all;
    if (user.role === 'client') {
      deliverables = all.filter(
        (d) =>
          d.clientFolder === user.clientFolder ||
          (user.clientCode && d.clientCode?.toLowerCase() === user.clientCode.toLowerCase())
      );
    }

    res.json({
      deliverables,
      clientScope: user.role === 'client' ? user.clientFolder : 'all',
      rootStructure: 'storage/<Codigo>-<Nombre_del_Cliente>/<flightCode>-<Mision>',
    });
  });

  // Check if a filename already exists inside a client/flight folder
  app.get('/api/deliverables/check', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    const clientCode = String(req.query.clientCode || '').trim();
    const clientName = String(req.query.clientName || 'Cliente General').trim();
    const explicitFolder = String(req.query.clientFolder || '').trim();
    const rawFlightCode = String(req.query.flightCode || '').trim();
    const rawFlightNotes = String(req.query.flightNotes || '').trim();
    const rawFileName = String(req.query.fileName || '').trim();

    if (!rawFileName) {
      res.json({ exists: false });
      return;
    }

    let clientFolder = explicitFolder
      ? sanitizeFolderSegment(explicitFolder)
      : buildClientFolderName(clientCode, clientName);

    // If client user, prevent checking files belonging to other clients
    if (user.role === 'client') {
      if (user.clientFolder && clientFolder !== user.clientFolder) {
        res.status(403).json({ error: 'No tienes permiso para consultar carpetas de otros clientes.' });
        return;
      }
      clientFolder = user.clientFolder || clientFolder;
    }

    const cleanFileName = sanitizeFileName(rawFileName);
    const clientDir = path.join(STORAGE_DIR, clientFolder);

    // Determine target directory: subfolder if flightCode provided, else root clientDir
    let targetDir = clientDir;
    let flightSubFolder: string | undefined;
    if (rawFlightCode) {
      flightSubFolder = buildFlightSubFolderName(rawFlightCode, rawFlightNotes);
      targetDir = path.join(clientDir, flightSubFolder);
    }

    const targetPath = path.join(targetDir, cleanFileName);

    if (!isPathInsideDir(targetPath, STORAGE_DIR)) {
      res.status(400).json({ error: 'Ruta de archivo no válida.' });
      return;
    }

    const exists = fs.existsSync(targetPath);
    const current = exists ? readDeliverablesIndex() : [];
    const existingRecord = exists
      ? current.find(
        (d) =>
          d.clientFolder === clientFolder &&
          d.flightSubFolder === flightSubFolder &&
          (d.storedFileName || d.fileName) === cleanFileName
      ) || null
      : null;

    const relPath = flightSubFolder
      ? `storage/${clientFolder}/${flightSubFolder}/${cleanFileName}`
      : `storage/${clientFolder}/${cleanFileName}`;

    res.json({
      exists,
      clientCode: sanitizeClientCode(clientCode),
      clientName,
      clientFolder,
      flightSubFolder,
      fileName: cleanFileName,
      relativePath: relPath,
      existingRecord,
    });
  });

  // Upload deliverable file into storage/<clientFolder>/<flightCode>-<Mision>/<archivo>
  app.post(
    '/api/deliverables/upload',
    requireAuth,
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'El archivo supera el límite máximo permitido (2 GB).',
              code: 'FILE_TOO_LARGE',
            });
            return;
          }
          res.status(400).json({
            error: `Error al recibir el archivo (${err.code}): ${err.message}`,
            code: err.code,
          });
          return;
        }
        const msg = err instanceof Error ? err.message : 'Error procesando la subida del archivo.';
        res.status(500).json({ error: msg, code: 'UPLOAD_MIDDLEWARE_ERROR' });
      });
    },
    (req: Request, res: Response) => {
      const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
      const uploadedFile = req.file;

      if (!uploadedFile) {
        res.status(400).json({ error: 'Debes seleccionar un archivo real para subir.' });
        return;
      }

      try {
        const body = req.body as Record<string, string | undefined>;
        const quarryId = Number(body.quarryId);
        if (!Number.isFinite(quarryId) || quarryId <= 0) {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
          res.status(400).json({ error: 'Falta seleccionar una explotación válida.' });
          return;
        }

        const surveyIdRaw = body.surveyId ? Number(body.surveyId) : undefined;
        const surveyId = surveyIdRaw && Number.isFinite(surveyIdRaw) ? surveyIdRaw : undefined;

        let clientCode = sanitizeClientCode(body.clientCode);
        let clientName = (body.clientName || 'Cliente General').trim();
        let targetExplicitFolder = body.clientFolder;

        // Strict authorization: Client users can ONLY upload to their own client directory
        if (user.role === 'client') {
          if (!user.clientFolder) {
            if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
            res.status(403).json({ error: 'Tu usuario no tiene asociada una carpeta de cliente válida.' });
            return;
          }
          targetExplicitFolder = user.clientFolder;
          clientCode = user.clientCode || clientCode;
        }

        const { clientFolder, clientDir } = ensureClientDirectoryOnDisk(
          clientCode,
          clientName,
          targetExplicitFolder
        );

        // Determine flight subfolder: <flightCode>-<missionLabel> (e.g. 120V-Vuelo_cantera)
        const rawFlightCode = body.flightCode?.trim() || (surveyId ? `VUE-${surveyId}` : 'GENERAL');
        const rawFlightNotes = body.flightNotes?.trim() || 'Vuelo';
        const { flightSubFolder, flightDir } = ensureFlightSubDirectory(clientDir, rawFlightCode, rawFlightNotes);

        const requestedFileName = body.fileName?.trim() || uploadedFile.originalname;
        const finalFileName = sanitizeFileName(requestedFileName);

        // Security check: Extension validation
        const ext = path.extname(finalFileName).toLowerCase();
        if (!ALLOWED_DELIVERABLE_EXTENSIONS.has(ext)) {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
          res.status(400).json({
            error: `Extensión de archivo "${ext}" no permitida por seguridad. Solo se admiten formatos fotogramétricos, nubes de puntos, mallas 3D, ortofotos, CAD y reportes.`,
            code: 'FORBIDDEN_FILE_TYPE',
          });
          return;
        }

        const finalDestPath = path.join(flightDir, finalFileName);
        if (!isPathInsideDir(finalDestPath, flightDir)) {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
          res.status(400).json({ error: 'Nombre de archivo no válido.' });
          return;
        }

        const alreadyExists = fs.existsSync(finalDestPath);
        const allowOverwrite = body.overwrite === 'true';

        if (alreadyExists && !allowOverwrite) {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
          res.status(409).json({
            error: `El archivo "${finalFileName}" ya existe en storage/${clientFolder}/${flightSubFolder}/. Confirma si deseas sobrescribirlo.`,
            code: 'FILE_EXISTS',
            exists: true,
            fileName: finalFileName,
            relativePath: `storage/${clientFolder}/${flightSubFolder}/${finalFileName}`,
          });
          return;
        }

        moveFileSafe(uploadedFile.path, finalDestPath);

        // Explicit verification on disk after moving file
        if (!fs.existsSync(finalDestPath)) {
          throw new Error('El archivo no se encontró en el servidor tras finalizar la escritura.');
        }
        const finalStat = fs.statSync(finalDestPath);
        if (!finalStat.isFile() || (uploadedFile.size > 0 && finalStat.size !== uploadedFile.size)) {
          throw new Error('Error de integridad: el tamaño almacenado no coincide con el archivo subido.');
        }

        const current = readDeliverablesIndex();
        const existingIdx = current.findIndex(
          (d) =>
            d.clientFolder === clientFolder &&
            d.flightSubFolder === flightSubFolder &&
            (d.storedFileName || d.fileName) === finalFileName
        );

        const relativePath = `storage/${clientFolder}/${flightSubFolder}/${finalFileName}`;
        const shareUrl = `/files/${encodeURIComponent(clientFolder)}/${encodeURIComponent(flightSubFolder)}/${encodeURIComponent(finalFileName)}`;
        const nextId =
          existingIdx >= 0
            ? current[existingIdx].id
            : current.length > 0
              ? Math.max(1000, ...current.map((d) => Number(d.id) || 0)) + 1
              : 1001;
        const downloadUrl = `/api/deliverables/${nextId}/download`;

        const record: ServerDeliverableRecord = {
          id: nextId,
          quarryId,
          surveyId,
          clientCode,
          clientName,
          clientFolder,
          flightSubFolder,
          title: (body.title || finalFileName).trim(),
          category: (body.category || 'pdf_report').trim(),
          fileUrl: downloadUrl,
          shareUrl,
          relativePath,
          fileName: finalFileName,
          storedFileName: finalFileName,
          fileSize: formatFileSize(finalStat.size),
          crs: (body.crs || 'ETRS89 / UTM zone 30N (EPSG:25830)').trim(),
          uploadDate: new Date().toISOString().slice(0, 10),
          hasPhysicalFile: true,
          isServerStored: true,
          createdAt: new Date().toISOString(),
        };

        if (existingIdx >= 0) {
          current.splice(existingIdx, 1);
        }
        current.unshift(record);
        writeDeliverablesIndex(current);

        res.status(alreadyExists ? 200 : 201).json({
          verified: true,
          bytesStored: finalStat.size,
          deliverable: record,
          overwritten: alreadyExists,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error guardando el archivo en el servidor.';
        res.status(500).json({ error: msg });
      } finally {
        if (uploadedFile && fs.existsSync(uploadedFile.path)) {
          try {
            fs.unlinkSync(uploadedFile.path);
          } catch {
            // ignore cleanup failure
          }
        }
      }
    }
  );

  // Verify deliverable physical presence and index registration
  app.get('/api/deliverables/:id/verify', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ verified: false, error: 'ID de entregable inválido.' });
      return;
    }

    const items = readDeliverablesIndex();
    const item = items.find((d) => d.id === id);
    if (!item) {
      res.status(404).json({ verified: false, error: 'El entregable no figura en el índice del servidor.' });
      return;
    }

    if (user.role !== 'admin' && item.clientFolder !== user.clientFolder) {
      res.status(403).json({ verified: false, error: 'Acceso denegado.' });
      return;
    }

    const filePath = getDeliverableFilePath(item);
    if (!isPathInsideDir(filePath, STORAGE_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({
        verified: false,
        hasPhysicalFile: false,
        error: 'El registro existe, pero el archivo físico no se encontró en el directorio del servidor.',
      });
      return;
    }

    const stat = fs.statSync(filePath);
    res.json({
      verified: stat.isFile(),
      hasPhysicalFile: stat.isFile(),
      bytesStored: stat.size,
      fileName: item.fileName,
      relativePath: item.relativePath,
      deliverable: {
        ...item,
        hasPhysicalFile: stat.isFile(),
        fileSize: formatFileSize(stat.size),
      },
    });
  });

  // Download deliverable by ID with strict client-level ownership validation
  app.get('/api/deliverables/:id/download', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID de entregable inválido.' });
      return;
    }

    const items = readDeliverablesIndex();
    const item = items.find((d) => d.id === id);
    if (!item) {
      res.status(404).json({ error: 'Entregable no encontrado en el servidor.' });
      return;
    }

    // Client isolation check
    if (user.role !== 'admin' && item.clientFolder !== user.clientFolder) {
      res.status(403).json({
        error: 'Acceso denegado: este archivo pertenece a otra explotación o empresa cliente.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const filePath = getDeliverableFilePath(item);
    if (!isPathInsideDir(filePath, STORAGE_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'El archivo físico no existe en la carpeta del cliente.' });
      return;
    }

    // Security headers: Prevent MIME sniffing & XSS
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    const ext = path.extname(item.fileName).toLowerCase();
    if (req.query.inline === '1' && !DANGEROUS_EXTENSIONS.has(ext)) {
      res.sendFile(filePath);
      return;
    }

    res.download(filePath, item.fileName);
  });

  function serveProtectedFile(
    req: Request,
    res: Response,
    requestedFolder: string,
    candidatePaths: string[],
    fileName: string,
    notFoundMsg: string
  ): void {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).send('Acceso no autorizado: debes iniciar sesión en el portal para acceder a este archivo.');
      return;
    }

    if (user.role !== 'admin' && requestedFolder !== user.clientFolder) {
      res.status(403).send('Acceso denegado: no tienes permisos para acceder a los archivos de esta empresa cliente.');
      return;
    }

    const filePath = candidatePaths.find(
      (p) => isPathInsideDir(p, STORAGE_DIR) && fs.existsSync(p)
    );
    if (!filePath) {
      res.status(404).send(notFoundMsg);
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    const ext = path.extname(fileName).toLowerCase();
    if (req.query.download === '1' || DANGEROUS_EXTENSIONS.has(ext)) {
      res.download(filePath, fileName);
      return;
    }
    res.sendFile(filePath);
  }

  // Legacy shareable URLs under /files/vuelos/... (registered before /files/:clientFolder/...)
  app.get('/files/vuelos/:clientFolder/:segment/:fileName', (req: Request, res: Response) => {
    const requestedFolder = sanitizeFolderSegment(safeDecodeUriComponent(String(req.params.clientFolder || '')));
    const segment = sanitizeFlightSubFolderSegment(safeDecodeUriComponent(String(req.params.segment || '')));
    const fileName = sanitizeFileName(safeDecodeUriComponent(String(req.params.fileName || '')));
    serveProtectedFile(
      req,
      res,
      requestedFolder,
      [
        path.join(STORAGE_DIR, requestedFolder, segment, fileName),
        path.join(STORAGE_DIR, 'vuelos', requestedFolder, segment, fileName),
      ],
      fileName,
      'Archivo no encontrado en la subcarpeta de vuelo del cliente.'
    );
  });

  app.get('/files/vuelos/:clientFolder/:fileName', (req: Request, res: Response) => {
    const requestedFolder = sanitizeFolderSegment(safeDecodeUriComponent(String(req.params.clientFolder || '')));
    const fileName = sanitizeFileName(safeDecodeUriComponent(String(req.params.fileName || '')));
    serveProtectedFile(
      req,
      res,
      requestedFolder,
      [
        path.join(STORAGE_DIR, requestedFolder, fileName),
        path.join(STORAGE_DIR, 'vuelos', requestedFolder, fileName),
      ],
      fileName,
      'Archivo no encontrado en la carpeta del cliente.'
    );
  });

  // Direct shareable URL: /files/<clientFolder>/<flightSubFolder>/<fileName>
  app.get('/files/:clientFolder/:flightSubFolder/:fileName', (req: Request, res: Response) => {
    const requestedFolder = sanitizeFolderSegment(safeDecodeUriComponent(String(req.params.clientFolder || '')));
    const flightSubFolder = sanitizeFlightSubFolderSegment(safeDecodeUriComponent(String(req.params.flightSubFolder || '')));
    const fileName = sanitizeFileName(safeDecodeUriComponent(String(req.params.fileName || '')));
    serveProtectedFile(
      req,
      res,
      requestedFolder,
      [
        path.join(STORAGE_DIR, requestedFolder, flightSubFolder, fileName),
        path.join(STORAGE_DIR, 'vuelos', requestedFolder, flightSubFolder, fileName),
      ],
      fileName,
      'Archivo no encontrado en la subcarpeta de vuelo del cliente.'
    );
  });

  // Direct shareable URL (no subfolder): /files/<clientFolder>/<fileName>
  app.get('/files/:clientFolder/:fileName', (req: Request, res: Response) => {
    const requestedFolder = sanitizeFolderSegment(safeDecodeUriComponent(String(req.params.clientFolder || '')));
    const fileName = sanitizeFileName(safeDecodeUriComponent(String(req.params.fileName || '')));
    serveProtectedFile(
      req,
      res,
      requestedFolder,
      [
        path.join(STORAGE_DIR, requestedFolder, fileName),
        path.join(STORAGE_DIR, 'vuelos', requestedFolder, fileName),
      ],
      fileName,
      'Archivo no encontrado en la carpeta del cliente.'
    );
  });

  // Delete deliverable: ADMIN ONLY
  app.delete('/api/deliverables/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const items = readDeliverablesIndex();
    const target = items.find((d) => d.id === id);
    if (!target) {
      res.status(404).json({ error: 'Entregable no encontrado.' });
      return;
    }

    const remaining = items.filter((d) => d.id !== id);
    writeDeliverablesIndex(remaining);

    const filePath = getDeliverableFilePath(target);
    const stillReferenced = remaining.some(
      (d) =>
        d.clientFolder === target.clientFolder &&
        d.flightSubFolder === target.flightSubFolder &&
        (d.storedFileName || d.fileName) === (target.storedFileName || target.fileName)
    );

    if (!stillReferenced && isPathInsideDir(filePath, STORAGE_DIR) && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore unlink errors
      }
    }

    res.json({ deleted: true, id });
  });

  // --------------------------------------------------------------------------
  // STOCKPILE PHOTOS ENDPOINTS (Admin upload/delete; Client view/download)
  // --------------------------------------------------------------------------

  app.get('/api/stockpiles/photos', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    const all = readStockpilePhotosIndex();
    const photos =
      user.role === 'admin'
        ? all
        : all.filter(
            (p) =>
              p.clientFolder === user.clientFolder ||
              (user.clientId !== undefined && p.clientId === user.clientId) ||
              (user.clientCode && p.clientCode?.toLowerCase() === user.clientCode.toLowerCase())
          );

    res.json({ photos });
  });

  app.post(
    '/api/stockpiles/:id/photo',
    requireAuth,
    requireAdmin,
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'La fotografía supera el límite máximo permitido.',
              code: 'FILE_TOO_LARGE',
            });
            return;
          }
          res.status(400).json({
            error: `Error al recibir la fotografía (${err.code}): ${err.message}`,
            code: err.code,
          });
          return;
        }
        const msg = err instanceof Error ? err.message : 'Error procesando la fotografía.';
        res.status(500).json({ error: msg, code: 'UPLOAD_MIDDLEWARE_ERROR' });
      });
    },
    (req: Request, res: Response) => {
      const stockpileId = Number(req.params.id);
      const uploadedFile = req.file;

      if (!Number.isFinite(stockpileId) || stockpileId <= 0) {
        if (uploadedFile && fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        res.status(400).json({ error: 'ID de acopio inválido.' });
        return;
      }

      if (!uploadedFile) {
        res.status(400).json({ error: 'Debes seleccionar una fotografía para subir.' });
        return;
      }

      try {
        const body = (req.body || {}) as Record<string, string | undefined>;
        const originalName = sanitizeFileName(uploadedFile.originalname || `acopio_${stockpileId}.jpg`);
        const rawExt = path.extname(originalName);
        const ext = rawExt.toLowerCase();

        if (!ALLOWED_PHOTO_EXTENSIONS.has(ext)) {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
          res.status(400).json({
            error: `Formato "${ext || 'desconocido'}" no admitido. Solo se permiten imágenes JPG, JPEG, PNG o WebP.`,
            code: 'FORBIDDEN_FILE_TYPE',
          });
          return;
        }

        const clientIdRaw = body.clientId ? Number(body.clientId) : undefined;
        const clientId = clientIdRaw && Number.isFinite(clientIdRaw) ? clientIdRaw : undefined;
        const clientCode = sanitizeClientCode(body.clientCode);
        const clientName = (body.clientName || 'Cliente General').trim();
        const { clientFolder, clientDir } = ensureClientDirectoryOnDisk(
          clientCode,
          clientName,
          body.clientFolder
        );

        const surveyIdRaw = body.surveyId ? Number(body.surveyId) : undefined;
        const surveyId = surveyIdRaw && Number.isFinite(surveyIdRaw) ? surveyIdRaw : undefined;
        const rawFlightCode = body.flightCode?.trim() || (surveyId ? `VUE-${surveyId}` : 'GENERAL');
        const rawFlightNotes = body.flightNotes?.trim() || 'Vuelo';
        const { flightSubFolder, flightDir } = ensureFlightSubDirectory(
          clientDir,
          rawFlightCode,
          rawFlightNotes
        );

        const photosDir = path.join(flightDir, 'imagenes_acopios');
        if (!isPathInsideDir(photosDir, clientDir)) {
          throw new Error('Ruta de carpeta de fotografías no válida.');
        }
        if (!fs.existsSync(photosDir)) {
          fs.mkdirSync(photosDir, { recursive: true });
        }

        const cleanCode = sanitizeFileName(body.stockpileCode || '')
          .replace(/\.(png|jpe?g|webp)$/i, '')
          .trim();
        const cleanName = sanitizeFileName(body.stockpileName || '')
          .replace(/\.(png|jpe?g|webp)$/i, '')
          .trim();
        const safeBaseName =
          cleanCode && cleanName
            ? `${cleanCode}_${cleanName}`
            : cleanCode || cleanName || `acopio_${stockpileId}`;
        const finalExt = rawExt || ext;

        const current = readStockpilePhotosIndex();
        let renamedFileName = sanitizeFileName(`${safeBaseName}${finalExt}`);
        const hasCollisionWithOther = current.some(
          (p) =>
            p.stockpileId !== stockpileId &&
            p.clientFolder === clientFolder &&
            p.flightSubFolder === flightSubFolder &&
            (p.storedFileName || p.fileName).toLowerCase() === renamedFileName.toLowerCase()
        );
        if (hasCollisionWithOther) {
          renamedFileName = sanitizeFileName(`${safeBaseName}_${stockpileId}${finalExt}`);
        }

        const finalDestPath = path.join(photosDir, renamedFileName);
        if (!isPathInsideDir(finalDestPath, photosDir)) {
          throw new Error('Nombre de archivo de fotografía no válido.');
        }

        moveFileSafe(uploadedFile.path, finalDestPath);

        const prevIdx = current.findIndex((p) => p.stockpileId === stockpileId);
        if (prevIdx >= 0) {
          const prevRecord = current[prevIdx];
          const prevPath = getStockpilePhotoFilePath(prevRecord);
          if (prevPath !== finalDestPath && isPathInsideDir(prevPath, STORAGE_DIR) && fs.existsSync(prevPath)) {
            try {
              fs.unlinkSync(prevPath);
            } catch {
              // ignore old photo cleanup failure
            }
          }
          current.splice(prevIdx, 1);
        }

        const version = Date.now();
        const photoUrl = `/api/stockpiles/${stockpileId}/photo?v=${version}`;
        const relativePath = `storage/${clientFolder}/${flightSubFolder}/imagenes_acopios/${renamedFileName}`;

        const record: ServerStockpilePhotoRecord = {
          stockpileId,
          surveyId,
          clientId,
          clientCode,
          clientName,
          clientFolder,
          flightSubFolder,
          fileName: renamedFileName,
          storedFileName: renamedFileName,
          photoUrl,
          relativePath,
          updatedAt: new Date().toISOString(),
        };

        current.unshift(record);
        writeStockpilePhotosIndex(current);

        res.status(200).json({
          ok: true,
          photoUrl,
          fileName: renamedFileName,
          record,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error guardando la fotografía del acopio.';
        res.status(500).json({ error: msg });
      } finally {
        if (uploadedFile && fs.existsSync(uploadedFile.path)) {
          try {
            fs.unlinkSync(uploadedFile.path);
          } catch {
            // ignore temp cleanup failure
          }
        }
      }
    }
  );

  app.get('/api/stockpiles/:id/photo', requireAuth, (req: Request, res: Response) => {
    const user = (req as unknown as { authUser: AuthTokenPayload }).authUser;
    const stockpileId = Number(req.params.id);
    if (!Number.isFinite(stockpileId) || stockpileId <= 0) {
      res.status(400).json({ error: 'ID de acopio inválido.' });
      return;
    }

    const items = readStockpilePhotosIndex();
    const item = items.find((p) => p.stockpileId === stockpileId);
    if (!item) {
      res.status(404).json({ error: 'Este acopio no tiene fotografía registrada en el servidor.' });
      return;
    }

    if (user.role !== 'admin') {
      const sameFolder = Boolean(user.clientFolder && item.clientFolder === user.clientFolder);
      const sameId = user.clientId !== undefined && item.clientId === user.clientId;
      const sameCode = Boolean(user.clientCode && item.clientCode?.toLowerCase() === user.clientCode.toLowerCase());
      if (!sameFolder && !sameId && !sameCode) {
        res.status(403).json({
          error: 'Acceso denegado: esta fotografía pertenece a otro cliente.',
          code: 'FORBIDDEN',
        });
        return;
      }
    }

    const filePath = getStockpilePhotoFilePath(item);
    if (!isPathInsideDir(filePath, STORAGE_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'La fotografía física no se encontró en el servidor.' });
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    if (req.query.download === '1') {
      res.download(filePath, item.fileName);
      return;
    }

    res.sendFile(filePath);
  });

  app.delete('/api/stockpiles/:id/photo', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const stockpileId = Number(req.params.id);
    if (!Number.isFinite(stockpileId) || stockpileId <= 0) {
      res.status(400).json({ error: 'ID de acopio inválido.' });
      return;
    }

    const items = readStockpilePhotosIndex();
    const target = items.find((p) => p.stockpileId === stockpileId);
    if (!target) {
      res.json({ deleted: false, stockpileId });
      return;
    }

    const remaining = items.filter((p) => p.stockpileId !== stockpileId);
    writeStockpilePhotosIndex(remaining);

    const filePath = getStockpilePhotoFilePath(target);
    if (isPathInsideDir(filePath, STORAGE_DIR) && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore unlink errors
      }
    }

    res.json({ deleted: true, stockpileId });
  });

  // --------------------------------------------------------------------------
  // FRONTEND SERVING
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/files/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`INGEODRON server listening on http://0.0.0.0:${PORT}`);
    console.log(`Shared deliverables directory: ${STORAGE_DIR}`);
    console.log(`Client file isolation and authentication active.`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
