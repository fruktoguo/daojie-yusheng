---
name: technique-skill-generator
description: Use this skill when creating, expanding, or rewriting cultivation technique skills in this repo, including new 功法技能, existing 技能重做, 同流派技能补全, buff 设计联动, and damage formula authoring. This skill is for writing final game content into the server technique JSON files, and every generated skill must first be produced by the bundled tool script with score evaluation before being written into the technique file.
---

# 功法技能生成

这个 skill 用于在本项目里直接编写功法技能内容。

适用场景：

- 新写一门功法的技能
- 给已有功法补技能
- 重做某个流派的技能组
- 调整技能与 Buff 联动
- 修正某门功法的技能设计，使其符合本项目规则

这不是分析 skill。重点是直接写正式技能配置。

## 强制流程

后续只要是“写功法技能”，必须走这个顺序：

1. 先定位目标功法真源文件。
2. 先阅读同阶段、同分类、同品阶的相邻功法。
3. 先写一个技能生成 spec JSON。
4. 必须调用脚本生成技能配置：
   - `.codex/skills/technique-skill-generator/scripts/generate-technique-skill.mjs`
5. 只有脚本生成成功后，才能把结果手动填入目标功法。
6. 脚本成功后，必须立刻向用户回报：
   - 基础值分数
   - 百分比分数
   - 射程分
   - 范围分
   - 总分
7. 然后再把脚本生成的技能对象写回对应功法文件。
8. 最后执行 `pnpm build`。

不要跳过脚本直接手写技能配置。

## 真源位置

技能正式真源始终在：

- `packages/server/data/content/techniques/`

常见目录：

- `凡人期/内功`
- `凡人期/术法`
- `凡人期/炼体`
- `凡人期/身法`
- `凡人期/秘术`
- `练气期/内功`
- `练气期/术法`
- `练气期/神通`

客户端生成目录不是手改目标：

- `packages/client/src/constants/world/editor-catalog.generated.json`
- `packages/client-next/src/constants/world/editor-catalog.generated.json`

## 写技能前必须先做的事

1. 先定位目标功法所在的阶段、分类、品阶文件。
2. 至少阅读同阶段、同分类、同品阶的相邻功法，确认当前区间的数值密度、技能数量、解锁层数、Buff 强度、词汇风格。
3. 如果是同系列功法延展，先查这个系列已存在的 Buff、标记、五行联动和命名习惯。
4. 再决定要写成什么技能结构，不要先拍脑袋造公式。

## 生成脚本

脚本路径：

- `.codex/skills/technique-skill-generator/scripts/generate-technique-skill.mjs`

调用方式：

```bash
node .codex/skills/technique-skill-generator/scripts/generate-technique-skill.mjs --spec /tmp/xxx-skill-spec.json --out /tmp/xxx-skill-result.json
```

脚本输入是一个 spec JSON，输出包含：

- 生成好的技能对象
- 四个分数
- 总分
- 推荐 `cooldown`
- 推荐 `costMultiplier`
- 目标数预算与形状提示

AI 后续要做的事：

1. 读取脚本输出
2. 先把五个分数告诉用户
3. 再根据脚本返回的目标数预算和技能形状，手动换算成可运行的合法范围
4. 最后把生成好的技能对象手动填入目标功法

## spec 结构

最小 spec 示例：

```json
{
  "realm": "练气期",
  "grade": "玄阶",
  "lv": 0,
  "skill": {
    "id": "skill.example",
    "name": "示例技能",
    "desc": "示例描述",
    "unlockLevel": 1,
    "damageKind": "physical",
    "element": "metal",
    "range": 3,
    "targeting": {
      "shape": "line"
    },
    "baseWeights": [
      { "var": "caster.stat.physAtk", "weight": 1 }
    ],
    "percentWeights": [
      { "var": "techLevel", "weight": 1 },
      { "var": "caster.stat.hit", "weight": 1 },
      { "var": "caster.stat.breakPower", "weight": 1 }
    ],
    "areaScoreTarget": 0.2,
    "buffEffects": []
  }
}
```

`lv` 会参与四维参考区间计算。

`buffEffects` 直接写最终要落进技能里的 buff effect 对象。

如果某个百分比项不是脚本内建项，例如 Buff 层数联动，必须在对应权重项上显式给 `scalePerScore`：

```json
{
  "var": "target.buff.buff.xxx.stacks",
  "weight": 1,
  "scalePerScore": 0.04
}
```

表示这个项每分会生成 `4%` 的公式缩放。

`areaScoreTarget` 是“伤害数量分”，不是最终 `maxTargets`。

- `0.2` 分约等于 `3` 个目标
- `1` 分约等于 `11` 个目标
- `3` 分约等于 `31` 个目标

脚本会先返回一个近似目标数，真正写回功法时由 AI 再按形状换算。

## 硬规则

### 1. 百分比增幅只能有一个总乘区

伤害公式里所有百分比增幅只能并进同一个乘区。

允许：

```json
{
  "op": "mul",
  "args": [
    { "op": "add", "args": [22, { "var": "caster.stat.physAtk", "scale": 0.95 }] },
    {
      "op": "add",
      "args": [
        1,
        { "var": "techLevel", "scale": 0.08 },
        { "var": "caster.stat.hit", "scale": 0.0016 },
        { "var": "caster.stat.breakPower", "scale": 0.0018 }
      ]
    }
  ]
}
```

禁止：

```json
{
  "op": "mul",
  "args": [
    { "op": "add", "args": [22, { "var": "caster.stat.physAtk", "scale": 0.95 }] },
    { "op": "add", "args": [1, { "var": "techLevel", "scale": 0.08 }] },
    { "op": "add", "args": [1, { "var": "caster.stat.hit", "scale": 0.0016 }] }
  ]
}
```

也就是说：

- 功法层数加成并进总乘区
- 命中、破招、暴击等百分比来源并进总乘区
- Buff 层数带来的百分比增幅也并进总乘区
- 不允许多个 `1 + ...` 段彼此再相乘

### 2. 基础伤害来源限制

基础伤害值只能来自：

- `caster.stat.physAtk`
- `caster.stat.spellAtk`

默认禁止把下列变量写进技能公式或技能加成：

- `caster.maxHp`
- `caster.maxQi`
- `caster.stat.maxHp`
- `caster.stat.maxQi`
- `target.maxHp`
- `target.maxQi`
- `target.stat.maxHp`
- `target.stat.maxQi`

这条限制同时适用于：

- 基础伤害段
- 百分比乘区
- buff / debuff 的数值加成设计

只有用户明确强调要做“生命值 / 灵气值联动”时，才允许破例使用，而且必须先在回复里点明这是按用户特意要求执行，不要默认加入。

不允许在基础伤害段加入：

- 固定常数
- 目标生命
- 目标灵力
- 命中、暴击、闪避、破招、化解、双防、移速
- 任何目标侧属性

### 3. 参考区间规则

先按 `lv` 和 `grade` 计算四维参考区间。

规则：

- 每加 `1 lv`，四个维度的上下限都 `+0.1`
- 品阶加成：
  - `凡阶 +0`
  - `黄阶 +1`
  - `玄阶 +2`
  - `地阶 +3`
  - `天阶 +4`
  - 后续以此类推

基础参考区间：

- 基础值：`0.8 - 1.2`
- 百分比：`0 - 0`
- 射程：`0 - 1`
- 范围：`0 - 1`

默认参考目标值取中位数：

- 基础值取 `(下限 + 上限) / 2`
- 百分比取中位数
- 射程取中位数
- 范围取中位数

例如：

- `lv = 0`
- `grade = 玄阶`

则默认参考值会是：

- 基础值 `3`
- 百分比 `2`
- 射程 `2.5`
- 范围 `2.5`

### 4. 分数规则

脚本会输出四个分数：

- 基础值分数
- 百分比分数
- 射程分
- 范围分

基础值分数：

- 每 `100%` 物理攻击力 = `1` 分
- 每 `100%` 法术攻击力 = `1` 分
- 每 `10%` 自身生命值 = `1` 分
- 每 `15%` 自身灵力值 = `1` 分

百分比分数：

- 自身 `命中 / 暴击 / 闪避 / 破招 / 化解 / 物防 / 法防`：每 `100%` = `1` 分
- 自身移速：每 `50%` = `1` 分
- 自身或目标 `体魄 / 神识 / 身法 / 根骨`：每 `100%` = `3` 分
- 自身或目标 `悟性 / 气运`：每 `100%` = `1` 分
- 基于目标的上述数值：只按对应分数的 `60%` 计分
- 功法层数：每 `15%` = `1` 分
- 其他非常规百分比项必须显式提供 `scorePercent`

射程分：

- 射程每比 `1` 格多 `2` 格，记 `1` 分

范围分：

- 命中目标数每比 `1` 个多 `10` 个，记 `1` 分
- 脚本内部先把范围分换成近似目标数预算
- 写回技能时不要直接照抄成奇怪的 `maxTargets`，要结合形状重新落地

总分公式：

```text
总分 = 基础值分数 * (1 + 百分比分数 * 3) * (1 + 射程分) * (1 + 范围分)
```

### 5. 缺项补偿规则

允许某一维低于参考值，但必须由其他维补回来。

脚本当前默认用“回灌基础值”的方式补偿：

```text
预算值 = 参考基础值 + 参考百分比分 * 3 + 参考射程分 + 参考范围分
最终基础值 = 预算值 - 实际百分比分 * 3 - 实际射程分 - 实际范围分
```

也就是说：

- 百分比少了，优先回灌到基础值
- 射程少了，优先回灌到基础值
- 范围少了，优先回灌到基础值

例如参考值是：

- 基础值 `3`
- 百分比 `2`
- 射程 `2.5`
- 范围 `2.5`

如果实际：

- 百分比 `0`
- 射程 `0`
- 范围 `0`

则基础值会被推到：

```text
3 + 2*3 + 2.5 + 2.5 = 14
```

### 6. 形状换算规则

脚本只返回：

- `desiredTargetCount`
- `shape`
- `suggestedTargeting`

真正写技能时，AI 需要按形状手动换算成“能正常运行”的范围。

默认换算原则：

- `single`：固定单体
- `line`：按目标数近似设置 `maxTargets`
- `box`：优先取奇数正方形，不要写 `6x4`、`4x4` 这种偶数宽高
- `area`：优先取整数半径，对应奇数直径

例子：

- 如果目标数预算约为 `30`
- 形状是 `box`
- 默认先近似成 `5x5`

宁可略少，也不要写偶数宽高让中心歪掉。

### 7. 数值美化规则

脚本返回的缩放值必须先做规整。

要求：

- 不要保留 `1.1231` 这类脏数字
- 大系数优先压成玩家容易理解的整十或半档比例
- 小系数也要压成常见档位，不保留无意义长尾

例如：

- `1.1231` 可以直接压成 `1.1`

### 8. CD 和消耗倍率

脚本会根据：

- 总分
- 功法境界
- 功法品阶

给出推荐的：

- `cooldown`
- `costMultiplier`

AI 需要采用脚本结果作为默认值，再手动填入目标功法。

### 9. 技能文案要对玩家直接可读

- `desc` 先写玩家感受到的玩法
- Buff 名称不要写技术占位词
- `shortMark` 要能在地图和 tooltip 中直接识别

### 10. 同流派要有连续性

生成新技能时默认保持：

- 同系列 buff 命名一致
- 同元素表现一致
- 上一招铺垫、下一招读取的关系清楚
- 不要无理由跳出该流派的战斗逻辑

## Buff 联动规则

当一个技能读取另一个技能挂上的状态时：

- 优先复用已有 `buffId`
- 读取变量统一写成 `target.buff.xxx.stacks` 或 `caster.buff.xxx.stacks`
- 只要是同一个状态，就不要重复造多个近似 buff

## 写完后的检查清单

- 是否先看了同档位相邻功法
- 是否先跑了脚本而不是手写配置
- 是否只改了服务端真源文件
- 是否没有写出多个百分比乘区叠乘
- 是否基础伤害只使用允许来源
- 是否 Buff 命名、`buffId`、读取链路一致
- 是否已经把四个分数和总分告诉用户
- 是否执行了 `pnpm build`
- 是否确认客户端生成目录已更新

## 交付时默认说明

- 改了哪一个功法文件
- 新增或修改了哪些技能
- 基础值分数、百分比分数、射程分、范围分、总分
- 是否遵守“单一总乘区”规则
- 是否执行了 `pnpm build`
