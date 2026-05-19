# 架构决策记录索引

本目录记录项目重大架构决策（ADR），供 AI agent 和人类开发者理解设计意图。

目标运行环境：8c / 16GB / 30Mbps 单服，5000 并发玩家，10000 地图实例。

## 核心架构决策

| 编号 | 标题 | 状态 |
|------|------|------|
| 0001 | [服务端权威模型](0001-server-authority.md) | 已采纳 |
| 0002 | [Tick 调度模型](0002-tick-model.md) | 已采纳 |
| 0003 | [网络同步分层](0003-network-sync-layers.md) | 已采纳 |
| 0004 | [持久化分层策略](0004-persistence-layers.md) | 已采纳 |
| 0005 | [AOI 与视野同步](0005-aoi-system.md) | 已采纳 |
| 0006 | [地图实例化](0006-map-instance.md) | 已采纳 |
| 0007 | [断线重连机制](0007-reconnection.md) | 已采纳 |
| 0008 | [Outbox 事件分层策略](0008-outbox-event-tiering.md) | 已采纳 |
| - | [战斗链路统一分层与过渡迁移](ADR-战斗链路统一分层与过渡迁移.md) | 已采纳 |

## 代码约定

| 文档 | 说明 |
|------|------|
| [服务拆分模式约定](service-split-conventions.md) | Helper / Service / Facade 三种拆分模式 |

## 持久化架构

| 文档 | 说明 |
|------|------|
| [持久化设计](持久化设计.md) | 调度、真源边界、刷盘域拆分、恢复链 |
| [持久化表结构现状](持久化表结构现状.md) | PostgreSQL 表结构清单 |
| [main主线玩家数据分表方案](main主线玩家数据分表方案.md) | 玩家域 26 张表拆分设计 |
| [main主线落盘剩余旧链路与fallback清单](main主线落盘剩余旧链路与fallback清单.md) | 旧链路硬切边界 |

## 架构模式速查表

| 子系统 | 设计模式 | 对应实现 |
|--------|----------|----------|
| 战斗结算 | Stage Pipeline | `combat-pipeline.ts` |
| 世界 Tick | Fixed Timestep + 分域 System | ADR-0002 / `world-tick.service.ts` |
| 地图实例 | Aggregate Root (DDD) | ADR-0006 / `map-instance.runtime.ts` |
| 玩家运行时 | Rich Domain Model | `player-runtime.service.ts` |
| 持久化调度 | Repository + UoW + Outbox | ADR-0004 / `persistence/` |
| 强一致资产 | Durable Operation（幂等事务） | `durable-operation.service.ts` |
| 网络同步 | CQRS Projection + Delta | ADR-0003 / `world-projector.helpers.ts` |
| Socket 网关 | Thin Controller + Intent Queue | `world.gateway.ts` |
| 市场/邮件 | Domain Service + Pessimistic Lock | `market-runtime.service.ts` |
| 战斗事件 | Layered Event Bus (4 层) | ADR-战斗链路 |

## 使用说明

- 新增 ADR 时复制 `template.md`，编号递增
- 状态流转：提议 → 已采纳 → 已废弃/已取代
- 修改已采纳的 ADR 时，优先新建取代记录而非直接修改
- 模板已精简：只保留决策、约束、验证方式，不列被否决的选项
