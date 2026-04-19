# 09 验证门禁与验收

目标：把“能不能接班”收成 next 主线自己的门禁，不再靠 legacy 对齐口径。

## 当前口径

- 这份文档只管 next 主线 gate，不负责替代运维手册。
- gate 口径以：
  - `packages/server/TESTING.md`
  - `docs/server-next-operations.md`
  - 根级 `verify:replace-ready*` / `verify:server-next*` wrapper
  为准。
- `verify:server-next*` 现在只是兼容别名；主口径仍是 `verify:replace-ready*`。

## 任务

- [x] 固定 `local` 门禁口径
- [x] 固定 `with-db` 门禁口径
- [x] 固定 `acceptance` 门禁口径
- [x] 固定 `full` 门禁口径
- [x] 固定 `shadow-destructive` 门禁口径
- [x] 给“数据迁移完成”补一条迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:replace-ready`
- [x] 跑通 `pnpm verify:replace-ready:with-db`
- [x] 跑通 `pnpm verify:replace-ready:acceptance`
- [x] 跑通 `pnpm verify:replace-ready:full`
- [x] 跑通必要的 protocol audit
- [x] 跑通必要的 boundary audit
- [x] 跑通 next-only 的关键 smoke
- [x] 整理验收结果文档

## Gate 对照表

| Gate | 主命令 | 回答什么 | 必要环境 | 不回答什么 |
| --- | --- | --- | --- | --- |
| `local` | `pnpm verify:replace-ready` | 本地 build、本地主证明链、协议审计是否通过 | 无 | shadow 实物验收、GM 运营面、维护窗口 destructive |
| `with-db` | `pnpm verify:replace-ready:with-db` | 带库持久化 proof 是否成立 | `DATABASE_URL` 或 `SERVER_NEXT_DATABASE_URL` | shadow、GM 关键写路径、破坏性 proof |
| `proof:with-db` | `pnpm verify:replace-ready:proof:with-db` | 最小 auth/token/bootstrap 带库证明链 | `DATABASE_URL` 或 `SERVER_NEXT_DATABASE_URL` | 完整 persistence / GM / shadow |
| `shadow` | `pnpm verify:replace-ready:shadow` | 已部署实例的最小只读验收 | `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL`，以及 GM 密码 | 数据库运营面、destructive |
| `acceptance` | `pnpm verify:replace-ready:acceptance` | `local + shadow + gm-next` 是否一起通过 | DB 非必须，但 shadow URL 与 GM 密码必须齐 | destructive、完整人工运营回归 |
| `full` | `pnpm verify:replace-ready:full` | `with-db -> gm-database -> backup-persistence -> shadow -> gm-next` 是否全绿 | DB + shadow URL + GM 密码 | destructive、真实维护窗口演练 |
| `shadow-destructive` | `pnpm verify:replace-ready:shadow:destructive` | shadow 维护窗口下 `backup -> download -> restore` 是否可控 | shadow URL + GM 密码 + `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` + 维护窗口 | 日常替换是否完成 |
| `shadow-destructive:preflight` | `pnpm verify:replace-ready:shadow:destructive:preflight` | destructive 开关与 target maintenance-active 是否就绪 | shadow URL + GM 密码 + `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` | destructive proof 本身是否已执行 |

## 当前环境就绪度

当前这份计划只记录“如何判断环境 ready”，不把某一台机器的 env 文件路径当长期事实。根级 `verify:replace-ready*` 和 `packages/server` 包内直接执行的 `verify/smoke` 当前都会默认尝试加载：

- `.runtime/server-next.local.env`
- `.env`
- `.env.local`
- `packages/server/.env`
- `packages/server/.env.local`

因此当前 shell 即使没有手工 `source`，也不应再把本地已存在的默认 env 文件误判成“变量缺失”。

当前 shell 环境参考结论是：

- [x] `local`: ready
- [x] `with-db`: ready
- [x] `proof with-db`: ready
- [x] `shadow`: ready
- [x] `acceptance`: ready
- [x] `full`: ready

补充区分：

- 默认 shell 下，`shadow-destructive` 仍不是常开 ready 状态；它必须显式进入 maintenance-active 窗口并设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 但本轮已经补过一次本机 maintenance-active shadow destructive proof，见：
  - [10-cutover-execution-log-2026-04-20-local-shadow-destructive.md](./10-cutover-execution-log-2026-04-20-local-shadow-destructive.md)

这表示：

- 当前 `shadow / acceptance` 已可在本机 next shadow 上实跑。
- 当前 `local / with-db / shadow / acceptance / full` 都已在本轮实跑通过。
- `shadow-destructive` 不应沿用历史结果冒充完成，但本轮本机 maintenance-active destructive 证据已经补齐。

## 执行顺序

不要乱跳 gate，按下面顺序执行，才能快速定位问题：

### 第 1 步：先跑 doctor

- [x] 每轮先跑 `pnpm verify:replace-ready:doctor`

执行原则：

- 只要 doctor 不是 `ready`，本轮不把失败归咎于代码

目的：

- 先分清楚是环境问题还是代码问题。

### 第 2 步：跑 `local`

推荐命令：

- `pnpm build`
- `pnpm verify:replace-ready`

适用：

- 所有代码改动的默认最小 gate。

### 第 3 步：按改动面补最小 proof

推荐补跑：

- 涉及 auth / bootstrap / identity / snapshot 时，补 `pnpm verify:replace-ready:proof:with-db`
- 涉及 persistence / gm-database / restore 时，补 `pnpm verify:replace-ready:with-db`
- 涉及协议字段 / 发包时，补 `pnpm --filter @mud/server-next audit:next-protocol`
- 涉及 compat 删除时，补 `pnpm --filter @mud/server-next audit:legacy-boundaries`
- 涉及 GM 管理面时，补 `pnpm --filter @mud/server-next smoke:gm-next`

### 第 4 步：跑 `shadow`

推荐命令：

- `pnpm verify:replace-ready:shadow`

适用：

- 涉及 shadow 实例、已部署实例最小验收、GM 只读面检查时。

### 第 5 步：跑 `acceptance`

- [x] `pnpm verify:replace-ready:acceptance`

适用：

- 涉及玩家主链、GM 关键写路径、shadow 实物验收组合链时。
- 这条 gate 固定先跑 `local`，即使当前 shell 同时带了 DB 变量，也不应自动升级成 `with-db`。

### 第 6 步：跑 `full`

- [x] `pnpm verify:replace-ready:full`

适用：

- 涉及数据库运营面、GM database backup/restore proof 时。

### 第 7 步：只在维护窗口跑 `shadow-destructive`

推荐命令：

- `pnpm verify:replace-ready:shadow:destructive:preflight`
- `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 pnpm verify:replace-ready:shadow:destructive`

前提：

- 已先通过 `shadow`
- destructive preflight 已确认 target `maintenance-active`
- 已明确维护窗口
- 已有回滚预案与操作者记录

## 按改动类型选验证

### 协议 / 发包 / PanelDelta / Bootstrap

- `pnpm build`
- `pnpm verify:replace-ready`
- `pnpm --filter @mud/server-next audit:next-protocol`

### compat 删除 / legacy 边界收缩

- `pnpm build`
- `pnpm --filter @mud/server-next audit:legacy-boundaries`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- 如影响同步，再补 `pnpm --filter @mud/server-next smoke:runtime`

### auth / bootstrap / identity / snapshot

- `pnpm build`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm verify:replace-ready:proof:with-db`
- 如涉及持久化写入，再补 `pnpm verify:replace-ready:with-db`

### GM / admin / database / restore

- `pnpm build`
- `pnpm --filter @mud/server-next smoke:gm-next`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`
- 如涉及已部署实例，再补 `pnpm verify:replace-ready:shadow` 或 `acceptance/full`

### runtime / combat / loot / monster / respawn

- `pnpm build`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:loot`
- `pnpm --filter @mud/server-next smoke:monster-runtime`
- `pnpm --filter @mud/server-next smoke:monster-combat`
- `pnpm --filter @mud/server-next smoke:player-respawn`

## 数据迁移 proof 链

`04` 完成后，这里要补一条固定 proof，不能只靠 dry-run。

- [x] 跑 `pnpm --filter @mud/server-next migrate:legacy-next:once` 的样本/真实转换
- [x] 用迁移后的 next 真源重新跑 `pnpm verify:replace-ready:proof:with-db`
- [x] 补 `pnpm --filter @mud/server-next smoke:persistence`
- [x] 涉及 GM scope 迁移时，补 `pnpm --filter @mud/server-next smoke:gm-database`
- [x] 记录迁移前后摘要：
  - 迁了哪些域
  - 写入了哪些 next scope / 表
  - 丢弃了哪些可重建数据
  - 还剩哪些 legacy scope 未退役

补充说明：

- 这里的 `[x]` 表示 `04` 已固定历史 proof 链与摘要记录，见 `04-one-off-migration-script.md` 的正式转换 proof 链与本轮实跑记录。
- 它不自动等价于“当前轮次 with-db / acceptance / full 已重新实跑完成”；当前轮次 gate 是否重跑，仍以上面的环境就绪度与当前验证结论为准。

## 失败归类规则

- `doctor` 不 ready
  - 归类为环境阻塞，不当成代码失败。
- `build` / `audit` 失败
  - 归类为代码或协议回归。
- `smoke` 失败
  - 归类为主链行为回归，必须写清是 `auth / session / runtime / gm / persistence` 哪一类。
- `shadow-destructive` 未跑
  - 归类为维护窗口未开放，不等于代码失败。
- `shadow-destructive` 未跑
  - 如果 doctor 已 ready，也不能把 destructive 维护窗口 proof 冒充成“默认日常 gate 已完成”。

## 完成定义

- [x] 所有门禁都以 next 主链为口径
- [x] 不再把“legacy 对齐”当作默认完成标准

## 当前验证结论

下面这组状态只作为当前记录示例，后续应随实跑结果更新，不应把它当永久事实。

这里必须强制区分三件事：

- `doctor ready`
- `local mode` 的 `verify:replace-ready` 是否通过
- 带数据库环境时 `with-db` / `acceptance` / `full` 是否通过

它们不是同一件事，不能互相替代。

当前卡点也要拆开处理，不要混成一个“大门禁失败”：

1. 先确认是环境问题还是代码问题
2. 单独定位 `with-db` 里的首个失败命令
3. 如果失败点在 `next-auth-bootstrap-smoke.js`，继续拆成：
   - 坏快照记录
   - auth trace 合同不一致
4. 只有 `with-db` 过了，才继续看 `acceptance/full`

- [x] `pnpm build` 本地通过
- [x] `pnpm verify:replace-ready` 本地通过，已拿到 `[replace-ready] completed mode=local`
- [x] `pnpm verify:server-next:doctor`
  - 历史别名命令仍可用，但当前主口径已切到 `pnpm verify:replace-ready:doctor`
- [x] `pnpm verify:replace-ready:doctor`
  - 当前 shell 实跑结果：`local / with-db / proof with-db / shadow / acceptance / full` 为 `ready`
  - `shadow target probe` 当前为 `ready (reachable_with_nonready_health_503)`
  - 当前只剩 `shadow-destructive` 仍未就绪
- [x] `pnpm --filter @mud/server-next audit:legacy-boundaries`
  - 本轮实跑结果：`docs/next-legacy-boundary-audit.md` 已刷新为 `matched 0/18 checks, 0 code hits`
- [x] `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
  - 本轮实跑结果：local 无库 profile 下通过，输出 `reason=no_db_legacy_http_memory_fallback_disabled`
- [x] `pnpm --filter @mud/server-next smoke:gm-next`
  - 本轮实跑结果：local 无库 profile 下通过，输出 `reason=no_db_legacy_http_memory_fallback_disabled`
- [x] `pnpm verify:replace-ready:with-db`
  - 本轮实跑结果：默认本地 env 自动加载后通过，输出 `[replace-ready:with-db] completed`
  - 当前带库链路已覆盖到 `audit:server-next-protocol`，并刷新 `docs/next-protocol-audit.md`
- [x] `pnpm proof:replace-ready-gates`
  - 本轮实跑结果：`doctor / acceptance / full` 的脚本边界、root wrapper 和 `09/TESTING` 文档口径已固定一致
- [x] `shadow target probe`
  - 当前口径已固定到 `doctor / shadow` wrapper：
    - 不能只看 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 和 `GM_PASSWORD` 是否存在
    - 还要确认 `/health` 可达，且 `/api/auth/gm/login` 不是 `404`
    - 否则只能算“变量存在，但目标不是 next shadow 入口”
- [x] `pnpm verify:replace-ready:acceptance`
  - 本轮先暴露出 gate 漂移：当前 shell 带 DB 时，`acceptance` 首段被偷偷升级成 `with-db`
  - 已修正为固定先跑 `local`
  - 随后补齐了 shadow target probe、`shadow-smoke` 的 `503/liveness` 兼容、以及 `gm-next` 不再被 DB 变量误带偏
  - 当前已在本机 `127.0.0.1:11923` next shadow 实例上实跑通过
- [x] `pnpm verify:replace-ready:shadow`
  - 本轮实跑结果：本机 `127.0.0.1:11923` next shadow 已通过 `/health`、GM 登录、`/gm/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 与最小 next 会话链
- [x] `pnpm verify:replace-ready:full`
  - 本轮先后修掉了三类真实阻塞：
  - 本地数据库 URL 指错到 `127.0.0.1:5432/mud_next`
  - `next-auth-bootstrap-smoke` 的 `token_seed` recovery trace 断言过时
  - `gm-next-smoke` 在本地带库 proof 环境里会被旧 GM 密码记录污染
  - 最终 `with-db -> gm-database -> backup-persistence -> shadow -> gm-next` 已全链通过
- [x] `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 pnpm verify:replace-ready:shadow:destructive:preflight`
  - 本轮在本机 `127.0.0.1:11923` maintenance-active shadow 上通过
  - 当前阻塞已从“脚本/口径未固定”收敛成“只有进入 maintenance-active 时才允许继续 destructive”
- [x] `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 pnpm verify:replace-ready:shadow:destructive`
  - 本轮在本机 maintenance-active shadow 上通过
  - 已完成一次 `backup -> download -> restore` destructive proof
  - 关键证据：
    - `backupId=mo610e6a-23df76bc`
    - `checkpointBackupId=mo610elj-9a6db43f`
  - 执行记录已写入：
    - [10-cutover-execution-log-2026-04-20-local-shadow-destructive.md](./10-cutover-execution-log-2026-04-20-local-shadow-destructive.md)
- [x] 迁移 proof 链已固定到 `04`
  - 当前仓库记录已包含：`migrate-next-mainline-once --write -> verify:replace-ready:proof:with-db -> smoke:persistence -> smoke:gm-database -> smoke:progression -> smoke:runtime`

## 交付记录格式

每次更新本文件时，至少记录：

- 跑了哪条 gate
- 是否带 DB
- 是否打的本地还是 shadow
- 是否覆盖 GM database / protocol audit / boundary audit
- 成功、失败、还是环境未就绪
- 失败时的首要错误
