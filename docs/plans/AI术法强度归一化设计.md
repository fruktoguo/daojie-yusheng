# AI 术法强度归一化设计

创建日期：2026-05-24

## 目标

将 AI 生成术法从“直接输出真实技能数值”改为“输出结构与强度权重”，由共享常量和展开函数统一生成正式 `SkillDef[]`。

目标状态：

- AI 不直接决定真实伤害倍率、治疗量、Buff 数值、冷却和消耗。
- 术法与内功保持同类模型：内功是 `attrRatio -> layers`，术法是 `artsStrength -> SkillDef[]`。
- 生成、预览、落库、启动恢复、学习、动作栏、技能 tooltip、战斗结算都使用同一份展开后的 `SkillDef[]`。
- 所有基础值、强度曲线、上下限、形状成本和预算公式集中在常量文件中，便于后续调整。

## 已确认共识

### 功法本体字段

术法功法本身需要确定：

- `name`：名称。
- `desc`：描述。
- `grade`：品阶。
- `realmLv`：境界等级。
- `maxLayer`：层数。
- `expDifficulty`：升级难度。

### 技能结构字段

技能需要确定：

- 消耗系数强度。
- 冷却强度。
- 目标类型，例如直线、范围、单体。
- 范围强度。
- 是否需要吟唱。
- 吟唱时间强度。

这些字段中，冷却、消耗、范围、吟唱不应由 AI 直接写真实最终数值，而是写强度。

### 技能数值公式

技能数值统一表达为：

```text
属性相关基础值加成 * (各种百分比加成)
```

其中百分比加成包括：

- 功法层数。
- 移速。

这些组成项也采用强度表达。未设定或留空时强度默认为 `0`。

### 总百分比加成

已确认方向：

- AI 术法首版移除基础伤害，不生成动态基础伤害项。
- 总百分比加成部分首版只允许吃功法层数和移速。
- 功法层数加成是技能自带项。
- `techLevelBonusStrength = 0` 时，默认每层增加 `10%` 总伤害。
- `moveSpeedBonusStrength = 1` 对应 `caster.stat.moveSpeed * 0.001`。

示例方向：

```text
finalDamage = attributeBase * (1 + techLevel * 0.1 + moveSpeedBonus)
```

### 固定值属性加成

固定值加成目前采用战斗属性集合：

- 生命。
- 灵力。
- 物攻。
- 法攻。
- 物防。
- 法防。
- 命中。
- 闪避。
- 暴击。
- 免爆。
- 破招。
- 化解。

固定值属性加成按“属性等价百分比”计入强度：

- 生命值：每 `100%` 加成消耗 `12` 点强度。
- 灵力：每 `100%` 加成消耗 `8` 点强度。
- 其他战斗属性：每 `100%` 加成消耗 `1` 点强度。

这些属性加成参与技能公式中的固定值部分：

```text
属性相关基础值加成
```

已确认：

- 技能公式沿用现有内置技能口径，按百分比引用运行时属性。
- 不需要按配置期参考属性折算。
- 玩家生命值高属于正常构筑收益，本质上和攻击力参与公式一致。
- 怪物技能不能吃生命值或灵力加成，避免怪物模板因资源量异常放大。
- 属性基底最低 `1` 个，最多 `5` 个。
- AI 术法首版只能生成 `1` 个技能。
- Buff 暂时不能加，也不参与乘区或效果预算。

### 强度默认值

- 大多数强度默认 `0`。
- `0` 表示采用系统基础值或无额外加成。
- 留空等价于 `0`。

消耗系数例外：实际基础消耗倍率默认仍是 `1`，但对应的 `costStrength = 0`。

### 消耗和冷却强度曲线

已讨论的方向：

- `costStrength = 0` 对应原始消耗倍率 `1`。
- 正强度降低消耗，例如 `2` 可能约等于 `0.9` 消耗倍率。
- 负强度提高消耗，例如 `-1` 可能约等于 `1.2` 消耗倍率。
- 每点正强度按指数减少消耗，暂定“每点减少 10%”。
- 每点负强度按指数提高消耗，暂定“每点提高 20%”。

冷却采用同类思路：

- `cooldownStrength = 0` 对应基础冷却，例如 `20` 息。
- 正强度减少冷却。
- 负强度增加冷却。

示例公式方向：

```ts
function efficiencyFactor(strength: number): number {
  if (strength >= 0) return 0.9 ** strength;
  return 1.2 ** (-strength);
}
```

### 结构预算乘数

结构强度也会影响最终数值预算。不能把强度值直接相乘，也不能先把不同结构强度简单求和，而是每个结构项先换算成预算乘数，再把乘数相乘。

已确认方向：

- `strength = 0` 时，预算乘数为 `1`。
- `strength = 1` 时，预算乘数为 `1.2`。
- `strength = -1` 时，预算乘数为 `0.9`。
- 正强度代表更强的结构收益，例如更短 CD、更低消耗、更大范围，因此消耗更多数值预算。
- 负强度代表结构代价，例如更长 CD、更高消耗，因此返还预算，最终数值预算降低得更少或可获得补偿。

示例公式方向：

```ts
function budgetMultiplier(strength: number): number {
  if (strength >= 0) return 1.2 ** strength;
  return 0.9 ** (-strength);
}
```

CD、消耗这类效率字段需要同时使用两条曲线：

```text
实际效率值 = 基础值 * efficiencyFactor(strength)
数值预算 = 基础预算 / budgetMultiplier(strength)
```

也就是说：

- `cooldownStrength = 1`：CD 变短，但留给伤害/Buff 的数值预算降低。
- `cooldownStrength = -1`：CD 变长，但留给伤害/Buff 的数值预算提高。
- `costStrength = 1`：消耗变低，但留给伤害/Buff 的数值预算降低。
- `costStrength = -1`：消耗变高，但留给伤害/Buff 的数值预算提高。

### 总预算与效果缩放

总预算由后端根据品阶、境界等级、随机结果和后续平衡常量动态决定，AI 不允许输出总预算。

已确认方向：

- AI 只输出结构强度和效果强度。
- 后端随机得到 `targetBudget`。
- 后端根据 AI 输出重算 `inputBudget`。
- 结构项不参与目标预算缩放。
- 只按比例缩放属性基底强度。
- 功法层数和移速乘区按强度定义保持原值，不随 `targetBudget` 放大。

预算计算方向：

```text
inputBudget = effectStrength * structureBudgetMultiplier
scale = targetBudget / inputBudget
scaledAttributeBaseStrength = rawAttributeBaseStrength * scale
```

例如：

```text
attributeBases.physAtk = 4
structureBudgetMultiplier = 0.6199
inputBudget = 4 * 0.6199 = 2.48

targetBudget = 3
scale = 3 / 2.48 = 1.2097
scaled physAtk = 4 * 1.2097 = 4.84
```

展开结果约为：

```text
physAtk * 484% * (1 + techLevel * 10%)
```

不参与缩放的结构项：

- 目标类型。
- 覆盖范围。
- 施法距离。
- 消耗。
- 冷却。
- 吟唱。

这些结构项先由 AI 选择并由服务端夹范围，再通过结构预算乘数影响效果预算，但不会因为 `targetBudget` 更高而自动变大。

强度缩放后的数值建议保留小数，例如保留 `2` 位；最终战斗伤害按现有结算流程取整。

如果 `inputBudget <= 0`，后端应拒绝该候选或 fallback 到默认合法效果强度。

### 范围类型量化

范围类型不应按固定枚举成本写死，而应尽量量化为覆盖格数强度。

已确认方向：

- `single` 单体可视为 `areaStrength = 0`。
- 范围类技能按覆盖格数折算强度。
- 近似公式：`areaStrength = ceil(coveredCells / 3)`。
- `box 3x3` 覆盖 9 格，可视为 `ceil(9 / 3) = 3` 强度。
- `box 5x5` 覆盖 25 格，可视为 `ceil(25 / 3) = 9` 强度。
- `box 7x7` 覆盖 49 格，可视为 `ceil(49 / 3) = 17` 强度。
- 直线 `1x3` 覆盖 3 格，可视为 `ceil(3 / 3) = 1` 强度。

范围成长可由范围强度展开为尺寸：

- `box` 基础 `3x3`。
- `box` 每提升 1 档尺寸，宽高各增加 2：`3x3 -> 5x5 -> 7x7`。
- 其他形状后续按实际覆盖格数统一折算。

施法距离单独计入强度：

- 每提升 1 格施法距离，增加 `0.5` 强度。
- 施法距离强度与覆盖格数强度都进入结构预算乘数。

## 常量文件设计

后续新增独立常量文件，集中管理所有基础值和曲线：

```text
packages/shared/src/constants/gameplay/technique-arts-strength.ts
```

建议职责：

- 基础冷却。
- 基础消耗倍率。
- 基础射程。
- 基础影响目标数。
- 基础固定值。
- 基础属性倍率。
- 功法层数百分比基准。
- Buff 层数百分比基准。
- 强度曲线参数。
- 最小/最大冷却、消耗、范围、目标数。
- 不同目标形状的成本或预算修正。

展开函数放在独立共享文件：

```text
packages/shared/src/technique-arts-strength.ts
```

建议职责：

- 读取常量。
- 将术法强度模板展开为正式 `SkillDef[]`。
- 不引入服务端专属依赖。
- 供服务端生成、服务端恢复、客户端预览、GM 展示复用。

## 待讨论问题

- 基础冷却是否固定为 `20` 息，还是按目标类型区分。
- 基础消耗倍率是否固定为 `1`，还是按目标类型区分。
- 单体、直线、范围、方形、环形、友方、自身的基础射程和基础目标数。
- 范围强度如何同时影响射程、半径、宽度和最大目标数。
- 吟唱是负面代价换取数值预算，还是单独作为效率强度展开。
- 技能总强度预算如何由 `grade`、`realmLv`、`maxLayer` 和 `unlockLevel` 推导。
- 多技能术法如何拆分总预算。
- 大范围、短 CD、低消耗、无吟唱是否应消耗额外预算。
- 高消耗、长 CD、需要吟唱是否应返还预算。
- Buff 类强度如何映射到 `stats`、`valueStats`、`duration`、`stacks`、`maxStacks`。
- 是否第一版只支持 `damage`、`heal`、`buff`，暂缓 `temporary_tile`、`cleanse` 和历史 `terrain`。

## 暂不进入第一版的能力

以下能力先不作为第一版 AI 术法归一化主路径：

- AI 自定义任意 `SkillFormula` AST。
- 任意自定义 Buff 层数联动。
- `terrain` 历史扩展效果。
- `qiProjection`。
- `sustainCost`。
- `infiniteDuration`。
