# 道劫余生 next 重构文档入口

这个仓库当前只服务于 `next` 重构线。

重点不是旧线玩法设计、数值策划或历史部署说明，而是 `packages/client`、`packages/shared`、`packages/server` 这条主线的替换边界、证明链、剩余缺口与执行计划。

说明：

- 目录主线已经统一到 `packages/*`
- 包名与部分命令仍保留历史名：
  - `@mud/client-next`
  - `@mud/shared-next`
  - `@mud/server-next`
- 这些历史名不再代表新的目录主线划分

## 当前定位

- `packages/server` 当前仍是独立的 `shadow / replace-ready` 验收线
- 当前仓库应理解为“阶段性备份与继续协作线”，不是“已经可正式替换生产”的宣告
- 文档只保留与 next 重构直接相关的内容

## 核心目录

```text
packages/
  client/        next 前端主线（包名仍为 @mud/client-next）
  shared/        next 协议与共享类型主线（包名仍为 @mud/shared-next）
  server/        next 服务端与 replace-ready / shadow 验证主线（包名仍为 @mud/server-next）
legacy/
  client/        旧前端归档基线
  shared/        旧协议与共享类型归档基线
  server/        旧服务端归档基线
docs/            next 重构分析、计划、审计、运维说明
next-workspace/  next 分支专用工作区说明
```

## 常用命令

```bash
pnpm dev:client
pnpm dev:server
pnpm build
pnpm verify:replace-ready:doctor
pnpm verify:replace-ready
pnpm verify:replace-ready:with-db
pnpm verify:replace-ready:shadow
pnpm verify:replace-ready:acceptance
pnpm verify:replace-ready:full
./start-next.sh
```

兼容别名仍可用：

```bash
pnpm verify:server-next:doctor
pnpm verify:server-next
pnpm verify:server-next:with-db
pnpm verify:server-next:shadow
pnpm verify:server-next:acceptance
pnpm verify:server-next:full
```

## 先看哪些文档

### 当前状态与缺口

- [docs/next-gap-analysis.md](./docs/next-gap-analysis.md)
- [packages/server/NEXT-GAP-ANALYSIS.md](./packages/server/NEXT-GAP-ANALYSIS.md)

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

- [packages/server/README.md](./packages/server/README.md)
- [packages/server/TESTING.md](./packages/server/TESTING.md)
- [packages/server/REPLACE-RUNBOOK.md](./packages/server/REPLACE-RUNBOOK.md)
- [next-workspace/README.md](./next-workspace/README.md)

## 当前口径提醒

- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读
- 根级主验证入口是 `verify:replace-ready*`
- `verify:server-next*` 只保留为兼容别名
- `./start-next.sh` 是默认本地启动脚本；`./start.sh` 只保留给 `legacy/` 归档排查
- 根级 `docker-compose.yml` 现在默认对应 next full-stack 本地入口；legacy Docker 归档入口改为 `docker-compose.legacy.yml`
- 任何“可以删 legacy / 可以宣布完整替换”的结论，都应以文档、audit、smoke、verify 与真实环境证据共同成立为准
