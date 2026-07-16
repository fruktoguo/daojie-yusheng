# 服务端环境变量

配置方式：
- 本地开发：`packages/server/.env.local`（自动加载，不提交）
- 生产环境：Docker 环境变量或云平台配置

## 数据库

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_DATABASE_URL` | `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `SERVER_DATABASE_POOLER_URL` | `DATABASE_POOLER_URL` | 否 | 连接池 URL（高并发场景） |
| `SERVER_DATABASE_POOL_<GROUP>_STATEMENT_TIMEOUT_MS` | `DATABASE_POOL_<GROUP>_STATEMENT_TIMEOUT_MS` | 否 | 各连接池 PostgreSQL 单条语句超时 |
| `SERVER_DATABASE_POOL_<GROUP>_QUERY_TIMEOUT_MS` | `DATABASE_POOL_<GROUP>_QUERY_TIMEOUT_MS` | 否 | 各连接池 Node 客户端查询超时 |
| `SERVER_DATABASE_POOL_<GROUP>_LOCK_TIMEOUT_MS` | `DATABASE_POOL_<GROUP>_LOCK_TIMEOUT_MS` | 否 | 各连接池 PostgreSQL 锁等待超时 |

格式：`postgresql://user:password@host:5432/database?sslmode=require`

`<GROUP>` 可取 `RUNTIME_CRITICAL`、`FLUSH`、`OUTBOX`、`GM_DIAGNOSTICS`。生产默认值已按运行时/刷盘 `10s` 语句、`12s` 客户端查询、`5s` 锁等待配置；GM 诊断池放宽为 `30s`、`35s`、`10s`。

## Redis

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_REDIS_URL` | `REDIS_URL` | 是 | Redis 连接字符串 |
| `SERVER_REDIS_MODE` | `REDIS_MODE` | 否 | 模式：standalone / cluster |

## GM 安全

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_GM_PASSWORD` | `GM_PASSWORD` | 生产必填 | GM 登录密码 |
| `SERVER_GM_AUTH_SECRET` | `GM_AUTH_SECRET` | 否 | GM token 签名密钥；未配置时复用玩家 Token 签名密钥 |
| `SERVER_SECRET_ENCRYPTION_KEY` | `SECRET_ENCRYPTION_KEY` | 否 | 密钥管理主加密密钥；未配置时复用玩家 Token 签名密钥 |
| `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD` | - | 否 | 本地开发允许默认密码 |

注意：生产环境必须设置强 GM 密码。`SERVER_GM_AUTH_SECRET` 和 `SERVER_SECRET_ENCRYPTION_KEY` 支持复用玩家 Token 签名密钥兜底，但长期生产运维仍建议配置独立密钥，避免玩家 token 轮换影响 GM 密钥库解密。本地开发设 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=true` 即可。

## CORS

| 变量 | 别名 | 默认值 | 说明 |
|------|------|--------|------|
| `SERVER_CORS_ENABLED` | `CORS_ENABLED` | `true` | 是否启用 |
| `SERVER_CORS_ORIGINS` | `CORS_ORIGINS` | - | 允许的源（逗号分隔） |
| `SERVER_CORS_METHODS` | `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | 允许的方法 |
| `SERVER_CORS_HEADERS` | `CORS_HEADERS` | `Content-Type,Authorization,X-Requested-With` | 允许的头 |
| `SERVER_CORS_CREDENTIALS` | `CORS_CREDENTIALS` | `false` | 允许携带凭证 |

注意：非开发环境必须显式配置 `SERVER_CORS_ORIGINS`，否则启动报错。开发类环境会额外放行 `localhost`、回环地址，以及 `http://daojie` 这类常用于本机 `/etc/hosts` 的单标签 origin；生产环境不会隐式放行这些别名。

## 服务地址与运行时

| 变量 | 别名 | 默认值 | 说明 |
|------|------|--------|------|
| `SERVER_URL` | - | - | 服务端公开地址 |
| `SERVER_SHADOW_URL` | - | `SERVER_URL` | 影子服务地址（灰度/测试） |
| `SERVER_RUNTIME_ENV` | `APP_ENV`, `NODE_ENV` | - | 环境标识 |
| `SERVER_RUNTIME_ROLE` | `DAOJIE_RUNTIME_ROLE` | `api` | 运行角色：`api` / `worker` / `all`；生产默认只启 HTTP 与权威 runtime |
| `SERVER_FLUSH_TASK_RUNTIME_MODE` | `FLUSH_TASK_RUNTIME_MODE` | `api` 下为 `off`，`worker` 下为 `worker`，显式 `all` 下为 `inline` | 统一刷盘任务消费模式 |
| `SERVER_PLAYER_FLUSH_TASK_COALESCE_MS` | `PLAYER_FLUSH_TASK_COALESCE_MS` | `60000` | 玩家普通高频域的内存 staging 合并窗口 |
| `SERVER_PLAYER_PRESENCE_FLUSH_TASK_COALESCE_MS` | `PLAYER_PRESENCE_FLUSH_TASK_COALESCE_MS` | `30000` | 玩家 presence staging 合并窗口 |
| `SERVER_PLAYER_LOCATION_FLUSH_TASK_COALESCE_MS` | `PLAYER_LOCATION_FLUSH_TASK_COALESCE_MS` | `5000` | 玩家位置与世界锚点 staging 合并窗口 |
| `SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS` | `MAP_PERSISTENCE_COALESCE_WINDOW_MS` | `60000` | 自动地图域合并窗口；玩家主动高优先级变更绕过 |
| `SERVER_PACKAGE_ROOT` | - | 自动检测 | 包根目录 |
| `SERVER_SKIP_LOCAL_ENV_AUTOLOAD` | - | `false` | 跳过 .env 自动加载 |

环境标识：`development` / `dev` / `local` / `test` 为开发环境（CORS 宽松），其他值为生产环境。

生产拓扑必须显式拆分：

```bash
# 对外 server
SERVER_RUNTIME_ROLE=api
SERVER_FLUSH_TASK_RUNTIME_MODE=off

# 后台 worker
SERVER_RUNTIME_ROLE=worker
SERVER_FLUSH_TASK_RUNTIME_MODE=worker
```

`SERVER_RUNTIME_ROLE=all` 与 `SERVER_FLUSH_TASK_RUNTIME_MODE=inline` 仅用于本地单进程调试或应急回滚，不能作为真实服务器缺省值。

`pnpm --filter @mud/server start:dev` 在本地开发环境且未显式设置上述两项时，会仅为开发进程自动使用 `all/inline`，避免只生产 flush ledger 而没有 worker 消费。

## 进程监督与自动恢复

生产镜像的 `dist/main.js` 默认作为轻量父监督器运行，并拉起实际 Nest 子进程。该机制不改变 Dockerfile 命令、YAML、端口或 api/worker 拆分；开发和测试环境默认直启应用。

常用变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_PROCESS_SUPERVISOR_ENABLED` | 生产 `true` | 显式启停进程监督 |
| `SERVER_PROCESS_SUPERVISOR_STARTUP_TIMEOUT_MS` | `180000` | 子进程启动 ready 超时 |
| `SERVER_PROCESS_SUPERVISOR_HEARTBEAT_TIMEOUT_MS` | `30000` | 子进程事件循环心跳超时 |
| `SERVER_PROCESS_SUPERVISOR_LIVENESS_FAILURE_THRESHOLD` | `6` | `/live` 连续失败触发恢复次数 |
| `SERVER_PROCESS_SUPERVISOR_RESTART_MAX_DELAY_MS` | `30000` | 连续崩溃的最大退避时间 |
| `SERVER_PROCESS_SUPERVISOR_JOURNAL_PATH` | 按节点生成 | 结构化监督事件日志路径 |

完整默认值、故障边界和恢复流程见 [服务端进程监督与自动恢复](../runbook/server-process-supervisor.md)。

## 本地开发示例

```bash
DB_PASSWORD=dev-db-password
REDIS_PASSWORD=dev-redis-password
SERVER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mud_dev
SERVER_REDIS_URL=redis://localhost:6379
SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=true
SERVER_RUNTIME_ENV=development
SERVER_RUNTIME_ROLE=all
SERVER_FLUSH_TASK_RUNTIME_MODE=inline
```

本地如果使用 `docker-compose.yml`，也必须显式提供 `DB_PASSWORD` 和 `REDIS_PASSWORD`；这是为了避免本地默认值被误带到真实服务器。

默认值清点见 [env-defaults-audit.md](./env-defaults-audit.md)。

## 验证

```bash
pnpm --filter @mud/server start:dev   # 启动时输出配置来源
pnpm --filter @mud/server smoke:db    # 检查数据库连接
```
