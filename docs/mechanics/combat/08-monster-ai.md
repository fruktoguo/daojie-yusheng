# 怪物 AI 与行为

## 怪物行动决策（每 tick）

源文件: `packages/server/src/runtime/instance/map-instance-monster-advancer.ts`

空实例（当前实例内无玩家）仍按 1Hz 推进逻辑时间，但怪物主动 AI 会休眠：

- 保留死亡怪物 `respawnLeft--` 和复活。
- 保留存活怪物 buff tick、派生属性重算、HP/QI 恢复。
- 清理过期追击/仇恨状态。
- 取消残留怪物吟唱，避免玩家回图后继承离图前的延迟攻击。
- 跳过主动寻敌、丢失视野追击、回出生点、闲逛、技能释放、普攻和追击移动。

```
1. 死亡怪物: 倒计时 respawnLeft--，到 0 时复活
2. 存活怪物:
   a. tick buff → 重算派生状态
   b. 恢复 HP/QI
   c. 处理吟唱中的技能（取消/倒计时/释放）
   d. 解析目标（resolveMonsterTarget）
   e. 无目标:
      - 有丢失视野追击记忆 → 朝最后位置移动（3 tick 窗口）
      - 超出活动范围 → 回出生点
      - 在范围内 → 35% 概率随机闲逛
   f. 有目标:
      - 选择技能（chooseMonsterSkill）
      - 有技能且可释放 → 释放/吟唱
      - 无技能但在攻击范围内且冷却就绪 → 普攻
      - 否则 → 朝目标移动
```

## 目标解析规则

```
1. 无锁定目标时: 快速检查 aggroRange 内是否有玩家（切比雪夫距离）
2. 有锁定目标: 验证目标仍在视野内 + leashRange 内
3. 目标丢失/超出 leashRange → 清除追击
4. 搜索新目标: 视野内最近的玩家（需在 leashRange 内）
```

## 丢失视野追击

```
MONSTER_LOST_SIGHT_CHASE_TICKS = 3
条件: tick ≤ lastSeenTargetTick + 3 且目标仍在 leashRange 内
行为: 朝 lastSeenTarget 位置移动
```

## 怪物技能选择

```typescript
chooseMonsterSkill(monster, target, distance, currentTick):
  遍历 monster.skills
  过滤: canMonsterCastSkill（射程、冷却、元气）
  选择: 射程最大的技能（同射程取 id 字典序最小）
```

## 怪物普攻伤害

```typescript
buildMonsterAttackDamage(monster):
  attack = max(physAtk, spellAtk)
  return max(1, round(attack))
```

## 怪物 HP/QI 恢复

```typescript
HP恢复 = max(1, round(hpRegenRate))  // 每 tick
QI恢复 = max(1, round(qiRegenRate))  // 每 tick
```

## 怪物移动

- 使用切比雪夫距离
- 优先沿主轴方向移动（距离差大的轴优先）
- 检查目标格是否可占用（无玩家、无怪物、可行走）

## 怪物属性比例化

源文件: `packages/shared/src/constants/gameplay/monster.ts`, `packages/shared/src/monster.ts`

### 品阶倍率（Grade）

```typescript
createGradePercentProfile(rank) = 100 + rank × 10
```

| 品阶 | rank | 全属性百分比 |
|------|------|-------------|
| mortal | 0 | 100% |
| yellow | 1 | 110% |
| mystic | 2 | 120% |
| earth | 3 | 130% |
| heaven | 4 | 140% |
| spirit | 5 | 150% |
| saint | 6 | 160% |
| emperor | 7 | 170% |

### 血脉层次倍率（Tier）

| 层次 | 全属性 | maxHp |
|------|--------|-------|
| mortal_blood | 100% | 100% |
| variant | 120% | 360% |
| demon_king | 140% | 1400% |

### 全局调节层

```
所有妖兽共享:
  hpRegenRate = 25%（压制）
  dodge = 25%（压制）
  antiCrit = 25%（压制）
  其余 = 100%
```

### 指数成长公式

```typescript
getRealmAttributeMultiplier(lv) = (1 + 0.1)^(lv - 1)
```

适用: maxHp, maxQi, physAtk, spellAtk, physDef, spellDef, hit, dodge, crit, antiCrit, breakPower, resolvePower, maxQiOutputPerTick, qiRegenRate, hpRegenRate, cooldownSpeed, moveSpeed, extraAggroRate, viewRange

`critDamage = 0` 表示基础暴击伤害为 200%；怪物默认倾向、等级、品阶和血脉倍率不额外生成暴伤。

## 怪物经验等价

源文件: `packages/server/src/runtime/combat/monster-combat-exp-equivalent.helper.ts`

### 战斗经验等价值

```typescript
resolveMonsterCombatExpEquivalentFallback(monster):
  level → 查 realmCombatExpByLevel 表
  × resolveMonsterCombatExpTierFactor(tier)
    demon_king: 4×
    variant: 2×
    其他: 1×

getMonsterCombatExpGradeFactor(gradeIndex):
  return 0.25 × 2^gradeIndex
```
