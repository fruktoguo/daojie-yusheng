# 战斗流程

## 战斗管线（Pipeline）

源文件: `packages/server/src/runtime/combat/combat-pipeline-compose.ts`

### 完整战斗者链路（玩家/怪物目标）

```
破防 → 闪避 → 化解 → 暴击 → 五行加成 → 防御减伤 → 暴击乘区 → 境界差 → 额外乘区
```

### 地块链路（攻击地块/阵法）

```
五行加成 → 额外乘区
```

> 地块不吃境界压制、暴击、命中、破招、防御

## 技能施放流程

源文件: `packages/server/src/runtime/combat/player-combat.service.ts`

```
1. 校验施法者存活 → 目标存活
2. 射程校验（targeting.range 优先，兜底 skill.range）
3. 冷却校验（currentTick < readyTick 则拒绝）
4. 元气消耗（受 maxQiOutputPerTick 限制，超出部分递增惩罚）
5. 设置冷却（含冷却速度加成）
6. 逐效果结算（damage / heal / buff）
```

## 出手力度

源文件:
- `packages/shared/src/automation-types.ts`
- `packages/server/src/runtime/combat/player-combat.service.ts`
- `packages/server/src/runtime/world/combat/world-runtime-basic-attack.service.ts`

玩家可在行动栏「开关」页选择出手力度：1 成、3 成、7 成、10 成、12 成。默认 10 成，保持原有伤害与灵力消耗。

| 档位 | 伤害倍率 | 技能实际灵力消耗 |
|------|----------|------------------|
| 1 成 | 10% | 标准公式结算后降低 50% |
| 3 成 | 30% | 标准公式 |
| 7 成 | 70% | 标准公式 |
| 10 成 | 100% | 标准公式 |
| 12 成 | 120% | 标准公式结算后翻倍 |

灵力修正只影响服务端实际扣费，不改变技能面板显示的标准消耗。

## 吟唱系统（Pending Cast）

源文件: `packages/server/src/runtime/combat/pending-combat-cast.helpers.ts`

- 状态: casting → resolving → cancelled
- 取消条件: 施法者死亡 / 超时过期 / 配置版本不匹配
- 怪物技能有 windupTicks（前摇），期间显示预警区域
- 资源策略: committed_no_refund（不退还）
- 冷却策略: committed_no_rollback（不回滚）

## 战斗事件环（Event Ring）

源文件: `packages/server/src/runtime/combat/combat-runtime-event-ring.helpers.ts`

- 环形缓冲区，默认容量 200 条
- 超出容量时 splice 原地裁剪最旧记录
- 查询时从尾部取最近 N 条（默认 50）
- 上限硬编码 1000 防止滥用

## 自动战斗

源文件: `packages/server/src/runtime/world/combat/world-runtime-auto-combat.service.ts`

### 触发条件

- `player.combat.autoBattle === true` 或 `player.combat.autoRetaliate === true`
- 玩家 HP > 0
- 无 pending command / 无导航意图 / 无 pendingSkillCast
- 有战斗行动预算: `combatActionsUsedThisTick < actionsPerTurn`

### 行动预算

```typescript
actionsPerTurn = max(1, trunc(player.attrs.numericStats.actionsPerTurn))
hasBudget = combatActionsUsedThisTick < actionsPerTurn
```

### 目标选择评分

```typescript
score = threatValue
      × resolveThreatDistanceMultiplier(distance)
      × getAutoTargetingPreferenceMultiplier(mode, candidate, metrics)
```

目标偏好模式:
- `nearest`: 最近目标 ×5
- `low_hp`: 最低血量 ×5
- `full_hp`: 最高血量 ×5
- `boss`: demon_king 级怪物 ×5
- `player`: 玩家目标 ×5

不可达目标仇恨 ×0.2 衰减

## 战斗结果落地适配器

源文件: `packages/server/src/runtime/combat/combat-outcome-apply-adapters.ts`

支持 5 种目标类型:
1. **Player** — 反击目标 → 伤害 → buff → 活动记录 → 自动反击 → 击败
2. **Monster** — 伤害 → buff → 击杀（掉落、经验）
3. **Tile** — 地块伤害 → 摧毁后宗门扩展
4. **Formation** — 阵法本体/边界屏障伤害
5. **Container** — 容器伤害 → 消耗/耗尽 → 重生倒计时
