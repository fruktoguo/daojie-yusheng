# 技能/功法配置

配置位置：`packages/server/data/content/techniques/{境界}/{类型}/{品阶}.json`  
类型定义：`packages/shared/src/skill-types.ts`、`packages/shared/src/technique.ts`

## 目录结构

```
techniques/
├── 凡人期/
│   ├── 术法/
│   │   └── 凡阶.json
│   └── 功法/
├── 练气期/
└── ...
```

## 功法关键字段

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识 |
| `grade` | 品阶：mortal / yellow / black / earth / heaven |
| `category` | 类型：`arts`（术法）/ `cultivation`（功法） |
| `realmLv` | 所需境界等级 |
| `layers` | 层数配置，每层有 `level` 和 `expFactor`（经验系数） |
| `skills` | 包含的技能列表 |

## 技能关键字段

| 字段 | 说明 |
|------|------|
| `id` | 格式 `skill.xxx` |
| `cooldown` | 冷却时间（tick） |
| `costMultiplier` | 气机消耗倍率 |
| `range` | 施法距离 |
| `unlockLevel` | 解锁所需功法层数 |
| `effects` | 技能效果列表 |

## 技能效果类型

### 伤害

```json
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
```

### 治疗

```json
{ "type": "heal", "formula": { "var": "caster.stat.maxHp", "scale": 0.1 } }
```

### Buff

```json
{ "type": "buff", "buffId": "buff.attack_up", "duration": 10 }
```

## 公式变量

| 变量 | 说明 |
|------|------|
| `caster.stat.physAtk` | 施法者物理攻击 |
| `caster.stat.spellAtk` | 施法者法术攻击 |
| `caster.stat.maxHp` | 施法者最大生命 |
| `caster.stat.maxQi` | 施法者最大气机 |
| `caster.realmLv` | 施法者境界等级 |
| `caster.techniqueLevel` | 施法者功法层数 |
| `target.stat.physDef` | 目标物理防御 |
| `target.stat.spellDef` | 目标法术防御 |

## 公式运算符

`add`、`sub`、`mul`、`div`、`max`、`min`

## 常见问题

- **技能伤害异常**：检查 formula 公式、变量名拼写、scale 系数
- **技能不解锁**：检查 `unlockLevel`、玩家功法层数、`realmLv` 境界要求

## 相关

- [功法加成设计](../design/systems/功法加成设计.md)
- [战斗链路](../chains/战斗链路.md)
