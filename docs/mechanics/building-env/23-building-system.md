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

- 玩家主动拆除建筑时，服务端严格要求 `building.ownerPlayerId === playerId`；非本人建造或缺少建造者归属的旧建筑都不可拆除，并返回明确的权限失败原因。
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

权限裁定由服务端执行。客户端只展示权限和库存视图，并提交存取、权限修改或重命名意图。

## 密室

密室是设施层建筑，外部本体不阻挡移动。建成后，每个外部建筑按 `sourceInstanceId + buildingId` 稳定映射到一个唯一、持久化的独立地图实例。

### 进入、容量与空间

- 所有玩家都可以在入口 1 格内看到并使用「进入密室」，不要求创建者、道友、队伍或宗门关系。
- 首版准入容量为 1 人。容量判断由 `TimeChamberAdmissionPolicy` 独立承担；传送、协议、实例和控制台链路均按可变容量设计，后续开放多人不需要重写主链。
- 玩家位置继续使用通用 occupancy 权威索引，密室不另写重叠规则。
- 密室内提供「离开密室」动作，返回外部建筑位置，不依赖成对静态传送门。
- 空间档位为小型 `9×9`、中型 `15×15`、大型 `21×21`。地图无怪物、容器和资源点，内部为封闭全域安全区。
- 只有创建者可调整空间；密室中有玩家，或内部存在建筑、掉落、妖兽等运行态对象时拒绝调整，不在线裁切或搬迁对象。

### 控制台与燃料

只有创建者会在外部入口旁看到「管理密室」。控制台可改名、投入灵石、调整空间和设置整数 `1x` 至 `10x` 时间流速。

- `1x` 是安全基准速度，不消耗燃料。
- 每枚灵石转换为 `36000` 个燃料单位（内容配置 `timeChamber.fuelUnitsPerSpiritStone` 可调整）。
- 速度 `s > 1` 每执行一个逻辑息消耗 `s - 1` 单位；现实每秒约执行 `s` 息，因此持续消耗率为 `s × (s - 1)` 单位/秒。
- 只对调度器实际获准并执行的逻辑息扣费；被补帧上限裁掉或尚未执行的息不收费。
- tick 热路径只读数据库已原子预留到内存的 60 秒短缓冲，不做数据库 IO；批次规划不预扣，实例核心逻辑息成功后才逐息扣费，低于 20 秒水位时异步补充。
- 进程崩溃或实例切换节点时，尚未使用的短缓冲可能被有界销毁；这是防止跨节点重复生成燃料的安全取舍，最大损失受 60 秒预留上限约束。
- 燃料耗尽或缓冲补充失败时，实例立即回落 `1x` 并向内部玩家发送结构化通知，不会暂停到无法离开。
- 灵石投入使用 durable operation，在同一数据库事务内替换玩家背包快照并增加密室燃料；重复 operation ID 不会重复写入资产。

玩法状态真源为 `instance_time_chamber_state`，保存稳定实例 ID、动态模板 ID、创建者、名称、尺寸、容量、目标倍速、数据库燃料和 revision。实例自身的 `tick / tickSpeed / paused` 继续由通用实例 time checkpoint 持久化。

### 拆除与恢复

- 主动拆除前必须确认密室无人；随后先把独立实例目录标记为 destroyed/stopped 并删除密室状态，成功后才允许删除外部建筑。
- 被攻击至 0 耐久时不能绕过异步释放链，建筑会保留 1 点耐久等待正常拆除。
- 启动禁建区自检会预检将被摧毁的密室，并调用同一释放入口；释放失败的可恢复建筑加入豁免集合，避免产生孤儿实例。
- 启动先加载密室状态并注册动态模板，再恢复实例目录与 checkpoint；建筑恢复完成后重新应用配置、燃料和实例 deadline，最后才开放 tick。

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
