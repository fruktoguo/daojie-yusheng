# 炼器默认器方五行设计草案

本文记录凡人期、练气期、筑基期装备默认器方和目标五行草案。它用于后续写入 `packages/server/data/content/forging/recipes.json` 前对表确认。

## 设计口径

- 炼器默认配方禁用 `materialCategory: herb` 的药材。
- 主材必须固定，默认 1 个；少数特殊装备以后可调整为 2 主材。
- 辅材是标准器方默认辅料；玩家自定义器方仍可替换辅材，但目标五行必须匹配。
- 材料五行先按 `docs/mechanics/technique/16a-fivephase-craft-formula.md` 的“材料五行预算规则”归一，再累加为器方目标五行。
- 当前已有铜制工具、铜罗盘、凡品阵盘等基础器方先不调整。

## 凡人期

| 装备 | 等级/品阶 | 默认配方 | 目标五行 |
|---|---|---|---|
| 门丁裹头巾 | Lv2 yellow | 匪徒腰牌x1(主)；鼠尾x1(辅) | 金+5 / 木+5 / 水+2 / 土+2 |
| 越沟快靴 | Lv2 yellow | 鼠尾x1(主)；妖兽骨x1(辅) | 木+8 / 水+2 / 土+2 |
| 药烟轻袍 | Lv3 yellow | 阴沼丝x1(主)；泽鳞x1(辅) | 木+3 / 水+11 / 土+3 |
| 采气木坠 | Lv3 yellow | 妖兽骨x1(主)；鼠尾x1(辅) | 木+8 / 水+2 / 土+2 |
| 矿卫破岩锤 | Lv3 mystic | 玄铁矿块x1(主)；晶尘x1(辅) | 金+20 / 水+4 / 土+7 |
| 熄火矿灯冠 | Lv3 mystic | 玄铁矿块x1(主)；魂墨x1(辅) | 金+12 / 水+10 / 土+13 |
| 断碑纹剑 | Lv4 mystic | 断纹石片x1(主)；玄铁矿块x1(辅) | 金+19 / 土+20 |
| 镇煞护心甲 | Lv4 mystic | 灵铁碎片x1(主)；断纹石片x1(辅)；魂墨x1(辅) | 金+22 / 水+10 / 土+27 |
| 噬元骨牌 | Lv4 mystic | 魂墨x1(主)；虚蚀碎片x1(辅) | 水+25 / 土+14 |

## 练气期

| 装备 | 等级/品阶 | 默认配方 | 目标五行 |
|---|---|---|---|
| 裂痕踏靴 | Lv19 yellow | 残兵铁片x1(主)；承脉石x1(辅) | 金+27 / 水+15 / 土+42 |
| 归息铜佩 | Lv19 yellow | 寒魄露x1(主)；月井冰砂x1(辅) | 金+15 / 水+54 / 土+15 |
| 养枝引脉杖 | Lv19 yellow | 青髓藤x1(主)；生灵木心x1(辅) | 木+72 / 水+15 / 土+25 |
| 青萝束冠 | Lv19 yellow | 青髓藤x1(主)；生灵木心x1(辅) | 木+72 / 水+15 / 土+25 |
| 寒汐引流尺 | Lv19 yellow | 寒魄露x1(主)；月井冰砂x1(辅) | 金+15 / 水+54 / 土+15 |
| 赤陨灼枪 | Lv19 yellow | 炎髓炭x1(主)；陨火砂x1(辅) | 火+54 / 土+30 |
| 净潮法衣 | Lv21 yellow | 净潮水精x1(主)；寒魄露x1(辅) | 金+15 / 木+25 / 水+72 |
| 满锋刀 | Lv23 yellow | 剑丸x1(主)；残兵铁片x1(辅) | 金+54 / 火+15 / 土+15 |
| 砂魇面 | Lv23 yellow | 残兵铁片x1(主)；寒魄露x1(辅) | 金+42 / 水+27 / 土+15 |
| 逐锋履 | Lv23 yellow | 残兵铁片x1(主)；剑丸x1(辅) | 金+54 / 火+15 / 土+15 |
| 坠岩槌 | Lv23 yellow | 厚岩核x1(主)；承脉石x1(辅) | 金+15 / 水+15 / 土+54 |
| 岭垣甲 | Lv23 yellow | 承脉石x1(主)；厚岩核x1(辅) | 金+15 / 水+15 / 土+54 |
| 护脉石 | Lv23 yellow | 承脉石x1(主)；寒魄露x1(辅) | 金+15 / 水+42 / 土+27 |
| 裂锋披 | Lv25 mystic | 锋纹残晶x1(主)；残兵铁片x1(辅) | 金+72 / 火+25 / 土+15 |
| 御土面 | Lv25 mystic | 镇岳石胆x1(主)；承脉石x1(辅) | 水+40 / 土+72 |
| 炉心赤戒 | Lv26 mystic | 炉心赤晶x1(主)；陨火砂x1(辅) | 金+25 / 火+72 / 土+15 |
| 庚门断锋 | Lv29 mystic | 锋纹残晶x1(主)；剑丸x1(辅)；五炁尘x1(辅) | 金+102 / 木+31 / 水+31 / 火+71 / 土+31 |
| 封路令 | Lv29 mystic | 锋纹残晶x1(主)；承脉石x1(辅) | 金+45 / 水+15 / 火+25 / 土+27 |
| 裂岭戟 | Lv29 mystic | 镇岳石胆x1(主)；剑丸x1(辅) | 金+27 / 水+25 / 火+15 / 土+45 |
| 镇岭盔 | Lv29 mystic | 镇岳石胆x1(主)；厚岩核x1(辅) | 金+15 / 水+25 / 土+72 |
| 封岳甲 | Lv29 mystic | 镇岳石胆x1(主)；归藏脉核x1(辅) | 金+38 / 水+50 / 土+109 |
| 厚脉核 | Lv29 mystic | 归藏脉核x1(主)；五炁尘x1(辅) | 金+68 / 木+31 / 水+56 / 火+31 / 土+95 |
| 归藏合流刃 | Lv29 mystic | 归藏脉核x1(主)；五炁尘x1(辅) | 金+68 / 木+31 / 水+56 / 火+31 / 土+95 |
| 回阵行履 | Lv29 mystic | 半基灵胚x1(主)；五炁尘x1(辅) | 金+30 / 木+69 / 水+56 / 火+31 / 土+95 |

## 阵盘

阵盘等级按 `packages/server/data/content/realm-levels.json` 的品阶段起点确定：黄阶 13、玄阶 25、地阶 37。阵盘炼制时间从 600 息起，每提升一阶增加 300 息。

| 阵盘 | 等级/品阶 | 默认配方 | 目标五行 | 基础耗时 |
|---|---|---|---|---:|
| 凡品阵盘 | Lv1 mortal | 玄铁矿块x1(主) | 金+12 / 土+7 | 600息 |
| 黄阶阵盘 | Lv13 yellow | 断纹石片x1(主)；灵铁碎片x1(辅)；魂墨x1(辅) | 金+22 / 水+10 / 土+27 | 600息 |
| 玄阶阵盘 | Lv25 mystic | 锋纹残晶x1(主)；镇岳石胆x1(辅)；五炁尘x1(辅) | 金+77 / 木+31 / 水+55 / 火+55 / 土+76 | 900息 |
| 地阶阵盘 | Lv37 earth | 五行脉晶x1(主)；五行混元精x1(辅)；五行蟾液x1(辅) | 金+171 / 木+171 / 水+171 / 火+171 / 土+167 | 1200息 |

## 筑基期战斗装备重设口径

筑基期装备不再按地图做三套套装，而是全部按同一等级展开不同倾向。初始建议统一为 `Lv40 earth`，少数特殊稀有件以后可单独提到 `heaven`。

当前落地口径：

- 筑基期战斗装备基础耗时统一为 `96息`。
- `霜裂爆锋` 作为爆伤稀有武器，默认配方为霜刃晶x1(主)；蝎毒囊x1(辅)；寒蛇胆x1(辅)，默认五行总值 `336`。
- `玄龟法衣` 作为高法防/化解护甲，默认配方为玄龟寒髓x1(主)；冰晶丝x1(辅)；霜鳞片x1(辅)，默认五行总值 `290`。

| 部位 | 数量 | 倾向 |
|---|---:|---|
| weapon | 5 | 物理武器；法术武器；双攻武器；爆伤武器；冷却/回复武器 |
| head | 5 | 物抗；法抗；双抗；生命专精；负生命/负双抗换攻击 |
| body | 5 | 物抗；法抗；双抗；生命专精；负生命/负双抗换攻击 |
| legs | 2 | 移速；冷却 |
| accessory | 5 | 冷却；物攻；法攻；灵力输出；纯修炼增幅 |

总计 22 件战斗装备。爆伤武器按稀有词条处理，1 点装备权重只折算 1% 爆伤，不和普通攻击、暴击率按同价兑换。

修炼增幅装备必须和战斗收益切开：

- 只能给 `realmExpPerTick`、`techniqueExpPerTick`、`playerExpRate`、`techniqueExpRate` 这类境界修为/功法成长属性。
- 禁止给 `physAtk`、`spellAtk`、`physDef`、`spellDef`、`hit`、`dodge`、`crit`、`critDamage`、`breakPower`、`resolvePower`、`cooldownSpeed`、`maxQiOutputPerTick` 等战斗属性。
- 不写触发战斗 buff、受击 buff、击杀 buff 或任何影响战斗结算的效果。
- 如果同部位要做战斗饰品和修炼饰品，必须是不同装备，不能在同一件装备上混合。

## 生活工具装备

生活工具装备沿用凡人期铜制工具的形式，但不再占用 `weapon` 战斗槽。每种技艺使用一个独立工具槽：

| 技艺 | 工具槽 | 工具 |
|---|---|---|
| 炼丹 | `technique_alchemy` | 丹炉 |
| 炼器 | `technique_forging` | 炼器钳 |
| 强化 | `technique_enhancement` | 强化锤 |
| 挖矿 | `technique_mining` | 矿镐 |
| 营造 | `technique_building` | 营造锤 |

每个境界补一组 5 件：丹炉、炼器钳、强化锤、矿镐、营造锤。工具属性直接写入物品模板的 `craftEffectStats`，玩家属性结算阶段汇总到 `player.attrs.craftEffectStats`，技艺运行时只读取这个统一属性快照。

当前可直接落地的工具字段：

- `alchemy_furnace` + `craftEffectStats.alchemy.successRate/speedRate`：炼丹成功率与速度。
- `forging_tool` + `craftEffectStats.forging.successRate/speedRate`：炼器成功率与速度。
- `enhancement_hammer` + `craftEffectStats.enhancement.successRate/speedRate`：强化成功率与速度。
- `mining_pickaxe` + `craftEffectStats.mining.speedRate/outputRate/expRate`：挖矿破坏速度、矿物额外产出与挖矿技艺经验。`outputRate` 按固定额外数量 + 小数概率额外 1 个结算，不再并入地块掉落概率。
- `building_hammer` + `craftEffectStats.building.speedRate`：每息建造进度增幅。

### 练气期生活工具

建议统一为 `Lv29 mystic`，定位是替代凡人铜工具的练气工具组。

| 装备 | 工具类型 | 标签/入口 | 默认配方 | 目标五行 | 推荐数值 |
|---|---|---|---|---|---|
| 赤纹丹炉 | 丹炉 | `alchemy_furnace` / `alchemy:open` | 炉心赤晶x1(主)；净潮水精x1(辅) | 金+24 / 木+24 / 水+46 / 火+46 | `alchemy.successRate +0.16`；`alchemy.speedRate +0.30` |
| 锋岳炼器钳 | 炼器钳 | `forging_tool` / `forging:open` | 锋纹残晶x1(主)；镇岳石胆x1(辅) | 金+46 / 水+24 / 火+24 / 土+46 | `forging.successRate +0.16`；`forging.speedRate +0.30` |
| 五炁强化锤 | 强化锤 | `enhancement_hammer` / `enhancement:open` | 五炁尘x1(主)；厚岩核x1(辅) | 金+46 / 木+31 / 水+31 / 火+31 / 土+57 | `enhancement.successRate +0.015`；`enhancement.speedRate +0.25` |
| 归藏矿镐 | 矿镐 | `mining_pickaxe` / `mining:start` | 归藏脉核x1(主)；残兵铁片x1(辅) | 金+65 / 水+25 / 土+79 | `mining.speedRate +0.80`；`mining.outputRate +0.15`；`mining.expRate +0.50` |
| 半基营造锤 | 营造锤 | `building_hammer` / `building:open` | 半基灵胚x1(主)；生灵木心x1(辅) | 木+84 / 水+25 / 土+88 | `building.speedRate +0.25` |

### 筑基期生活工具

建议统一为 `Lv40 earth`，定位是筑基阶段长期使用的进阶工具组。

筑基期生活工具基础耗时统一为 `108息`。

| 装备 | 工具类型 | 标签/入口 | 默认配方 | 目标五行 | 推荐数值 |
|---|---|---|---|---|---|
| 焚元丹炉 | 丹炉 | `alchemy_furnace` / `alchemy:open` | 焚王余烬x1(主)；五行蟾液x1(辅) | 金+55 / 木+117 / 水+55 / 火+170 / 土+55 | `alchemy.successRate +0.24`；`alchemy.speedRate +0.40` |
| 深铁炼器钳 | 炼器钳 | `forging_tool` / `forging:open` | 深渊铁精x1(主)；熔核碎片x1(辅) | 金+135 / 水+57 / 火+103 / 土+99 | `forging.successRate +0.24`；`forging.speedRate +0.40` |
| 玄壤强化锤 | 强化锤 | `enhancement_hammer` / `enhancement:open` | 五行脉晶x1(主)；玄壤精土x1(辅) | 金+121 / 木+58 / 水+58 / 火+58 / 土+174 | `enhancement.successRate +0.02`；`enhancement.speedRate +0.35` |
| 地龙矿镐 | 矿镐 | `mining_pickaxe` / `mining:start` | 地龙脊骨x1(主)；深渊土精x1(辅) | 金+66 / 水+66 / 土+248 | `mining.speedRate +1.20`；`mining.outputRate +0.20`；`mining.expRate +0.70` |
| 混元营造锤 | 营造锤 | `building_hammer` / `building:open` | 混元脉石x1(主)；木火精华x1(辅) | 金+55 / 木+167 / 水+55 / 火+116 / 土+55 | `building.speedRate +0.35` |
