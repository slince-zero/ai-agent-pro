FROM node:22-alpine AS client-deps
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --include=optional

FROM client-deps AS client-build
COPY client ./
RUN npm run build

FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci

FROM server-deps AS server-build
COPY server ./
RUN npm run build
RUN npm prune --omit=dev

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

COPY --from=server-build /app/server/package*.json ./
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/prisma.config.ts ./prisma.config.ts
COPY --from=client-build /app/client/dist ./public

EXPOSE 3003
CMD ["node", "dist/index.js"]
