# =============================================================================
# Axivo - production images (SDS Doc 02 Ch10, Doc 19)
# Multi-stage build producing two targets:
#   web    - Next.js standalone server (stateless)
#   worker - background worker + Prisma CLI (also used for migrations/seed)
# =============================================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Give the Next.js production build enough heap; the default is sized to the
# machine and the compile OOMs on smaller CI runners otherwise.
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=4096
RUN npx prisma generate && npm run build

# -----------------------------------------------------------------------------
# Web application (standalone, least privilege)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /app
# Stamped by CI from the release tag; the app reads AXIVO_VERSION to report its
# running version and to compare against the latest release when checking for
# updates. Defaults to "dev" for local builds.
ARG AXIVO_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/virginpixel/axivo"
LABEL org.opencontainers.image.version="${AXIVO_VERSION}"
# HOSTNAME=0.0.0.0 is required: Docker sets HOSTNAME to the container id and
# the Next.js standalone server would otherwise bind only to that interface.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 STORAGE_PATH=/var/lib/axivo/storage AXIVO_VERSION=${AXIVO_VERSION}
RUN addgroup -S axivo && adduser -S axivo -G axivo
COPY --from=builder --chown=axivo:axivo /app/.next/standalone ./
COPY --from=builder --chown=axivo:axivo /app/.next/static ./.next/static
# Pre-create the storage path owned by axivo so the named volume Docker
# initializes from it inherits that ownership (uploads run as the axivo user).
RUN mkdir -p /var/lib/axivo/storage && chown -R axivo:axivo /var/lib/axivo
USER axivo
EXPOSE 3000
CMD ["node", "server.js"]

# -----------------------------------------------------------------------------
# Background worker + migration/seed runner
# -----------------------------------------------------------------------------
FROM node:22-alpine AS worker
WORKDIR /app
ARG AXIVO_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/virginpixel/axivo"
LABEL org.opencontainers.image.version="${AXIVO_VERSION}"
ENV NODE_ENV=production STORAGE_PATH=/var/lib/axivo/storage AXIVO_VERSION=${AXIVO_VERSION}
RUN addgroup -S axivo && adduser -S axivo -G axivo
COPY --from=deps --chown=axivo:axivo /app/node_modules ./node_modules
COPY --chown=axivo:axivo package.json tsconfig.json ./
COPY --chown=axivo:axivo prisma ./prisma
COPY --chown=axivo:axivo src ./src
RUN npx prisma generate && mkdir -p /var/lib/axivo/storage && chown -R axivo:axivo /var/lib/axivo
USER axivo
CMD ["npx", "tsx", "src/workers/index.ts"]
