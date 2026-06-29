# 技艺效果属性设计记录

## 定位

本文记录技艺属性重构的设计口径和当前落地状态。当前技艺装备、玩家属性结算和技艺业务消费已经统一改为 `CraftEffectStats`，生活工具不再使用旧扁平工具字段。

目标是把技艺相关的成功率、速度、产出率、经验倍率从分散业务逻辑、装备工具字段、等级加成、环境加成和特殊效果中收敛为统一的玩家技艺加成属性。来源可以很多，但最终消费形态应该稳定为“技艺维度 + 四项固定加成”，避免每新增一种加成就把业务结算逻辑再硬编码一遍。

当前阶段的权威运行态字段是 `player.attrs.craftEffectStats`。装备、buff、环境、风水、阵法等来源后续都应贡献同一种 `CraftEffectStatsPatch`，业务结算不再直接读取来源细节。

## 核心模型

技艺加成属性按技艺分类，每个技艺拥有一个统一加成属性块，块内固定四项：

```ts
type CraftEffectKind = 'successRate' | 'speedRate' | 'outputRate' | 'expRate';

type CraftEffectSkillKind =
  | 'alchemy'
  | 'forging'
  | 'enhancement'
  | 'transmission'
  | 'gather'
  | 'mining'
  | 'building'
  | 'formation';

type CraftEffectStats = Record<
  CraftEffectSkillKind,
  {
    successRate: number;
    speedRate: number;
    outputRate: number;
    expRate: number;
  }
>;
```

- `successRate`：技艺额外成功率或成功率修正。所有来源先合并到对应技艺的 `successRate`，再由该技艺自己的概率曲线消费。
- `speedRate`：技艺速度修正。正值表示缩短耗时或提升每息进度，负值表示拉长耗时或降低每息进度。
- `outputRate`：技艺产出修正。包括额外数量、额外掉落、额外副产物、返材、省耗、稀有产出概率、结果品质等产出侧收益。
- `expRate`：技艺经验修正。只影响对应技艺经验获取，不改变成功率、速度或产出。

严格四属性口径下，暂不新增 `costReduce`、`qualityRate`、`powerRate` 等额外效果维度。确实需要表达时，先归入四类属性：

- 资源省耗、返材、保护类收益归入 `outputRate`。
- 挖矿地块额外伤害归入 `speedRate`，因为它减少完成同一矿脉破坏所需 tick。
- 产出品质暂归入 `outputRate`，如果后续品质系统复杂到需要独立结算，再单独扩展。

当前共享层入口：

- `packages/shared/src/craft-effect-stats.ts`
- `CraftEffectStats`
- `CraftEffectStatsPatch`
- `createEmptyCraftEffectStats`
- `cloneCraftEffectStats`
- `addCraftEffectStatsPatch`
- `normalizeCraftEffectStatsPatch`
- `readCraftEffectStat`
- `applyCraftOutputRate`
- `applyCraftExpRate`

## 与现有属性边界

- `NumericStats` 继续承载通用战斗、成长、移动和掉落面板属性，例如 `cooldownSpeed`、`playerExpRate`、`techniqueExpRate`、`lootRate`、`rareLootRate`、`elementDamageBonus`、`elementDamageReduce`。
- 新的 `CraftEffectStats` 只承载技艺专属加成，不替代 `NumericStats`。
- `player.attrs.craftEffectStats` 是服务端结算和面板预估共同使用的技艺效果快照。
- `qiProjection` 仍是灵气可见性、吸收效率和灵气环境投影系统，不并入技艺四属性。
- 环境、阵法、风水、buff、装备、功法、称号等都可以作为来源贡献到 `CraftEffectStats`，但来源生命周期仍由各自系统负责。

## 统一结算原则

1. 来源不直接改业务结果，只贡献 `CraftEffectStats` patch。
2. 运行时在玩家属性结算阶段或技艺开始前构建最终 `CraftEffectStats` 快照。
3. 技艺 job 创建时冻结本次任务所需的成功率、速度、产出率，避免中途换装备导致任务语义漂移。
4. 需要动态生效的特殊效果必须明确写入 job 生命周期规则，不能隐式穿透。
5. 成功率只在对应技艺概率曲线里消费，不跨技艺复用。
6. 速度只影响耗时或每 tick 进度，不直接修改成功率或产出。
7. 产出率只影响结果数量、掉落、副产物、返材、省耗、收获等，不直接修改成功率。数量型产出按“固定额外数量 + 小数概率额外 1 个”结算，例如基础 1 个、`outputRate=3.5` 时固定额外 3 个，并有 50% 概率再额外 1 个。
8. UI 面板和服务端结算使用同一快照，避免预览和实际结果不一致。
9. 来源拆解要可投影给属性详情和技艺面板，便于解释装备、功法、buff、风水、阵法等来源。

## 技艺映射表

| 技艺 | `successRate` | `speedRate` | `outputRate` | `expRate` |
| --- | --- | --- | --- | --- |
| 炼丹 `alchemy` | 炼丹成功率、五行匹配后的额外修正、技艺等级成功率、幸运成功率、工具成功率 | 炼丹耗时修正、技艺等级速度、工具速度 | 成丹数量、额外成丹、副产物、返材 | 炼丹技艺经验倍率 |
| 炼器 `forging` | 炼器成功率、五行匹配后的额外修正、技艺等级成功率、幸运成功率、工具成功率 | 炼器耗时修正、技艺等级速度、工具速度 | 成品数量、副产物、返材、额外产物 | 炼器技艺经验倍率 |
| 强化 `enhancement` | 强化目标等级基础概率后的额外成功率、强化技艺等级修正、幸运成功率、工具成功率 | 强化耗时修正、强化技艺等级速度、工具速度 | 保护、返材、省耗、额外强化收益 | 强化技艺经验倍率 |
| 传法 `transmission` | 暂不消费 | 功法领悟进度速度，自悟和传授别人都生效 | 当前预留 | 传法技艺经验倍率，只影响传法技艺自身经验 |
| 采集 `gather` | 当前多为固定成功，预留采集失败、品质或特殊资源判定 | 草药采集等级速度、采集工具速度、环境速度 | 额外草药、稀有草药、额外采集数量 | 采集技艺经验倍率 |
| 挖矿 `mining` | 当前多为地块破坏固定成功，预留矿脉判定 | 挖矿等级地块伤害、工具地块伤害、环境破坏速度 | 矿物掉落、额外矿物、稀有矿物、幸运地块掉落 | 挖矿技艺经验倍率 |
| 营造 `building` | 当前多为建造固定成功，预留特殊建筑失败或品质判定 | 建造每息进度、营造工具速度、个人建造速度 | 返材、额外耐久、额外建筑品质、额外建筑产物 | 营造技艺经验倍率 |
| 阵法 `formation` | 布阵成功率、维护成功率，当前多为固定成功 | 布阵速度、维护速度 | 阵法效果产出、维护灵力效率、额外范围、额外持续时间 | 阵法技艺经验倍率 |

## 当前落地状态

生活工具和物品模板直接写 `craftEffectStats`：

```json
{
  "craftEffectStats": {
    "alchemy": { "successRate": 0.1, "speedRate": 0.2 },
    "mining": { "speedRate": 0.5, "outputRate": 0.1, "expRate": 0.3 }
  }
}
```

当前已经接入的消费点：

| 技艺 | 已消费属性 |
| --- | --- |
| 炼丹 `alchemy` | `successRate`、`speedRate`、`outputRate`、`expRate` |
| 炼器 `forging` | `successRate`、`speedRate`、`outputRate`、`expRate` |
| 强化 `enhancement` | `successRate`、`speedRate`、`expRate` |
| 传法 `transmission` | `speedRate`、`expRate` |
| 采集 `gather` | `speedRate`、`outputRate`、`expRate` |
| 挖矿 `mining` | `speedRate`、`outputRate`、`expRate` |
| 营造 `building` | `speedRate`、`expRate` |
| 阵法 `formation` | `expRate` |

其中 `expRate` 统一只影响对应技艺自身经验。传法的 `speedRate` 影响功法领悟进度；传法的 `expRate` 只影响传法技艺经验。

## 属性面板未显式展示的隐藏特殊属性

本节只记录当前代码里已经存在、但没有作为属性面板卡片显式展示的玩家特殊属性或效果投影。已经在属性面板中有卡片、摘要或数值项的属性不放在这里。

当前属性面板已显式覆盖：

- `comprehension`：悟性，六维页底部特殊卡片。
- `luck`：幸运，六维页底部特殊卡片。
- `foundation`：底蕴，特殊页卡片。
- `combatExp`：战斗经验，特殊页卡片。
- `rootFoundation`：根基，六维雷达摘要卡片。
- `numericStats` 的通用数值项：特殊页、斗法页、灵力页等已有对应面板项。
- 五行增伤、五行减伤：灵根/灵脉相关页已有展示。
- 灵气吸收效率和灵气感知：灵脉页已有展示。
- 炼体全属性增幅：六维构成 tooltip 已展示。

### 当前隐藏项

| 隐藏项 | 当前承载 | 当前消费 | 问题 | 后续归并口径 |
| --- | --- | --- | --- | --- |
| 技艺效果属性 | `player.attrs.craftEffectStats` | 炼丹、炼器、强化、传法、采集、挖矿、营造、阵法相关结算和面板预估 | 不是属性面板卡片，当前仍属于隐藏特殊属性。 | 后续接入属性详情来源拆解，按技艺展示 `successRate/speedRate/outputRate/expRate`。 |

### 不应计入“未显示特殊属性”的项

这些虽然也是加成或机制，但不是“已有隐藏玩家特殊属性”：

| 机制 | 原因 |
| --- | --- |
| `NumericStats` 已有字段 | 已经是玩家数值面板的一部分，不在本清单重复记录。 |
| 五行增伤/减伤 | 已属于 `NumericStats` 的元素组，且属性面板已有灵根/灵脉展示入口。 |
| 灵气吸收效率、灵气感知 | 灵脉页已经展示无属性灵气、煞气和五行灵气吸收效率，不作为隐藏特殊属性重复统计。 |
| 风水临时幸运 | 应作为幸运的来源直接合并到有效幸运，不作为独立玩家特殊属性统计。 |
| 炼体全属性增幅 | 六维构成 tooltip 已展示炼体乘区，不作为面板未显示属性统计。 |
| 怪物 `expMultiplier` | 怪物/刷怪配置，不是玩家自身属性。 |
| 怪物刷新加速 | 地图实例刷怪状态，不是玩家属性。 |
| 地形耐久倍率、建筑拓扑阻挡 | 地图/建筑配置，不是玩家属性。 |
| buff 持续时间、层数、可见性、死亡保留 | buff 生命周期元数据，不是玩家属性；只有 buff 产生的效果进入属性结算。 |
| 五行配方材料基础匹配 | 配方和材料输入判定；结果可以贡献到技艺 `successRate`，材料本身不是玩家属性。 |

## 建议的最终分层

玩家最终保留三类属性快照：

1. `finalAttrs`：六维基础属性。
2. `numericStats`：现有数值面板属性，不在本设计重复拆分。
3. `specialEffectStats`：当前属性面板未显式展示、但业务已经在消费的隐藏特殊效果。

`specialEffectStats` 可以先包含：

```ts
interface SpecialEffectStats {
  craft: CraftEffectStats;
}
```

更稳妥的迁移方式是先把隐藏效果作为属性详情和业务消费的统一快照，再逐步减少业务逻辑对工具字段和传法/领悟公式字段的直接读取。

## 不在本次设计内

- 不改变各技艺现有公式数值。
- 不把战斗 `NumericStats` 全部迁到技艺属性。
- 不把 `qiProjection` 并入技艺四属性。
- 不在 tick 热路径动态解析配置。
- 不让客户端自行计算最终权威成功率、最终产出或最终结算结果。
