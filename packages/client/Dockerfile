FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile || pnpm install
COPY docs/tutorial-mechanics.md docs/tutorial-mechanics.md
COPY packages/shared packages/shared
COPY packages/client packages/client
COPY packages/server/data packages/server/data
COPY scripts scripts
RUN pnpm --filter @mud/client build

FROM nginx:alpine
ENV NGINX_WORKER_PROCESSES=auto
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx
COPY packages/client/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY packages/client/nginx/default.conf.template /etc/nginx/templates/conf.d/default.conf.template
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
