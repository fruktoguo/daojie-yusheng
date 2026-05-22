# 强化系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| DEFAULT_ENHANCE_LEVEL | 0 | `packages/shared/src/constants/gameplay/enhancement.ts` |
| MAX_ENHANCE_LEVEL | 999 | 同上 |
| MARKET_MAX_ENHANCE_LEVEL | 20 | 同上 |
| ENHANCEMENT_RATE_PER_LEVEL | 0.1 | 同上 |
| ENHANCEMENT_BASE_JOB_TICKS | 5 | 同上 |
| ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL | 1 | 同上 |
| ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL | 0.02 | 同上 |
| ENHANCEMENT_HIGH_LEVEL_THRESHOLD | 11 | 同上 |
| ENHANCEMENT_HIGH_LEVEL_MAX_SUCCESS_RATE | 0.5 | 同上 |
| ENHANCEMENT_HIGH_LEVEL_BASE_SUCCESS_RATE | 0.3 | 同上 |
| ENHANCEMENT_HIGH_LEVEL_DECAY_PER_LEVEL | 0.05 | 同上 |
| ENHANCEMENT_HIGH_LEVEL_MIN_SUCCESS_RATE | 0.01 | 同上 |
| ENHANCEMENT_INTERRUPT_PAUSE_TICKS | 10 | 同上 |
| ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL | 0.01 | 同上 |
| ENHANCEMENT_LOWER_LEVEL_DECAY_PER_LEVEL | 0.9 | 同上 |

## 强化成功率公式

### 基础成功率查表（+1 ~ +10）

```ts
ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL = [0.5, 0.45, 0.45, 0.4, 0.4, 0.4, 0.35, 0.35, 0.35, 0.35]
```

### 高等级（≥11）指数衰减

```ts
baseRate = 0.3 × (1 - 0.05)^(level - 11)
// 下限 0.01，上限 0.5
```

### 技能等级修正

```ts
if (roleLevel > itemLevel):
  increment = (roleLevel - itemLevel) × 0.01  // 加算增益
  decay = 1
if (roleLevel < itemLevel):
  increment = 0
  decay = 0.9^(itemLevel - roleLevel)  // 乘算衰减
```

### 工具修正

```ts
toolIncrement = max(0, toolSuccessRateModifier)
```

### 合成 factor

```ts
factor = (1 + increment + toolIncrement) × decay
```

### 最终成功率（严格分段乘除）

```ts
maxRate = (targetLevel >= 11) ? 0.5 : 1.0
adjustedRate = applyMultiplicativeSuccessFactor(baseRate, factor, maxRate)
```

## 强化耗时公式

```ts
baseTicks = 5 + (itemLevel - 1) × 1
speedRate = toolBaseSpeedRate + max(0, roleLevel - itemLevel) × 0.02
totalTicks = max(1, ceil(baseTicks × durationFactor(speedRate)))
```

## 强化灵石消耗

```ts
spiritStoneCost = hasMaterialCost ? floor(itemLevel / 10) : ceil(itemLevel / 10)
// 最小值 1
```

## 强化属性增幅

```ts
enhancementPercent = ceil(100 × (1.1)^enhanceLevel)
// +1 = 110%, +5 ≈ 161%, +10 ≈ 259%
```

## 强化失败规则

| 情况 | 结果 |
|------|------|
| 成功 | currentLevel → targetLevel |
| 失败 + 有保护 | currentLevel → max(0, currentLevel - 1) |
| 失败 + 无保护 | currentLevel → 0（归零） |

## 执行流程

```
startEnhancement:
  1. 校验目标存在且为装备 → 校验未达上限
  2. 检查是否有活跃任务（有则入队列）
  3. 解析保护物 → 检查材料/灵石充足
  4. 从背包提取装备 → 锁定到 lockedItems
  5. 扣除材料 → 计算 successRate/totalTicks
  6. 创建 job (phase='enhancing')

tickEnhancement:
  1. remainingTicks -= 1
  2. phase='paused' → 推进暂停
  3. remainingTicks > 0 → 等待
  4. remainingTicks = 0 → 判定成功(Math.random() < successRate)
  5. 成功 → 扣灵石 → 提升等级
  6. 失败+保护 → 扣保护物 → 降1级
  7. 失败+无保护 → 归零
  8. 计算技能经验
  9. 未达目标 → advanceEnhancementJob(继续下一阶)
  10. 达到目标 → finishEnhancementJob → 启动队列下一项
```

## 相关源文件

- `packages/shared/src/constants/gameplay/enhancement.ts` — 常量
- `packages/shared/src/enhancement.ts` — 公式
- `packages/shared/src/craft-success.ts` — 成功率修正
- `packages/server/src/runtime/craft/pipeline/strategies/enhancement.strategy.ts` — 策略
