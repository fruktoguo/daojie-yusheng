# server

`packages/server` 是仓库里的 next 后端目录主线；包名当前仍保留历史名 `@mud/server`。

它当前仍是：

- next 前后台迁移主后端
- shadow / replace-ready 验收线
- next 原地硬切执行后端

它**不是**默认正式生产入口，也**不等于**已经完整替换旧游戏整体。

## 当前口径

当前统一口径是：

- `server` 现在仍然有 `25` 项明确任务
- 如果按“完整替换游戏整体”看，当前保守仍约差 `35% - 40%`
- 当前最关键的硬阻塞仍集中在 `auth/token/bootstrap/snapshot/session`
- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读
- 根级主入口现在是 `verify:replace-ready*`
- `README` 只负责入口导航和边界说明，不负责长版分析、任务账本或删除门槛细则

## README 只回答什么

本文件只回答这几件事：

1. `server` 当前是什么定位。
2. 当前该先看哪份仓库级文档。
3. `local / with-db / acceptance / full / shadow-destructive` 大概各自是做什么的。
4. 现在还不能把 `server` 当作完整替换完成。

## README 不回答什么

本文件不负责：

- 详细任务拆解
- 依赖关系与批次排期
- legacy 删除门槛细则
- 协议审计明细
- 长篇运维手册

这些内容统一看仓库级文档，不要在 README 里找完整版。

## 现在该看哪份文档

### 当前状态与缺口

- 仓库主计划：[../../docs/next-plan/main.md](../../docs/next-plan/main.md)
- 仓库策略基线：[../../docs/next-in-place-hard-cut-plan.md](../../docs/next-in-place-hard-cut-plan.md)
- 当前 blocker 看板：[../../docs/next-replacement-blocker-board.md](../../docs/next-replacement-blocker-board.md)
- 包内兼容入口：[./NEXT-GAP-ANALYSIS.md](./NEXT-GAP-ANALYSIS.md)

### 运维、验证、shadow 演练

- 权威运维文档：[../../docs/server-operations.md](../../docs/server-operations.md)
- 包内兼容入口：[./TESTING.md](./TESTING.md)
- 包内兼容入口：[./REPLACE-RUNBOOK.md](./REPLACE-RUNBOOK.md)

### 计划、任务与收尾标准

- 当前任务总表：[../../docs/next-plan/main.md](../../docs/next-plan/main.md)
- cutover 与 legacy 归档：[../../docs/next-plan/10-legacy-archive-and-cutover.md](../../docs/next-plan/10-legacy-archive-and-cutover.md)

### 自动生成或低重复报告

- legacy 边界审计：[../../docs/next-legacy-boundary-audit.md](../../docs/next-legacy-boundary-audit.md)
- 协议审计：[../../docs/protocol-audit.md](../../docs/protocol-audit.md)

## 五层门禁

- `local`：默认本地主证明链，只回答“代码和主证明链是否绿”
- `with-db`：默认门禁的带库增强版，回答“本地主证明链 + 持久化 proof”是否成立
- `acceptance`：`local/with-db` 之外，再补 shadow 实物验收 + shadow GM 关键写路径验证
- `full`：在 `acceptance` 基础上，再补数据库运营面自动 proof，作为最严格自动化门禁
- `shadow-destructive`：维护窗口内的破坏性数据库闭环，只允许显式开启

这五层不是同一件事的不同叫法，不能混成一个“全过”。

## 推荐命令

- 本地自检：`pnpm verify:replace-ready:doctor`
- 本地主证明链：`pnpm verify:replace-ready`
- 最小带库 proof：`pnpm verify:replace-ready:proof:with-db`
- 带库闭环：`pnpm verify:replace-ready:with-db`
- shadow 实例验收：`pnpm verify:replace-ready:shadow`
- 增强验收：`pnpm verify:replace-ready:acceptance`
- 最严格自动化链：`pnpm verify:replace-ready:full`

## 当前边界

- 当前所有镜像、workflow、stack 和 smoke 默认只服务于 shadow / 备份线
- active 主包里已不存在单独的 compat/legacy 主目录；遗留 compat 行为只允许作为显式 next 入口、proof 或迁移工具边界存在
- 当前重点仍是：
  - `auth/token/bootstrap` 真源替换
  - replace-ready / shadow / with-db / GM-admin 证明链收口
  - 首包与热路径性能尾项

如需看完整长版口径，不要再以本 README 为准，统一看上面的仓库级文档。
