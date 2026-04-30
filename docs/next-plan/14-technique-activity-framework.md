# 14 技艺活动框架统一化规划

目标：把炼丹、强化、采集等非战斗职业行为统一成“技艺活动”框架，公共层只负责经验、耗时、占用行动、持续中与中断；每个技艺内容仍各自独立。

说明：

- 这份文档是 当前生产主线后续专项规划，不作为当前 `release` 的立即阻塞项。
- 当前生产主线已经有炼丹、强化 runtime，也已有 `gatherSkill` 状态位；这份文档的目标是把它们收成一套可扩的技艺活动框架。

## 当前基线

- `packages/server/src/runtime/craft/craft-panel-runtime.service.ts`
  - 已同时承接炼丹和强化的任务创建、推进、中断和收口。
- `packages/server/src/runtime/player/player-runtime.service.ts`
  - 已持有 `alchemySkill / gatherSkill / enhancementSkill` 三套状态。
- `packages/client/src/ui/panels/attr-panel.ts`
  - 已把三种技艺并列展示为“技艺”页签。
- 当前生产主线里：
  - 炼丹和强化是完整写路径。
  - 采集还没有完全接成同等级的 runtime 框架。
- `main` 分支里：
  - `packages/shared/src/craft-skill.ts`
  - `packages/shared/src/craft-duration.ts`
  - `packages/shared/src/craft-success.ts`
  - 已把公共经验、公共耗时、公共成功率修正拆成 shared 纯函数。
- `main:packages/server/src/game/loot.service.ts`
  - 采集已经体现为可持续、可中断、带进行中 Buff 的后台活动。

结论：

- 公共公式在 `main` 已有现成基础。
- next 侧还缺“统一活动框架”，因此炼丹/强化和采集还没有真正并轨。

## 目标模型

统一的技艺活动定义：

```ts
interface TechniqueActivityDefinition<TStartInput, TJobState> {
  activityKey: string;
  validateStart(input: TStartInput): void;
  buildJobState(input: TStartInput): TJobState;
  tick(job: TJobState): ActivityTickResult;
  interrupt(job: TJobState, reason: ActivityInterruptReason): ActivityInterruptResult;
  finish(job: TJobState): ActivityFinishResult;
}
```

统一的公共层职责：

- 活动开始
- 忙碌态 / 占用行动
- tick 推进
- 中断和恢复
- 进行中 Buff
- 通用经验结算
- 通用耗时结算
- 通用成功率修正入口

内容层各自负责：

- 炼丹
  - 丹方、材料、成丹、散丹
- 强化
  - 目标装备、保护物、降级规则
- 采集
  - 资源点、存量、刷新、单次产物
- 后续技艺
  - 锻造、制符、炼器等

## 非目标

- 不把所有技艺内容硬塞进一个巨型 service。
- 不为了统一而抹掉炼丹、强化、采集之间的专属规则差异。
- 不在这轮顺手扩写新的职业内容。

## 任务

- [ ] 把 `main` 上已经存在的公共经验 / 耗时 / 成功率公式迁回 next shared
- [ ] 给技艺活动定义统一的 job lifecycle 和 busy state
- [ ] 给进行中技艺统一 Buff/Notice 展示语义
- [ ] 给活动中断统一 reason 口径
- [ ] 给活动完成后的经验增长统一接 shared 公式
- [ ] 把炼丹迁成第一个 activity adapter
- [ ] 把强化迁成第二个 activity adapter
- [ ] 把采集补成第三个 activity adapter
- [ ] 让 action/loot/detail 面板读取统一的活动进行中状态
- [ ] 补 smoke，覆盖 start / tick / interrupt / finish / persistence

## 执行顺序

### 第 1 批：先迁 shared 公共公式

- [ ] 把 `craft-skill.ts / craft-duration.ts / craft-success.ts` 收到 next `packages/shared`
- [ ] 让 next 的炼丹和强化先复用这三份纯函数

### 第 2 批：定义统一 activity runtime

- [ ] 从现有 `CraftPanelRuntimeService` 中抽出公共 lifecycle
- [ ] 定义统一的 job state、busy state、interrupt reason
- [ ] 保留炼丹/强化内容适配层

### 第 3 批：补采集并轨

- [ ] 让采集从“只存在 `gatherSkill` 状态位”升级为真正 activity
- [ ] 采集统一接入忙碌、Buff、经验、耗时、中断
- [ ] 再决定采集是走 loot/container owner 还是独立 activity facade

## 验证

最小验证：

- 炼丹、强化、采集三者都能进入统一忙碌态
- 移动、出手、手动取消都能按统一 reason 中断
- 经验结算都来自 shared 纯函数，而不是分散在各 service 手算
- 采集不会再只是 UI/状态位存在，而是真正并入 runtime 主链

需要单独说明的风险：

- 如果先做 activity 外壳，但不先迁 shared 公式，后面还是会继续复制一套套经验/耗时逻辑。
- 如果把采集继续留在独立特判链，技艺统一框架最后只会变成“炼丹强化框架”，不是通用技艺框架。
