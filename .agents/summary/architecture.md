# Architecture

本文件描述道劫余生的系统架构、分层边界和核心设计模式。与 `docs/architecture/` 下的 ADR 互补：ADR 解释"为什么这样决策"，本文件给出"整体系统看起来是什么样、代码落在哪里"。

## 顶层部署拓扑

```mermaid
graph TB
  subgraph Browser[浏览器]
    ClientApp[Client <br/> Vite bundle<br/> Canvas + DOM UI + React]
    GmConsole[GM 控制台<br/> gm.html]
    MapEditor[地图编辑器<br/> gm-map-editor.ts]
  end

  subgraph Edge[边缘]
    Nginx[Nginx<br/> 静态资源 + 反代]
  end

  subgraph AppTier[应用层]
    Server[NestJS Server<br/> Socket.IO + HTTP]
    Workers[后台 Worker<br/> outbox / flush / TTL / 备份]
  end

  subgraph DataTier[数据层]
    Postgres[(PostgreSQL 16<br/> 真源)]
    Redis[(Redis 7<br/> 在线态/缓存)]
  end

  subgraph Tooling[工具链]
    ConfigEditor[Config Editor<br/> Vite + CJS Local API]
  end

  ClientApp -->|WebSocket n:*| Server
  ClientApp -->|HTTP /api| Nginx
  GmConsole -->|HTTP /api| Nginx
  MapEditor -.->|本地调用| ConfigEditor
  Nginx --> Server
  Server --> Postgres
  Server --> Redis
  Workers --> Postgres
  Workers --> Redis
  ConfigEditor -.->|写入 JSON| FS[(packages/server/data/)]
```

## 逻辑分层

### 服务端

```mermaid
graph TB
  subgraph Network[Network 层 packages/server/src/network]
    Gateway[WorldGateway<br/> 所有 C2S 事件入口]
    Bootstrap[WorldSessionBootstrap*<br/> 首包/会话建立/恢复]
    Projector[WorldProjector*<br/> 状态 → 协议投影/diff]
    SyncServices[World Sync 服务<br/> map-static / player-state / envelope / threat / quest-loot / aux]
  end

  subgraph Runtime[Runtime 层 packages/server/src/runtime]
    WorldRuntime[WorldRuntimeService<br/> + 大量子服务<br/> 命令/读/写/命令/combat/worker]
    PlayerRuntime[PlayerRuntimeService<br/> 玩家权威状态]
    InstanceRuntime[MapInstanceRuntime<br/> 单地图聚合根]
    MarketRuntime[MarketRuntimeService<br/> 挂单/撮合/拍卖]
    MailRuntime[MailRuntimeService]
    CraftRuntime[CraftPanelRuntimeService<br/> 炼丹/炼器/强化]
    CombatRuntime[CombatActionService<br/> + CombatPipeline]
    TickService[WorldTickService<br/> 每 1Hz 推进全部实例]
  end

  subgraph Persistence[Persistence 层 packages/server/src/persistence]
    DurableOp[DurableOperationService<br/> 幂等资产事务]
    PlayerDomainPersist[PlayerDomainPersistenceService<br/> 玩家分域落盘]
    InstanceDomainPersist[InstanceDomainPersistenceService<br/> 实例分域落盘]
    MarketPersist[MarketPersistenceService]
    MailPersist[MailPersistenceService]
    FlushLedger[FlushLedgerService<br/> 脏域账本]
    Outbox[OutboxDispatcherService<br/> 异步事件]
    DbPool[DatabasePoolProvider<br/> pg.Pool]
  end

  subgraph Content[Content 层]
    ContentRepo[ContentTemplateRepository<br/> 怪物/功法/物品/配方/技能]
    MapRepo[MapTemplateRepository<br/> 地图模板]
  end

  Gateway --> Bootstrap
  Gateway --> WorldRuntime
  Bootstrap --> WorldRuntime
  Projector --> WorldRuntime
  SyncServices --> Projector
  Gateway --> SyncServices

  WorldRuntime --> PlayerRuntime
  WorldRuntime --> InstanceRuntime
  WorldRuntime --> MarketRuntime
  WorldRuntime --> MailRuntime
  WorldRuntime --> CraftRuntime
  WorldRuntime --> CombatRuntime
  TickService --> WorldRuntime

  PlayerRuntime --> FlushLedger
  InstanceRuntime --> FlushLedger
  FlushLedger --> PlayerDomainPersist
  FlushLedger --> InstanceDomainPersist

  WorldRuntime --> DurableOp
  MarketRuntime --> DurableOp
  MailRuntime --> MailPersist
  MarketRuntime --> MarketPersist
  DurableOp --> DbPool
  PlayerDomainPersist --> DbPool
  InstanceDomainPersist --> DbPool
  Outbox --> DbPool

  ContentRepo --> WorldRuntime
  MapRepo --> InstanceRuntime
```

### 客户端

```mermaid
graph TB
  subgraph Entry[入口]
    Main[main.ts<br/> 注入样式 + 调 initializeMainApp]
    Bootstrap[main-bootstrap-assembly.ts]
    Composition[main-app-composition.ts]
  end

  subgraph StateSources[状态源 main-*-state-source]
    Runtime[main-runtime-state-source<br/> 权威态投影]
    Panels[main-panel-delta-state-source<br/> 面板增量]
    Notice[main-notice-state-source<br/> 通知]
    Observe[main-observe-state-source<br/> 观察]
    Targeting[main-targeting-state-source]
    Connection[main-connection-state-source]
  end

  subgraph Network[network/]
    Socket[socket.ts<br/> socket.io 生命周期]
    ClientSend[socket-send-*<br/> 发包封装]
    ServerEvents[socket-server-events.ts<br/> 事件注册]
  end

  subgraph UI[ui/ + panels/]
    Hud[HUD]
    ActionPanel[ActionPanel<br/> 技能 / 战斗设置]
    AttrPanel[AttrPanel<br/> 属性详情]
    InventoryPanel[InventoryPanel]
    MarketPanel[MarketPanel]
    MailPanel[MailPanel]
    CraftModal[CraftWorkbenchModal<br/> 炼丹 + 强化]
    TechniquePanel[TechniquePanel]
    Minimap[Minimap]
    Chat[ChatUI]
    Suggestion[SuggestionPanel]
    Settings[SettingsPanel]
  end

  subgraph Renderer[renderer/ + game-map/]
    Canvas[Canvas2D Renderer<br/> TextRenderer 等]
    GameMap[game-map/<br/> store/camera/projection/scene/interaction]
  end

  subgraph ReactUi[react-ui/ 渐进 UI]
    ReactPrototype[react-ui prototype]
  end

  Main --> Bootstrap
  Bootstrap --> Composition
  Composition --> StateSources
  Composition --> UI
  Composition --> Renderer
  Composition --> Network

  Network <--> StateSources
  StateSources --> UI
  StateSources --> Renderer
  UI -.可选.-> ReactUi
```

## Tick 循环（服务端权威）

```mermaid
sequenceDiagram
  participant TickSvc as WorldTickService
  participant WRT as WorldRuntimeService
  participant Instance as MapInstanceRuntime
  participant Player as PlayerRuntimeService
  participant Net as WorldProjector/Sync
  participant Sock as Socket.IO

  loop 每 1Hz
    TickSvc->>WRT: advanceFrame()
    WRT->>WRT: dispatchPendingSystemCommands()
    WRT->>WRT: dispatchPendingCommands() (玩家意图)
    WRT->>WRT: materializeAutoCombatCommands()
    WRT->>WRT: materializeAutoUsePills()
    WRT->>WRT: materializeNavigationCommands()
    WRT->>Instance: tickOnce() (每个实例)
    Instance->>Instance: advanceMonsters / buildings / formations / temporary tiles
    Instance->>Player: advanceTick() (玩家子集)
    Player->>Player: 推进 buff/冷却/vitals/cultivation
    WRT->>WRT: processPendingRespawns()
    WRT->>Net: buildPlayerView / diff / envelope
    Net->>Sock: emit n:s:worldDelta / n:s:panelDelta / ...
    WRT->>WRT: flushInstanceDomains() (脏域写账本)
  end
```

ADR：`docs/architecture/0002-tick-model.md`。

## 网络分层同步

```mermaid
graph LR
  A[服务端权威态] --> B[Projector 构建 PlayerView]
  B --> C[Projector-Diff 与上帧比较]
  C --> D[Envelope 打包]
  D --> E{数据层}
  E -->|进入场景/重连| F1[首包 Bootstrap + MapStatic]
  E -->|每 tick 动态| F2[WorldDelta 高频]
  E -->|玩家自身| F3[SelfDelta]
  E -->|面板| F4[PanelDelta 低频]
  E -->|按需| F5[Detail / NpcShop / ItemBook]
  F1 --> Client
  F2 --> Client
  F3 --> Client
  F4 --> Client
  F5 --> Client
```

参考：`docs/architecture/0003-network-sync-layers.md`、`packages/server/src/network/world-projector*`。

## 持久化分层

```mermaid
graph TB
  subgraph Memory[内存]
    RT[Runtime 权威态<br/> Player/MapInstance/Market...]
  end

  subgraph Cache[Redis]
    Presence[在线态/Session Fencing]
    Heartbeat[心跳/暂存]
  end

  subgraph Truth[PostgreSQL 真源]
    PlayerDomains[玩家分域表<br/> vitals/inventory/equipment/<br/> progression/quests/wallet/mail...]
    InstanceDomains[实例分域表<br/> overlay/tile-damage/<br/> monster-runtime/containers/ground-items/<br/> building/room/fengshui/formation]
    MarketTables[市场/拍卖表]
    MailTables[邮件结构化表]
    Outbox[outbox / audit]
    Backups[gm-database-backups]
  end

  RT -->|markDirty 域| FlushLedger[FlushLedgerService]
  FlushLedger -->|定时/触发| PlayerDomains
  FlushLedger --> InstanceDomains
  RT -->|关键资产 Durable| DurableOp[DurableOperationService]
  DurableOp --> PlayerDomains
  DurableOp --> MarketTables
  DurableOp --> Outbox
  RT <-->|Session 会话| Presence
  RT <-->|心跳| Heartbeat
  OutboxDispatch[OutboxDispatcherService] --> Outbox
```

## 核心设计模式

| 子系统 | 模式 | 代码坐标 |
|--------|------|----------|
| 战斗结算 | Stage Pipeline | `runtime/combat/combat-pipeline.ts` + `combat-pipeline-compose.ts` |
| 战斗事件 | Layered Event Bus（AOI / Notice / Audit / Diagnostic） | `combat-outcome-apply-adapters.ts` + `WorldRuntimeCombatActionService` |
| 世界 Tick | Fixed-timestep Game Loop + per-instance loop | `runtime/tick/world-tick.service.ts` + `world-runtime-instance-tick-orchestration.service.ts` |
| 地图实例 | Aggregate Root（DDD） | `runtime/instance/map-instance.runtime.ts` |
| 玩家运行时 | Rich Domain Model + Domain Service + Dirty Domain Tracking | `runtime/player/player-runtime.service.ts` + `player-progression.service.ts` |
| 持久化 | Repository + Unit of Work + Transactional Outbox | `persistence/*` |
| 强一致资产 | Saga / Durable Operation（幂等 + 审计 + 回滚） | `persistence/durable-operation.service.ts` |
| 网络同步 | CQRS Read Projection + Delta Compression | `network/world-projector*.ts` |
| Socket 网关 | Thin Controller + Intent/Command Queue | `network/world.gateway.ts` + `runtime/world/command/*` |
| 市场 / 邮件 | Domain Service + Pessimistic Locking | `runtime/market/market-runtime.service.ts` |
| 客户端 UI | Manual Retained-mode DOM + Diff Patching | `packages/client/src/ui/` |
| 模块拆分约定 | 纯函数 `.helpers.ts` / `@Injectable()` Service / Facade Service | `docs/architecture/service-split-conventions.md` |

## 命令 / 意图管线（Command Pipeline）

```mermaid
graph LR
  GW[WorldGateway handle*]
  IF[CommandIntakeFacade]
  PQ[PlayerCommandEnqueueService<br/> 玩家意图排队]
  SQ[SystemCommandEnqueueService<br/> 系统命令]
  GQ[GmQueueService]

  WRT[WorldRuntimeService]
  Dispatch[dispatchPendingCommands]
  Write[GameplayWriteFacadeService]
  Combat[PlayerCombat/BasicAttack/<br/> BattleEngage/SkillDispatch]
  CraftOps[CraftRuntime ops]

  GW --> IF
  IF --> PQ
  IF --> SQ
  IF --> GQ
  PQ --> WRT
  SQ --> WRT
  GQ --> WRT
  WRT --> Dispatch
  Dispatch --> Write
  Dispatch --> Combat
  Dispatch --> CraftOps
  Write --> PlayerRT[PlayerRuntime]
  Write --> InstanceRT[InstanceRuntime]
  Combat --> InstanceRT
  CraftOps --> PlayerRT
```

gateway 只做参数归一化 + 排队/调用 facade，不直接写权威态。

## 地图实例生命周期

参考 ADR `docs/architecture/0006-map-instance.md`。核心：

- **模板**（`MapTemplateRepository`）→ 静态地形、NPC、刷怪点、Portal
- **实例**（`MapInstanceRuntime`）→ 运行态：玩家、怪物、掉落、建筑、房间、风水、阵法、临时地块
- **实例目录**（`InstanceCatalogService`）→ 管理实例 lease、迁移、重建
- **持久化分域**（`InstanceDomainPersistenceService`）→ 把运行态的可恢复子集落盘

## 错误与诊断链

- 网络层：`WorldSyncEnvelope` 统一包络，服务端 `S2C.Error` + `S2C.Kick` 回传
- 战斗层：`combat-audit-outbox` + `CombatDiagnostic`（可通过 GM 查询）
- 持久化层：`FlushLedger` 记录失败、`OutboxDispatcherRuntime` 负责重试
- 运维层：`tools/*-report.ts` 输出容量、Lease、恢复时延、数据库退化等报告
- 网关层：`attachPerfObservers` + `attachRateLimitGuard` 做 per-socket 限流与性能采样

## 跨端契约

`@mud/shared` 是唯一真源：

- 事件名常量 `C2S` / `S2C`（`shared/src/protocol.ts`）
- 载荷类型 `C2S_PayloadMap` / `S2C_PayloadMap`（配合 `protocol-*-payload-types.ts`）
- Protobuf schema 与 tick codec（`shared/src/network-protobuf*.ts`）
- 数值与战斗常量（`shared/src/constants/gameplay/`、`constants/network/`）
- 地图文档规范 `shared/src/map-document.ts`（前后端都用同一个 editable map 形状）

协议审计脚本：`pnpm audit:protocol`（`packages/server/src/tools/protocol-audit.ts`），在 CI 中作为门禁保护事件 / 载荷 / protobuf 的一致性。

## 分层约束一览（摘自 AGENTS.md）

- `WorldGateway` 只收集意图，不改权威态
- `runtime/*` 只改权威态；`network/*` 只做投影与发包
- `persistence/*` 不持有运行时状态；被 runtime 调用、被 worker 调用
- `content/*` 只负责模板加载，不触达运行态
- `shared/*` 不能依赖任何运行态和 NestJS 容器
- `tools/*` 是冷路径，运行期进程不加载大部分 smoke / bench 工具

## 相关 ADR（项目已有）

- `docs/architecture/0001-server-authority.md`
- `docs/architecture/0002-tick-model.md`
- `docs/architecture/0003-network-sync-layers.md`
- `docs/architecture/0004-persistence-layers.md`
- `docs/architecture/0005-aoi-system.md`
- `docs/architecture/0006-map-instance.md`
- `docs/architecture/0007-reconnection.md`
- `docs/architecture/ADR-战斗链路统一分层与过渡迁移.md`
- `docs/architecture/service-split-conventions.md`
