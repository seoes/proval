########################################################
# 1. Client Build
########################################################
FROM node:24-alpine AS client

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/client/package.json ./apps/client/
COPY packages ./packages

RUN pnpm install --frozen-lockfile

COPY apps/client ./apps/client

RUN pnpm --filter "@code-review/*" build
RUN pnpm --filter client build

########################################################
# 2. API Build
########################################################
FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/

COPY packages/db ./packages/db
COPY packages/types ./packages/types

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api

RUN pnpm --filter @code-review/db generate
RUN pnpm --filter "@code-review/*" build
RUN pnpm --filter api build

COPY .npmrc .npmrc

RUN pnpm --filter api deploy --prod --no-optional /deploy

########################################################
# 3. Production
########################################################
FROM node:24-alpine

WORKDIR /app

COPY --from=builder /deploy/node_modules ./node_modules

COPY --from=builder /build/apps/api/dist .

COPY --from=builder /build/packages/db/src/migration ./migration

COPY --from=client /build/apps/client/dist ./public

HEALTHCHECK --interval=30s --timeout=10s --start-priod=5s --retires=3 CMD wget --no-verbose --tries=1 --spider http://localhost:7900/api/health || exit 1

ENV DB_FILE_NAME=/data/app.db

ENV PORT=7900

ENV NODE_ENV=production

EXPOSE 7900

CMD ["node", "/app/src/index.js"]
