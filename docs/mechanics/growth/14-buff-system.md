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

### 内部持久计时状态

- 恢复药的 `hp` / `qi` 共享冷却复用运行时 Buff 的持久化和逐息衰减能力，内部 ID 分别为 `system.consumable_cooldown.hp` 与 `system.consumable_cooldown.qi`。
- 这两条状态固定为 `visibility = hidden`，不携带属性、数值或 tick 效果，也不作为玩家可见增益展示。
- 状态设置 `persistOnDeath` 与 `persistOnReturnToSpawn`，因此断线重连、进程重启、死亡复生和遁返不会重置冷却；背包冷却列表由它们和玩家 `lifeElapsedTicks` 重新派生。

## 法宝 Buff

法宝盈能是运行时真实 buff（写回玩家 `buffs` 真源），由玩家法宝 tick 推进：
- buffId: `artifact.overcharge`
- 名称: 盈能
- 至少有一个法宝槽保持启用时，每 tick 增加 1 层
- 没有法宝槽启用时，每 tick 减少 1 层；层数归零时移除
- 每层使法宝固定灵力消耗提高 1%

## Buff 持续时间

- 每 tick: `remainingTicks -= 1`
- `remainingTicks ≤ 0` 时移除
- `infiniteDuration = true` 时不衰减
- sustainCost: 每 tick 消耗资源，不足时移除

## 天道压制

- Buff ID：`virtual_world.heavenly_dao_suppression`，来源为虚境击杀低于自身至少 6 个境界等级的怪物。
- 每次触发按境界差增加层数，并把整组持续时间刷新为 3600 息；到期时整组移除，不逐层衰减。
- `persistOnDeath` 与 `persistOnReturnToSpawn` 均为 `true`，因此身死和遁返不能清除。
- 它不走普通 `stacks × realmEffectiveness` 百分比 Buff 链，而是在属性最终结算层按 `1000 / (1000 + stacks)` 同时压制最终六维与全部战斗属性。这样每项只衰减一次，避免六维派生数值再被重复压制。
- 1000 层保留 50%，即减少 50%；2000 层保留约 33.33%，即减少约 66.67%。

## Buff 来源分类

- 技能施加: sourceSkillId = 技能ID
- 物品使用: sourceSkillId = 'item:{itemId}'
- 丹药: sourceSkillId = 'pill.{pillId}'
- 装备触发: timed_buff 效果
- 系统投影: cultivation:active, activity.building
