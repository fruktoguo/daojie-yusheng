# 阵法系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/formation.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| FORMATION_AURA_PER_SPIRIT_STONE | 100 | 每灵石灵气值 |
| FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE | 100 | 每灵石灵力消耗 |
| FORMATION_DEFAULT_DURATION_HOURS | 24 | 默认持续时间（小时） |
| FORMATION_DEFAULT_GROWTH_COST_RATIO | 1.5 | 成长消耗比 |
| FORMATION_DEFAULT_EFFECT_COST_RATIO | 100 | 效果消耗比 |
| FORMATION_TICKS_PER_DAY | 86400 | 每天 tick 数 |
| FORMATION_DEFAULT_DAMAGE_PER_AURA | 100 | 每灵气伤害值 |
| FORMATION_QI_HALF_LIFE_TICKS | 259200 | 阵法灵力半衰期（三天） |
| FORMATION_SKILL_STRENGTH_BONUS_PER_LEVEL | 0.05 | 阵法技艺每级强度增幅 |

## 阵盘品阶倍率

源文件: `packages/shared/src/formation-types.ts`

| 品阶 | 倍率 | 标签 |
|------|------|------|
| mortal | 1 | 凡品 |
| yellow | 2 | 黄阶 |
| mystic | 4 | 玄阶 |
| earth | 8 | 地阶 |

## 阵法资源

阵法运行态拆分为两个资源池：

- 灵力池：维持阵法效果、承受攻击、阵法维护补充的资源。
- 灵石池：维持阵法存在的资源，只被运行持续消耗和补充操作影响，不会因受击减少。

每 tick 运行时同时结算灵力池和灵石池。灵力池统一按三天半衰期衰减；灵石池按每日固定成本扣除。灵力不足时阵法关闭但不摧毁；灵石不足时阵法损毁并从运行态移除。阵法被攻击时只扣灵力池。阵法维护只补充灵力池。

- 地图实体以 `hp/maxHp` 显示阵法当前灵力耐久与基准耐久；补给超过基准预算时血条按满值显示，实际超额灵力仍由服务端保留和结算。
- 对当前玩家形成阻挡且可见的边界格可以直接点击发起接战；服务端按地块目标锁定、寻路到边界外相邻格并结算对阵眼灵力池的伤害。

## 基础强度与效果

```typescript
skillStrengthMultiplier = 1.05 ^ 阵法技艺等级
actualStrength = floor(baseStrength × diskMultiplier × skillStrengthMultiplier)
```

- 聚灵阵: `targetAura = actualStrength × 100`
- 固脉阵: `damageReduction = actualStrength / (actualStrength + 1000)`，约 10 强度降低 1% 地块受击伤害；范围内受损地块额外每息恢复 `maxHp × 1%`
- 太玄封界阵: `damageReduction = actualStrength / (actualStrength + 1000)`，约 10 强度降低 1% 边界受击损耗
- 护宗大阵: `damageReduction = actualStrength / (actualStrength + 100)`，约 1 强度降低 1% 边界受击损耗

所有屏障阵法仍按 `100` 减伤后伤害扣 `1` 点阵法灵力。

## 灵力/灵石预算计算（分配模式）

```typescript
baseAuraBudget = spiritStoneCount × 100
totalAuraBudget = round(baseAuraBudget × diskMultiplier)
totalQiBudget = totalAuraBudget
totalSpiritStoneBudget = spiritStoneCount
effectAura = floor(totalAuraBudget × effectPercent / 100)
baseEffectAura = floor(baseAuraBudget × effectPercent / 100)
rangeAura = floor(totalAuraBudget × rangePercent / 100)
skillStrengthMultiplier = 1.05 ^ 阵法技艺等级
effectValue = floor(effectAura × conversionRatio × skillStrengthMultiplier)
durationScale = max(0.01, durationPercent / 33.33)
dailyQiDecayEstimate = totalQiBudget × (1 - 0.5^(86400 / 259200))
dailySpiritStoneCost = baseEffectAura / durationScale
tickQiCost = currentQiBudget × (1 - 0.5^(1 / 259200))
tickSpiritStoneCost = dailySpiritStoneCost / 86400
```

默认三等分: effectPercent=rangePercent=durationPercent=33.33%

## 半径计算（geometric_radius）

```typescript
rawSteps = log(rangeAura / baseAura) / log(ratioPerStep)
steps = max(0, floor(rawSteps / stepDivisor))
radius = max(minRadius, trunc(baseRadius + steps))
```

## Setup 模式成本计算

```typescript
rangeMultiplier = rangeCostRatio ^ (radius - defaultRadius)
durationMultiplier = 短时间用指数插值, 长时间用线性
actualStrength = baseStrength × diskMultiplier × (1.05 ^ 阵法技艺等级)
effectValue = floor(actualStrength × conversionRatio)
requiredAuraBudget = ceil(baseStrength × effectCostRatio × rangeMultiplier × durationMultiplier)
dailySpiritStoneCost = requiredAuraBudget
spiritStoneCount = ceil(dailySpiritStoneCost × durationTicks / 86400)
qiCost = ceil(spiritStoneCount × qiPerSpiritStone)
totalQiBudget = requiredAuraBudget
totalSpiritStoneBudget = spiritStoneCount
tickQiCost = currentQiBudget × (1 - 0.5^(1 / 259200))
tickSpiritStoneCost = dailySpiritStoneCost / 86400
```

Setup 模式中，输入框显示为“基础强度”，协议字段仍沿用 `effectValue`。实际效果再吃阵盘倍率和阵法技艺等级增幅；灵石消耗、布阵灵力消耗和每日灵石衰减只按基础强度、范围、持续时间计算，不随阵盘品阶或阵法技艺等级提升。预览中的消耗按每日灵力半衰期估算和每日灵石固定衰减展示。

## 内置阵法模板

| ID | 名称 | 效果类型 | 最低灵石 | minEffectValue |
|----|------|----------|----------|----------------|
| spirit_gathering | 聚灵阵 | tile_aura_source | 100 | 1 |
| earth_stabilizing | 固脉阵 | terrain_stabilizer | 1000 | 1 |
| warding_barrier | 太玄封界阵 | boundary_barrier | 100 | 1 |
| demon_sealing | 封魔阵 | monster_suppression | 100 | 1 |
| sky_veil | 遮天阵 | vision_suppression | 100 | 1 |
| sect_guardian_barrier | 护宗大阵 | boundary_barrier | 1 | 1 |

## 阵法激活条件

- 需要足够灵石投入
- 需要满足 minEffectValue
- 需要阵盘品阶匹配
- 普通阵盘布阵会按阵法实际影响范围逐格校验保护点位；范围内不能与传送点、场景人物或安全区重叠。
- 服务器启动恢复阵法时也会执行同一保护点位自检；违规的普通阵盘阵法会直接从运行态和持久态清理，宗门护宗阵只记录告警，暂不自动清理。
- 每 tick 按三天半衰期衰减灵力池，并按每日固定成本消耗灵石池
- 玩家从背包布阵时，阵盘目标必须使用 `itemInstanceId` 定位；背包格子顺序只影响 UI 展示。
- 背包阵盘交互遵循统一物品规则：左键打开详情并保留丢下、销毁入口，右键或详情中的主操作按钮才打开布阵页面；不得让左右键都跳过详情。
- 布阵会把阵盘、灵石、玩家灵力、阵法后态、恢复水位、outbox 与资产审计放入同一 Durable Operation；事务提交前不得暴露阵法或扣除运行态资产。
- 布阵事务必须同时校验玩家 `runtime_owner_id + session_epoch`、目标实例 `assigned_node_id + ownership_epoch + 未过期 lease`，并确认阵法实例 ID 尚不存在；任一围栏冲突时全部拒绝。

## 阵法维护

- 玩家站在阵眼/控制点位一格内（以控制点为中心的 3x3 范围）时，可以开始“阵法维护”。
- 阵法维护走统一技艺活动队列，使用 `formationJob` 记录运行态，并进入统一技艺任务列表。
- 每息消耗玩家当前灵力的数值为自身 `maxQiOutputPerTick` 向下取整，最低 1 点。
- 实际注入阵法灵力池的数值为本次消耗灵力 × 阵法技艺等级；例如阵法技艺 61 级时，每息注入量为自身灵力输出 × 61。
- 每息按统一技艺经验公式获得 1 息“阵法”技艺经验。
- 每息维护属于玩家灵力向阵法灵力池的资产转换。运行态逐息同步扣除玩家灵力、增加阵法灵力、结算阵法技艺经验并推进 job；持久化层默认按 10 秒检查点窗口合并这些变化，只用一笔 Durable Operation 同时提交玩家 `vitals`、阵法技艺 `profession`、`active_job` 与 `instance_formation_state`。
- 检查点窗口内，上述三个玩家持久化域由阵法维护协调器持有，普通 direct flush 与 flush ledger 都不得提前接管；阵法单体/实例普通快照也不得越过待提交检查点。进程崩溃时玩家与阵法统一回退到上一个已提交检查点，不允许只落下一侧。
- 检查点提交必须同时校验玩家 session、实例 node/token/epoch/expiry、起始 job version 与阵法起始 `updatedAt`。窗口到期、维护条件失效、灵力耗尽、取消、再次启动阵法维护、手动玩家刷盘、断线/迁移、阵法补充或注入、停服时必须先强制提交；提交失败保留同一幂等检查点并停止继续扩张未落盘窗口。
- 从挖矿、采集等其他技艺切换到阵法维护时，首个阵法资产 tick 必须先在同一玩家资产锁内把新的 `active_job` 刷入真源；若旧任务尚未收敛则本息失败关闭并保留重试，禁止放宽 `jobRunId + jobVersion` CAS 覆盖旧任务。
- 离开阵法控制点位一格范围时，按条件型技艺规则休眠或取消，并释放占用。
- 攻击、移动、手动开始修炼等触发的恢复等待必须显示为独立等待条，不改变维护 job 的实际工作进度。
- 玩家持续注入灵力、可等待、可打断、可取消的“阵法补充灵力”必须纳入 `formation` job，并在技艺任务列表中可见、可取消。
- 一次性把资源转入阵法池的补给按钮只属于资源管理命令，不显示为持续 job，不获得阵法技艺经验，也不参与打断等待。
- 普通阵法补给和护宗大阵的一次性注入同样通过 Durable Operation 原子提交玩家 `inventory / wallet / vitals` 与 `instance_formation_state`；更新必须基于当前阵法 `updatedAt`，不得用旧资源池后态覆盖较新的 tick 或管理操作。
- 生产数据库已配置但 Durable Operation 不可用时，布阵与补给失败关闭；只有明确的 `test / verify / smoke / development` 环境允许无数据库运行态 fallback。
- 阵法的单体保存、实例批量保存、删除和宗门跨域阵法写入，都必须在同一数据库事务内校验 `instance_catalog` 的 `assigned_node_id / lease_token / ownership_epoch / lease_expire_at`；lease handoff 后旧节点即使持有更大的 `updatedAt` 也不得覆盖或删除新节点真源。
- 宗门护宗阵同时跨越山门承载实例与宗门阵眼实例时，创建、迁移、转让和解散事务必须携带所有受影响实例的 lease fence；迁移还必须包含原山门实例，禁止只验证新位置后跨实例删除旧阵法行。

## 阵法效果

- tile_aura_source: 向地块注入灵气
  - 每息注入量按 `(目标灵气 - 当前灵气) / convergenceHalfLifeTicks` 计算，地块灵气以 double 保存。
- terrain_stabilizer: 稳定地形，防止破坏
  - 被摧毁的系统地块在固脉范围内暂停复生倒计时，离开固脉影响后按原倒计时继续复生。
  - 技能创建的临时地块在固脉范围内暂停自然消散，离开固脉影响后继续按过期时间消散。
  - 范围内受损但未摧毁的系统地块额外每息恢复 `maxHp × 1%`；系统地块本身已有 `1%/息` 自然恢复，因此受固脉影响时合计为 `2%/息`。
  - 范围内受损但未摧毁的玩家建筑地块、技能临时地块每息恢复 `maxHp × 1%`；这两类地块没有普通自然回血，只吃固脉提供的这一份。
  - 固脉回血只按是否处于任一激活固脉范围判断，不随固脉强度提高，不因多个固脉重叠叠加。
- boundary_barrier: 边界屏障，阻挡进入
- monster_suppression: 封魔压制
  - 范围内所有妖兽按最高封魔阵强度获得“压制”层数，每点强度增加 1 层。
  - 每层对妖兽主要战斗属性提供 `-1%` 负向百分比修正，按共享 `percentModifierToMultiplier` 反比衰减结算；例如 200 层为 `1 / (1 + 200 / 100) = 1/3` 剩余属性。
  - 多个封魔阵重叠只取最高层，不叠加。
  - 击杀经验按同一实际剩余乘区结算；200 层压制时经验乘区为 `1/3`，即实际降低约 `66.6%`。
- vision_suppression: 视野压制
  - 范围内玩家按最高遮天阵强度降低视野，每点强度提供 `-10%` 视野修正。
  - 视野修正同样按共享负向百分比反比衰减，最终视野半径最低为 1。
  - 多个遮天阵重叠只取最高修正，不叠加。
