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
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# -----------------------------------------------------------------------------
# Web application (standalone, least privilege)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S axivo && adduser -S axivo -G axivo
COPY --from=builder --chown=axivo:axivo /app/.next/standalone ./
COPY --from=builder --chown=axivo:axivo /app/.next/static ./.next/static
USER axivo
EXPOSE 3000
CMD ["node", "server.js"]

# -----------------------------------------------------------------------------
# Background worker + migration/seed runner
# -----------------------------------------------------------------------------
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S axivo && adduser -S axivo -G axivo
COPY --from=deps --chown=axivo:axivo /app/node_modules ./node_modules
COPY --chown=axivo:axivo package.json tsconfig.json ./
COPY --chown=axivo:axivo prisma ./prisma
COPY --chown=axivo:axivo src ./src
RUN npx prisma generate
USER axivo
CMD ["npx", "tsx", "src/workers/index.ts"]
