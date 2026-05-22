# Buff 系统

## Buff 模板字段

源文件: `packages/shared/src/skill-types.ts`

关键字段:
- buffId, name, desc, shortMark
- category: buff / debuff
- visibility: public / observe_only / hidden
- duration（息）
- stacks, maxStacks
- attrs（六维加成）, attrMode: flat / percent
- stats（数值面板加成）, statMode: flat / percent
- qiProjection
- infiniteDuration
- sustainCost
- expireWithBuffId
- persistOnDeath, persistOnReturnToSpawn

## 运行时 Buff 实例

源文件: `packages/server/src/runtime/player/runtime-buff-instance.ts`

### 实例 own 字段（可变）

- remainingTicks
- duration
- stacks
- maxStacks
- realmLv
- infiniteDuration
- sustainTicksElapsed
- persistOnDeath
- persistOnReturnToSpawn

### 模板字段（走 prototype 链）

buffId, name, desc, shortMark, category, visibility, sourceSkillId, sourceSkillName, color, attrs, attrMode, stats, statMode, qiProjection, presentationScale, sustainCost, expireWithBuffId, sourceCasterId

## Buff 叠加规则

### 有效条件

```typescript
remainingTicks > 0 && stacks > 0
```

### 效果因子

```typescript
effectFactor = stacks × realmEffectiveness
realmEffectiveness = buffRealmLv >= targetRealmLv ? 1 : 0.9^(targetRealmLv - buffRealmLv)
```

### 属性叠加方式

- `attrMode='flat'`: 直接加到六维
- `attrMode='percent'`: 按来源分层叠加（pill 和普通 buff 分开）
- `statMode='flat'`: 直接加到数值面板
- `statMode='percent'`: 同样分层

### 丹药 buff 判定

```typescript
isPillBuff = sourceSkillId.startsWith('item:')
          || sourceSkillId.startsWith('pill.')
          || buffId.startsWith('item_buff.')
```

丹药 buff 和普通 buff 的百分比加成分层独立计算。

## Buff 投影

源文件: `packages/server/src/runtime/player/player-buff-projection.helpers.ts`

投影层合成虚拟 buff（不写回运行时真源）:
- 修炼 buff: `cultivation:active`
- 营造 buff: `activity.building`
- 黑暗 buff: 世界时间视野减少

## Buff 持续时间

- 每 tick: `remainingTicks -= 1`
- `remainingTicks ≤ 0` 时移除
- `infiniteDuration = true` 时不衰减
- sustainCost: 每 tick 消耗资源，不足时移除

## Buff 来源分类

- 技能施加: sourceSkillId = 技能ID
- 物品使用: sourceSkillId = 'item:{itemId}'
- 丹药: sourceSkillId = 'pill.{pillId}'
- 装备触发: timed_buff 效果
- 系统投影: cultivation:active, activity.building
