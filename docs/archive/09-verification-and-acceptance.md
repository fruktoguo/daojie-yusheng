# 验证与验收门禁

这份归档文档保留 release gate 合同口径，供 `scripts/check-release-gates.js` 校验根脚本、运行手册和包内测试说明是否一致。

## Gate 分层

| Gate | 命令 | 回答的问题 |
| --- | --- | --- |
| `local` | `pnpm verify:release:local` | 本地代码、构建和主证明链是否通过 |
| `with-db` | `pnpm verify:release:with-db` | 数据库链路、持久化 proof 和回读是否通过 |
| `acceptance` | `pnpm verify:release:acceptance` | `local + shadow + gm` 是否一起通过 |
| `full` | `pnpm verify:release:full` | `with-db -> backup-persistence -> shadow -> gm` 是否全绿 |
| `shadow-destructive` | `pnpm verify:release:shadow:destructive` | 维护窗口内破坏性数据库闭环是否可控 |

维护窗口 destructive gate 先跑预检：`pnpm verify:release:shadow:destructive:preflight`

```bash
pnpm verify:release:shadow:destructive:preflight
```

## 按改动范围选门禁

| 改动范围 | 最小门禁 |
| --- | --- |
| 小型服务端改动 | `pnpm verify:quick` |
| 房间/风水改动 | `pnpm verify:quick` + `pnpm verify:building` |
| 房间/风水性能路径改动 | `pnpm verify:quick` + `pnpm verify:building` + `pnpm verify:building:perf` |
| 客户端 UI 或客户端运行态改动 | `pnpm verify:client` |
| shared/protocol 改动 | `pnpm build:shared` + `pnpm audit:protocol` |
| 持久化/DB 改动 | `pnpm verify:release:with-db` |

## Shadow Target Probe

`shadow target probe` 用于在 shadow/release 之前确认目标环境可访问、配置完整、不会误打生产主库或错误服务。
