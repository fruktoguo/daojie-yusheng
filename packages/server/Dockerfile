FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile || pnpm install
COPY scripts scripts
COPY docs/tutorial-mechanics.md docs/tutorial-mechanics.md
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/server/data packages/server/data
RUN pnpm --filter @mud/shared-next build && pnpm --filter @mud/server-next compile

FROM node:20-alpine
RUN apk add --no-cache postgresql-client
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules
COPY --from=builder /app/packages/server/data packages/server/data
WORKDIR /app/packages/server
EXPOSE 13001
CMD ["node", "dist/main.js"]
