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

## 法宝炼制

炼器目录包含独立 `artifact` 分类，用于法宝器方。法宝器方仍使用炼器统一五行投料与技艺任务生命周期，但基础五行成功率会额外乘以 `ARTIFACT_CRAFT_BASE_SUCCESS_RATE = 0.1`：即五行完全匹配时，任务快照中的基础成功率也只有 10%，后续炼器等级、炼器工具、幸运等动态修正继续按通用公式计算。

当前内置法宝器方：

| 器方 | 阶段 | 产物 | 材料 | 基础耗时 |
|---|---|---|---|---:|
| `forging.artifact_sky_patrol_flying_sword` | 筑基期 | 巡天飞剑 | 五行脉晶x200；五行混元精x200；五行蟾液x200；混元脉石x200；噬脉兽核x200 | 3600息 |

## 成功率公式

与炼丹相同，基础成功率使用五行匹配公式，详见 `docs/mechanics/technique/16a-fivephase-craft-formula.md`；动态修正使用 `applyAsymptoticSuccessModifier`：
```ts
baseSuccessRate = computeFivePhaseElementMatch(inputElements, targetElements).baseElementSuccessRate
adjustedRate = applyAsymptoticSuccessModifier(baseRate, levelModifier + toolModifier)
```

基础成功率为 100% 且总等级/工具修正仍为负时，炼器不会免疫低等级强行制作惩罚，而是按 `e^(levelModifier + toolModifier)` 下调。例如炼器等级 10 制作目标等级 20 且无工具/幸运抵消时，`100% → 0.9^10 ≈ 34.87%`。

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
