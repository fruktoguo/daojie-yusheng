# 建造系统

## 策略特征

| 属性 | 值 |
|------|-----|
| kind | building |
| jobSlot | buildingJob |
| skillSlot | buildingSkill |
| pauseTicks | 0 |
| conditional | true |

## 条件型技艺

建造是条件型技艺（conditional=true），每 tick 检查条件是否满足：

### 条件检查

1. 建筑存在于目标实例
2. 建筑状态为 'building'（建造中）
3. 玩家是 activeBuilderPlayerId

### 条件不满足时

- 释放 activeBuilder
- 休眠入队列尾部
- `TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5` ticks 后重试

## 建筑常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| BUILDING_DEFAULT_BUILD_TICKS | 1 | `packages/shared/src/constants/gameplay/building.ts` |
| BUILDING_DEFAULT_DECONSTRUCT_TICKS | 1 | 同上 |
| BUILDING_DEFAULT_MAX_HP | 100 | 同上 |

## 执行流程

```
startBuilding:
  1. 校验建筑存在且状态为 building
  2. 校验玩家为 activeBuilder
  3. 检查是否有活跃任务（有则入队列）
  4. 创建 job

tickBuilding:
  1. 条件检查 → 不满足则释放builder + 休眠
  2. 条件满足 → 推进建造进度
  3. 完成 → 建筑状态变更 → 计算技能经验
  4. 触发建筑完工通知
```

## 相关源文件

- `packages/server/src/runtime/craft/pipeline/strategies/building.strategy.ts` — 建造策略
- `packages/shared/src/constants/gameplay/building.ts` — 建筑常量
