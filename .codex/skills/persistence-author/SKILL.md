---
name: persistence-author
description: Use this skill when designing or modifying persistent state in packages/server/src/persistence or related runtime flows, including accounts, player snapshots, GM data, settings, config/editor drafts, migrations, database source of truth, Redis online state, recovery, cleanup, and tests that create durable objects.
---

# 持久化真源与恢复链

用于处理“下次还在”的状态。目标是明确数据库真源、Redis 在线态和本地缓存边界，并保证测试数据可清理。

## 商业级 MMO 口径

- 持久化设计必须支撑账号、角色、地图实例、交易、邮件、GM 操作等长期运营数据。
- 每个关键状态都要能回答真源、写入时机、重复执行、崩溃恢复、回滚或补偿策略。
- 数据链路要考虑并发写入、幂等、审计、测试清理和线上问题追溯。
- 缓存只能加速读取或在线态判断，不能让玩家资产、进度或运营数据出现第二真源。

## 真源口径

- 要求跨会话存在的状态，正式真源必须是数据库。
- Redis 用于在线态、会话态、实时索引或短期缓存，不作为长期真源。
- `localStorage`、`sessionStorage`、本地 JSON 只能做缓存、导入导出或临时介质。
- 运行时内存态可以是当前 tick 的权威执行态，但必须有明确快照、落盘或恢复策略。

## 强制流程

1. 先判断状态是否“下次还在”；是则定义数据库表、仓储、回读和恢复链。
2. 明确写入时机：同步事务、异步队列、快照、定时 flush 或运维工具。
3. tick 热路径中避免数据库 IO；需要落盘时通过受控边界转出。
4. 任何新增迁移、仓储或恢复逻辑，都要检查失败、中断、重复执行的结果。
5. 新增 smoke/proof/verify/audit 夹具时，同步设计成功、失败、中断后的清理链。
6. GM 备份恢复、账号、角色、地图实例、邮件、市场等持久对象必须有可追踪来源和清理策略。

## 硬规则

- 不把长期状态只存在 Redis、客户端存储或本地临时 JSON。
- 不让 socket handler、UI 操作或冷路径脚本绕过正式仓储直接制造第二真源。
- 不在 tick 内做直接数据库查询或写入。
- 会落库的验证脚本不能依赖人工清库收尾。
- 迁移必须可重复判断当前状态，不能靠“应该只跑一次”的假设。

## 交付说明

- 状态真源在哪里，缓存在哪里。
- 是否满足商业级 MMO 的长期运营、并发写入、恢复和审计要求。
- 写入、回读、恢复链是否完整。
- 是否影响数据库迁移或 Redis 在线态。
- 新增测试数据是否自动清理，覆盖成功/失败/中断中的哪些路径。
