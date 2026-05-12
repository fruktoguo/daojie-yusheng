# 怪物配置指南

## 概述

怪物是游戏中的敌对 NPC，分布在各地图中，玩家可以与之战斗获取经验和掉落物品。

## 配置文件位置

- 服务端: `packages/server/data/content/monsters/{地图名}.json`
- 共享类型: `packages/shared/src/monster.ts`

## 字段说明

### 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，建议格式 `m_{地图}_{名称}` |
| `name` | string | 是 | 显示名称 |
| `char` | string | 是 | 地图上显示的单字符 |
| `color` | string | 是 | 字符颜色（十六进制） |
| `level` | number | 是 | 怪物等级 |
| `grade` | string | 是 | 品阶：`mortal` / `yellow` / `mystic` / `earth` / `heaven` / `spirit` / `saint` / `emperor` |
| `tier` | string | 是 | 层级：`mortal_blood` 普通、`variant` 精英、`demon_king` Boss |

### 刷新配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `count` | number | 是 | 同时存在的最大数量 |
| `radius` | number | 是 | 刷新半径（格子数） |
| `respawnSec` | number | 是 | 重生时间（秒） |

### 战斗属性

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `attrTendency` | object | 是 | 六维属性倾向（百分比） |
| `statTendency` | object | 是 | 战斗属性倾向（百分比） |
| `equipment` | object | 否 | 装备配置 |
| `skills` | string[] | 否 | 技能 ID 列表 |

### 掉落配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `drops` | array | 否 | 掉落物品列表 |

## 属性倾向说明

`attrTendency` 六维属性：
- `constitution`: 体质 — 影响生命值
- `spirit`: 神识 — 影响法术
- `perception`: 悟性 — 影响暴击
- `talent`: 根骨 — 影响气机恢复
- `strength`: 力量 — 影响物理攻击
- `meridians`: 经脉 — 影响气机上限

`statTendency` 战斗属性：
- `maxHp`: 生命上限
- `maxQi`: 气机上限
- `maxQiOutputPerTick`: 灵力输出
- `physAtk`: 物理攻击
- `spellAtk`: 法术攻击
- `physDef`: 物理防御
- `spellDef`: 法术防御
- `hit`: 命中
- `dodge`: 闪避
- `crit`: 暴击
- `antiCrit`: 免爆
- `breakPower`: 破招
- `resolvePower`: 化解
- `moveSpeed`: 移动速度

数值为百分比，100 为基准值，大于 100 表示高于基准；未写的单项按 100 处理。

当前实际公式详见 [怪物当前属性计算总览](../design/balance/怪物当前属性计算总览.md)。长期配置应优先写 `attrTendency/statTendency`，不要新增固定 `attrs`、`valueStats` 或 `stats` 作为怪物基础数值；这些字段仅作为旧配置兼容口径存在。

## 主要战斗属性后处理

怪物基础数值算完后，会额外按等级增幅主要战斗属性：

```text
maxHp, maxQi, maxQiOutputPerTick,
physAtk, spellAtk, physDef, spellDef,
hit, dodge, crit, antiCrit, breakPower, resolvePower
```

1 级增幅 `0%`，18 级增幅 `20%`，30 级增幅 `100%`，30 级后每级继续增加 `5%`，并且每 12 级额外增加 `40%`。这个规则由共享公式统一执行，不需要在怪物 JSON 中手动补。

`initialBuffs`、技能 Buff 和消耗品 Buff 可以使用 `mainCombatStatsPercent` 作为百分比简写，内容加载期会展开到上述主要战斗属性。例如唤灵真人的重伤 debuff：

```json
{
  "buffId": "buff.huanling_zhenren_wounded",
  "name": "重伤",
  "category": "debuff",
  "duration": 999999,
  "infiniteDuration": true,
  "mainCombatStatsPercent": -4444,
  "statMode": "percent"
}
```

`mainCombatStatsPercent` 不影响暴伤、回血、回灵、速度、视野；`statMode` 为 `flat` 时不会展开该简写。

## 示例

```json
{
  "id": "m_town_rat_south",
  "name": "南沟灰尾鼠",
  "char": "鼠",
  "color": "#9b9b9b",
  "radius": 5,
  "respawnSec": 10,
  "level": 1,
  "grade": "mortal",
  "tier": "mortal_blood",
  "count": 5,
  "drops": [
    {
      "itemId": "rat_tail",
      "name": "鼠尾",
      "type": "material",
      "count": 1
    }
  ],
  "equipment": {
    "head": "equip.gate_headcloth",
    "legs": "equip.trench_runner_boots"
  },
  "skills": [
    "skill.predator_pounce"
  ],
  "attrTendency": {
    "constitution": 72,
    "spirit": 36,
    "perception": 145,
    "talent": 58,
    "strength": 145,
    "meridians": 144
  },
  "statTendency": {
    "maxQi": 37,
    "physAtk": 94,
    "spellAtk": 23,
    "physDef": 63,
    "spellDef": 49,
    "dodge": 117,
    "crit": 97,
    "breakPower": 80,
    "resolvePower": 57,
    "maxQiOutputPerTick": 40,
    "moveSpeed": 443
  }
}
```

## 添加步骤

1. 确定怪物所属地图
2. 在对应地图的 JSON 文件中添加怪物配置
3. 如果是新地图，创建新的 JSON 文件
4. 运行验证确保配置正确

## 验证方式

```bash
# 构建服务端（会校验配置）
pnpm build:server

# 启动服务端检查加载
pnpm --filter @mud/server start:dev
```

## 常见问题

### Q: 怪物不刷新？

检查：
- `count` 是否大于 0
- `respawnSec` 是否合理
- 地图是否正确加载该怪物配置

### Q: 怪物属性异常？

检查：
- `attrTendency` 和 `statTendency` 数值是否合理
- `level` 和 `tier` 是否匹配

## 相关内容

- [物品配置指南](items.md)
- [技能配置指南](skills.md)
- [数值设计](../design/balance/)
