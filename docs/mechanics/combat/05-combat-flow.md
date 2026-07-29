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

### 高目标数施法

源文件:
- `packages/server/src/runtime/combat/player-combat.service.ts`
- `packages/server/src/runtime/instance/map-instance.runtime.ts`
- `packages/server/src/runtime/world/combat/world-runtime-player-skill-dispatch.service.ts`

- 单次施法先固定施法者战斗快照、功法等级、目标数和出手力度。
- 不读取 `target.*` 的伤害公式按 effect 缓存基础伤害；地块目标还缓存完整地块伤害管线结果。
- 高目标数地块技能在所有伤害公式均与目标无关时，只执行一次完整技能结算，后续地块直接复用去除施法者自效果后的结果；命中地块仍逐格校验、扣耐久、掷掉落和统计。
- 缓存按公式实际依赖比较 `attrs.revision`、`buffs.revision`、生命、元气、境界、功法等级和目标数。未依赖的字段变化不会误伤缓存。
- 公式读取任意 `target.*` 或未知变量时，保守回退为逐目标求值。
- 玩家和妖兽目标始终逐目标执行命中、暴击、防御、境界、仇恨、击败与奖励，不复用目标侧随机或减伤结果。
- 普通可破坏地形在目标收集、校验、派发和批量扣耐久之间沿用同一份权威地块快照，避免重复读取；重复坐标或特殊生命周期会重新读取并回退单格结算。
- 普通可破坏地形在同一施法中逐格校验、扣耐久和掷掉落，但批量提交脏坐标，整批只推进一次世界版本和持久化版本；挖矿经验保持逐目标顺序和升级语义，只合并公式求值、状态写回与境界经验落账。
- 建筑、临时地块、虚拟/宗门边界、房间拓扑和风水相关地块自动回退原单格生命周期。
- 同次批量地块掉落按原规则逐条计算产量，相同 `itemId` 合并入包并合并通知。

### 高目标数表现汇总

当一次包含伤害效果的技能计划目标数大于 8 时，权威结算仍覆盖每个有效目标，但表现层不再为每个目标发送攻击轨迹、伤害飘字和施法者战斗消息。纯治疗、纯 buff/debuff 技能保持原表现链路。

服务端只发送一个 `damage_summary` 战斗特效和一条结构化战斗通知，按敌对目标和地块分别携带:

- `targetCount`: 实际结算目标数
- `hitCount`: 受到正伤害的目标数
- `totalDamage`: 实际总伤害
- `defeatedCount` / `destroyedCount`: 击败或摧毁数量
- `uniformDamage`: 所有正伤害完全一致时的单目标伤害

客户端负责把结构化数据拼成汇总飘字和战斗记录。PvP 中每名被攻击玩家仍单独收到自己的受击消息；首次进入、跨图和断线重连继续依赖权威世界态，不依赖表现事件恢复状态。

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
- 玩家技能通过 `playerCast.windupTicks`、怪物技能通过 `monsterCast.windupTicks` 进入吟唱，期间显示预警区域
- 自创术法的负吟唱预算在生成冷路径展开为 `playerCast.windupTicks`，运行时不再读取权重草稿
- 资源策略: committed_no_refund（不退还）
- 冷却策略: committed_no_rollback（不回滚）

## 战斗事件环（Event Ring）

源文件: `packages/server/src/runtime/combat/combat-runtime-event-ring.helpers.ts`

- 环形缓冲区，默认容量 200 条
- 超出容量时 splice 原地裁剪最旧记录
- 查询时从尾部取最近 N 条（默认 50）
- 上限硬编码 1000 防止滥用

客户端见闻录中的战斗频道同样保持有界：高频战斗消息只保存在当前角色的客户端会话内，
不逐条写入 IndexedDB；同一角色切换地图或实例时保留这段会话记录，退出世界或切换角色时清空。
附近聊天仍按地图实例隔离，不能跟随战斗频道跨图复用。

离线挂机角色战败属于可靠系统提示，不按普通高频战斗表现处理。服务端在移出世界前把结构化战败提示加入玩家待确认日志域，并由离线战败清理任务完成刷盘后再回收运行态；客户端本地落盘成功后 ACK，确保断线、重连或进程重启不会吞掉该提示。

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
