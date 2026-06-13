# 丹药装备制造与材料五行总表

本文档由当前正式配置生成，用于核对炼丹、炼器五行需求、默认配方以及材料五行和出处。

## 数据来源

- 炼丹配方：`packages/server/data/content/alchemy/recipes.json`
- 炼器配方：`packages/server/data/content/forging/recipes.json`
- 物品模板：`packages/server/data/content/items/**`
- 物品来源：`packages/client/src/constants/world/item-sources.generated.json`

## 口径

- 制造所需五行 = 主药/主材自身五行 * 数量 + 配方 `requiredAuxElements`。
- 默认配方中的 `(主)` 为必须主药/主材，`(辅)` 为标准默认辅料；自定义配方可以替换辅料，但仍要匹配五行。
- 炼器配方禁用药材辅材，筑基期生活工具不包含罗盘。
- 阵盘等级按品阶段起点确定：黄阶 13、玄阶 25、地阶 37；阵盘炼制时间 600 息起，每阶增加 300 息。
- `techniqueExpPerTick` / `techniqueExpRate` 在当前属性系统中表示功法经验，不是炼丹/炼器技艺经验。

## 丹药/装备制造表

共 94 条：炼丹 19 条，炼器 75 条。

| 类型 | 名称 | itemId | 等级 | 品阶 | 制造所需五行 | 默认配方 | 基础耗时 | recipeId |
|---|---|---|---:|---|---|---|---:|---|
| 装备/器物 | 铜营造锤 | equip.copper_building_hammer | 1 | 黄阶 | 金+12 / 土+7 | 玄铁矿块x1(主) | 10息 | forging.copper_building_hammer |
| 装备/器物 | 铜强化锤 | equip.copper_enhancement_hammer | 1 | 黄阶 | 金+12 / 土+7 | 玄铁矿块x1(主) | 10息 | forging.copper_enhancement_hammer |
| 装备/器物 | 铜炼器钳 | equip.copper_forging_tool | 1 | 黄阶 | 金+12 / 土+7 | 玄铁矿块x1(主) | 10息 | forging.copper_forging_tool |
| 装备/器物 | 铜罗盘 | equip.copper_luopan | 1 | 黄阶 | 金+12 / 土+7 | 玄铁矿块x1(主) | 10息 | forging.copper_luopan |
| 装备/器物 | 铜矿镐 | equip.copper_mining_pickaxe | 1 | 黄阶 | 金+12 / 土+7 | 玄铁矿块x1(主) | 10息 | forging.copper_mining_pickaxe |
| 装备/器物 | 铜胎丹炉 | equip.copper_pill_furnace | 1 | 黄阶 | 金+12 / 土+7 | 玄铁矿块x1(主) | 10息 | forging.copper_pill_furnace |
| 装备/器物 | 凡品阵盘 | formation_disk.mortal | 1 | 凡品 | 金+12 / 土+7 | 玄铁矿块x1(主) | 600息 | forging.copper_array_plate |
| 装备/器物 | 门丁裹头巾 | equip.gate_headcloth | 2 | 黄阶 | 金+5 / 木+5 / 水+2 / 土+2 | 匪徒腰牌x1(主)；鼠尾x1(辅) | 14息 | forging.gate_headcloth |
| 装备/器物 | 越沟快靴 | equip.trench_runner_boots | 2 | 黄阶 | 木+8 / 水+2 / 土+2 | 鼠尾x1(主)；妖兽骨x1(辅) | 14息 | forging.trench_runner_boots |
| 丹药 | 回春散 | pill.minor_heal | 10 | 凡阶 | 木+18 / 水+8 / 土+2 | 月露草x2(主)；妖兽骨x1(辅)；鼠尾x1(辅) | 12息 | alchemy.pill.minor_heal |
| 装备/器物 | 采气木坠 | equip.gather_qi_pendant | 3 | 黄阶 | 木+8 / 水+2 / 土+2 | 妖兽骨x1(主)；鼠尾x1(辅) | 16息 | forging.gather_qi_pendant |
| 装备/器物 | 药烟轻袍 | equip.herb_mist_robe | 3 | 黄阶 | 木+3 / 水+11 / 土+3 | 阴沼丝x1(主)；泽鳞x1(辅) | 16息 | forging.herb_mist_robe |
| 装备/器物 | 矿卫破岩锤 | equip.orebreak_hammer | 3 | 玄阶 | 金+20 / 水+4 / 土+7 | 玄铁矿块x1(主)；晶尘x1(辅) | 18息 | forging.orebreak_hammer |
| 装备/器物 | 熄火矿灯冠 | equip.soot_lamp_hood | 3 | 玄阶 | 金+12 / 水+10 / 土+13 | 玄铁矿块x1(主)；魂墨x1(辅) | 18息 | forging.soot_lamp_hood |
| 装备/器物 | 断碑纹剑 | equip.broken_rune_blade | 4 | 玄阶 | 金+19 / 土+20 | 断纹石片x1(主)；玄铁矿块x1(辅) | 20息 | forging.broken_rune_blade |
| 装备/器物 | 镇煞护心甲 | equip.rift_guard_armor | 4 | 玄阶 | 金+22 / 水+10 / 土+27 | 灵铁碎片x1(主)；断纹石片x1(辅)；魂墨x1(辅) | 22息 | forging.rift_guard_armor |
| 装备/器物 | 噬元骨牌 | equip.soul_devour_token | 4 | 玄阶 | 水+25 / 土+14 | 魂墨x1(主)；虚蚀碎片x1(辅) | 20息 | forging.soul_devour_token |
| 丹药 | 小还灵丹 | minor_qi_pill | 10 | 凡阶 | 金+10 / 木+33 / 水+17 / 土+6 | 月露草x2(主)；青灵茎x1(主)；鼠尾x2(辅)；彘牙x2(辅) | 16息 | alchemy.minor_qi_pill |
| 丹药 | 赤芽丹 | pill.crimson_bud_elixir | 7 | 黄阶 | 金+16 / 木+32 / 水+24 / 火+47 | 赤芽果x2(主)；赤火叶x1(主)；晶尘x2(辅)；竹蛇胆x2(辅) | 20息 | alchemy.pill.crimson_bud_elixir |
| 丹药 | 大还灵丹 | major_qi_pill | 18 | 黄阶 | 金+24 / 木+50 / 水+57 | 青灵茎x1(主)；明心花x1(主)；晶尘x3(辅)；竹蛇胆x3(辅) | 22息 | alchemy.major_qi_pill |
| 丹药 | 寒心膏 | frost_heart_paste | 18 | 黄阶 | 木+68 / 水+99 / 土+23 | 寒莲瓣x1(主)；明心花x1(主)；翠竹心x2(辅)；竹蛇胆x4(辅)；泽鳞x5(辅) | 24息 | alchemy.frost_heart_paste |
| 丹药 | 轻身丹 | pill.windstride_elixir | 11 | 玄阶 | 金+13 / 木+69 / 水+39 / 土+18 | 疾风苇x1(主)；青灵茎x1(主)；阴沼丝x4(辅)；泽鳞x2(辅)；翠竹心x3(辅) | 24息 | alchemy.pill.windstride_elixir |
| 丹药 | 破阵丹 | pill.break_array_elixir | 12 | 玄阶 | 金+23 / 木+23 / 水+60 / 火+5 / 土+36 | 破纹砂x1(主)；疾风苇x1(主)；魂墨x6(辅) | 26息 | alchemy.pill.break_array_elixir |
| 装备/器物 | 黄阶阵盘 | formation_disk.yellow | 13 | 黄阶 | 金+22 / 水+10 / 土+27 | 断纹石片x1(主)；灵铁碎片x1(辅)；魂墨x1(辅) | 600息 | forging.yellow_array_plate |
| 丹药 | 明目丹 | pill.clear_eye_elixir | 13 | 玄阶 | 金+32 / 木+38 / 水+83 / 土+18 | 明心花x1(主)；寒莲瓣x1(主)；晶尘x4(辅)；魂墨x3(辅) | 24息 | alchemy.pill.clear_eye_elixir |
| 装备/器物 | 赤陨灼枪 | equip.ember_scorch_spear | 19 | 黄阶 | 火+54 / 土+30 | 炎髓炭x1(主)；陨火砂x1(辅) | 34息 | forging.ember_scorch_spear |
| 装备/器物 | 寒汐引流尺 | equip.hanxi_flow_ruler | 19 | 黄阶 | 金+15 / 水+54 / 土+15 | 寒魄露x1(主)；月井冰砂x1(辅) | 34息 | forging.hanxi_flow_ruler |
| 装备/器物 | 归息铜佩 | equip.returnbreath_copper_pendant | 19 | 黄阶 | 金+15 / 水+54 / 土+15 | 寒魄露x1(主)；月井冰砂x1(辅) | 34息 | forging.returnbreath_copper_pendant |
| 装备/器物 | 裂痕踏靴 | equip.scar_tread_boots | 19 | 黄阶 | 金+27 / 水+15 / 土+42 | 残兵铁片x1(主)；承脉石x1(辅) | 34息 | forging.scar_tread_boots |
| 装备/器物 | 青萝束冠 | equip.verdant_crown | 19 | 黄阶 | 木+73 / 水+15 / 土+24 | 青髓藤x1(主)；生灵木心x1(辅) | 34息 | forging.verdant_crown |
| 装备/器物 | 养枝引脉杖 | equip.vineguide_staff | 19 | 黄阶 | 木+73 / 水+15 / 土+24 | 青髓藤x1(主)；生灵木心x1(辅) | 34息 | forging.vineguide_staff |
| 丹药 | 苦修丹 | pill.bitter_cultivation_elixir | 20 | 黄阶 | 金+60 / 木+74 / 水+64 / 土+86 | 苦心藤x1(主)；明心花x1(主)；狼牙x6(辅)；魂墨x5(辅) | 32息 | alchemy.pill.bitter_cultivation_elixir |
| 丹药 | 引基散 | pill.guiding_powder | 20 | 黄阶 | 木+142 / 水+52 / 土+24 | 长脉藤x2(主)；回春叶x1(主)；生灵木心x1(辅) | 34息 | alchemy.pill.guiding_powder |
| 装备/器物 | 净潮法衣 | equip.cleantide_robe | 21 | 黄阶 | 金+15 / 木+24 / 水+73 | 净潮水精x1(主)；寒魄露x1(辅) | 38息 | forging.cleantide_robe |
| 丹药 | 回灵散 | recovery_powder | 30 | 玄阶 | 木+74 / 水+141 | 寒髓苇x2(主)；月井蕊x1(主)；净潮水精x1(辅) | 34息 | alchemy.recovery_powder |
| 丹药 | 镇脉丸 | stabilizing_pellet | 30 | 玄阶 | 木+56 / 水+24 / 土+147 | 承脉参x2(主)；岩髓芝x1(主)；镇岳石胆x1(辅) | 38息 | alchemy.stabilizing_pellet |
| 装备/器物 | 逐锋履 | equip.chasing_edge_boots | 23 | 黄阶 | 金+54 / 火+15 / 土+15 | 残兵铁片x1(主)；剑丸x1(辅) | 42息 | forging.chasing_edge_boots |
| 装备/器物 | 坠岩槌 | equip.fallrock_maul | 23 | 黄阶 | 金+15 / 水+15 / 土+54 | 厚岩核x1(主)；承脉石x1(辅) | 42息 | forging.fallrock_maul |
| 装备/器物 | 满锋刀 | equip.full_edge_blade | 23 | 黄阶 | 金+54 / 火+15 / 土+15 | 剑丸x1(主)；残兵铁片x1(辅) | 42息 | forging.full_edge_blade |
| 装备/器物 | 岭垣甲 | equip.ridgewall_armor | 23 | 黄阶 | 金+15 / 水+15 / 土+54 | 承脉石x1(主)；厚岩核x1(辅) | 42息 | forging.ridgewall_armor |
| 装备/器物 | 砂魇面 | equip.sand_ghost_mask | 23 | 黄阶 | 金+42 / 水+27 / 土+15 | 残兵铁片x1(主)；寒魄露x1(辅) | 42息 | forging.sand_ghost_mask |
| 装备/器物 | 护脉石 | equip.shieldvein_stone | 23 | 黄阶 | 金+15 / 水+42 / 土+27 | 承脉石x1(主)；寒魄露x1(辅) | 42息 | forging.shieldvein_stone |
| 丹药 | 淬锋散 | pill.edge_quenching_powder | 23 | 玄阶 | 金+143 / 木+36 / 火+24 / 土+16 | 金芒棘x2(主)；铁脉蒺x1(主)；锋纹残晶x1(辅) | 38息 | alchemy.pill.edge_quenching_powder |
| 装备/器物 | 裂锋披 | equip.cleft_blade_cloak | 25 | 玄阶 | 金+73 / 火+24 / 土+15 | 锋纹残晶x1(主)；残兵铁片x1(辅) | 48息 | forging.cleft_blade_cloak |
| 装备/器物 | 御土面 | equip.yuetown_mask | 25 | 玄阶 | 水+39 / 土+73 | 镇岳石胆x1(主)；承脉石x1(辅) | 48息 | forging.yuetown_mask |
| 装备/器物 | 玄阶阵盘 | formation_disk.mystic | 25 | 玄阶 | 金+77 / 木+31 / 水+55 / 火+55 / 土+76 | 锋纹残晶x1(主)；镇岳石胆x1(辅)；五炁尘x1(辅) | 900息 | forging.mystic_array_plate |
| 装备/器物 | 炉心赤戒 | equip.furnace_red_ring | 26 | 玄阶 | 金+24 / 火+73 / 土+15 | 炉心赤晶x1(主)；陨火砂x1(辅) | 50息 | forging.furnace_red_ring |
| 丹药 | 赤阳液 | pill.chiyang_draught | 26 | 玄阶 | 金+24 / 木+57 / 火+152 | 灼心瓣x2(主)；炎穗芒x1(主)；炉心赤晶x1(辅) | 40息 | alchemy.pill.chiyang_draught |
| 装备/器物 | 厚脉核 | equip.deepvein_core | 29 | 玄阶 | 金+69 / 木+31 / 水+56 / 火+31 / 土+94 | 归藏脉核x1(主)；五炁尘x1(辅) | 56息 | forging.deepvein_core |
| 装备/器物 | 庚门断锋 | equip.geng_gate_blade | 29 | 玄阶 | 金+104 / 木+31 / 水+31 / 火+70 / 土+30 | 锋纹残晶x1(主)；剑丸x1(辅)；五炁尘x1(辅) | 56息 | forging.geng_gate_blade |
| 装备/器物 | 归藏合流刃 | equip.guizang_conflux_blade | 29 | 玄阶 | 金+69 / 木+31 / 水+56 / 火+31 / 土+94 | 归藏脉核x1(主)；五炁尘x1(辅) | 56息 | forging.guizang_conflux_blade |
| 装备/器物 | 镇岭盔 | equip.mount_guard_helm | 29 | 玄阶 | 金+15 / 水+24 / 土+73 | 镇岳石胆x1(主)；厚岩核x1(辅) | 56息 | forging.mount_guard_helm |
| 装备/器物 | 封岳甲 | equip.mountainseal_plate | 29 | 玄阶 | 金+38 / 水+49 / 土+110 | 镇岳石胆x1(主)；归藏脉核x1(辅) | 56息 | forging.mountainseal_plate |
| 装备/器物 | 赤纹丹炉 | equip.qi_crimson_pattern_furnace | 29 | 玄阶 | 金+24 / 木+24 / 水+46 / 火+46 | 炉心赤晶x1(主)；净潮水精x1(辅) | 58息 | forging.qi_crimson_pattern_furnace |
| 装备/器物 | 锋岳炼器钳 | equip.qi_fengyue_forging_tongs | 29 | 玄阶 | 金+46 / 水+24 / 火+24 / 土+46 | 锋纹残晶x1(主)；镇岳石胆x1(辅) | 58息 | forging.qi_fengyue_forging_tongs |
| 装备/器物 | 五炁强化锤 | equip.qi_fivephase_enhancement_hammer | 29 | 玄阶 | 金+46 / 木+31 / 水+31 / 火+31 / 土+57 | 五炁尘x1(主)；厚岩核x1(辅) | 58息 | forging.qi_fivephase_enhancement_hammer |
| 装备/器物 | 归藏矿镐 | equip.qi_guizang_mining_pickaxe | 29 | 玄阶 | 金+65 / 水+25 / 土+79 | 归藏脉核x1(主)；残兵铁片x1(辅) | 58息 | forging.qi_guizang_mining_pickaxe |
| 装备/器物 | 半基营造锤 | equip.qi_halfbase_building_hammer | 29 | 玄阶 | 木+84 / 水+25 / 土+88 | 半基灵胚x1(主)；生灵木心x1(辅) | 58息 | forging.qi_halfbase_building_hammer |
| 装备/器物 | 回阵行履 | equip.returnarray_boots | 29 | 玄阶 | 金+31 / 木+69 / 水+56 / 火+31 / 土+94 | 半基灵胚x1(主)；五炁尘x1(辅) | 56息 | forging.returnarray_boots |
| 装备/器物 | 裂岭戟 | equip.ridgecleft_halberd | 29 | 玄阶 | 金+27 / 水+24 / 火+15 / 土+46 | 镇岳石胆x1(主)；剑丸x1(辅) | 56息 | forging.ridgecleft_halberd |
| 装备/器物 | 封路令 | equip.sealed_path_token | 29 | 玄阶 | 金+46 / 水+15 / 火+24 / 土+27 | 锋纹残晶x1(主)；承脉石x1(辅) | 56息 | forging.sealed_path_token |
| 丹药 | 五和丸 | pill.fivephase_harmony_pellet | 30 | 地阶 | 金+33 / 木+209 / 水+114 / 火+36 / 土+58 | 长脉藤x2(主)；寒髓苇x1(主)；灼心瓣x1(辅)；承脉参x1(辅)；金芒棘x1(辅)；生灵木心x1(辅)；净潮水精x1(辅) | 48息 | alchemy.pill.fivephase_harmony_pellet |
| 装备/器物 | 地阶阵盘 | formation_disk.earth | 37 | 地阶 | 金+171 / 木+171 / 水+171 / 火+171 / 土+167 | 五行脉晶x1(主)；五行混元精x1(辅)；五行蟾液x1(辅) | 1200息 | forging.earth_array_plate |
| 装备/器物 | 深渊寿甲 | equip.foundation_abyss_life_armor | 40 | 地阶 | 水+114 / 土+211 | 深渊灵泥x1(主)；石蟾皮x1(辅) | 72息 | forging.foundation_abyss_life_armor |
| 装备/器物 | 焚元丹炉 | equip.foundation_burning_origin_furnace | 40 | 地阶 | 金+55 / 木+117 / 水+55 / 火+170 / 土+55 | 焚王余烬x1(主)；五行蟾液x1(辅) | 70息 | forging.foundation_burning_origin_furnace |
| 装备/器物 | 寒渊法尺 | equip.foundation_cold_abyss_spell_ruler | 40 | 地阶 | 金+81 / 木+38 / 水+221 | 冰蛛内核x1(主)；寒蛇胆x1(辅)；霜刃晶x1(辅) | 72息 | forging.foundation_cold_abyss_spell_ruler |
| 装备/器物 | 寒铁重盔 | equip.foundation_coldiron_heavy_helm | 40 | 地阶 | 金+133 / 水+30 / 土+42 | 寒铁甲壳x1(主)；铁甲碎片x1(辅) | 72息 | forging.foundation_coldiron_heavy_helm |
| 装备/器物 | 玄壤强化锤 | equip.foundation_darksoil_enhancement_hammer | 40 | 地阶 | 金+121 / 木+58 / 水+58 / 火+58 / 土+174 | 五行脉晶x1(主)；玄壤精土x1(辅) | 70息 | forging.foundation_darksoil_enhancement_hammer |
| 装备/器物 | 玄土命盔 | equip.foundation_darksoil_life_helm | 40 | 地阶 | 金+96 / 土+176 | 土虫内核x1(主)；玄土甲壳x1(辅) | 72息 | forging.foundation_darksoil_life_helm |
| 装备/器物 | 深铁炼器钳 | equip.foundation_deepiron_forging_tongs | 40 | 地阶 | 金+135 / 水+57 / 火+103 / 土+99 | 深渊铁精x1(主)；熔核碎片x1(辅) | 70息 | forging.foundation_deepiron_forging_tongs |
| 装备/器物 | 蚀命攻甲 | equip.foundation_devour_attack_armor | 40 | 地阶 | 金+58 / 木+170 / 水+58 / 火+117 / 土+58 | 噬脉兽核x1(主)；木火精华x1(辅) | 72息 | forging.foundation_devour_attack_armor |
| 装备/器物 | 地龙矿镐 | equip.foundation_dragonspine_mining_pickaxe | 40 | 地阶 | 金+66 / 水+66 / 土+248 | 地龙脊骨x1(主)；深渊土精x1(辅) | 70息 | forging.foundation_dragonspine_mining_pickaxe |
| 装备/器物 | 地龙疾履 | equip.foundation_dragonstride_boots | 40 | 地阶 | 金+66 / 水+66 / 土+248 | 地龙脊骨x1(主)；深渊土精x1(辅) | 72息 | forging.foundation_dragonstride_boots |
| 装备/器物 | 五行出灵坠 | equip.foundation_fivephase_output_pendant | 40 | 地阶 | 金+116 / 木+116 / 水+116 / 火+116 / 土+112 | 五行脉晶x1(主)；五行混元精x1(辅) | 72息 | forging.foundation_fivephase_output_pendant |
| 装备/器物 | 焚心法佩 | equip.foundation_flameheart_charm | 40 | 地阶 | 木+158 / 火+142 | 焰狐火核x1(主)；木火道种x1(辅) | 72息 | forging.foundation_flameheart_charm |
| 装备/器物 | 霜裂爆锋 | equip.foundation_frostsplit_crit_blade | 40 | 地阶 | 金+113 / 木+38 / 水+185 | 霜刃晶x1(主)；蝎毒囊x1(辅)；寒蛇胆x1(辅) | 72息 | forging.foundation_frostsplit_crit_blade |
| 装备/器物 | 冰心法冠 | equip.foundation_iceheart_spell_crown | 40 | 地阶 | 金+41 / 木+30 / 水+133 | 冰晶丝x1(主)；冰蛛内核x1(辅) | 72息 | forging.foundation_iceheart_spell_crown |
| 装备/器物 | 逆命战冠 | equip.foundation_inverse_life_war_crown | 40 | 地阶 | 金+44 / 木+43 / 水+66 / 火+80 / 土+110 | 焰狐火核x1(主)；地脉蜈毒x1(辅) | 72息 | forging.foundation_inverse_life_war_crown |
| 装备/器物 | 铁魄断山刃 | equip.foundation_iron_soul_blade | 40 | 地阶 | 金+144 / 水+57 / 土+127 | 深渊铁精x1(主)；裂地蜈牙x1(辅) | 72息 | forging.foundation_iron_soul_blade |
| 装备/器物 | 铁甲玄胄 | equip.foundation_ironshell_plate | 40 | 地阶 | 金+103 / 水+30 / 土+88 | 寒铁甲壳x1(主)；玄土甲壳x1(辅) | 72息 | forging.foundation_ironshell_plate |
| 装备/器物 | 混元护身甲 | equip.foundation_mixed_body_armor | 40 | 地阶 | 金+87 / 木+55 / 水+105 / 火+55 / 土+138 | 混元蟾珠x1(主)；五行蟾液x1(辅) | 72息 | forging.foundation_mixed_body_armor |
| 装备/器物 | 混元双仪剑 | equip.foundation_mixed_dual_sword | 40 | 地阶 | 金+116 / 木+116 / 水+116 / 火+114 / 土+114 | 五行脉晶x1(主)；噬脉兽核x1(辅) | 72息 | forging.foundation_mixed_dual_sword |
| 装备/器物 | 混元护神冠 | equip.foundation_mixed_guard_crown | 40 | 地阶 | 金+110 / 木+110 / 水+110 / 火+110 / 土+110 | 混元脉石x1(主)；五行蟾液x1(辅) | 72息 | forging.foundation_mixed_guard_crown |
| 装备/器物 | 混元营造锤 | equip.foundation_mixed_origin_building_hammer | 40 | 地阶 | 金+55 / 木+167 / 水+55 / 火+116 / 土+55 | 混元脉石x1(主)；木火精华x1(辅) | 70息 | forging.foundation_mixed_origin_building_hammer |
| 装备/器物 | 断岳指环 | equip.foundation_mountainbreaker_ring | 40 | 地阶 | 金+115 / 土+214 | 裂地蜈牙x1(主)；地龙内丹x1(辅) | 72息 | forging.foundation_mountainbreaker_ring |
| 装备/器物 | 静玄修真佩 | equip.foundation_quiet_cultivation_pendant | 40 | 地阶 | 金+121 / 木+58 / 水+58 / 火+58 / 土+174 | 玄壤精土x1(主)；五行混元精x1(辅) | 72息 | forging.foundation_quiet_cultivation_pendant |
| 装备/器物 | 归息玄杖 | equip.foundation_returnbreath_cooldown_staff | 40 | 地阶 | 金+55 / 木+55 / 水+133 / 火+55 / 土+97 | 玄龟寒髓x1(主)；混元脉石x1(辅) | 72息 | forging.foundation_returnbreath_cooldown_staff |
| 装备/器物 | 回息玄履 | equip.foundation_returnflow_boots | 40 | 地阶 | 金+69 / 水+127 | 霜鳞片x1(主)；霜刃晶x1(辅) | 72息 | forging.foundation_returnflow_boots |
| 装备/器物 | 归息玄佩 | equip.foundation_returnflow_pendant | 40 | 地阶 | 金+55 / 木+55 / 水+133 / 火+55 / 土+97 | 玄龟寒髓x1(主)；混元脉石x1(辅) | 72息 | forging.foundation_returnflow_pendant |
| 装备/器物 | 玄龟法衣 | equip.foundation_turtle_spell_robe | 40 | 地阶 | 金+29 / 木+30 / 水+189 / 土+42 | 玄龟寒髓x1(主)；冰晶丝x1(辅)；霜鳞片x1(辅) | 72息 | forging.foundation_turtle_spell_robe |

## 材料五行与出处

共 106 个材料。

| 境界 | 名称 | itemId | 等级 | 品阶 | 五行 | 分类 | 出处 |
|---|---|---|---:|---|---|---|---|
| 凡人期 | 妖兽骨 | mat.beast_bone | 1 | 凡品 | 木+3 / 土+2 | exotic | 怪物掉落:噬魂兽谷/裂齿妖狼x1；怪物掉落:荒野/獠牙野彘x1 |
| 凡人期 | 匪徒腰牌 | bandit_insignia | 2 | 凡品 | 金+5 / 土+2 | exotic | 怪物掉落:荒野/荒野匪徒x1；怪物掉落:云来镇/断路暴徒x1；怪物掉落:云来镇/夜行刀客x1；探索:荒野/undefinedx2 |
| 凡人期 | 鼠尾 | rat_tail | 2 | 凡品 | 木+5 / 水+2 | exotic | 怪物掉落:云来镇/废棚灰尾鼠x1；怪物掉落:云来镇/南沟灰尾鼠x1 |
| 凡人期 | 破纹砂 | mat.breakarray_shard | 3 | 玄阶 | 金+10 / 火+5 | ore | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:玄铁矿洞/undefinedx1 |
| 凡人期 | 阴沼丝 | spider_silk | 3 | 凡品 | 木+3 / 水+5 | exotic | 怪物掉落:荒野/阴沼毒蛛精英x1；怪物掉落:荒野·荒骨风穴/裂风荒王x1 |
| 凡人期 | 月露草 | mat.moondew_grass | 3 | 凡品 | 木+5 / 水+3 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:云来镇/undefinedx1 |
| 凡人期 | 彘牙 | boar_tusk | 3 | 凡品 | 金+5 / 土+3 | exotic | 怪物掉落:荒野/獠牙野彘x1 |
| 凡人期 | 泽鳞 | lizard_scale | 4 | 凡品 | 水+6 / 土+3 | exotic | 怪物掉落:荒野/泽鳞蜥x1 |
| 凡人期 | 翠竹心 | bamboo_heart | 5 | 凡品 | 木+7 / 土+4 | exotic | 怪物掉落:青竹林/竹心灵x1；怪物掉落:青竹林·青螂巢庭/青皇竹螂x1；怪物掉落:荒野/泽鳞蜥x1 |
| 凡人期 | 晶尘 | crystal_dust | 6 | 凡品 | 金+8 / 水+4 | ore | 怪物掉落:玄铁矿洞/晶背蝠x1；怪物掉落:玄铁矿洞·玄脉熔心/噬铁矿君x1；探索:玄铁矿洞/undefinedx2 |
| 凡人期 | 竹蛇胆 | serpent_gall | 6 | 凡品 | 木+4 / 水+8 | exotic | 怪物掉落:青竹林/青鳞竹蛇x1 |
| 凡人期 | 赤芽果 | mat.bloodbud_fruit | 7 | 黄阶 | 木+6 / 火+12 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:荒野/undefinedx1 |
| 凡人期 | 狼牙 | wolf_fang | 8 | 凡品 | 金+10 / 土+5 | exotic | 怪物掉落:青竹林/噬灵狼x1 |
| 凡人期 | 青灵茎 | mat.green_spirit_stem | 8 | 黄阶 | 木+13 / 水+7 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:云来镇/undefinedx1 |
| 凡人期 | 魂墨 | soul_ink | 9 | 凡品 | 水+10 / 土+6 | exotic | 怪物掉落:断碑遗迹/骨翎夜鸮x1；怪物掉落:断碑遗迹/执墨残魂x1；怪物掉落:断碑遗迹·断碑主殿/裂碑司命x1 |
| 凡人期 | 螳锋 | mantis_blade | 10 | 凡品 | 金+12 / 木+6 | exotic | 怪物掉落:青竹林/刃竹螳精英x1；怪物掉落:青竹林·青螂巢庭/青皇竹螂x1 |
| 凡人期 | 谷蛇逆鳞 | serpent_scale | 11 | 凡品 | 金+7 / 水+12 | exotic | 怪物掉落:噬魂兽谷/赤脊谷蛇x1 |
| 凡人期 | 玄铁矿块 | black_iron_chunk | 11 | 凡品 | 金+12 / 土+7 | ore | 怪物掉落:玄铁矿洞/矿魈x1；怪物掉落:玄铁矿洞/玄矿巨像精英x1；怪物掉落:玄铁矿洞/隧影潜猎者x1；怪物掉落:玄铁矿洞·玄脉熔心/噬铁矿君x1；采矿:玄铁矿洞/undefinedx1；采矿:玄铁矿洞/undefinedx1；采矿:玄铁矿洞/undefinedx1；探索:玄铁矿洞/undefinedx2 |
| 凡人期 | 断纹石片 | rune_shard | 12 | 凡品 | 金+7 / 土+13 | ore | 怪物掉落:断碑遗迹/执墨残魂x1；怪物掉落:断碑遗迹/石卫傀x1；怪物掉落:断碑遗迹/残纹看守精英x1；怪物掉落:断碑遗迹·断碑主殿/裂碑司命x1 |
| 凡人期 | 寒莲瓣 | mat.frost_lotus_petal | 12 | 玄阶 | 木+13 / 水+23 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:寒汐泽/undefinedx1 |
| 凡人期 | 疾风苇 | mat.swiftwind_reed | 12 | 玄阶 | 金+13 / 木+23 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:青竹林/undefinedx1 |
| 凡人期 | 岭兽爪 | ridge_beast_claw | 12 | 凡品 | 金+13 / 土+7 | exotic | 怪物掉落:灵脊岭/灵脊虎x1；怪物掉落:灵脊岭·悬门旧关/镇脊关主x1；探索:灵脊岭/undefinedx2 |
| 凡人期 | 明心花 | mat.clear_mind_flower | 13 | 玄阶 | 木+25 / 水+14 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:青竹林/undefinedx1 |
| 凡人期 | 霜华精粹 | frost_essence | 13 | 凡品 | 金+8 / 水+14 | exotic | 怪物掉落:灵脊岭/寒翎鹤x1；怪物掉落:灵脊岭·悬门旧关/镇脊关主x1；探索:灵脊岭/undefinedx1 |
| 凡人期 | 灵铁碎片 | spirit_iron_fragment | 14 | 凡品 | 金+15 / 土+8 | ore | 怪物掉落:玄铁矿洞/玄矿巨像精英x1；怪物掉落:玄铁矿洞·玄脉熔心/噬铁矿君x1；任务:q_ruin_innate |
| 凡人期 | 虚蚀碎片 | void_shard | 14 | 凡品 | 水+15 / 土+8 | exotic | 怪物掉落:天穹残宫/天宫猎者x1；怪物掉落:天穹残宫·封天核心井/坠星宫主x1；怪物掉落:灵脊岭/守岭残魂精英x1；探索:天穹残宫/undefinedx1 |
| 凡人期 | 星陨金 | star_metal | 15 | 凡品 | 金+16 / 火+8 | ore | 怪物掉落:天穹残宫/噬星残兽精英x1；怪物掉落:天穹残宫/天宫猎者x1；怪物掉落:天穹残宫·封天核心井/坠星宫主x1；探索:天穹残宫/undefinedx2 |
| 凡人期 | 妖狼骨 | demon_wolf_bone | 15 | 凡品 | 火+8 / 土+16 | exotic | 怪物掉落:噬魂兽谷/裂渊狼主x1；怪物掉落:噬魂兽谷/裂渊谷皇精英x1；怪物掉落:噬魂兽谷/裂齿妖狼x1；怪物掉落:噬魂兽谷·血祭坛/噬魂狼祖x1 |
| 凡人期 | 赤火叶 | mat.red_flame_leaf | 16 | 黄阶 | 木+12 / 火+23 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:荒野/undefinedx1 |
| 凡人期 | 天纹残页 | sky_pattern_page | 16 | 凡品 | 金+17 / 木+9 | exotic | 怪物掉落:天穹残宫/残宫傀仪x1 |
| 凡人期 | 血羽 | blood_feather | 17 | 凡品 | 木+9 / 火+18 | exotic | 怪物掉落:噬魂兽谷/血羽鸦x1；怪物掉落:噬魂兽谷·血祭坛/噬魂狼祖x1；怪物掉落:荒野/裂喙秃鹫x1；怪物掉落:荒野·荒骨风穴/裂风荒王x1 |
| 练气期 | 残兵铁片 | cleft_iron_fragment | 20 | 黄阶 | 金+27 / 土+15 | ore | 怪物掉落:裂锋原/金砂锋魈x1；怪物掉落:裂锋原/断刃游魂x1；怪物掉落:裂锋原/裂甲砂兵x1 |
| 练气期 | 承脉石 | earthbearing_stone | 20 | 黄阶 | 水+15 / 土+27 | ore | 怪物掉落:厚脉岭/坠岩甲灵x1；怪物掉落:厚脉岭/黄岩鼍兽x1；怪物掉落:厚脉岭/玄岳地傀x1；怪物掉落:厚脉岭/裂岭重卫x1；怪物掉落:厚脉岭/岳纹镇灵x1；怪物掉落:厚脉岭/厚土负碑者x1；怪物掉落:厚脉岭/沉脉石奴x1 |
| 练气期 | 寒魄露 | coldspirit_dew | 20 | 黄阶 | 金+15 / 水+27 | exotic | 怪物掉落:寒汐泽/玄溟螭影x1；怪物掉落:寒汐泽/雾桥巡灵x1；怪物掉落:寒汐泽/浅泽雾鬼x1；怪物掉落:寒汐泽/寒宫镜妖x1；怪物掉落:寒汐泽/月沼鲛影x1；怪物掉落:寒汐泽/冰纹水卒x1；怪物掉落:寒汐泽/寒汐蜉灵x1 |
| 练气期 | 厚岩核 | thickrock_core | 20 | 黄阶 | 金+15 / 土+27 | ore | 怪物掉落:厚脉岭/坠岩甲灵x1；怪物掉落:厚脉岭/黄岩鼍兽x1；怪物掉落:厚脉岭/沉脉石奴x1 |
| 练气期 | 剑丸 | sword_pellet | 20 | 黄阶 | 金+27 / 火+15 | exotic | 怪物掉落:裂锋原/残兵鸣将x1；怪物掉落:裂锋原/金砂锋魈x1；怪物掉落:裂锋原/断刃游魂x1；怪物掉落:裂锋原/庚金镇门将x1；怪物掉落:裂锋原/残旌铁卫x1；怪物掉落:裂锋原/裂甲砂兵x1；怪物掉落:裂锋原/断碑锋傀x1 |
| 凡人期 | 苦心藤 | mat.bitterheart_vine | 20 | 地阶 | 木+49 / 土+26 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:青萝谷·01回渡药圃/undefinedx1；探索:青萝谷·02引藤坡/undefinedx1；探索:青萝谷·03双桥岔谷/undefinedx1；探索:青萝谷·04噬灵妖圃/undefinedx1；探索:青萝谷·05盘根内坳/undefinedx1；探索:青萝谷·06心藤坳口/undefinedx1 |
| 练气期 | 青髓藤 | verdant_vine | 20 | 黄阶 | 木+27 / 水+15 | exotic | 怪物掉落:青萝谷·01回渡药圃/青萝小妖x1；怪物掉落:青萝谷·02引藤坡/青萝小妖x1；怪物掉落:青萝谷·02引藤坡/寄脉藤童x1；怪物掉落:青萝谷·03双桥岔谷/寄脉藤童x1；怪物掉落:青萝谷·03双桥岔谷/吸灵花妖x1；怪物掉落:青萝谷·04噬灵妖圃/吸灵花妖x1；怪物掉落:青萝谷·04噬灵妖圃/枯荣藤卫x1；怪物掉落:青萝谷·05盘根内坳/碧髓树魈x1；... |
| 凡人期 | 融阳子 | mat.sunmelt_seed | 20 | 地阶 | 火+49 / 土+26 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:赤陨庭/undefinedx1 |
| 练气期 | 炎髓炭 | embershard_char | 20 | 黄阶 | 火+27 / 土+15 | exotic | 怪物掉落:赤陨庭/熔纹火蜥x1；怪物掉落:赤陨庭/焦土火蛾x1；怪物掉落:赤陨庭/赤烬蜥幼x1 |
| 练气期 | 月井冰砂 | moonwell_frost_sand | 20 | 黄阶 | 水+27 / 土+15 | ore | 怪物掉落:寒汐泽/浅泽雾鬼x1；怪物掉落:寒汐泽/冰纹水卒x1；怪物掉落:寒汐泽/寒汐蜉灵x1 |
| 练气期 | 陨火砂 | ember_sand | 20 | 黄阶 | 火+27 / 土+15 | ore | 怪物掉落:赤陨庭/炉心灼侍x1；怪物掉落:赤陨庭/炽骨巡卒x1；怪物掉落:赤陨庭/流火戍灵x1；怪物掉落:赤陨庭/离火炉君x1；怪物掉落:赤陨庭/熔纹火蜥x1；怪物掉落:赤陨庭/焦土火蛾x1；怪物掉落:赤陨庭/赤烬蜥幼x1 |
| 练气期 | 回春叶 | mat.returnspring_leaf | 22 | 黄阶 | 木+30 / 水+16 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:青萝谷·01回渡药圃/undefinedx1；探索:青萝谷·02引藤坡/undefinedx1；探索:青萝谷·03双桥岔谷/undefinedx1；探索:青萝谷·04噬灵妖圃/undefinedx1；探索:青萝谷·05盘根内坳/undefinedx1；探索:青萝谷·06心藤坳口/undefinedx1 |
| 练气期 | 铁脉蒺 | mat.ironvein_caltrop | 23 | 黄阶 | 金+31 / 土+16 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:裂锋原/undefinedx1 |
| 练气期 | 月井蕊 | mat.moonwell_stamen | 23 | 黄阶 | 木+16 / 水+31 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:寒汐泽/undefinedx1 |
| 练气期 | 寒髓苇 | mat.coldmarrow_reed | 24 | 黄阶 | 木+17 / 水+32 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:寒汐泽/undefinedx1 |
| 练气期 | 金芒棘 | mat.goldthread_briar | 25 | 黄阶 | 金+33 / 木+18 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:裂锋原/undefinedx1 |
| 练气期 | 岩髓芝 | mat.stonecore_lingzhi | 25 | 黄阶 | 木+18 / 土+33 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:厚脉岭/undefinedx1 |
| 练气期 | 长脉藤 | mat.longvein_vine | 25 | 黄阶 | 木+33 / 水+18 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:青萝谷·01回渡药圃/undefinedx1；探索:青萝谷·02引藤坡/undefinedx1；探索:青萝谷·03双桥岔谷/undefinedx1；探索:青萝谷·04噬灵妖圃/undefinedx1；探索:青萝谷·05盘根内坳/undefinedx1；探索:青萝谷·06心藤坳口/undefinedx1 |
| 练气期 | 承脉参 | mat.bearingroot_ginseng | 26 | 黄阶 | 木+19 / 土+34 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:厚脉岭/undefinedx1 |
| 练气期 | 锋纹残晶 | blade_pattern_crystal | 26 | 玄阶 | 金+46 / 火+24 | ore | 怪物掉落:裂锋原/残兵鸣将x1；怪物掉落:裂锋原/庚金镇门将x1；怪物掉落:裂锋原/残旌铁卫x1；怪物掉落:裂锋原/断碑锋傀x1 |
| 练气期 | 净潮水精 | cleantide_essence | 26 | 玄阶 | 木+24 / 水+46 | exotic | 怪物掉落:寒汐泽/玄溟螭影x1；怪物掉落:寒汐泽/雾桥巡灵x1；怪物掉落:寒汐泽/寒宫镜妖x1；怪物掉落:寒汐泽/月沼鲛影x1 |
| 练气期 | 炉心赤晶 | furnace_red_crystal | 26 | 玄阶 | 金+24 / 火+46 | ore | 怪物掉落:赤陨庭/炉心灼侍x1；怪物掉落:赤陨庭/炽骨巡卒x1；怪物掉落:赤陨庭/流火戍灵x1；怪物掉落:赤陨庭/离火炉君x1 |
| 练气期 | 生灵木心 | spiritwood_heart | 26 | 玄阶 | 木+46 / 土+24 | exotic | 怪物掉落:青萝谷·04噬灵妖圃/枯荣藤卫x1；怪物掉落:青萝谷·05盘根内坳/碧髓树魈x1；怪物掉落:青萝谷·05盘根内坳/枯荣藤卫x1；怪物掉落:青萝谷·06心藤坳口/碧髓树魈x1；怪物掉落:青萝谷·06心藤坳口/噬脉藤母x1 |
| 练气期 | 炎穗芒 | mat.flamegrain_spike | 26 | 黄阶 | 木+19 / 火+34 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:赤陨庭/undefinedx1 |
| 练气期 | 镇岳石胆 | stonegall_core | 26 | 玄阶 | 水+24 / 土+46 | ore | 怪物掉落:厚脉岭/玄岳地傀x1；怪物掉落:厚脉岭/裂岭重卫x1；怪物掉落:厚脉岭/岳纹镇灵x1；怪物掉落:厚脉岭/厚土负碑者x1 |
| 练气期 | 灼心瓣 | mat.scorchheart_petal | 27 | 黄阶 | 木+19 / 火+36 | herb | 怪物掉落:破败洞府/重伤的唤灵真人x50；探索:赤陨庭/undefinedx1 |
| 练气期 | 五炁尘 | fivephase_dust | 29 | 地阶 | 金+31 / 木+31 / 水+31 / 火+31 / 土+30 | ore | 怪物掉落:归藏脉窟/乱炁守侍x1；怪物掉落:归藏脉窟/双相脉兽x1；怪物掉落:归藏脉窟/五炁砂偶x1；怪物掉落:归藏脉窟/逆流残侍x1；怪物掉落:归藏脉窟/乱基守遗x1；怪物掉落:归藏脉窟/错脉游灵x1 |
| 练气期 | 半基灵胚 | half_base_embryo | 30 | 地阶 | 木+38 / 水+25 / 土+64 | exotic | 怪物掉落:归藏脉窟/未成道基x1 |
| 练气期 | 归藏脉核 | guizang_vein_core | 30 | 地阶 | 金+38 / 水+25 / 土+64 | ore | 怪物掉落:归藏脉窟/乱炁守侍x1；怪物掉落:归藏脉窟/双相脉兽x1；怪物掉落:归藏脉窟/未成道基x1；怪物掉落:归藏脉窟/五炁砂偶x1；怪物掉落:归藏脉窟/逆流残侍x1；怪物掉落:归藏脉窟/乱基守遗x1；怪物掉落:归藏脉窟/错脉游灵x1 |
| 练气期 | 养脉叶 | nurturing_leaf | 30 | 黄阶 | 木+39 / 水+21 | herb | 怪物掉落:青萝谷·01回渡药圃/青萝小妖x1；怪物掉落:青萝谷·02引藤坡/青萝小妖x1；怪物掉落:青萝谷·02引藤坡/寄脉藤童x1；怪物掉落:青萝谷·03双桥岔谷/寄脉藤童x1；怪物掉落:青萝谷·03双桥岔谷/吸灵花妖x1；怪物掉落:青萝谷·04噬灵妖圃/吸灵花妖x1 |
| 筑基期 | 寒蛇胆 | mat.cold_serpent_gall | 31 | 地阶 | 木+38 / 水+72 | exotic | 怪物掉落:霜刃渊/霜鳞蛇x1 |
| 筑基期 | 霜鳞片 | mat.frost_scale | 31 | 玄阶 | 金+29 / 水+54 | exotic | 怪物掉落:霜刃渊/霜鳞蛇x1 |
| 筑基期 | 寒铁甲壳 | mat.cold_iron_carapace | 32 | 玄阶 | 金+55 / 水+30 | ore | 怪物掉落:霜刃渊/寒铁蝎x1 |
| 筑基期 | 寒铁碎 | mat.cold_iron_shard | 32 | 地阶 | 金+73 / 水+40 | ore | 探索:霜刃渊/undefinedx1 |
| 筑基期 | 霜刃晶 | mat.frost_crystal | 32 | 地阶 | 金+40 / 水+73 | ore | 探索:霜刃渊/undefinedx1 |
| 筑基期 | 蝎毒囊 | mat.scorpion_venom_sac | 32 | 地阶 | 金+73 / 水+40 | exotic | 怪物掉落:霜刃渊/寒铁蝎x1 |
| 筑基期 | 冰晶丝 | mat.ice_crystal_silk | 33 | 玄阶 | 木+30 / 水+57 | exotic | 怪物掉落:霜刃渊/冰晶蜘蛛x1 |
| 筑基期 | 冰蛛内核 | mat.frozen_spider_core | 33 | 地阶 | 金+41 / 水+76 | exotic | 怪物掉落:霜刃渊/冰晶蜘蛛x1 |
| 筑基期 | 渊水苔 | mat.deepwater_moss | 33 | 地阶 | 木+76 / 水+41 | herb | 探索:霜刃渊/undefinedx1 |
| 筑基期 | 深渊铁精 | mat.deep_iron_essence | 34 | 天阶 | 金+95 / 水+57 / 土+37 | ore | 怪物掉落:霜刃渊/铁甲玄龟x1 |
| 筑基期 | 铁甲碎片 | mat.ironshell_fragment | 34 | 地阶 | 金+78 / 土+42 | ore | 怪物掉落:霜刃渊/铁甲玄龟x1 |
| 筑基期 | 玄龟寒髓 | mat.turtle_cold_marrow | 34 | 地阶 | 水+78 / 土+42 | exotic | 怪物掉落:霜刃渊/铁甲玄龟x1 |
| 筑基期 | 焰狐火核 | mat.fire_fox_core | 35 | 地阶 | 木+43 / 火+80 | exotic | 怪物掉落:焚木荒台/焰尾狐x1 |
| 筑基期 | 焰狐皮 | mat.flame_fox_fur | 35 | 玄阶 | 木+32 / 火+60 | exotic | 怪物掉落:焚木荒台/焰尾狐x1 |
| 筑基期 | 焚灵种 | mat.fire_seed | 36 | 地阶 | 木+44 / 火+82 | herb | 探索:焚木荒台/undefinedx1 |
| 筑基期 | 活炭 | mat.living_charcoal | 36 | 地阶 | 木+44 / 火+82 | exotic | 怪物掉落:焚木荒台/枯木行者x1 |
| 筑基期 | 焦木皮 | mat.charwood_bark | 36 | 玄阶 | 木+62 / 火+33 | herb | 怪物掉落:焚木荒台/枯木行者x1 |
| 筑基期 | 余烬枝 | mat.ember_branch | 36 | 地阶 | 木+82 / 火+44 | herb | 探索:焚木荒台/undefinedx1 |
| 筑基期 | 焦木心 | mat.charwood_heart | 37 | 地阶 | 木+85 / 火+45 | herb | 探索:焚木荒台/undefinedx1 |
| 筑基期 | 烈焰蜥鳞 | mat.blaze_lizard_scale | 37 | 地阶 | 火+85 / 土+45 | exotic | 怪物掉落:焚木荒台/烈焰蜥x1 |
| 筑基期 | 木火精华 | mat.wood_fire_essence | 37 | 天阶 | 木+112 / 火+61 | exotic | 怪物掉落:焚木荒台/藤焰蟒x1 |
| 筑基期 | 熔核碎片 | mat.molten_core_shard | 37 | 天阶 | 金+40 / 火+103 / 土+62 | ore | 怪物掉落:焚木荒台/烈焰蜥x1 |
| 筑基期 | 藤蟒筋 | mat.vine_serpent_tendon | 37 | 地阶 | 木+85 / 火+45 | exotic | 怪物掉落:焚木荒台/藤焰蟒x1 |
| 筑基期 | 焰毒囊 | mat.flame_venom_sac | 37 | 地阶 | 木+85 / 火+45 | exotic | 怪物掉落:焚木荒台/藤焰蟒x1 |
| 筑基期 | 焰蜥精血 | mat.fire_lizard_blood | 37 | 地阶 | 火+85 / 土+45 | exotic | 怪物掉落:焚木荒台/烈焰蜥x1 |
| 筑基期 | 焚王心木 | mat.blazewood_king_heartwood | 38 | 天阶 | 木+115 / 火+62 | herb | 怪物掉落:焚木荒台/焚木妖王x1 |
| 筑基期 | 焚王余烬 | mat.blazewood_king_ember | 38 | 天阶 | 木+62 / 火+115 | exotic | 怪物掉落:焚木荒台/焚木妖王x1 |
| 筑基期 | 木火道种 | mat.wood_fire_dao_seed | 38 | 天阶 | 木+115 / 火+62 | exotic | 怪物掉落:焚木荒台/焚木妖王x1 |
| 筑基期 | 土虫内核 | mat.earth_beetle_core | 39 | 地阶 | 金+48 / 土+88 | exotic | 怪物掉落:玄壤深渊/玄土甲虫x1 |
| 筑基期 | 玄壤精土 | mat.darksoil_refined_earth | 39 | 天阶 | 金+63 / 土+118 | ore | 探索:玄壤深渊/undefinedx1 |
| 筑基期 | 玄土甲壳 | mat.darksoil_carapace | 39 | 地阶 | 金+48 / 土+88 | ore | 怪物掉落:玄壤深渊/玄土甲虫x1 |
| 筑基期 | 地脉蜈毒 | mat.deep_earth_venom | 40 | 天阶 | 金+44 / 水+66 / 土+110 | exotic | 怪物掉落:玄壤深渊/裂地蜈蚣x1 |
| 筑基期 | 混元蟾珠 | mat.mixed_toad_pearl | 40 | 地阶 | 金+32 / 水+50 / 土+83 | exotic | 怪物掉落:玄壤深渊/混元石蟾x1 |
| 筑基期 | 混元脉石 | mat.mixed_vein_stone | 40 | 天阶 | 金+55 / 木+55 / 水+55 / 火+55 / 土+55 | ore | 探索:玄壤深渊/undefinedx1 |
| 筑基期 | 裂地蜈牙 | mat.centipede_fang | 40 | 地阶 | 金+49 / 土+90 | exotic | 怪物掉落:玄壤深渊/裂地蜈蚣x1 |
| 筑基期 | 深渊灵泥 | mat.abyss_spirit_mud | 40 | 天阶 | 水+65 / 土+121 | ore | 探索:玄壤深渊/undefinedx1 |
| 筑基期 | 石蟾皮 | mat.stone_toad_skin | 40 | 地阶 | 水+49 / 土+90 | exotic | 怪物掉落:玄壤深渊/混元石蟾x1 |
| 筑基期 | 蜈蚣节甲 | mat.earth_centipede_segment | 40 | 地阶 | 金+49 / 土+90 | exotic | 怪物掉落:玄壤深渊/裂地蜈蚣x1 |
| 筑基期 | 五行蟾液 | mat.fivephase_secretion | 40 | 天阶 | 金+55 / 木+55 / 水+55 / 火+55 / 土+55 | exotic | 怪物掉落:玄壤深渊/混元石蟾x1 |
| 筑基期 | 地龙脊骨 | mat.dragon_spine_bone | 41 | 天阶 | 金+66 / 土+124 | ore | 怪物掉落:玄壤深渊/玄壤地龙x1 |
| 筑基期 | 地龙内丹 | mat.dragon_inner_core | 41 | 天阶 | 金+66 / 土+124 | exotic | 怪物掉落:玄壤深渊/玄壤地龙x1 |
| 筑基期 | 深渊土精 | mat.deep_earth_essence | 41 | 天阶 | 水+66 / 土+124 | exotic | 怪物掉落:玄壤深渊/玄壤地龙x1 |
| 筑基期 | 噬脉兽核 | mat.devourer_beast_core | 42 | 天阶 | 金+58 / 木+58 / 水+58 / 火+56 / 土+58 | exotic | 怪物掉落:玄壤深渊/五行噬脉兽x1 |
| 筑基期 | 五行混元精 | mat.fivephase_mixed_essence | 42 | 天阶 | 金+58 / 木+58 / 水+58 / 火+58 / 土+56 | exotic | 怪物掉落:玄壤深渊/五行噬脉兽x1 |
| 筑基期 | 五行脉晶 | mat.fivephase_vein_crystal | 42 | 天阶 | 金+58 / 木+58 / 水+58 / 火+58 / 土+56 | ore | 怪物掉落:玄壤深渊/五行噬脉兽x1 |
