# server-next

`server-next` 是仓库里的 next 后端包。

它当前仍是：

- next 前后台迁移主后端
- shadow / replace-ready 验收线
- 阶段性备份与继续协作线

它**不是**默认正式生产入口，也**不等于**已经完整替换旧游戏整体。

## 当前口径

当前统一口径是：

- `server-next` 现在仍然有 `25` 项明确任务
- 如果按“完整替换游戏整体”看，当前保守仍约差 `35% - 40%`
- 当前最关键的硬阻塞仍集中在 `auth/token/bootstrap/snapshot/session`
- `local / acceptance / full / shadow-destructive` 是四层不同门禁，不能混读
- `README` 只负责入口导航和边界说明，不负责长版分析、任务账本或删除门槛细则

## README 只回答什么

本文件只回答这几件事：

1. `server-next` 当前是什么定位。
2. 当前该先看哪份仓库级文档。
3. `local / acceptance / full / shadow-destructive` 大概各自是做什么的。
4. 现在还不能把 `server-next` 当作完整替换完成。

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

- 仓库权威说明：[../../docs/next-gap-analysis.md](../../docs/next-gap-analysis.md)
- 包内兼容入口：[./NEXT-GAP-ANALYSIS.md](./NEXT-GAP-ANALYSIS.md)

### 运维、验证、shadow 演练

- 权威运维文档：[../../docs/server-next-operations.md](../../docs/server-next-operations.md)
- 包内兼容入口：[./TESTING.md](./TESTING.md)
- 包内兼容入口：[./REPLACE-RUNBOOK.md](./REPLACE-RUNBOOK.md)

### 计划、任务与收尾标准

- 执行方案：[../../docs/next-remaining-execution-plan.md](../../docs/next-remaining-execution-plan.md)
- 任务详单：[../../docs/next-remaining-task-breakdown.md](../../docs/next-remaining-task-breakdown.md)
- legacy 清理门槛：[../../docs/next-legacy-removal-checklist.md](../../docs/next-legacy-removal-checklist.md)

### 自动生成或低重复报告

- legacy 边界审计：[../../docs/next-legacy-boundary-audit.md](../../docs/next-legacy-boundary-audit.md)
- next 协议审计：[../../docs/next-protocol-audit.md](../../docs/next-protocol-audit.md)

## 四层门禁

- `local`：本地主证明链，只回答“代码和主证明链是否绿”
- `acceptance`：本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证
- `full`：在 `acceptance` 基础上再加数据库运营面自动 proof
- `shadow-destructive`：维护窗口内的破坏性数据库闭环，只允许显式开启

这四层不是同一件事的不同叫法，不能混成一个“全过”。

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
- 包内 `src/compat/legacy/` 当前只保留迁移参考与最小兼容核，不再承担默认 HTTP 主入口
- 当前重点仍是：
  - `auth/token/bootstrap` 真源替换
  - replace-ready / shadow / with-db / GM-admin 证明链收口
  - 首包与热路径性能尾项

如需看完整长版口径，不要再以本 README 为准，统一看上面的仓库级文档。
