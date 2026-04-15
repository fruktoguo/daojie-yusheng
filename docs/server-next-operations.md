# server-next 运维与验证

更新时间：2026-04-16

这份文档收口原先分散在 `packages/server/TESTING.md`、`packages/server/REPLACE-RUNBOOK.md`
与 workflow / wrapper 里的重复内容，统一回答四件事：

1. `server-next` 现在的验证口径是什么
2. `local / acceptance / full / shadow-destructive` 四层门禁分别怎么跑
3. 自动 proof 和人工回归边界怎么切
4. shadow / `gm/database/*` 演练时要注意什么

如需看前端重构本身、`client-next` UI 状态与前端专属验证口径，统一看 [docs/frontend-refactor/verification.md](./frontend-refactor/verification.md) 与 [docs/frontend-refactor/README.md](./frontend-refactor/README.md)。

## 当前定位

- `server-next` 当前仍是独立 shadow / replace-ready 线，不是默认正式生产入口。
- 所有 `verify:replace-ready*`、`shadow`、`gm/database` 相关命令，默认都只证明替换链路与运维链路可演练，不等于“已经可完整接班”。
- 当前推荐把文档里的门禁理解成四层：
  - `local`：本地主证明链
  - `acceptance`：本地主证明链 + shadow 实物验收 + shadow GM 关键写路径
  - `full`：`acceptance` 再加数据库运营面 proof
  - `shadow-destructive`：维护窗口内的破坏性数据库闭环，只允许显式开启
- 这四层不是同一件事的不同叫法，不能混读。
- `local` 只能回答“代码和主证明链是否绿”
- `acceptance` 只能回答“本地主证明链 + shadow 最小实物验收是否绿”
- `full` 只能回答“在数据库、shadow、GM 密码都齐备时，自动化门禁是否全绿”
- `shadow-destructive` 只能回答“维护窗口里的 destructive 闭环是否可控”，不回答日常替换是否完成

## 推荐入口

### 1. 本地默认入口

- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready`

用途：

- 先检查环境变量是否齐备
- 再跑 `client-next build`、本地主证明链、协议审计
- 如果存在 `DATABASE_URL` 或 `SERVER_NEXT_DATABASE_URL`，会自动转入带库链

### 2. 最小带库证明

- `pnpm verify:replace-ready:proof:with-db`

用途：

- 只复跑最小带库 `auth/token/bootstrap` 真源证明
- 适合排障，不适合替代完整带库回归

### 3. 带库闭环

- `pnpm verify:replace-ready:with-db`

用途：

- 跑本地 replace-ready 带库链
- 包括 `persistence` 与 `gm/database` 自动化回归

### 4. 已部署 shadow 实例验收

- `pnpm verify:replace-ready:shadow`

用途：

- 不自启本地服务
- 直接打 `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL`
- 验收 `/health`、GM 登录、`/gm/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime`，以及最小 next 会话链

### 5. 增强验收

- `pnpm verify:replace-ready:acceptance`

用途：

- 先跑 `local`
- 再跑 `shadow`
- 再跑 shadow 上的 `pnpm --filter @mud/server-next smoke:gm-next`

### 6. 最严格自动化门禁

- `pnpm verify:replace-ready:full`

用途：

- 强制要求数据库、shadow、GM 密码环境齐备
- 串行执行 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-next`
- 只证明自动化门禁，不代替人工运营回归

### 7. 维护窗口破坏性 proof

- `pnpm verify:replace-ready:shadow:destructive`

用途：

- 只在维护窗口执行
- 需要显式设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 用于 shadow 上单独验证 `backup -> download -> restore`
- 默认不应进入日常 deploy 链

## 环境变量矩阵

基础必填：

- `JWT_SECRET`
- `SERVER_NEXT_RUNTIME_TOKEN`

带库链额外需要：

- `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`

shadow / acceptance / full 额外需要：

- `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL`
- `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD`

shadow-destructive 额外需要：

- `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 维护窗口、回滚预案、操作人确认

按需：

- `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 或 `GM_DATABASE_BACKUP_DIR`
- `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1`
- `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1`
- `SERVER_NEXT_SMOKE_ALLOW_UNREADY=1`
- `SERVER_NEXT_RUNTIME_HTTP=1`
- `SERVER_NEXT_RUNTIME_MAINTENANCE=1` 或 `RUNTIME_MAINTENANCE=1`

## 当前门禁口径

### `local`

- 命令：`pnpm verify:replace-ready`
- 回答的问题：本地主证明链是否通过
- 不回答的问题：已部署实例是否通过、完整 GM/admin 人工回归是否通过

### `acceptance`

- 命令：`pnpm verify:replace-ready:acceptance`
- 回答的问题：本地主证明链、shadow 实例最小实物验收、shadow GM 关键写路径是否都通过
- 不回答的问题：完整运营面是否已自动化闭环

### `full`

- 命令：`pnpm verify:replace-ready:full`
- 回答的问题：在数据库、shadow 与 GM 密码都齐备时，最严格自动化链是否通过
- 不回答的问题：完整 GM/admin 人工回归是否全部完成

### `shadow-destructive`

- 命令：`pnpm verify:replace-ready:shadow:destructive`
- 回答的问题：维护窗口里的 shadow 破坏性数据库闭环是否可控
- 不回答的问题：日常 deploy 是否安全、完整运营回归是否都已完成

## 自动 proof / 人工回归

### 自动 proof

这些链默认应当可自动化复跑：

- `local`
- `proof:with-db`
- `with-db`
- `shadow`
- `acceptance` 里的本地与 shadow 自动部分
- `full`

### 模型辅助验证

像 `gpt-5.3-codex-spark` 这类快速模型，当前适合承担：

- 文档、README、workflow、runbook 的口径对账
- 代码面扫描，确认某条链路是否还存在 legacy 命名、compat facade 或明显遗漏
- 协议事件表、shared 类型表、面板 patch 路径这类“覆盖面核对”

它当前不应被当成下面这些问题的最终证明：

- `auth/token/bootstrap/session` 真源是否已经完成替换
- `acceptance/full/shadow-destructive` 是否已在真实环境闭环
- GM/admin/restore 运营链路是否已经可接班
- 某条高风险 runtime 语义是否真的“可删 compat”

这里的使用原则应当固定为：

- 模型可用于第一轮并行盘点、找口径漂移、找覆盖缺口
- 最终结论仍以 `build / smoke / audit / verify:replace-ready*` 和真实环境证据为准
- 任何“可以删 legacy / 可以宣布接班”的结论，都不能只来自模型阅读文档或代码

### 仍需人工确认

这些项不能被“命令存在”替代：

- `shadow-destructive` 的维护窗口是否真的开放
- `gm/database/*` 真实恢复后的业务态是否符合预期
- `gm-next` 输出里需要人工核对的只读摘要
- 真实 shadow / GM 环境是否按 runbook 完成演练

### 和 task-breakdown 对齐

- `T11` 负责把 `local / acceptance / full / shadow-destructive` 四层口径写死
- `T12` 负责把自动 proof 与人工回归边界分层
- `T14` 负责把 workflow 接成可选的 destructive 补证
- `T25` 负责把“完整替换完成”标准门禁化

## 常用包内子命令

需要局部排障时，再直接跑包内命令：

- `pnpm --filter @mud/server-next verify:replace-ready`
- `pnpm --filter @mud/server-next verify:proof:with-db`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:readiness-gate`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:gm-next`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:shadow`
- `pnpm --filter @mud/server-next smoke:shadow:gm-database`
- `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`
- `pnpm audit:server-next-boundaries`
- `pnpm audit:server-next-protocol`

如果工作区里其他包有未完成改动，导致 shared 编译阻塞，也可以只验证 `server-next` 自身：

```bash
node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server/tsconfig.json
```

说明：

- `smoke:legacy-auth` 与 `smoke:legacy-player-compat` 已从 active 主包删除，不再是默认验证入口。
- 旧兼容入口的剩余覆盖，当前统一收进 `smoke:next-auth-bootstrap`、`smoke:gm-next` 与 `next-legacy-boundary-audit`。

## shadow / 数据库演练要点

### 本地 shadow

1. `docker compose -f docker-compose.server-next.yml up -d --build`
2. `pnpm verify:replace-ready:doctor`
3. `pnpm verify:replace-ready:with-db`
4. `SERVER_NEXT_SHADOW_URL=http://127.0.0.1:11923 pnpm verify:replace-ready:shadow`
5. 如需 GM 关键写路径：`SERVER_NEXT_URL=http://127.0.0.1:11923 pnpm --filter @mud/server-next smoke:gm-next`

### `gm/database/*`

- `restore` 前必须显式进入维护态，且这一步不能只靠口头确认
- `restore` 会先自动生成 `pre_import` 检查点备份
- 并发重复触发 `backup/restore` 时，第二次请求应被拒绝
- 损坏备份应因为 `checksumSha256/documentsCount` 校验失败而被拒绝
- backup 后新增的建议单和 GM 直邮在 restore 后应消失，且 mail summary 应回到 backup 前基线
- `gm/database/state` 重启后仍应能看到 `lastJob / checkpointBackupId / sourceBackupId / appliedAt / finishedAt`
- 真实维护窗口结束后，要把 `checkpointBackupId / sourceBackupId` 与产物路径回写到文档

### 维护窗口 checklist

进入 `shadow-destructive` 前，至少要同时满足：

1. `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL` 已指向目标 shadow
2. `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD` 已就绪
3. `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 已显式设置
4. 维护窗口、回滚预案、负责人已经确认
5. 先执行非破坏性 `shadow` / `gm-next` 验证，再执行 destructive proof
6. destructive 结束后立刻检查 `backup / download / restore / checkpoint metadata`

### 已部署 shadow

1. 先确保 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 已配置
2. 跑 `pnpm verify:replace-ready:shadow`
3. 再跑 `pnpm --filter @mud/server-next smoke:gm-next`
4. 如需破坏性数据库闭环，再进入维护窗口执行 `pnpm verify:replace-ready:shadow:destructive`

### `acceptance` 与 `full` 的边界

- `acceptance` 不要求 destructive
- `full` 也不自动包含 destructive
- `shadow-destructive` 是单独的维护窗口证明，不是日常替换门禁的一部分
- 不能把 `acceptance` 或 `full` 误读为“已经完成所有人工运营回归”

## 观察重点

- `/health` 是否符合 readiness 语义
- next socket 是否只收到 next 事件，不混入 legacy `s:*`
- guest canonical 会话语义是否保持：首登不依赖客户端自带 `playerId`，重连只认 detached `sessionId`
- `gm/maps`、`gm/editor-catalog`、`gm/maps/:mapId/runtime` 三个管理只读面是否稳定
- `gm/database/state` 与 restore 实际阶段是否一致
- backup dir 是否确实挂在独立持久卷
- `shadow-destructive` 是否只在维护窗口、显式开关、回滚预案齐备时执行

## 相关文档

- 当前状态与缺口：[next-gap-analysis.md](next-gap-analysis.md)
- 剩余执行方案：[next-remaining-execution-plan.md](next-remaining-execution-plan.md)
- 详细任务拆分：[next-remaining-task-breakdown.md](next-remaining-task-breakdown.md)
- legacy 清理门槛：[next-legacy-removal-checklist.md](next-legacy-removal-checklist.md)
- legacy 边界审计：[next-legacy-boundary-audit.md](next-legacy-boundary-audit.md)
- 协议审计：[next-protocol-audit.md](next-protocol-audit.md)
