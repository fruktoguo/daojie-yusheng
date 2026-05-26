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
RuntimeTechniqueActivityKind = 'alchemy' | 'forging' | 'enhancement' | 'gather' | 'building' | 'mining' | 'formation'
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
- 条件型：采集、建造、阵法维护/持续补充灵力。
- 破坏/采矿型：挖矿。

任务列表必须展示当前 job、排队任务、条件休眠任务和打断等待状态，并为可取消项提供取消按钮。取消只提交服务端意图，资源退还、外部占用释放、资产结算和拒绝条件都由服务端权威裁定。

实际工作进度只由 `workTotalTicks/workRemainingTicks` 表示。攻击、移动、手动开始修炼等行为产生的恢复等待使用独立的 `interruptWaitRemainingTicks`，不能通过修改 job 的实际总耗时或剩余工作量表达。

阵法语义必须拆清：持续注入灵力、可等待、可打断、可取消的“补充灵力”属于 `formation` 技艺 job；一次性把资源转入阵法池的按钮只是资源管理命令，不进入 job 进度、队列、技艺经验或打断等待。

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
