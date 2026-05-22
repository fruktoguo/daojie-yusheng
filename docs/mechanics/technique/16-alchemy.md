# 炼丹系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/craft.ts`, `packages/server/src/runtime/craft/craft-panel-runtime.service.ts`

| 常量 | 值 | 说明 | 源文件 |
|------|-----|------|--------|
| ALCHEMY_PREPARATION_TICKS | 10 | 准备阶段息数 | craft.ts |
| ALCHEMY_FURNACE_OUTPUT_COUNT | 6 | 丹炉单次产出数量 | craft.ts |
| ALCHEMY_MAX_PRESET_COUNT | 24 | 预设最大数量 | craft-panel-runtime.service.ts |
| ALCHEMY_INTERRUPT_PAUSE_TICKS | 10 | 被打断暂停息数 | craft-panel-runtime.service.ts |

## 炼丹成功率公式

源文件: `packages/shared/src/alchemy.ts`, `packages/shared/src/craft-success.ts`

### 1. 基础成功率

```typescript
powerRatio = submittedPower / recipe.fullPower  // [0,1]
baseSuccessRate = isExactRecipe ? 1 : powerRatio²
```

### 2. 材料力量计算

```typescript
materialPower = level × (gradeValue²) × count
// gradeValue: mortal=1, yellow=2, mystic=3, earth=4, heaven=5, spirit=6, saint=7, emperor=8
```

### 3. 等级修正（赔率空间）

```typescript
levelModifier = (targetLevel > skillLevel)
  ? (targetLevel - skillLevel) × ln(0.9)      // 减益
  : (targetLevel < skillLevel)
    ? (skillLevel - targetLevel) × ln(1/0.98)  // 增益
    : 0
```

### 4. 最终成功率（赔率空间渐近修正）

```typescript
adjustedRate = applyAsymptoticSuccessModifier(baseRate, levelModifier + toolSuccessModifier)

// 赔率变换:
// modifier > 0 (增益):
//   result = (rate × cap) / (rate + (cap - rate) × e^(-modifier))
// modifier < 0 (减益):
//   result = (rate × e^modifier × cap) / ((cap - rate) + rate × e^modifier)
```

## 炼丹耗时公式

源文件: `packages/shared/src/alchemy.ts`, `packages/shared/src/craft-duration.ts`

```typescript
// 1. 基础炼制时间
brewTicks = isExactRecipe ? baseBrewTicks : ceil(baseBrewTicks × powerRatio)

// 2. 速度修正
speedRate = (recipeLevel > alchemyLevel) ? -0.1 × (recipeLevel - alchemyLevel)
          : (recipeLevel < alchemyLevel) ? +0.02 × (alchemyLevel - recipeLevel)
          : 0
speedRate += furnaceSpeedRate  // 丹炉加速

// 3. 耗时因子
durationFactor = (speedRate >= 0) ? 1/(1+speedRate) : 1+|speedRate|

// 4. 最终单炉耗时
adjustedBrewTicks = max(1, ceil(brewTicks × durationFactor))

// 5. 总耗时
totalTicks = ALCHEMY_PREPARATION_TICKS + adjustedBrewTicks × quantity
```

## 灵石消耗

```typescript
alchemySpiritStoneCost = recipeLevel × quantity  // consumesSpiritStone=true时
```

## 产出数量

```typescript
batchOutputCount = outputCount × furnaceOutputCount
// 锻造/buff类: furnaceOutputCount = 1
// 普通炼丹: furnaceOutputCount = ALCHEMY_FURNACE_OUTPUT_COUNT (6)
```

## 执行流程

```
startAlchemy:
  1. 校验配方存在 → 校验投料合法性 → 校验数量
  2. 检查是否有活跃任务（有则入队列）
  3. 检查材料充足 → 检查灵石充足
  4. 扣除材料 → 扣除灵石
  5. 计算 batchBrewTicks/totalTicks/successRate/batchOutputCount
  6. 创建 job (phase='preparing')

tickAlchemy:
  1. remainingTicks -= 1
  2. phase='paused' → 推进暂停倒计时
  3. phase='preparing' → 等待准备期结束 → 切换到 'brewing'
  4. phase='brewing' → currentBatchRemainingTicks -= 1
  5. 单炉完成 → 逐件判定成功(Math.random() < successRate)
  6. 产出入背包 → 计算技能经验 → 判断是否全部完成
  7. 全部完成 → 启动队列下一项
```
