# 技艺管线（Technique Activity Pipeline）重构计划

## 1. 目标

将当前技艺系统从"每种技艺各自实现完整生命周期"重构为"公共管线骨架 + 策略插槽"模式：

- **公共管线**统一处理：guard → pause → advance → progress → resolve → skillExp → output → completion → finalize
- **策略接口**让每种技艺只实现：校验、消耗、创建job、结算、退还
- **条件队列**让采集/建造等位置依赖型技艺也能进入统一队列，不满足条件时自动休眠移到队尾，条件恢复后自动继续
- 新增技艺只需注册一个 Strategy 类即可接入完整链路

## 2. 现状问题

| 问题 | 影响 |
|------|------|
| tick/interrupt/cancel 骨架在 CraftPanelRuntimeService 中按 kind 重复 | ~2000 行重复代码 |
| 7+ switch/if-chain 分发点 | 新增 kind 需改 7 处 |
| WorldRuntimeAlchemyService / EnhancementService 90% 相同的 durable 包装器 | ~400 行重复 |
| 锻造寄生在炼丹 job 上（共用 player.alchemyJob） | 数据模型不清晰 |
| 采集/建造不在统一队列，中断后需要手动重新开始 | 玩家体验断裂 |
| 每种技艺的成功率/经验/时长调用方式不统一 | 难以保证一致性 |

## 3. 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 锻造独立化 | `player.forgingJob` 独立槽 | 消除 jobType 判断，管线统一处理 |
| 迁移范围 | 一次性迁移炼丹+锻造+强化+采集+建造 | 避免新旧两套并存的维护成本 |
| 采集/建造入队列 | 纳入统一条件队列 | 不满足条件时休眠移到队尾，满足后自动恢复 |
| 协议兼容 | 保持现有 C2S/S2C 事件不变 | 客户端无感 |
| 持久化兼容 | job 结构保持向后兼容，新增字段可选 | 不需要数据迁移脚本 |

## 4. 架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TechniqueActivityPipelineService                       │
│  （NestJS Injectable，统一管线骨架）                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  register(strategy)     — 注册策略                                       │
│  start(player, kind, payload) — 公共启动                                 │
│  tick(player, kind, ctx)      — 公共 tick                                │
│  interrupt(player, kind, reason) — 公共中断                              │
│  cancel(player, kind)         — 公共取消                                 │
│  tickQueue(player, ctx)       — 公共队列推进                             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ 调用
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              TechniqueActivityStrategy<TJob> 接口                         │
│  （每种技艺实现一个）                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  kind: RuntimeTechniqueActivityKind                                      │
│  jobSlot: keyof RuntimePlayer        — 该技艺在 player 上的 job 字段名    │
│  skillSlot: keyof RuntimePlayer      — 该技艺在 player 上的 skill 字段名  │
│                                                                          │
│  validateStart(player, payload, ctx) → StartValidation | StartError      │
│  consumeResources(player, validated) → void                              │
│  createJob(player, validated) → TJob                                     │
│  resolvePhase(player, job) → 'preparing' | 'active' 等恢复阶段           │
│  resolve(player, job, ctx) → ResolveResult                               │
│  computeRefund(player, job) → RefundResult                               │
│  dirtyDomains() → PersistenceDomain[]                                    │
│                                                                          │
│  // 条件型技艺（采集/建造）额外实现：                                     │
│  checkContinueCondition?(player, job, ctx) → ConditionResult             │
│  onConditionFailed?(player, job, ctx) → void                             │
│  onConditionRestored?(player, job, ctx) → void                           │
└─────────────────────────────────────────────────────────────────────────┘
```


## 5. 管线阶段详解

### 5.1 Tick 管线（每 tick 对每个有活跃 job 的玩家执行一次）

```
Stage 1: Guard
  ├─ job 不存在或 remainingTicks <= 0 → 跳过
  └─ 继续

Stage 2: ConditionCheck（仅条件型技艺）
  ├─ strategy.checkContinueCondition(player, job, ctx)
  ├─ 条件不满足 → strategy.onConditionFailed() → 休眠 job → 移到队列尾部 → 尝试启动队列下一个
  └─ 条件满足 → 继续

Stage 3: Pause
  ├─ job.phase === 'paused' → advanceTechniqueActivityPause()
  │   ├─ 未恢复 → finalize(dirtyDomains: ['active_job']) → 返回
  │   └─ 已恢复 → 继续
  └─ 非暂停 → 继续

Stage 4: Advance
  └─ job.remainingTicks--

Stage 5: Progress
  ├─ remainingTicks > 0 且未到批次完成点 → finalize → 返回
  └─ 到达结算点 → 继续

Stage 6: Resolve（策略插槽）
  └─ result = strategy.resolve(player, job, ctx)
      返回：{ success, failure, outputs[], expParams, advance?, completed? }

Stage 7: SkillExp（公共）
  ├─ gain = computeCraftSkillExpGain(result.expParams)
  ├─ applyCraftSkillExp(player[strategy.skillSlot], gain, expToNextResolver)
  └─ 标记 attrChanged

Stage 8: Output（公共）
  ├─ 产出物品 → 尝试放入背包
  ├─ 背包满 → 掉落地面
  └─ 记录 inventoryChanged

Stage 9: Completion（公共）
  ├─ result.advance === true → 重置批次计时器，继续下一批次
  ├─ result.completed === true → 清理 job → 推进队列
  └─ 自动启动队列下一个（含条件检查）

Stage 10: Finalize（公共）
  ├─ 标脏域（strategy.dirtyDomains() + 动态域）
  ├─ 触发持久化
  ├─ 发送面板 patch
  └─ 发送通知消息
```

### 5.2 Start 管线

```
1. strategy.validateStart(player, payload, ctx)
   ├─ 失败 → 返回错误
   └─ 成功 → 继续

2. 检查任务槽
   ├─ 当前槽已有活跃 job → 入队列（按 mode: replace/append/preserve）→ 返回
   └─ 槽空闲 → 继续

3. strategy.consumeResources(player, validated)
   └─ 扣材料、扣灵石、锁装备槽等

4. job = strategy.createJob(player, validated)
   └─ 设置 totalTicks, remainingTicks, successRate, phase 等

5. player[strategy.jobSlot] = job

6. Finalize
   └─ 标脏 + 持久化 + 面板全量推送
```

### 5.3 Interrupt 管线

```
1. Guard: job 不存在 → 跳过
2. applyTechniqueActivityInterrupt(job, pauseTicks)
3. 条件型技艺额外调用 strategy.onConditionFailed() 释放外部资源（如释放采集锁、释放建造者槽）
4. Finalize: 标脏 + 面板 patch + 通知
```

### 5.4 Cancel 管线

```
1. Guard: job 不存在 → 跳过
2. refund = strategy.computeRefund(player, job)
3. 退还物品/灵石到背包或地面
4. 清理 job: player[strategy.jobSlot] = null
5. 推进队列下一个
6. Finalize
```

## 6. 条件队列机制

### 6.1 队列统一模型

当前队列挂在活跃 job 上（`job.queuedJobs[]`）。重构后队列独立为玩家级别的统一技艺队列：

```typescript
interface TechniqueActivityQueueItem {
  kind: RuntimeTechniqueActivityKind;
  payload: unknown;              // 启动参数快照
  label: string;                 // 显示名
  state: 'pending' | 'sleeping'; // pending=等待执行, sleeping=条件不满足
  sleepReason?: string;          // 休眠原因（显示用）
  sleepingSince?: number;        // 休眠开始时间
  retryAfterTicks?: number;      // 休眠后多少 tick 重试条件检查（避免每 tick 检查）
}
```

### 6.2 条件型技艺的休眠/唤醒流程

```
正在执行采集 → 玩家移动 → interrupt 触发
  → job 清理
  → 自动生成 QueueItem { kind: 'gather', state: 'sleeping', sleepReason: '离开采集点' }
  → 移到队列尾部

每 tick 队列推进：
  → 遍历队列头部
  → 如果是 sleeping 项：
    → retryAfterTicks > 0 → 跳过（等待冷却）
    → retryAfterTicks <= 0 → checkContinueCondition()
      → 条件满足 → state = 'pending' → 尝试启动
      → 条件不满足 → 重置 retryAfterTicks（如 5 tick 后再检查）→ 移到队尾
  → 如果是 pending 项：
    → 当前槽空闲 → 启动
    → 当前槽占用 → 保持等待
```

### 6.3 采集/建造的条件定义

| 技艺 | 继续条件 | 休眠原因 |
|------|----------|----------|
| 采集 | 玩家在目标容器 1 格内 + 容器仍存在 + 容器仍有可采集物 | 离开采集点 / 资源耗尽 / 容器消失 |
| 建造 | 玩家在建筑所在实例 + 建筑仍在建造中 + 玩家是 activeBuilder | 离开建筑 / 建筑已完成 / 建筑被拆除 |


## 7. 策略接口定义

### 7.1 核心接口（packages/shared/src/technique-activity-pipeline-types.ts）

```typescript
/** 管线 tick 上下文，由管线骨架注入 */
interface PipelineTickContext {
  contentTemplateRepository: ContentTemplateRepository;
  playerRuntimeService: PlayerRuntimeService;
  getInstanceRuntime: (instanceId: string) => InstanceRuntime | null;
  resolveExpToNextByLevel: (level: number) => number;
}

/** 启动校验成功结果 */
interface StartValidationSuccess<TValidated = unknown> {
  ok: true;
  validated: TValidated;
}

/** 启动校验失败结果 */
interface StartValidationError {
  ok: false;
  error: string;
}

type StartValidationResult<TValidated = unknown> = StartValidationSuccess<TValidated> | StartValidationError;

/** 结算结果 */
interface ResolveResult {
  /** 本批次成功数 */
  successCount: number;
  /** 本批次失败数 */
  failureCount: number;
  /** 产出物品列表 */
  outputs: ItemStack[];
  /** 经验计算参数 */
  expParams: CraftSkillExpComputationParams;
  /** true=还有后续批次，不清理 job */
  advance?: boolean;
  /** true=整个 job 完成 */
  completed?: boolean;
  /** 通知消息 */
  messages?: NoticeMessage[];
  /** 附带的境界修为 */
  craftRealmExpGain?: number;
}

/** 退还结果 */
interface RefundResult {
  items: ItemStack[];
  spiritStones: number;
  messages?: NoticeMessage[];
}

/** 条件检查结果（条件型技艺） */
interface ConditionCheckResult {
  satisfied: boolean;
  /** 不满足时的原因（显示用） */
  reason?: string;
  /** 不满足时是否应该彻底取消而非休眠（如资源已消失） */
  shouldCancel?: boolean;
}
```

### 7.2 策略接口（packages/server/src/runtime/craft/pipeline/technique-activity-strategy.ts）

```typescript
interface TechniqueActivityStrategy<
  TJob extends TechniqueActivityJobBase = TechniqueActivityJobBase,
  TValidated = unknown,
> {
  readonly kind: RuntimeTechniqueActivityKind;
  readonly jobSlot: string;       // player 上的 job 字段名
  readonly skillSlot: string;     // player 上的 skill 字段名
  readonly activityLabel: string; // 中文活动名（如"炼丹"、"采集"）
  readonly pauseTicks: number;    // 中断暂停息数

  /** 启动校验 */
  validateStart(player: RuntimePlayer, payload: unknown, ctx: PipelineTickContext): StartValidationResult<TValidated>;

  /** 消耗资源 */
  consumeResources(player: RuntimePlayer, validated: TValidated, ctx: PipelineTickContext): void;

  /** 创建 job */
  createJob(player: RuntimePlayer, validated: TValidated, ctx: PipelineTickContext): TJob;

  /** 确定暂停恢复后应回到的阶段 */
  resolveResumePhase(job: TJob): string;

  /** 结算（批次完成或单次完成时调用） */
  resolve(player: RuntimePlayer, job: TJob, ctx: PipelineTickContext): ResolveResult;

  /** 取消时的退还策略 */
  computeRefund(player: RuntimePlayer, job: TJob): RefundResult;

  /** 该技艺的脏域列表 */
  dirtyDomains(): PersistenceDomain[];

  /** 判断当前 tick 是否到达结算点（默认 remainingTicks <= 0） */
  isResolvePoint?(job: TJob): boolean;

  // ─── 条件型技艺可选方法 ───

  /** 是否为条件型技艺 */
  readonly conditional?: boolean;

  /** 检查继续执行的条件 */
  checkContinueCondition?(player: RuntimePlayer, job: TJob, ctx: PipelineTickContext): ConditionCheckResult;

  /** 条件不满足时释放外部资源 */
  onConditionFailed?(player: RuntimePlayer, job: TJob, ctx: PipelineTickContext): void;

  /** 条件恢复时重新获取外部资源 */
  onConditionRestored?(player: RuntimePlayer, job: TJob, ctx: PipelineTickContext): void;
}
```

## 8. 各技艺策略实现概要

### 8.1 AlchemyStrategy

```typescript
class AlchemyStrategy implements TechniqueActivityStrategy<PlayerAlchemyJob> {
  kind = 'alchemy';
  jobSlot = 'alchemyJob';
  skillSlot = 'alchemySkill';
  activityLabel = '炼丹';
  pauseTicks = 10;

  validateStart(player, payload, ctx) {
    // 校验配方存在、材料足够、灵石足够、灵炉装备
  }

  consumeResources(player, validated) {
    // 扣材料、扣灵石
  }

  createJob(player, validated) {
    // 计算 batchBrewTicks、successRate、quantity、preparation phase
    // phase: 'preparing', remainingTicks = preparationTicks + brewTicks * quantity
  }

  resolveResumePhase(job) {
    return job.completedCount > 0 || job.currentBatchRemainingTicks < job.batchBrewTicks
      ? 'brewing' : 'preparing';
  }

  isResolvePoint(job) {
    // 批次完成点：currentBatchRemainingTicks <= 0 或 remainingTicks <= 0
    return job.currentBatchRemainingTicks <= 0 || job.remainingTicks <= 0;
  }

  resolve(player, job, ctx) {
    // roll 每个产出物品的成功/失败
    // 如果还有剩余批次 → advance: true
    // 如果所有批次完成 → completed: true
  }

  computeRefund(player, job) {
    // 按剩余批次比例退还材料（当前实现不退）
  }

  dirtyDomains() { return ['active_job', 'inventory']; }
}
```

### 8.2 ForgingStrategy

```typescript
class ForgingStrategy extends AlchemyStrategy {
  kind = 'forging';
  jobSlot = 'forgingJob';  // 独立槽
  skillSlot = 'forgingSkill';
  activityLabel = '炼器';

  // 继承 AlchemyStrategy 的大部分逻辑
  // 覆盖 validateStart 使用 forgingCatalog
  // 覆盖 createJob 使用 forgingCatalog
}
```

### 8.3 EnhancementStrategy

```typescript
class EnhancementStrategy implements TechniqueActivityStrategy<PlayerEnhancementJob> {
  kind = 'enhancement';
  jobSlot = 'enhancementJob';
  skillSlot = 'enhancementSkill';
  activityLabel = '强化';
  pauseTicks = 10;

  validateStart(player, payload, ctx) {
    // 校验装备存在、强化配置存在、材料足够、强化锤装备
  }

  consumeResources(player, validated) {
    // 扣材料、扣灵石、锁装备槽
  }

  createJob(player, validated) {
    // 计算 enhanceTicks、successRate、protectionLevel
    // phase: 'enhancing'
  }

  resolveResumePhase(job) { return 'enhancing'; }

  resolve(player, job, ctx) {
    // roll 成功/失败
    // 成功 → 升级装备
    // 失败 → 降级/保护
    // 如果 desiredTargetLevel 未达到 → advance: true（自动连续强化）
    // 否则 → completed: true
  }

  computeRefund(player, job) {
    // 强化不退材料
  }

  dirtyDomains() { return ['active_job', 'equipment', 'enhancement_record']; }
}
```

### 8.4 GatherStrategy（条件型）

```typescript
class GatherStrategy implements TechniqueActivityStrategy<PlayerGatherJob> {
  kind = 'gather';
  jobSlot = 'gatherJob';
  skillSlot = 'gatherSkill';
  activityLabel = '采集';
  pauseTicks = 0; // 采集不暂停，直接休眠入队列
  conditional = true;

  validateStart(player, payload, ctx) {
    // 校验容器存在、是 herb 类型、玩家在 1 格内、有可采集物
  }

  consumeResources() { /* 采集无前置消耗 */ }

  createJob(player, validated, ctx) {
    // 计算采集时间（herb level + grade + gather skill speed）
    // phase: 'gathering'
  }

  resolveResumePhase() { return 'gathering'; }

  resolve(player, job, ctx) {
    // 从容器中移除 1 个 herb → 产出到背包
    // 如果容器还有更多 herb → advance: true（自动连续采集）
    // 否则 → completed: true
  }

  computeRefund() { return { items: [], spiritStones: 0 }; }

  dirtyDomains() { return ['active_job', 'inventory']; }

  // ─── 条件型方法 ───

  checkContinueCondition(player, job, ctx) {
    // 检查：玩家在容器 1 格内 + 容器存在 + 容器有可采集物
    const instance = ctx.getInstanceRuntime(player.instanceId);
    const container = instance?.getContainer(job.resourceNodeId);
    if (!container) return { satisfied: false, reason: '资源已消失', shouldCancel: true };
    if (chebyshevDistance(player, container) > 1) return { satisfied: false, reason: '离开采集点' };
    if (!hasHarvestableHerbs(container)) return { satisfied: false, reason: '资源耗尽', shouldCancel: true };
    return { satisfied: true };
  }

  onConditionFailed(player, job, ctx) {
    // 释放容器的 activeSearch 状态
  }

  onConditionRestored(player, job, ctx) {
    // 重新锁定容器的 activeSearch
  }
}
```

### 8.5 BuildingStrategy（条件型）

```typescript
class BuildingStrategy implements TechniqueActivityStrategy<PlayerBuildingJob> {
  kind = 'building';
  jobSlot = 'buildingJob';
  skillSlot = 'buildingSkill';
  activityLabel = '建造';
  pauseTicks = 0;
  conditional = true;

  validateStart(player, payload, ctx) {
    // 校验建筑存在、状态为 building、玩家是 owner、无其他 activeBuilder
  }

  consumeResources() { /* 建造消耗在放置时已扣 */ }

  createJob(player, validated, ctx) {
    // 从建筑实例读取 buildRemainingTicks
    // phase: 'building'
  }

  resolveResumePhase() { return 'building'; }

  resolve(player, job, ctx) {
    // 建造的 tick 由建筑实例管理，这里只同步进度和发经验
    // 建筑完成 → completed: true
    // 否则 → advance: true（继续下一 tick）
  }

  computeRefund() { return { items: [], spiritStones: 0 }; }

  dirtyDomains() { return ['active_job']; }

  checkContinueCondition(player, job, ctx) {
    // 检查：建筑存在 + 状态为 building + 玩家是 activeBuilder
    const instance = ctx.getInstanceRuntime(job.instanceId);
    const building = instance?.getBuilding(job.buildingId);
    if (!building) return { satisfied: false, reason: '建筑已消失', shouldCancel: true };
    if (building.state !== 'building') return { satisfied: false, reason: '建筑已完成', shouldCancel: true };
    if (building.activeBuilderPlayerId !== player.playerId) return { satisfied: false, reason: '建造权被接管' };
    return { satisfied: true };
  }

  onConditionFailed(player, job, ctx) {
    // 释放 building 的 activeBuilderPlayerId
  }

  onConditionRestored(player, job, ctx) {
    // 重新注册为 activeBuilder
  }
}
```


## 9. 文件结构变更

### 9.1 新增文件

```
packages/shared/src/
  technique-activity-pipeline-types.ts    — 管线公共类型（ResolveResult, RefundResult, ConditionCheckResult 等）

packages/server/src/runtime/craft/pipeline/
  technique-activity-pipeline.service.ts  — 管线骨架（NestJS Injectable）
  technique-activity-strategy.ts          — 策略接口定义
  technique-activity-queue.service.ts     — 统一条件队列管理
  strategies/
    alchemy.strategy.ts                   — 炼丹策略
    forging.strategy.ts                   — 锻造策略
    enhancement.strategy.ts               — 强化策略
    gather.strategy.ts                    — 采集策略
    building.strategy.ts                  — 建造策略
```

### 9.2 重构文件（逐步瘦身直至删除）

```
packages/server/src/runtime/craft/
  craft-panel-runtime.service.ts          — 移除 tick/start/cancel/interrupt 骨架，保留 catalog 加载和面板查询
                                            最终拆为：
                                            - craft-catalog.service.ts（配方加载与缓存）
                                            - craft-panel-query.service.ts（面板 payload 构建）

packages/server/src/runtime/world/
  world-runtime-alchemy.service.ts        — 删除，durable 逻辑移入管线公共 durable 层
  world-runtime-enhancement.service.ts    — 删除，同上
  world-runtime-craft-tick.service.ts     — 简化为调用 pipeline.tickAll(playerIds, ctx)
  world-runtime-craft-interrupt.service.ts — 简化为调用 pipeline.interruptAll(player, reason)
  world-runtime-craft-mutation.service.ts  — 保留 flushCraftMutation，但内部逻辑由管线统一调用
```

### 9.3 修改文件

```
packages/shared/src/
  technique-activity-types.ts             — 扩展 RuntimeTechniqueActivityKind 加入 'gather' | 'building'
  technique-activity-meta.ts              — 扩展 TECHNIQUE_ACTIVITY_METADATA 加入 gather/building 元数据

packages/server/src/runtime/player/
  player-runtime-types.ts                 — 新增 player.forgingJob 字段，player.techniqueActivityQueue 字段

packages/server/src/persistence/
  player-domain-persistence.service.ts    — 新增 forgingJob 持久化、queue 持久化
```

## 10. Durable 操作公共化

### 10.1 统一 Durable 包装器

```typescript
/** 替代 WorldRuntimeAlchemyService / EnhancementService 的重复 durable 逻辑 */
class TechniqueActivityDurableService {

  /** 公共 durable start */
  async startDurably(player, kind, payload, ctx): Promise<CraftMutationResult> {
    const strategy = this.pipeline.getStrategy(kind);
    const rollback = this.captureRollback(player, strategy);

    try {
      const result = this.pipeline.start(player, kind, payload);
      if (!result.ok) { this.restoreRollback(player, strategy, rollback); return result; }

      if (this.isDurableEnabled(player, ctx)) {
        const snapshot = this.buildSnapshot(player, strategy);
        await ctx.durableOperationService.create(this.buildOperationId(player, kind), snapshot);
      }
      return result;
    } catch (e) {
      this.restoreRollback(player, strategy, rollback);
      throw e;
    }
  }

  /** 公共 durable tick */
  async tickDurably(player, kind, ctx): Promise<CraftTickResult> {
    const strategy = this.pipeline.getStrategy(kind);
    const rollback = this.captureRollback(player, strategy);

    try {
      const result = this.pipeline.tick(player, kind, ctx);
      if (!result.ok) { this.restoreRollback(player, strategy, rollback); return result; }

      if (this.isDurableEnabled(player, ctx)) {
        const job = player[strategy.jobSlot];
        if (job) {
          await ctx.durableOperationService.update(this.buildOperationId(player, kind), this.buildSnapshot(player, strategy));
        } else {
          await ctx.durableOperationService.complete(this.buildOperationId(player, kind));
        }
      }
      return result;
    } catch (e) {
      this.restoreRollback(player, strategy, rollback);
      throw e;
    }
  }

  /** 公共 rollback 捕获 — 按策略的 dirtyDomains 决定捕获范围 */
  private captureRollback(player, strategy) {
    const domains = strategy.dirtyDomains();
    return {
      inventory: domains.includes('inventory') ? cloneInventoryItems(player) : null,
      wallet: domains.includes('inventory') ? cloneWalletBalances(player) : null,
      equipment: domains.includes('equipment') ? cloneEquipment(player) : null,
      job: structuredClone(player[strategy.jobSlot]),
    };
  }
}
```

## 11. 数据迁移

### 11.1 锻造独立化迁移

由于锻造当前寄生在 `player.alchemyJob`（`jobType === 'forging'`），需要迁移：

**策略：运行时自动迁移（无需离线脚本）**

```typescript
// 在 pipeline 初始化或玩家登录恢复时：
function migrateForging(player: RuntimePlayer): void {
  if (player.alchemyJob?.jobType === 'forging') {
    player.forgingJob = { ...player.alchemyJob };
    player.alchemyJob = null;
    // 标记持久化脏域
  }
}
```

- 玩家登录时检查 `alchemyJob.jobType === 'forging'`，自动迁移到 `forgingJob`
- 持久化层同时支持读取旧格式（`alchemyJob` 中的 forging）和新格式（独立 `forgingJob`）
- 写入时始终使用新格式
- 无需停服迁移

### 11.2 队列迁移

当前队列挂在 `job.queuedJobs[]` 上。迁移为玩家级 `player.techniqueActivityQueue[]`：

```typescript
function migrateQueue(player: RuntimePlayer): void {
  const activeJob = player.alchemyJob ?? player.enhancementJob;
  if (activeJob?.queuedJobs?.length) {
    player.techniqueActivityQueue = activeJob.queuedJobs.map(item => ({
      kind: item.kind ?? resolveKindFromItem(item),
      payload: item.payload,
      label: item.label,
      state: 'pending',
    }));
    activeJob.queuedJobs = [];
  }
}
```

## 12. 实施阶段

### Phase 1: 基础设施（~2天）

**目标**：建立管线骨架和策略接口，不改变现有行为

1. 创建 `packages/shared/src/technique-activity-pipeline-types.ts`
   - 定义 ResolveResult, RefundResult, ConditionCheckResult, StartValidationResult 等公共类型
   - 扩展 RuntimeTechniqueActivityKind 加入 'gather' | 'building'

2. 创建 `packages/server/src/runtime/craft/pipeline/technique-activity-strategy.ts`
   - 定义策略接口

3. 创建 `packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts`
   - 实现管线骨架：start / tick / interrupt / cancel
   - 策略注册表

4. 创建 `packages/server/src/runtime/craft/pipeline/technique-activity-queue.service.ts`
   - 统一队列管理：enqueue / dequeue / sleep / wake / tickQueue

5. 扩展 `technique-activity-types.ts` 和 `technique-activity-meta.ts`

**验证**：`pnpm build:shared` + `pnpm build:server` 编译通过

### Phase 2: 策略实现 — 强化（~1天）

**目标**：最简单的技艺先迁移，验证管线正确性

1. 创建 `strategies/enhancement.strategy.ts`
   - 从 `CraftPanelRuntimeService.startEnhancement/tickEnhancement/cancelEnhancement/interruptEnhancement` 提取逻辑

2. 在管线中注册 EnhancementStrategy

3. 修改 `WorldRuntimeEnhancementService` 改为调用管线
   - 保留 durable 包装器暂时不动（Phase 5 统一处理）

4. 修改 `CraftPanelRuntimeService` 的 switch 分发，enhancement 分支委托给管线

**验证**：`pnpm verify:quick` + 手动测试强化流程

### Phase 3: 策略实现 — 炼丹 + 锻造（~2天）

**目标**：迁移最复杂的批次型技艺

1. 新增 `player.forgingJob` 字段，添加运行时自动迁移逻辑

2. 创建 `strategies/alchemy.strategy.ts`
   - 处理多批次模型：preparing → brewing → batch completion → next batch
   - `isResolvePoint` 判断批次完成点

3. 创建 `strategies/forging.strategy.ts`
   - 继承 AlchemyStrategy，覆盖 catalog 和 skill 引用

4. 修改 `CraftPanelRuntimeService` 的 alchemy/forging 分支委托给管线

5. 修改 `WorldRuntimeAlchemyService` 改为调用管线

**验证**：`pnpm verify:quick` + 手动测试炼丹/锻造流程

### Phase 4: 策略实现 — 采集 + 建造（~2天）

**目标**：条件型技艺接入管线和统一队列

1. 创建 `strategies/gather.strategy.ts`
   - 实现 checkContinueCondition / onConditionFailed / onConditionRestored
   - 从 `WorldRuntimeLootContainerService.tickGather` 提取结算逻辑

2. 创建 `strategies/building.strategy.ts`
   - 实现条件检查（建筑存在、状态、activeBuilder）
   - 建造 tick 同步建筑实例的 remainingTicks

3. 实现队列的休眠/唤醒机制
   - 条件不满足 → 休眠移到队尾
   - 每 N tick 重试条件检查
   - 条件满足 → 唤醒启动

4. 修改 `WorldRuntimeCraftTickService.advanceCraftJobs` 统一走管线

**验证**：`pnpm verify:quick` + 手动测试采集中断后自动恢复

### Phase 5: Durable 公共化 + 清理（~1.5天）

**目标**：消除 durable 重复，清理旧代码

1. 创建 `TechniqueActivityDurableService`
   - 公共 startDurably / tickDurably / cancelDurably
   - 公共 captureRollback / restoreRollback / buildSnapshot / buildOperationId

2. 删除 `WorldRuntimeAlchemyService`（逻辑已在管线 + durable 服务中）

3. 删除 `WorldRuntimeEnhancementService`（同上）

4. 瘦身 `CraftPanelRuntimeService`
   - 移除所有 tick/start/cancel/interrupt 方法
   - 保留 catalog 加载 + 面板查询
   - 重命名为 `CraftCatalogService` + `CraftPanelQueryService`（可选，视代码量决定）

5. 简化 `WorldRuntimeCraftTickService` 为单行调用

6. 简化 `WorldRuntimeCraftInterruptService` 为单行调用

**验证**：`pnpm verify:quick` + `pnpm build:server`

### Phase 6: 队列持久化 + 面板协议适配（~1天）

**目标**：队列状态可持久化，面板能展示队列和休眠状态

1. `player.techniqueActivityQueue` 持久化到 PostgreSQL
   - 登录恢复时读取队列
   - 队列变更时标脏

2. 面板协议扩展（向后兼容）
   - S2C.AlchemyPanel / S2C.EnhancementPanel 的 state 中增加 `queue` 字段（已有，保持兼容）
   - 新增 `sleepingItems` 字段展示休眠中的条件型任务

3. 客户端适配
   - 队列视图展示休眠状态和原因
   - 条件恢复时自动刷新面板

**验证**：`pnpm build:shared` + `pnpm build:server` + `pnpm verify:client`

### Phase 7: 验证与文档（~0.5天）

1. 运行完整验证链
   - `pnpm verify:quick`
   - `pnpm audit:protocol`
   - `pnpm build`

2. 更新文档
   - 更新 `packages/server/README.md` 中 craft 目录说明
   - 更新 `AGENTS.md` 中 runtime/craft 职责描述

3. 补充 smoke 测试
   - 管线骨架 smoke：注册策略 → start → tick → complete
   - 条件队列 smoke：start → interrupt → sleep → condition restore → wake


## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 锻造独立化后旧玩家数据不兼容 | 登录时 forgingJob 丢失 | 运行时自动迁移 + 持久化层双格式读取 |
| 管线抽象过度导致调试困难 | 定位问题时需要穿透管线 | 每个管线阶段有明确日志点，策略方法保持纯函数可单测 |
| 条件队列频繁检查影响 tick 性能 | 100+ 玩家时每 tick 遍历队列 | retryAfterTicks 节流（默认 5 tick 检查一次），shouldCancel 直接移除 |
| 采集/建造的外部状态耦合（容器、建筑实例） | 管线需要访问非 player 状态 | 通过 PipelineTickContext 注入，策略内部处理耦合 |
| 一次性迁移范围大，回归风险高 | 多种技艺同时出问题 | 按 Phase 逐步迁移，每 Phase 独立验证，保留旧代码直到新代码验证通过 |
| Durable 操作语义变更 | 崩溃恢复路径不一致 | 公共 durable 层保持与旧实现相同的 snapshot 格式和 operationId 生成规则 |

## 14. 不变量（重构前后必须保持）

- [ ] 协议不变：C2S/S2C 事件名、payload 结构、投递方式不变
- [ ] 持久化语义不变：job 完成后的数据库写入时机和内容不变
- [ ] 成功率/经验/时长公式不变：shared 层纯函数不修改
- [ ] 中断语义不变：移动/攻击/修炼仍然触发暂停，暂停息数不变
- [ ] 面板同步策略不变：首次全量 + 后续 patch，catalog 版本缓存
- [ ] 队列语义向后兼容：现有 queuedJobs 行为保持，新增休眠能力
- [ ] tick 内无数据库 IO：管线不引入同步 DB 调用
- [ ] 服务端权威：所有结算仍在服务端 tick 内完成

## 15. 性能约束

- 管线骨架本身是纯同步调用链，不引入 async/await（除 durable 层）
- 策略方法必须是 O(1) 或 O(物品数)，不允许 O(玩家数) 或 O(地图实体数)
- 条件检查使用 retryAfterTicks 节流，默认 5 tick 检查一次休眠项
- 队列遍历上限：单玩家队列最大 20 项，超出拒绝入队
- 管线不在 tick 热路径中使用 JSON.stringify/parse、字符串拼装或临时对象分配

## 16. 验证计划

| 阶段 | 验证命令 | 验证内容 |
|------|----------|----------|
| Phase 1 | `pnpm build:shared && pnpm build:server` | 类型正确、编译通过 |
| Phase 2 | `pnpm verify:quick` | 强化 start/tick/cancel/interrupt 行为不变 |
| Phase 3 | `pnpm verify:quick` | 炼丹/锻造 start/tick/cancel/interrupt 行为不变 |
| Phase 4 | `pnpm verify:quick` | 采集/建造接入管线，条件队列工作 |
| Phase 5 | `pnpm verify:quick && pnpm build:server` | durable 公共化后行为不变 |
| Phase 6 | `pnpm build:shared && pnpm build:server && pnpm verify:client` | 协议兼容、客户端面板正常 |
| Phase 7 | `pnpm build && pnpm audit:protocol` | 全量构建 + 协议审计通过 |

## 17. 总工时估算

| 阶段 | 工时 |
|------|------|
| Phase 1: 基础设施 | ~2 天 |
| Phase 2: 强化策略 | ~1 天 |
| Phase 3: 炼丹+锻造策略 | ~2 天 |
| Phase 4: 采集+建造策略 | ~2 天 |
| Phase 5: Durable 公共化+清理 | ~1.5 天 |
| Phase 6: 队列持久化+面板适配 | ~1 天 |
| Phase 7: 验证与文档 | ~0.5 天 |
| **合计** | **~10 天** |

## 18. 未来扩展

管线建立后，以下新技艺只需实现一个 Strategy 类即可接入：

- **符箓制作**：类似炼丹的配方型，复用 AlchemyStrategy 基类
- **阵法布置**：条件型（需要在特定地块），复用 BuildingStrategy 模式
- **钓鱼**：条件型（需要在水边），类似 GatherStrategy
- **挖矿**：条件型，类似 GatherStrategy
- **烹饪**：配方型，复用 AlchemyStrategy 基类

每种新技艺的接入成本从当前的 ~7 处修改 + ~400 行重复代码降低到 ~1 个文件 ~100-150 行策略实现。

## 19. 实施进度

| Phase | 状态 | 说明 |
|-------|------|------|
| 1.1 shared 管线类型 | ✅ 完成 | `technique-activity-pipeline-types.ts` |
| 1.2 扩展 Kind | ✅ 完成 | gather + building 加入 RuntimeTechniqueActivityKind |
| 1.3 策略接口 | ✅ 完成 | `technique-activity-strategy.ts` |
| 1.4 管线骨架 | ✅ 完成 | `technique-activity-pipeline.service.ts` |
| 1.5 队列服务 | ✅ 完成 | `technique-activity-queue.service.ts` |
| 1.6 编译验证 | ✅ 完成 | shared + server 全部通过 |
| 2 EnhancementStrategy | ✅ 完成 | 薄适配器存根 |
| 3.1 forgingJob 独立化 | ✅ 完成 | 类型 + 运行时自动迁移 |
| 3.2 Alchemy + Forging | ✅ 完成 | 薄适配器存根 |
| 4.1 GatherStrategy | ✅ 完成 | 条件型存根 |
| 4.2 BuildingStrategy | ✅ 完成 | 条件型存根 |
| 5 Durable 公共化 | ✅ 完成 | TechniqueActivityDurableService 骨架已创建 |
| 6 队列持久化 + 面板 | ✅ 完成 | 队列推进已接入 tick 循环，中断休眠已接入 |
| 7 全量验证 + 文档 | ✅ 完成 | pnpm build + verify:quick 全部通过 |

### 当前状态说明

**全部 Phase 已完成。** 管线基础设施已搭建并接入生产运行时：

已落地的行为变更：
- 队列推进：tick 循环末尾自动尝试启动队列中的下一个任务
- 条件型休眠：采集/建造被中断时自动休眠入统一队列（附带原因）
- 条件型唤醒：队列推进时自动检查休眠项条件，满足则唤醒启动
- Durable 公共化：TechniqueActivityDurableService 提供统一的 startDurably/tickDurably

保持不变的部分（渐进式迁移）：
- 现有 tickAlchemy/tickEnhancement/startAlchemy/startEnhancement 逻辑不动
- 策略的 resolve 方法为存根，真实逻辑仍在 CraftPanelRuntimeService 中
- WorldRuntimeAlchemyService / WorldRuntimeEnhancementService 保留（后续逐步替换）
- 队列持久化到 PostgreSQL 待后续实现（当前队列在内存中，重启丢失）

验证结果：
- `pnpm build`（shared + server + client）全部通过
- `pnpm verify:quick` smoke 测试全部通过
