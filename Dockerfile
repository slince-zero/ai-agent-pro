FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

# Copy workspace root config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
# Copy sub-package manifests for dependency resolution
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY packages/tool-sdk/package.json packages/tool-sdk/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/client packages/client
COPY packages/server packages/server
COPY packages/tool-sdk packages/tool-sdk

# Build workspace packages used by the production image
RUN pnpm --filter @ai-agent-pro/tool-sdk run build
RUN pnpm --filter client run build
RUN pnpm --filter server run build

# Deploy server: standalone dir with prod deps only (no symlinks)
RUN pnpm --filter server deploy --legacy /deploy


FROM node:22-alpine AS runner
ARG BUILD_TAG=unknown
ARG BUILD_TIME=unknown

LABEL org.opencontainers.image.title="ai-pro-agent" \
      org.opencontainers.image.version="${BUILD_TAG}" \
      org.opencontainers.image.created="${BUILD_TIME}"

ENV NODE_ENV=production \
    PORT=3003 \
    CLIENT_DIST_DIR=/app/public

WORKDIR /app

RUN apk add --no-cache docker-cli \
    && corepack enable \
    && corepack prepare pnpm@11.5.2 --activate

# Copy self-contained server deployment
COPY --from=build /deploy /app
# Copy built client static files
COPY --from=build /app/packages/client/dist /app/public
# Copy entrypoint
COPY packages/server/entrypoint.sh /app/entrypoint.sh

EXPOSE 3003
ENTRYPOINT ["sh", "entrypoint.sh"]
