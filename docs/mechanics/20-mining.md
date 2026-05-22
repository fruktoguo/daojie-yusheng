# 挖矿系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| MINING_DAMAGE_BONUS_PER_LEVEL | 0.02 | `packages/shared/src/constants/gameplay/craft.ts` |
| MINING_EXP_BASE_ACTION_TICKS | 0.3 | 同上 |
| TERRAIN_REALM_BASE_HP | 100 | `packages/shared/src/constants/gameplay/terrain.ts` |
| TERRAIN_REALM_HP_GROWTH_RATE | 1.4 | 同上 |

## 挖矿伤害公式

```ts
levelMultiplier = (1 + 0.02)^miningLevel  // 指数增长
equipMultiplier = 1 + max(0, weapon.miningDamageRate)
finalDamage = max(1, round(baseDamage × levelMultiplier × equipMultiplier))
```

源文件：`packages/server/src/runtime/world/combat/tile-drop.helpers.ts`

## 矿脉 HP

```ts
getTerrainRealmBaseHp(realmLv) = 100 × 1.4^(realmLv - 1)
```

| 境界等级 | 矿脉 HP |
|----------|---------|
| 1 | 100 |
| 5 | 384 |
| 10 | 2058 |
| 15 | 11018 |
| 20 | 58984 |

## 挖矿经验

```ts
referenceLevel = min(oreTileLevel, miningLevel, realmLevel)
gain = computeCraftSkillExpGain({
  skillLevel: miningLevel,
  targetLevel: referenceLevel,
  baseActionTicks: 0.3,  // MINING_EXP_BASE_ACTION_TICKS
  successCount: 1,
  successMultiplier: 1,
})
```

每次挖矿动作视为 0.3 息的动作时间。

## 掉落倍率

```ts
resolveTileDamageDropMultiplier(damage):
  if damage ≤ 0: return 0
  if damage < 100: return 0.5
  multiplier = 1, threshold = 300
  while damage >= threshold:
    multiplier += 1
    threshold *= 3
  return multiplier
```

| 伤害范围 | 掉落倍率 |
|----------|---------|
| ≤0 | 0 |
| 1~99 | 0.5 |
| 100~299 | 1 |
| 300~899 | 2 |
| 900~2699 | 3 |
| 2700~8099 | 4 |
| ... | 每 ×3 阈值 +1 |

## 相关源文件

- `packages/shared/src/constants/gameplay/craft.ts` — 挖矿常量
- `packages/shared/src/constants/gameplay/terrain.ts` — 地形HP
- `packages/server/src/runtime/world/combat/tile-drop.helpers.ts` — 伤害与掉落
