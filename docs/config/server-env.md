# 服务端环境变量

## 位置

环境变量通过以下方式配置：
- 本地开发：`packages/server/.env.local`（自动加载，不提交）
- 生产环境：Docker 环境变量或云平台配置

## 数据库配置

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_DATABASE_URL` | `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `SERVER_DATABASE_POOLER_URL` | `DATABASE_POOLER_URL` | 否 | 连接池 URL（高并发场景） |

**格式示例**：
```
postgresql://user:password@host:5432/database?sslmode=require
```

## Redis 配置

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_REDIS_URL` | `REDIS_URL` | 是 | Redis 连接字符串 |
| `SERVER_REDIS_MODE` | `REDIS_MODE` | 否 | Redis 模式（standalone/cluster） |

**格式示例**：
```
redis://localhost:6379
redis://:password@host:6379
```

## GM 配置

| 变量 | 别名 | 必填 | 说明 |
|------|------|------|------|
| `SERVER_GM_PASSWORD` | `GM_PASSWORD` | 生产必填 | GM 登录密码 |
| `SERVER_GM_AUTH_SECRET` | `GM_AUTH_SECRET` | 生产必填 | GM 访问 token 签名密钥 |
| `SERVER_SECRET_ENCRYPTION_KEY` | `SECRET_ENCRYPTION_KEY` | 生产必填 | GM 密钥管理模块的主加密密钥 |
| `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD` | `GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD` | 否 | 允许本地开发使用默认密码 |

**安全注意**：
- 生产环境必须设置强密码
- 生产环境必须设置独立的 GM token 签名密钥和密钥管理加密密钥
- 本地开发可设置 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=true` 使用默认密码

## CORS 配置

| 变量 | 别名 | 默认值 | 说明 |
|------|------|--------|------|
| `SERVER_CORS_ENABLED` | `CORS_ENABLED` | `true` | 是否启用 CORS |
| `SERVER_CORS_ORIGINS` | `CORS_ORIGINS` | - | 允许的源（逗号分隔） |
| `SERVER_CORS_METHODS` | `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | 允许的方法 |
| `SERVER_CORS_HEADERS` | `CORS_HEADERS` | `Content-Type,Authorization,X-Requested-With` | 允许的头 |
| `SERVER_CORS_CREDENTIALS` | `CORS_CREDENTIALS` | `false` | 是否允许携带凭证 |

**注意**：非开发环境必须显式配置 `SERVER_CORS_ORIGINS`，否则启动报错。

## 服务地址

| 变量 | 必填 | 说明 |
|------|------|------|
| `SERVER_URL` | 否 | 服务端公开地址 |
| `SERVER_SHADOW_URL` | 否 | 影子服务地址（灰度/测试） |

## 运行时环境

| 变量 | 别名 | 说明 |
|------|------|------|
| `SERVER_RUNTIME_ENV` | `APP_ENV`, `NODE_ENV` | 运行环境标识 |
| `SERVER_PACKAGE_ROOT` | - | 服务端包根目录（自动检测） |
| `SERVER_SKIP_LOCAL_ENV_AUTOLOAD` | - | 跳过本地 .env 自动加载 |

**环境标识**：
- `development` / `dev` / `local` / `test`：开发环境，CORS 宽松
- 其他值：生产环境，CORS 严格

## 本地开发示例

创建 `packages/server/.env.local`：

```bash
SERVER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mud_dev
SERVER_REDIS_URL=redis://localhost:6379
SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=true
SERVER_RUNTIME_ENV=development
```

## 生产环境示例

```bash
SERVER_DATABASE_URL=postgresql://user:pass@db.example.com:5432/mud_prod?sslmode=require
SERVER_DATABASE_POOLER_URL=postgresql://user:pass@pooler.example.com:6543/mud_prod
SERVER_REDIS_URL=redis://:password@redis.example.com:6379
SERVER_GM_PASSWORD=your-strong-password-here
SERVER_CORS_ORIGINS=https://game.example.com,https://admin.example.com
SERVER_URL=https://api.example.com
```

## 验证配置

```bash
# 启动时会输出配置来源
pnpm --filter @mud/server start:dev

# 检查数据库连接
pnpm --filter @mud/server smoke:db
```
