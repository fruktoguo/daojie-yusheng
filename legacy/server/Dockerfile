FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY legacy/shared/package.json legacy/shared/
COPY legacy/server/package.json legacy/server/
RUN pnpm install --frozen-lockfile || pnpm install
COPY scripts scripts
COPY docs/tutorial-mechanics.md docs/tutorial-mechanics.md
COPY legacy/shared legacy/shared
COPY legacy/server legacy/server
RUN pnpm --filter @mud/shared build && pnpm --filter @mud/server build

FROM node:20-alpine
RUN apk add --no-cache postgresql-client
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/legacy/shared/package.json legacy/shared/
COPY --from=builder /app/legacy/shared/dist legacy/shared/dist
COPY --from=builder /app/legacy/shared/node_modules legacy/shared/node_modules
COPY --from=builder /app/legacy/server/package.json legacy/server/
COPY --from=builder /app/legacy/server/dist legacy/server/dist
COPY --from=builder /app/legacy/server/node_modules legacy/server/node_modules
COPY legacy/server/data legacy/server/data
WORKDIR /app/legacy/server
EXPOSE 3000
CMD ["node", "dist/main.js"]
