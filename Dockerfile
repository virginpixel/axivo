# =============================================================================
# Axivo - production images (SDS Doc 02 Ch10, Doc 19)
# Multi-stage build producing two targets:
#   web    - Next.js standalone server (stateless)
#   worker - background worker + Prisma CLI (also used for migrations/seed)
#
# The base is pinned by digest, not just by tag. A moving tag re-bases every
# image on whatever Docker Hub published that week, which changes every layer
# digest below it - so a self-hosted install re-downloads all ~500MB on an
# update that only changed application code. Bump this deliberately (and say so
# in the release notes) rather than drifting.
# =============================================================================

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS prod-deps
WORKDIR /app
# The lockfile alone, deliberately - not the prisma folder. This layer becomes
# the worker's ~200MB node_modules, and anything copied in before `npm ci` is
# part of its cache key. With the schema here, every release that added a
# migration reinstalled every package and shipped all of it again, though not
# one dependency had changed. The worker generates its Prisma client in its
# own stage below, so nothing here needs the schema.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder
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
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS web
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/virginpixel/axivo"
# HOSTNAME=0.0.0.0 is required: Docker sets HOSTNAME to the container id and
# the Next.js standalone server would otherwise bind only to that interface.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 STORAGE_PATH=/var/lib/axivo/storage
RUN addgroup -S axivo && adduser -S axivo -G axivo
COPY --from=builder --chown=axivo:axivo /app/.next/standalone ./
COPY --from=builder --chown=axivo:axivo /app/.next/static ./.next/static
# Static assets (logo/icon) - standalone output does not include public/ itself.
COPY --from=builder --chown=axivo:axivo /app/public ./public
# Pre-create the storage path owned by axivo so the named volume Docker
# initializes from it inherits that ownership (uploads run as the axivo user).
RUN mkdir -p /var/lib/axivo/storage && chown -R axivo:axivo /var/lib/axivo
# Stamped by CI from the release tag; the app reads AXIVO_VERSION to report its
# running version and to compare against the latest release when checking for
# updates. Defaults to "dev" for local builds.
#
# This goes LAST on purpose. The value changes on every release, and every
# instruction after a changed one gets a new cache key - so stamping the version
# before the COPY above put a ~200MB layer permanently out of reach of the build
# cache, and each update re-downloaded node_modules it already had. Keep version
# stamping below anything expensive.
ARG AXIVO_VERSION=dev
ENV AXIVO_VERSION=${AXIVO_VERSION}
LABEL org.opencontainers.image.version="${AXIVO_VERSION}"
USER axivo
EXPOSE 3000
CMD ["node", "server.js"]

# -----------------------------------------------------------------------------
# Background worker + migration/seed runner
# -----------------------------------------------------------------------------
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS worker
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/virginpixel/axivo"
ENV NODE_ENV=production STORAGE_PATH=/var/lib/axivo/storage
RUN addgroup -S axivo && adduser -S axivo -G axivo
# Production dependencies only - prisma (migrations) and tsx (the worker's
# entrypoint) are runtime dependencies for this image, so they are declared as
# such in package.json rather than pulled from the build tree.
COPY --from=prod-deps --chown=axivo:axivo /app/node_modules ./node_modules
COPY --chown=axivo:axivo package.json tsconfig.json ./
COPY --chown=axivo:axivo prisma ./prisma
COPY --chown=axivo:axivo src ./src
RUN npx prisma generate && mkdir -p /var/lib/axivo/storage && chown -R axivo:axivo /var/lib/axivo
# Last, for the reason given in the web stage: this value changes every release,
# and anything below it can never be reused from the cache.
ARG AXIVO_VERSION=dev
ENV AXIVO_VERSION=${AXIVO_VERSION}
LABEL org.opencontainers.image.version="${AXIVO_VERSION}"
USER axivo
CMD ["npx", "tsx", "src/workers/index.ts"]
