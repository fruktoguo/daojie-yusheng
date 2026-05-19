# 服务端环境变量

配置方式：
- 本地开发：`packages/server/.env.local`（自动加载，不提交）
- 生产环境：Docker 环境变量或云平台配置

## 数据库

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_DATABASE_URL` | `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `SERVER_DATABASE_POOLER_URL` | `DATABASE_POOLER_URL` | 否 | 连接池 URL（高并发场景） |

格式：`postgresql://user:password@host:5432/database?sslmode=require`

## Redis

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_REDIS_URL` | `REDIS_URL` | 是 | Redis 连接字符串 |
| `SERVER_REDIS_MODE` | `REDIS_MODE` | 否 | 模式：standalone / cluster |

## GM 安全

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_GM_PASSWORD` | `GM_PASSWORD` | 生产必填 | GM 登录密码 |
| `SERVER_GM_AUTH_SECRET` | `GM_AUTH_SECRET` | 生产必填 | GM token 签名密钥 |
| `SERVER_SECRET_ENCRYPTION_KEY` | `SECRET_ENCRYPTION_KEY` | 生产必填 | 密钥管理主加密密钥 |
| `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD` | - | 否 | 本地开发允许默认密码 |

注意：生产环境必须设置强密码和独立密钥。本地开发设 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=true` 即可。

## CORS

| 变量 | 别名 | 默认值 | 说明 |
|------|------|--------|------|
| `SERVER_CORS_ENABLED` | `CORS_ENABLED` | `true` | 是否启用 |
| `SERVER_CORS_ORIGINS` | `CORS_ORIGINS` | - | 允许的源（逗号分隔） |
| `SERVER_CORS_METHODS` | `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | 允许的方法 |
| `SERVER_CORS_HEADERS` | `CORS_HEADERS` | `Content-Type,Authorization,X-Requested-With` | 允许的头 |
| `SERVER_CORS_CREDENTIALS` | `CORS_CREDENTIALS` | `false` | 允许携带凭证 |

注意：非开发环境必须显式配置 `SERVER_CORS_ORIGINS`，否则启动报错。

## 服务地址与运行时

| 变量 | 别名 | 说明 |
|------|------|------|
| `SERVER_URL` | - | 服务端公开地址 |
| `SERVER_SHADOW_URL` | - | 影子服务地址（灰度/测试） |
| `SERVER_RUNTIME_ENV` | `APP_ENV`, `NODE_ENV` | 环境标识 |
| `SERVER_PACKAGE_ROOT` | - | 包根目录（自动检测） |
| `SERVER_SKIP_LOCAL_ENV_AUTOLOAD` | - | 跳过 .env 自动加载 |

环境标识：`development` / `dev` / `local` / `test` 为开发环境（CORS 宽松），其他值为生产环境。

## 本地开发示例

```bash
SERVER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mud_dev
SERVER_REDIS_URL=redis://localhost:6379
SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=true
SERVER_RUNTIME_ENV=development
```

## 验证

```bash
pnpm --filter @mud/server start:dev   # 启动时输出配置来源
pnpm --filter @mud/server smoke:db    # 检查数据库连接
```
