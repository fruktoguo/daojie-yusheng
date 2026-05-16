# 持久化改动检查清单

本次改动涉及"下次还在"的状态（账号、角色、资产、地图实例、邮件、市场、兑换码、GM 操作、审计日志、运维备份等）。按下表逐项确认。

## 真源边界

- **PostgreSQL 是唯一正式真源**；Redis / 内存 / `localStorage` / `sessionStorage` / 本地 JSON 不能成真源，只能做缓存、在线态、导入导出或会话介质。
- 真源字段、写入路径、回读路径、恢复路径要清晰可追，且写在 `packages/server/src/persistence/**` 内。
- 涉及迁移：迁移脚本可重复执行、可回退（或明确标注不可回退并说明影响）。

## 写入策略

- tick 内不直接做数据库 IO；通过 `flush` / `outbox` / worker / 快照 / 受控队列转出。
- 写入要支持幂等、重复执行、并发写入、失败补偿、崩溃恢复、审计追踪。
- 关键操作（资产变更、邮件、市场、GM 命令、兑换码、跨图迁移）必须有审计日志或可回放轨迹。
- Redis 不在 tick 中做不必要外部往返；只用于在线态、实时态、缓存或短期索引。

## 测试夹具

- 任何 smoke / proof / verify / audit / diagnostic 如果会创建持久化对象（账号、角色、地图实例、市场挂单、邮件、GM 操作日志等），**必须自带自动清理**。
- 同时设计成功 / 失败 / 中断三种路径下的清理链，缺一即视为实现未完成。
- 不允许把"留个脏数据明天手工清"作为完成标准。
- 新建夹具时同步在脚本里加 `try/finally` 或注册清理回调；落库前先打印"将创建 X，将在结束时清理"。

## 必跑门禁

- `pnpm verify:release:with-db`
- 视范围加 `pnpm verify:release:proof:with-db`、`pnpm verify:release:shadow`
- 严格上线前：`pnpm verify:release:full`
- 涉及边界：`pnpm audit:boundaries`、`pnpm proof:server-runtime-boundaries`

## 输出要求

按"真源 / 写入 / 夹具 / 门禁"四段给结论。列出新增或改动的迁移、表、列、索引、outbox 入口、清理脚本路径。最后报告门禁结果；失败立刻停下来。
