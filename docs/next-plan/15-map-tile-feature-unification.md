# 15 地图地块特征统一化规划

目标：把地图上的附加状态按统一分层模型收口，明确哪些属于地形本体、哪些属于地块资源、哪些属于区域规则、哪些属于挂点对象，避免地图相关能力继续横向散开。

说明：

- 这份文档是 next 主线后续专项规划，不作为当前 `replace-ready` 的立即阻塞项。
- 这里追求的是“统一分层”，不是把所有地块相关数据塞成一个大对象。

## 当前基线

- `packages/server/src/runtime/instance/map-instance.runtime.ts`
  - 当前同时持有：
  - `occupancy`
  - `auraByTile`
  - `tileDamageByTile`
  - NPC / landmark / container / monster / portal / safe zone 等实例态。
- `packages/shared/src/map-document.ts`
  - 当前地图真源里同时有：
  - `auras`
  - `resources`
  - `safeZones`
  - `landmarks`
  - `resourceNodeGroups`
- `packages/server/src/runtime/world/world-runtime-detail-query.service.ts`
  - 地块详情是临时把 portal / safe zone / ground / players / monsters / npc / aura 组装到一个视图里。
- `packages/client/src/gm-map-editor.ts`
  - 编辑器已经把 `aura / resource / safeZone / landmark / container / portal / npc / monster` 视为不同图层和对象页签。

结论：

- 运行时和地图文档都已经隐含了“多层地块特征”。
- 但当前 owner 边界还不够明确，很多能力是“能跑”，不是“结构已经定型”。

## 目标分层

建议把地块相关能力固定成以下几层：

### 1. terrain

地形本体，只回答：

- 这格是什么 tile type
- 是否可走
- 是否挡视线
- 基础显示是什么

### 2. tileResources

地块资源层，只回答：

- 灵气 / 煞气 / 魔气等资源
- 当前值
- 基线值
- 衰减和持久化

### 3. zones

区域规则层，只回答：

- 安全区
- 禁战区
- 领域区
- 其他按范围生效的世界规则

### 4. anchors

挂点对象层，只回答：

- 传送点
- 资源节点
- 地标
- 容器挂点

### 5. tileCombatState

可破坏地块状态层，只回答：

- HP / maxHp
- destroyed
- modifiedAt

### 6. occupancy

运行时占位层，只回答：

- 玩家
- 怪物
- NPC
- 其他阻挡实体

## 非目标

- 不把安全区、传送点、容器、资源点都混成“统一 feature blob”。
- 不在这一轮顺手改地图美术、compose 拼图方式或小地图表现。
- 不把玩家详情、怪物详情这类实体观察逻辑下沉进地图真源层。

## 任务

- [ ] 在文档和代码层明确 terrain / resources / zones / anchors / combatState / occupancy 六层边界
- [ ] 给地图文档补清晰的字段归属口径，避免继续横向扩字段
- [ ] 保留对 `auras / resources / safeZones / resourceNodeGroups` 的兼容读取，但收敛长期真源结构
- [ ] 给 tile detail / visible tile / GM map editor 统一同一套分层读法
- [ ] 给实例持久化分别定义 resource / container / tile combat 的差量快照口径
- [ ] 给资源点和地标、容器的关系定清楚，不再多头表达
- [ ] 给安全区等 zone 统一规则层，不再散在多个 service 特判
- [ ] 给可破坏地块和普通地形分清 owner，不再把地形和受损状态揉在一起

## 执行顺序

### 第 1 批：先定文档口径

- [ ] 先把地图字段归类到六层
- [ ] 先明确哪些是模板真源，哪些是实例 runtime，哪些是持久化差量

### 第 2 批：收口 map-document 和 instance runtime

- [ ] `map-document.ts` 明确字段归属和兼容读取策略
- [ ] `map-instance.runtime.ts` 明确每层 owner，不再继续随手往主类加横向状态

### 第 3 批：统一读模型

- [ ] tile detail
- [ ] instance tile state
- [ ] visible tile
- [ ] GM editor

都从同一套分层数据读取，而不是每处自己拼一遍。

## 验证

最小验证：

- 同一格地块在 runtime detail、GM editor、同步视图里的分层语义一致
- zone 变化不会误伤 resource 或 anchor 读写
- 新增一种 tile resource 或一种 zone 时，不需要改动整张地图对象结构
- `map-instance.runtime.ts` 后续新增地图能力时能按层落点，而不是继续卷回主类

需要单独说明的风险：

- 如果只做字段改名，不做 owner 分层，地图系统仍会继续膨胀。
- 如果为了“完全统一”把所有层硬塞成一个数组，热路径、同步裁剪和编辑器体验都会变差。
