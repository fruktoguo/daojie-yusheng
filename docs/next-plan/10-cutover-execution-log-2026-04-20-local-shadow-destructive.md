# next 主线切换执行记录（2026-04-20，本地 shadow destructive proof）

> 这次不是正式生产切换。  
> 这份记录只用于补证 `shadow-destructive` 的维护窗口 proof，证明本地 next shadow 在 maintenance-active 条件下可以完成 `backup -> download -> restore`。

## 基本信息

- 执行日期：2026-04-20
- 时间窗口：本地维护窗口演练
- 环境：`http://127.0.0.1:11923`
- 执行人：Codex
- 回滚负责人：未指定，本轮为本地演练
- 是否维护窗口：是
- 是否包含 destructive：是

## 切换前 gate

- `pnpm build`：已通过
- `pnpm verify:replace-ready`：已通过
- `pnpm verify:replace-ready:with-db`：已通过
- `pnpm verify:replace-ready:acceptance`：已通过
- `pnpm verify:replace-ready:full`：已通过
- `pnpm verify:replace-ready:doctor`：已通过
- `pnpm proof:cutover-readiness`：已通过
- `pnpm proof:cutover-preflight`：已通过
- `pnpm verify:replace-ready:shadow:destructive:preflight`：在 maintenance-active 本地 shadow 上通过

## 环境确认

- shadow URL：`http://127.0.0.1:11923`
- 数据库目标：`.runtime/server-next.local.env` 中的本地 PostgreSQL
- GM 凭据来源：`.runtime/server-next.local.env`
- 是否核对 `start-next.sh` / 默认入口：是
- 是否核对维护窗口状态：是，本轮通过 `SERVER_NEXT_RUNTIME_MAINTENANCE=1` 拉起本地 shadow

## 切换中观察

### 只读面

- `/health`：`maintenance.active=true` 时返回 `503`，但 `alive.ok=true`
- `gm/maps`：本轮 destructive proof 不单独重复记录
- `gm/editor-catalog`：本轮 destructive proof 不单独重复记录
- `gm/maps/:mapId/runtime`：本轮 destructive proof 不单独重复记录
- `gm/database/state`：可用，restore 完成后 `lastJob` 与 checkpoint 信息正常回写

### 玩家主链

- 本轮未执行完整玩家主链；已有 `acceptance/full` 自动 gate 覆盖

### GM 面

- `gm-next`：本轮未单独重复执行；已有 `acceptance/full` 自动 gate 覆盖
- `gm/database/state`：已核对
- 其他：无

## 切换后 30-60 分钟观察

- 本轮未执行正式切换后观察
- 本轮执行结束后，已将本地 shadow 恢复为：
  - `maintenance=false`
  - `database.configured=true`
  - `readiness.ok=true`

## destructive / 备份恢复

- 是否执行 destructive：是
- `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`：是
- destructive preflight 结果：通过
- backup 结果：成功，`backupId=mo610e6a-23df76bc`
- download 结果：成功
- restore 结果：成功
- checkpoint / sourceBackupId / appliedAt：
  - `checkpointBackupId=mo610elj-9a6db43f`
  - `sourceBackupId=mo610e6a-23df76bc`
  - `appliedAt=2026-04-19T17:14:42.829Z`
  - `finishedAt=2026-04-19T17:14:42.887Z`

## 结论

- 是否成功：是
- 是否回滚：否
- 首个异常时间：无
- 首个异常症状：无
- 处理动作：演练结束后把本地 shadow 恢复到非维护态
- 后续跟进：
  - 真实生产/远程 shadow 切换时，仍需按 [10-cutover-execution-checklist.md](./10-cutover-execution-checklist.md) 做完整人工检查
