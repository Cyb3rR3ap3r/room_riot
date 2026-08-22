FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY games/groupthink/package.json games/groupthink/package.json
COPY games/hot-take/package.json games/hot-take/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/games/groupthink/package.json ./games/groupthink/package.json
COPY --from=build /app/games/groupthink/node_modules ./games/groupthink/node_modules
COPY --from=build /app/games/groupthink/dist ./games/groupthink/dist
COPY --from=build /app/games/groupthink/content ./games/groupthink/content
COPY --from=build /app/games/hot-take/package.json ./games/hot-take/package.json
COPY --from=build /app/games/hot-take/node_modules ./games/hot-take/node_modules
COPY --from=build /app/games/hot-take/dist ./games/hot-take/dist
COPY --from=build /app/games/hot-take/content ./games/hot-take/content
COPY --from=build /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/game-engine/node_modules ./packages/game-engine/node_modules
COPY --from=build /app/packages/game-engine/dist ./packages/game-engine/dist

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000
VOLUME ["/data"]
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
