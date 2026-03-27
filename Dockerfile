########################################################
# 1단계: Client Build
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
# 2단계: API Build
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

# Drizzle 타입 생성 + 빌드
RUN pnpm --filter @code-review/db generate
RUN pnpm --filter "@code-review/*" build
RUN pnpm --filter api build

COPY .npmrc .npmrc

# Standalone 배포 (production 의존성만)
RUN pnpm --filter api deploy --prod /deploy

########################################################
# 3단계: Production
########################################################
FROM node:24-alpine

WORKDIR /app

# API 의존성 (node_modules) 복사
COPY --from=builder /deploy/node_modules ./node_modules

# API 빌드 결과물 복사
COPY --from=builder /build/apps/api/dist .

# Client static files 복사
COPY --from=client /build/apps/client/dist ./public

ENV PORT=7900
ENV NODE_ENV=production

EXPOSE 7900

CMD ["node", "index.js"]
