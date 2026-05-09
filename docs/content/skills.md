# 技能配置指南

## 概述

技能是功法的组成部分，玩家通过修炼功法解锁技能，在战斗中使用。

## 配置文件位置

- 服务端: `packages/server/data/content/techniques/{境界}/{类型}/{品阶}.json`
- 共享类型: `packages/shared/src/skill-types.ts`, `packages/shared/src/technique.ts`

## 目录结构

```
techniques/
├── 凡人期/
│   ├── 术法/
│   │   └── 凡阶.json
│   └── 功法/
│       └── ...
├── 练气期/
│   └── ...
└── ...
```

## 功法字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识 |
| `name` | string | 是 | 功法名称 |
| `desc` | string | 是 | 功法描述 |
| `grade` | string | 是 | 品阶：`mortal` / `yellow` / `black` / `earth` / `heaven` |
| `category` | string | 是 | 类型：`arts`（术法）/ `cultivation`（功法） |
| `realmLv` | number | 是 | 所需境界等级 |
| `layers` | array | 是 | 层数配置 |
| `skills` | array | 是 | 包含的技能列表 |

## 层数配置

```json
{
  "layers": [
    { "level": 1, "expFactor": 13 },
    { "level": 2, "expFactor": 14 },
    { "level": 3, "expFactor": 16 }
  ]
}
```

- `level`: 层数
- `expFactor`: 经验系数，影响升级所需经验

## 技能字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 技能 ID，格式 `skill.xxx` |
| `name` | string | 是 | 技能名称 |
| `desc` | string | 是 | 技能描述 |
| `cooldown` | number | 是 | 冷却时间（tick） |
| `costMultiplier` | number | 是 | 气机消耗倍率 |
| `range` | number | 是 | 施法距离 |
| `unlockLevel` | number | 是 | 解锁所需功法层数 |
| `effects` | array | 是 | 技能效果列表 |

## 技能效果

### 伤害效果

```json
{
  "type": "damage",
  "damageKind": "physical",
  "formula": {
    "op": "mul",
    "args": [
      { "var": "caster.stat.physAtk", "scale": 1 },
      { "op": "add", "args": [1, { "var": "caster.realmLv", "scale": 0.5 }] }
    ]
  }
}
```

- `damageKind`: `physical` / `spell`
- `formula`: 伤害公式，支持变量和运算

### 治疗效果

```json
{
  "type": "heal",
  "formula": {
    "var": "caster.stat.maxHp",
    "scale": 0.1
  }
}
```

### Buff 效果

```json
{
  "type": "buff",
  "buffId": "buff.attack_up",
  "duration": 10
}
```

## 公式变量

| 变量 | 说明 |
|------|------|
| `caster.stat.physAtk` | 施法者物理攻击 |
| `caster.stat.spellAtk` | 施法者法术攻击 |
| `caster.stat.maxHp` | 施法者最大生命 |
| `caster.stat.maxQi` | 施法者最大气机 |
| `caster.realmLv` | 施法者境界等级 |
| `target.stat.physDef` | 目标物理防御 |
| `target.stat.spellDef` | 目标法术防御 |

## 公式运算

| 运算 | 说明 | 示例 |
|------|------|------|
| `add` | 加法 | `{ "op": "add", "args": [1, 2] }` |
| `mul` | 乘法 | `{ "op": "mul", "args": [a, b] }` |
| `sub` | 减法 | `{ "op": "sub", "args": [a, b] }` |
| `div` | 除法 | `{ "op": "div", "args": [a, b] }` |
| `max` | 取大 | `{ "op": "max", "args": [a, b] }` |
| `min` | 取小 | `{ "op": "min", "args": [a, b] }` |

## 完整示例

```json
{
  "id": "qingmu_sword",
  "name": "青木剑诀",
  "desc": "青木剑气凝作一线，专取单体破敌。",
  "grade": "mortal",
  "category": "arts",
  "realmLv": 1,
  "layers": [
    { "level": 1, "expFactor": 13 },
    { "level": 2, "expFactor": 14 },
    { "level": 3, "expFactor": 16 },
    { "level": 4, "expFactor": 18 },
    { "level": 5, "expFactor": 21 }
  ],
  "skills": [
    {
      "id": "skill.qingmu_slash",
      "name": "青木斩",
      "desc": "凝聚青木剑气斩向敌人，造成物理伤害。",
      "cooldown": 5,
      "costMultiplier": 1,
      "range": 1,
      "unlockLevel": 1,
      "effects": [
        {
          "type": "damage",
          "damageKind": "physical",
          "formula": {
            "op": "mul",
            "args": [
              { "var": "caster.stat.physAtk", "scale": 1.2 },
              { "op": "add", "args": [1, { "var": "caster.techniqueLevel", "scale": 0.1 }] }
            ]
          }
        }
      ]
    }
  ]
}
```

## 添加步骤

1. 确定功法所属境界和类型
2. 在对应目录的 JSON 文件中添加功法配置
3. 配置层数和技能
4. 设计技能效果公式
5. 运行验证

## 验证方式

```bash
# 构建服务端
pnpm build:server

# 检查技能加载
pnpm --filter @mud/server start:dev
```

## 常见问题

### Q: 技能伤害异常？

检查：
- `formula` 公式是否正确
- 变量名是否拼写正确
- `scale` 系数是否合理

### Q: 技能不解锁？

检查：
- `unlockLevel` 是否正确
- 玩家功法层数是否达到要求
- `realmLv` 境界要求是否满足

## 相关内容

- [功法加成设计](../design/systems/功法加成设计.md)
- [战斗链路](../chains/战斗链路.md)
