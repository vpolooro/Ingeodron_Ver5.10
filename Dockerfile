# ==============================================================================
# DOCKERFILE MULTI-STAGE — PORTAL INGEODRON (v5.50)
# Compatible con compilación directa desde GitHub:
#   docker build -t ingeodron-portal:5.50 https://github.com/vpolooro/Ingeodron_Ver5.10.git#main
# ==============================================================================

# ------------------------------------------------------------------------------
# Etapa 1: Instalación de dependencias y compilación del frontend (Vite SPA)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copiar manifiestos para aprovechar la caché de capas de Docker
COPY package.json package-lock.json* bun.lock* .npmrc* ./

# Instalar dependencias (incluye devDependencies necesarias para Vite y tsx)
RUN npm install --include=dev --legacy-peer-deps --no-audit --no-fund

# Copiar el código fuente y compilar el frontend en dist/
COPY . .
RUN NODE_ENV=production npm run build

# ------------------------------------------------------------------------------
# Etapa 2: Imagen final de producción (Express + SPA + Almacenamiento)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV FILES_ROOT_DIR=/app/storage
ENV NODE_OPTIONS=--max-old-space-size=1536

# Copiar dependencias y artefactos compilados desde la etapa builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/public ./public

# Directorio persistente para archivos de clientes, vuelos, usuarios y entregables
RUN mkdir -p /app/storage

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/tsx", "server.ts"]
