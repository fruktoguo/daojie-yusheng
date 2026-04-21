# GM 安全基线

更新时间：2026-04-20

这份文档只回答 GM 凭据和默认口径，不展开 GM 功能本身。

## 当前规则

- `packages/server` 启动时，GM 鉴权不再允许隐式回退到默认密码。
- 默认密码 `admin123` 不再允许作为生产、shadow、acceptance、full 的有效口径。
- 如显式把 `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD` 配成 `admin123`，启动会直接失败。
- `POST /api/auth/gm/password` 也不再允许把 GM 密码改回 `admin123`，除非走下面的本地显式降级方案。

## 正式环境要求

- 必须显式配置 `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD`。
- 该密码必须是独立密码，不能是 `admin123`。
- 不允许设置 `SERVER_NEXT_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` 或 `GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1`。
- `shadow / acceptance / full / 生产` 都按正式环境处理。

## 本地显式降级方案

只在本地开发排障时允许，而且必须显式开启：

- 设置 `SERVER_NEXT_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` 或 `GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1`
- 同时运行环境必须是 `development`、`dev`、`local` 或 `test`
- 这时如果没有显式配置 `SERVER_NEXT_GM_PASSWORD` / `GM_PASSWORD`，服务会临时回退到 `admin123`

限制：

- 该开关在非开发类环境会直接导致启动失败
- 如果已经显式配置了 `SERVER_NEXT_GM_PASSWORD` / `GM_PASSWORD`，不应再保留该降级开关
- 该模式只用于本地开发，不得带入 shadow、验收链或生产部署

## 推荐配置

本地正常开发：

```env
SERVER_NEXT_RUNTIME_ENV=local
SERVER_NEXT_GM_PASSWORD=<独立本地密码>
```

本地临时排障，显式启用不安全降级：

```env
SERVER_NEXT_RUNTIME_ENV=local
SERVER_NEXT_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1
```

生产 / shadow / acceptance / full：

```env
SERVER_NEXT_RUNTIME_ENV=production
SERVER_NEXT_GM_PASSWORD=<强独立密码>
```

## 升级旧环境时要检查什么

- 清理 `.runtime/server-next.local.env`、`.env`、`.env.local`、`packages/server/.env*` 里的 `GM_PASSWORD=admin123`
- 清理任何 `SERVER_NEXT_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` / `GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1`
- 确认 shadow 与 CI 使用的是独立 GM 密码，而不是开发机遗留值
- 如果历史上曾把 GM 密码持久化成弱口令，需通过 `POST /api/auth/gm/password` 轮换为新密码

## 验证建议

- 本地显式密码口径：设置独立 `SERVER_NEXT_GM_PASSWORD`，确认服务可正常启动并完成 GM 登录
- 本地无密码口径：不设置任何 GM 密码也不设置降级开关，确认服务启动失败
- 本地降级口径：设置 `SERVER_NEXT_RUNTIME_ENV=local` 与 `SERVER_NEXT_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1`，确认服务启动并输出 warning
- 非开发环境误配口径：设置 `SERVER_NEXT_RUNTIME_ENV=production` 与 `SERVER_NEXT_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1`，确认服务启动失败
- 非法默认密码口径：设置 `SERVER_NEXT_GM_PASSWORD=admin123`，确认服务启动失败
