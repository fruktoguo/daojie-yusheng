# server 验证

这份文件是 `packages/server` 的包内验证入口。

更完整的 shadow、`gm/database/*`、破坏性维护窗口说明，统一看：

- [RUNBOOK.md](./RUNBOOK.md)

更完整的当前任务总表与验证门禁，统一看：

- [docs/next-plan/main.md](../../docs/next-plan/main.md)
- [docs/next-plan/09-verification-and-acceptance.md](../../docs/next-plan/09-verification-and-acceptance.md)

## 当前口径

- `packages/server` 是当前目录主线；`server` 主要保留为包名与兼容命令名。
- README / TESTING / RUNBOOK / workflow / package wrapper 当前统一使用 `local / with-db / acceptance / full / shadow-destructive` 五层 gate 命名。
- 根级主入口现在是 `verify:release*`。
- 根级 `verify:release*` 和 `packages/server` 包内直接执行的 `verify/smoke` 会默认尝试加载本地 env：
  - `.runtime/server.local.env`
  - `.env`
  - `.env.local`
  - `packages/server/.env`
  - `packages/server/.env.local`

## 五层 Gate

- `local`：代码和主证明链是否绿。
- `with-db`：本地主证明链与持久化 proof 是否成立。
- `quick`：本地快速反馈，覆盖编译、主线边界和核心 smoke，不证明 DB 或 shadow。
- `standard`：提交前 local 门禁，不随 DB 环境自动升级。
- `release`：发布前组合门禁，串起 `doctor / standard / with-db / shadow / gm`。
- `acceptance`：`local` 之外，shadow 实物验收和 shadow GM 关键写路径是否也绿。
- `full`：数据库、shadow、GM 密码都齐备时，最严格自动化门禁是否全绿；默认不重复跑 `with-db` 已覆盖的 `gm-database`。
- `shadow-destructive`：维护窗口里的破坏性数据库闭环是否可控。

这五层不是同一件事的不同叫法，不能混读。

## 推荐入口

- `pnpm verify:release:doctor`
- `pnpm verify:quick`
- `pnpm verify:standard`
- `pnpm verify:release`
- `pnpm verify:release:local`
- `pnpm verify:release:proof:with-db`
- `pnpm verify:release:with-db`
- `pnpm verify:release:shadow`
- `pnpm verify:release:acceptance`
- `pnpm verify:release:full`
- `pnpm verify:release:shadow:destructive:preflight`
- `pnpm verify:release:shadow:destructive`

## 边界

- 自动 proof 负责回答命令是否通、门禁是否能跑、回归是否可复现。
- 人工回归负责回答真实环境、维护窗口、业务上下文、回滚预案是否真的可执行。
- 自动 proof 不能替代真实维护窗口和生产环境执行记录。
