# next Replacement Wave 1 — 下一步执行计划

## TL;DR
> **Summary**: 先把 next 的四层门禁与证明链口径一次性“写死”，再收口 `auth/token/bootstrap/snapshot/session` 真源主线，最后并行推进性能尾项与真实环境补证，确保 L1-L5 删除前置条件不被提前触发。
> **Deliverables**: `docs/next-remaining-execution-plan.md` 与 `server-next` 口径闭环、T01/T02/T03/T05/T06/T07 收口、`T09/T10/T13/T24` 真实环境与策略定稿、`T15/T16/T19/T22/T23` 性能/稳定性验收。
> **Effort**: Medium
> **Parallel**: YES - 3 Waves
> **Critical Path**: T11/T12/T25 → T01/T03/T05/T06/T07 → (with-db/real-shadow) → T09/T10/T15/T16/T19/T22/T23 → T13/T24

## Context

### Original Request
- 全量盘点 `server-next` 的 next 进度，建立下一步可执行计划。
- 持续以文档事实为约束，避免 `local/acceptance/full/shadow-destructive` 混读。

### Interview Summary
- 已确认 `server-next` 当前定位仍是 shadow / replace-ready 验收线，不是默认生产入口。
- 已确认剩余任务数 `25`，保守剩余 `35% ~ 40%`。
- 关键主线是 `auth/token/bootstrap/snapshot/session` 真源替换（T01~T07）和证明链口径治理（T11/T12/T25）。

### Metis Review (gaps addressed)
- 补齐了“验收标准必须可执行命令化”的缺口。
- 明确了禁并改范围：`T01/T03/T05`、`T05/T06/T07`、`T16/T20` 为硬阻塞禁并改组。
- 将真实环境补证（with-db / shadow / destructive）作为后续推进门槛，未把自动 proof 当人工最终结论。
- 由风险视角新增了“单点回退路径”和“观测告警阈值触发回退”条目。

## Work Objectives

### Core Objective
- 用一个版本锁定的执行节奏，把下一阶段在 **4 周内** 可观测地推进，先提高“可安全接班”的证据完整度，再持续压实真源替换。

### Deliverables
- 口径同步：`README + TESTING + RUNBOOK + workflow + execution-plan` 一致。
- 主线真源：T01/T02/T03/T05/T06/T07 进入可稳定验收状态。
- 运行证据：至少一次 `with-db`、一次 `acceptance`、一次 `full` 以及一次 `shadow:destructive` 的真实环境记录。
- 兼容策略：T13/T24 输出明确保留策略清单。

### Definition of Done (verifiable)
- `pnpm verify:replace-ready`、`pnpm verify:replace-ready:with-db`、`pnpm verify:replace-ready:acceptance`、`pnpm verify:replace-ready:full`、`pnpm verify:replace-ready:shadow:destructive` 在环境齐备时连续通过。
- `docs/next-remaining-task-breakdown.md` 与 `docs/next-remaining-execution-plan.md` 的任务状态与依赖在每轮后更新。
- `docs/next-legacy-removal-checklist.md` 中 L1-L5 的状态变化与触发条件都以脚本/运行记录映射。
- 未出现 `legacy_runtime` 主链回退到兼容路径，关键契约（auth/bootstrap/session）出现 `next-source` 单线证据。

### Must Have
- 文档口径优先级固定：`packages/server-next/README.md`、`packages/server-next/TESTING.md`、`docs/server-next-operations.md`、`packages/server-next/package.json`、`docs/next-legacy-removal-checklist.md`。
- 所有任务必须写入可执行验收命令 + 失败回退动作。
- 禁止删除/改动任何被 `L1-L2` 标记的运行主链文件。

### Must NOT Have
- 把 `local/acceptance/full` 混为一条通过线；
- 把“自动 proof 通过”直接视为真实环境长期可行；
- 在 `T01/T03/T05/T06/T07` 期间混入无关性能/界面改动。

## Verification Strategy

> ZERO HUMAN INTERVENTION — execution agent handles all verification.

- Test decision: **tests-after**（以已有 replace-ready 门禁链作为主验证主线，按阶段补齐；每任务均配套最小验证 + 失败回退）。
- QA policy: 每个任务包含至少 1 个成功路径 + 1 个失败路径。
- Evidence outputs: `.sisyphus/evidence/task-<N>-<slug>.md`

## Execution Strategy

### Parallel Execution Waves
- **Wave 1**: 门禁口径收口（T11/T12/T25）
- **Wave 2**: 真源主线收口（T01/T03/T05/T06/T07，含 T02）
- **Wave 3**: 环境补证 + 性能尾项 + shared 稳定 + compat 策略（T09/T10/T15/T16/T19/T22/T23/T13/T24）

### Dependency Matrix (selected)
- Hard chain: `T01 -> T02 -> T03 -> T04 -> T05 -> T06 -> T07`
- Proof chain: `T11 -> T12 -> T14 -> T25`
- Perf chain: `T15 -> T16 -> T17 -> T18 -> T19 -> T20`
- Stability chain: `T22 -> T23`
- Compat strategy: `T24` after stable mainline and proof chain

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1: 3 tasks / 1s; prefer `tick-runtime-author` + `network-protocol-author`
- Wave 2: 6 tasks / 1s; prefer `tick-runtime-author` (+ `runtime-performance-author` when touching profiler-sensitive paths)
- Wave 3: 9 tasks / 1s; split into `performance`, `network-protocol-author`, `server-next-verify`

## TODOs
> Implementation + Test are fused in each task.

- [ ] 1. 统一门禁/验收口径为单一版本（T11/T12/T25）

  **What to do**:
  - 以 `packages/server-next/README.md` 为入口口径锚点，核对 `local / acceptance / full / shadow-destructive` 四层职责。
  - 同步 `packages/server-next/TESTING.md` 与 `docs/server-next-operations.md` 的“命令-回答问题”映射。
  - 在 `docs/next-remaining-execution-plan.md` 和 `docs/next-remaining-task-breakdown.md` 写入“本轮完成门槛”与“门禁化输出映射”。
  - 检查 `verify-server-next-with-db.yml` 与本地 script 口径是否与文档一致。
  - 产出“完整替换完成判定清单（与 T25 对齐）”。

  **Must NOT do**:
  - 不得将 with-db 或 acceptance 误判为完整生产可接班；不改动 `T01~T07` 业务代码。

  **Recommended Agent Profile**:
  - Category: `network-protocol-author` — Reason: 文档口径和验证边界有高度依赖。
  - Skills: [`network-protocol`, `server-next-verify`] — Why: 门禁语义与自动 proof 的一致性。
  - Omitted: `runtime-performance-author` — Why: 与热路径优化无关。

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: none | Blocked By: none

  **References**:
  - `packages/server-next/README.md:20-75` — 四层门禁定义与命令入口
  - `packages/server-next/TESTING.md:22-89` — local/acceptance/full/shadow-destructive 边界
  - `.github/workflows/verify-server-next-with-db.yml:10-52` — with-db 工作流
  - `docs/next-remaining-execution-plan.md:98-105` — 本轮优先执行顺序

  **Acceptance Criteria**:
  - [ ] 口径一致性检查：三个口径文件的四层定义与示例问题集一一一致。
  - [ ] `T11/T12/T25` 任务记录状态由“完成待验证”转为“完成（本轮）”并附最小变更说明。
  - [ ] 见证文档中不再出现把 `acceptance/full/shadow-destructive` 混读的描述。

  **QA Scenarios**:
  ```
  Scenario: 文档与命令一体化自检
    Tool: Bash
    Steps:
      1. 执行 `cat packages/server-next/README.md | rg "local / acceptance / full / shadow-destructive"`
      2. 执行 `cat packages/server-next/TESTING.md | rg "pnpm verify:replace-ready"`
      3. 执行 `cat .github/workflows/verify-server-next-with-db.yml | rg "verify:replace-ready:with-db"`
    Expected: 三处引用与命令均一致，不遗漏 `shadow-destructive`。
    Evidence: .sisyphus/evidence/task-1-gate-docs.md

  Scenario: 误读防护
    Tool: Bash
    Steps:
      1. 搜索文档中是否出现 “`local/acceptance/full` 混读”字样。
      2. 记录并修正所有示例。
    Expected: 无混读口径。
    Evidence: .sisyphus/evidence/task-1-gate-docs-error.md
  ```

  **Commit**: NO | Message: `docs(next): align replace-ready gates` | Files: docs/next-remaining-execution-plan.md, docs/next-remaining-task-breakdown.md, packages/server-next/README.md, packages/server-next/TESTING.md, docs/server-next-operations.md

- [ ] 2. 收口 T01：authenticated 路径移除 runtime legacy identity fallback

  **What to do**:
  - 在 auth 与 bootstrap 代码路径中确认 `protocol=next` 不回落到 legacy runtime fallback。
  - 记录并固化 trace/错误码：`next` 缺省必须失败，不得进入 legacy 兼容主链。
  - 复跑 smoke 验证链；补齐失败场景断言。

  **Must NOT do**:
  - 不允许在该任务中改动 GM/restore 或 shared 协议字段。

  **Recommended Agent Profile**:
  - Category: `tick-runtime-author` — Reason: auth/session 运行时主线。
  - Skills: [`tick-runtime-author`] — Why: 关键主线语义。
  - Omitted: `runtime-performance-author` — Why: 本任务以正确性为先。

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Task 1 | Blocked By: task 1

  **References**:
  - `docs/next-remaining-task-breakdown.md:244-260` — T01 状态与完成定义
  - `docs/next-remaining-execution-plan.md:244-260` — 真实主链目标说明
  - `packages/server-next/src/network/world-player-auth.service.js` — auth 主逻辑（任务引用）
  - `packages/server-next/src/network/world-session-bootstrap.service.js` — bootstrap 主逻辑（任务引用）
  - `packages/server-next/src/network/world-player-source.service.js` — source 路由职责引用

  **Acceptance Criteria**:
  - [ ] `next-auth-bootstrap-mainline` 与 `next-auth-bootstrap-migration` 在 legacy 不应成功兜底的场景报错。
  - [ ] trace 不再出现 runtime compat identity 成功来源。
  - [ ] 通过 `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`。

  **QA Scenarios**:
  ```
  Scenario: Happy path
    Tool: Bash
    Steps:
      1. `pnpm --filter @mud/server-next compile`
      2. `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
      3. `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-migration --require-legacy-auth`
    Expected: both cases pass and logs show migration-only compat entry for legacy path.
    Evidence: .sisyphus/evidence/task-2-t01-mainline.md

  Scenario: Failure/edge
    Tool: Bash
    Steps:
      1. 在测试环境模拟 protocol=legacy token with next protocol bootstrap.
      2. 观察拒绝码与错误日志。
    Expected: 报错 `AUTH_PROTOCOL_REQUIRED` 或等效拒绝，不进行 runtime fallback。
    Evidence: .sisyphus/evidence/task-2-t01-mainline-edge.md
  ```

  **Commit**: YES | Message: `fix(server-next): harden next auth source path` | Files: packages/server-next/src/network/world-player-auth.service.js, packages/server-next/src/network/world-session-bootstrap.service.js, packages/server-next/src/network/world-player-source.service.js, packages/server-next/src/persistence/player-identity-persistence.service.js

- [ ] 3. 收口 T02/T03：source 与 snapshot 的 next-native 边界

  **What to do**:
  - 将 `WorldPlayerSourceService` 从 legacy facade 切分为 next/native 与 migration 明确 provider。
  - 继续将 snapshot runtime fallback 收敛到 no-persistence 特例，不允许 authenticated 主链读取 compat snapshot。
  - 保留迁移工具语义，不把迁移路径当主语义主链。

  **Must NOT do**:
  - 不清空 legacy provider 文件；只在 `L1/L2` 到位前保留移除前提。

  **Recommended Agent Profile**:
  - Category: `tick-runtime-author` — Reason: source/snapshot 与会话路径高度耦合。
  - Skills: [`tick-runtime-author`, `runtime-performance-author`] — Why: high-risk path + fallback 性能稳定。
  - Omitted: `ui-performance-author`

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: none | Blocked By: task 2

  **References**:
  - `docs/next-remaining-task-breakdown.md:266-310` — T02/T03 目标与验收
  - `packages/server-next/src/network/world-player-source.service.js`
  - `packages/server-next/src/network/world-player-snapshot.service.js`
  - `packages/server-next/src/persistence/player-identity-persistence.service.js`
  - `packages/server-next/src/persistence/player-snapshot-compat.js`

  **Acceptance Criteria**:
  - [ ] `WorldPlayerSourceService` 不再以 legacy facade 方式主链消费。
  - [ ] authenticated 主链不再 runtime 读取 compat snapshot。
  - [ ] 通过 `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case legacy-player-compat --case next-auth-bootstrap --require-legacy-auth`。

  **QA Scenarios**:
  ```
  Scenario: Happy path
    Tool: Bash
    Steps:
      1. `pnpm --filter @mud/server-next compile`
      2. `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
    Expected: 通过且主链 trace 显示 no legacy fallback。
    Evidence: .sisyphus/evidence/task-3-t02t03-mainline.md

  Scenario: Failure/edge
    Tool: Bash
    Steps:
      1. 引入 snapshot preseed 失败场景，执行 `next-auth-bootstrap-mainline`。
      2. 验证是否拒绝并返回明确错误，不再回退到 runtime legacy。
    Expected: preseed 失败触发拒绝且无 legacy 主链 fallback。
    Evidence: .sisyphus/evidence/task-3-t02t03-edge.md
  ```

  **Commit**: YES | Message: `feat(server-next): split native and migration source path` | Files: packages/server-next/src/network/world-player-source.service.js, packages/server-next/src/network/world-legacy-player-source.service.js, packages/server-next/src/network/world-player-snapshot.service.js, packages/server-next/src/persistence/player-snapshot-compat.js

- [ ] 4. 收口 T05/T06/T07：connect-token/handshake/session 合规边界

  **What to do**:
  - 固化 `connect_token` 单线握手：`hello` 不再作为 auth/bootstrap 兜底；`guest / authenticated / GM` 三类错误码统一。
  - 收口 session 恢复边界（sessionId 长度和字符白名单 + 过期回收），避免 forged 恢复旁路。
  - 形成设计文档片段写入 `docs/next-remaining-task-breakdown.md`。

  **Must NOT do**:
  - 不在本任务改 shared 侧或 client-only 逻辑。

  **Recommended Agent Profile**:
  - Category: `tick-runtime-author` — Reason: 运行时会话链路核心。
  - Skills: [`tick-runtime-author`] — Why: 直接影响断线恢复、会话安全。
  - Omitted: `ui-performance-author`

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T01/T02 | Blocked By: task 2, task 3

  **References**:
  - `docs/next-remaining-task-breakdown.md:60-47` (批次/依赖与已做收口)
  - `docs/next-remaining-task-breakdown.md:244-307` (T01~T04 context and chain)
  - `packages/server-next/src/network/world-gateway.js`
  - `packages/server-next/src/network/world-session-bootstrap.service.js`
  - `packages/server-next/src/network/world-session.service.js`

  **Acceptance Criteria**:
  - [ ] `HELLO_AUTH_BOOTSTRAP_FORBIDDEN` 等拒绝行为稳定可复现。
  - [ ] `sessionId` 洁净规则（长度、白名单）生效， forged sid 被阻断。
  - [ ] `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap --require-legacy-auth` 通过。

  **QA Scenarios**:
  ```
  Scenario: Happy path
    Tool: Bash
    Steps:
      1. `pnpm --filter @mud/server-next compile`
      2. `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
    Expected: token/gmToken 的 hello 仅在 connect-bootstrap 成功后可继续。
    Evidence: .sisyphus/evidence/task-4-t05t06t07-handshake.md

  Scenario: Failure/edge
    Tool: Bash
    Steps:
      1. 发送非法 protocol/超长 sessionId / forged requestedSessionId。
      2. 验证报错路径与拒绝日志。
    Expected: 400/拒绝事件 + 无主链 fallback。
    Evidence: .sisyphus/evidence/task-4-t05t06t07-edge.md
  ```

  **Commit**: YES | Message: `fix(server-next): harden session bootstrap contracts` | Files: packages/server-next/src/network/world-gateway.js, packages/server-next/src/network/world-session-bootstrap.service.js, packages/server-next/src/network/world-session.service.js

- [ ] 5. 以真实环境补证主线（T09/T10）：with-db 与 shadow-destructive/备份恢复

  **What to do**:
  - 取得可复现 with-db 与 shadow 维护窗口执行记录：`verify:replace-ready:with-db`、`verify:replace-ready:acceptance`、`verify:replace-ready:full`、`verify:replace-ready:shadow:destructive`。
  - 针对 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 的 destructive 记录补齐恢复后行为（backup/download/restore）。

  **Must NOT do**:
  - 不在未完成 T11/T12/T25 的口径前修改 runbook。

  **Recommended Agent Profile**:
  - Category: `server-next-verify` — Reason: 验证链和运维流程。
  - Skills: [`server-next-verify`] — Why: proof 与真实环境闭环。
  - Omitted: `ui-performance-author`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: task 1 | Blocked By: task 1

  **References**:
  - `packages/server-next/TESTING.md:95-117` — T11/T12 与 verify 命令对照
  - `docs/next-remaining-task-breakdown.md:173-190` — T09/T10状态说明
  - `.github/workflows/verify-server-next-with-db.yml:48-52`
  - `packages/server-next/package.json:79-86,10-23`
  - `docs/server-next-operations.md`（真实维护窗口与补证口径）

  **Acceptance Criteria**:
  - [ ] with-db、acceptance、full、shadow-destructive 在真实环境记录中通过。
  - [ ] evidence 文件包含环境变量快照、时间、命令输出摘要、关键失败修复项。
  - [ ] gm 恢复与备份回归在恢复后 `mail summary` 与 `lastJob` 语义满足脚本断言。

  **QA Scenarios**:
  ```
  Scenario: Happy path
    Tool: Bash
    Steps:
      1. 设置环境变量（`DATABASE_URL`, `SERVER_NEXT_SHADOW_URL`, `SERVER_NEXT_GM_PASSWORD`, `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`）
      2. 运行 `pnpm verify:replace-ready:with-db`
      3. 运行 `pnpm verify:replace-ready:acceptance`
      4. 运行 `pnpm verify:replace-ready:full`
      5. 运行 `pnpm verify:replace-ready:shadow:destructive`
    Expected: 四条均通过并记录到同一 runbook 会话。
    Evidence: .sisyphus/evidence/task-5-t09t10-gate-environment.md

  Scenario: Failure/edge
    Tool: Bash
    Steps:
      1. 故意缺失 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 再运行 destructive 命令。
      2. 确认命令给出明确退出原因并拒绝执行。
    Expected: 命令 fail-safe，不进入破坏性操作。
    Evidence: .sisyphus/evidence/task-5-t09t10-destructive-guard.md
  ```

  **Commit**: NO | Message: `chore(server-next): capture replacement environment evidence` | Files: docs/server-next-operations.md, docs/next-remaining-execution-plan.md, docs/next-remaining-task-breakdown.md

- [ ] 6. 性能尾项收口（T15/T16/T19/T22/T23 并行）

  **What to do**:
  - 建立首包重复与 tick/projector 热路径 baseline，覆盖 `Bootstrap / MapStatic / PanelDelta / WorldProjector / WorldSync`。
  - 针对 T22/T23 写入 shared 协议/字段一致性门禁。

  **Must NOT do**:
  - 不以 speculative 优化覆盖未稳定验收的主线任务。

  **Recommended Agent Profile**:
  - Category: `runtime-performance-author` — Reason: 热路径与性能基线。
  - Skills: [`runtime-performance-author`, `ui-performance-author`] — Why: 首包/热路径与更新颗粒度。
  - Omitted: `network-protocol-author`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: task 1 | Blocked By: task 2

  **References**:
  - `docs/next-remaining-task-breakdown.md:145-156,178-184,191-239,105-110` — 依赖与并行关系
  - `packages/server-next/package.json:44-47,48-49` — bench 命令
  - `docs/next-remaining-task-breakdown.md:52-66` — 本轮性能尾项与主线关系

  **Acceptance Criteria**:
  - [ ] 首包重复字段/重复 capture 命中率指标文档化并可复跑。
  - [ ] projector/ticker 熔断策略形成可复验脚本。
  - [ ] shared-next 类型/数值模板/协议一致性规则通过新增检查。

  **QA Scenarios**:
  ```
  Scenario: Happy path
    Tool: Bash
    Steps:
      1. `pnpm --filter @mud/server-next bench:first-package`
      2. `pnpm --filter @mud/server-next bench:tick`
      3. `pnpm --filter @mud/server-next bench:sync`
    Expected: 基线报告可落表并与上一轮相比无劣化。
    Evidence: .sisyphus/evidence/task-6-perf-baseline.md

  Scenario: Failure/edge
    Tool: Bash
    Steps:
      1. 对比“优化前/优化后”基准数据，若回退超过设定阈值则标红。
    Expected: 自动标记为 fail，回退优化。
    Evidence: .sisyphus/evidence/task-6-perf-baseline-regression.md
  ```

  **Commit**: YES | Message: `perf(server-next): add first-package and projector baseline gates` | Files: packages/server-next/src/network/world-projector.service.js, packages/server-next/src/network/world-sync.service.js, packages/server-next/package.json, packages/shared-next/src/protocol.ts

- [ ] 7. 固定 T13/T24 compat 外部壳与长期策略

  **What to do**:
  - 对 `A/B/C/D` 类 legacy/compat 文件按 L1-L5 重新映射，确认哪些可持续保留。
  - 输出 compat 保留决议：HTTP/GM/socket/数据库入口各自退役条件与观察窗口。
  - 修改 `docs/next-legacy-removal-checklist.md` 与 `docs/next-remaining-execution-plan.md` 的最终删除策略段。

  **Must NOT do**:
  - 不执行删文件动作前先走一次 `T25` 与真实环境 L3/L4/L5 核验。

  **Recommended Agent Profile**:
  - Category: `persistence-state-author` — Reason: 决策涉及运维、恢复、回滚和长期状态。
  - Skills: [`persistence-state-author`, `network-protocol-author`] — Why: 兼容入口与状态边界。
  - Omitted: `runtime-performance-author`

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: task 5 | Blocked By: task 5

  **References**:
  - `docs/next-legacy-removal-checklist.md:51-130` — L1-L5 条件与任务映射
  - `docs/next-legacy-removal-checklist.md:135-220` — A/B/C/D 文件分类与禁止动作
  - `docs/next-remaining-task-breakdown.md:119-130` — L1-L5 对齐及阻塞解释

  **Acceptance Criteria**:
  - [ ] `T13/T24` 形成明确决议文档：保留/淘汰清单与触发条件。
  - [ ] `T24` 从“待定稿”过渡到“完成（带门禁）”。
  - [ ] 删除风险由 `L1-L5` 决策表覆盖。

  **QA Scenarios**:
  ```
  Scenario: Happy path
    Tool: Bash
    Steps:
      1. 对照 L1-L5 状态更新 checklist。
      2. 验证对应文件仍有明确依赖归类。
    Expected: 未出现“无法追溯删除条件”的文件。
    Evidence: .sisyphus/evidence/task-7-t13t24-compat-scope.md

  Scenario: Failure/edge
    Tool: Bash
    Steps:
      1. 强行构造兼容入口提前清理动作。
      2. 记录可能造成的回滚阻断点。
    Expected: 明确标记为禁止并回退。
    Evidence: .sisyphus/evidence/task-7-t13t24-edge.md
  ```

  **Commit**: NO | Message: `docs(legacy): finalize compat retention strategy` | Files: docs/next-legacy-removal-checklist.md, docs/next-remaining-task-breakdown.md, docs/next-remaining-execution-plan.md

## Final Verification Wave (MANDATORY)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Prefer small atomic commits per task where code changed.
- Default convention: `<scope>(next): <summary>`.
- No commit until all Wave 2 mainline tasks and Wave 3 evidence collection tasks pass the verification wave.

## Success Criteria
- 达到单点可持续验收：`mainline` 与 `proof` 不再互相误读。
- 真实环境四层闭环命令有证据记录。
- `T13/T24` 保留策略和 L1-L5 删除门槛形成执行文档。

**Auto-Resolved**: none
**Defaults Applied**: 文档与命令核对采用“证据优先”；真实环境证据补齐后再允许更深度清理。
**Decisions Needed**: 无（若出现资源窗口冲突，可启用临时降级序列）。
