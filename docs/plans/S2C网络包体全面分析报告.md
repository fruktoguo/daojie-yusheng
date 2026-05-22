# S2C 网络包体全面分析报告

> 环境：5000 并发玩家，30Mbps 出口带宽，tick 频率 1Hz
> 每玩家每 tick 预算：3.75MB/s ÷ 5000 = 750 bytes/tick
> 当前编码：纯 JSON 对象，Socket.IO WebSocket 直发，无压缩

---

## 一、传输层现状

| 项目 | 当前状态 |
|------|----------|
| 编码格式 | JSON 对象直发（protobuf schema 已定义但未启用） |
| 压缩 | 无 perMessageDeflate |
| 批量合并 | 无（worldDelta/selfDelta/panelDelta 各自独立 emit） |
| 增量机制 | 有（WorldProjector 前帧缓存 + SyncSlot 脏检测） |
| 字段缩写 | 部分（worldDelta 用 t/wr/sr/p/m/n 等短名） |
| AOI 裁剪 | 有（按玩家视野过滤） |
| Worker 编码 | 架构已搭建但硬编码禁用 |

---

## 二、高频包体（每 tick，带宽影响最大）

### 2.1 S2C_WorldDelta — 世界增量包

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（有变化时） |
| 典型大小 | 300–800 B（移动+少量战斗） |
| 峰值大小 | 2–8 KB（大规模战斗） |

**字段列表**：
- `t`(tick序号), `wr`(世界revision), `sr`(self revision)
- `p?`(玩家patch[]), `m?`(怪物patch[]), `n?`(NPC patch[])
- `o?`(传送点patch[]), `g?`(地面掉落patch[]), `c?`(容器patch[])
- `bd?`(建筑patch[]), `fmn?`(阵法patch[])
- `threatArrows?`(仇恨箭头全量), `threatArrowAdds?`, `threatArrowRemoves?`
- `fx?`(战斗特效[]), `eventBus?`(事件总线)
- `path?`(寻路路径), `time?`(游戏时间9字段)
- `v?`(视野地块全量), `tp?`(视野地块增量)
- `vma?`(小地图标记新增), `vmr?`(小地图标记移除)
- `mid?`(地图ID), `dt?`(调试时间), `auraLevelBaseValue?`

**可优化点**：
1. ⚠️ `threatArrows` 全量与增量并存 → 应只发增量
2. ⚠️ `time`(GameTimeState) 9字段大部分不变 → 拆为低频全量+高频仅发 totalTicks/phase
3. ⚠️ `v`(视野全量) 11×11=121格 JSON 约 5-7KB → 仅切图时全量，平时只发 tp 增量
4. `path` 长路径 20-50 点 → delta 编码或只发前 N 步
5. 实体 id 为 UUID 36字节 → 短整数映射（进入视野时分配 local index）
6. `WorldFormationPatchView` 20+字段 → 拆为 enter 全量 + tick 仅发动态字段
7. `CombatEffect` 坐标 4 个 number → packed uint16

---

### 2.2 S2C_SelfDelta — 自身状态增量

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（selfRevision 变化时） |
| 典型大小 | 60–100 B |
| 峰值大小 | 150–300 B（含 wallet） |

**字段列表**：
- `sr`(revision), `iid?`(实例ID), `mid?`(地图ID)
- `x?`, `y?`, `f?`(朝向)
- `hp?`, `maxHp?`, `qi?`, `maxQi?`
- `wallet?`(PlayerWalletState)

**可优化点**：
1. `wallet` 含 balances 数组 → 战斗中不应每 tick 发，可降频 5-10 tick 合并
2. `sr` 同时出现在 WorldDelta 和 SelfDelta → 可从 SelfDelta 移除

---

### 2.3 S2C_PanelBuffDelta — Buff 面板增量

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（buffSignature 变化时） |
| 典型大小 | 500–1500 B（战斗中） |
| 峰值大小 | 2–5 KB |

**字段列表**：
- `r`(revision), `full?`, `buffs?`(VisibleBuffState[]), `removeBuffIds?`

**VisibleBuffState 17+字段**：buffId, name, desc, shortMark, category, visibility, remainingTicks, duration, stacks, maxStacks, sourceSkillId, sourceSkillName, realmLv, color, attrs, attrMode, stats, statMode, qiProjection, infiniteDuration, presentationScale

**可优化点**：
1. 🔴 **remainingTicks 每 tick -1 导致全量重发** → 客户端本地递减，仅 buff 新增/移除/stacks 变化时同步
2. 🔴 name/desc/attrs/stats 等静态字段每次重发 → 拆为 buff_add(全字段) + buff_tick(仅 id+stacks)
3. attrs/stats 嵌套对象 100+ bytes/buff → 仅首次发送

---

### 2.4 S2C_PanelAttrDelta — 属性面板增量

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（attrSignature 变化时） |
| 典型大小 | 60–200 B |
| 峰值大小 | 800–2000 B |

**字段列表**：
- `r`, `full?`, `stage?`, `baseAttrs?`, `bonuses?`(AttrBonus[])
- `finalAttrs?`, `numericStats?`(29项), `ratioDivisors?`(6项)
- `numericStatBreakdowns?`, `maxHp?`, `qi?`, `specialStats?`
- `boneAgeBaseYears?`, `lifeElapsedTicks?`, `lifespanYears?`
- `realmProgress?`, `realmProgressToNext?`, `realmBreakthroughReady?`
- 6种生活技能状态

**可优化点**：
1. 🔴 **lifeElapsedTicks 每 tick +1 触发整个 attr delta** → 移出 attr 面板，客户端本地递增
2. ⚠️ `bonuses` 全量重发（5-15条×50-200B） → 增量
3. ⚠️ `numericStatBreakdowns` 极大（29属性×8字段=5KB+） → 仅面板打开时按需请求
4. `realmProgress` 修炼中每 tick 变化 → 降频或客户端预测

---

### 2.5 S2C_PanelActionDelta — 行动面板增量

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（actionSignature 变化时） |
| 典型大小 | 100–300 B（战斗中） |
| 峰值大小 | 500–2000 B |

**字段列表**：
- `r`, `full?`, `actions?`(ActionUpdateEntryView[]), `removeActionIds?`
- `actionOrder?`, `autoBattle?`, `autoUsePills?`(嵌套conditions)
- `combatTargetingRules?`, `autoBattleTargetingMode?`
- `combatTargetId?`, `combatTargetLocked?`, `retaliatePlayerTargetId?`
- 多个 boolean 开关

**ActionUpdateEntryView**：id, cooldownLeft, autoBattleEnabled, autoBattleOrder, skillEnabled, name, type, desc, range, requiresTarget, targetMode

**可优化点**：
1. 🔴 **cooldownLeft 每 tick 递减触发全量 action entry 重发** → 拆为独立轻量通道 `{actionId: remaining}`
2. ⚠️ 战斗配置字段（autoUsePills/combatTargetingRules）仅玩家修改时变 → 拆为独立配置通道
3. `combatTargetId` 高频变化与 action 面板耦合 → 移至 SelfDelta 或 EventBus
4. name/type/desc/range 静态字段 → 仅首次发送

---

### 2.6 S2C_PanelTechniqueDelta — 功法面板增量

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（revision 变化时） |
| 典型大小 | 40–80 B（exp变化） |
| 峰值大小 | 2–10 KB（全量） |

**字段列表**：
- `r`, `full?`, `techniques?`(TechniqueUpdateEntryView[])
- `removeTechniqueIds?`, `cultivatingTechId?`, `bodyTraining?`

**TechniqueUpdateEntryView**：techId, level, exp, expToNext, realmLv, realm, skillsEnabled, name, grade, category, skills(SkillDef[]), layers(TechniqueLayerDef[])

**可优化点**：
1. ⚠️ **exp 变化触发整个 entry 重发（含 skills/layers 大数组）** → 拆为数值增量 + 定义变化两通道
2. skills/layers 单个 skill 500+ bytes → 仅学习/遗忘时发送
3. name/grade/category 静态字段 → 仅首次发送

---

### 2.7 S2C_PanelInventoryDelta — 背包面板增量

| 属性 | 值 |
|------|-----|
| 频率 | 每 tick（revision 变化时） |
| 典型大小 | 80–300 B |
| 峰值大小 | 3–8 KB（全量） |

**字段列表**：
- `r`, `full?`, `capacity?`, `size?`
- `slots?`(InventorySlotUpdateEntry[]), `cooldowns?`, `serverTick?`

**InventorySlotUpdateEntry**：`{ slotIndex, item: SyncedItemStack|null }`
**SyncedItemStack**：40+ 可选字段

**可优化点**：
1. ⚠️ `cooldowns` 每次全量下发 → 增量（仅变化的 itemId + 剩余 tick）
2. ⚠️ SyncedItemStack 含 name/desc/equipAttrs 等静态字段 → 只发 itemId+count+enhanceLevel
3. `serverTick` 冗余（WorldDelta 已携带）
4. 连续 slotIndex 可用 bitmask 替代

---

### 2.8 S2C_PanelEquipmentDelta — 装备面板增量

| 属性 | 值 |
|------|-----|
| 频率 | 低频（玩家主动操作时） |
| 典型大小 | 100–400 B |

**可优化点**：
1. slot 字符串('weapon'等) → 枚举索引(0-4)
2. SyncedItemStack 静态字段 → 只发 itemId+enhanceLevel

---

## 三、中频包体（战斗/事件触发）

### 3.1 S2C_Notice / S2C_NoticeItem — 通知消息

| 属性 | 值 |
|------|-----|
| 频率 | 高频（战斗时每 tick 3-10 条） |
| 典型大小 | 200–2000 B/批次 |

**字段列表**：
- items: [{ id?, messageId?, kind, text, from?, occurredAt?, persistUntilAck?, castId?, combat?, combatGroup?, structured?, structuredGroup? }]

**combat payload**：caster, target, skill, resolution(rawDamage/damage/damageKind/element/crit/broken/resolved)

**可优化点**：
1. 🔴 **text 与 combat/structured 冗余** → 当 combat/structured 存在时不发 text
2. ⚠️ 同一 castId 多次命中 → 合并为单条
3. caster/target 用 entityId 替代文本名称
4. rawDamage 在有 damage 时可省略
5. 非关键 notice 降频或批量延迟发送

---

### 3.2 S2C_QuestUpdate — 任务列表更新

| 属性 | 值 |
|------|-----|
| 频率 | 低频（任务进度变化时） |
| 典型大小 | 50–300 B |

**字段列表**：
- `r?`(revision), `full?`, `quests`(QuestRuntimeStateView[]), `removeQuestIds?`

**QuestRuntimeStateView**：id(string), status(QuestStatus), progress(number)

**可优化点**：
1. 已实现增量机制，设计良好
2. status 字符串('available'|'active'|'ready'|'completed') → uint8 枚举
3. id 如为 UUID → 短 ID 映射

---

### 3.3 S2C_LootWindowUpdate — 战利品窗口增量

| 属性 | 值 |
|------|-----|
| 频率 | 中频（战斗掉落时） |
| 典型大小 | 100–500 B |

**可优化点**：
- 内含完整 ItemStack → 只发 itemId + count

---

## 四、低频/按需包体

### 4.1 S2C_Leaderboard — 排行榜同步

| 属性 | 值 |
|------|-----|
| 频率 | 低频（30-60s 周期广播） |
| 典型大小 | 3–15 KB |
| **5000人带宽** | **13+ Mbps（占出口 44%！）** |

**字段列表**：
- generatedAt, limit, boards: { realm[], monsterKills[], spiritStones[], playerKills[], deaths[], bodyTraining[], supremeAttrs[], sects[] }
- 每条 entry 含 playerId(UUID 36B) + playerName(~20B) + rank + 业务字段

**可优化点**：
1. 🔴 **全量广播给所有在线玩家** → 改为按需拉取（打开面板时请求）
2. 🔴 playerId UUID 36字节 → varint 索引
3. ⚠️ playerName 首次下发后缓存，后续只发 playerId
4. 分榜下发：玩家只订阅当前查看的榜单
5. 增量同步：只发 rank 变动/新上榜条目

---

### 4.2 S2C_Init — 首屏初始化数据

| 属性 | 值 |
|------|-----|
| 频率 | 按需（连接时 1 次） |
| 典型大小 | 5–30 KB |

**字段列表**：
- self(BootstrapSelfView), mapMeta?, minimap?, visibleMinimapMarkers?
- minimapLibrary?(deprecated), tiles?[][], players?[], time?, auraLevelBaseValue?

**可优化点**：
1. ⚠️ `tiles[][]` 二维数组 121 格 JSON 膨胀 → RLE 或 palette+index 编码（压缩 60-80%）
2. `minimapLibrary` 已 deprecated → 彻底移除
3. BootstrapSelfView 含服务端内部字段(online/inWorld/lastHeartbeatAt) → 裁剪
4. minimap.terrainRows 大地图数 KB → 走版本协商，首包不重复下发

---

### 4.3 S2C_MapStaticSync — 地图静态同步

| 属性 | 值 |
|------|-----|
| 频率 | 低频（切图时） |
| 典型大小 | 3–20 KB |

**字段列表**：
- mapId, mapMeta?, minimap?, minimapLibrary?(deprecated)
- unlockedMapIds?, tiles?[][], tilesOriginX?, tilesOriginY?, visibleMinimapMarkers?

**可优化点**：
1. ⚠️ tiles 与 S2C_Init 重复 → 增量同步（只发变化格）
2. 移除 deprecated minimapLibrary
3. unlockedMapIds 字符串数组 → bitmap 或只发增量

---

### 4.4 S2C_MapEnter — 地图进入包

| 属性 | 值 |
|------|-----|
| 频率 | 按需（切图时） |
| 典型大小 | 100–180 B |

**字段列表**：iid, mid, n, k, w, h, x, y

**可优化点**：
- 已用单字母缩写，紧凑
- mid/iid 可考虑 varint 索引替代 UUID

---

### 4.5 S2C_RealmUpdate — 境界低频同步

| 属性 | 值 |
|------|-----|
| 频率 | 低频（境界变化时） |
| 典型大小 | 300–1200 B |

**字段列表**：realm: PlayerRealmState（stage/realmLv/displayName/name/shortName/path/narrative/review/lifespanYears/progress/progressToNext/breakthroughReady/nextStage/breakthroughItems/minTechniqueLevel/minTechniqueRealm/breakthrough/heavenGate）

**可优化点**：
1. narrative/review 纯文本 100+ 字符 → 首次下发后缓存
2. displayName/name/shortName 可由 realmLv 客户端查表
3. breakthroughItems 仅突破准备阶段需要

---

### 4.6 S2C_GmState — GM 总览状态

| 属性 | 值 |
|------|-----|
| 频率 | 低频（GM 面板 1-5s） |
| 典型大小 | 10–100 KB |

**字段列表**：players(GmPlayerSummary[]), mapIds[], botCount, perf(深层嵌套)

**可优化点**：
1. 🔴 players 5000人×150B = 750KB → 分页或只发变化
2. perf 拆为独立请求，按需拉取
3. 增量同步：只发变化的 player 条目

---

### 4.7 S2C_MinimapLibraryDelta — 小地图增量下发

| 属性 | 值 |
|------|-----|
| 频率 | 按需（版本不匹配时） |
| 典型大小 | 1–10 KB/地图 |

**可优化点**：
- terrainRows 字符串数组 → RLE 压缩
- markers 中 label/detail → i18n key

---

## 五、服务类包体（坊市/邮件/商店）

### 5.1 S2C_MarketUpdate — 坊市首页同步

| 属性 | 值 |
|------|-----|
| 频率 | 按需 + 交易后广播给订阅者 |
| 典型大小 | 2–15 KB |

**字段列表**：currencyItemId, currencyItemName, listedItems(MarketListedItemView[]), myOrders(MarketOwnOrderView[]), storage(MarketStorage)

**可优化点**：
1. 🔴 **每次交易广播完整 MarketUpdate** → 改为脏标记+按需拉取（100人订阅×15KB=1.5MB/次 → 100×20B=2KB）
2. ⚠️ listedItems/myOrders 嵌入完整 ItemStack → 只发 itemKey+name+type+price
3. currencyItemId/currencyItemName 每次重复 → 全局配置一次

---

### 5.2 S2C_MarketListings — 坊市分页列表

| 属性 | 值 |
|------|-----|
| 频率 | 按需 + 交易后广播 |
| 典型大小 | 3–20 KB |

**可优化点**：
1. ⚠️ item?: ItemStack 40+字段 → 列表只需 name+grade+equipSlot（5-6字段）
2. counts 每次都发 → revision 机制按需下发
3. category/equipmentSlot 回显 → 客户端已知，省略
4. 广播给所有订阅者 → 脏标记通知

---

### 5.3 S2C_AuctionListings — 拍卖行分页列表

| 属性 | 值 |
|------|-----|
| 频率 | 按需 |
| 典型大小 | 5–30 KB |

**可优化点**：
1. ⚠️ bids 数组 → 列表页只需 bidCount+currentPrice，详情页再拉
2. item?: ItemStack → 只发 itemId+name+grade
3. statusLabel/sellerLabel 字符串 → enum ID + 客户端本地化

---

### 5.4 S2C_MarketOrders — 玩家坊市订单

| 属性 | 值 |
|------|-----|
| 频率 | 按需 + 交易后推送 |
| 典型大小 | 1–8 KB |

**可优化点**：
1. ⚠️ 全量推送完整订单列表 → 增量（只推变化的订单）
2. item: ItemStack 全量 → 只发 itemId+name
3. side/status 字符串 → 1字节枚举

---

### 5.5 S2C_NpcShop — NPC 商店同步

| 属性 | 值 |
|------|-----|
| 频率 | 按需（打开商店时） |
| 典型大小 | 2–10 KB |

**可优化点**：
1. ⚠️ SyncedItemStack 40+字段 → 商店只需 itemId+name+type+grade+unitPrice
2. dialogue 文本 → templateId 客户端本地化
3. 静态商品每次全量 → version 缓存机制

---

### 5.6 S2C_SuggestionUpdate — 建议列表更新

| 属性 | 值 |
|------|-----|
| 频率 | 按需 + 有新建议时广播所有在线玩家 |
| 典型大小 | 5–50 KB |

**可优化点**：
1. 🔴 **upvotes/downvotes 是完整 playerId 数组** → 只发 count
2. 🔴 **全量广播完整列表** → revision + diff 增量
3. replies 全量嵌入 → 分页或只发 replyCount+最新几条
4. description/content 全文 → 列表页截断摘要

---

### 5.7 S2C_MailSummary — 邮件摘要

| 属性 | 值 |
|------|-----|
| 频率 | 按需 |
| 典型大小 | 50–80 B |

**可优化点**：已紧凑，无需优化

---

### 5.8 S2C_MailPage — 邮件分页

| 属性 | 值 |
|------|-----|
| 频率 | 按需 |
| 典型大小 | 1–4 KB |

**可优化点**：
1. totalPages 冗余（可计算） → 省略
2. filter 回显 → 省略
3. summary 字段可能较长 → 限制长度

---

## 六、详情类包体（按需拉取）

### 6.1 S2C_NpcDetail

| 典型大小 | 150–500 B |
|------|-----|

**可优化点**：dialogue 100+字符 → 客户端缓存 NPC 对话模板；name/char/color 静态 → 重复查看不重发

### 6.2 S2C_MonsterDetail

| 典型大小 | 200–600 B |
|------|-----|

**可优化点**：name/char/color/tier 模板静态 → 只发 mid（模板ID）客户端查表；buffs[].name 可省略

### 6.3 S2C_PlayerDetail

| 典型大小 | 150–400 B |
|------|-----|

**可优化点**：observation 含 ObservationInsight 可能较大 → 按需裁剪

### 6.4 S2C_TileDetail

| 典型大小 | 200–1500 B |
|------|-----|

**可优化点**：terrainType/surfaceType/structureType/walkable/blocksSight 静态地图数据 → 客户端从地图模板推导，只下发运行时动态字段(hp/resources/entities/ground)

### 6.5 S2C_PortalDetail / S2C_GroundDetail / S2C_ContainerDetail

| 典型大小 | 80–500 B |
|------|-----|

**可优化点**：
- targetMapName/name 可客户端查表
- ItemStack 只发 itemId+count

---

## 七、其他包体（已紧凑/低优先级）

| 包体 | 大小 | 说明 |
|------|------|------|
| S2C_Pong | 30-50 B | 已极简 |
| S2C_Error | 50-200 B | 无需优化 |
| S2C_SystemMsg | 80-300 B | 体积小 |
| S2C_BuildResult | 100-500 B | 低频 |
| S2C_RoomSummaryPatch | 100-1000 B | 已是增量设计 |
| S2C_FengShuiOverlayPatch | 100-2000 B | roomId UUID→短索引；grade 枚举→uint8 |
| S2C_FengShuiDetail | 300-1500 B | reasons[].code→枚举索引 |
| S2C_MailOpResult | 100-500 B | operation 字符串→枚举 |
| S2C_QuestNavigateResult | 100-2000 B | path 坐标→delta 编码 |
| S2C_RedeemCodesResult | 200-1000 B | 极低频 |
| S2C_MinimapLibraryManifest | 100-500 B | 已紧凑 |
| S2C_OfflineGainReports | 500-5000 B | items/techniques 中 name→客户端查模板 |
| S2C_WorldSummary | 200-350 B | 可接受，可只在数值变化时推送 |

---

## 八、实测数据（单玩家 72s 采样）

| 包体 | 总量 | 占比 | 次数 | 均次 | 均秒 |
|------|------|------|------|------|------|
| **s2c_PanelDelta** | **3.1 MB** | **62.3%** | 399 | 8.1 KB | 43.4 KB/s |
| s2c_WorldDelta(entity+fx) | 614.7 KB | 11.9% | 296 | 2.1 KB | 8.3 KB/s |
| s2c_MapStatic | 361.7 KB | 7.0% | 3 | 120.6 KB | 4.9 KB/s |
| s2c_Realm | 218.8 KB | 4.2% | 147 | 1.5 KB | 3.0 KB/s |
| s2c_WorldDelta(tile) | 213.6 KB | 4.1% | 348 | 629 B | 2.9 KB/s |
| s2c_WorldDelta(threat) | 119.6 KB | 2.3% | 258 | 475 B | 1.6 KB/s |
| s2c_OfflineGainReports | 110.8 KB | 2.1% | 148 | 767 B | 1.5 KB/s |
| s2c_Quests | 65.6 KB | 1.3% | 322 | 209 B | 907 B/s |
| s2c_WorldDelta(tile+minimap) | 41.7 KB | 0.8% | 9 | 4.6 KB | 576 B/s |
| s2c_MarketUpdate | 35.0 KB | 0.7% | 1 | 35.0 KB | 483 B/s |
| s2c_MarketOrders | 34.9 KB | 0.7% | 1 | 34.9 KB | 482 B/s |
| s2c_Bootstrap | 34.6 KB | 0.7% | 1 | 34.6 KB | 479 B/s |
| s2c_WorldDelta(entity) | 28.1 KB | 0.5% | 45 | 640 B | 388 B/s |
| s2c_MarketListings | 15.9 KB | 0.3% | 1 | 15.9 KB | 220 B/s |
| s2c_Leaderboard | 11.1 KB | 0.2% | 1 | 11.1 KB | 153 B/s |
| s2c_AttrDetail | 10.3 KB | 0.2% | 1 | 10.3 KB | 142 B/s |
| s2c_WorldDelta(fx) | 9.0 KB | 0.2% | 13 | 710 B | 125 B/s |
| s2c_SelfDelta | 6.4 KB | 0.1% | 220 | 30 B | 88 B/s |
| s2c_Pong | 4.1 KB | 0.1% | 70 | 60 B | 57 B/s |
| s2c_TileDetail | 1.8 KB | 0.0% | 1 | 1.8 KB | 25 B/s |

**总计**：~5.1 MB / 72s = ~71 KB/s/玩家

**5000 人外推**：71 KB/s × 5000 = 355 MB/s = 2840 Mbps >> 30 Mbps（超出 94 倍）

---

## 九、带宽热点排序（基于实测数据）

| 优先级 | 包体/问题 | 实测占比 | 根因 | 优化方案 | 预估节省 |
|--------|-----------|----------|------|----------|----------|
| **P0** | **PanelDelta 伪增量** | **62.3%** | buff remainingTicks/attr lifeElapsedTicks/action cooldownLeft 每 tick 触发全量重发 | 客户端本地递减+签名移除高频字段 | 均次 8.1KB→<1KB（**87%**） |
| **P0** | **PanelDelta 静态字段** | 含在上方 | SyncedItemStack/VisibleBuffState/TechniqueEntry 含 name/desc/skills/attrs 等模板数据 | 只发实例态(itemId+count)，客户端查本地模板 | 进一步 **60-80%** |
| P1 | WorldDelta(entity+fx) | 11.9% | 怪物/NPC 含 name/color/tier 静态字段 | 首次出现发 templateId，客户端查表 | 均次 2.1KB→~1KB（**50%**） |
| P1 | MapStatic | 7.0% | tiles 全量 JSON 二维数组 120KB/次 | RLE/palette 编码 + 增量 | **60-80%** |
| P1 | Realm 高频推送 | 4.2% | progress 每 tick 递增触发全量 | 阈值比较（变化<1%不发） | 147次→~15次（**90%**） |
| P1 | OfflineGainReports | 2.1% | 统计每 tick 累积触发发送 | 时间节流（每 10s 最多 1 次） | 148次→~7次（**95%**） |
| P2 | WorldDelta(threat) | 2.3% | 仇恨箭头全量+增量并存 | 只发增量 | **50%** |
| P2 | WorldDelta(tile) | 4.1% | 视野地块增量已合理 | 无需优化 | - |
| P2 | 启用 perMessageDeflate | 全局 | JSON 文本无压缩 | 配置项 | 全局 **50-70%** |
| P3 | 子包合并单次 emit | 全局 | 帧头开销 | 合并 worldDelta+selfDelta+panelDelta | 减少帧头 |
| P3 | 激活 protobuf | 全局 | JSON 格式开销 40-60% | schema 已就绪 | **30-50%** vs JSON |

---

## 十、优化路线与预期效果

### 第一阶段：止血（修复伪增量签名）

| 修复项 | 位置 | 效果 |
|--------|------|------|
| attrSignature 移除 lifeElapsedTicks | buildAttrPanelSignature | attr 面板不再每 tick 触发 |
| buffSignature 移除 remainingTicks | buildBuffListSignature | buff 面板不再每 tick 触发 |
| actionSignature 移除 combatTargetId | buildActionPanelSignature | action 面板不再因目标切换触发 |
| Realm progress 阈值比较 | isSameRealmState | 147次→~15次 |
| OfflineGainReports 节流 | emitPendingPlayerStatisticRecords | 148次→~7次 |

**预期**：PanelDelta 399次→~50次，均次 8.1KB→~4KB（因仍含静态字段），总量 3.1MB→~200KB

### 第二阶段：瘦身（面板增量只发实例态）

| 面板 | 当前 | 优化后 |
|------|------|--------|
| 背包 slot | SyncedItemStack 40+字段 | { itemId, count, enhanceLevel } |
| 装备 slot | SyncedItemStack 40+字段 | { itemId, enhanceLevel } |
| 功法 entry | TechniqueUpdateEntry 含 skills/layers | { techId, level, exp, expToNext, realmLv } |
| 行动 entry | ActionUpdateEntry 含 name/desc/range | { id, cooldownLeft, autoBattleEnabled } |
| Buff entry | VisibleBuffState 17+字段 | { buffId, stacks, duration } |
| 属性 | 全量含 bonuses/breakdowns | L1 仅 finalAttrs+numericStats |

**预期**：PanelDelta 均次 ~4KB→<500B，总量 ~200KB→~25KB

### 第三阶段：世界实体精简

| 实体 | 移除字段 | 客户端补齐方式 |
|------|----------|---------------|
| 怪物 | name/color/tier | MonsterTemplate[mid] |
| NPC | name/char/color/hasShop | NpcTemplate[id] |
| 传送门 | name/char/targetMapId/direction | 地图模板 |

**预期**：WorldDelta 均次 2.1KB→~1KB

### 第四阶段：传输层压缩

启用 perMessageDeflate 或 protobuf。

**预期**：在前三阶段基础上再减 50-70%

### 总体预期

| 阶段 | 单玩家均秒 | 5000人带宽 | 占 30Mbps |
|------|-----------|-----------|-----------|
| 当前 | 71 KB/s | 2840 Mbps | 9467% ❌ |
| 第一阶段后 | ~15 KB/s | 600 Mbps | 2000% ❌ |
| 第二阶段后 | ~8 KB/s | 320 Mbps | 1067% ❌ |
| 第三阶段后 | ~6 KB/s | 240 Mbps | 800% ❌ |
| 第四阶段后(压缩70%) | ~2 KB/s | 80 Mbps | 267% ⚠️ |
| +AOI 优化+降频 | <0.75 KB/s | <30 Mbps | ✅ |

> 注：实测数据为单玩家活跃场景（含战斗+修炼+切图），5000人外推需考虑大部分玩家处于低活跃状态，实际带宽约为峰值的 30-50%。
