ARG NODE_VERSION=24.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS pnpm-base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable \
  && corepack prepare pnpm@10.28.2 --activate \
  && pnpm config set store-dir /pnpm/store
WORKDIR /app

FROM pnpm-base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=point-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM dependencies AS build
ARG NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL=
ENV NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL=$NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL
COPY . .
RUN pnpm db:generate
RUN pnpm build
RUN --mount=type=cache,id=point-pnpm-store,target=/pnpm/store \
  pnpm --filter @point-quest/api deploy --legacy --prod /opt/api \
  && source_prisma_root="$(dirname "$(dirname "$(readlink -f node_modules/@prisma/client)")")/.prisma" \
  && target_prisma_root="$(dirname "$(dirname "$(readlink -f /opt/api/node_modules/@prisma/client)")")/.prisma" \
  && mkdir -p "$target_prisma_root" \
  && cp -R "$source_prisma_root/." "$target_prisma_root/"

FROM manifests AS migrate-dependencies
RUN --mount=type=cache,id=point-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter point-quest

FROM pnpm-base AS migrate
ENV NODE_ENV=production
COPY --from=migrate-dependencies /app/package.json ./package.json
COPY --from=migrate-dependencies /app/node_modules ./node_modules
COPY prisma.config.ts ./prisma.config.ts
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
RUN node node_modules/prisma/build/index.js -v
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production
ENV PORT=3000
ENV PRODUCT_UPLOAD_ROOT=/app/uploads
WORKDIR /app
COPY --from=build --chown=node:node /opt/api/package.json ./package.json
COPY --from=build --chown=node:node /opt/api/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/api/dist ./dist
RUN mkdir -p /app/uploads/products \
  && chown -R node:node /app/uploads \
  && chmod 0700 /app/uploads /app/uploads/products
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
WORKDIR /app/apps/web
EXPOSE 3001
CMD ["node", "server.js"]
