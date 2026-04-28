# server

`packages/server` 是仓库里的 next 后端目录主线；包名当前仍保留历史名 `@mud/server`。

它当前负责：

- next 服务端运行时
- shadow / replace-ready 验收线
- cutover 前后的自动 proof 与运维入口

## 当前口径

- 根级主入口现在是 `verify:replace-ready*`
- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读
- active 主包里已不存在单独的 compat/legacy 主目录；遗留 compat 行为只允许作为显式 next 入口或 proof 边界存在
- 真实切换是否完成，以 cutover 执行记录和真实环境观察为准

## 文档入口

当前任务总表：

- [../../docs/next-plan/main.md](../../docs/next-plan/main.md)

验证口径：

- [../../docs/next-plan/09-verification-and-acceptance.md](../../docs/next-plan/09-verification-and-acceptance.md)
- [./TESTING.md](./TESTING.md)

cutover 与运维：

- [./REPLACE-RUNBOOK.md](./REPLACE-RUNBOOK.md)
- [../../docs/next-plan/10-cutover-execution-checklist.md](../../docs/next-plan/10-cutover-execution-checklist.md)
- [../../docs/next-plan/10-cutover-step-by-step-runbook.md](../../docs/next-plan/10-cutover-step-by-step-runbook.md)

审计：

- [../../docs/protocol-audit.md](../../docs/protocol-audit.md)
- [./package.json](./package.json) 中的 `audit:boundaries`

## 推荐命令

- 本地自检：`pnpm verify:replace-ready:doctor`
- 本地主证明链：`pnpm verify:replace-ready`
- 最小带库 proof：`pnpm verify:replace-ready:proof:with-db`
- 带库闭环：`pnpm verify:replace-ready:with-db`
- shadow 实例验收：`pnpm verify:replace-ready:shadow`
- 增强验收：`pnpm verify:replace-ready:acceptance`
- 最严格自动化链：`pnpm verify:replace-ready:full`
