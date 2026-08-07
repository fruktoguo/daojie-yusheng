# 功法与技能

## 功法品阶与经验

源文件: `packages/shared/src/constants/gameplay/technique.ts`

### 品阶经验基线倍率

`TECHNIQUE_GRADE_EXP_BASE_FACTORS`:

| 品阶 | 倍率 |
|------|------|
| mortal | 10 |
| yellow | 30 |
| mystic | 90 |
| earth | 270 |
| heaven | 810 |
| spirit | 2430 |
| saint | 7290 |
| emperor | 21870 |

### 功法升级经验

```typescript
getTechniqueExpToNext(level, layers) → 由 layers 配置定义每层 expToNext
```

### 经验缩放

```typescript
scaleTechniqueExp(expFactor, realmLv) = round(expFactor × 100 × realmLv)
```

## 功法经验等级差修正

```typescript
TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP = 0.3

getTechniqueExpLevelAdjustment(playerRealmLv, techniqueRealmLv):
  if player < technique: return 0.7^(technique - player)  // 惩罚
  if player > technique: return 1.3^(player - technique)  // 加速
  else: return 1
```

## 功法境界推导

```typescript
deriveTechniqueRealm(level, layers):
  progress = level / maxLevel
  >= 1.0 → Perfection（圆满）
  >= 0.66 → Major（大成）
  >= 0.33 → Minor（小成）
  else → Entry（入门）
```

## 自创功法随机

自创功法生成时，功法境界与品阶使用两个独立的玩家境界口径：

- 玩家可选的主题提示词最多为 `4000` 个字符；客户端和服务端共享同一上限，服务端清洗后才会进入 AI prompt，并只持久化清洗后的提示词快照。
- 自创功法入口在玩家历史最高境界达到筑基前期（`highestRealmLv >= 31`）后永久解锁；当前境界回落不会重新锁定。
- 每次抽取先按非对称分布生成一个 `±6` 境界偏移；功法 `realmLv` 以玩家当前境界加上该偏移，品阶参考境界以玩家历史最高境界加上同一个偏移，二者分别钳位到合法境界范围。
- 品阶根据偏移后的历史最高境界确定基准品阶，再按非对称分布在 `±2` 档范围内随机；当前境界下降不会降低品阶抽取基准。例如历史最高境界 42 抽到 `+1` 偏移时，按 43 级确定品阶基准。
- 投入多枚悟道玉简时，每枚独立抽取一组结果，先按品阶、再按功法境界择优；两个随机维度仍分别使用上述境界口径。
- 批量领悟仅开放内功。玩家指定 `1-100` 部后，每枚悟道玉简分别创建一个独立功法任务，品阶、境界和 `80%-120%` 强度各自随机；服务端固定六维等权，不让 AI 生成属性、权重、层数或技能。AI 单次只返回对应数量且顺序一致的名称与描述 JSON，服务端校验数量、字段、字数、同批重名和已发布重名后，再整批生成草稿。
- 批量任务的玉简扣除、子任务创建、失败返还、整批采纳和整批放弃均使用玩家会话栅栏与持久化事务。草稿必须整批采纳或整批放弃；采纳时全部功法分别写入待领悟真源，不会直接视为已经学会。服务重启后按批次恢复未完成任务，禁止只恢复或提交其中一部分。

## 功法领悟进度

未领悟功法使用 `requiredProgress/progress` 表示领悟总需求和当前进度。

```typescript
rawRequiredProgress = base × techniqueRealmLv × gradeFactor
requiredProgress = ceil(rawRequiredProgress × learnerPreFoundationRatio)
```

`base`：普通功法 10，自创功法 300。

`gradeFactor`：mortal=1, yellow=2, mystic=3, earth=4, heaven=5, spirit=6, saint=7, emperor=8。

`learnerPreFoundationRatio`：学习者 1-30 级（筑基前）线性降低总需求，1 级为 0.05（减少 95%），30 级为 0.5（减少 50%）；31 级及以上为 1。该折减同时作用于普通功法和自创功法。未提供学习者境界的纯模板计算不折减。

学习者传法技能、传授者传法技能不改变 `requiredProgress`，只改变每息获得的 `progressGain`。学习者境界同时参与筑基前总需求折减和每息速度修正：

```typescript
progressGain = baseProgress / difficultyFactor × transmissionSpeedFactor
difficultyFactor =
  realmFactor(techniqueRealmLv, learnerRealmLv)
  × transmissionSkillFactor(learnerTransmissionLevel, techniqueRealmLv)
  × transmissionSkillFactor(teacherTransmissionLevel, techniqueRealmLv) // 仅传法时

transmissionSpeedFactor = max(0, 1 + learnerTransmissionSpeedRate + teacherTransmissionSpeedRate) // 传法时；自行领悟仅使用 learnerTransmissionSpeedRate

realmFactor:
  technique > learner → 1.1^(technique - learner)
  technique < learner → 0.98^(learner - technique)
  same → 1

transmissionSkillFactor:
  skill > technique → 0.95^(skill - technique)
  skill < technique → 1.05^(technique - skill)
  same → 1
```

领悟进度可保留小数；客户端文本当前按整数展示，服务端持久化使用 double precision 保存。

传法不是 pending 功法条目上的旁路状态，而是学习者身上的正式通用技艺 job。学习者同一时间只能接受一个传法 job；传授者由 job 私有字段记录，作为距离、功法掌握和传法技能加成的条件来源。传法未取消或完成时，对应 pending 功法不能自行领悟；取消后保留已有领悟进度，可由其他传授者重新开始传法并继续推进。传法 job 已取消或结束后，玩家可以通过二次确认显式放弃该未领悟功法；放弃会删除全部 pending 进度，若它正是主修则同时清空主修并停止修炼。进行中的传法不能旁路放弃，必须先走通用 job 取消流程。显式放弃通过 `technique` 分域 flush 删除 `player_technique_comprehension` 真源；删除最后一条记录时只允许携带本次放弃授权及精确功法 ID 的空快照通过防误删守卫，普通空投影仍拒绝覆盖。该授权必须跨越分域合并窗口内的后续功法修订，直到对应删除真正落库；相同功法重新进入 pending 时立即撤销对应 ID 的旧授权。启动重放若遇到历史无授权空删除，则保留数据库真源并隔离该删除意图，不能阻断全服启动。传法 job 每实际推进 1 息时，学习者和当前传授者都按 1 息获得传法技艺经验；自行领悟 pending 功法时，自学者按本次修炼投入息数获得传法技艺经验，领悟速度加成只影响进度，不额外放大技艺经验。

自动切换主修同样会考虑允许自悟的 pending 功法：当前已学功法圆满后，若轮到 pending 功法，主修可自动切换到该 pending 并继续按自悟规则推进。

设置或取消主修只修改后续修炼目标，不等同于开启或停止闭关修炼。炼丹、炼器、强化等技艺 job 进行中仍可切换主修；真正开启修炼由独立修炼开关控制，并按通用打断规则处理当前技艺 job。

怪物击杀可推进当前主修 pending 的领悟进度，但领悟量不使用怪物经验值、等级差、血脉层次或掉落倍率换算；每击杀一个怪物只等同于自悟修炼 1 息的领悟增量。

传法与自行领悟界面应展示当前估算速率、预计剩余完成息数和速率构成。速率构成至少包含基准进度、境界差影响、自身传法等级影响；传法 job 额外展示传授者传法等级影响、双方传法速度属性影响和合计影响。玩家个人领悟速度贡献由 `craftEffectStats.transmission.speedRate`、脚下设施传法速度和 `techniqueExpRate / 10000` 相加得到，允许正负值共同参与；A 给 B 传法时，A/B 各自先计算自己的个人领悟速度贡献，再把双方贡献相加成总传法速度增益或减益。传法速率与构成由服务端随 job 投影给学习者；个人领悟速度贡献由服务端通过本人属性增量的 `comprehensionSpeedRate` 标量投影，只有站位或个人加成变化时才同步，客户端再结合当前境界、传法等级和 pending 功法境界本地推算自行领悟速率与构成。速率展示只用于估算，不要求每息额外发送网络包。

主动传授界面必须先选择两格内的目标玩家，再选择功法。目标切换后，客户端通过低频请求获取该玩家对传授者当前所有可传自创功法的已学状态，并在功法列表逐项展示“已学/未学”；玩家列表只显示玩家名称。查询被连接门控拒绝或超过 5 秒未响应时必须退出加载态并提供重试；页面恢复连接并收到新会话首包后，必须废弃旧会话中的在途查询并以新请求 ID 重新查询。已学项不得发起传授，正式启动时仍由服务端按目标距离、功法归属、原模板满层和学习者已掌握状态重新权威校验。

功法玩家态持久化只保存动态真源字段，不保存模板可补全的重复字段。已掌握功法从 `player_technique_state` 的 `tech_id/level/exp/exp_to_next/realm_lv/skills_enabled` 恢复，并在运行时通过内容模板补全 `name/grade/category/skills/layers`。未领悟功法从 `player_technique_comprehension` 的 `tech_id/source_kind/progress/required_progress/realm_lv/grade/category/creator_player_id/self_comprehension_allowed/created_at_tick/updated_at_tick` 恢复；`raw_payload` 不作为功法重复字段真源。

`self_comprehension_allowed` 表示是否允许通过主修修炼自行领悟。功法书开启的普通功法、自己创建的自创功法为 `true`；被其他玩家传授加入的 pending 功法为 `false`，只能由传法 job 推进，不能设为主修；客户端按钮必须置灰，服务端必须拒绝该主修切换。

## GM 手工自创功法

GM 可通过原生 GM API 或“功法管理 → 手工创建”面板提交自创功法配置。预览接口为 `POST /api/gm/generated-techniques/preview`，只执行服务端校验和展开；创建接口为 `POST /api/gm/generated-techniques`，成功后直接发布到全局生成功法模板缓存，不自动把功法写入任何玩家的已掌握或待领悟状态。

请求的 `technique` 必须使用严格的新格式：

- 公共字段：`name`（2-20 个字符）、`desc`（最多 500 个字符）、`category`（`internal`/`arts`）、`grade`、`realmLv`（1-127）、`maxLayer`（3-49）、`expDifficulty`（0.5-2）、`budgetPercent`（0.8-1.2）。数值必须是 JSON number，未知字段拒绝。
- `internal` 只接受六维 `attrRatio`，至少两个权重大于 0，不接受技能草稿。
- `arts` 必须且只能有一个技能；技能可指定伤害类型、五行、目标形状/模式、六项 `structureStrength` 权重、1-5 项 `formulaStrength.attributeBases`，以及功法层数、移动速度、境界等级和八项技艺等级百分比权重。八项技艺为炼丹、炼器、强化、传法、采集、挖矿、营造、阵法；百分比权重只允许 `0-100`，其他结构权重允许 `-100` 到 `100`。权重只表示预算分配，不是真实伤害或冷却值。
- `create` 必须携带 1-64 位 `operationId`。相同 operationId 和相同请求指纹会返回已有功法而不重复发布；相同 operationId 对应不同请求会拒绝。同名已发布功法也会拒绝。创建动作写入 GM 审计日志。

服务端把权重展开成正式逐层属性和运行时 `SkillDef` 后再持久化；`validation_report.manual` 保留规范化输入、operationId 和请求指纹，便于 GM 回读和审计。现有已发布功法不提供原地编辑入口，修改应使用新的 operationId 和名称。

## 功法书残页抄录与分解

炼法台抄录功法书时，残卷消耗按可修层数相对模板满层线性缩放：1 层消耗完整书的 50%，满层消耗 100%，中间按层数线性过渡。

```typescript
fullFragments = realmLv × gradePower
levelFactor = totalMaxLevel <= 1
  ? 1
  : 0.5 + 0.5 × ((learnMaxLevel - 1) / (totalMaxLevel - 1))
decomposeFragments = round(fullFragments × levelFactor)
craftCost = decomposeFragments × 4
```

完整功法书不写 `learnTechniqueMaxLevel`，缺省表示可修至模板满层；残卷才写 `learnTechniqueMaxLevel`。分解和制造使用同一层数幅度，分解返还为制造消耗的 1/4。

残卷领悟完成后，玩家功法态继续保留完整模板 `layers`，并以动态字段 `learnTechniqueMaxLevel` 记录可修上限。例如九层功法的八层残卷只能修至第八层；第八层只是达到残卷上限，不属于原功法圆满，境界推导仍按九层模板计算。

玩家之间直接传授、炼法台抄录功法书、藏经台录入都必须由服务端按原功法模板满层校验。达到残卷上限、`expToNext = 0` 或旧运行态中的截短层表都不能替代原功法圆满；客户端候选列表只做同口径展示过滤，不承担权威裁定。

已掌握功法可以从功法详情底部发起遗忘。客户端必须使用独立确认弹窗收集二次确认；服务端收到遗忘意图后只删除 `player_technique_state` 中对应的已掌握功法，若它正是主修功法则同时清空主修并停止修炼，随后重算属性、技能行动和自动战斗技能列表并标记 `technique/auto_battle_skill/attr` 脏域。遗忘不删除同名未领悟进度，也不绕过服务端权威校验。

使用功法书前必须先确认功法 ID、内容模板和玩家已掌握状态，并确认未领悟计划可写入；任一校验失败都不得扣除功法书。新计划自动成为主修并开启修炼时，除 `technique` 外还必须按实际变化标记 `auto_battle_skill` 与 `combat_pref` 脏域，否则重启后主修和修炼开关会回退。

## 功法统合

功法统合是统法台的低频交互；统法台属于不阻挡移动和视线的设施建筑，玩家必须位于已完工统法台 1 格内，所有候选、权限、版本和重叠校验均由服务端权威执行。当前只允许统合同品阶的自创内功。首次凝篇的源功法必须由台主本人创建并修至模板真实满层；系统功法、术法、神通、秘法、残卷上限或仅 `expToNext = 0` 都不能绕过校验。

统法台与炼法台使用相同的建造材料：4 份木材与 2 份石材。统法台最低结构强度为 `21600`，即单人至少需要施工六个小时；更高结构强度仍按通用建造规则提高工时与完工耐久。

每座统法台只能承载一个法脉。首次凝篇至少选择两本源功法，并由台主设定 2-20 字的法脉名讳；提交前客户端必须再次展示法脉名讳并明确提示凝篇后不可更改。凝篇成功后，建筑永久绑定该稳定 `familyId`，法脉名讳和所录品阶随之固定，不得换绑其他法脉，建筑展示名同步为「统法台：法脉名讳」。后续以递增 `revision` 发布不可变新卷：录入自有功法时必须在最新版全部叶子集合上至少新增一本，不允许删减或改写旧版。功法书、传法、统法台参悟和藏经台若指向旧版，学习时统一解析为该法脉最新版，并重新按当前覆盖量走领悟流程。

统法台分别保存“参阅权限”和“修订权限”，两者互不隐含。参阅权限决定谁可将台上法脉纳入参悟；修订权限决定谁可向已绑定法脉续录自己的功法。两项权限都可设为完全不限制，也可多选好友层级 `dao_friend`（道友以上）/`close_friend`（至交），以及同宗门的宗主、太上长老、副宗主、长老、内门弟子、外门弟子、杂役弟子等精确职位；限制项按“满足任意一项”放行，台主本人始终可用。默认参阅不限制，默认修订仅限台主；未选择任何限制项且未开启完全不限制时，仅台主可用。

好友关系、台主当前宗门、来访者当前宗门和职位在每次打开面板与提交操作时实时读取，关系或职位变动立即生效。修订者只能提交由自己创建、已修至模板真实满层且与法脉同品阶的自创内功；既有叶子保留原创建者归属，不要求修订者持有或重修。法脉初创者保持为台主，每卷另记实际修订者用于审计和幂等；修订成功后，修订者直接获得最新版并按同一规则替换其个人功法态。

统合模板不封存、不删除源功法；其他已有源功法的玩家仍可继续修炼、传授和抄录。玩家领悟统合功法完成时，只从该玩家态中移除被覆盖的直接源功法、同家族旧版及对应未领悟进度，保留新版一行。发布者发布成功后直接获得满层新版，并执行同样的个人态替换。

领悟成本按源功法叶子数量计算，不按玩家功法表的行数计算。已学直接源功法和已学统合版本提供叶子覆盖，剩余需求为基准领悟需求乘以未覆盖叶子比例，最低保留 1 点；所有尚未完成的 pending 功法都不提供覆盖，避免尚未领悟就被判定为已经掌握。通过统法台纳入参悟的法脉允许自行领悟，仍使用相同的覆盖折减、主修推进和持久化流程。

一本直接源功法不得再学入已覆盖它的统合功法持有者；不同统合家族间也不得有任何叶子重叠。学习、传法、藏经台参悟和发布都必须在拒绝时返回具体的重叠统合功法 ID 和源功法名称；拒绝路径不得扣除物品或改写玩家资产。

统合功法的最终六维是全部源功法满层六维之和的 `110%`；各层使用累计值做差分写入，保证最终层精确回收总属性。统合功法不计入万法属性加成的自创功法数量。其总修炼难度为全部源功法各层 `expToNext` 之和的一半，向上取整后分配到新功法各层。

统法台面板使用“总览 / 录法 / 权限”主 Tab；录法仅对拥有修订权限者显示，权限仅对建造者显示。总览展示最新版完整源法名录，以及服务端按法卷真实层数据计算的满层六维总加成，客户端不得自行重算。录法页只允许录入自有功法；自有功法目录按品阶和境界筛选，以固定卡格分页展示，每页最多 12 部，并提供当前筛选范围的全选和全部取消。候选卡左下角显示服务端权威生成强度 `80%-120%`，是否选中只通过边框反馈，同时保留境界、层数与圆满状态。手机端源法目录和总览名录均随正文纵向展开，不建立嵌套滚动区；这些字段只用于低频面板展示，客户端不据此重算功法效果。

统合元数据作为生成功法模板 JSON 与不可变版本一起持久化，并冗余记录首次凝篇所在实例、建筑与初始参阅/修订权限，用于模板发布成功但建筑域尚未刷盘时恢复绑定。统法台当前绑定的 `familyId` 和两项可变权限写入通用 `instance_building_state.payload`，不另建重复真源；玩家仅按现有 `player_technique_state` 和 `player_technique_comprehension` 保存当前统合功法 ID 及动态进度。服务器启动时先恢复全部已发布统合模板，再水合建筑与玩家态；运行期领悟和重叠检查只读内存索引，不在 tick 热路径访问数据库。

## 技能灵力消耗

```text
品阶序号：mortal=0, yellow=1, mystic=2, earth=3, heaven=4, spirit=5, saint=6, emperor=7
品阶指数倍率 = 1.4 ^ 品阶序号
标准灵力输出 = 当前功法境界等级对应的玩家最终基准灵力输出

cost = round(标准灵力输出 × 0.2 × 品阶指数倍率 × costMultiplier)
```

实际施法扣灵还会再经过 `calcQiCostWithOutputLimit(cost, maxQiOutputPerTick)`，超过当前玩家每息灵力输出上限时递增惩罚。

## 技能定义（SkillDef）

关键字段:
- id, name, desc
- cooldown（息）
- cost（灵力）
- range（射程）
- targeting（目标选择）
- effects[]（效果列表: damage / heal / buff）
- unlockLevel, unlockRealm

## 技能公式结构（SkillFormula）

递归 AST:
- 常数: `number`
- 变量引用: `{ var: SkillFormulaVar, scale? }`
- 运算: `{ op: 'add'|'sub'|'mul'|'div'|'min'|'max', args: SkillFormula[] }`
- 钳位: `{ op: 'clamp', value, min?, max? }`

## AI 术法权重展开

源文件: `packages/shared/src/technique-arts-strength.ts`

内容和 AI 草稿只写权重，不直接写运行时 `effects[].formula`、`cost`、`cooldown`、`targeting`。
伤害/治疗的效果强度只来自属性基底或变量基底，不再支持固定基础伤害值。

目标展开口径：

```typescript
positiveWeight = sum(max(itemWeight, 0))
sacrificeBudget = sum(BUDGET(layer) * abs(negativeWeight) / 100)
positiveBudgetPool = BUDGET(layer) + sacrificeBudget
positive itemBudget = positiveBudgetPool * itemWeight / positiveWeight
negative itemBudget = -BUDGET(layer) * abs(itemWeight) / 100
realValue = convertByItem(itemBudget)
```

- `target.type/targetMode` 只描述目标形状和目标模式，不承载预算权重。
- `structureStrength.damage/cost/cooldown/chant/castRange/area` 是强度权重，不是真实伤害、消耗、冷却、吟唱、距离或覆盖范围。
- `line` 目标按“中心线长度 × 固定线宽”的无圆头条带选格，施法者所在格不计入覆盖；例如射程 1、宽度 9 必须且只能覆盖 9 格，预算覆盖数、hover 最大目标数与服务端实际命中使用同一口径。
- `chant` 的负预算会换算为真实吟唱息数并写入正式 `SkillDef.playerCast.windupTicks`；零或正预算保持瞬发。预览、hover 与服务端权威施法都读取该正式字段。
- 旧草稿里的 `target.castRangeWeight/areaWeight` 仍可作为兼容输入读取；新 AI 生成入口应写 `structureStrength.castRange/area`。
- 结构负权重会让本项产生真实负面效果，并按绝对权重折算牺牲预算加入正向预算池；百分比来源不接受负权重，也不产生牺牲预算。
- 冷却、消耗、施法距离、范围覆盖、属性基底和百分比组各自使用独立转换公式。
- 百分比组中，移动速度每点按 `0.001` 计入总伤害乘区；每 1 级技艺按 100 点移动速度等价，即系数 `0.1`；每 1 级境界按 120 点移动速度等价，即系数 `0.12`。技艺等级由服务端权威玩家运行态读取，任一技艺升级都会使相关技能伤害缓存失效。
- 百分比组合倍率按最终正预算配比计算。均衡 1/2/3/4/5 项的倍率上限为 `1.0/1.1/1.3/1.6/2.0`，五项以上仍封顶 `2.0`；服务端使用预算变异系数连续降低失衡配比的奖励，`CV >= 1` 时组合倍率回到 `1.0`。功法层数默认每层 `10%` 不计入组合来源，只有正预算购买的额外层数加成参与。
- 有最小值或最大值的项目先展开真实值，再按真实可生效值反推已使用预算。
- 每个转换方法返回真实值、已使用预算和未使用预算；触顶或离散档位暂时用不完的正预算按固定轮次、依照原始正权重比例回流到仍可增长的项目。

详细公式见 `docs/design/balance/术法预算量化设计.md`。正式运行时仍保存展开后的 `SkillDef`，战斗 tick 不读取 AI 权重草稿。

已发布 AI 术法的 `generated_technique.template.skills` 不会因公式代码更新而自动重算。公式调整后，运维需要先通过 GM 快捷指令“迁移旧版AI术法草稿”从 `rawCandidate` 重新展开模板，再通过“刷新在线玩家功法模板”让在线玩家已学技能重新水合；离线玩家下次登录时读取最新模板。

批量取消已发布自创术法吟唱时，使用专用 GM 兼容转换 `generated-technique-chant-zero`。它只匹配原始草稿 `structureStrength.chant < 0` 且正式 `playerCast.windupTicks > 0` 的已发布自创术法，将吟唱权重归零后通过同一套正式预算展开器重算完整 `SkillDef`；系统内置功法、草稿和已经瞬发的自创术法不在范围内。`dry-run` 返回精确目标数和目标指纹，`apply` 必须回传二者，目标在两步之间发生变化时整批拒绝。更新在单事务中完成，并保存原吟唱权重和息数作为转换审计信息；提交后刷新生成功法缓存，再通过“刷新在线玩家功法模板”更新运行时玩家，普通离线玩家下次登录时从最新模板水合。

系统自带功法为了迁移旧版手写 `SkillDef`，允许在 `artsStrength` 中使用显式还原参数：`target.rawRange/rawTargeting`、`structureStrength.costMultiplier/cooldownTicks` 和效果里的 `formulaStrength.rawFormula/hpFormulaStrength.rawFormula`。这些字段只用于静态系统内容等价还原旧数值，不进入 AI 生成提示词，也不改变预算公式本身。

### 术法权重反推工具

冷路径工具 `technique-arts-weight-solver` 可根据目标冷却、半径、消耗、目标数或公式强度反推 GM 手工术法权重。工具始终调用正式 `buildGmCustomTechnique` 展开器，只输出设计方案，不连接数据库、不发布或修改功法。

```bash
pnpm solve:technique-arts-weights -- --request request.json
# 或从标准输入读取
pnpm solve:technique-arts-weights -- --request - < request.json
```

请求结构：

- `technique`：严格的 GM 手工术法输入。
- `targets`：目标数组，`metric` 支持 `cooldown/radius/maxTargets/range/cost/spellAtkScale/formulaBudget/referenceFormulaValue`，`operator` 支持 `eq/lte/gte`。
- `variables`：允许调整的权重组。同组 `keys` 绑定为同一个值，例如把移动速度、境界等级和传法等级三个百分比权重同步调整。
- `objective`：支持 `minWeightDelta/maxSpellAtkScale/maxFormulaBudget/maxReferenceFormulaValue`。
- `referenceFormulaVars`：仅在按参考公式值比较时提供；该值只代表技能公式结果，不包含减伤和其他战斗乘区。
- `search`：可设置 `auto/exhaustive/adaptive`、评估上限、采样量、beam 宽度和返回数量。结果会明确标记是否完成全量穷举；自适应搜索不会冒充全局最优。

变量键使用 `structure.damage`、`structure.area` 等六项结构权重，或 `percent.moveSpeed`、`percent.realmLevel`、`percent.transmissionLevel` 等百分比来源。未列入变量组的权重保持原值，可用于锁定 `cost=0`、`chant=0` 等约束。

## 炼体系统

```typescript
BODY_TRAINING_EXP_BASE = 10000
BODY_TRAINING_EXP_GROWTH_RATE = 1.2
getBodyTrainingExpToNext(level) = round(10000 × 1.2^level)
BODY_TRAINING_ATTR_PERCENT_PER_LEVEL = 1  // 每层全属性+1%
```
