# 怪物配置

配置位置：`packages/server/data/content/monsters/{地图名}.json`  
类型定义：`packages/shared/src/monster.ts`

## 基础字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 格式 `m_{地图}_{名称}` |
| `name` | string | 显示名称 |
| `char` | string | 地图显示字符（单字） |
| `color` | string | 字符颜色（十六进制） |
| `level` | number | 怪物等级 |
| `grade` | string | 品阶：mortal / yellow / mystic / earth / heaven / spirit / saint / emperor |
| `tier` | string | 层级：`mortal_blood`(普通) / `variant`(精英) / `demon_king`(Boss) |

## 刷新配置

| 字段 | 说明 |
|------|------|
| `count` | 同时存在最大数量 |
| `radius` | 刷新半径（格子数） |
| `respawnSec` | 重生时间（秒） |

## 属性倾向

数值为百分比，100 为基准值，未写的按 100 处理。

### attrTendency（六维）

| 键 | 含义 |
|----|------|
| constitution | 体质 → 生命值 |
| spirit | 神识 → 法术 |
| perception | 悟性 → 暴击 |
| talent | 根骨 → 气机恢复 |
| strength | 力量 → 物理攻击 |
| meridians | 经脉 → 气机上限 |

### statTendency（战斗属性）

maxHp, maxQi, maxQiOutputPerTick, physAtk, spellAtk, physDef, spellDef, hit, dodge, crit, antiCrit, breakPower, resolvePower, moveSpeed

## 等级增幅（自动计算）

怪物基础数值算完后，主要战斗属性按等级自动增幅：
- 1 级：0%
- 18 级：20%
- 30 级：100%
- 30 级后每级 +5%，每 12 级额外 +40%

此规则由共享公式执行，不需要在 JSON 中手动补。

## mainCombatStatsPercent 简写

Buff 可用 `mainCombatStatsPercent` 作为百分比简写，加载期展开到所有主要战斗属性（不含暴伤、回血、回灵、速度、视野）。`statMode` 为 `flat` 时不展开。

```json
{
  "buffId": "buff.huanling_zhenren_wounded",
  "mainCombatStatsPercent": -4444,
  "statMode": "percent"
}
```

## 掉落配置

```json
"drops": [
  { "itemId": "rat_tail", "name": "鼠尾", "type": "material", "count": 1 }
]
```

## 重要约束

- 长期配置应优先写 `attrTendency` / `statTendency`
- **不要**新增固定 `attrs`、`valueStats` 或 `stats` 作为怪物基础数值（仅旧配置兼容）
- 详细公式见 [怪物当前属性计算总览](../design/balance/怪物当前属性计算总览.md)

## 常见问题

- **怪物不刷新**：检查 `count > 0`、`respawnSec` 合理、地图是否加载该配置
- **属性异常**：检查 `attrTendency`/`statTendency` 数值、`level` 和 `tier` 是否匹配

## 相关

- [物品配置](items.md)
- [技能配置](skills.md)
- [数值设计](../design/balance/)
