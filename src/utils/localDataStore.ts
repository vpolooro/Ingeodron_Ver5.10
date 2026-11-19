import { Client, Quarry, Zone, Survey, Stockpile, Deliverable, AppUser, SurveyStatus } from '../types.ts';

const STORAGE_KEY_CLIENTS = 'ingeodron_clients_v1';
const STORAGE_KEY_QUARRIES = 'ingeodron_quarries_v1';
const STORAGE_KEY_ZONES = 'ingeodron_zones_v1';
const STORAGE_KEY_SURVEYS = 'ingeodron_surveys_v1';
const STORAGE_KEY_STOCKPILES = 'ingeodron_stockpiles_v1';
const STORAGE_KEY_DELIVERABLES = 'ingeodron_deliverables_v1';
const STORAGE_KEY_USERS = 'ingeodron_users_v1';

// Initial default portal users (editable & extendable by Admin)
const INITIAL_USERS: AppUser[] = [
  {
    id: 1,
    uid: 'user_admin_01',
    username: 'admin',
    email: 'admin@ingeodron.es',
    password: 'admin123',
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
    password: 'aridos2026',
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
    password: 'jarama2026',
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
    password: 'levante2026',
    displayName: 'Francisco Vidal — Minería Levante',
    role: 'client',
    clientId: 3,
    active: true,
    createdAt: '2026-04-22T10:30:00.000Z',
  },
];

// Initial default clients
const INITIAL_CLIENTS: Client[] = [
  {
    id: 1,
    code: 'C101',
    name: 'Áridos y Canteras del Sur S.A.',
    cif: 'B-91823746',
    contactName: 'Carlos M. Morales (Jefe de Explotación)',
    contactEmail: 'cmorales@aridosdelsur.es',
    phone: '+34 954 123 456',
    notes: 'Contrato de control fotogramétrico mensual y cubicación RTK con dron.',
    viewer3dEnabled: true,
    createdAt: '2026-01-15T08:00:00.000Z',
  },
  {
    id: 2,
    code: 'C110',
    name: 'Hormigones y Gravas Madrid S.L.',
    cif: 'B-28941029',
    contactName: 'Elena Ramos (Directora Técnica)',
    contactEmail: 'eramos@gravasmadrid.es',
    phone: '+34 918 765 432',
    notes: 'Control volumétrico bimensual de pilas de machaqueo.',
    viewer3dEnabled: false,
    createdAt: '2026-03-10T09:30:00.000Z',
  },
  {
    id: 3,
    code: 'C120',
    name: 'Minería y Áridos del Levante S.A.',
    cif: 'A-03194821',
    contactName: 'Francisco Vidal',
    contactEmail: 'f.vidal@mineriaridos.es',
    phone: '+34 965 998 877',
    notes: 'Explotación a cielo abierto con frentes escalonados.',
    viewer3dEnabled: false,
    createdAt: '2026-04-22T10:15:00.000Z',
  },
];

// Initial default quarries
const INITIAL_QUARRIES: Quarry[] = [
  {
    id: 1,
    clientId: 1,
    name: 'Cantera El Peñón - Macizo Calizo',
    code: 'CAN-CAL-01',
    location: 'Utrera - Sevilla, España',
    coordinates: '37.1852, -5.7821',
    materialType: 'Caliza dolomítica triturada',
    status: 'active',
    areaM2: 78500,
    createdAt: '2026-01-15T08:30:00.000Z',
  },
  {
    id: 2,
    clientId: 1,
    name: 'Explotación Las Cumbres',
    code: 'CAN-CUMB-02',
    location: 'Alcalá de Guadaíra - Sevilla',
    coordinates: '37.3320, -5.8390',
    materialType: 'Areniscas y margas',
    status: 'active',
    areaM2: 42000,
    createdAt: '2026-02-01T09:00:00.000Z',
  },
  {
    id: 3,
    clientId: 2,
    name: 'Gravera y Áridos Jarama Norte',
    code: 'CAN-GRAV-02',
    location: 'Arganda del Rey - Madrid',
    coordinates: '40.2981, -3.4512',
    materialType: 'Áridos rodados y arenas silíceas',
    status: 'active',
    areaM2: 63000,
    createdAt: '2026-03-12T11:00:00.000Z',
  },
  {
    id: 4,
    clientId: 3,
    name: 'Cantera Sierra del Levante',
    code: 'CAN-LEV-03',
    location: 'Novelda - Alicante',
    coordinates: '38.3847, -0.7654',
    materialType: 'Dolomía y caliza marmórea',
    status: 'active',
    areaM2: 54000,
    createdAt: '2026-04-22T10:45:00.000Z',
  },
];

// Initial default zones
const INITIAL_ZONES: Zone[] = [
  {
    id: 1,
    quarryId: 1,
    name: 'Pila Acopio Árido Grueso 12/20mm',
    code: 'ZON-AC-01',
    zoneType: 'stockpile',
    targetMaterial: 'Grava caliza 12/20',
    densityTonM3: 1.68,
    baseElevationM: 115.0,
    status: 'active',
    createdAt: '2026-01-15T09:00:00.000Z',
  },
  {
    id: 2,
    quarryId: 1,
    name: 'Frente de Extracción Banco Norte 3',
    code: 'ZON-EXT-02',
    zoneType: 'bench_extraction',
    targetMaterial: 'Caliza viva en banco',
    densityTonM3: 2.65,
    baseElevationM: 95.0,
    status: 'active',
    createdAt: '2026-01-15T09:30:00.000Z',
  },
  {
    id: 3,
    quarryId: 1,
    name: 'Acopio Zahorra Artificial y Finos 0-6',
    code: 'ZON-AC-03',
    zoneType: 'stockpile',
    targetMaterial: 'Zahorra ZA 0/32',
    densityTonM3: 1.72,
    baseElevationM: 112.0,
    status: 'active',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 4,
    quarryId: 3,
    name: 'Pila de Acopio Gravilla Lavada 4/8',
    code: 'GRAV-PILA-01',
    zoneType: 'stockpile',
    targetMaterial: 'Gravilla silícea 4/8',
    densityTonM3: 1.55,
    baseElevationM: 580.0,
    status: 'active',
    createdAt: '2026-03-12T11:30:00.000Z',
  },
  {
    id: 5,
    quarryId: 3,
    name: 'Vaso de Extracción Gravera Fase II',
    code: 'GRAV-EXT-02',
    zoneType: 'bench_extraction',
    targetMaterial: 'Grava natural de río',
    densityTonM3: 1.80,
    baseElevationM: 565.0,
    status: 'active',
    createdAt: '2026-03-12T12:00:00.000Z',
  },
  {
    id: 6,
    quarryId: 2,
    name: 'Acopio Subbase Caliza Las Cumbres',
    code: 'CUMB-AC-01',
    zoneType: 'stockpile',
    targetMaterial: 'Subbase 0/40',
    densityTonM3: 1.75,
    baseElevationM: 140.0,
    status: 'active',
    createdAt: '2026-02-01T09:30:00.000Z',
  },
  {
    id: 7,
    quarryId: 4,
    name: 'Pila Acopio Dolomía Clasificada 0/20',
    code: 'LEV-AC-01',
    zoneType: 'stockpile',
    targetMaterial: 'Dolomía triturada 0/20',
    densityTonM3: 1.74,
    baseElevationM: 245.0,
    status: 'active',
    createdAt: '2026-04-22T11:00:00.000Z',
  },
];

// Initial 17 historical flights
const INITIAL_SURVEYS: Survey[] = [
  // Zone 1 flights
  {
    id: 1,
    zoneId: 1,
    status: 'archived',
    surveyDate: '2026-06-15',
    flightCode: 'VUE-100-JUN',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 120.0,
    fillVolumeM3: 31200.0,
    netVolumeM3: 31080.0,
    tonnageEst: 52214.4,
    pointCount: 310000,
    groundResolutionCm: 1.8,
    meanElevationM: 123.5,
    notes: 'Levantamiento fotogramétrico mensual ordinario Junio',
  },
  {
    id: 2,
    zoneId: 1,
    status: 'archived',
    surveyDate: '2026-07-16',
    flightCode: 'VUE-101-JUL',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 160.0,
    fillVolumeM3: 35800.0,
    netVolumeM3: 35640.0,
    tonnageEst: 59875.2,
    pointCount: 335000,
    groundResolutionCm: 1.8,
    meanElevationM: 124.8,
    notes: 'Control estival tras campaña de trituración Julio',
  },
  {
    id: 3,
    zoneId: 1,
    status: 'archived',
    surveyDate: '2026-08-18',
    flightCode: 'VUE-102-AGO',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 95.0,
    fillVolumeM3: 39400.0,
    netVolumeM3: 39305.0,
    tonnageEst: 66032.4,
    pointCount: 350000,
    groundResolutionCm: 1.7,
    meanElevationM: 125.6,
    notes: 'Incremento acopio por mantenimiento planta Agosto',
  },
  {
    id: 4,
    zoneId: 1,
    status: 'archived',
    surveyDate: '2026-09-17',
    flightCode: 'VUE-103-SEP',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 210.0,
    fillVolumeM3: 42100.0,
    netVolumeM3: 41890.0,
    tonnageEst: 70375.2,
    pointCount: 360000,
    groundResolutionCm: 1.8,
    meanElevationM: 126.2,
    notes: 'Campaña Septiembre - Pico de acopio',
  },
  {
    id: 5,
    zoneId: 1,
    status: 'archived',
    surveyDate: '2026-10-15',
    flightCode: 'VUE-104-OCT',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 450.0,
    fillVolumeM3: 45600.0,
    netVolumeM3: 45150.0,
    tonnageEst: 75852.0,
    pointCount: 375000,
    groundResolutionCm: 1.7,
    meanElevationM: 127.1,
    notes: 'Control Octubre - Despacho continuo de árido',
  },
  {
    id: 6,
    zoneId: 1,
    status: 'active',
    surveyDate: '2026-11-15',
    flightCode: 'VUE-105-NOV',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 320.0,
    fillVolumeM3: 48900.0,
    netVolumeM3: 48580.0,
    tonnageEst: 81614.4,
    pointCount: 388000,
    groundResolutionCm: 1.6,
    meanElevationM: 128.0,
    notes: 'Misión Ordinaria Noviembre - Vuelo actual de referencia',
  },

  // Zone 2 flights
  {
    id: 7,
    zoneId: 2,
    status: 'archived',
    surveyDate: '2026-06-15',
    flightCode: 'EXT-01-JUN',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 15400.0,
    fillVolumeM3: 200.0,
    netVolumeM3: -15200.0,
    tonnageEst: 40280.0,
    pointCount: 290000,
    groundResolutionCm: 1.8,
    meanElevationM: 92.4,
    notes: 'Inicio banqueo banco 3 frente norte',
  },
  {
    id: 8,
    zoneId: 2,
    status: 'archived',
    surveyDate: '2026-07-16',
    flightCode: 'EXT-02-JUL',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 18900.0,
    fillVolumeM3: 150.0,
    netVolumeM3: -18750.0,
    tonnageEst: 49687.5,
    pointCount: 310000,
    groundResolutionCm: 1.8,
    meanElevationM: 91.8,
    notes: 'Extracción regular mes de Julio',
  },
  {
    id: 9,
    zoneId: 2,
    status: 'archived',
    surveyDate: '2026-08-18',
    flightCode: 'EXT-03-AGO',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 22400.0,
    fillVolumeM3: 110.0,
    netVolumeM3: -22290.0,
    tonnageEst: 59068.5,
    pointCount: 325000,
    groundResolutionCm: 1.7,
    meanElevationM: 91.1,
    notes: 'Avance frente con voladura controlada',
  },
  {
    id: 10,
    zoneId: 2,
    status: 'archived',
    surveyDate: '2026-09-17',
    flightCode: 'EXT-04-SEP',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 26100.0,
    fillVolumeM3: 180.0,
    netVolumeM3: -25920.0,
    tonnageEst: 68688.0,
    pointCount: 340000,
    groundResolutionCm: 1.7,
    meanElevationM: 90.5,
    notes: 'Profundización de banco escalonado',
  },
  {
    id: 11,
    zoneId: 2,
    status: 'active',
    surveyDate: '2026-10-15',
    flightCode: 'EXT-05-OCT',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 29800.0,
    fillVolumeM3: 220.0,
    netVolumeM3: -29580.0,
    tonnageEst: 78387.0,
    pointCount: 355000,
    groundResolutionCm: 1.8,
    meanElevationM: 89.9,
    notes: 'Control Octubre - Desmonte consolidado',
  },

  // Zone 3 flights
  {
    id: 12,
    zoneId: 3,
    status: 'archived',
    surveyDate: '2026-06-15',
    flightCode: 'ZAH-01-JUN',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 80.0,
    fillVolumeM3: 16500.0,
    netVolumeM3: 16420.0,
    tonnageEst: 28242.4,
    pointCount: 220000,
    groundResolutionCm: 1.9,
    meanElevationM: 118.2,
    notes: 'Acopio inicial zahorra clasificada',
  },
  {
    id: 13,
    zoneId: 3,
    status: 'archived',
    surveyDate: '2026-07-16',
    flightCode: 'ZAH-02-JUL',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 110.0,
    fillVolumeM3: 18900.0,
    netVolumeM3: 18790.0,
    tonnageEst: 32318.8,
    pointCount: 235000,
    groundResolutionCm: 1.8,
    meanElevationM: 118.7,
    notes: 'Incremento acopio zahorra',
  },
  {
    id: 14,
    zoneId: 3,
    status: 'archived',
    surveyDate: '2026-08-18',
    flightCode: 'ZAH-03-AGO',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 90.0,
    fillVolumeM3: 21300.0,
    netVolumeM3: 21210.0,
    tonnageEst: 36481.2,
    pointCount: 245000,
    groundResolutionCm: 1.8,
    meanElevationM: 119.3,
    notes: 'Medición bimensual zahorra',
  },
  {
    id: 15,
    zoneId: 3,
    status: 'archived',
    surveyDate: '2026-09-17',
    flightCode: 'ZAH-04-SEP',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 130.0,
    fillVolumeM3: 23400.0,
    netVolumeM3: 23270.0,
    tonnageEst: 40024.4,
    pointCount: 255000,
    groundResolutionCm: 1.7,
    meanElevationM: 119.8,
    notes: 'Control estacional de acopio',
  },
  {
    id: 16,
    zoneId: 3,
    status: 'archived',
    surveyDate: '2026-10-15',
    flightCode: 'ZAH-05-OCT',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 170.0,
    fillVolumeM3: 25800.0,
    netVolumeM3: 25630.0,
    tonnageEst: 44083.6,
    pointCount: 270000,
    groundResolutionCm: 1.7,
    meanElevationM: 120.4,
    notes: 'Campaña Octubre acopio zahorra',
  },
  {
    id: 17,
    zoneId: 3,
    status: 'active',
    surveyDate: '2026-11-15',
    flightCode: 'ZAH-06-NOV',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 150.0,
    fillVolumeM3: 27900.0,
    netVolumeM3: 27750.0,
    tonnageEst: 47730.0,
    pointCount: 285000,
    groundResolutionCm: 1.6,
    meanElevationM: 120.9,
    notes: 'Vuelo Noviembre zahorra consolidada',
  },

  // Pending flight (processing / awaiting validation)
  {
    id: 18,
    zoneId: 1,
    status: 'pending',
    surveyDate: '2026-11-20',
    flightCode: 'VUE-106-NOV-PEND',
    droneModel: 'DJI Matrice 350 RTK / Zenmuse P1',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 280.0,
    fillVolumeM3: 50400.0,
    netVolumeM3: 50120.0,
    tonnageEst: 84672.0,
    pointCount: 395000,
    groundResolutionCm: 1.5,
    meanElevationM: 128.8,
    notes: 'Misión Reciente - Pendiente de validación de puntos de apoyo GNSS',
  },

  // Zone 4 flights (Quarry 3 - Hormigones y Gravas Madrid S.L.)
  {
    id: 19,
    zoneId: 4,
    status: 'archived',
    surveyDate: '2026-10-12',
    flightCode: 'JAR-201-OCT',
    droneModel: 'DJI Matrice 4E RTK',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 90.0,
    fillVolumeM3: 22400.0,
    netVolumeM3: 22310.0,
    tonnageEst: 34580.5,
    pointCount: 275000,
    groundResolutionCm: 1.7,
    meanElevationM: 586.4,
    notes: 'Control mensual Octubre - Gravilla lavada 4/8mm',
  },
  {
    id: 20,
    zoneId: 4,
    status: 'active',
    surveyDate: '2026-11-14',
    flightCode: 'JAR-202-NOV',
    droneModel: 'DJI Matrice 4E RTK',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 75.0,
    fillVolumeM3: 26100.0,
    netVolumeM3: 26025.0,
    tonnageEst: 40338.8,
    pointCount: 298000,
    groundResolutionCm: 1.5,
    meanElevationM: 587.9,
    notes: 'Vuelo Noviembre - Acopio consolidado para planta de hormigón',
  },

  // Zone 5 flights (Quarry 3 - Vaso de Extracción Gravera)
  {
    id: 21,
    zoneId: 5,
    status: 'active',
    surveyDate: '2026-11-14',
    flightCode: 'JAR-EXT-02',
    droneModel: 'DJI Matrice 4E RTK',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 19400.0,
    fillVolumeM3: 180.0,
    netVolumeM3: -19220.0,
    tonnageEst: 34596.0,
    pointCount: 312000,
    groundResolutionCm: 1.6,
    meanElevationM: 561.2,
    notes: 'Control de excavación en vaso Fase II',
  },

  // Zone 6 flights (Quarry 2 - Explotación Las Cumbres)
  {
    id: 22,
    zoneId: 6,
    status: 'active',
    surveyDate: '2026-11-15',
    flightCode: 'CUMB-101-NOV',
    droneModel: 'DJI Matrice 4E RTK',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 110.0,
    fillVolumeM3: 19800.0,
    netVolumeM3: 19690.0,
    tonnageEst: 34457.5,
    pointCount: 245000,
    groundResolutionCm: 1.7,
    meanElevationM: 145.3,
    notes: 'Acopio subbase caliza 0/40mm',
  },

  // Zone 7 flights (Quarry 4 - Minería y Áridos del Levante S.A.)
  {
    id: 23,
    zoneId: 7,
    status: 'active',
    surveyDate: '2026-11-16',
    flightCode: 'LEV-301-NOV',
    droneModel: 'DJI Matrice 4E RTK',
    operator: 'Topógrafo Colegiado INGEODRON',
    cutVolumeM3: 140.0,
    fillVolumeM3: 33400.0,
    netVolumeM3: 33260.0,
    tonnageEst: 57872.4,
    pointCount: 290000,
    groundResolutionCm: 1.6,
    meanElevationM: 251.4,
    notes: 'Control volumétrico Noviembre - Dolomía clasificada Sierra del Levante',
  },
];

// Initial deliverables
const INITIAL_DELIVERABLES: Deliverable[] = [
  {
    id: 1,
    quarryId: 1,
    surveyId: 6,
    title: 'Ortomosaico de Alta Resolución RGB (GeoTIFF)',
    category: 'orthophoto',
    fileUrl: '/deliverables/Orto_Valdelobos_Nov2026.tif',
    fileName: 'Orto_Valdelobos_Nov2026_1cm.tif',
    fileSize: '480 MB',
    crs: 'ETRS89 UTM 30N (EPSG:25830)',
    uploadDate: '2026-11-15',
  },
  {
    id: 2,
    quarryId: 1,
    surveyId: 6,
    title: 'Curvas de Nivel Equidistancia 0.50m (DXF/DWG)',
    category: 'contour_dxf',
    fileUrl: '/deliverables/Curvas_050m_Valdelobos.dxf',
    fileName: 'Curvas_050m_Valdelobos.dxf',
    fileSize: '18.4 MB',
    crs: 'ETRS89 UTM 30N (EPSG:25830)',
    uploadDate: '2026-11-15',
  },
  {
    id: 3,
    quarryId: 1,
    surveyId: 6,
    title: 'Nube de Puntos Clasificada LiDAR (LAS / LAZ)',
    category: 'pointcloud_las',
    fileUrl: '/deliverables/PointCloud_Clasificada_RTK.laz',
    fileName: 'PointCloud_Clasificada_RTK.laz',
    fileSize: '1.2 GB',
    crs: 'ETRS89 UTM 30N (EPSG:25830)',
    uploadDate: '2026-11-15',
  },
  {
    id: 4,
    quarryId: 1,
    surveyId: 6,
    title: 'Informe Técnico Colegiado de Cubicación (PDF)',
    category: 'pdf_report',
    fileUrl: '/deliverables/Informe_Oficial_Cubicacion_Nov2026.pdf',
    fileName: 'Informe_Oficial_Cubicacion_Nov2026.pdf',
    fileSize: '4.8 MB',
    crs: 'ETRS89 UTM 30N',
    uploadDate: '2026-11-15',
  },
  {
    id: 5,
    quarryId: 1,
    surveyId: 6,
    title: 'Malla Tridimensional Texturizada TIN (OBJ)',
    category: 'mesh_obj',
    fileUrl: '/deliverables/Malla_3D_Valdelobos.obj',
    fileName: 'Malla_3D_Valdelobos.obj',
    fileSize: '95 MB',
    crs: 'ETRS89 UTM 30N',
    uploadDate: '2026-11-15',
  },
  {
    id: 6,
    quarryId: 2,
    surveyId: 22,
    title: 'Informe Técnico de Cubicación Las Cumbres (PDF)',
    category: 'pdf_report',
    fileUrl: '/deliverables/Informe_Las_Cumbres_Nov2026.pdf',
    fileName: 'Informe_Las_Cumbres_Nov2026.pdf',
    fileSize: '3.6 MB',
    crs: 'ETRS89 UTM 30N',
    uploadDate: '2026-11-15',
  },
  {
    id: 7,
    quarryId: 3,
    surveyId: 20,
    title: 'Ortomosaico Gravera Jarama Norte (GeoTIFF)',
    category: 'orthophoto',
    fileUrl: '/deliverables/Orto_Jarama_Norte_Nov2026.tif',
    fileName: 'Orto_Jarama_Norte_Nov2026.tif',
    fileSize: '390 MB',
    crs: 'ETRS89 UTM 30N (EPSG:25830)',
    uploadDate: '2026-11-14',
  },
  {
    id: 8,
    quarryId: 3,
    surveyId: 20,
    title: 'Informe Volumétrico Jarama Norte (PDF)',
    category: 'pdf_report',
    fileUrl: '/deliverables/Informe_Jarama_Norte_Nov2026.pdf',
    fileName: 'Informe_Jarama_Norte_Nov2026.pdf',
    fileSize: '4.1 MB',
    crs: 'ETRS89 UTM 30N',
    uploadDate: '2026-11-14',
  },
  {
    id: 9,
    quarryId: 4,
    surveyId: 23,
    title: 'Informe Volumétrico Sierra del Levante (PDF)',
    category: 'pdf_report',
    fileUrl: '/deliverables/Informe_Levante_Nov2026.pdf',
    fileName: 'Informe_Levante_Nov2026.pdf',
    fileSize: '3.9 MB',
    crs: 'ETRS89 UTM 30N',
    uploadDate: '2026-11-16',
  },
];

// Deterministic realistic footprint area (m²) based on measured volume (~6.2m average pile/bench height)
export function estimateStockpileAreaM2(fillVolumeM3: number, cutVolumeM3: number): number {
  const primaryVol = Math.max(Math.abs(fillVolumeM3 || 0), Math.abs(cutVolumeM3 || 0));
  if (primaryVol <= 0) return 0;
  return Math.max(25, Math.round(primaryVol / 6.2));
}

// Build initial stockpiles (1 or several per flight; totals match parent Survey)
function buildInitialStockpiles(): Stockpile[] {
  const list: Stockpile[] = [];
  let nextId = 1;

  for (const s of INITIAL_SURVEYS) {
    const z = INITIAL_ZONES.find((item) => item.id === s.zoneId);
    const dens = z?.densityTonM3 || 1.68;
    const mat = z?.targetMaterial || 'Árido clasificado';
    const baseZ = z?.baseElevationM ?? 115.0;
    const type = z?.zoneType || 'stockpile';

    if (s.id === 6) {
      // VUE-105-NOV: 2 acopios
      list.push(
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Pila Grava 12/20mm Sector Norte',
          code: 'ACO-105-A',
          stockpileType: type,
          material: mat,
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 31200,
          cutVolumeM3: 200,
          netVolumeM3: 31000,
          tonnageEst: 52080.0,
          notes: 'Acopio principal listo para despacho',
        },
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Pila Grava 12/20mm Sector Sur',
          code: 'ACO-105-B',
          stockpileType: type,
          material: 'Zahorra Caliza 0/20',
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 17700,
          cutVolumeM3: 120,
          netVolumeM3: 17580,
          tonnageEst: 29534.4,
          notes: 'Reserva secundaria de planta',
        }
      );
    } else if (s.id === 5) {
      // VUE-104-OCT: 2 acopios
      list.push(
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Pila Grava 12/20mm Sector Norte',
          code: 'ACO-104-A',
          stockpileType: type,
          material: mat,
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 30000,
          cutVolumeM3: 250,
          netVolumeM3: 29750,
          tonnageEst: 49980.0,
        },
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Pila Grava 12/20mm Sector Sur',
          code: 'ACO-104-B',
          stockpileType: type,
          material: 'Zahorra Caliza 0/20',
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 15600,
          cutVolumeM3: 200,
          netVolumeM3: 15400,
          tonnageEst: 25872.0,
        }
      );
    } else if (s.id === 20) {
      // JAR-202-NOV: 2 acopios
      list.push(
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Pila Gravilla Lavada 4/8mm - Este',
          code: 'JAR-AC-202A',
          stockpileType: type,
          material: mat,
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 16100,
          cutVolumeM3: 45,
          netVolumeM3: 16055,
          tonnageEst: 24885.3,
        },
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Pila Arena Silícea 0/4mm - Oeste',
          code: 'JAR-AC-202B',
          stockpileType: type,
          material: 'Arena silícea 0/4',
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 10000,
          cutVolumeM3: 30,
          netVolumeM3: 9970,
          tonnageEst: 15453.5,
        }
      );
    } else if (s.id === 23) {
      // LEV-301-NOV: 2 acopios
      list.push(
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Acopio Dolomía 0/20mm Principal',
          code: 'LEV-AC-301A',
          stockpileType: type,
          material: mat,
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 21400,
          cutVolumeM3: 90,
          netVolumeM3: 21310,
          tonnageEst: 37079.4,
        },
        {
          id: nextId++,
          surveyId: s.id,
          name: 'Acopio Dolomía Gruesa 20/40mm',
          code: 'LEV-AC-301B',
          stockpileType: type,
          material: 'Dolomía 20/40',
          densityTonM3: dens,
          baseElevationM: baseZ,
          fillVolumeM3: 12000,
          cutVolumeM3: 50,
          netVolumeM3: 11950,
          tonnageEst: 20793.0,
        }
      );
    } else {
      list.push({
        id: nextId++,
        surveyId: s.id,
        name: z ? `Acopio ${z.name}` : `Acopio Vuelo ${s.flightCode}`,
        code: `ACO-${s.id}-01`,
        stockpileType: type,
        material: mat,
        densityTonM3: dens,
        baseElevationM: baseZ,
        fillVolumeM3: s.fillVolumeM3,
        cutVolumeM3: s.cutVolumeM3,
        netVolumeM3: s.netVolumeM3,
        tonnageEst: s.tonnageEst,
        notes: s.notes,
      });
    }
  }

      return list.map((st) => ({
        ...st,
        areaM2: st.areaM2 ?? estimateStockpileAreaM2(st.fillVolumeM3, st.cutVolumeM3),
      }));
}

const INITIAL_STOCKPILES: Stockpile[] = buildInitialStockpiles();

// Helper to safely read from localStorage
function readStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

// Helper to safely write to localStorage
function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[LocalStore] Could not persist key "${key}":`, e);
  }
}

/**
 * 100% Client-side Data Store (JavaScript + HTML5 LocalStorage).
 * Runs without requiring any external backend API, preserving full offline capability.
 */
class LocalDataStore {
  // CLIENTS
  getClients(): Client[] {
    const defaultCodesById: Record<number, string> = {
      1: 'C101',
      2: 'C110',
      3: 'C120',
    };
    return readStorage<Client[]>(STORAGE_KEY_CLIENTS, INITIAL_CLIENTS).map((c) => ({
      ...c,
      code: (c.code || defaultCodesById[c.id] || `C${100 + c.id}`).trim(),
    }));
  }

  createClient(data: Partial<Client>): Client {
    const clients = this.getClients();
    const newId = clients.length > 0 ? Math.max(...clients.map((c) => c.id)) + 1 : 1;
    const client: Client = {
      id: newId,
      code: (data.code || `C${100 + newId}`).trim(),
      name: data.name || 'Nuevo Cliente',
      cif: data.cif || 'B-00000000',
      contactName: data.contactName || 'Responsable Técnico',
      contactEmail: data.contactEmail || 'contacto@cantera.es',
      phone: data.phone || '',
      notes: data.notes || '',
      logoUrl: data.logoUrl,
      viewer3dEnabled: data.viewer3dEnabled ?? false,
      createdAt: new Date().toISOString(),
    };
    clients.push(client);
    writeStorage(STORAGE_KEY_CLIENTS, clients);
    return client;
  }

  updateClient(id: number, data: Partial<Client>): Client | null {
    const clients = this.getClients();
    const idx = clients.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    clients[idx] = { ...clients[idx], ...data };
    writeStorage(STORAGE_KEY_CLIENTS, clients);
    return clients[idx];
  }

  deleteClient(id: number): void {
    // Cascade-delete all quarries owned exclusively by this client (and their zones/surveys/deliverables)
    const ownedQuarries = this.getQuarries().filter((q) => q.clientId === id);
    ownedQuarries.forEach((q) => this.deleteQuarry(q.id));

    // Remove client portal users linked exclusively to this client
    const remainingUsers = this.getUsers().filter((u) => !(u.role !== 'admin' && u.clientId === id));
    writeStorage(STORAGE_KEY_USERS, remainingUsers);

    const clients = this.getClients().filter((c) => c.id !== id);
    writeStorage(STORAGE_KEY_CLIENTS, clients);
  }

  // QUARRIES (Relationship: 1 Client -> N Quarries; 1 Quarry -> 1 unique Client)
  getQuarries(): Quarry[] {
    return readStorage<Quarry[]>(STORAGE_KEY_QUARRIES, INITIAL_QUARRIES);
  }

  getQuarriesByClient(clientId: number): Quarry[] {
    return this.getQuarries().filter((q) => q.clientId === clientId);
  }

  createQuarry(data: Partial<Quarry>): Quarry {
    const clients = this.getClients();
    const ownerClientId = Number(data.clientId);
    if (!ownerClientId || !clients.some((c) => c.id === ownerClientId)) {
      throw new Error('Cada explotación debe pertenecer obligatoriamente a un único cliente válido.');
    }

    const quarries = this.getQuarries();
    const newId = quarries.length > 0 ? Math.max(...quarries.map((q) => q.id)) + 1 : 1;
    const quarry: Quarry = {
      id: newId,
      clientId: ownerClientId,
      name: data.name || 'Nueva Explotación',
      code: data.code || `CAN-${newId}`,
      location: data.location || 'España',
      coordinates: data.coordinates || '37.0, -5.0',
      materialType: data.materialType || 'Árido clasificado',
      status: data.status || 'active',
      areaM2: data.areaM2 || 50000,
      createdAt: new Date().toISOString(),
    };
    quarries.push(quarry);
    writeStorage(STORAGE_KEY_QUARRIES, quarries);
    return quarry;
  }

  updateQuarry(id: number, data: Partial<Quarry>): Quarry | null {
    const quarries = this.getQuarries();
    const idx = quarries.findIndex((q) => q.id === id);
    if (idx === -1) return null;

    let nextClientId = quarries[idx].clientId;
    if (data.clientId !== undefined) {
      const candidateClientId = Number(data.clientId);
      const clients = this.getClients();
      if (!candidateClientId || !clients.some((c) => c.id === candidateClientId)) {
        throw new Error('Cada explotación debe tener asignado un único cliente propietario válido.');
      }
      nextClientId = candidateClientId;
    }

    quarries[idx] = { ...quarries[idx], ...data, clientId: nextClientId };
    writeStorage(STORAGE_KEY_QUARRIES, quarries);
    return quarries[idx];
  }

  deleteQuarry(id: number): void {
    const quarryZones = this.getZones().filter((z) => z.quarryId === id);
    quarryZones.forEach((z) => this.deleteZone(z.id));

    const remainingDeliverables = this.getDeliverables().filter((d) => d.quarryId !== id);
    writeStorage(STORAGE_KEY_DELIVERABLES, remainingDeliverables);

    const quarries = this.getQuarries().filter((q) => q.id !== id);
    writeStorage(STORAGE_KEY_QUARRIES, quarries);
  }

  // ZONES (Relationship: 1 Quarry -> 1..N Zones; 1 Zone -> 1 unique Quarry)
  getZones(): Zone[] {
    return readStorage<Zone[]>(STORAGE_KEY_ZONES, INITIAL_ZONES);
  }

  getZonesByQuarry(quarryId: number): Zone[] {
    return this.getZones().filter((z) => z.quarryId === quarryId);
  }

  createZone(data: Partial<Zone>): Zone {
    const quarries = this.getQuarries();
    const ownerQuarryId = Number(data.quarryId);
    if (!ownerQuarryId || !quarries.some((q) => q.id === ownerQuarryId)) {
      throw new Error('Cada zona debe pertenecer obligatoriamente a una única explotación válida.');
    }

    const zones = this.getZones();
    const newId = zones.length > 0 ? Math.max(...zones.map((z) => z.id)) + 1 : 1;
    const zone: Zone = {
      id: newId,
      quarryId: ownerQuarryId,
      name: data.name || 'Nueva Zona',
      code: data.code || `ZON-${newId}`,
      zoneType: data.zoneType || 'stockpile',
      targetMaterial: data.targetMaterial || 'Grava 20/40',
      densityTonM3: data.densityTonM3 || 1.68,
      baseElevationM: data.baseElevationM ?? 115.0,
      status: data.status || 'active',
      createdAt: new Date().toISOString(),
    };
    zones.push(zone);
    writeStorage(STORAGE_KEY_ZONES, zones);
    return zone;
  }

  updateZone(id: number, data: Partial<Zone>): Zone | null {
    const zones = this.getZones();
    const idx = zones.findIndex((z) => z.id === id);
    if (idx === -1) return null;

    let nextQuarryId = zones[idx].quarryId;
    if (data.quarryId !== undefined) {
      const candidateQuarryId = Number(data.quarryId);
      const quarries = this.getQuarries();
      if (!candidateQuarryId || !quarries.some((q) => q.id === candidateQuarryId)) {
        throw new Error('Cada zona debe tener asignada una única explotación válida.');
      }
      nextQuarryId = candidateQuarryId;
    }

    const prevDensity = zones[idx].densityTonM3 || 1.68;
    zones[idx] = { ...zones[idx], ...data, quarryId: nextQuarryId };
    writeStorage(STORAGE_KEY_ZONES, zones);

    const nextDensity = zones[idx].densityTonM3 || 1.68;
    if (data.densityTonM3 !== undefined && Math.abs(nextDensity - prevDensity) > 0.0001) {
      const zoneSurveyIds = new Set(
        this.getSurveys()
          .filter((s) => s.zoneId === id)
          .map((s) => s.id)
      );
      if (zoneSurveyIds.size > 0) {
        const stockpiles = this.getStockpiles();
        let changed = false;
        const updatedStockpiles = stockpiles.map((st) => {
          if (!zoneSurveyIds.has(st.surveyId)) return st;
          changed = true;
          return {
            ...st,
            densityTonM3: nextDensity,
            tonnageEst: Math.round(Math.abs(st.netVolumeM3) * nextDensity * 10) / 10,
          };
        });
        if (changed) {
          writeStorage(STORAGE_KEY_STOCKPILES, updatedStockpiles);
          zoneSurveyIds.forEach((sId) => this.syncSurveyTotalsFromStockpiles(sId));
        }
      }
    }

    return zones[idx];
  }

  /**
   * Updates zone properties (including material density t/m3) and recalculates
   * tonnage across its surveys and stockpiles.
   */
  updateZoneAndRecalculate(
    zoneId: number,
    data: Partial<Zone>,
    fillVolumeM3?: number,
    cutVolumeM3?: number
  ): Zone | null {
    const updatedZone = this.updateZone(zoneId, data);
    if (!updatedZone) return null;

    const density = updatedZone.densityTonM3 || 1.68;
    const surveys = this.getSurveys();
    const zoneSurveys = surveys.filter((s) => s.zoneId === zoneId);

    if (zoneSurveys.length === 0 && (fillVolumeM3 !== undefined || cutVolumeM3 !== undefined)) {
      const fill = fillVolumeM3 ?? 0;
      const cut = cutVolumeM3 ?? 0;
      const net = fill - cut;
      this.createSurvey({
        zoneId,
        surveyDate: new Date().toISOString().slice(0, 10),
        flightCode: `VUE-${Date.now().toString().slice(-4)}`,
        cutVolumeM3: cut,
        fillVolumeM3: fill,
        netVolumeM3: net,
        tonnageEst: Math.round(Math.abs(net) * density * 10) / 10,
      });
      return updatedZone;
    }

    const targetSurvey =
      zoneSurveys.find((s) => s.status === 'active') ||
      zoneSurveys[zoneSurveys.length - 1];

    if (targetSurvey && (fillVolumeM3 !== undefined || cutVolumeM3 !== undefined)) {
      const targetStockpiles = this.getStockpilesBySurvey(targetSurvey.id);
      if (targetStockpiles.length === 1) {
        this.updateStockpile(targetStockpiles[0].id, {
          fillVolumeM3: fillVolumeM3 ?? targetStockpiles[0].fillVolumeM3,
          cutVolumeM3: cutVolumeM3 ?? targetStockpiles[0].cutVolumeM3,
          densityTonM3: density,
        });
      } else {
        this.syncSurveyTotalsFromStockpiles(targetSurvey.id);
      }
    }

    return updatedZone;
  }

  deleteZone(id: number): { deletedSurveysCount: number; deletedStockpilesCount: number } {
    const zoneSurveys = this.getSurveys().filter((s) => s.zoneId === id);
    const zoneSurveyIds = new Set(zoneSurveys.map((s) => s.id));
    const deletedStockpilesCount = this.getStockpiles().filter((st) =>
      zoneSurveyIds.has(st.surveyId)
    ).length;

    zoneSurveys.forEach((s) => this.deleteSurvey(s.id));

    const zones = this.getZones().filter((z) => z.id !== id);
    writeStorage(STORAGE_KEY_ZONES, zones);

    return {
      deletedSurveysCount: zoneSurveys.length,
      deletedStockpilesCount,
    };
  }

  // SURVEYS (VUELOS - Relationship: 1 Zone -> 0..N Surveys; 1 Survey -> 1 unique Zone)
  getSurveys(): Survey[] {
    const raw = readStorage<Survey[]>(STORAGE_KEY_SURVEYS, INITIAL_SURVEYS);
    let updated = false;
    const sanitized = raw.map((s) => {
      if (!s.status) {
        updated = true;
        const fallbackStatus: SurveyStatus =
          s.id === 6 || s.id === 11 || s.id === 17
            ? 'active'
            : s.id === 18
            ? 'pending'
            : 'archived';
        return { ...s, status: fallbackStatus };
      }
      return s;
    });
    if (updated) {
      writeStorage(STORAGE_KEY_SURVEYS, sanitized);
    }
    return sanitized;
  }

  getSurveysByZone(zoneId: number): Survey[] {
    return this.getSurveys().filter((s) => s.zoneId === zoneId);
  }

  createSurvey(
    data: Partial<Survey>,
    initialStockpiles?: Partial<Stockpile>[]
  ): Survey {
    const zones = this.getZones();
    const ownerZoneId = Number(data.zoneId);
    const zone = zones.find((z) => z.id === ownerZoneId);
    if (!ownerZoneId || !zone) {
      throw new Error('Cada vuelo debe pertenecer obligatoriamente a una única zona válida.');
    }

    const surveys = this.getSurveys();
    const newId = surveys.length > 0 ? Math.max(...surveys.map((s) => s.id)) + 1 : 1;
    const density = zone.densityTonM3 || 1.68;
    const fillVol = data.fillVolumeM3 ?? 25000;
    const cutVol = data.cutVolumeM3 ?? 0;
    const netVol = data.netVolumeM3 ?? fillVol - cutVol;

    const survey: Survey = {
      id: newId,
      zoneId: ownerZoneId,
      status: (data.status as SurveyStatus) || 'active',
      surveyDate: data.surveyDate || new Date().toISOString().slice(0, 10),
      flightCode:
        data.flightCode ||
        `VUE-${newId}-${new Date().toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}`,
      droneModel: data.droneModel || 'DJI Matrice 350 RTK / Zenmuse P1',
      operator: data.operator || 'Topógrafo Colegiado INGEODRON',
      cutVolumeM3: cutVol,
      fillVolumeM3: fillVol,
      netVolumeM3: netVol,
      tonnageEst: data.tonnageEst ?? Math.round(Math.abs(netVol) * density * 10) / 10,
      pointCount: data.pointCount || 320000,
      groundResolutionCm: data.groundResolutionCm || 1.8,
      meanElevationM: data.meanElevationM || 120.0,
      notes: data.notes || 'Levantamiento fotogramétrico procesado en cliente',
      createdAt: new Date().toISOString(),
    };
    surveys.push(survey);
    writeStorage(STORAGE_KEY_SURVEYS, surveys);

    // Enforce: every flight has 1 or several stockpiles (Acopios)
    const stockpilesToSeed =
      initialStockpiles && initialStockpiles.length > 0
        ? initialStockpiles
        : [
            {
              name: `Acopio ${zone.name}`,
              code: `ACO-${survey.id}-01`,
              stockpileType: zone.zoneType || 'stockpile',
              material: zone.targetMaterial,
              densityTonM3: density,
              baseElevationM: zone.baseElevationM ?? 115.0,
              fillVolumeM3: fillVol,
              cutVolumeM3: cutVol,
              notes: survey.notes,
            },
          ];

    const existingStockpiles = this.getStockpiles();
    let nextStockpileId =
      existingStockpiles.length > 0
        ? Math.max(...existingStockpiles.map((st) => st.id)) + 1
        : 1;

    stockpilesToSeed.forEach((st, idx) => {
      const stDens = Math.max(0.1, Number(st.densityTonM3 ?? density) || 1.68);
      const stFill = Number(st.fillVolumeM3 ?? 0);
      const stCut = Number(st.cutVolumeM3 ?? 0);
      const stNet = stFill - stCut;
      existingStockpiles.push({
        id: nextStockpileId++,
        surveyId: survey.id,
        name: st.name || `Acopio #${idx + 1} (${survey.flightCode})`,
        code: st.code || `ACO-${survey.id}-${String(idx + 1).padStart(2, '0')}`,
        stockpileType: st.stockpileType || zone.zoneType || 'stockpile',
        material: st.material || zone.targetMaterial,
        densityTonM3: stDens,
        baseElevationM: Number(st.baseElevationM ?? zone.baseElevationM ?? 115.0),
        areaM2:
          st.areaM2 !== undefined
            ? Math.max(0, Math.round(Number(st.areaM2) || 0))
            : estimateStockpileAreaM2(stFill, stCut),
        fillVolumeM3: stFill,
        cutVolumeM3: stCut,
        netVolumeM3: stNet,
        tonnageEst: Math.round(Math.abs(stNet) * stDens * 10) / 10,
        notes: st.notes,
        createdAt: new Date().toISOString(),
      });
    });

    writeStorage(STORAGE_KEY_STOCKPILES, existingStockpiles);
    return this.syncSurveyTotalsFromStockpiles(survey.id) || survey;
  }

  updateSurvey(id: number, data: Partial<Survey>): Survey | null {
    const surveys = this.getSurveys();
    const idx = surveys.findIndex((s) => s.id === id);
    if (idx === -1) return null;

    const current = surveys[idx];
    let nextZoneId = current.zoneId;
    if (data.zoneId !== undefined) {
      const candidateZoneId = Number(data.zoneId);
      const zoneExists = this.getZones().some((z) => z.id === candidateZoneId);
      if (!candidateZoneId || !zoneExists) {
        throw new Error('Cada vuelo debe pertenecer a una única zona válida.');
      }
      nextZoneId = candidateZoneId;
    }

    const zone = this.getZones().find((z) => z.id === nextZoneId);
    const density = zone?.densityTonM3 || 1.68;

    const nextFill = data.fillVolumeM3 !== undefined ? Number(data.fillVolumeM3) : current.fillVolumeM3;
    const nextCut = data.cutVolumeM3 !== undefined ? Number(data.cutVolumeM3) : current.cutVolumeM3;
    const nextNet = data.netVolumeM3 !== undefined ? Number(data.netVolumeM3) : nextFill - nextCut;
    const nextTonnage =
      data.tonnageEst !== undefined
        ? Number(data.tonnageEst)
        : Math.round(Math.abs(nextNet) * density * 10) / 10;

    surveys[idx] = {
      ...current,
      ...data,
      zoneId: nextZoneId,
      fillVolumeM3: nextFill,
      cutVolumeM3: nextCut,
      netVolumeM3: nextNet,
      tonnageEst: nextTonnage,
    };
    writeStorage(STORAGE_KEY_SURVEYS, surveys);

    // Keep child stockpile / survey totals strictly consistent
    const flightStockpiles = this.getStockpilesBySurvey(id);
    if (flightStockpiles.length === 1 && (data.fillVolumeM3 !== undefined || data.cutVolumeM3 !== undefined)) {
      this.updateStockpile(flightStockpiles[0].id, {
        fillVolumeM3: nextFill,
        cutVolumeM3: nextCut,
      });
    } else if (flightStockpiles.length > 0) {
      this.syncSurveyTotalsFromStockpiles(id);
    }

    return this.getSurveys().find((s) => s.id === id) || surveys[idx];
  }

  updateSurveyStatus(id: number, status: SurveyStatus): Survey | null {
    const surveys = this.getSurveys();
    const idx = surveys.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    surveys[idx] = { ...surveys[idx], status };
    writeStorage(STORAGE_KEY_SURVEYS, surveys);
    return surveys[idx];
  }

  deleteSurvey(id: number): void {
    const remainingStockpiles = this.getStockpiles().filter((st) => st.surveyId !== id);
    writeStorage(STORAGE_KEY_STOCKPILES, remainingStockpiles);

    const remainingDeliverables = this.getDeliverables().filter((d) => d.surveyId !== id);
    writeStorage(STORAGE_KEY_DELIVERABLES, remainingDeliverables);

    const surveys = this.getSurveys().filter((s) => s.id !== id);
    writeStorage(STORAGE_KEY_SURVEYS, surveys);
  }

  // STOCKPILES (ACOPIOS - Relationship: 1 Survey/Vuelo -> 1..N Stockpiles; 1 Stockpile -> 1 unique Survey)
  getStockpiles(): Stockpile[] {
    const stored = readStorage<Stockpile[] | null>(STORAGE_KEY_STOCKPILES, null);
    const list: Stockpile[] = stored ? [...stored] : [...INITIAL_STOCKPILES];

    // Ensure every existing Survey has at least 1 Stockpile (migration safety)
    const surveys = this.getSurveys();
    const zones = this.getZones();
    const surveyIdsWithStockpiles = new Set(list.map((st) => st.surveyId));
    let mutated = !stored;
    let nextId = list.length > 0 ? Math.max(...list.map((st) => st.id)) + 1 : 1;

    surveys.forEach((s) => {
      if (!surveyIdsWithStockpiles.has(s.id)) {
        mutated = true;
        const z = zones.find((item) => item.id === s.zoneId);
        list.push({
          id: nextId++,
          surveyId: s.id,
          name: z ? `Acopio ${z.name}` : `Acopio ${s.flightCode}`,
          code: `ACO-${s.id}-01`,
          stockpileType: z?.zoneType || 'stockpile',
          material: z?.targetMaterial || 'Árido clasificado',
          densityTonM3: z?.densityTonM3 || 1.68,
          baseElevationM: z?.baseElevationM ?? 115.0,
          areaM2: estimateStockpileAreaM2(s.fillVolumeM3, s.cutVolumeM3),
          fillVolumeM3: s.fillVolumeM3,
          cutVolumeM3: s.cutVolumeM3,
          netVolumeM3: s.netVolumeM3,
          tonnageEst: s.tonnageEst,
          notes: s.notes,
        });
      }
    });

    for (let i = 0; i < list.length; i++) {
      if (list[i].areaM2 === undefined) {
        mutated = true;
        list[i] = {
          ...list[i],
          areaM2: estimateStockpileAreaM2(list[i].fillVolumeM3, list[i].cutVolumeM3),
        };
      }
    }

    if (mutated) {
      writeStorage(STORAGE_KEY_STOCKPILES, list);
    }
    return list;
  }

  getStockpilesBySurvey(surveyId: number): Stockpile[] {
    return this.getStockpiles().filter((st) => st.surveyId === surveyId);
  }

  syncSurveyTotalsFromStockpiles(surveyId: number): Survey | null {
    const surveys = this.getSurveys();
    const idx = surveys.findIndex((s) => s.id === surveyId);
    if (idx === -1) return null;

    const childStockpiles = this.getStockpiles().filter((st) => st.surveyId === surveyId);
    if (childStockpiles.length === 0) return surveys[idx];

    const totalFill = Math.round(childStockpiles.reduce((acc, st) => acc + st.fillVolumeM3, 0) * 10) / 10;
    const totalCut = Math.round(childStockpiles.reduce((acc, st) => acc + st.cutVolumeM3, 0) * 10) / 10;
    const totalNet = Math.round((totalFill - totalCut) * 10) / 10;
    const totalTons = Math.round(childStockpiles.reduce((acc, st) => acc + st.tonnageEst, 0) * 10) / 10;

    surveys[idx] = {
      ...surveys[idx],
      fillVolumeM3: totalFill,
      cutVolumeM3: totalCut,
      netVolumeM3: totalNet,
      tonnageEst: totalTons,
    };
    writeStorage(STORAGE_KEY_SURVEYS, surveys);
    return surveys[idx];
  }

  createStockpile(data: Partial<Stockpile>): Stockpile {
    const surveys = this.getSurveys();
    const ownerSurveyId = Number(data.surveyId);
    const parentSurvey = surveys.find((s) => s.id === ownerSurveyId);
    if (!ownerSurveyId || !parentSurvey) {
      throw new Error('Cada acopio debe pertenecer obligatoriamente a un único vuelo válido.');
    }

    const parentZone = this.getZones().find((z) => z.id === parentSurvey.zoneId);
    const stockpiles = this.getStockpiles();
    const newId = stockpiles.length > 0 ? Math.max(...stockpiles.map((st) => st.id)) + 1 : 1;
    const density = Math.max(0.1, Number(data.densityTonM3 ?? parentZone?.densityTonM3 ?? 1.68));
    const fillVol = Number(data.fillVolumeM3 ?? 15000);
    const cutVol = Number(data.cutVolumeM3 ?? 0);
    const netVol = fillVol - cutVol;
    const tonnage = Math.round(Math.abs(netVol) * density * 10) / 10;

    const stockpile: Stockpile = {
      id: newId,
      surveyId: ownerSurveyId,
      name: data.name || `Acopio #${newId}`,
      code: data.code || `ACO-${ownerSurveyId}-${newId}`,
      stockpileType: data.stockpileType || parentZone?.zoneType || 'stockpile',
      material: data.material || parentZone?.targetMaterial || 'Grava 20/40',
      densityTonM3: density,
      baseElevationM: Number(data.baseElevationM ?? parentZone?.baseElevationM ?? 115.0),
      areaM2:
        data.areaM2 !== undefined
          ? Math.max(0, Math.round(Number(data.areaM2) || 0))
          : estimateStockpileAreaM2(fillVol, cutVol),
      cutVolumeM3: cutVol,
      fillVolumeM3: fillVol,
      netVolumeM3: netVol,
      tonnageEst: tonnage,
      notes: data.notes,
      createdAt: new Date().toISOString(),
    };

    stockpiles.push(stockpile);
    writeStorage(STORAGE_KEY_STOCKPILES, stockpiles);
    this.syncSurveyTotalsFromStockpiles(ownerSurveyId);
    return stockpile;
  }

  updateStockpile(id: number, data: Partial<Stockpile>): Stockpile | null {
    const stockpiles = this.getStockpiles();
    const idx = stockpiles.findIndex((st) => st.id === id);
    if (idx === -1) return null;

    const current = stockpiles[idx];
    const oldSurveyId = current.surveyId;
    let nextSurveyId = current.surveyId;
    if (data.surveyId !== undefined && Number(data.surveyId) !== current.surveyId) {
      const candidateSurveyId = Number(data.surveyId);
      if (!this.getSurveys().some((s) => s.id === candidateSurveyId)) {
        throw new Error('Cada acopio debe pertenecer a un único vuelo válido.');
      }
      const oldSiblings = stockpiles.filter((st) => st.surveyId === oldSurveyId);
      if (oldSiblings.length <= 1) {
        throw new Error('El vuelo de origen debe conservar al menos un acopio.');
      }
      nextSurveyId = candidateSurveyId;
    }

    const nextDensity = Math.max(0.1, Number(data.densityTonM3 ?? current.densityTonM3 ?? 1.68));
    const nextFill = Number(data.fillVolumeM3 ?? current.fillVolumeM3);
    const nextCut = Number(data.cutVolumeM3 ?? current.cutVolumeM3);
    const nextNet = nextFill - nextCut;
    const nextTonnage = Math.round(Math.abs(nextNet) * nextDensity * 10) / 10;

    const nextAreaM2 =
      data.areaM2 !== undefined
        ? Math.max(0, Math.round(Number(data.areaM2) || 0))
        : current.areaM2 ?? estimateStockpileAreaM2(nextFill, nextCut);

    stockpiles[idx] = {
      ...current,
      ...data,
      surveyId: nextSurveyId,
      densityTonM3: nextDensity,
      areaM2: nextAreaM2,
      fillVolumeM3: nextFill,
      cutVolumeM3: nextCut,
      netVolumeM3: nextNet,
      tonnageEst: nextTonnage,
    };
    writeStorage(STORAGE_KEY_STOCKPILES, stockpiles);
    this.syncSurveyTotalsFromStockpiles(nextSurveyId);
    if (oldSurveyId !== nextSurveyId) {
      this.syncSurveyTotalsFromStockpiles(oldSurveyId);
    }
    return stockpiles[idx];
  }

  deleteStockpile(id: number): void {
    const stockpiles = this.getStockpiles();
    const target = stockpiles.find((st) => st.id === id);
    if (!target) return;

    const siblings = stockpiles.filter((st) => st.surveyId === target.surveyId);
    if (siblings.length <= 1) {
      throw new Error('Cada vuelo debe tener al menos un acopio registrado.');
    }

    const remaining = stockpiles.filter((st) => st.id !== id);
    writeStorage(STORAGE_KEY_STOCKPILES, remaining);
    this.syncSurveyTotalsFromStockpiles(target.surveyId);
  }

  // DELIVERABLES
  getDeliverables(): Deliverable[] {
    return readStorage<Deliverable[]>(STORAGE_KEY_DELIVERABLES, INITIAL_DELIVERABLES);
  }

  createDeliverable(data: Partial<Deliverable>): Deliverable {
    const deliverables = this.getDeliverables();
    const newId = deliverables.length > 0 ? Math.max(...deliverables.map((d) => d.id)) + 1 : 1;
    const deliverable: Deliverable = {
      id: newId,
      quarryId: data.quarryId || 1,
      surveyId: data.surveyId,
      title: data.title || 'Nuevo Entregable',
      category: data.category || 'pdf_report',
      fileUrl: data.fileUrl || '#',
      fileName: data.fileName || 'archivo_entrega.pdf',
      fileSize: data.fileSize || '5.0 MB',
      crs: data.crs || 'ETRS89 UTM 30N',
      uploadDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    deliverables.push(deliverable);
    writeStorage(STORAGE_KEY_DELIVERABLES, deliverables);
    return deliverable;
  }

  deleteDeliverable(id: number): void {
    const deliverables = this.getDeliverables().filter((d) => d.id !== id);
    writeStorage(STORAGE_KEY_DELIVERABLES, deliverables);
  }

  // USERS (Admin can list, create, edit, and delete portal users)
  getUsers(): AppUser[] {
    return readStorage<AppUser[]>(STORAGE_KEY_USERS, INITIAL_USERS);
  }

  createUser(data: Partial<AppUser>): AppUser {
    const users = this.getUsers();
    const newId = users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;
    const email = (data.email || `usuario${newId}@cantera.es`).trim();
    const username = (data.username || email.split('@')[0] || `user${newId}`).trim();
    const user: AppUser = {
      id: newId,
      uid: `user_${Date.now()}_${newId}`,
      username,
      email,
      password: data.password || 'ingeodron2026',
      displayName: data.displayName || username,
      role: data.role || 'client',
      clientId: data.role === 'admin' ? undefined : (data.clientId ?? 1),
      active: data.active !== false,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeStorage(STORAGE_KEY_USERS, users);
    return user;
  }

  updateUser(id: number, data: Partial<AppUser>): AppUser | null {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    const nextRole = data.role ?? users[idx].role;
    users[idx] = {
      ...users[idx],
      ...data,
      clientId: nextRole === 'admin' ? undefined : (data.clientId ?? users[idx].clientId ?? 1),
    };
    writeStorage(STORAGE_KEY_USERS, users);
    return users[idx];
  }

  deleteUser(id: number): void {
    const users = this.getUsers().filter((u) => u.id !== id);
    writeStorage(STORAGE_KEY_USERS, users);
  }

  // AUTHENTICATION (Zero API, 100% client-side JavaScript backed by editable users store)
  authenticate(usernameOrEmail: string, password?: string): AppUser | null {
    const clean = usernameOrEmail.toLowerCase().trim();
    const cleanPass = (password || '').trim();
    if (!clean || !cleanPass) return null;

    const users = this.getUsers();

    // Legacy quick aliases mapped to initial client accounts if still present
    const aliasNormalized =
      clean === 'guadalquivir' || clean === 'aridosdelsur'
        ? 'cmorales@aridosdelsur.es'
        : clean === 'jarama' || clean === 'gravasmadrid'
        ? 'eramos@gravasmadrid.es'
        : clean;

    const matchedUser = users.find(
      (u) =>
        u.active !== false &&
        (u.email.toLowerCase() === aliasNormalized ||
          u.email.toLowerCase() === clean ||
          (u.username && u.username.toLowerCase() === clean))
    );

    if (matchedUser) {
      if ((matchedUser.password || '') !== cleanPass) return null;
      const { password: _omitted, ...safeUser } = matchedUser;
      return safeUser;
    }

    return null;
  }

  // Reset to original demo dataset
  resetToDefaults(): void {
    writeStorage(STORAGE_KEY_CLIENTS, INITIAL_CLIENTS);
    writeStorage(STORAGE_KEY_QUARRIES, INITIAL_QUARRIES);
    writeStorage(STORAGE_KEY_ZONES, INITIAL_ZONES);
    writeStorage(STORAGE_KEY_SURVEYS, INITIAL_SURVEYS);
    writeStorage(STORAGE_KEY_STOCKPILES, INITIAL_STOCKPILES);
    writeStorage(STORAGE_KEY_DELIVERABLES, INITIAL_DELIVERABLES);
    writeStorage(STORAGE_KEY_USERS, INITIAL_USERS);
  }
}

export const localDataStore = new LocalDataStore();
