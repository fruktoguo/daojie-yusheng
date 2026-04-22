# 道劫余生 next 重构文档入口

这个仓库当前只服务于 `next` 重构线。

重点不是旧线玩法设计、数值策划或历史部署说明，而是 `packages/client`、`packages/shared`、`packages/server` 这条主线的替换边界、证明链、剩余缺口与执行计划。

说明：

- 目录主线已经统一到 `packages/*`
- `legacy/*` 当前只保留三类价值：查旧规则、查旧数据格式、迁移输入
- 包名与部分命令仍保留历史名：
  - `@mud/client`
  - `@mud/shared`
  - `@mud/server`
- 这些历史名不再代表新的目录主线划分

## 当前定位

- `packages/server` 当前仍是独立的 `shadow / replace-ready` 验收线
- 当前仓库应理解为“next 原地硬切执行线”，不是“已经可正式替换生产”的宣告
- 文档只保留与 next 重构直接相关的内容

## 核心目录

```text
packages/
  client/        当前前端主线（包名仍为 @mud/client）
  shared/        当前协议与共享类型主线（包名仍为 @mud/shared）
  server/        当前服务端与 replace-ready / shadow 验证主线（包名仍为 @mud/server）
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
pnpm build:client
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

- `verify:server-next*` 继续转发到 `verify:replace-ready*`
- 旧 `prove-next-*` 入口继续转发到当前 `proof:*` 真源

`build:client` 是当前前端构建主入口。

当前主验证入口是 `verify:replace-ready*`：

```bash
pnpm verify:replace-ready:doctor
pnpm verify:replace-ready
pnpm verify:replace-ready:with-db
pnpm verify:replace-ready:shadow
pnpm verify:replace-ready:acceptance
pnpm verify:replace-ready:full
```

## 先看哪些文档

### 当前状态、计划与阻塞

- [docs/next-plan/main.md](./docs/next-plan/main.md)
- [docs/next-in-place-hard-cut-plan.md](./docs/next-in-place-hard-cut-plan.md)
- [docs/next-replacement-blocker-board.md](./docs/next-replacement-blocker-board.md)
- [docs/next-package-migration-board.md](./docs/next-package-migration-board.md)
- [packages/server/NEXT-GAP-ANALYSIS.md](./packages/server/NEXT-GAP-ANALYSIS.md)

### 运维、门禁与审计

- [docs/server-operations.md](./docs/server-operations.md)
- [docs/next-protocol-audit.md](./docs/next-protocol-audit.md)
- [docs/next-legacy-boundary-audit.md](./docs/next-legacy-boundary-audit.md)
- [docs/next-plan/10-legacy-archive-and-cutover.md](./docs/next-plan/10-legacy-archive-and-cutover.md)

### 包内入口

- [packages/server/README.md](./packages/server/README.md)
- [packages/server/TESTING.md](./packages/server/TESTING.md)
- [packages/server/REPLACE-RUNBOOK.md](./packages/server/REPLACE-RUNBOOK.md)
- [next-workspace/README.md](./next-workspace/README.md)


## 当前口径提醒

- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读
- 根级主验证入口是 `verify:replace-ready*`
- `./start-next.sh` 是默认本地启动脚本；`./start.sh` 只保留给 `legacy/` 归档排查
- 根级 `docker-compose.yml` 现在默认对应 next full-stack 本地入口；legacy Docker 归档入口改为 `docker-compose.legacy.yml`
- 任何“可以删 legacy / 可以宣布完整替换”的结论，都应以文档、audit、smoke、verify 与真实环境证据共同成立为准
