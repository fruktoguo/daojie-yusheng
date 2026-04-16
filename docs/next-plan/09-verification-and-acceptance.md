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
- [ ] 固定 `with-db` 门禁口径
- [ ] 固定 `acceptance` 门禁口径
- [ ] 固定 `full` 门禁口径
- [ ] 固定 `shadow-destructive` 门禁口径
- [ ] 给“数据迁移完成”补一条迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:replace-ready`
- [ ] 跑通 `pnpm verify:replace-ready:with-db`
- [ ] 跑通 `pnpm verify:replace-ready:acceptance`
- [ ] 跑通 `pnpm verify:replace-ready:full`
- [x] 跑通必要的 protocol audit
- [ ] 跑通必要的 boundary audit
- [ ] 跑通 next-only 的关键 smoke
- [ ] 整理验收结果文档

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

## 当前环境就绪度

我本轮已用本地 `.runtime/server-next.local.env` 复核过 `pnpm verify:server-next:doctor`，当前结果是：

- [x] `local`: ready
- [x] `with-db`: ready
- [x] `proof with-db`: ready
- [x] `shadow`: ready
- [x] `acceptance`: ready
- [x] `full`: ready
- [ ] `shadow-destructive`: 仍缺 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 和 maintenance-active shadow target

这表示：

- 现在 `with-db / acceptance / full` 已经不是“缺环境变量阻塞”。
- 真正还缺的是对应 gate 的实跑结果，尤其是 `acceptance`、`full`、`shadow-destructive`。

## 执行顺序

不要乱跳 gate，按下面顺序执行，才能快速定位问题：

### 第 1 步：先跑 doctor

- [ ] 每轮先跑 `pnpm verify:replace-ready:doctor`
- [ ] 只要 doctor 不是 `ready`，本轮不把失败归咎于代码

目的：

- 先分清楚是环境问题还是代码问题。

### 第 2 步：跑 `local`

- [ ] `pnpm build`
- [ ] `pnpm verify:replace-ready`

适用：

- 所有代码改动的默认最小 gate。

### 第 3 步：按改动面补最小 proof

- [ ] 涉及 auth / bootstrap / identity / snapshot 时，补 `pnpm verify:replace-ready:proof:with-db`
- [ ] 涉及 persistence / gm-database / restore 时，补 `pnpm verify:replace-ready:with-db`
- [ ] 涉及协议字段 / 发包时，补 `pnpm --filter @mud/server-next audit:next-protocol`
- [ ] 涉及 compat 删除时，补 `pnpm --filter @mud/server-next audit:legacy-boundaries`
- [ ] 涉及 GM 管理面时，补 `pnpm --filter @mud/server-next smoke:gm-next`

### 第 4 步：跑 `shadow`

- [ ] `pnpm verify:replace-ready:shadow`

适用：

- 涉及 shadow 实例、已部署实例最小验收、GM 只读面检查时。

### 第 5 步：跑 `acceptance`

- [ ] `pnpm verify:replace-ready:acceptance`

适用：

- 涉及玩家主链、GM 关键写路径、shadow 实物验收组合链时。

### 第 6 步：跑 `full`

- [ ] `pnpm verify:replace-ready:full`

适用：

- 涉及数据库运营面、GM database backup/restore proof 时。

### 第 7 步：只在维护窗口跑 `shadow-destructive`

- [ ] `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 pnpm verify:replace-ready:shadow:destructive`

前提：

- 已先通过 `shadow`
- 已明确维护窗口
- 已有回滚预案与操作者记录

## 按改动类型选验证

### 协议 / 发包 / PanelDelta / Bootstrap

- [ ] `pnpm build`
- [ ] `pnpm verify:replace-ready`
- [ ] `pnpm --filter @mud/server-next audit:next-protocol`

### compat 删除 / legacy 边界收缩

- [ ] `pnpm build`
- [ ] `pnpm --filter @mud/server-next audit:legacy-boundaries`
- [ ] `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- [ ] 如影响同步，再补 `pnpm --filter @mud/server-next smoke:runtime`

### auth / bootstrap / identity / snapshot

- [ ] `pnpm build`
- [ ] `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- [ ] `pnpm verify:replace-ready:proof:with-db`
- [ ] 如涉及持久化写入，再补 `pnpm verify:replace-ready:with-db`

### GM / admin / database / restore

- [ ] `pnpm build`
- [ ] `pnpm --filter @mud/server-next smoke:gm-next`
- [ ] `pnpm --filter @mud/server-next smoke:gm-database`
- [ ] `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`
- [ ] 如涉及已部署实例，再补 `pnpm verify:replace-ready:shadow` 或 `acceptance/full`

### runtime / combat / loot / monster / respawn

- [ ] `pnpm build`
- [ ] `pnpm --filter @mud/server-next smoke:runtime`
- [ ] `pnpm --filter @mud/server-next smoke:combat`
- [ ] `pnpm --filter @mud/server-next smoke:loot`
- [ ] `pnpm --filter @mud/server-next smoke:monster-runtime`
- [ ] `pnpm --filter @mud/server-next smoke:monster-combat`
- [ ] `pnpm --filter @mud/server-next smoke:player-respawn`

## 数据迁移 proof 链

`04` 完成后，这里要补一条固定 proof，不能只靠 dry-run。

- [ ] 跑 `pnpm --filter @mud/server-next migrate:legacy-next:once` 的样本/真实转换
- [ ] 用迁移后的 next 真源重新跑 `pnpm verify:replace-ready:proof:with-db`
- [ ] 补 `pnpm --filter @mud/server-next smoke:persistence`
- [ ] 涉及 GM scope 迁移时，补 `pnpm --filter @mud/server-next smoke:gm-database`
- [ ] 记录迁移前后摘要：
  - 迁了哪些域
  - 写入了哪些 next scope / 表
  - 丢弃了哪些可重建数据
  - 还剩哪些 legacy scope 未退役

## 失败归类规则

- `doctor` 不 ready
  - 归类为环境阻塞，不当成代码失败。
- `build` / `audit` 失败
  - 归类为代码或协议回归。
- `smoke` 失败
  - 归类为主链行为回归，必须写清是 `auth / session / runtime / gm / persistence` 哪一类。
- `shadow-destructive` 未跑
  - 归类为维护窗口未开放，不等于代码失败。
- `acceptance/full` 未跑
  - 如果 doctor 已 ready，就不能再写成“缺环境”；必须写“待实跑”。

## 完成定义

- [ ] 所有门禁都以 next 主链为口径
- [ ] 不再把“legacy 对齐”当作默认完成标准

## 当前验证结论

- [x] `pnpm build` 本地通过
- [x] `pnpm verify:replace-ready` 本地通过，已拿到 `[replace-ready] completed mode=local`
- [x] `pnpm verify:server-next:doctor`
  - 当前以本地 `.runtime/server-next.local.env` 复核，`local / with-db / proof with-db / shadow / acceptance / full` 都是 `ready`
- [ ] `pnpm verify:replace-ready:with-db`
  - 当前状态：已实跑，失败于 `readiness-gate-smoke.js exceeded 10000ms`
  - 失败命令：`pnpm verify:replace-ready:with-db`
  - 首要错误：`script readiness-gate-smoke.js failed: code=124`
- [ ] `pnpm verify:replace-ready:acceptance`
  - 当前状态：环境已 ready；此前本机跑过一轮并卡在 `readiness-gate-smoke.js exceeded 10000ms`，需要后续重新复跑并更新结果
- [ ] `pnpm verify:replace-ready:full`
  - 当前状态：环境已 ready，但本轮还没在这份文档下记一次实跑结果

## 交付记录格式

每次更新本文件时，至少记录：

- 跑了哪条 gate
- 是否带 DB
- 是否打的本地还是 shadow
- 是否覆盖 GM database / protocol audit / boundary audit
- 成功、失败、还是环境未就绪
- 失败时的首要错误
