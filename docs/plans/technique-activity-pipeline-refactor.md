# 技艺彻底通用化计划

> 目标：把技艺系统从“统一入口 + 多套历史执行链”收敛为“单一权威活动管线 + 策略差异插槽”。本计划先定义目标态、迁移顺序和验证口径，不直接改变玩法数值、协议语义或玩家资产规则。

## 当前结论

当前代码已经有通用化雏形，但没有真正完成：

- `packages/shared/src/technique-activity-types.ts` 已定义统一技艺键：`alchemy`、`forging`、`enhancement`、`gather`、`building`、`mining`、`formation`。
- `packages/shared/src/technique-activity-meta.ts` 已集中维护部分协议事件、命令名和错误码。
- `TechniqueActivityPipelineService` 已提供 `start`、`tick`、`interrupt`、`cancel` 骨架。
- `AlchemyStrategy`、`ForgingStrategy` 的 start 和 tick 生命周期已拆入 pipeline strategy：start 由 strategy 提供 `validateStart`、`queueStart`、`consumeResources`、`createJob`，tick 由 `alchemy-like-tick.helpers.ts` 承载 phase 推进和批次结算；cancel 仍委托 `CraftPanelRuntimeService`。`EnhancementStrategy` 仍通过 `executeStart` / `executeTick` / `executeCancel` 全权委托回旧 service。
- `WorldRuntimeCraftTickService` 已按 active kind 统一调用 `tickTechniqueActivity`；炼丹、炼器、强化、采集、建造、挖矿、阵法维护的 tick 编排都进入 pipeline。采集/建造的 strategy tick 仍委托旧 runtime 服务承载真实规则，后续还要继续把领域规则拆入 strategy。
- 制造型新 start 已写入 `player.techniqueActivityQueue`；旧 active job 内 `queuedJobs` 会在玩家水合期迁移到统一队列并清掉旧字段，少量只读 fallback 仅用于兼容尚未水合的旧形态。
- 采集、建造、阵法维护属于条件型技艺；采集/建造/阵法维护的 sleeping 重试已经能通过 strategy 条件检查和 pipeline start 恢复，tick 条件暂时失败也能进入统一 sleeping 队列；采集/建造结算和外部占用推进已从 tick 编排层进入 pipeline，但真实领域规则仍委托旧 runtime 服务。
- 技艺经验已经有共享公式，但调用点仍分布在旧 runtime、pipeline、采集/挖矿/阵法链路中，持久化脏域需要统一保证。

## 本次需求理解

这次不是给现有工坊面板补几个显示字段，而是把“技艺动作”本身统一成一种权威运行时活动。玩家不应该需要理解某个动作背后属于炼丹 service、建筑 service、掉落容器 service、阵法 service 还是攻击地块链路；只要它是技艺行为，就应该表现为一个可见、可推进、可打断、可取消、可恢复的 job。

### 需求裁定

本计划后续按以下口径验收，不再把局部显示补丁视为完成：

- 所有技艺的具体动作都由 job 控制。这里的“具体动作”指玩家发起后会跨 tick 推进、锁定/消耗资源、占用外部对象、延迟产出、授予技艺经验、可打断或可取消的动作；包括炼丹、炼器、强化、采集、挖矿、建造、阵法持续维护/持续补充灵力。
- “走 job 控制”必须覆盖服务端权威生命周期：start、排队、条件检查、资源锁定/消耗、tick 推进、打断等待、取消、完成结算、经验、产出、持久化 dirty 和面板 patch。只把动作投影成一条客户端任务显示不算完成。
- 技艺面板里的统一任务列表是所有技艺 job 的公共运行态入口。挖矿、阵法持续维护/持续补充灵力、建造、采集不能只在地图、建筑面板、阵法面板或掉落面板中显示。
- 任务列表必须直接提供取消按钮。玩家可以从统一任务列表取消 running、interrupt_wait、queued、sleeping 中的可取消项，不需要切到对应技艺子面板；子面板里的取消按钮只能作为重复入口。
- 手动开始修炼、进行攻击、移动等行为产生的 10 息等待是独立等待状态，不是实际工作量。它只能写 `interruptWaitRemainingTicks` / `interruptState`，不能修改 `totalTicks`、`remainingTicks`、`workTotalTicks` 或 `workRemainingTicks` 来影响实际 job 进度条。
- 炼丹、炼器不再有玩家可见的“开炉”“准备”“炉火已稳”等阶段。它们开始后就是制作 job，面板和通知只展示制作进度、产出、失败、取消、排队和等待状态。
- 阵法需要拆清命名：持续维护/持续补充灵力属于 `formation` 技艺 job；一次性资源补给是资源管理命令，不进入 job 队列、不显示进度、不获得技艺经验、不参与打断等待。
- 本文中的“任务列表”特指技艺面板的活动任务列表，不是 NPC/主支线 quest 系统。

本轮裁定：

- “走 job 控制”不是把散落动作投影到任务列表里看起来像 job，而是 start、条件检查、资源锁定/消耗、tick 推进、打断等待、取消、完成结算、经验、产出、持久化和面板 patch 都由技艺活动生命周期托管。
- 任何跨 tick 推进、可以被打断或取消、会授予技艺经验、会占用外部对象、会延迟产出或持续消耗资源的技艺动作，都必须是 job。炼丹、炼器、强化、采集、挖矿、建造、阵法持续注入/维护灵力都属于这一类。
- 真正一次性完成的资源管理命令可以不是 job，但必须明确不显示进度、不进入队列、不获得技艺经验、不参与 10 息打断等待。例如一次性把灵石/灵力转入阵法资源池。
- 统一技艺任务列表是公共取消入口。各子面板可以保留专用取消按钮作为重复入口，但不能要求玩家必须进入对应子面板才能取消当前 job、排队项或休眠项。
- 当前“手动开始修炼、攻击等 10 息等待会修改实际 job 进度条”的行为按缺陷处理；后续实现中任何新增写路径都不得通过改 `totalTicks`、`remainingTicks`、`workTotalTicks` 或 `workRemainingTicks` 表达等待。
- 炼丹、炼器的“开炉/准备/炉火已稳”等阶段不再是玩家可见流程。内部兼容字段不能透出到通知、任务状态、按钮、进度文案或面板标题。
- 炼丹、炼器批次结算已经开始生成 `TechniqueActivityResolveResult` 形态，记录成功/失败、背包 delta、掉地 delta、经验参数、panel dirty、通知和境界经验；`materializeTechniqueActivityResolveResult` 已上移到公共 pipeline 模块。经验应用和入包副作用仍在炼丹工具端口里，后续要继续迁入公共 result 流程。

必须严格区分三个概念：

- 实际工作进度：job 还剩多少工作量，只由该技艺的真实劳动推进递减。
- 打断等待：攻击、移动、手动开始修炼等行为造成的恢复等待，是独立倒计时，不能通过增加 `totalTicks` 或回退 `remainingTicks` 伪装成工作变慢。
- 条件休眠：采集目标消失、建造目标被占用、阵法条件不足等外部条件失败，不等同于 10 息打断；它要么进入 sleeping 队列等待重试，要么按明确规则取消并释放外部占用。

玩家侧目标体验：

- 挖矿、采集、建造、阵法持续补充灵力、炼丹、炼器、强化都在技艺面板的任务列表里可见。
- 当前 job、打断等待、排队任务、休眠任务都在同一任务列表里显示。
- 技艺任务列表里的每个可取消项都有取消按钮，不要求进入对应技艺子面板；这里的“任务列表”指工坊/技艺面板里的活动任务列表，不是任务/quest 系统。
- 炼丹、炼器不再有玩家可见的“开炉/准备/炉火已稳”阶段；开始后就是制作 job。

工程侧目标约束：

- 技艺 job 的 start/cancel/interrupt/tick 必须最终只经过 `TechniqueActivityPipelineService`。
- 旧 service 可以短期作为 facade 或策略适配，但不能长期保留真实规则真源。
- 高频 task patch 只能发 job 进度、等待、状态、队列 add/remove；配方、候选、长文本、目录数据不混入每 tick 包。
- 任何会影响资产、建筑占用、容器占用、阵法状态、经验和掉落的行为，必须在服务端权威路径里结算，并能被 smoke/proof 验证。

## 当前链路审计

| 技艺 | 当前入口 | 当前 tick / 推进 | 当前 job / 状态 | 当前主要问题 |
|------|----------|------------------|------------------|--------------|
| 炼丹 | `C2S.StartAlchemy` -> `WorldRuntimeAlchemyService` -> `TechniqueActivityPipelineService.start('alchemy')` -> `AlchemyStrategy.validateStart/queueStart/consumeResources/createJob` | `WorldRuntimeCraftTickService` -> `tickTechniqueActivity('alchemy')` -> `AlchemyStrategy.executeTick` -> `executeAlchemyLikeTick` | `player.alchemyJob`，含 `brewing`、旧存档兼容 `queuedJobs` | start/tick 已进 pipeline strategy；cancel 仍委托旧 service；经验和产出仍通过 service 工具端口落地，后续要收敛为统一 result |
| 炼器 | `C2S.StartAlchemy` + `kind=forging` -> `TechniqueActivityPipelineService.start('forging')` -> `ForgingStrategy.validateStart/queueStart/consumeResources/createJob` | `WorldRuntimeCraftTickService` -> `tickTechniqueActivity('forging')` -> `ForgingStrategy.executeTick` -> `executeAlchemyLikeTick` | `player.forgingJob`，历史兼容 `alchemyJob.jobType='forging'` | start/tick 已进 pipeline strategy；cancel 仍委托旧 service；经验和产出仍通过 service 工具端口落地，后续要收敛为统一 result |
| 强化 | `C2S.StartEnhancement` -> `WorldRuntimeEnhancementService` -> `startEnhancement` | `WorldRuntimeCraftTickService` -> `tickTechniqueActivity('enhancement')` -> strategy 委托 `tickEnhancement` | `player.enhancementJob` + `inventory.lockedItems` + `enhancementRecords` | pipeline strategy 仍委托旧 service；资产链复杂；打断等待已从实际工作进度拆出 |
| 采集 | `C2S.StartGather` -> `TechniqueActivityPipelineService.start('gather')` -> `dispatchStartGather` | `WorldRuntimeCraftTickService` -> `tickTechniqueActivity('gather')` -> `GatherStrategy.executeTick` -> `WorldRuntimeLootContainerService.tickGather` | `player.gatherJob` + 容器 `activeSearch` | tick 编排已统一；真实采集结算仍委托旧 loot container service，后续要拆入 strategy/result |
| 挖矿 | 矿镐 `mining:start` context action -> `startMining` pending command -> `TechniqueActivityPipelineService.start('mining')`；攻击/技能命中地块仍保留战斗破坏入口 | `MiningStrategy.executeTick` 复用地块伤害、阵法减伤、掉落、挖矿经验和宗门扩张副作用；战斗入口仍在 `world-runtime-basic-attack.service` / `world-runtime-player-skill-dispatch.service` 内独立结算 | `player.miningJob` + `player.miningSkill`，active job 快照已识别 `mining` | 已有可见 job、取消、打断等待独立条和最小 smoke；仍需后续把所有条件型 tick 编排完全收敛到 pipeline |
| 建造 | `startBuilding` 命令 -> `TechniqueActivityPipelineService.start('building')` -> `dispatchStartBuildingConstruction` | `WorldRuntimeCraftTickService` -> `tickTechniqueActivity('building')` -> `BuildingStrategy.executeTick` -> `tickBuildingConstruction` | `player.buildingJob` + 建筑 `activeBuilderPlayerId` | tick 编排已统一；真实建造结算仍委托旧 building runtime，后续要拆入 strategy/result |
| 阵法维护 / 补充灵力 | `startFormationMaintenance` -> `TechniqueActivityPipelineService.start('formation')`；`refillFormation` 是待命名澄清的一次性资源操作 | `TechniqueActivityPipelineService.tick('formation')` -> `WorldRuntimeFormationService.resolveFormationMaintenanceTick` | `player.formationJob`，持续维护每息注入灵力 | 持续补充灵力必须是 `formation` job 并进入任务列表；一次性补给只能作为无进度资源操作，不能承载技艺经验、打断等待或任务进度 |

### 现有真源和副作用

- active job：当前分散在 `player.alchemyJob`、`player.forgingJob`、`player.enhancementJob`、`player.gatherJob`、`player.buildingJob`、`player.formationJob`。
- 队列：炼丹/炼器/强化的新 start 已写入 `player.techniqueActivityQueue`；旧 `queuedJobs` 仍需要读取、迁移和清理。
- 技艺经验：炼丹/炼器/强化在 `CraftPanelRuntimeService` 内算；采集在 `WorldRuntimeLootContainerService` 内算；挖矿在地块攻击链路内算；阵法维护在 `WorldRuntimeFormationService` 内算；建造在 building runtime 内算。
- 资产副作用：强化涉及锁定装备、保护物、灵石、强化记录；炼丹/炼器涉及材料、灵石、产出；采集/挖矿涉及容器/地块掉落和背包授予；阵法涉及玩家灵力和阵法灵力池；建造涉及建筑实例状态和 activeBuilder。
- 面板副作用：炼丹/炼器/强化已有工坊面板；统一 `S2C.TechniqueActivityTasks` 已把采集、挖矿、建造、阵法维护等 runtime kind 的任务视图送入工坊顶部公共任务列表。后续仍需继续把真实结算、经验、通知和 panel patch 从旧 service 拆入统一 result。

## 目标状态

### 用户需求口径

本轮讨论确认的目标体验：

- 所有技艺的具体动作都必须由 job 控制。炼丹、炼器、强化、采集、挖矿、建造、阵法持续补充灵力都不再走散落的即时动作或独立 tick 分支。
- 技艺面板必须能看到所有技艺 job。挖矿、阵法持续补充灵力、建造、采集和炼制类任务一样，都应在技艺面板中显示当前进度、等待状态和队列状态。
- 阵法相关命名必须分清两类：持续注入/维护灵力是 `formation` 技艺 job；一次性把资源转入阵法池是资源管理命令，不显示为持续 job，也不获得技艺经验。如果现有“补充灵力”按钮实际具有进度、等待、可打断或持续注入语义，就必须迁入 `formation` job。
- 打断等待必须是单独的等待条。手动开始修炼、进行攻击等导致的 10 息等待，只影响“打断等待/恢复倒计时”，不能修改实际 job 的总进度、剩余工作量或进度条比例。
- 炼丹、炼器不再保留“开炉/准备/炉火已稳”等阶段表现。它们应表现为一个直接进行的制作 job，开始后按 job 进度推进。
- 任务列表中的每个可取消任务都必须直接提供取消按钮，不要求玩家切到对应技艺子面板才能取消。

非目标：

- 不是把所有技艺改成同一种玩法规则。强化的装备锁定、采集的容器占用、建造的 activeBuilder、阵法的灵力池、挖矿的地块耐久仍由各自 strategy 维护领域规则。
- 不是让客户端决定 job 是否能继续。客户端只展示任务和发取消/开始意图，条件检查和结算仍在服务端。
- 不是把“打断等待”并入 job 耗时。等待条只影响恢复前倒计时，不影响实际工作总量。

### 单一权威执行入口

所有技艺活动的开始、取消、中断、tick 推进都只通过：

```ts
TechniqueActivityPipelineService.start(...)
TechniqueActivityPipelineService.cancel(...)
TechniqueActivityPipelineService.interrupt(...)
TechniqueActivityPipelineService.tick(...)
```

网络层、命令队列、世界 tick、面板刷新都只调统一入口。旧的 `WorldRuntimeAlchemyService`、`WorldRuntimeEnhancementService` 可以保留为薄适配层，但不再承载玩法规则。

### 单一 active job 模型

所有进行中技艺统一成：

```ts
type RuntimeTechniqueActivityJob = {
  jobRunId: string;
  kind: RuntimeTechniqueActivityKind;
  phase: string;
  startedAt: number;
  workTotalTicks: number;
  workRemainingTicks: number;
  interruptWaitRemainingTicks: number;
  successRate: number;
  spiritStoneCost: number;
  jobVersion: number;
  payload: unknown;
  progress: unknown;
};
```

进度条只使用 `workTotalTicks` / `workRemainingTicks` 计算。`interruptWaitRemainingTicks` 是独立等待状态，只显示等待条或等待标签，不允许改变 job 的实际工作进度。

短期可以继续水合到 `player.alchemyJob` / `player.forgingJob` / `player.enhancementJob` 等字段，避免一次性迁移所有投影和持久化；最终真源应收敛到 `player_active_job` 的 `job_type` + `raw_payload`。

### 打断等待语义

打断等待是“恢复执行前的冷却”，不是实际工作量：

```ts
type TechniqueActivityInterruptState = {
  reason: 'move' | 'attack' | 'cancel' | 'cultivate';
  waitTotalTicks: number;
  waitRemainingTicks: number;
  startedAtTick: number;
};
```

规则：

- job 被打断时，`workTotalTicks` 和 `workRemainingTicks` 不变。
- pipeline 只递减 `interruptWaitRemainingTicks`；等待未结束时不推进 `workRemainingTicks`。
- UI 同时显示两个概念：实际工作进度条、打断等待条。
- 重复打断不叠加实际工作时间；等待条按规则刷新或取最大值，不能膨胀 job 总时长。
- 条件型技艺离开目标范围时，优先进入 sleeping 队列或取消；不是所有条件失败都等同于 10 息打断。

### 单一技艺面板

技艺面板按统一活动视图展示所有技艺 job：

- 统一任务列表是技艺面板的公共运行态区域，不属于某个炼丹、强化、建筑或阵法子面板。
- 当前执行 job：显示技艺类型、目标、实际进度条、打断等待条、预计剩余工作量。
- 任务队列：显示等待任务、休眠任务、条件不满足原因、每项取消按钮。
- 取消按钮只使用 `cancelRef` 提交服务端意图；客户端不能根据子面板状态自行判断退款、释放占用或结算结果。
- 具体技艺子面板：仍可保留炼丹配方、强化候选、阵法目标等专用操作区，但当前 job 和队列的可见性必须统一。
- 挖矿、采集、建造、阵法持续补充灵力不能只在地图、掉落面板、建筑面板或阵法面板里显示；技艺面板必须同步显示。
- 高频刷新必须局部 patch，不能因为 job 进度变化重建整个技艺面板，不能打断配方选择、强化目标选择、滚动和展开态。

统一任务视图建议：

```ts
type TechniqueActivityTaskView = {
  id: string;
  kind: RuntimeTechniqueActivityKind;
  label: string;
  targetLabel?: string;
  state: 'running' | 'interrupt_wait' | 'queued' | 'sleeping' | 'blocked' | 'completing';
  workTotalTicks?: number;
  workRemainingTicks?: number;
  interruptWaitRemainingTicks?: number;
  sleepReason?: string;
  canCancel: boolean;
  cancelRef: { kind: RuntimeTechniqueActivityKind; jobRunId?: string; queueId?: string };
};
```

字段同步层级：

- 首次打开技艺面板：下发完整 task view + 各子面板需要的 catalog revision。
- 每 tick 运行态：只发发生变化的 `workRemainingTicks`、`interruptWaitRemainingTicks`、`state`、`sleepReason`、队列 add/remove。
- 配方、候选、长文本、材料目录仍属于低频 detail/catalog，不混入每 tick task patch。

### 单一队列模型

统一保留一种队列：

- 推荐目标：`player.techniqueActivityQueue`
- 队列项只保存 `kind`、`payload`、`label`、`state`、`retryAfterTicks`、`createdAt`
- 废弃 active job 内部的 `queuedJobs`
- 所有“当前任务后继续”“加入队列末尾”“替换队列”都映射为统一队列操作
- 队列和当前 job 都暴露取消动作。取消按钮直接在统一任务列表中出现，并提交服务端取消意图。

迁移期允许读取旧 `queuedJobs` 并搬迁到统一队列，但不再写入新旧两套结构。

### 取消语义

统一任务列表里的取消按钮只提交意图，服务端裁定结果：

- 当前 running job：按该技艺取消规则执行资源退还、锁定物释放、外部占用释放和记录落盘。
- interrupt wait 中的 job：取消的是原 job，不只是取消等待条。
- sleeping job：从队列移除，并释放可能残留的外部占用。
- queued job：只从队列删除，不扣资源；如果某技艺采用“入队即锁资源”，必须在 strategy 中明确退款规则。
- 已进入完成结算中的 job：取消请求应被拒绝或等待结算结束，不允许制造资产双写。

### 策略只承载差异

pipeline 负责公共生命周期：

- 活动互斥与排队
- 启动校验结果包装
- 资源消耗/锁定后的 dirty domain
- tick 倒计时
- 暂停/恢复/中断
- 打断等待倒计时
- 条件型休眠和重试
- 结算结果分发
- 技艺经验
- 产出入包或掉地
- active job 持久化版本
- 面板 patch 触发

strategy 只负责领域差异：

- 配方型：炼丹、炼器
- 装备型：强化
- 条件采集型：采集、建造、阵法维护
- 破坏/采矿型：挖矿

## 分层边界

### shared

- 定义 `RuntimeTechniqueActivityKind`、job base、队列项、公共 result 类型。
- 放共享公式：成功率、耗时、经验、等级修正。
- 不包含服务端库存、钱包、地图实例或数据库依赖。

### server runtime

- 唯一执行真源。
- 负责资源校验、锁定、扣除、产出、经验、活动互斥、tick 推进。
- tick 内只读预解析内容和玩家运行态，不做配置文件解析或数据库 IO。

### server persistence

- 保存 active job、profession、inventory、equipment、enhancement_record 等真源。
- 负责旧 job shape 到新 job shape 的水合兼容。
- 不承载玩法判定。
- active job 和队列必须能一起恢复；不能恢复了 job 却丢队列，也不能恢复队列后重复启动已完成 job。

### server network

- socket/http 只做鉴权、payload 适配、命令入队、面板出包。
- 不直接修改技艺运行态。

### client

- 只负责面板展示、输入、局部 patch、队列状态显示。
- 不复刻服务端成功率以外的权威判定；显示用公式必须来自 shared 或服务端 payload。
- 技艺面板必须统一展示所有技艺 job 和队列项，并为当前 job / 队列项提供取消按钮。
- 打断等待展示为独立条，不覆盖实际 job 进度条。

### config-editor/content

- 配方、材料、工具加成、基础耗时、基础成功率、产出规则在导入期或启动期校验。
- 运行时只读预解析 catalog。

## 迁移阶段

### Phase 0：事实校准和保护网

- [ ] 补一份当前数据流审计：炼丹、炼器、强化、采集、建造、挖矿、阵法维护各自的 start -> tick -> resolve -> persist -> panel。
- [ ] 列出所有玩家可触发的技艺具体动作，并逐项判定为“必须 job 化”或“一次性资源管理命令”；判定依据必须写清是否跨 tick、是否可打断/取消、是否授予技艺经验、是否占用外部对象、是否延迟产出。
- [x] 额外审计阵法补充灵力链路，确认它是阵法维护、阵法补充还是独立技艺动作，避免命名统一后遗漏真实运行态。
- [x] 审计 `refillFormation` 是否是即时消耗动作、持续 job、还是应拆成“下达补充”与“维护注入”两个动作。
- [ ] 审计挖矿是否保留“攻击地块产生伤害”的战斗路径，还是新增“挖矿 job 对矿脉施加工作量”的独立路径；如果两者并存，要定义经验和掉落不可重复。
- [ ] 列出每种技艺当前写入的 dirty domain。
- [ ] 列出每种技艺当前依赖的外部资源：背包、钱包、锁定物品、地图容器、建筑 activeBuilder、阵法实例。
- [ ] 找出所有当前会修改 `remainingTicks` / `totalTicks` 来表达打断等待的路径。
- [ ] 找出所有攻击、移动、手动开始修炼、切换状态等会中断技艺的入口，确认它们只写 `interruptWaitRemainingTicks` / `interruptState`，不污染实际工作进度。
- [ ] 找出炼丹、炼器中“准备/开炉/炉火已稳”相关阶段、文本和客户端展示点。
- [ ] 标记所有服务端玩家可见文本拼接点，后续迁移时改为结构化 notice。
- [ ] 建立最小 smoke 清单，不先改行为。

验收：

- [ ] 文档能说明每种技艺当前真源和消费方。
- [ ] 没有未读实现就提出的抽象假设。

### Phase 1：统一类型和结果契约

- [x] 把 job 进度字段拆成实际工作进度和打断等待状态：`workTotalTicks` / `workRemainingTicks` / `interruptWaitRemainingTicks`。
- [x] 明确兼容期从旧 `totalTicks` / `remainingTicks` / `pausedTicks` 到新字段的水合规则。
- [x] 定义 `TechniqueActivityTaskView` 和 `TechniqueActivityTaskPatch`，用于统一技艺面板当前 job / 队列 / 等待条展示。
- [x] 定义统一取消 payload：`{ kind, jobRunId? , queueId? }`。
- [x] 扩展 `TechniqueActivityResolveResult`，支持 inventory output、wallet delta、equipment delta、record delta、panel dirty、structured notice。
- [ ] 区分 `start` 结果、`tick` 结果、`cancel` 结果，避免用 `CraftMutationResult` 承载所有情况。
- [ ] 把 `TechniqueActivityNoticeMessage.text` 改为结构化 payload 的计划项，不在新链路继续扩散文本拼接。
- [x] 给 strategy 增加明确的 `getActiveJob` / `setActiveJob` 或 job accessor，减少字符串 slot。
- [ ] 明确公共 pipeline 是否负责入包；如果负责，strategy 不直接改背包；如果不负责，result 类型不能命名为 outputs 后再掉地。

验收：

- [x] shared build 通过。
- [x] 旧策略委托模式仍可编译运行。
- [x] 新 result 类型能覆盖强化锁定物、保护物、强化记录。
- [x] 打断等待字段不会参与实际 job 进度百分比计算。

### Phase 2：统一活动互斥和队列

- [x] 选择 `techniqueActivityQueue` 作为唯一队列真源。
- [x] 明确资源扣除时机：默认 running job 启动时扣资源，queued job 不提前扣资源；例外必须在 strategy 中写明。
- [x] 给炼丹、炼器、强化 start 入口改为写统一队列，不再写 job 内 `queuedJobs`。
- [x] 水合期把旧 `queuedJobs` 迁移到 `techniqueActivityQueue`。
- [x] 队列推进使用真实 `buildPipelineContext(deps)`，不能再用 `contentTemplateRepository: null` 和固定 `resolveExpToNextByLevel: () => 100`。
- [x] `hasAnyActiveTechniqueActivity` 必须覆盖全部 runtime kind，不能遗漏 gather/building/formation。
- [x] 队列项和当前 job 都有统一 `cancelToken` / `queueId` / `jobRunId`，支持任务列表直接取消。

验收：

- [x] 当前任务完成后能启动下一项队列任务。
- [x] 条件型 sleeping 项不会每 tick 热检查。
- [x] active job 和队列都能持久化恢复。
- [x] 从统一任务列表取消当前 job 或队列项，不需要进入对应技艺子面板。

### Phase 3：配方型技艺落入 pipeline

范围：炼丹、炼器。

- [x] 从 `CraftPanelRuntimeService.startAlchemy` 拆出 `validateStart`、`queueStart`、`consumeResources`、`createJob`，并让 `AlchemyStrategy` / `ForgingStrategy` start 走 pipeline 公共生命周期；tick/cancel 后续继续拆。
- [x] 从 `tickAlchemy` 拆出 phase 推进和 batch resolve；旧 `tickAlchemy` 仅作为兼容 wrapper 回调 pipeline。
- [x] 去掉炼丹、炼器的准备/开炉阶段；创建 job 后直接进入实际制作进度。
- [x] 删除或替换“开始准备炼制”“炉火已稳”“开炉”等阶段文本和面板状态。
- [x] 炼器保留独立 `forgingJob` 和 `forgingSkill`，不再寄生炼丹语义。
- [x] 经验走 pipeline 公共 `profession` 写入。
- [x] 产出入包/掉地只保留一处实现。
- [ ] 面板 patch 仍保持炼丹/炼器现有客户端结构，避免 UI 同步大改。

验收：

- [x] 炼丹成功、失败、取消、打断、队列、掉地全部 smoke。
- [x] 炼器成功、失败、取消、打断、队列、掉地全部 smoke。
- [x] 旧存档中的 active alchemy/forging job 能恢复并继续。
- [x] 打断 10 息时，炼丹/炼器实际制作进度不倒退、不膨胀总时长，只显示独立等待条。

### Phase 4：强化落入 pipeline

范围：强化。

- [ ] 从 `startEnhancement` 拆出目标解析、资源校验、锁定空间写入、job 创建。
- [ ] 从 `tickEnhancement` 拆出成功判定、保护物消耗、失败降级/归零、连续冲级 advance。
- [ ] 强化记录写入作为 strategy result 的 record delta 或 strategy 内部显式 hook，不能隐藏在旧 service。
- [x] 保留 `itemInstanceId` 锁定空间为装备真源，不能回退到完整装备快照。
- [x] 成功率显示与实际结算仍共用 shared 公式。

验收：

- [x] 强化显示 candidate successRate == job successRate == tick 判定 successRate。
- [x] 保护物不足、灵石不足、锁定物丢失都有确定停止结果。
- [x] 强化记录和装备/背包持久化一致。
- [x] 打断 10 息时，强化实际冲级进度不被改写，只显示独立等待条。

### Phase 5：条件型技艺落入 pipeline

范围：采集、挖矿、建造、阵法维护/持续补充灵力。

- [x] 采集、建造 start/cancel 命令入口先经 `TechniqueActivityPipelineService`，再委托真实 runtime 服务执行领域规则。
- [x] sleeping 队列恢复不再用假 job 检查条件，而是使用队列原始 payload 构造条件探针，并通过 pipeline start 重新启动。
- [x] 采集 sleeping 恢复接入真实容器存在、距离、loot window、剩余量条件检查；兼容旧队列中只有容器 id 的 payload。
- [x] 建造 sleeping 恢复接入建筑存在、状态为 building、activeBuilderPlayerId 条件检查。
- [x] 采集 tick 离开范围时释放 `activeSearch`，清 active job，并写入统一 sleeping 队列；容器消失/采尽仍明确取消。
- [x] 建造 tick 遇到 `activeBuilderPlayerId` 被其他玩家占用时清 active job，并写入统一 sleeping 队列；建筑消失/完工仍明确取消或完成。
- [x] 采集条件检查接入真实容器距离、容器存在、容器剩余量、activeSearch 释放/恢复。
- [x] 挖矿从地图/战斗破坏链路中梳理为可显示的技艺 job，明确矿脉目标、每息工作量、产出和经验。
- [x] 挖矿 job 必须与战斗攻击地块路径互斥或去重：技艺 job 的每次地块伤害只在 `MiningStrategy.executeTick` 中调用一次掉落/经验 helper；攻击/技能地块破坏保留为独立战斗入口，不复用同一次 damage result。
- [x] 建造条件检查接入建筑存在、状态为 building、activeBuilderPlayerId。
- [x] 阵法维护条件检查接入阵法实例、控制点、灵石存量规则；离开控制点进入统一 sleeping 队列，阵法失效/灵石耗尽明确取消。
- [x] 阵法补充灵力命名和入口收敛：持续注入/维护必须使用 `formation` job 并在任务列表展示；一次性资源补给必须明确标记为资源管理命令，不得混入技艺进度、经验或打断等待。
- [x] 条件失败统一进入 sleeping 队列或明确取消，不能静默清 job。（采集/建造/阵法维护/挖矿已覆盖；挖矿目标永久失效时取消，离开矿脉范围时进入 sleeping payload。）
- [x] 中断、移动、战斗、打坐触发统一 `interruptTechniqueActivity`。（采集/建造会先写 sleeping 队列，再通过 strategy 委托真实释放路径；阵法移动仍由控制点条件失败进入 sleeping，避免把离开范围误表现为 10 息暂停。）
- [x] 采集 `activeSearch` 增加运行时 owner，第二个玩家不能覆盖同一草药采集目标的 active job 进度；竞争玩家会被拒绝或转入 sleeping，而原 owner 的 activeSearch 保持不变。
- [x] 采集目标永久消失时，真实 `tickGather` 委托路径也会释放遗留 `container_state.activeSearch` 并标记 container persistence dirty，避免目标已消失但外部占用残留。
- [x] 建造 `activeBuilderPlayerId` 在实例权威层拒绝其他玩家重入，竞争启动不会覆盖原 activeBuilder，也不会推进建筑 revision / dirty domain。
- [x] 这些 job 的当前进度、打断等待和条件睡眠状态都要进入统一技艺面板。

验收：

- [x] 条件暂时不满足时休眠，恢复后能继续。
- [ ] 条件永久失效时取消并释放外部占用。
- [x] 多玩家竞争 activeBuilder / activeSearch 不会重入。
- [x] 挖矿、采集、建造、阵法持续补充灵力都能在技艺面板看到当前 job。
- [x] 打断等待不会污染这些 job 的实际进度条。

### Phase 6：tick 编排收敛

- [x] `WorldRuntimeCraftTickService.advanceCraftJobs` 不再特殊分发炼丹、强化、采集、建造。
- [x] 每个玩家每 tick 只枚举活跃技艺 kind，然后统一调用 `pipeline.tick`。
- [x] EventBus active job progress 从统一 job view 构建。
- [ ] `WorldRuntimeAlchemyService`、`WorldRuntimeEnhancementService` 降级为兼容 facade 或删除。

验收：

- [x] 不存在同一个 job 被双重 tick 的路径。
- [ ] 所有面板 patch 仍局部刷新，不全量重刷。
- [ ] tick 内无数据库 IO、无配置解析、无高频 JSON 签名比较。（采集完成仍可能在 `tickGather` 内走 durable inventory grant，后续拆分规则时必须处理。）

### Phase 7：持久化模型收敛

- [x] `player_active_job` 支持统一 job payload。
- [x] 玩家完整快照 `progression` 保存、回读、水合和运行态 clone 覆盖 `techniqueActivityQueue`。
- [x] `player_profession_state` 保持按 profession type 存储。
- [x] 旧 `alchemyJob` / `forgingJob` / `enhancementJob` / `gatherJob` / `buildingJob` / `formationJob` 水合兼容保留一个发布周期。
- [ ] flush ledger / active job version 只在统一路径 bump。
- [x] 从统一任务列表取消队列项时标记 `active_job` 脏域并递增持久化版本，避免队列删除只刷新面板不落入快照。
- [ ] 崩溃恢复时锁定物、队列、active job 能一起恢复或一起清理。

验收：

- [ ] 活跃任务重启后能继续或按规则停止。
- [ ] 取消、完成、失败、异常恢复不会造成资产复制或丢失。
- [x] 持久化 proof 自带清理。

### Phase 8：客户端和协议整理

- [x] 增加统一技艺任务视图 payload，包含当前 job、打断等待、队列项、休眠原因、取消能力。
- [x] 技艺面板增加公共任务列表区域，作为所有技艺 job 的统一可见入口；子面板不能独占运行态展示。
- [x] 保留现有面板 payload 作为专用操作区数据，先不强迫炼丹/强化配方区一次性改成完全通用结构。
- [x] 网络发送 helper 保留 `sendStartAlchemy` 等语义入口，但内部映射到通用 activity command。
- [x] 新增统一取消发送 helper，任务列表点击取消只发 `cancelRef`，不需要知道子面板内部结构。
- [x] 队列展示改读统一队列 view，并为每个可取消项提供取消按钮。
- [x] 进度展示改读统一 active job progress view；实际进度条与打断等待条分离。
- [x] 技艺面板增加所有技艺 job 的统一任务列表，覆盖挖矿、阵法持续补充灵力、建造、采集。
- [ ] 手机端、浅色、深色仍保持现有工作台体验。

验收：

- [ ] 炼丹、炼器、强化面板不会因 tick patch 丢焦点、丢滚动、丢当前选择。
- [x] 采集/建造/阵法的活动状态显示一致。
- [x] 从任务列表点击取消能取消当前 job 或队列项。
- [ ] 打断等待条更新不会触发整面板重建。

## 不做事项

- 不改技艺数值平衡。
- 不新增玩法入口。
- 不把客户端显示状态变成权威状态。
- 不在本次迁移中改 docker-stack。
- 不把配置 schema 校验放入 tick。
- 不把持久化 IO 放进 tick。
- 不为了“统一”抹平强化、建造、采集这些确实不同的领域规则。
- 不再用修改 job 实际剩余时间的方式表达打断等待。
- 不保留炼丹、炼器的开炉/准备阶段作为玩家可见流程。

## 风险点

- 强化资产链最危险：装备锁定空间、保护物、灵石扣费、强化记录必须一次验证完整。
- 队列迁移容易产生重复启动或丢队列，需要先做只读诊断和水合迁移。
- 条件型技艺涉及外部占用，不能只清 job，不释放容器/建筑/阵法状态。
- 面板 patch 如果跟 active job shape 一起改，容易造成客户端全量刷新或状态丢失。
- 打断等待从实际进度拆出时，旧存档里的 `pausedTicks` / 膨胀后的 `remainingTicks` 需要一次性水合校正，否则会出现进度跳变。
- 挖矿和阵法持续补充灵力如果当前由其他系统直接推进，迁入 job 时必须保留原来的权威资源扣除、产出和条件检查；一次性阵法补给则必须从文案和协议语义上与持续技艺 job 分离。
- 挖矿从攻击链迁出时，不能破坏技能攻击地块、阵法减伤、地块掉落和战斗表现；需要明确“战斗破坏地块”和“技艺挖矿 job”是否是两个入口。
- 统一面板如果把所有子面板数据都塞进高频包，会导致包体膨胀；task patch 必须独立于配方/候选 detail。
- 旧计划文档曾标记“全部完成”，但当前代码事实显示它只是完成了骨架和委托接入，不能以旧文档状态作为完成依据。

## 最小验证基线

每个 phase 至少跑对应最小门禁：

- shared/type 变更：`pnpm build:shared` + `pnpm audit:protocol`
- 服务端 runtime 变更：`pnpm --filter @mud/server compile`
- 普通技艺链路：`pnpm verify:quick`
- 客户端面板变更：`pnpm verify:client`
- 持久化/DB 变更：`pnpm verify:release:with-db`

推荐补充 smoke：

- `alchemy-pipeline-smoke`
- `forging-pipeline-smoke`
- `enhancement-pipeline-smoke`
- `technique-activity-queue-smoke`
- `conditional-technique-activity-smoke`
- `active-job-persistence-recovery-smoke`
- `technique-panel-unified-job-list-smoke`
- `technique-interrupt-wait-separate-progress-smoke`
- `mining-formation-building-gather-job-visibility-smoke`

### 当前阶段验证记录

- 2026-05-27：`pnpm --filter @mud/server compile` 通过，覆盖 shared build、协议 payload/map、protobuf contract、server tsc。
- 2026-05-27：`pnpm --filter @mud/client exec tsc --noEmit --pretty false` 通过，覆盖客户端 TS 类型。
- 2026-05-27：`node packages/server/dist/tools/technique-activity-task-view-smoke.js` 通过，证明 active job、旧制造队列、统一技艺队列可投影为统一任务视图，且打断等待独立于 `workRemainingTicks`。
- 2026-05-27：`node packages/server/dist/tools/technique-activity-cancel-ref-smoke.js` 通过，证明统一取消引用可删除统一队列和旧制造队列，并用 `jobRunId` 防止旧按钮误取消新任务。
- 2026-05-27：`node packages/server/dist/tools/world-runtime-alchemy-smoke.js` 通过，覆盖炼丹/炼器创建后直接进入制作 job、炼器独立 `forgingJob`、制造队列进入 `techniqueActivityQueue` 且当前任务完成后启动下一项、取消文案去炉火、打断等待不修改实际工作进度、统一写入口刷新面板和 active job 快照。
- 2026-05-27：`node packages/server/dist/tools/world-runtime-alchemy-smoke.js` 补齐 Phase 3 边界 proof：炼丹失败不产出、背包满时成功产出掉地；炼器成功入包、失败不产出、背包满时掉地、打断等待独立、取消清 job、队列从统一 `techniqueActivityQueue` 启动下一项；旧 active alchemy/forging job shape 能继续 tick 到完成。
- 2026-05-27：`node packages/server/dist/tools/world-runtime-craft-smoke.js` 通过，覆盖 `hasAnyActiveTechniqueActivity` 可见全部 runtime kind，采集/建造在迁移前仍走专用释放和 tick 路径，避免因统一枚举发生双中断或双 tick。
- 2026-05-27：`node packages/server/dist/tools/world-runtime-enhancement-smoke.js` 通过，覆盖强化启动后写入 `workRemainingTicks/workTotalTicks`、打断等待只改 `interruptWaitRemainingTicks`、tick 按 `job.successRate` 判定成功/失败、保护失败消耗保护物并继续、保护物不足停止并返还当前等级、灵石结算不足停止并返还当前等级、锁定物丢失停止且不扣灵石、成功回写强化等级和记录、取消释放锁定目标。
- 2026-05-27：`node packages/server/dist/tools/enhancement-panel-payload-smoke.js` 通过，覆盖强化面板候选成功率、runtime candidate 成功率和共享强化公式一致；运行中出现 legacy `itemInstanceId` 升级 WARN 属于该 smoke 的夹具数据。
- 2026-05-27：`TechniqueActivityStrategy` 增加 `getActiveJob` / `setActiveJob`，pipeline 和 queue 优先通过 accessor 读写 active job；`pnpm --filter @mud/server compile`、`world-runtime-alchemy-smoke`、`world-runtime-enhancement-smoke`、`world-runtime-craft-smoke`、`technique-activity-task-view-smoke`、`technique-activity-cancel-ref-smoke` 通过，证明 accessor 兼容现有委托策略和统一取消/任务视图。
- 2026-05-27：`WorldRuntimeCraftTickService.advanceCraftJobs` 移除炼丹、炼器、强化的 facade 特殊 tick 分发，统一调用 `CraftPanelRuntimeService.tickTechniqueActivity(player, kind, deps)` 后 flush；`world-runtime-craft-smoke` 通过，证明这三类 tick 编排直接走统一入口。采集、建造仍保留专用 tick，Phase 6 尚未完成。
- 2026-05-27：`pnpm audit:protocol` 通过，覆盖 shared build、server compile、稳定协议静态面和运行时协议审计。
- 2026-05-27：`pnpm verify:quick` 通过，覆盖 server compile、生产边界、release gate contract 和无库 quick smoke；不证明 DB 持久化恢复、shadow、acceptance 或 full。
- 2026-05-27：采集/建造 start/cancel 命令入口改为先走 `CraftPanelRuntimeService.startTechniqueActivity/cancelTechniqueActivity`，`GatherStrategy` / `BuildingStrategy` 再委托真实 runtime 服务；`TechniqueActivityQueueService` 的 sleeping 恢复使用队列 payload 进行条件检查并通过 pipeline start 恢复。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`technique-activity-task-view-smoke.js`、`technique-activity-cancel-ref-smoke.js`、`world-runtime-alchemy-smoke.js`、`world-runtime-enhancement-smoke.js`、`enhancement-panel-payload-smoke.js`、`pnpm verify:quick` 通过，证明采集/建造 sleeping 项不再用假 job 恢复，且现阶段仍避免双 tick；强化 payload smoke 的 legacy itemInstanceId WARN 来自夹具水合，`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。
- 2026-05-27：`WorldRuntimeCraftTickService` 消费条件型技艺 tick 返回的 `sleepPayload` 并写入统一队列；采集 tick 离开范围时释放容器 `activeSearch` 并休眠，建造 tick 发现 `activeBuilderPlayerId` 被其他玩家占用时休眠。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`pnpm verify:quick` 通过，覆盖采集/建造 tick 条件失败进入统一 sleeping 队列；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。
- 2026-05-27：阵法维护 start/cancel 命令入口改为先走 `CraftPanelRuntimeService.startTechniqueActivity/cancelTechniqueActivity`；pipeline 条件失败的 `sleepPayload` 会被 `WorldRuntimeCraftTickService` 写入统一队列。阵法维护离开控制点不再作为永久取消，而是 sleeping 等待恢复；持续维护注入灵力通过 `formation` job 表达。`refillFormation` 当前更像一次性资源补给，后续必须通过命名和入口审计确认它不会承载持续技艺进度、经验或打断等待。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`node packages/server/dist/tools/world-runtime-formation-smoke.js`、`technique-activity-task-view-smoke.js`、`technique-activity-cancel-ref-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。
- 2026-05-27：挖矿新增 `PlayerMiningJob` 和 `MiningStrategy`，矿镐 `mining:start` context action 入 `startMining` pending command 后由 pipeline 启动；tick 复用地块伤害、阵法减伤、掉落、挖矿经验和宗门扩张副作用，打断等待只更新 `interruptWaitRemainingTicks` / `interruptState`，不改 `workRemainingTicks`。统一任务视图已投影 `miningJob` 并提供取消引用；active job 快照/回读识别 `mining`，同时补齐 `gather/building/mining` 的 active job 快照识别，避免条件型 job 重启丢失。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/world-runtime-mining-job-smoke.js`、`pnpm verify:client`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。
- 2026-05-27：`WorldRuntimeCraftTickService.advanceCraftJobs` 移除采集/建造专用 tick 分支，所有 active kind 统一调用 `CraftPanelRuntimeService.tickTechniqueActivity(player, kind, deps)` 并等待异步结果；`GatherStrategy.executeTick` 委托 `WorldRuntimeLootContainerService.tickGather`，`BuildingStrategy.executeTick` 委托 `tickBuildingConstruction`。采集/建造中断改为先写统一 sleeping 队列，再统一调用 `interruptTechniqueActivity`，由 strategy 委托真实释放路径。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`technique-activity-task-view-smoke.js`、`technique-activity-cancel-ref-smoke.js`、`world-runtime-mining-job-smoke.js` 通过，证明采集/建造不再由 tick service 双路径推进；采集完成时的 durable inventory grant 仍在旧 `tickGather` 内，Phase 6 的“tick 内无 DB IO”仍未完成。
- 2026-05-27：`techniqueActivityQueue` 纳入玩家完整快照 progression、`hydrateFromSnapshot`、`cloneRuntimePlayerState` 和 `buildRuntimePlayerPersistenceSnapshot`，partial snapshot 中随 `active_job` 域保存；统一任务列表取消队列项时会标记 `active_job` 脏域并 bump `persistentRevision`。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/technique-activity-persistence-snapshot-smoke.js`、`technique-activity-task-view-smoke.js`、`technique-activity-cancel-ref-smoke.js` 通过，证明队列快照深拷贝、重启水合、运行态 clone 和取消落盘触发链路有效。`player_active_job` 单表 payload 统一、锁定物恢复联动和 DB proof 仍未完成，Phase 7 不能标记整体完成。
- 2026-05-27：`TechniqueActivityQueueService.tickQueue` 的 sleeping 项在 `retryAfterTicks` 到期前只递减计数，不调用 strategy 条件检查；到期后如果条件永久失效，会移除队列项、标记 `active_job` 脏域、bump `persistentRevision` 并返回 `panelChanged=true`，避免只在内存里静默删除。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`technique-activity-persistence-snapshot-smoke.js`、`technique-activity-task-view-smoke.js` 通过。该 proof 覆盖队列热检查和永久失效项移除，不等同于全部采集/建造/阵法外部占用恢复验收完成。
- 2026-05-27：阵法入口语义收敛：地图动作中 `formation:maintain` 仍是持续维护 job，走 pending command、`FormationStrategy`、`formationJob`、每息注入玩家灵力并获得阵法技艺经验；`formation:refill` / `C2S.RefillFormation` 作为一次性“资源补给”动作，立即扣灵石/灵力并写阵法资源池，不创建 `formationJob`、不写 `techniqueActivityQueue`、不增加阵法技艺经验。上下文动作文案从“补充”改为“资源补给”，避免和持续维护 job 混淆。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-formation-smoke.js`、`world-runtime-craft-smoke.js`、`technique-activity-task-view-smoke.js` 通过。
- 2026-05-27：`player-domain-persistence-smoke` 增加 active job 双向兼容 proof：`alchemy` / `forging` / `enhancement` / `gather` / `mining` / `building` / `formation` 的旧 `progression.<kind>Job` 快照会投影写入 `player_active_job(job_type, detail_jsonb)`；直接写入 `player_active_job` 后也能通过 `loadProjectedSnapshot` 回读到对应 `progression.<kind>Job`。断言覆盖 `jobRunId`、`jobType`、`jobVersion`、`remainingTicks`、`interruptWaitRemainingTicks` 和 detail payload 保留，且不会泄漏到其他 job slot；该 smoke 使用独立玩家 id 并在 finally 中自动清理。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/player-domain-persistence-smoke.js` 通过。该 proof 证明 active job DB payload 按统一 kind 写入和恢复，但不等同于强化锁定物、队列和 active job 在崩溃时一起恢复或清理。
- 2026-05-27：`world-runtime-craft-smoke` 补齐条件型 sleeping 恢复覆盖：采集、建造、阵法维护、挖矿的 sleeping 队列项都会用原 payload 经 `TechniqueActivityQueueService.tickQueue` 和 `TechniqueActivityPipelineService.start` 恢复；其中阵法委托 `FormationStrategy.executeStart -> worldRuntimeFormationService.startFormationMaintenance`，挖矿恢复会重新校验玩家位置、矿脉地块和耐久并创建 `miningJob`。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js` 通过。该 proof 覆盖“条件暂时不满足时休眠，恢复后能继续”，不覆盖永久失效时所有外部占用释放。
- 2026-05-27：旧制造 job 内 `queuedJobs` 的水合迁移补齐：`PlayerRuntimeService.hydrateFromSnapshot` 会把 `alchemyJob` / `forgingJob` / `enhancementJob.queuedJobs` 合并进 `techniqueActivityQueue`，清除旧字段，标记 `active_job` 脏域并 bump `persistentRevision`，保证下一次快照只保存统一队列。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/player-runtime-persistence-roundtrip-smoke.js` 通过。查询侧仍保留旧字段只读 fallback，供尚未水合的旧形态兼容。
- 2026-05-27：队列资源扣除时机 proof 补齐：炼丹/炼器已有 running job 时追加 `queueMode=append` 只写 `techniqueActivityQueue`，不消耗材料或灵石；强化已有其他技艺活动时入队不锁定装备、不扣灵石，目标装备仍留在背包。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-alchemy-smoke.js`、`node packages/server/dist/tools/world-runtime-enhancement-smoke.js` 通过。
- 2026-05-27：采集 `activeSearch` 增加运行时 owner 防重入；同一草药目标已有玩家采集时，其他玩家 start 会拒绝，已有错误 job tick 会进入 sleeping 且不覆盖原 owner。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`node packages/server/dist/tools/world-runtime-loot-container-smoke.js` 通过。该 proof 覆盖 activeSearch 竞争，不覆盖 activeBuilder 多玩家竞争。
- 2026-05-27：建造 `activeBuilderPlayerId` 在 `MapInstanceRuntime.startBuildingConstruction` 权威层增加竞争拒绝；其他玩家重入返回 `building_active_builder_mismatch`，不会覆盖原 activeBuilder、不会写 buildCompleteTick、不会推进 world revision 或 building dirty domain。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js` 通过。
- 2026-05-27：采集目标永久消失时，`tickGather` 先调用 `releaseGatherActiveSearch`，即使容器模板已不存在也会按 sourceId 清理旧 `container_state.activeSearch` 并标记容器持久化脏。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`node packages/server/dist/tools/world-runtime-loot-container-smoke.js` 通过。该 proof 覆盖采集外部占用永久失效释放，不等同于所有条件型外部占用的完整验收。
- 2026-05-27：新增 `S2C.TechniqueActivityTasks` 统一任务列表同步事件；打开炼丹/炼器/强化面板时服务端随专用面板 payload 下发完整任务视图，技艺 mutation/tick 后也推送完整任务视图。客户端工坊顶部任务列表优先消费统一 task view，覆盖炼丹、炼器、强化、采集、建造、挖矿、阵法维护，保留每项 `cancelRef` 直接发 `C2S.CancelTechniqueActivity`，并继续把实际工作进度和打断等待显示为两条。`pnpm build:shared`、`pnpm --filter @mud/client exec tsc --noEmit --pretty false`、`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`pnpm audit:protocol`、`pnpm verify:client`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。该 proof 不等同于 Playwright 视觉检查或手机/浅色/深色截图验收。
- 2026-05-27：`TechniqueActivityResolveResult` / `TechniqueActivityRefundResult` 扩展出 `inventoryDelta`、`walletDelta`、`equipmentDelta`、`recordDelta`、`panelDirty` 和结构化 notice 字段；新增 `TechniqueActivityStartResult`、`TechniqueActivityTickResult`、`TechniqueActivityCancelResult` 作为后续拆旧 service 的目标契约。`WorldRuntimeCraftMutationService.flushCraftMutation` 会把技艺 result 中的结构化 notice 透传给 `queuePlayerNotice`，且 durable active_job 路径启用时不再触发非 CAS 后备快照写入，避免 active job 版本双写。`pnpm build:shared`、`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-craft-mutation-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。该 proof 证明 result 契约和 flush 边界已具备，但不等同于炼丹/强化真实规则已经迁出旧 service。
- 2026-05-27：客户端 `sendStartAlchemy` / `sendStartForging` / `sendStartEnhancement` / cancel 语义入口继续保留，但 request/start/cancel 内部统一通过 `TECHNIQUE_ACTIVITY_METADATA` 映射事件；炼器取消不再在 `socket-send-panel.ts` 单独直发 `C2S.CancelAlchemy`，由 `emitTechniqueActivityCancel('forging')` 生成 `{ kind: 'forging' }` payload。`pnpm --filter @mud/client exec tsc --noEmit --pretty false`、`pnpm verify:client` 通过。
- 2026-05-27：炼丹/炼器 start 生命周期从 `CraftPanelRuntimeService.startAlchemy` 整段委托拆为 `validateAlchemyLikeStart`、`queueAlchemyLikeStart`、`consumeAlchemyLikeStartResources`、`createAlchemyLikeStartJob`；`AlchemyStrategy` / `ForgingStrategy` 移除 `executeStart`，由 `TechniqueActivityPipelineService.start` 依次调用 strategy 的校验、排队、消耗和创建 job。排队仍在资源检查前发生，保持 queued job 不提前扣材料/灵石；tick/cancel 暂时仍委托旧 service。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-alchemy-smoke.js`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/technique-activity-cancel-ref-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。
- 2026-05-27：炼丹/炼器 tick 生命周期从 `CraftPanelRuntimeService.tickAlchemy` 整段实现拆入 `packages/server/src/runtime/craft/pipeline/strategies/alchemy-like-tick.helpers.ts`，`AlchemyStrategy` / `ForgingStrategy` 的 `executeTick` 直接推进暂停恢复、实际工作量、批次成功/失败、产出入包/掉地、经验和队列下一项；旧 `tickAlchemy` 只保留兼容 wrapper，回调 `TechniqueActivityPipelineService.tick`。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-alchemy-smoke.js`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。该 proof 不等同于经验/产出已经完全改成统一 `TechniqueActivityResolveResult` 流出。
- 2026-05-27：炼丹/炼器批次结算新增 `buildAlchemyLikeBatchResolveResult` / `buildAlchemyLikeExpParams`，每批会生成统一 `TechniqueActivityResolveResult` 形态，包含 `inventoryDelta.granted/dropped/changed`、`panelDirty`、`expParams`、`messages` 和 `craftRealmExpGain`；公共 `materializeTechniqueActivityResolveResult` 负责把该 result 转成现有 `CraftTickResult`，保持面板和资产行为不变。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-alchemy-smoke.js`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。经验应用、入包副作用和结构化 notice 全替换仍未完全迁入公共 result 流程。
- 2026-05-27：`materializeTechniqueActivityResolveResult` 上移到 `TechniqueActivityPipelineService` 模块，统一从 `TechniqueActivityResolveResult.inventoryDelta/panelDirty/messages/craftRealmExpGain` 生成 `CraftTickResult`；`alchemy-like-tick.helpers.ts` 不再自行拼旧 tick 返回结构，只传入下一队列项启动产生的额外 dirty/drop/attr 结果。`pnpm --filter @mud/server compile`、`world-runtime-alchemy-smoke`、`technique-activity-task-view-smoke`、`world-runtime-craft-smoke`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。
- 2026-05-27：炼丹/炼器批次经验应用迁入公共 `applyTechniqueActivityResolveExperience`，由 `TechniqueActivityResolveResult.expParams` 统一计算经验并写入对应 `profession` 技能；旧 `applyAlchemyLikeBatchSkillExp` / `resolveAlchemySkillExpGain` 移除，境界经验由公共经验结果派生。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-alchemy-smoke.js`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`node packages/server/dist/tools/technique-activity-cancel-ref-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。产出入包副作用和结构化 notice 全替换仍未完全迁入公共 result 流程。
- 2026-05-27：炼丹/炼器批次产出不再先由 `CraftPanelRuntimeService.grantAlchemyLikeBatchOutput` 直接改背包；strategy 只在 `TechniqueActivityResolveResult.inventoryDelta.granted` 声明本批次产出，公共 `applyTechniqueActivityResolveInventory` 统一执行 normalize、入包、背包满掉地和 result delta 回写。`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/world-runtime-alchemy-smoke.js`、`node packages/server/dist/tools/technique-activity-task-view-smoke.js`、`node packages/server/dist/tools/world-runtime-craft-smoke.js`、`node packages/server/dist/tools/technique-activity-cancel-ref-smoke.js`、`pnpm verify:quick` 通过；`verify:quick` 中 session reaper 的 `simulated_flush_failure` 是用例内故障注入且最终通过。结构化 notice 全替换仍未完成。

## 验证矩阵

| 场景 | 证明内容 | 最小验证 |
|------|----------|----------|
| 炼丹/炼器直接 job | 无开炉/准备阶段；打断等待不改变实际进度 | `alchemy-pipeline-smoke`、`forging-pipeline-smoke` |
| 强化资产链 | 锁定物、保护物、灵石、强化记录一致；显示成功率等于结算成功率 | `enhancement-pipeline-smoke`、`enhancement-panel-payload-smoke` |
| 统一队列 | 当前 job 完成后启动队列；任务列表可取消 running/queued/sleeping | `technique-activity-queue-smoke` |
| 打断等待 | 攻击/修炼触发等待条；`workRemainingTicks` 不变；等待结束后继续 | `technique-interrupt-wait-separate-progress-smoke` |
| 采集/建造/阵法条件型 | 条件失效释放外部占用；可休眠/取消/恢复；面板可见 | `conditional-technique-activity-smoke` |
| 挖矿 job | 挖矿动作可见；经验/掉落不与攻击地块重复；面板可取消 | `world-runtime-mining-job-smoke`、`technique-activity-task-view-smoke` |
| 持久化恢复 | active job、interrupt wait、queue、locked item、profession 可恢复 | `active-job-persistence-recovery-smoke` + `pnpm verify:release:with-db` |
| 协议包体 | 高频 task patch 只发变化字段，不带 catalog/detail | `pnpm audit:protocol` + 包体专项 smoke |
| 客户端连续性 | 高频 patch 不丢焦点、滚动、当前选择；浅色/深色/手机可用 | `pnpm verify:client` + Playwright/手工截图 |

## 实施顺序约束

必须按依赖顺序推进，不能先做 UI 大改再补服务端真源：

1. 先完成 Phase 0 审计，尤其是挖矿与阵法补充灵力边界。
2. 再完成 shared 类型和 task view，保证后续服务端/客户端都对同一契约开发。
3. 先迁队列和取消语义，再迁具体技艺，避免每个 strategy 重复实现队列。
4. 配方型技艺先迁，因为资产链比强化简单，可验证 pipeline 基本骨架。
5. 强化单独迁移并强验证资产一致性。
6. 条件型技艺最后迁移，因为它们牵涉地图实例、容器、建筑、阵法外部占用。
7. tick 编排和旧 service 删除必须等所有 kind 都能通过 pipeline 后进行。
8. 客户端统一技艺任务列表可以跟 task view 同步增量落地，但不能假装客户端可见就代表服务端已统一。

## 完成定义

- [ ] 所有 runtime kind 的 start/cancel/interrupt/tick 都通过 pipeline。
- [ ] 所有技艺具体动作都以 job 形式存在，挖矿、阵法持续补充灵力、建造、采集不再是面板外的隐式动作。
- [ ] “以 job 形式存在”必须覆盖服务端生命周期真源，不只是客户端任务列表投影。
- [ ] 所有可取消的 running、interrupt_wait、queued、sleeping 技艺任务都能从统一技艺任务列表直接取消，不要求进入对应子面板。
- [ ] 手动开始修炼、攻击、移动等打断来源只刷新独立等待状态，不改变任何 job 的实际总工作量或剩余工作量。
- [ ] 旧 service 不再承载技艺玩法规则。
- [ ] 只剩一种活动队列。
- [x] active job 持久化和恢复按统一 job kind 工作。
- [ ] 技艺经验、产出、掉地、通知、面板 patch 都从统一 result 流出。
- [x] 技艺面板能看到所有当前 job、打断等待、队列项，并能直接取消当前 job 或队列项。
- [x] 打断等待是独立条，不修改实际 job 进度条、总工作量或剩余工作量。
- [x] 炼丹、炼器没有玩家可见的开炉/准备阶段。
- [ ] 现有炼丹、炼器、强化、采集、建造、挖矿、阵法维护行为不回退。
- [ ] 验证覆盖启动、取消、打断、完成、失败、队列、重启恢复、资产一致性。
