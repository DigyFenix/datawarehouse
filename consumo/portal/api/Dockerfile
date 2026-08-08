# Build en tres etapas. La API depende de @quilate/agente vía "file:../../../data-plane/agente"
# (ver package.json), así que este build corre con CONTEXTO EN LA RAÍZ DEL REPO
# (infra/local/docker-compose.yml, servicio api-usuario: context ../../, dockerfile
# consumo/portal/api/Dockerfile).
#
# La ruta relativa del `file:` obliga a una cosa: la imagen final debe conservar la
# MISMA estructura de carpetas que el build (npm resuelve la dependencia con un
# symlink relativo que sube fuera de node_modules). Por eso el WORKDIR de runtime es
# `/repo/consumo/portal/api` y no `/app`: con `/app` el symlink apunta al vacío y el
# contenedor arranca y muere con MODULE_NOT_FOUND — un fallo de arranque, no de build.

FROM node:22-alpine AS build-agente
WORKDIR /repo/data-plane/agente
COPY data-plane/agente/package.json data-plane/agente/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY data-plane/agente/tsconfig.json ./
COPY data-plane/agente/src ./src
# Se compila y se poda: a runtime solo viaja dist/ + las dependencias de producción
# que el paquete declara (SDK de Anthropic y Zod).
RUN npm run build && rm -rf src && npm prune --omit=dev

FROM node:22-alpine AS build-api
WORKDIR /repo/consumo/portal/api
COPY --from=build-agente /repo/data-plane/agente /repo/data-plane/agente
COPY consumo/portal/api/package.json consumo/portal/api/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY consumo/portal/api/tsconfig.json consumo/portal/api/nest-cli.json ./
COPY consumo/portal/api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /repo/consumo/portal/api
ENV NODE_ENV=production
COPY --from=build-agente /repo/data-plane/agente /repo/data-plane/agente
COPY --from=build-api /repo/consumo/portal/api/node_modules ./node_modules
COPY --from=build-api /repo/consumo/portal/api/dist ./dist
COPY consumo/portal/api/package.json ./
EXPOSE 3002
CMD ["node", "dist/main.js"]
