########################################################
# Build: Bun workspaces + compile
########################################################
FROM oven/bun:1 AS builder

WORKDIR /build

COPY bun.lock package.json ./
COPY apps/client/package.json ./apps/client/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/

RUN bun install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api

RUN bun run --filter api generate
RUN bun run --filter @proval/db build
RUN bun run --filter @proval/types build

COPY apps/client ./apps/client


RUN bun run --filter client build

ENV NODE_ENV=production

RUN bun build apps/api/src/index.ts --compile --outfile /build/server

########################################################
# Production: glibc slim + compiled binary only
########################################################
FROM cgr.dev/chainguard/wolfi-base:latest

WORKDIR /app

RUN apk add --no-cache wget ripgrep ca-certificates

COPY --from=builder /build/server ./server
COPY --from=builder /build/packages/db/src/migration ./migration
COPY --from=builder /build/apps/client/dist ./public

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:7900/api/health || exit 1

ENV DB_FILE_NAME=/data/app.db

ENV PORT=7900

ENV NODE_ENV=production

EXPOSE 7900
EXPOSE 7901

CMD ["./server"]
