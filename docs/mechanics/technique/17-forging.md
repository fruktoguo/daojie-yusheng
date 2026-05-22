# 锻造系统

## 策略特征

| 属性 | 值 |
|------|-----|
| kind | forging |
| jobSlot | forgingJob |
| skillSlot | forgingSkill |
| pauseTicks | 10 |
| conditional | false |

## 执行流程

锻造使用与炼丹相同的统一技艺活动框架（TechniqueActivity Pipeline），流程类似：

```
startForging:
  1. 校验配方存在 → 校验投料合法性
  2. 检查是否有活跃任务（有则入队列）
  3. 检查材料充足 → 检查灵石充足
  4. 扣除材料 → 扣除灵石
  5. 计算耗时/成功率/产出
  6. 创建 job

tickForging:
  1. remainingTicks -= 1
  2. 暂停处理
  3. 完成 → 判定成功 → 产出/技能经验
```

## 与炼丹的区别

- `furnaceOutputCount = 1`（锻造单次产出 1 件）
- 炼丹 `furnaceOutputCount = 6`（丹炉产出 6 件）
- 成功率公式共用（赔率空间渐近修正）
- 耗时公式共用（速度修正）

## 成功率公式

与炼丹相同，使用 `applyAsymptoticSuccessModifier`：
```ts
powerRatio = submittedPower / recipe.fullPower
baseSuccessRate = isExactRecipe ? 1 : powerRatio²
adjustedRate = applyAsymptoticSuccessModifier(baseRate, levelModifier + toolModifier)
```

## 耗时公式

与炼丹相同：
```ts
baseTicks = isExactRecipe ? baseBrewTicks : ceil(baseBrewTicks × powerRatio)
speedRate = levelSpeedRate + toolSpeedRate
totalTicks = max(1, ceil(baseTicks × durationFactor(speedRate)))
```

## 相关源文件

- `packages/server/src/runtime/craft/pipeline/strategies/forging.strategy.ts` — 锻造策略
- `packages/shared/src/craft-success.ts` — 成功率
- `packages/shared/src/craft-duration.ts` — 耗时
