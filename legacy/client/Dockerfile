FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY legacy/shared/package.json legacy/shared/
COPY legacy/client/package.json legacy/client/
RUN pnpm install --frozen-lockfile || pnpm install
COPY docs/tutorial-mechanics.md docs/tutorial-mechanics.md
COPY legacy/shared legacy/shared
COPY legacy/client legacy/client
COPY legacy/server/data legacy/server/data
COPY scripts scripts
RUN pnpm --filter @mud/client build

FROM nginx:alpine
ENV NGINX_WORKER_PROCESSES=auto
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx
COPY legacy/client/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY legacy/client/nginx/default.conf.template /etc/nginx/templates/conf.d/default.conf.template
COPY --from=builder /app/legacy/client/dist /usr/share/nginx/html
EXPOSE 80
