FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared-next/package.json packages/shared-next/
COPY packages/client-next/package.json packages/client-next/
RUN pnpm install --frozen-lockfile || pnpm install
COPY scripts scripts
COPY docs/tutorial-mechanics.md docs/tutorial-mechanics.md
COPY packages/shared-next packages/shared-next
COPY packages/client-next packages/client-next
COPY packages/server/data packages/server/data
RUN pnpm --filter @mud/client-next build

FROM nginx:alpine
ENV NGINX_WORKER_PROCESSES=auto
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx
COPY packages/client-next/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY packages/client-next/nginx/default.conf.template /etc/nginx/templates/conf.d/default.conf.template
COPY --from=builder /app/packages/client-next/dist /usr/share/nginx/html
EXPOSE 80
