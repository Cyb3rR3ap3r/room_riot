FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY games/groupthink/package.json games/groupthink/package.json
COPY games/hot-take/package.json games/hot-take/package.json
COPY games/suspect/package.json games/suspect/package.json
COPY games/drawn-out/package.json games/drawn-out/package.json
COPY games/blank-line/package.json games/blank-line/package.json
COPY games/wavelength/package.json games/wavelength/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS production-deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY games/groupthink/package.json games/groupthink/package.json
COPY games/hot-take/package.json games/hot-take/package.json
COPY games/suspect/package.json games/suspect/package.json
COPY games/drawn-out/package.json games/drawn-out/package.json
COPY games/blank-line/package.json games/blank-line/package.json
COPY games/wavelength/package.json games/wavelength/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json

# Install production dependencies in a clean stage so build-only tooling cannot
# leak into the runtime image and trigger the vulnerability gate.
RUN CI=true pnpm install --prod --frozen-lockfile

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=production-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/games/groupthink/package.json ./games/groupthink/package.json
COPY --from=production-deps /app/games/groupthink/node_modules ./games/groupthink/node_modules
COPY --from=build /app/games/groupthink/dist ./games/groupthink/dist
COPY --from=build /app/games/groupthink/content ./games/groupthink/content
COPY --from=build /app/games/hot-take/package.json ./games/hot-take/package.json
COPY --from=production-deps /app/games/hot-take/node_modules ./games/hot-take/node_modules
COPY --from=build /app/games/hot-take/dist ./games/hot-take/dist
COPY --from=build /app/games/hot-take/content ./games/hot-take/content
COPY --from=build /app/games/suspect/package.json ./games/suspect/package.json
COPY --from=production-deps /app/games/suspect/node_modules ./games/suspect/node_modules
COPY --from=build /app/games/suspect/dist ./games/suspect/dist
COPY --from=build /app/games/suspect/content ./games/suspect/content
COPY --from=build /app/games/drawn-out/package.json ./games/drawn-out/package.json
COPY --from=production-deps /app/games/drawn-out/node_modules ./games/drawn-out/node_modules
COPY --from=build /app/games/drawn-out/dist ./games/drawn-out/dist
COPY --from=build /app/games/drawn-out/content ./games/drawn-out/content
COPY --from=build /app/games/blank-line/package.json ./games/blank-line/package.json
COPY --from=production-deps /app/games/blank-line/node_modules ./games/blank-line/node_modules
COPY --from=build /app/games/blank-line/dist ./games/blank-line/dist
COPY --from=build /app/games/blank-line/content ./games/blank-line/content
COPY --from=build /app/games/wavelength/package.json ./games/wavelength/package.json
COPY --from=production-deps /app/games/wavelength/node_modules ./games/wavelength/node_modules
COPY --from=build /app/games/wavelength/dist ./games/wavelength/dist
COPY --from=build /app/games/wavelength/content ./games/wavelength/content
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=production-deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/game-engine/package.json ./packages/game-engine/package.json
COPY --from=production-deps /app/packages/game-engine/node_modules ./packages/game-engine/node_modules
COPY --from=build /app/packages/game-engine/dist ./packages/game-engine/dist

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
