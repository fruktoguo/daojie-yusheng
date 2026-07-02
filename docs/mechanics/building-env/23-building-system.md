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
检查顺序:
1. occupancy[cellIndex] !== 0 → 'occupied'
2. structure 层已有建筑 → 'structure_overlap'
3. 同层已有建筑 → 'building_layer_overlap'
4. 地块不可行走 → 'tile_not_clear'
```

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
- 权限分为三类：`view`（可看）、`deposit`（可存）、`withdraw`（可拿）。
- 每类权限可独立配置适用范围：所有人、队友、同门、道友、至交。
- 默认权限：所有人可看、所有人可存、仅创建者可拿。
- 宝库库存真源为 `instance_building_storage_item`，建筑本体只保存权限配置。
- 宝库被主动拆除前，服务端必须先把库内全部物品用同一封系统邮件返还给创建者；邮件落库并删除宝库库存成功后，才允许删除建筑。
- 未完成邮件返还的宝库禁止直接删除；被攻击打至 0 耐久时也必须保留建筑和库存，避免绕过邮件返还链导致资产丢失。
- 宝库库存表必须独立保存 `owner_player_id` 与建筑名，不依赖地图建筑快照作为唯一回收索引。实例不存在、实例被标记 destroyed/stopped、临时副本被清理时，后台回收会按宝库库存表把全部库存用同一封系统邮件返还给创建者；缺少 owner 的旧异常库存不得删除，只能保留并告警。

权限裁定由服务端执行。客户端只展示权限和库存视图，并提交存取或权限修改意图。

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
