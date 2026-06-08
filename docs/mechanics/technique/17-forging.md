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
  1. phase='paused' → 只推进 interruptWaitRemainingTicks / pausedTicks，不改实际工作进度
  2. phase='brewing' → remainingTicks/workRemainingTicks -= 1
  3. 完成 → 判定成功 → 产出/技能经验
```

## 与炼丹的区别

- `furnaceOutputCount = 1`（锻造单次产出 1 件）
- 炼丹 `furnaceOutputCount = 6`（炼丹单次制作产出倍率为 6）
- 基础成功率共用五行匹配公式，动态成功率修正共用赔率空间渐近修正
- 耗时公式共用材料数量基础耗时修正与速度修正

## 成功率公式

与炼丹相同，基础成功率使用五行匹配公式，详见 `docs/mechanics/technique/16a-fivephase-craft-formula.md`；动态修正使用 `applyAsymptoticSuccessModifier`：
```ts
baseSuccessRate = computeFivePhaseElementMatch(inputElements, targetElements).baseElementSuccessRate
adjustedRate = applyAsymptoticSuccessModifier(baseRate, levelModifier + toolModifier)
```

## 耗时公式

与炼丹相同：
```ts
baseTicks = 按自定义投料材料总数相对标准配方材料总数修正 baseBrewTicks
speedRate = levelSpeedRate + toolSpeedRate
totalTicks = max(1, ceil(baseTicks × durationFactor(speedRate)))
```

材料数量修正规则详见 `docs/mechanics/technique/16a-fivephase-craft-formula.md`。

## 相关源文件

- `packages/server/src/runtime/craft/pipeline/strategies/forging.strategy.ts` — 锻造策略
- `packages/shared/src/craft-success.ts` — 成功率
- `packages/shared/src/craft-duration.ts` — 耗时

## 面板表现约束

- 锻造表现为直接进行的制作 job，不再展示准备、开炉、炉火稳定等阶段。
- 实际制作进度只按 `workTotalTicks/workRemainingTicks` 计算。
- 攻击、移动、手动开始修炼等打断只显示独立等待条，不改变实际制作进度。
- 当前 job 和队列项必须能在统一技艺任务列表中直接取消。
