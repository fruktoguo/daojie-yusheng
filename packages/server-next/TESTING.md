# server-next 验证

更新时间：2026-04-11（当前轮次）

这份文件是 `packages/server-next` 的包内验证入口，只回答包内最常用的测试与门禁问题。

更完整的运维、shadow、`gm/database/*`、破坏性维护窗口说明，统一看：

- [docs/server-next-operations.md](/home/yuohira/mud-mmo/docs/server-next-operations.md)

更完整的任务拆解与当前轮次进展，统一看：

- [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md)

## 当前口径

- `server-next` 当前仍是独立 shadow / replace-ready 线，不是默认生产接班入口。
- 当前任务账本按统一口径仍是 `25` 项。
- 当前保守判断下，距离“完整替换游戏整体”仍约差 `35% - 40%`。
- 这份文件只负责解释“跑什么、证明什么、不能证明什么”，不负责替代任务账本或运维手册。

## 四层 Gate

这四层不是同一件事的不同叫法，不能混读。

### `local`

- 回答的问题：代码和主证明链是否绿。
- 典型内容：`client-next build`、本地主证明链、协议审计。
- 不回答的问题：shadow 实物验收、数据库补证、破坏性维护窗口是否可控。

### `acceptance`

- 回答的问题：`local` 之外，shadow 实物验收和 shadow GM 关键写路径是否也绿。
- 典型内容：`local` + `shadow` + `gm-compat`。
- 不回答的问题：完整数据库运营面 proof、破坏性闭环、人工运营回归是否都已完成。

### `full`

- 回答的问题：数据库、shadow、GM 密码都齐备时，自动化门禁是否全绿。
- 典型内容：`with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`。
- 不回答的问题：真实维护窗口 destructive 演练是否已执行、人工运营边界是否已彻底制度化。

### `shadow-destructive`

- 回答的问题：维护窗口里的 destructive 闭环是否可控。
- 典型内容：`SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 下的 shadow `backup -> download -> restore`。
- 不回答的问题：日常替换是否完成、是否可以把 legacy/compat 直接删光。

## 自动 Proof 与人工回归

这里要分得更硬一点。

- 自动 proof 负责回答“命令是否通了、门禁是否能跑、回归是否可复现”。
- 人工回归负责回答“真实环境、维护窗口、业务上下文、回滚预案是否真的可执行”。
- 自动 proof 不能替代人工回归，人工回归也不能反过来当成自动门禁。

### 模型辅助验证的边界

像 `gpt-5.3-codex-spark` 这类快速模型，适合做：

- 文档、README、workflow、runbook 的口径核对
- 代码和协议表面的覆盖面盘点
- `legacy/compat` 是否仍出现在某条链路里的第一轮扫描

它不适合单独承担：

- `auth/bootstrap/session` 真源是否已经完成替换的最终判断
- `acceptance/full/shadow-destructive` 是否已经真实闭环
- GM/admin/restore 是否已经完成真实环境补证

固定原则：

- 模型只作为并行盘点和发现缺口的辅助手段
- 最终结论仍以 `verify:replace-ready*`、smoke、audit、build 和真实环境记录为准

### 仍属于自动 proof 的内容

- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:shadow`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`
- `pnpm verify:replace-ready:shadow:destructive`

### 仍需要人工回归或真实环境确认的内容

- `with-db` 之外的真实数据库环境确认
- shadow 维护窗口里的 destructive 记录
- GM / admin / restore 的真实操作流程
- 运维、工具链、回滚预案是否已经全部切到 next 入口

## T11 / T12 / T14 / T25 在这里分别管什么

这四项是当前测试文档最应该对齐的职责边界。

| 任务 | 在测试文档里的职责 | 当前状态 |
| --- | --- | --- |
| `T11` | 把 `local / acceptance / full / shadow-destructive` 四层 gate 的定义写死 | 基本收口，仍要和 README / ops / workflow 持续对齐 |
| `T12` | 把自动 proof 与人工回归边界写硬，避免把命令存在误读成运营已完成 | 需要继续落成表格与清单 |
| `T14` | 把 workflow 里的可选 destructive 补证和测试文档口径对齐 | 已支持，但真实维护窗口说明仍要补齐 |
| `T25` | 把“完整替换完成”的判定标准逐条对应到 gate / smoke / runbook | 仍在门禁化过程中 |

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
- 再跑 shadow 上的 `pnpm --filter @mud/server-next smoke:gm-compat`

### 6. 最严格自动化门禁

- `pnpm verify:replace-ready:full`

用途：

- 强制要求数据库、shadow、GM 密码环境齐备
- 串行执行 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`
- 只证明自动化门禁，不代替人工运营回归

### 7. 维护窗口破坏性 proof

- `pnpm verify:replace-ready:shadow:destructive`

用途：

- 只在维护窗口执行
- 需要显式设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 用于 shadow 上单独验证 `backup -> download -> restore`
- 默认不应进入日常 deploy 链

## 这份文档不回答什么

- 不回答 `legacy/compat` 什么时候能全删。
- 不回答 GM/admin/restore 的最终长期策略。
- 不回答 `next` 是否已经完成完整替换。
- 不回答真实维护窗口是否已经执行过 destructive proof。

这些问题统一看：

- [docs/next-legacy-removal-checklist.md](/home/yuohira/mud-mmo/docs/next-legacy-removal-checklist.md)
- [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md)
- [docs/server-next-operations.md](/home/yuohira/mud-mmo/docs/server-next-operations.md)

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

## 目录关系

- [docs/server-next-operations.md](/home/yuohira/mud-mmo/docs/server-next-operations.md) 负责运维与维护窗口细则
- [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md) 负责任务粒度、依赖关系、当前轮次进展
- [docs/next-remaining-execution-plan.md](/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md) 负责阶段拆分和完成定义
- [docs/next-gap-analysis.md](/home/yuohira/mud-mmo/docs/next-gap-analysis.md) 负责现状缺口和当前判断
