# 制作技能经验

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| CRAFT_SKILL_EXP_TICK_DIVISOR | 3600 | `packages/shared/src/constants/gameplay/craft.ts` |
| CRAFT_SKILL_LEVEL_DECAY_RATE | 0.95 | 同上 |
| CRAFT_SKILL_FAILURE_EXP_RATE | 0.25 | 同上 |
| CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL | 20 | 同上 |
| DEFAULT_CRAFT_EXP_TO_NEXT | 60 | `packages/server/src/runtime/craft/craft-skill-exp.helpers.ts` |

源文件：`packages/server/src/runtime/craft/craft-skill-exp.helpers.ts`

## 核心经验公式

### 单次经验

```ts
computeTimedCraftSkillExp(expToNext, level, baseActionTicks, multiplier):
  return expToNext × (baseActionTicks / 3600) × 0.95^(level-1) × multiplier
```

### 批次经验

```ts
referenceLevel = min(skillLevel, targetLevel)
successGainPerAttempt = computeTimedCraftSkillExp(expToNext(refLevel), refLevel, baseActionTicks, successMultiplier)
failureGainPerAttempt = computeTimedCraftSkillExp(expToNext(refLevel), refLevel, baseActionTicks, 0.25)
baseGain = (successGain × successCount + failureGain × failureCount) / totalAttempts
finalGainRaw = baseGain × earlyLevelMultiplier
finalGain = finalGainRaw > 0 ? max(1, round(finalGainRaw)) : 0  // 正值保底为1
```

> 注：前期补偿倍率中的 `level` 使用的是玩家当前技能等级（normalizedSkillLevel），而非 referenceLevel。

### 前期补偿倍率

```ts
// level < 20 时:
earlyLevelMultiplier = 1 + (20 - level) × 4 / 19
// level >= 20 时:
earlyLevelMultiplier = 1
```

| 等级 | 补偿倍率 |
|------|---------|
| 1 | ≈5.0× |
| 5 | ≈4.16× |
| 10 | ≈3.1× |
| 15 | ≈2.05× |
| 20+ | 1.0× |

## 技能升级

```ts
while (exp >= expToNext && expToNext > 0):
  exp -= expToNext
  level += 1
  expToNext = resolveExpToNextByLevel(level)  // 从境界配置服务获取
```

## 统一技艺活动框架

### 已接入种类

```ts
RuntimeTechniqueActivityKind = 'alchemy' | 'forging' | 'enhancement' | 'transmission' | 'gather' | 'building' | 'mining' | 'formation'
```

### 管线生命周期

```
start → [validateStart → consumeResources → createJob]
  → tick循环 → [conditionCheck → pause → advance → resolve → skillExp → output → completion]
interrupt → [暂停/休眠]
cancel → [computeRefund → 清理job]
```

### 统一任务可见性

所有玩家发起的技艺具体动作都应表现为 job，并进入统一技艺任务列表：

- 配方型：炼丹、锻造。
- 装备型：强化。
- 学习型：传法。
- 条件型：采集、建造、阵法维护/持续补充灵力。
- 破坏/采矿型：挖矿。

“表现为 job”必须表示服务端权威生命周期由 job 管线控制，而不是只在客户端任务列表中投影一条记录。凡是跨 tick 推进、可以被打断或取消、会授予技艺经验、会占用外部对象、会延迟产出或持续消耗资源的技艺动作，都必须通过技艺 job 的 start、tick、interrupt、cancel、resolve 流程，并由同一条 lifecycle 产出经验、产出/消耗、外部占用释放、持久化 dirty 和面板 patch。

技艺 job 框架按抽象类/模板方法口径维护：通用骨架统一负责 job 注册、活跃槽位、任务列表排序、`jobRunId/cancelRef`、打断等待、取消入口、持久化和 patch；具体技艺只在 strategy 钩子中实现自己的 `validateStart/createJob/onTick/checkContinue/onCancel/onComplete` 等领域差异。新增技艺不得在玩家对象或 pending 数据中私挂“类 job”状态来绕过通用 lifecycle。

任务列表必须展示当前 job、排队任务、条件休眠任务和打断等待状态，并为可取消项提供取消按钮。取消只提交服务端意图，资源退还、外部占用释放、资产结算和拒绝条件都由服务端权威裁定。

实际工作进度只由 `workTotalTicks/workRemainingTicks` 表示。攻击、移动、手动开始修炼等行为产生的恢复等待使用独立的 `interruptWaitRemainingTicks`，不能通过修改 job 的实际总耗时或剩余工作量表达。

阵法语义必须拆清：持续注入灵力、可等待、可打断、可取消的“补充灵力”属于 `formation` 技艺 job；一次性把资源转入阵法池的按钮只是资源管理命令，不进入 job 进度、队列、技艺经验或打断等待。

统一技艺任务列表是公共取消入口。炼丹、锻造、强化、采集、挖矿、建造、阵法维护可以在各自子面板保留重复取消入口，但不能要求玩家必须进入对应子面板才能取消当前 job、排队项或休眠项。

炼丹、锻造开始后直接表现为制作 job，不保留玩家可见的开炉、准备、炉火稳定等阶段。旧存档或兼容字段如果仍存在这些状态，水合到运行态时必须规整为实际制作阶段或明确停止，不能继续向客户端暴露旧阶段。

### 技艺动作判定表

| 动作 | 是否进入技艺 job | 判定 |
|------|------------------|------|
| 炼丹 | 是 | 跨 tick 制作、可打断、可取消、延迟产出、授予炼丹经验 |
| 锻造 | 是 | 跨 tick 制作、可打断、可取消、延迟产出、授予锻造经验 |
| 强化 | 是 | 跨 tick 冲级、锁定装备、消耗灵石/保护物、写强化记录 |
| 传法 | 是 | 学习者身上的正式技艺 job；传授者是条件来源和经验收益方之一，开始、推进、暂停 10 息、取消、完成和传法经验都走通用 job lifecycle |
| 采集 | 是 | 跨 tick 搜寻、占用容器目标、可休眠/取消、授予采集经验 |
| 挖矿 | 是 | 对矿脉持续发起锁定强制攻击，由战斗/自动战斗链路选择普攻或技能；命中后产出矿物、授予挖矿经验、可打断/取消 |
| 建造 | 是 | 跨 tick 推进建筑状态、占用 `activeBuilderPlayerId`、授予建造经验 |
| 阵法持续维护/注入灵力 | 是 | 持续消耗玩家灵力并推进阵法维护，每息授予阵法经验，可等待/取消 |
| 阵法一次性资源补给 | 否 | 即时把资源转入阵法池，不显示进度、不排队、不授予技艺经验、不参与打断等待 |
| 普通攻击/技能攻击地块 | 否 | 属于战斗破坏入口；如果同一矿脉也可挖矿，掉落和经验必须与挖矿 job 去重 |
| 强制攻击矿脉 | 是 | 玩家强制攻击选择矿脉地块时转入挖矿 job；job 自己发起的强制攻击不再递归创建新 job，而是回到战斗链路执行 |
| 手动开始修炼、移动、攻击 | 否 | 这些是打断来源，只能刷新独立等待状态，不能改写实际 job 工作量 |

### 阵法维护经验

阵法维护每息按统一公式结算一次成功动作：

```ts
baseActionTicks = 1
successCount = 1
failureCount = 0
targetLevel = formationSkill.level
```

### 队列系统

```ts
TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH = 20   // 队列最大长度
TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5   // 休眠重试间隔
```

## 通用速度修正函数

```ts
// speedRate >= 0: 加速
durationFactor = 1 / (1 + speedRate)
// speedRate < 0: 减速
durationFactor = 1 + |speedRate|

adjustedTicks = max(1, ceil(baseTicks × durationFactor))
```

源文件：`packages/shared/src/craft-duration.ts`

## 相关源文件

- `packages/shared/src/constants/gameplay/craft.ts` — 常量
- `packages/shared/src/craft-skill.ts` — 技能升级
- `packages/server/src/runtime/craft/craft-skill-exp.helpers.ts` — 经验计算
- `packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts` — 管线
- `packages/shared/src/technique-activity-types.ts` — 类型定义
