# 0008 Outbox 事件分层策略

## 背景

项目使用 Transactional Outbox 模式实现可靠异步事件分发。事件在业务事务中写入 `outbox_event` 表，由 dispatcher worker 轮询认领并投递给注册的 consumer。

## 问题

不加区分地将所有事件写入 outbox 会导致：
- 高频事件（如战斗审计）淹没队列，挤占真正需要可靠投递的业务事件
- 无 consumer 的事件白写白清，浪费数据库 IO
- 几千人在线时产出速率可能超过单 dispatcher 消费能力

## 分层规则

### 第一层：不走 outbox — 高频审计/日志类

**特征**：量大、无下游 consumer、丢失可容忍或有独立存储链路

**处理方式**：直接写审计表、批量 append 日志文件、或内存聚合后定期 flush

**典型 topic**：
- `combat.audit.recorded` — 战斗结算审计，直接写 `combat_audit_log` 表
- 移动轨迹、AOI 变化等纯观测数据

### 第二层：走 outbox — 需要可靠投递的业务事件

**特征**：丢失会导致状态不一致、需要重试保证、有明确的下游 consumer

**处理方式**：写入 `outbox_event` 表，由 dispatcher 投递

**典型 topic**：
- `player.inventory.granted` — 物品发放，可触发成就、推送、统计
- `player.equipment.updated` — 装备变更通知
- `player.active_job.started/completed` — 修炼/任务里程碑
- `market.trade.completed` — 交易完成，需通知买卖双方
- `mail.sent` — 邮件投递确认

### 第三层：走 outbox + 优先级 — 影响资产/交易的关键事件

**特征**：影响玩家资产、需要审计追踪、失败必须进死信人工介入

**处理方式**：走 outbox，consumer 必须幂等，死信后触发告警

**典型 topic**：
- `player.currency.changed` — 货币变动
- `market.escrow.*` — 交易托管状态变更
- `gm.action.*` — GM 操作审计

## Dispatcher 配置基线

| 参数 | 默认值 | 环境变量 |
|------|--------|----------|
| 轮询间隔 | 1000ms | `SERVER_OUTBOX_DISPATCH_INTERVAL_MS` |
| 每批大小 | 512 | `SERVER_OUTBOX_DISPATCH_BATCH_SIZE` |
| 认领 TTL | 30s | — |
| 最大重试 | 8 次 | — |
| 重试延迟 | 5s | — |

单 dispatcher 理论吞吐：512/s。支持多实例水平扩展（SQL 使用 `FOR UPDATE SKIP LOCKED`）。

## 扩容策略

| 并发规模 | 预估产出 | 方案 |
|----------|----------|------|
| < 100 人 | < 50/s | 单 dispatcher 默认配置 |
| 100-1000 人 | 50-500/s | 单 dispatcher，按需调大 batch |
| 1000+ 人 | 500+/s | 多 dispatcher 实例 + 砍掉第一层事件写入 |

## 写入准入规则

- **禁止写入无 consumer 的事件** — 没有真实下游处理逻辑的 topic 不得写入 `outbox_event` 表；logOnly 占位符不算真实 consumer
- **第一层事件禁止走 outbox** — 高频审计/日志类直接写目标表或批量 flush
- **第二、三层事件必须有明确的 consumer 注册** — 写入前 consumer 必须已实现并注册，不能先写再"以后补"
- **新增 outbox 事件前，先判断属于哪一层** — 按特征分类，不确定时默认不走 outbox
- 现有无真实 consumer 的 topic 应从 outbox 写入链路中移除

## 5000 人规模约束

目标运行环境：8c16g30m 单服，5000 并发玩家，10000 地图实例。

**产出估算**：
- 玩家主动操作（交易、装备、修炼等）平均每人每 5-10 秒一次
- 峰值产出：5000 × 20% 活跃 × 0.2 次/s ≈ 200 事件/s
- 突发峰值（全服活动、批量邮件）可能短时达 500+/s

**硬性规则**：
- 只有真正需要可靠异步投递的事件才走 outbox，其余一律直接落库或内存处理
- 单 dispatcher 串行消费在 5000 人时不够用，必须支持批量 markDelivered 或多 dispatcher 并行
- outbox 写入不得成为业务事务的性能瓶颈 — 如果 INSERT outbox_event 的延迟影响了玩家操作响应，该事件应改为异步队列或直接落库
- 任何 topic 的 consumer 如果只是 logOnly/no-op，等同于无 consumer，必须从 outbox 写入链路移除
