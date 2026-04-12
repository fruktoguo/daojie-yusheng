# 当前装备总表

来源真源：

- `packages/server/data/content/items/凡人期/装备.json`
- `packages/server/data/content/items/练气期/装备.json`

## 汇总

- 装备总数：`151`
- 境界分布：`凡人期 68`，`练气期 83`
- 部位分布：`weapon 30`，`head 29`，`body 32`，`legs 22`，`accessory 38`
- 品阶分布：`mortal 7`，`yellow 70`，`mystic 73`，`earth 1`
- 带 `effects` 的装备：`70`，纯数值装备：`81`

## 重复模板热点

以下按 `境界 + 等级 + 部位 + 属性键集合 + 是否带效果` 聚合，只列出数量大于等于 2 的组，方便后续排查“名字不同但骨架接近”的区域。

- 凡人期 Lv1 legs plain dodge+moveSpeed: 赶路草鞋（equip.grassbound_shoes）、沟行爪套（equip.gutter_paws）
- 凡人期 Lv3 head plain dodge+hit+viewRange: 回声晶冠（equip.echo_crystal_crest）、叶隐翎冠（equip.leafshadow_crest）
- 凡人期 Lv3 legs plain dodge+hit+moveSpeed: 穴行钩爪（equip.cave_skitter_spurs）、风节行靴（equip.windjoint_boots）
- 凡人期 Lv3 weapon plain hit+physAtk+spellAtk: 玄铁长剑（equip.black_iron_sword）、晶獠骨刺（equip.crystal_maw_spike）
- 凡人期 Lv4 body plain maxHp+physDef+resolvePower+spellDef: 镇煞护心甲（equip.rift_guard_armor）、断碑甲壳（equip.stele_shell_armor）
- 凡人期 Lv4 head plain spellDef+viewRange: 观脉骨冠（equip.celestial_crown）、残阵束冠（equip.remnant_array_crown）
- 凡人期 Lv4 legs plain crit+dodge+moveSpeed: 逐月疾靴（equip.moonshadow_boots）、猎脉疾靴（equip.predator_tendon_boots）
- 练气期 Lv25 body hasEffect maxHp+physDef+resolvePower: 裂鳞甲（equip.cleft_scale_armor）、厚脉护胸（equip.deepvein_chestguard）
- 练气期 Lv27 weapon hasEffect breakPower+hit+physAtk+spellAtk: 负碑杖（equip.burden_stele_staff）、碑锋刃（equip.stele_edge_blade）
- 练气期 Lv29 body hasEffect maxHp+physDef+resolvePower+spellDef: 金棺重甲（equip.gold_coffin_plate）、封岳甲（equip.mountainseal_plate）
- 练气期 Lv29 body plain maxHp+physDef+resolvePower+spellDef: 旧卫铁甲（equip.old_guard_iron_armor）、垒垣甲（equip.rampart_plate）

## 凡人期

### Lv 1

- [断道柴刀 / equip.road_cleaver] weapon | mortal | physAtk=3, hit=1 | effects: 无
- [拾荒尖牙 / equip.scavenger_fang] weapon | mortal | physAtk=2, hit=1, breakPower=1 | effects: 无
- [拾荒翎冠 / equip.scavenger_crest] head | mortal | dodge=1, hit=1, viewRange=1 | effects: 无
- [扛包短褂 / equip.porter_jacket] body | mortal | maxHp=1.67, physDef=2 | effects: 无
- [杂皮护层 / equip.scrap_hide] body | mortal | maxHp=1.5, physDef=2, spellDef=1 | effects: 无
- [赶路草鞋 / equip.grassbound_shoes] legs | mortal | moveSpeed=8, dodge=1 | effects: 无
- [沟行爪套 / equip.gutter_paws] legs | mortal | moveSpeed=10, dodge=1 | effects: 无
### Lv 2

- [猎户骨匕 / equip.bone_dagger] weapon | yellow | physAtk=5, crit=3 | effects: 无
- [铜胎丹炉 / equip.copper_pill_furnace] weapon | yellow | qiRegenRate=40, resolvePower=1 | effects: 无
- [旧铁长刀 / equip.rust_saber] weapon | yellow | physAtk=6, hit=2 | effects: 无
- [门丁裹头巾 / equip.gate_headcloth] head | yellow | resolvePower=2, hpRegenRate=0.25 | effects: night-watch
- [猎风帽 / equip.hunter_cap] head | yellow | dodge=4, crit=2 | effects: 无
- [荒路皮帽 / equip.wasteland_cap] head | yellow | dodge=2, viewRange=1 | effects: 无
- [旧皮绑胸 / equip.bound_chest] body | yellow | maxHp=2.33, resolvePower=2 | effects: 无
- [硬皮护衣 / equip.leather_vest] body | yellow | maxHp=3, physDef=5 | effects: 无
- [踏云履 / equip.cloud_boots] legs | yellow | moveSpeed=18, dodge=2, hit=1 | effects: 无
- [游侠靴 / equip.step_boots] legs | yellow | moveSpeed=12, dodge=1 | effects: 无
- [越沟快靴 / equip.trench_runner_boots] legs | yellow | moveSpeed=14, hit=2 | effects: runner-step
- [药篓挂坠 / equip.herb_basket_charm] accessory | yellow | hpRegenRate=0.5, lootRate=3 | effects: 无
- [沼毒囊结 / equip.marsh_poison_gland] accessory | yellow | spellAtk=2, breakPower=1, qiRegenRate=0.2 | effects: 无
- [南市木牌 / equip.nanshi_token] accessory | yellow | maxHp=1, realmExpPerTick=2 | effects: 无
### Lv 3

- [竹牙短刃 / equip.bamboo_fang_blade] weapon | yellow | physAtk=6, hit=2, crit=1 | effects: 无
- [青竹分水刃 / equip.bamboo_split_blade] weapon | yellow | physAtk=7, dodge=2, hit=2 | effects: 无
- [玄铁长剑 / equip.black_iron_sword] weapon | mystic | physAtk=11, spellAtk=4, hit=4 | effects: 无
- [晶獠骨刺 / equip.crystal_maw_spike] weapon | yellow | physAtk=7, spellAtk=2, hit=2 | effects: 无
- [矿卫破岩锤 / equip.orebreak_hammer] weapon | mystic | physAtk=10, breakPower=4, hit=2 | effects: 无
- [竹骨斗笠 / equip.bamboo_hat] head | yellow | dodge=3, viewRange=1 | effects: bamboo-forest-read
- [夜鸦面 / equip.crow_night_mask] head | yellow | 无 equipValueStats | effects: crow-night-sight
- [回声晶冠 / equip.echo_crystal_crest] head | yellow | hit=2, dodge=2, viewRange=1 | effects: 无
- [叶隐翎冠 / equip.leafshadow_crest] head | yellow | dodge=2, hit=2, viewRange=1 | effects: 无
- [矿卫盔 / equip.miner_helmet] head | mystic | maxHp=2, physDef=7, resolvePower=3 | effects: 无
- [熄火矿灯冠 / equip.soot_lamp_hood] head | mystic | viewRange=1, resolvePower=2, maxHp=1.33 | effects: mine-sight
- [黑铁束身甲 / equip.blackiron_brigandine] body | mystic | maxHp=3.17, physDef=6, resolvePower=3 | effects: 无
- [药烟轻袍 / equip.herb_mist_robe] body | yellow | maxQi=2.25, spellDef=4, qiRegenRate=0.4 | effects: 无
- [矿壳重甲 / equip.oreplate_carapace] body | mystic | maxHp=2.5, physDef=5, spellDef=4, resolvePower=3 | effects: 无
- [断纹法袍 / equip.rune_robe] body | mystic | maxQi=4.5, spellAtk=8, spellDef=6 | effects: 无
- [蛇蜕灵甲 / equip.snakeshed_vest] body | yellow | maxHp=1.8, maxQi=1, physDef=2, spellDef=3 | effects: 无
- [炉灰踏靴 / equip.ash_tread] legs | yellow | moveSpeed=10, physDef=2 | effects: 无
- [穴行钩爪 / equip.cave_skitter_spurs] legs | yellow | moveSpeed=12, dodge=3, hit=1 | effects: 无
- [引露行靴 / equip.dewstep_boots] legs | yellow | moveSpeed=16, crit=2 | effects: dewstep-dash
- [风节行靴 / equip.windjoint_boots] legs | yellow | moveSpeed=14, dodge=2, hit=1 | effects: 无
- [竹心灵坠 / equip.bamboo_heart_charm] accessory | yellow | maxQi=1.5, spellAtk=3, maxQiOutputPerTick=3 | effects: 无
- [焚脉黑绳 / equip.blood_burn_rope] accessory | yellow | 无 equipValueStats | effects: blood-burn-drain, blood-burn-growth
- [采气木坠 / equip.gather_qi_pendant] accessory | yellow | maxQi=1.5, techniqueExpPerTick=5 | effects: 无
- [矿脉搏核 / equip.mineral_pulse_core] accessory | yellow | maxQi=1.5, breakPower=3, resolvePower=2, maxQiOutputPerTick=3 | effects: 无
- [矿脉扣环 / equip.orevein_ring] accessory | yellow | breakPower=3, lootRate=4 | effects: 无
### Lv 4

- [断碑纹剑 / equip.broken_rune_blade] weapon | mystic | physAtk=9, spellAtk=6, hit=3 | effects: 无
- [裂齿斩骨刀 / equip.valley_fang_blade] weapon | mystic | physAtk=12, crit=3, breakPower=4 | effects: 无
- [观脉骨冠 / equip.celestial_crown] head | mystic | viewRange=1, spellDef=5 | effects: 无
- [残阵束冠 / equip.remnant_array_crown] head | mystic | spellDef=5, viewRange=1 | effects: 无
- [听风兽皮冠 / equip.windhear_crown] head | yellow | dodge=3, crit=2, viewRange=1 | effects: 无
- [兽骨玄甲 / equip.beastbone_mail] body | mystic | maxHp=3, physDef=6, spellDef=4, crit=2 | effects: 无
- [灵脊镇息袍 / equip.ridge_calm_robe] body | mystic | maxQi=3, spellDef=6, qiRegenRate=0.7 | effects: 无
- [镇煞护心甲 / equip.rift_guard_armor] body | mystic | maxHp=3.5, physDef=7, spellDef=5, resolvePower=3 | effects: 无
- [断碑甲壳 / equip.stele_shell_armor] body | mystic | maxHp=3, physDef=6, spellDef=5, resolvePower=4 | effects: 无
- [逐月疾靴 / equip.moonshadow_boots] legs | mystic | moveSpeed=18, dodge=3, crit=2 | effects: 无
- [猎脉疾靴 / equip.predator_tendon_boots] legs | mystic | moveSpeed=16, dodge=2, crit=2 | effects: 无
- [叩门行靴 / equip.threshold_boots] legs | mystic | moveSpeed=16, cooldownSpeed=5, dodge=2 | effects: 无
- [踏纹履 / equip.trace_pattern_boots] legs | mystic | moveSpeed=14, cooldownSpeed=4 | effects: 无
- [血核妖符 / equip.bloodcore_talisman] accessory | mystic | maxQi=2, breakPower=4, qiRegenRate=0.4, crit=2 | effects: 无
- [引灵髓坠 / equip.guiding_marrow_pendant] accessory | mystic | maxQiOutputPerTick=5, maxQi=2.25 | effects: 无
- [拾纹指环 / equip.pattern_picker_ring] accessory | mystic | techniqueExpPerTick=6, spellAtk=3 | effects: 无
- [噬元骨牌 / equip.soul_devour_token] accessory | mystic | 无 equipValueStats | effects: soul-devour-erosion, soul-devour-growth, soul-devour-feast
- [魂墨坠 / equip.soul_ink_pendant] accessory | mystic | maxQi=2, spellAtk=4, maxQiOutputPerTick=4, resolvePower=3 | effects: 无
- [养灵木戒 / equip.spirit_ring] accessory | yellow | maxQi=2, qiRegenRate=0.6, maxQiOutputPerTick=3 | effects: 无
- [井语避邪符 / equip.wellward_talisman] accessory | yellow | spellDef=5, resolvePower=3, hpRegenRate=0.6 | effects: 无
### Lv 5

- [残星乌铁枪 / equip.starfall_spear] weapon | mystic | physAtk=13, spellAtk=8, hit=4, breakPower=4 | effects: 无
- [镇脉玄纹佩 / equip.void_talisman] accessory | mystic | techniqueExpPerTick=7, qiRegenRate=0.6 | effects: 无

## 练气期

### Lv 19

- [裂痕短刃 / equip.cleft_short_blade] weapon | yellow | physAtk=18, hit=6, crit=3 | effects: cleft-short-edge
- [赤陨灼枪 / equip.ember_scorch_spear] weapon | yellow | physAtk=15, spellAtk=12, crit=6 | effects: 无
- [寒汐引流尺 / equip.hanxi_flow_ruler] weapon | yellow | spellAtk=18, hit=6, cooldownSpeed=5 | effects: 无
- [养枝引脉杖 / equip.vineguide_staff] weapon | yellow | spellAtk=18, maxQi=3, qiRegenRate=0.8 | effects: vineguide-sustain
- [离炎束冠 / equip.liyan_crown] head | yellow | crit=5, hit=5, spellAtk=3 | effects: 无
- [月井纱冠 / equip.moonwell_gauze_crown] head | yellow | spellDef=8, dodge=6, viewRange=1 | effects: 无
- [砂锋束额 / equip.sand_edge_headband] head | yellow | hit=5, dodge=6, viewRange=1 | effects: sand-edge-sight
- [青萝束冠 / equip.verdant_crown] head | yellow | spellDef=9, viewRange=1, resolvePower=5 | effects: verdant-crown-study
- [黄岩额护 / equip.yellow_stone_browguard] head | yellow | maxHp=3, physDef=6, resolvePower=6 | effects: yellow-stone-settle
- [岭皮坎肩 / equip.ridgehide_vest] body | yellow | maxHp=8, physDef=15 | effects: 无
- [重爪靴 / equip.heavy_claw_boots] legs | yellow | moveSpeed=23, physDef=7, breakPower=3 | effects: heavy-claw-root
- [裂痕踏靴 / equip.scar_tread_boots] legs | yellow | moveSpeed=28, dodge=4 | effects: scar-tread-step
- [归息铜佩 / equip.returnbreath_copper_pendant] accessory | yellow | maxQi=4.5, qiRegenRate=1.1, maxQiOutputPerTick=6 | effects: returnbreath-cultivate
### Lv 21

- [裂原长戟 / equip.cleft_long_halberd] weapon | yellow | physAtk=21, hit=6, breakPower=6 | effects: 无
- [沉脉锤 / equip.sinking_vein_hammer] weapon | yellow | physAtk=21, breakPower=9, hit=4 | effects: sinking-vein-pound
- [净潮法衣 / equip.cleantide_robe] body | yellow | maxQi=6, spellDef=14, resolvePower=6 | effects: 无
- [厚脉板甲 / equip.deepvein_plate] body | yellow | maxHp=8.5, physDef=17, spellDef=6, resolvePower=6 | effects: 无
- [砂金胸甲 / equip.gold_sand_cuirass] body | yellow | maxHp=7.5, physDef=14, spellDef=6 | effects: 无
- [回藤法衣 / equip.returnvine_robe] body | yellow | maxHp=8.5, spellDef=14, hpRegenRate=0.7 | effects: 无
- [焦庭战衣 / equip.scorchcourt_battlecoat] body | yellow | maxHp=8.5, physDef=11, spellAtk=8 | effects: 无
- [负岳胫甲 / equip.burden_greaves] legs | yellow | moveSpeed=20, physDef=9, resolvePower=4 | effects: burden-greaves-brace
- [踏火疾靴 / equip.firestride_boots] legs | yellow | moveSpeed=28, crit=4, breakPower=4 | effects: 无
- [铁辙靴 / equip.iron_track_boots] legs | yellow | moveSpeed=25, physDef=6, hit=3 | effects: iron-track-drive
- [雾行履 / equip.mistwalker_boots] legs | yellow | moveSpeed=25, dodge=6, cooldownSpeed=5 | effects: 无
- [绕谷轻履 / equip.vale_stride_boots] legs | yellow | moveSpeed=27, dodge=6, qiRegenRate=0.5 | effects: 无
### Lv 23

- [坠岩槌 / equip.fallrock_maul] weapon | yellow | physAtk=24, breakPower=10, hit=6 | effects: fallrock-burst
- [满锋刀 / equip.full_edge_blade] weapon | yellow | physAtk=24, hit=7, crit=6 | effects: full-edge-pursue
- [砂魇面 / equip.sand_ghost_mask] head | yellow | dodge=6, crit=6, viewRange=1 | effects: sand-ghost-haze
- [石岭盔 / equip.stone_ridge_helm] head | yellow | maxHp=3.5, physDef=8, resolvePower=8, viewRange=1 | effects: stone-ridge-steadfast
- [岭垣甲 / equip.ridgewall_armor] body | yellow | maxHp=10, physDef=18, spellDef=8, resolvePower=6 | effects: 无
- [逐锋履 / equip.chasing_edge_boots] legs | yellow | moveSpeed=30, hit=4, crit=3 | effects: chasing-edge-rush
- [裂锋指环 / equip.cleft_edge_ring] accessory | yellow | hit=5, breakPower=6, crit=3 | effects: cleft-edge-mark
- [厚脉护膝 / equip.deepvein_kneeguards] accessory | yellow | physDef=6, resolvePower=6, moveSpeed=8 | effects: deepvein-knee-hold
- [砂金符坠 / equip.gold_sand_talisman] accessory | yellow | maxQi=4.5, qiRegenRate=1.1, breakPower=6 | effects: gold-sand-temper
- [护脉石 / equip.shieldvein_stone] accessory | yellow | maxQi=3.5, physDef=6, resolvePower=8, maxQiOutputPerTick=5 | effects: shieldvein-breathe
### Lv 25

- [残旗战戟 / equip.banner_war_halberd] weapon | mystic | physAtk=24, hit=7, breakPower=8 | effects: banner-war-fury
- [岳纹杆 / equip.yuepattern_pole] weapon | mystic | physAtk=24, spellAtk=5, hit=7, breakPower=8 | effects: yuepattern-rise
- [残旗盔 / equip.remnant_banner_helm] head | mystic | maxHp=2.5, resolvePower=5, hit=4 | effects: banner-helm-aura
- [御土面 / equip.yuetown_mask] head | mystic | spellDef=8, resolvePower=8, viewRange=1 | effects: yuetown-mask-ground
- [裂锋披 / equip.cleft_blade_cloak] body | mystic | maxHp=7, dodge=5, spellDef=7 | effects: cleft-cloak-shift
- [裂鳞甲 / equip.cleft_scale_armor] body | mystic | maxHp=8.5, physDef=15, resolvePower=5 | effects: cleft-scale-laststand
- [厚脉护胸 / equip.deepvein_chestguard] body | mystic | maxHp=8.5, physDef=15, resolvePower=7 | effects: deepvein-chest-flow
- [台垣守甲 / equip.terrace_guard_armor] body | mystic | maxHp=10.5, physDef=17, spellDef=9, resolvePower=7 | effects: terrace-guard-last
- [锋令牌 / equip.edge_command_token] accessory | mystic | maxQi=4.5, breakPower=7, resolvePower=4, maxQiOutputPerTick=5 | effects: edge-command-line
- [山心符 / equip.mountainheart_token] accessory | mystic | maxHp=4, maxQi=4, physDef=5, resolvePower=8 | effects: mountainheart-ridge
### Lv 26

- [凝露潮佩 / equip.dew_tide_pendant] accessory | mystic | spellAtk=8, qiRegenRate=1, hit=4 | effects: dew-tide-focus
- [炉心赤戒 / equip.furnace_red_ring] accessory | mystic | spellAtk=8, crit=4, maxQiOutputPerTick=8 | effects: furnace-red-burst
- [生脉木佩 / equip.lifepulse_pendant] accessory | mystic | maxQi=5.5, spellAtk=8, hpRegenRate=0.9 | effects: lifepulse-map-aura
### Lv 27

- [负碑杖 / equip.burden_stele_staff] weapon | mystic | physAtk=25, spellAtk=8, hit=7, breakPower=9 | effects: burden-stele-echo
- [碑锋刃 / equip.stele_edge_blade] weapon | mystic | physAtk=26, spellAtk=8, hit=8, breakPower=7 | effects: stele-edge-resound
- [重碑盔 / equip.heavystele_helm] head | mystic | maxHp=4, spellDef=10, resolvePower=8 | effects: heavystele-breath
- [碑纹盔 / equip.stele_pattern_helm] head | mystic | spellDef=10, viewRange=1, resolvePower=5 | effects: stele-pattern-focus
- [锋核壳甲 / equip.edge_core_shell] body | mystic | maxHp=9, maxQi=4, physDef=16, spellDef=11 | effects: edge-core-surge
- [载山甲 / equip.loadstone_plate] body | mystic | maxHp=11, physDef=19, spellDef=11, resolvePower=8 | effects: loadstone-shell
- [裂锋护臂 / equip.cleft_blade_armguard] accessory | mystic | physDef=7, breakPower=5, hit=4 | effects: cleft-armguard-rebound
- [厚脉护手 / equip.deepvein_gauntlets] accessory | mystic | physAtk=5, physDef=5, breakPower=7 | effects: deepvein-gauntlet-drive
- [震心石 / equip.quakeheart_stone] accessory | mystic | maxQi=5.5, breakPower=7, resolvePower=8, spellDef=7 | effects: quakeheart-advance
- [封锋石心 / equip.sealed_edge_stoneheart] accessory | mystic | maxQi=5.5, maxQiOutputPerTick=7, resolvePower=5 | effects: sealed-edge-cultivate
### Lv 29

- [黯峰拳印 / equip.darkpeak_fist_seal] weapon | mystic | physAtk=32, spellAtk=8, hit=8, breakPower=12, resolvePower=5 | effects: darkpeak-pound
- [庚门断锋 / equip.geng_gate_blade] weapon | mystic | physAtk=32, spellAtk=11, hit=9, breakPower=9, crit=5 | effects: geng-gate-break
- [归藏合流刃 / equip.guizang_conflux_blade] weapon | mystic | physAtk=13, spellAtk=13, hit=5, maxQiOutputPerTick=5 | effects: 无
- [残旌枪 / equip.remnant_banner_spear] weapon | mystic | physAtk=29, hit=8, crit=5, breakPower=7 | effects: remnant-banner-push
- [裂岭戟 / equip.ridgecleft_halberd] weapon | mystic | physAtk=29, hit=8, breakPower=11 | effects: ridgecleft-smash
- [折旗重盔 / equip.bent_flag_heavy_helm] head | mystic | maxHp=3.5, physDef=7, resolvePower=7 | effects: bent-flag-grit
- [镇岳君盔 / equip.earthlord_helm] head | mystic | maxHp=5.5, physDef=10, spellDef=10, resolvePower=11 | effects: earthlord-aura
- [五炁观脉冠 / equip.fiveqi_watch_crown] head | mystic | maxQi=4, spellDef=10, resolvePower=7 | effects: 无
- [镇岭盔 / equip.mount_guard_helm] head | mystic | maxHp=4.5, physDef=8, resolvePower=10, hit=3 | effects: mount-guard-wall
- [镇门将盔 / equip.tomb_gate_general_helm] head | mystic | maxHp=4, spellDef=11, resolvePower=8, hit=5 | effects: gate-general-gaze
- [裂锋遗甲 / equip.cleft_blade_relic_armor] body | mystic | maxHp=13, physDef=19, spellDef=13, breakPower=5 | effects: cleft-relic-echo
- [金棺重甲 / equip.gold_coffin_plate] body | mystic | maxHp=12, physDef=20, spellDef=13, resolvePower=8 | effects: gold-coffin-hold
- [归窍法衣 / equip.guizang_aperture_robe] body | mystic | maxHp=10.5, maxQi=5, physDef=11, spellDef=11 | effects: 无
- [封岳甲 / equip.mountainseal_plate] body | mystic | maxHp=13, physDef=21, spellDef=13, resolvePower=11 | effects: mountainseal-hold
- [旧卫铁甲 / equip.old_guard_iron_armor] body | mystic | maxHp=10.5, physDef=17, spellDef=9, resolvePower=7 | effects: 无
- [垒垣甲 / equip.rampart_plate] body | mystic | maxHp=12, physDef=20, spellDef=12, resolvePower=9 | effects: 无
- [回阵行履 / equip.returnarray_boots] legs | mystic | moveSpeed=25, dodge=5, cooldownSpeed=5 | effects: 无
- [裂锋肩甲 / equip.cleft_blade_shoulder] accessory | mystic | maxHp=5.5, physDef=7, resolvePower=5 | effects: cleft-shoulder-line
- [反震铁环 / equip.counter_shock_iron_ring] accessory | mystic | breakPower=7, spellDef=7, crit=4 | effects: counter-shock-ripple
- [厚脉核 / equip.deepvein_core] accessory | mystic | maxQi=6.5, maxQiOutputPerTick=8, physDef=7, resolvePower=11, spellDef=8 | effects: deepvein-core-cultivate
- [厚脉遗器 / equip.deepvein_relic] accessory | mystic | maxHp=6.5, maxQi=5.5, physDef=8, spellDef=8, resolvePower=8 | effects: deepvein-relic-guard
- [厚脉遗片 / equip.deepvein_relic_shard] accessory | mystic | maxHp=5.5, maxQi=4.5, physDef=5, resolvePower=7 | effects: deepvein-shard-study
- [封路令 / equip.sealed_path_token] accessory | mystic | maxQi=6.5, maxQiOutputPerTick=8, spellAtk=8, resolvePower=7 | effects: sealed-path-march
- [封岭铁环 / equip.sealridge_iron_ring] accessory | mystic | maxQi=4, physDef=7, resolvePower=8, breakPower=7 | effects: sealridge-return
### Lv 30

- [半基灵环 / equip.halfbase_ring] accessory | earth | maxHp=5, physAtk=5, spellAtk=5, qiRegenRate=1.2 | effects: halfbase-ring-harmony

## 原始数据

- 结构化清单见 `docs/equipment-design/current-equipment-catalog.json`
