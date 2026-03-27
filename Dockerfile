########################################################
# 1. Client Build
########################################################
FROM node:24-alpine AS client

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@latest --activate

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

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages ./packages

ENV DB_FILE_NAME=/data/app.db

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

COPY --from=client /build/apps/client/dist ./public

RUN find node_modules -type f \( -name "*.md" -o -name "*.ts" -o -name "*.map" -o -name "LICENSE" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true

RUN find node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" \) -exec rm -rf {} + 2>/dev/null || true

ENV PORT=7900
ENV NODE_ENV=production

EXPOSE 7900

CMD ["node", "/app/src/index.js"]
