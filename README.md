# 道劫余生 next 重构文档入口

这个仓库当前只服务于 `next` 重构线。

重点不是旧线玩法设计、数值策划或历史部署说明，而是 `client-next / shared-next / server-next` 的替换边界、证明链、剩余缺口与执行计划。

## 当前定位

- `server-next` 仍是独立的 `shadow / replace-ready` 验收线
- 当前仓库应理解为“阶段性备份与继续协作线”，不是“已经可正式替换生产”的宣告
- 文档只保留与 next 重构直接相关的内容

## 核心目录

```text
packages/
  client-next/   next 前端
  shared-next/   next 协议与共享类型
  server-next/   next 服务端与 replace-ready / shadow 验证
docs/            next 重构分析、计划、审计、运维说明
next-workspace/  next 分支专用工作区说明
```

## 常用命令

```bash
pnpm dev:client-next
pnpm dev:server-next
pnpm build:shared-next
pnpm build:client-next
pnpm verify:replace-ready:doctor
pnpm verify:replace-ready
pnpm verify:replace-ready:with-db
pnpm verify:replace-ready:shadow
pnpm verify:replace-ready:acceptance
pnpm verify:replace-ready:full
```

## 先看哪些文档

### 当前状态与缺口

- [docs/next-gap-analysis.md](./docs/next-gap-analysis.md)
- [packages/server-next/NEXT-GAP-ANALYSIS.md](./packages/server-next/NEXT-GAP-ANALYSIS.md)

### 执行计划与任务拆分

- [docs/next-remaining-execution-plan.md](./docs/next-remaining-execution-plan.md)
- [docs/next-remaining-task-breakdown.md](./docs/next-remaining-task-breakdown.md)
- [docs/next-remaining-engineering-ledger.md](./docs/next-remaining-engineering-ledger.md)

### 运维、门禁与审计

- [docs/server-next-operations.md](./docs/server-next-operations.md)
- [docs/next-protocol-audit.md](./docs/next-protocol-audit.md)
- [docs/next-legacy-boundary-audit.md](./docs/next-legacy-boundary-audit.md)
- [docs/next-legacy-removal-checklist.md](./docs/next-legacy-removal-checklist.md)

### 包内入口

- [packages/server-next/README.md](./packages/server-next/README.md)
- [packages/server-next/TESTING.md](./packages/server-next/TESTING.md)
- [packages/server-next/REPLACE-RUNBOOK.md](./packages/server-next/REPLACE-RUNBOOK.md)
- [next-workspace/README.md](./next-workspace/README.md)

## 当前口径提醒

- `local / acceptance / full / shadow-destructive` 是四层不同门禁，不能混读
- `verify:replace-ready*` 证明的是替换链路与验收链路，不等于 next 已完整接班
- 任何“可以删 legacy / 可以宣布完整替换”的结论，都应以文档、audit、smoke、verify 与真实环境证据共同成立为准
