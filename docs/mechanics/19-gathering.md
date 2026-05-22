# 采集系统

## 策略特征

| 属性 | 值 |
|------|-----|
| kind | gather |
| jobSlot | gatherJob |
| skillSlot | gatherSkill |
| pauseTicks | 0 |
| conditional | true |

## 条件型技艺

采集是条件型技艺（conditional=true），每 tick 检查条件是否满足：

### 条件检查

1. 玩家在容器 1 格内（切比雪夫距离 ≤ 1）
2. 容器存在且为 herb 类型
3. 容器仍有可采集物

### 条件不满足时

- 自动休眠入队列尾部
- `TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5` ticks 后重试

## 执行流程

```
startGather:
  1. 校验容器存在且在范围内
  2. 校验容器类型为 herb
  3. 检查是否有活跃任务（有则入队列）
  4. 创建 job

tickGather:
  1. 条件检查 → 不满足则休眠
  2. 条件满足 → 推进采集进度
  3. 完成 → 产出物品 → 计算技能经验
  4. 容器耗尽 → 触发容器重生倒计时
```

## 队列系统

```ts
TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH = 20  // 队列最大长度
TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5  // 休眠重试间隔
```

## 相关源文件

- `packages/server/src/runtime/craft/pipeline/strategies/gather.strategy.ts` — 采集策略
- `packages/shared/src/technique-activity-pipeline-types.ts` — 管线类型
