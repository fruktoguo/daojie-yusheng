# 验证门禁与验收归档

本文记录已固定的发布验证入口和 Codex 改动范围到门禁的路由口径。它是发布门禁脚本的归档契约，不再作为新任务计划追踪。

## 发布门禁

| Gate | 命令 | 回答的问题 |
|------|------|------------|
| `local` | `pnpm verify:release:local` | 本地编译、静态 proof 和主链 smoke 是否通过 |
| `with-db` | `pnpm verify:release:with-db` | 本地数据库、迁移、仓储和回读链路是否通过 |
| `acceptance` | `pnpm verify:release:acceptance` | `local + shadow + gm` 是否一起通过 |
| `full` | `pnpm verify:release:full` | `with-db -> backup-persistence -> shadow -> gm` 是否全绿 |

`pnpm verify:release:shadow:destructive:preflight` 只用于维护窗口前的破坏性 shadow 预检；通过后才允许执行 destructive proof。

shadow target probe 用于区分 shadow 目标不可达、健康检查非 ready、GM 路由缺失和 GM 鉴权失败，不能用普通 HTTP 成功替代。

## 改动范围路由

| 改动范围 | 推荐门禁 |
|----------|----------|
| 小型服务端改动 | `pnpm verify:quick` |
| 房间/风水改动 | `pnpm verify:quick` + `pnpm verify:building` |
| 房间/风水性能路径改动 | `pnpm verify:quick` + `pnpm verify:building` + `pnpm verify:building:perf` |
| 客户端 UI 或客户端运行态改动 | `pnpm verify:client` |
| shared/protocol 改动 | `pnpm build:shared` + `pnpm audit:protocol` |
| 持久化/DB 改动 | `pnpm verify:release:with-db` |
| 合并前或大范围修改 | `pnpm verify:standard` |
| 发布前 | `pnpm verify:release` |
| 严格上线前 | `pnpm verify:release:full` |

## 边界

- `doctor` 只回答环境、依赖和下一步门禁建议，不证明完整业务正确性。
- `with-db` 只回答本地数据库链路，不证明线上 shadow 流量表现。
- `shadow` 只回答 shadow 目标上的只读/有限写路径，不替代 acceptance。
- `acceptance` 是 shadow 实物验收和 GM 关键写路径组合，不覆盖所有边界条件。
- `full` 是最严格自动化链路，失败时仍要拆回具体子门禁定位。
