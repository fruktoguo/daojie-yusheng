# Workflows

关键业务流程和跨组件时序图。详细链路文档见 `docs/chains/`。

## 1. 玩家登录与首包

```mermaid
sequenceDiagram
  participant C as Client
  participant HTTP as NativeAuthController
  participant Auth as player-token-verify<br/>password-hash
  participant Idp as PlayerIdentityPersistence
  participant GW as WorldGateway
  participant Boot as WorldSessionBootstrap*
  participant PR as PlayerRuntime
  participant Inst as MapInstanceRuntime
  participant Sock as Socket.IO

  C->>HTTP: POST /auth/register|login
  HTTP->>Idp: load/create identity
  HTTP->>Auth: bcrypt verify
  Auth-->>HTTP: ok
  HTTP->>Auth: sign JWT
  HTTP-->>C: token
  C->>Sock: socket.connect + Hello {token}
  Sock->>GW: handleHello
  GW->>Boot: bootstrap session
  Boot->>Boot: 身份来源解析 + 顶号 fencing
  Boot->>PR: loadOrCreatePlayer
  PR->>PR: 从 PlayerDomainPersistence 投影恢复
  Boot->>Inst: ensure instance + connectPlayer
  Boot->>Sock: emit n:s:bootstrap + n:s:mapStatic + n:s:realm
  Sock-->>C: 首包
```

参考：`docs/chains/登录链路.md`、`docs/architecture/0007-reconnection.md`、`network/world-session-bootstrap*.service.ts`。

## 2. 每息 tick 推进

```mermaid
sequenceDiagram
  participant Tick as WorldTickService
  participant WRT as WorldRuntimeService
  participant Cmd as CommandPipeline
  participant Auto as AutoCombat/AutoUse/Nav
  participant Inst as MapInstanceRuntime
  participant PR as PlayerRuntime
  participant Net as Projector + Sync
  participant Sock as Socket.IO

  Tick->>WRT: advanceFrame()
  WRT->>Cmd: dispatchPendingSystemCommands + dispatchPendingCommands
  WRT->>Auto: materializeAuto*Commands
  Auto->>Cmd: 注入意图
  WRT->>Inst: tickOnce (每个实例)
  Inst->>Inst: 怪物 AI + 建筑构建 + 阵法推进 + tile 恢复
  Inst->>PR: advanceTick(players)
  PR->>PR: vital/buff/cooldown/cultivation/offline-gain
  WRT->>WRT: processPendingRespawns
  WRT->>Net: build PlayerView + diff + envelope
  Net->>Sock: emit WorldDelta/SelfDelta/PanelDelta
  WRT->>WRT: flushInstanceDomains (dirty → FlushLedger)
```

## 3. 玩家操作意图（移动 / 技能 / 物品 / 交易）

```mermaid
sequenceDiagram
  participant Client as Client
  participant GW as WorldGateway
  participant IF as CommandIntakeFacade
  participant Queue as PlayerCommandEnqueue
  participant WRT as WorldRuntimeService
  participant Write as GameplayWriteFacade
  participant PR as PlayerRuntime
  participant Inst as MapInstanceRuntime

  Client->>GW: n:c:move|castSkill|useItem|buyMarketItem...
  GW->>GW: 限流 / 鉴权 / 归一化
  GW->>IF: accept intent
  IF->>Queue: 入队（可覆盖 / 不可覆盖）
  Note over Queue: 等待下一个 tick

  WRT->>Queue: dispatchPendingCommands()
  Queue->>Write: 按序调用
  Write->>PR: 读/写玩家态
  Write->>Inst: 读/写实例态
  Write-->>GW: 异步结果通过 Notice/PanelDelta 推送
```

- 可覆盖意图（移动 / 寻路目标）：同 tick 最后一次生效。
- 不可覆盖意图（交易 / 炼丹启动 / 兑换码）：排队 + 幂等 + 拒绝规则。

## 4. 战斗链路（玩家施法）

```mermaid
sequenceDiagram
  participant C as Client
  participant GW as WorldGateway.handleCastSkill
  participant Disp as WorldRuntimePlayerSkillDispatch
  participant CA as CombatActionService
  participant Pipe as combat-pipeline
  participant Apply as outcome-apply-adapters
  participant Audit as CombatAuditOutbox
  participant Net as Sync/AOI
  participant C2 as Other Clients

  C->>GW: n:c:castSkill {skillId, target}
  GW->>Disp: dispatchCastSkill
  Disp->>Disp: 校验 cooldown / qi / 目标 / 视野
  Disp->>Disp: 吟唱窗口（pending-cast）
  Note over Disp: 下一 tick 或窗口结束
  Disp->>CA: resolvePlan + dispatchPlayerSkill
  CA->>Pipe: 执行阶段（命中/闪避/破防/伤害/暴击/buff）
  Pipe->>Apply: 把 outcome 转为具体副作用
  Apply->>Apply: 应用 HP/buff/掉落/击杀
  Apply->>Audit: enqueueCombatAuditEvent
  Apply->>Net: pushDamageFloatEffect / queuePlayerNotice / combat event
  Net->>C: SelfDelta / PanelDelta
  Net->>C2: WorldDelta（AOI 内其他玩家）
```

参考：`docs/chains/战斗链路.md`、`docs/architecture/ADR-战斗链路统一分层与过渡迁移.md`、`runtime/combat/` + `runtime/world/combat/`。

## 5. 炼丹 / 强化（Active Job）

```mermaid
sequenceDiagram
  participant C as Client
  participant GW as WorldGateway
  participant Craft as CraftPanelRuntime
  participant WRC as WorldRuntimeCraft (Alchemy/Enhancement)
  participant DO as DurableOperation
  participant PR as PlayerRuntime
  participant DB as PostgreSQL

  C->>GW: n:c:startAlchemy / startEnhancement
  GW->>Craft: ensure 资源 + 槽位
  Craft->>WRC: startAlchemyDurably / startEnhancementDurably
  WRC->>DO: startActiveJobWithAssets(playerId, jobSnapshot, assets)
  DO->>DB: 事务：扣材料/钱币 + 写 Active Job
  DB-->>DO: ok
  DO-->>WRC: snapshot (with version)
  WRC->>PR: 更新 runtime active job
  WRC->>GW: emit AlchemyPanel / EnhancementPanel

  loop 每 tick
    WRC->>WRC: tickAlchemy / tickEnhancement
    WRC->>WRC: 进度推进，仅在结束/检查点写库
  end

  Note over WRC: 完成时
  WRC->>DO: completeActiveJobWithAssets(playerId, rewards)
  DO->>DB: 事务：发放产物 + 清除 Active Job + 审计
  DO-->>WRC: ok
  WRC->>PR: 应用产物到 runtime
  WRC->>GW: emit 完成面板
```

Durable Op 保证：跨节点 lease、幂等 version、失败回滚、审计记录。

## 6. 市场交易（挂单 / 撮合 / 拍卖）

```mermaid
sequenceDiagram
  participant C as Client
  participant GW as WorldGateway
  participant MR as MarketRuntime
  participant DO as DurableOperation
  participant MP as MarketPersistence
  participant DB as PostgreSQL

  C->>GW: n:c:createMarketSellOrder / buyMarketItem / placeAuctionBid
  GW->>MR: runExclusiveMarketMutation(lock)
  MR->>MR: 校验数量/单价/物品/玩家资产
  MR->>MR: 计算撮合计划 planOrderMatches
  alt 即时成交（sellNow/buyNow）
    MR->>DO: settleMarketSellNow / settleMarketBuyNow
    DO->>DB: 事务：扣背包/扣钱 + 给对方仓储/钱币 + 审计
  else 挂单
    MR->>MP: 写订单
  else 拍卖
    MR->>MR: 更新拍卖 timing + 竞价历史
    MR->>MP: 写订单 + bid
  end
  MR-->>GW: 结果 + storage patch + notice
  GW-->>C: MarketUpdate / MarketListings / MarketStorage / Notice
```

参考：`docs/chains/交易链路.md`、`runtime/market/market-runtime.service.ts`、`persistence/market-persistence.service.ts`、`persistence/durable-operation.service.ts`。

## 7. 持久化刷盘（分域）

```mermaid
sequenceDiagram
  participant RT as Runtime
  participant Ledger as FlushLedger
  participant Wake as FlushWakeup
  participant Worker as Flush Worker / Main
  participant Domain as PlayerDomainPersistence / InstanceDomainPersistence
  participant DB as PostgreSQL

  RT->>Ledger: markDirty(owner, domain)
  Note over Ledger: 非阻塞，tick 内只标记
  Wake->>Ledger: 定时唤醒 + 下线/维护触发
  Wake->>Worker: 取脏 owner + domain
  Worker->>Domain: replacePlayer<X> / saveInstance<Y>
  Domain->>DB: INSERT ON CONFLICT / batch
  DB-->>Domain: ok
  Domain-->>Worker: ok
  Worker->>Ledger: markPersisted(owner, domain)
```

Worker 既可作为主进程内服务（`player-persistence-flush.service.ts` 等），也可作为独立进程（`tools/*-flush-worker.ts`，由 `packages/server/package.json` 的 `instance:*-worker` / `player:*-worker` / `mail:*-worker` 等启动）。

## 8. 断线重连

```mermaid
sequenceDiagram
  participant C as Client
  participant Sock as Socket.IO
  participant GW as WorldGateway
  participant Boot as WorldSessionBootstrap
  participant PR as PlayerRuntime
  participant Recovery as SessionRecoveryQueue

  Sock--xC: 连接断开
  Note over GW: handleDisconnect<br/>标记 session 为 disconnected
  GW->>Recovery: 入恢复队列
  Note over Recovery: keep-alive 窗口

  C->>Sock: 重连 + Hello
  Sock->>GW: handleHello(same playerId + token)
  GW->>Boot: rebind session
  Boot->>Recovery: 匹配断线会话
  alt 窗口内
    Boot->>PR: 无缝 rebind
    Boot->>Sock: emit 增量 + 视野重建
  else 超时/异常
    Boot->>PR: 重新加载快照
    Boot->>Sock: emit 完整 Bootstrap
  end
```

参考：`docs/architecture/0007-reconnection.md`、`network/world-session-recovery-queue.service.ts`、`world-session-reaper.service.ts`。

## 9. 地图实例迁移（跨节点）

```mermaid
sequenceDiagram
  participant GM as GM HTTP API
  participant WRT as WorldRuntime
  participant Lease as InstanceCatalog / NodeRegistry
  participant DB as PostgreSQL
  participant Target as 目标节点

  GM->>WRT: POST /gm/world/instances/:id/migrate
  WRT->>Lease: 申请目标节点 lease
  Lease->>DB: 更新 node/lease 记录
  WRT->>WRT: freezeInstanceWriting（老节点拒写）
  WRT->>WRT: flushInstanceDomains + flush players
  WRT->>DB: 保存 recovery-watermark + checkpoint
  WRT->>Target: 通知 rebuildPersistentInstance
  Target->>DB: 加载实例状态
  Target->>Target: hydratePersistentInstanceSnapshot
  Target->>Lease: 确认接管
  WRT->>WRT: 老节点移除 runtime
```

## 10. 内容发布与热更

```mermaid
sequenceDiagram
  participant Editor as Config Editor UI
  participant API as local-api.cjs
  participant FS as packages/server/data/
  participant Server as NestJS Server
  participant Runtime as Content/Map Repository

  Editor->>API: POST /api/monsters / techniques / maps
  API->>API: validate template
  API->>FS: 写 JSON
  API->>Server: POST /server/restart（可选）
  Server->>Runtime: onModuleInit → loadAll()
  Runtime->>FS: 读 JSON + normalize
  Runtime-->>Server: 运行时 catalog 可用
```

客户端 catalog 是构建期生成，不支持真正的热更；修改后需要重建前端或调用生成脚本。

## 11. 验证与发布链

```mermaid
graph LR
  Dev[开发者本地]
  Dev --> Q[verify:quick<br/>日常]
  Q --> S[verify:standard<br/>合并前]
  S --> D[verify:release:doctor<br/>环境自检]
  D --> L[verify:release:local<br/>代码+主证明]
  L --> WDB[verify:release:with-db<br/>DB proof]
  WDB --> SH[verify:release:shadow<br/>影子环境]
  SH --> A[verify:release:acceptance<br/>验收]
  A --> F[verify:release:full<br/>最严格]
  F --> Deploy[发布]
```

五层 gate 含义见 `packages/server/TESTING.md` 和 AGENTS.md §18；不可互相替代。

## 12. 部署（腾讯云 CCR + Docker Swarm）

```mermaid
sequenceDiagram
  participant Dev as 开发者
  participant CI as GitHub Actions (可选)
  participant Registry as CCR / GHCR
  participant SSH as 服务器
  participant Swarm as Docker Swarm

  alt 方式一：手工
    Dev->>Registry: docker-build-tencent.sh → push
    Dev->>SSH: ssh + prod.env
    SSH->>Swarm: docker stack deploy -c docker-stack.tencent.yml
  else 方式二：GHA 自动
    Dev->>CI: git push main
    CI->>Registry: build & push ghcr.io/.../{client,server}:sha-<commit>
    CI->>SSH: deploy.yml via SSH
    SSH->>Swarm: docker stack deploy -c docker-stack.yml
  end
  Swarm->>Swarm: 拉镜像 + 滚动更新
  Swarm->>Swarm: 健康检查 /health
```

参考：`README.md`、`docs/deploy-tencent-ccr.md`、`docs/runbook/deployment.md`。

## 相关文档

- `docs/chains/链路总览.md`（最全链路）
- `docs/chains/战斗链路.md` / `登录链路.md` / `交易链路.md` / `持久化链路.md`
- `docs/runbook/deployment.md` / `incident-response.md` / `战斗链路运维手册.md` / `mail-system.md` / `market-system.md` / `gm-system.md`
- `docs/architecture/0002-tick-model.md` / `0005-aoi-system.md` / `0006-map-instance.md` / `0007-reconnection.md`
