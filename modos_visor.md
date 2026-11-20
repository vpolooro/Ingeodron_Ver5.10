# Formatos y Archivos Compatibles por Modo del Visor

Listado de los archivos que se pueden cargar (mediante **Abrir Archivo Local** o subiéndolos como entregable al servidor del cliente) y cómo funcionan en cada modo del **Visor Fotogramétrico 3D y Planos 2D**.

---

## 1. Modo **Planos 2D & Ortofoto** (y textura del modo **Ortofoto RGB** en 3D)

Se utilizan para visualizar la ortofoto real en 2D y proyectarla como textura sobre el Modelo Digital de Elevaciones (MDE) del vuelo en 3D.

### Formatos compatibles (Local y Servidor)
- `.TIF` / `.TIFF` *(GeoTIFF / imagen raster)*
- `.PNG`
- `.JPG` / `.JPEG`
- `.WEBP`

### Modos 2D disponibles
- **`Ortofoto RGB`**: Muestra directamente la ortofoto subida (o la base generada si no se selecciona ninguna).
- **`Hipsometría Z (MDE)`**: Muestra el mapa de elevaciones Z calculado del vuelo.
- **Capas superpuestas (`Curvas` 1 m / 5 m, acopios y mediciones)**: Compatibles encima de ambos modos.

---

## 2. Modo **Visor Fotogramétrico 3D**

El visor 3D dispone de **5 submodos de visualización**: `Ortofoto RGB`, `Hipsometría Z`, `Curvas 3D`, `Nube de Puntos` y `Malla TIN`.

### A) Modelo automático del vuelo (`MDE Calculado del Vuelo`)
- **Archivo requerido:** Ninguno (se genera automáticamente con el vuelo; opcionalmente utiliza la **Ortofoto** seleccionada en el apartado 1).
- **Modos compatibles:** **Los 5 modos completos** (`Ortofoto RGB`, `Hipsometría Z`, `Curvas 3D`, `Nube de Puntos` y `Malla TIN`).

### B) Mallas 3D Externas *(superficies trianguladas)*
- **Formatos compatibles:**
  - `.OBJ` *(carga local y servidor)*
  - `.PLY` *(cuando contiene malla/triángulos — carga local y servidor)*
  - `.STL` *(carga local y servidor)*
  - `.GLB` / `.GLTF` *(con texturas y materiales embebidos — mediante **Abrir Archivo Local**)*
- **Modos compatibles al cargar una malla externa:**
  - **`Ortofoto RGB`**: Muestra la malla con sus colores/texturas originales *(el formato `.GLB`/`.GLTF` con textura embebida es el más adecuado para conservar el RGB fotogramétrico)*.
  - **`Hipsometría Z`**: Recolorea la malla aplicando la rampa de elevación por cota Z.
  - **`Malla TIN`**: Activa el modo alambre (*wireframe*) para inspeccionar los triángulos de la malla.
  - *Nota:* Sobre una malla externa no se activan `Curvas 3D` ni `Nube de Puntos` automáticos (para esos modos se usa el MDE del vuelo o un archivo de nube de puntos).

### C) Nubes de Puntos 3D Externas
- **Formatos binarios / nativos (Local y Servidor):**
  - `.LAS` *(recomendado para dron/LiDAR; soporta carga por streaming hasta 50 millones de puntos)*
  - `.PCD`
  - `.PLY` *(cuando el PLY contiene únicamente puntos sin caras trianguladas)*
- **Formatos ASCII / texto delimitado `X Y Z [R G B]` (Local y Servidor):**
  - `.XYZ`
  - `.PTS`
  - `.CSV`
  - `.TXT`
- **Formato no compatible directamente en el visor web:**
  - `.LAZ` *(comprimido)*: Puede subirse al servidor como entregable para descarga, pero debe descomprimirse o convertirse previamente a `.LAS`, `.PLY` o `.XYZ` para cargarse en el visor 3D.
- **Modos compatibles al cargar una nube de puntos:**
  - **`Ortofoto RGB` / `Nube de Puntos`**: Muestra la nube con su color RGB original (si no contiene color, aplica hipsometría Z automáticamente) y permite ajustar el tamaño del punto.
  - **`Hipsometría Z`**: Colorea toda la nube según la elevación Z.
  - *Nota:* `Malla TIN` y `Curvas 3D` no aplican a una nube de puntos sin triangular.

---

## Resumen: Combinación recomendada para usar todos los modos con archivos reales

| Tipo de archivo | Formatos recomendados | Modos donde se visualiza |
| :--- | :--- | :--- |
| **Ortofoto** | `.TIF` / `.TIFF`, `.PNG`, `.JPG`, `.WEBP` | Planos 2D (`Ortofoto RGB`) y textura 3D del MDE (`Ortofoto RGB`) |
| **Malla 3D** | `.GLB` *(local)*, `.OBJ`, `.PLY`, `.STL` | `Ortofoto RGB` (textura/color), `Hipsometría Z`, `Malla TIN` |
| **Nube de Puntos** | `.LAS`, `.PLY`, `.PCD`, `.XYZ`, `.PTS`, `.CSV`, `.TXT` | `Nube de Puntos` (RGB), `Ortofoto RGB`, `Hipsometría Z` |

---

## 3. Cómo subir los archivos

### A) Subida permanente al servidor del cliente *(recomendado)*
1. Entra en la pestaña **3. Visor 3D** (o en **4. Entregables**) y pulsa **"Subir Modelo 3D / Ortofoto al Cliente"** (disponible para administrador).
2. En **"Seleccionar Archivo del Equipo"**, elige tu archivo. El sistema detecta automáticamente el **Tipo de Archivo** según la extensión:
   - **Ortomosaico 2D/3D**: `.TIF`, `.TIFF`, `.PNG`, `.JPG`, `.JPEG`, `.WEBP`
   - **Modelo / Malla 3D**: `.OBJ`, `.STL`, `.PLY` *(con caras trianguladas)* *(Nota: `.GLB` / `.GLTF` actualmente solo se cargan mediante "Abrir Archivo Local")*
   - **Nube de Puntos 3D**: `.LAS`, `.PLY` *(de puntos)*, `.PCD`, `.XYZ`, `.PTS`, `.CSV`, `.TXT`
3. **Importante:** Selecciona la **Explotación** correcta (y opcionalmente el **Vuelo Asociado**). El visor mostrará en sus desplegables únicamente los archivos vinculados a la explotación activa.
4. Sube el archivo. Si lo subiste desde **3. Visor 3D**, quedará seleccionado automáticamente al finalizar la carga.

### B) Carga rápida local *(solo vista temporal en el navegador)*
- En la barra superior de **3. Visor 3D**, pulsa **"Abrir Archivo Local"** y selecciona el archivo de tu equipo.
- Se cargará de forma temporal como `Local: <nombre>` en el desplegable correspondiente sin guardarse en el servidor.

---

## 4. Cómo se asigna cada archivo a su desplegable y modo

No es necesario asignar manualmente un archivo a un modo durante la subida; el visor separa automáticamente los archivos de la explotación activa por extensión en **dos selectores** en la barra superior de **3. Visor 3D**:

1. **Desplegable `Ortofoto:`** → Agrupa automáticamente las ortofotos e imágenes raster (`.TIF`, `.TIFF`, `.PNG`, `.JPG`, `.WEBP`) junto con `Ortofoto Base Generada`.
2. **Desplegable `Modelo 3D:`** → Agrupa automáticamente las mallas y nubes de puntos (`.OBJ`, `.PLY`, `.STL`, `.LAS`, `.XYZ`, `.PCD`, `.PTS`, `.CSV`, `.TXT`, más `.GLB`/`.GLTF` en local) junto con `MDE Calculado del Vuelo (Automático)`.

### Visualizar archivos en **Planos 2D & Ortofoto**
1. Selecciona arriba a la derecha **`Planos 2D & Ortofoto`**.
2. En el desplegable **`Ortofoto:`**, elige tu archivo `.TIF`, `.PNG` o `.JPG`.
3. En la barra inferior del visor 2D alterna entre:
   - **`Ortofoto RGB`**: Muestra tu ortofoto real subida.
   - **`Hipsometría Z (MDE)`**: Muestra el mapa de cotas del vuelo.
   - Activa o desactiva **`Curvas`** (1 m / 5 m) y **`Acopios del vuelo`** sobre el plano.

### Visualizar archivos en **Visor Fotogramétrico 3D**
1. Selecciona arriba a la derecha **`Visor Fotogramétrico 3D`**.
2. Combina los selectores superiores y los botones de **Modo** inferiores según el archivo que quieras inspeccionar:
   - **MDE del vuelo + Ortofoto real *(todos los modos)*:** Deja **`MDE Calculado del Vuelo (Automático)`** en `Modelo 3D:` y elige tu archivo en `Ortofoto:`. La ortofoto se proyectará sobre el terreno en **`Ortofoto RGB`**, manteniendo disponibles los **5 modos** (`Ortofoto RGB`, `Hipsometría Z`, `Curvas 3D`, `Nube de Puntos` y `Malla TIN`), acopios y perfil topográfico.
   - **Malla 3D subida:** Elige tu archivo (`.OBJ`, `.PLY`, `.STL`, o `.GLB`/`.GLTF` en local) en `Modelo 3D:` y alterna en la barra inferior entre **`Ortofoto RGB`** (textura/color original), **`Hipsometría Z`** (elevación Z) y **`Malla TIN`** (triángulos en modo alambre).
   - **Nube de Puntos subida:** Elige tu archivo (`.LAS`, `.PLY` de puntos, `.PCD`, `.XYZ`, `.PTS`, `.CSV` o `.TXT`) en `Modelo 3D:` y alterna en la barra inferior entre **`Ortofoto RGB`** / **`Nube de Puntos`** (color RGB real y control de tamaño de punto) e **`Hipsometría Z`** (elevación Z).

