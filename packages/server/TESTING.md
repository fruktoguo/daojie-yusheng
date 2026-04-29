# server 验证

这份文件是 `packages/server` 的包内验证入口。

更完整的 shadow、`gm/database/*`、破坏性维护窗口说明，统一看：

- [REPLACE-RUNBOOK.md](./REPLACE-RUNBOOK.md)

更完整的当前任务总表与 cutover 执行，统一看：

- [docs/next-plan/main.md](../../docs/next-plan/main.md)
- [docs/next-plan/10-cutover-execution-checklist.md](../../docs/next-plan/10-cutover-execution-checklist.md)
- [docs/next-plan/10-cutover-step-by-step-runbook.md](../../docs/next-plan/10-cutover-step-by-step-runbook.md)

## 当前口径

- `packages/server` 是当前目录主线；`server` 主要保留为包名与兼容命令名。
- README / TESTING / REPLACE-RUNBOOK / workflow / package wrapper 当前统一使用 `local / with-db / acceptance / full / shadow-destructive` 五层 gate 命名。
- 根级主入口现在是 `verify:replace-ready*`。
- 根级 `verify:replace-ready*` 和 `packages/server` 包内直接执行的 `verify/smoke` 会默认尝试加载本地 env：
  - `.runtime/server.local.env`
  - `.env`
  - `.env.local`
  - `packages/server/.env`
  - `packages/server/.env.local`

## 五层 Gate

- `local`：代码和主证明链是否绿。
- `with-db`：本地主证明链与持久化 proof 是否成立。
- `acceptance`：`local` 之外，shadow 实物验收和 shadow GM 关键写路径是否也绿。
- `full`：数据库、shadow、GM 密码都齐备时，自动化门禁是否全绿。
- `shadow-destructive`：维护窗口里的破坏性数据库闭环是否可控。

这五层不是同一件事的不同叫法，不能混读。

## 推荐入口

- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:shadow`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`
- `pnpm verify:replace-ready:shadow:destructive:preflight`
- `pnpm verify:replace-ready:shadow:destructive`

## 边界

- 自动 proof 负责回答命令是否通、门禁是否能跑、回归是否可复现。
- 人工回归负责回答真实环境、维护窗口、业务上下文、回滚预案是否真的可执行。
- 自动 proof 不能替代真实切换记录。
