# INGEODRON - Portal de Gestión Topográfica, Fotogrametría y Cubicación (v5.0.0)

Plataforma profesional web de fotogrametría con dron, visor 3D interactivo de mallas y nubes de puntos, visor 2D de ortofotos georreferenciadas con curvas de nivel, cálculo volumétrico de acopios y control de acceso multi-cliente aislado.

---

## 🚀 Características Principales

- **Visor Fotogramétrico 3D (Three.js):**
  - Renderizado acelerado por WebGL de Modelos Digitales de Elevaciones (MDE) paramétricos.
  - Carga y visualización directa de nubes de puntos (.LAS, .PLY, .XYZ, .PCD) y mallas poligonales (.OBJ, .GLB, .GLTF, .STL).
  - Modos de visualización: Ortofoto RGB, Hipsometría Z, Curvas 3D, Nube de Puntos y Malla TIN.
  - Perfiles topográficos dinámicos interactivos y control de acimut/elevación solar.
  - Aislado y estilizado bajo superficie GIS de alto contraste (compatible con modo oscuro y modo claro).

- **Visor Cartográfico 2D (Ortofoto y SIG):**
  - Ortofotos georreferenciadas de alta resolución (GSD centimétrico).
  - Superposición vectorial de curvas de nivel (equidistancia configurable 1m / 5m).
  - Malla UTM ETRS89 y lectura en tiempo real de coordenadas UTM y cota Z bajo cursor.
  - Herramientas de medición interactiva: distancia lineal acumulada y cálculo de área/perímetro de polígonos.

- **Gestión de Canteras y Vuelos (Cubicación):**
  - Seguimiento histórico de misiones y vuelos de dron por cantera y zona.
  - Cubicación automática de acopios (desmonte, terraplén, balance neto y tonelaje ponderado).
  - Generación de informes ejecutivos volumétricos en PDF y exportación a Excel.

- **Seguridad y Aislamiento de Clientes:**
  - Control de acceso basado en roles (`admin` y `client`) con tokens seguros HMAC-SHA256.
  - **Aislamiento estricto de archivos:** Los clientes solo pueden visualizar, consultar y descargar los archivos asignados a su carpeta (`storage/<Cliente>/`). Intentos de acceso cruzado son denegados con HTTP 403.
  - Descargas seguras mediante cabeceras `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y CSP estricto para mitigar XSS.
  - Lista blanca de extensiones de archivos para entregables (bloqueo de binarios y scripts ejecutables).

- **Panel de Administración:**
  - Gestión integral de clientes, usuarios, credenciales y permisos de acceso al visor 3D.
  - Sincronización automática de carpetas físicas en disco (`storage/<Cliente>/`).

---

## 🛠️ Requisitos Previos

- **Node.js** v20 o superior, o **Bun** v1.1+.
- **NPM**, **PNPM** o **Bun** como gestor de paquetes.
- Opcional: **Docker** & **Docker Compose** para despliegue en contenedores.

---

## 💻 Ejecución Local

### Opción A: Con Node.js / NPM
```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor en modo desarrollo (API + Vite con HMR)
npm run dev

# 3. Compilar para producción
npm run build

# 4. Iniciar en producción
npm start
```

### Opción B: Con Bun
```bash
# 1. Instalar dependencias
bun install

# 2. Iniciar en modo desarrollo
bun run dev

# 3. Compilar e iniciar en producción
bun run build
bun start
```

La aplicación estará accesible en: `http://localhost:3000`

---

## 🐳 Despliegue con Docker

### Construcción y arranque local con Docker Compose:
```bash
docker compose up -d --build
```

El servicio levantará el servidor Node en el puerto `3000` (o el configurado en `.env`).

Para más detalles, consulta la [Guía de Docker](file:///c:/Users/vpolo/Downloads/igeodron_ver-4/DOCKER.md).

---

## 🔑 Credenciales de Acceso Demo

| Rol | Correo Electrónico | Contraseña | Explotaciones Asignadas |
|---|---|---|---|
| **Administrador** | `admin@ingeodron.com` | `admin2026` | Acceso global a todos los clientes y carpetas |
| **Cliente** | `contacto@aridoslaestrella.com` | `estrella2026` | Áridos La Estrella (C001) |
| **Cliente** | `director@canterasdelsur.com` | `canteras2026` | Canteras del Sur (C002) |
| **Cliente** | `tecnico@hormigonesibericos.es` | `hormigones2026` | Hormigones Ibéricos (C003) |
| **Cliente** | `obras@gravasypizarras.com` | `gravas2026` | Gravas y Pizarras del Norte (C004) |

---

## 📁 Estructura del Almacenamiento

```
storage/
├── clients.json              # Base de datos local de clientes y CIFs
├── users.json                # Base de datos local de usuarios y hashes de contraseñas
├── deliverables-index.json   # Índice maestro de entregables registrados
├── c001-aridos_estrella/     # Carpeta de cliente (<Codigo>-<Nombre>)
│   ├── 120V-Vuelo_cantera/   # Subcarpeta por vuelo (<CodigoVuelo>-<NombreSinSignos>)
│   │   ├── informe_cubicacion_nov_2026.pdf # Informes creados por el admin
│   │   └── modelo_3d_cantera.glb           # Archivos subidos del vuelo
│   └── VUE-101-JUL-Mision_Verano/
├── c002-canteras_sur/
└── .tmp/                     # Cargas temporales controladas
```
