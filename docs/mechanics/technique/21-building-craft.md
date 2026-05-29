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

建造 job 必须进入统一技艺任务列表，显示建造目标、实际工作进度、条件休眠状态和取消按钮。建筑面板可以保留专用操作区，但不能成为唯一的取消入口或唯一的进度可见入口。

### 条件检查

1. 建筑存在于目标实例
2. 建筑状态为 'building'（建造中）
3. 玩家位于半成品 1 格范围内

同一个半成品允许任意可接触玩家同时参与建造。每个参与玩家持有自己的 `buildingJob`，每个 job 每 tick 推进一次共享的 `buildRemainingTicks`，因此多人同时施工会按参与人数加速。`activeBuilderPlayerId` 仅作为兼容/最近启动者字段，不再是半成品施工独占锁。

### 条件不满足时

- 释放自身兼容 activeBuilder（仅当兼容字段指向自己）
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
  2. 校验玩家靠近半成品
  3. 检查是否有活跃任务（有则入队列）
  4. 创建 job

tickBuilding:
  1. 条件检查 → 不满足则释放builder + 休眠
  2. 条件满足 → 推进建造进度
  3. 完成 → 建筑状态变更 → 计算技能经验
  4. 触发建筑完工通知
```

## 打断和休眠

- 条件失败时释放自身兼容 `activeBuilderPlayerId`，并进入 sleeping 队列等待重试；永久失效时按规则取消。
- 攻击、移动、手动开始修炼等打断如果需要等待恢复，等待时间必须显示为独立等待状态，不得修改实际建造进度。
- 统一技艺任务列表取消建造 job 时，服务端必须释放建筑占用并清理 active job。

## 相关源文件

- `packages/server/src/runtime/craft/pipeline/strategies/building.strategy.ts` — 建造策略
- `packages/shared/src/constants/gameplay/building.ts` — 建筑常量
