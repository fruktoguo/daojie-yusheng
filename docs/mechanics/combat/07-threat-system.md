# 威胁系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/threat.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_PASSIVE_THREAT_PER_TICK | 1 | 每息被动仇恨增量 |
| DEFAULT_AGGRO_THRESHOLD | 1 | 开始攻击的仇恨阈值 |
| THREAT_DISTANCE_FALLOFF_PER_TILE | 0.9 | 每格距离仇恨衰减倍率 |
| LOST_TARGET_THREAT_DECAY_RATIO | 0.1 | 丢失目标每息衰减比例 |
| LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO | 0.01 | 丢失目标每息按最大HP衰减 |
| MAX_THREAT_VALUE | 1e15 | 单条仇恨上限 |
| PLAYER_TARGETING_PREFERENCE_THREAT_MULTIPLIER | 5 | 偏好目标评分倍率 |

## 威胁值计算公式

源文件: `packages/server/src/runtime/world/combat/world-runtime-threat.service.ts`

```typescript
calculateThreatDelta(input):
  delta = baseThreat
  delta ×= THREAT_DISTANCE_FALLOFF_PER_TILE ^ (distance - 1)  // distance > 1 时
  delta ×= resolveExtraAggroThreatMultiplier(extraAggroRate)
  delta ×= 各外部 multipliers
  return min(MAX_THREAT_VALUE, delta)

resolveExtraAggroThreatMultiplier(rate):
  rate > 0: return 1 + rate/100
  rate < 0: return 100 / (100 - rate)
```

## 丢失目标衰减

```typescript
decayMissingTargets(ownerId, activeTargetIds, ownerMaxHp):
  flatDecay = ownerMaxHp × 0.01
  for each inactive target:
    decay = entry.value × 0.1 + flatDecay
    entry.value -= decay
    if entry.value ≤ 0: remove entry
```

## 目标选择规则

- 从仇恨表中选 value 最高且 ≥ threshold 的目标
- 排序: value 降序 → lastUpdatedAt 降序 → targetId 字典序
- canTarget 回调过滤不可攻击目标
- 不可达目标仇恨 ×0.2 衰减
