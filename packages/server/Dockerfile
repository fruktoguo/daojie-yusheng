FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN corepack enable
RUN pnpm install --frozen-lockfile || pnpm install
COPY scripts scripts
COPY docs/tutorial-mechanics.md docs/tutorial-mechanics.md
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/server/data packages/server/data
RUN pnpm --filter @mud/shared build && pnpm --filter @mud/server compile

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN corepack enable
RUN pnpm install --frozen-lockfile --prod --filter @mud/server...

FROM node:20-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
COPY --from=prod-deps /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=prod-deps /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=prod-deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=prod-deps /app/packages/server/node_modules packages/server/node_modules
COPY --from=builder /app/packages/server/data packages/server/data
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /var/lib/server /app/packages/.runtime \
  && chown -R appuser:appgroup /var/lib/server /app/packages/.runtime
USER appuser
WORKDIR /app/packages/server
EXPOSE 13001
CMD ["node", "dist/main.js"]
