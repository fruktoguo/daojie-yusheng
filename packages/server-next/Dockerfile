FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared-next/package.json packages/shared-next/
COPY packages/server-next/package.json packages/server-next/
RUN pnpm install --frozen-lockfile || pnpm install
COPY packages/shared-next packages/shared-next
COPY packages/server-next packages/server-next
COPY packages/server/data packages/server/data
RUN pnpm --filter @mud/shared-next build && pnpm --filter @mud/server-next compile

FROM node:20-alpine
RUN apk add --no-cache postgresql-client
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-next/package.json packages/shared-next/
COPY --from=builder /app/packages/shared-next/dist packages/shared-next/dist
COPY --from=builder /app/packages/shared-next/node_modules packages/shared-next/node_modules
COPY --from=builder /app/packages/server-next/package.json packages/server-next/
COPY --from=builder /app/packages/server-next/dist packages/server-next/dist
COPY --from=builder /app/packages/server-next/node_modules packages/server-next/node_modules
COPY --from=builder /app/packages/server/data packages/server/data
WORKDIR /app/packages/server-next
EXPOSE 13001
CMD ["node", "dist/main.js"]
