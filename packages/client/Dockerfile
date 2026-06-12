FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
ARG PNPM_VERSION=10.29.1
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}
RUN npm install -g "pnpm@${PNPM_VERSION}" --registry="${NPM_CONFIG_REGISTRY}" \
  && pnpm --version
RUN pnpm install --frozen-lockfile
COPY scripts scripts
COPY packages/shared packages/shared
COPY packages/client packages/client
COPY packages/server/data packages/server/data
COPY packages/server/src/tools/protocol-audit.ts packages/server/src/tools/protocol-audit.ts
COPY packages/server/src/runtime/instance/map-instance.runtime.ts packages/server/src/runtime/instance/map-instance.runtime.ts
ARG BUILD_CACHEBUST=local
RUN printf '%s\n' "$BUILD_CACHEBUST" >/dev/null
RUN pnpm build:client

FROM nginx:alpine
ENV NGINX_WORKER_PROCESSES=auto
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx
COPY packages/client/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY packages/client/nginx/default.conf.template /etc/nginx/templates/conf.d/default.conf.template
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
