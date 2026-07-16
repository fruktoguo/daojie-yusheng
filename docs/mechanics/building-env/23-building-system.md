# 建筑系统

## 世界空间分层口径

建筑显示和交互按三类世界空间层理解：

1. 基础空间层：服务端权威的 cell 真源，包含 `terrain`、`surface`、`structure`、`ground_interactable`。
2. 活体/移动实体层：玩家、NPC、妖兽等会移动、占位、战斗或 AI 推进的对象。
3. 表现层：建造预览、风水覆盖、选中/hover、范围提示、飘字和遮罩，只影响视觉，不进入权威规则。

建筑 `placement.layer` 映射到基础空间层：

| 建筑层 | 基础空间落点 | 说明 |
|----|----|----|
| structure | structure | 墙、门、窗等会改变结构层的建筑 |
| floor | surface | 地板等地表覆盖 |
| facility | ground_interactable | 藏经台等地面交互物 |
| furniture | ground_interactable | 家具类地面交互物，当前正式建筑目录未启用 |
| decoration | ground_interactable | 装饰类地面交互物 |

`ground_interactable` 不是旧 `TileType`。它承载地面对象语义，建筑、容器、阵法、传送点、机关都属于这一类，但来源、能力和持久化真源可以不同。

## 建筑层级（BuildingPlacementLayer）

| 层 | ID | 说明 |
|----|-----|------|
| structure | 1 | 结构层（墙/柱） |
| floor | 2 | 地板层 |
| facility | 3 | 设施层 |
| furniture | 4 | 家具层 |
| decoration | 5 | 装饰层 |

## 建筑拓扑标志位

```typescript
BUILDING_TOPOLOGY_BLOCKS_MOVE      = 1 << 0  // 阻挡移动
BUILDING_TOPOLOGY_BLOCKS_SIGHT     = 1 << 1  // 阻挡视线
BUILDING_TOPOLOGY_ROOM_BOUNDARY    = 1 << 2  // 房间边界
BUILDING_TOPOLOGY_SEMI_OUTDOOR_LINK = 1 << 3  // 半户外连接
```

## 建筑常量

| 常量 | 值 |
|------|-----|
| BUILDING_DEFAULT_MAX_HP | 100 |
| BUILDING_DEFAULT_BUILD_TICKS | 1 |
| BUILDING_MAX_BUILD_TICKS | 86400 |
| BUILDING_DEFAULT_DECONSTRUCT_TICKS | 1 |
| BUILDING_ROOM_BOUNDARY_MAX | 100 |
| BUILDING_ROOF_COVERAGE_MAX | 100 |
| BUILDING_SHA_SHIELD_MAX | 100 |

## 建筑拓扑索引（BuildingTopologyIndex）

TypedArray 索引结构，按 cellIndex 存储:
- structureHandleByCell (Uint32)
- floorHandleByCell (Uint32)
- facilityHandleByCell (Uint32)
- topologyMaskByCell (Uint32)
- roomBoundaryByCell (Uint8)
- openingKindByCell (Uint8): none=0, door=1, window=2
- roofCoverageByCell (Uint8)
- shaShieldByCell (Uint8)

## 建筑放置规则

```
检查顺序（锚点与 footprint 覆盖的每一格都要过）:
1. 落入受保护点位禁建区 → `protected_placement_portal` / `protected_placement_npc`
   / `protected_placement_spawn` / `protected_placement_safe_zone`
2. occupancy[cellIndex] !== 0 → 'occupied'
3. structure 层已有建筑 → 'structure_overlap'
4. 同层已有建筑 → 'building_layer_overlap'
5. 地块不可行走 → 'tile_not_clear'
```

### 拆除与连续选择

- 非宗门地图中，玩家主动拆除建筑时，服务端严格要求 `building.ownerPlayerId === playerId`；非本人建造或缺少建造者归属的旧建筑都不可拆除，并返回明确的权限失败原因。
- 宗门地图中，放置/继续建造与拆除分别要求当前职位拥有宗门 `building_create` / `building_remove` 权限。拆除权限允许管理宗门领地内其他成员的建筑，但宝库库存返还、密室释放和审计链仍按原建筑 owner 执行。
- 客户端营造模式提供建造、拆除两种地图选择工具。拆除工具只负责提交建筑 ID，最终归属和资产安全仍由服务端裁定。
- 「连续选择」只保留当前客户端工具：开启后，每次建造或拆除请求提交后仍可继续点击地图；每一次操作仍使用独立请求 ID，并逐次经过服务端完整校验。

### 受保护点位禁建区

建筑会长期占地并阻挡移动，因此禁建区不止「不能压在保护点位上」，还必须让保护点位**周围一圈保持可通行**，否则玩家可以用墙把传送点、NPC、出生点围死。

| 保护点位 | 禁建范围 |
| --- | --- |
| 传送点（地图固有） | 3x3 邻域（切比雪夫距离 ≤ 1，共 9 格） |
| 同图传送着陆格（本图传送点 `targetMapId` 指回本图时的 `targetX/targetY`） | 3x3 邻域 |
| 出生点 `spawnX/spawnY` | 3x3 邻域 |
| NPC | 3x3 邻域 |
| 安全区 | 整个安全区范围（安全区自带 radius，不再外扩） |

宗门山门（带 `sectId` 的运行时传送点）只保护本格，不做邻域外扩，否则宗门无法在自家山门旁营建。

权威实现：`packages/server/src/runtime/world/building-protected-placement.helpers.ts`。阵法与宗门山门另有各自的放置校验，仍走单格重叠检查（`protected-placement.helpers.ts`），不受本节邻域规则约束。

### 启动自检与自动摧毁

服务器启动恢复建筑时对每个存量建筑执行同一套禁建区自检；违规建筑会直接从运行态和持久化快照中清理，占用的地块还原为建造前状态。

宝库和密室是需要先处理独立领域状态的特例：

- 宝库必须先把库存邮件一次性返还给建造者（owner），返还失败就不摧毁。
- 密室必须先确认独立实例无人，再原子停止实例目录并删除密室状态；释放失败就不摧毁。定义已删除且无法恢复的异常状态保留 error 日志供 GM 回读。

`hydrate` 是同步的，无法在其中 await 邮件返还，因此启动恢复分三步：

1. `instance.listPrunableVaultBuildings(state)` 同步预检出会被摧毁的宝库（只扫宝库，不为每个墙体重复跑冲突判定）；
2. `recoverVaultsBeforePlacementPrune` 逐个调 `recoverVaultItemsToOwnerMail` 返还，收集返还失败的建筑 id；
3. `hydrate(state, { keepBuildingIds })` 把失败集合作为豁免名单——这些宝库照常载入运行态并保留持久化行，等下次启动重试或 GM 处理。

返还必须早于 `saveBuildingRoomFengShuiState`：建筑行一旦删除，`owner_player_id` 就无法从建筑行回退取得，`instance_building_storage_item` 会成为活实例期间 orphan 扫描覆盖不到的孤儿。

例外：定义已删除（`unknown_def`）的宝库无法恢复运行态，即使返还失败也不能保留，只写 error 日志交由 GM 处理。

自动摧毁**不返还建材**；每个被摧毁建筑写一条 warn 审计日志（`instance` / `building` / `def` / `owner` / `reason`），豁免保留的宝库写 error 日志。

### 建筑占格恢复与历史孤儿投影

建筑位置的持久化真源是建筑锚点 `x/y/rotation` 与当前编译后的 footprint。`instance_building_cell.tile_index` 只记录当次进程内的派生索引，恢复时不得跨进程复用；启动水合会按坐标重算 cell，并把失配的建筑占格、视觉投影和持久化行修正到规范坐标。

历史版本曾复用进程内 `tileIndex`，可能在建筑记录删除后留下只有地图结构层的“幽灵门窗”。宗门地图生成器只产生地板与边界石，因此宗门中的 `door/window` 必须能对应当前有效的门窗建筑。统一兼容转换提供：

- `POST /api/gm/shortcuts/compat/orphan-sect-building-visuals/dry-run`：交叉扫描数据库与本节点权威运行态，不修改数据；
- `POST /api/gm/shortcuts/compat/orphan-sect-building-visuals/apply`：仅处理本节点持有可写 lease 的持久宗门实例，清除孤儿结构层及同格 `tile_damage`，重算房间/风水并立即分域刷盘；
- apply 后再次回读数据库和运行态；未加载、非本节点 owner、lease 不可写或两侧状态不一致的候选只计入 skipped，不直接改库。

该转换不扫描普通地图，也不清理墙、地板、家具或设施；这些类型可能来自地图模板或其他权威真源，不能用“没有建筑行”推断为孤儿。

## 建造材料 tag

建筑 `economy.cost[].itemId` 可以使用通用建材槽位：`stone`、`wood`、`cloth`、`metal`、`glass`/`transparent`。这些槽位不是具体物品 ID，而是要求玩家从背包里选择带有对应建材 tag 的材料：

| 槽位 | 需要的 tag |
|----|----|
| stone | 石材 |
| wood | 木材 |
| cloth | 布料 |
| metal | 金属 |
| glass / transparent | 透明材 |

材料配置的 `tags` 是显式集合，可以同时包含多个建材 tag。例如玻璃类材料应同时标记 `石材`、`透明材`，这样既能满足石材槽，也能满足透明材槽。服务端建造校验和客户端候选筛选都优先读取显式 tag；旧的名称、ID、`materialCategory` 推断只作为缺失 tag 时的兼容兜底。

## 宝库

宝库是家具层建筑，表现为地面交互物，不阻挡移动。建成后玩家靠近 1 格内会出现「打开宝库」上下文动作。

- 建筑配置字段：`treasureVault.capacity`，当前默认宝库容量为 80 格。
- 创建者始终拥有查看、存入、取出和修改权限的能力。
- 仅建造者可以重命名宝库；名称长度为 1 至 20 个字符。自定义名称随建筑快照持久化，并同步写入宝库库存行，供异常回收邮件使用。
- 权限分为三类：`view`（可看）、`deposit`（可存）、`withdraw`（可拿）。
- 每类权限可独立配置适用范围：所有人、队友、同门、道友、至交。
- 默认权限：所有人可看、所有人可存、仅创建者可拿。
- 存入支持按背包物品类型筛选、排序、分页多选后批量提交；服务端对同一批次统一校验，并在同一数据库事务内写入全部库位，任一条目失败则不保留本批次的部分写入。
- 库内物品列表支持按库位、品质、名称或数量切换本地显示顺序，切换时只重排当前物品节点，不改变共享库存。
- 仅建造者可以执行「一键整理」；服务端在单个数据库事务内先合并同签名堆叠，再按背包统一规则持久重排库位：品阶降序、等级降序、类型顺序、物品 ID、名称、强化等级升序。
- 宝库库存真源为 `instance_building_storage_item`，建筑本体保存权限配置和自定义名称。
- 宝库被主动拆除前，服务端必须先把库内全部物品用同一封系统邮件返还给创建者；邮件落库并删除宝库库存成功后，才允许删除建筑。
- 未完成邮件返还的宝库禁止直接删除；被攻击打至 0 耐久时也必须保留建筑和库存，避免绕过邮件返还链导致资产丢失。
- 宝库库存表必须独立保存 `owner_player_id` 与建筑名，不依赖地图建筑快照作为唯一回收索引。实例不存在、实例被标记 destroyed/stopped、临时副本被清理时，后台回收会按宝库库存表把全部库存用同一封系统邮件返还给创建者；缺少 owner 的旧异常库存不得删除，只能保留并告警。

后台实例状态清理只按 `instance_id` 稳定游标分页读取 destroyed/stopped 目录，每轮最多检查 16 个实例，并使用 20 秒软预算限制继续领取新条目。宝库孤儿回收同样按 16 组分批执行；任何库存返还阻塞都会跳过对应实例的子表清理。清理事务先取得实例域 advisory lock，再检查 17 个受管子表是否仍有状态；已经清空的历史 tombstone 直接结束，不再每 30 秒重复执行整组 DELETE。

权限裁定由服务端执行。客户端只展示权限和库存视图，并提交存取、权限修改或重命名意图。

## 密室

密室是设施层建筑，外部本体不阻挡移动。建造固定消耗 1 枚天阶异材「太虚界晶」；该材料由筑基地图的 `demon_king` Boss 以独立 `0.001` 概率掉落。建筑完工时立即按 `sourceInstanceId + buildingId` 建立唯一、持久化且常驻的独立地图实例，不依赖玩家首次交互。

### 进入、容量与空间

- 所有玩家都可以在入口 1 格内看到「开启：密室名称」，创建者额外看到「管理：密室名称」。两个交互摘要都显示设定/当前时间流速和当前人数/最大人数。
- 「开启」先打开独立使用面板。密室未开启时，任意玩家都可以选择时长并直接支付本轮全部运行成本；事务成功后整间密室进入统一开启时段，并排队让开启者进入。
- 开启期间不能重复开启、续时或提前关闭。所有玩家都可以免费进入或重新进入，只受当前容量限制，不再建立个人使用时段，也不再重复付费。
- 容量由创建者配置，最小为 1，且不得超过当前空间内部可站立格数量和系统上限 100。在线玩家和离线保留位置使用同一准入口径。
- 玩家位置继续使用通用 occupancy 权威索引，密室不另写重叠规则。
- 密室内提供「离开密室」动作，返回外部建筑位置，不依赖成对静态传送门。
- 全室开启截止时间按现实绝对时间保存，断线和重启不暂停。到期后实际倍率恢复 `1x`，密室内所有玩家自动迁回外部入口，离线位置 checkpoint 也同步修正；提前离开不退款。
- 空间档位为小型 `3×3`、中型 `5×5`、大型 `7×7`。地图无原生怪物、容器和资源点，实例禁止 PVP 和地块攻击。
- 密室内部允许使用通用建筑系统营建；内部坐标原点对应的中心出生格是唯一额外禁建点，其他格仍遵守占位、地块通行和建筑层冲突规则。
- 只有创建者可调整空间；密室已经开启、密室中有玩家，或内部存在任意建筑、掉落、妖兽等运行态对象时拒绝调整，不在线裁切或搬迁对象。内部出现第一座建筑后，空间尺寸即保持锁定，直至建筑全部拆除。

### 开启、管理与计费

「开启」面板展示密室详情、每小时运行成本、开启时长和应付总额。时长显示不可直接输入，只能通过 `÷2 / -1 / +1 / ×2` 调整，范围为 1 至 168 小时。服务端按当前 revision、倍率、容量和时长重新计算资产变更，客户端金额不作为结算依据。密室已经开启时，面板只显示统一截止时间和进入按钮，不再显示付款控件。

「管理」面板仅创建者可用，可修改名称、最大人数、整数 `1x` 至 `10x` 时间倍率和空间档位。开启期间倍率、容量和空间锁定；名称仍可修改。系统不提供燃料储备、经营收益或提前关闭入口。

- 开启者直接承担本轮全部运行成本；创建者没有免费特例。其他玩家在同一开启时段内进入不付费，灵石不会进入创建者收益。
- 密室未开启时，实际倍率固定为 `1x` 且不产生任何消耗；开启后应用管理端设定倍率，直至统一截止时间。
- `1x` 每小时运行成本为 0。`s >= 2` 时，单位置基础成本为 `50 × 2^(s - 2)` 灵石/小时，即 `2x=50`、`3x=100`、`4x=200`，直至 `10x=12800`。
- 每增加一个最大容量位置，运行成本在线性基础上增加 80%。容量系数为 `1 + 0.8 × (capacity - 1)`，不是复利。
- 小型空间成本系数为 `1`。每向外扩大一圈，空间成本在上一档基础上乘 `1.5`，因此中型为 `1.5`、大型为 `2.25`。最终每小时成本为“倍率基础成本 × 容量系数 × 空间系数”，出现非整数时向上取整为整枚灵石。
- 本轮总成本为“每小时运行成本 × 开启小时数”。开启使用 durable operation，在同一数据库事务内扣除开启者灵石、写入全室开始/截止时间、watermark、资产审计和 outbox；重复 operation ID 不会重复扣款。
- 运行成本已经在开启时一次付清，tick 热路径不访问数据库也不再次扣费。到期边界由实例调度器和集中到期队列共同收敛，不为每个密室建立常驻高频轮询。

玩法状态真源为 `instance_time_chamber_state`，保存稳定实例 ID、动态模板 ID、创建者、名称、尺寸、容量、目标倍速、全室开始/截止时间、开启者、已付总额和 revision。不存在个人租期或收益账本；实例自身的 `tick / tickSpeed / paused` 继续由通用实例 time checkpoint 持久化。

### 拆除与恢复

- 主动拆除前必须确认密室未开启且无人；随后在同一数据库事务中锁定 `instance_catalog`，活跃 lease 必须与本地运行态的 `assignedNodeId / leaseToken / ownershipEpoch` 完全一致，销毁时递增 ownership epoch 以隔离旧 writer，再删除密室状态。事务成功后才允许删除外部建筑。
- 被攻击至 0 耐久时不能绕过异步释放链，建筑会保留 1 点耐久等待正常拆除。
- 启动禁建区自检会预检将被摧毁的密室，并调用同一释放入口；释放失败的可恢复建筑加入豁免集合，避免产生孤儿实例。
- 启动先加载密室状态并注册动态模板，再恢复实例目录与 checkpoint；建筑恢复完成后先迁出已经到期的密室玩家，再重新应用实际倍率和实例 deadline，最后才开放 tick。
- 动态密室模板不参与普通地图的公共/真实默认线引导；实例目录类型取自运行时 `meta.kind`。恢复期会补建所有已完成入口缺失的常驻密室，并在 lease 尚未就绪时用集中重试队列收敛孤儿状态清理。
- GM 世界管理把密室实例挂在入口地图实例下显示。销毁入口建筑会先释放密室；从 GM 销毁有效密室实例时会级联销毁入口建筑，历史误生成的 `public:/real:time-chamber-template:*` 伪实例可独立清理。

## 蒲团

蒲团是设施层建筑，表现为地面交互物，不阻挡移动。建成后站在蒲团上的玩家获得 `craftEffectStats.transmission.speedRate +1.0`，即传法标准属性中的速度 +100%。传法结算会同时读取学习者和传授者脚下设施贡献的传法速度，并把双方速度合计应用到每息领悟进度公式。

## 房间检测

源文件: `packages/server/src/runtime/building/room-detection.service.ts`

- 算法: BFS 洪水填充
- 起点: 从 door/window 开口相邻的可行走格子开始
- 边界判定: wall/door/window/house_eave/house_corner/screen_wall + 拓扑 roomBoundary
- 接受条件: `!touchesOpenEdge && (doorCount + windowCount > 0)`
- 大型半户外过滤: `area > 256 && roofCoverage < 60%` → 不计入
- maxCellsPerRoom 默认 4096
