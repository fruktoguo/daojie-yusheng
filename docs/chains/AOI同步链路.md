# AOI 同步链路

## 概述

AOI（Area of Interest）同步链路负责将服务端权威状态变化高效地推送给客户端。包括首次进入的全量同步和后续的增量同步，使用 protobuf 编码和 envelope 封装。

## 链路流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  状态变更   │────▶│  Envelope   │────▶│  Protobuf   │────▶│  Socket.IO  │
│  (tick产出) │     │  构造       │     │  编码       │     │  推送       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `network/world-sync.service.ts` | 同步主控：初始同步 + 增量同步 |
| `network/world-sync-envelope.service.ts` | 协议信封构建 |
| `network/world-sync-protocol.service.ts` | protobuf 编解码 |
| `network/world-sync-aux-state.service.ts` | 辅助状态同步 |
| `network/world-sync-player-state.service.ts` | 玩家状态包 |
| `network/world-sync-map-snapshot.service.ts` | 跨图地图快照 |
| `network/world-sync-worker-encode.service.ts` | Worker 线程编码 |
| `network/world-sync-quest-loot.service.ts` | 任务/掉落同步 |
| `network/world-sync-minimap.service.ts` | 小地图同步 |
| `network/world-sync-threat.service.ts` | 威胁感知同步 |

## 初始同步（emitInitialSync）

```
玩家首次进入/跨图/断线重连
  │
  ├─▶ 玩家完整状态快照
  ├─▶ 地图静态数据
  ├─▶ 视野内所有实体
  ├─▶ 辅助状态（任务、邮件、市场等）
  └─▶ 一次性全量推送
```

## 增量同步（emitDeltaSync）

```
每 tick 结束后 → flushConnectedPlayers()
  │
  ├─▶ 遍历所有在线玩家
  │
  ├─▶ 对每个玩家构建 delta
  │     - 视野内实体位置变化
  │     - 实体进入/离开视野（add/remove）
  │     - 玩家自身状态变化
  │     - 战斗效果（fx）
  │     - 通知消息
  │
  ├─▶ WorldSyncEnvelopeService 构建信封
  │     - 按同步层分类打包
  │     - 最小字段原则
  │
  ├─▶ WorldSyncProtocolService protobuf 编码
  │     - 二进制序列化
  │     - Worker 线程并行编码（大包）
  │
  └─▶ Socket.IO 单播推送
```

## 同步分层

| 层级 | 内容 | 频率 | 范围 |
|------|------|------|------|
| 首包 | 完整状态 | 一次 | 单播 |
| 高频 | 位置、HP、战斗效果 | 每 tick | AOI |
| 低频 | 背包、装备、任务 | 变更时 | 单播 |
| 按需 | 详情面板、观察 | 请求时 | 单播 |

## 关键约束

- **最小字段**: 高频包只含变化字段，不重复静态信息
- **最小范围**: 能单播不 AOI，能 AOI 不全图
- **增量优先**: 默认增量/差量同步，全量仅限重建场景
- **protobuf**: 二进制编码减少包体
- **Worker 编码**: 大包使用 Worker 线程避免阻塞主线程
- **session recovery**: 断线期间消息入恢复队列

## 边界红线

- 高频包禁止混入静态资源、长文本、完整详情
- 不在 tick 热路径做 JSON.stringify
- 视野外实体不发送任何更新
- 协议变更必须能解释字段属于哪一层

## 相关文档

- [AOI 系统](../architecture/0005-aoi-system.md)
- [网络同步分层](../architecture/0003-network-sync-layers.md)
- [断线重连](../architecture/0007-reconnection.md)
