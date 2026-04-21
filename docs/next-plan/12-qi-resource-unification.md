# 12 气机资源统一化规划

目标：把无属性灵气、五行灵气、煞气、魔气等地块资源收成一套共享模型，只保留配置差异，不再各写一套 runtime。

说明：

- 这份文档是 next 主线后续专项规划，不作为当前 `replace-ready` 的立即阻塞项。
- 当前阶段仍以 `packages/*` 为唯一主线，`legacy/*` 不参与新设计。

## 当前基线

- `packages/shared/src/constants/gameplay/qi.ts`
  - 已定义 `family / form / element` 这套通用气机常量。
- `packages/client/src/gm-map-editor-helpers.ts`
  - 已能按 `resourceKey` 解析和显示不同气机种类。
- `packages/server/src/runtime/instance/map-instance.runtime.ts`
  - 仍只维护单一 `auraByTile`，属于“灵气专用 runtime”。
- `packages/server/src/runtime/world/world-runtime-use-item.service.ts`
  - 仍只支持 `tileAuraGainAmount` 这种“无属性灵气专用”写入口。
- `packages/server/src/runtime/world/world-runtime-detail-query.service.ts`
  - 地块详情目前只读单值 `aura`，不是通用资源集合。

结论：

- shared 常量层已经往统一模型走了一半。
- server instance / world read model / item use 仍然是“单资源特判”。

## 目标模型

统一的资源键：

```ts
type QiFamilyKey = 'aura' | 'sha' | 'demonic';
type QiFormKey = 'refined' | 'dispersed';
type QiElementKey = 'neutral' | 'metal' | 'wood' | 'water' | 'fire' | 'earth';
type QiResourceKey = `${QiFamilyKey}.${QiFormKey}.${QiElementKey}`;
```

统一的运行态单元：

```ts
interface TileQiResourceState {
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}
```

统一的差异入口：

- `flowConfig`
  - 半衰期
  - 最低每 tick 衰减
  - 是否允许自然回源
- `projectionConfig`
  - 是否可见
  - 是否可吸收
  - 对感气视角如何投影
- `persistenceConfig`
  - 是否持久化
  - 是否只保存偏离模板基线的差量

统一后应满足：

- 无属性灵气、五行灵气、煞气、魔气都进同一套 tile resource runtime。
- “差异”只在资源键和配置，不在 owner service 分叉。
- 资源的写入、衰减、读取、感知、持久化都走同一条主链。

## 非目标

- 不把玩家体内真气、血量、Buff 层投影也塞进地块资源模型。
- 不把安全区、传送点、容器混进气机资源本体。
- 不在这一轮顺手扩写“吸收气机修炼”完整玩法。

## 任务

- [ ] 在 `packages/shared/src/qi.ts` 补齐资源键、解析、投影、衰减配置工具层
- [ ] 保留对当前单值 `aura` 的兼容读取，但新增通用 `tileResources` 结构
- [ ] 把 `map-instance.runtime.ts` 的 `auraByTile` 升级为按 `resourceKey` 分桶的资源存储
- [ ] 把地块详情、实例查询、同步快照从单值 `aura` 升级为可裁剪的资源视图
- [ ] 把 `tileAuraGainAmount` 升级为通用的 tile resource gain item/effect 入口
- [ ] 给不同 `resourceKey` 配置独立 flow config，而不是新增 service 分支
- [ ] 明确哪些资源会持久化，哪些只做短时 runtime 态
- [ ] 给感气视角定义统一的资源投影规则
- [ ] 给 GM 地图编辑器统一资源画笔和资源详情口径
- [ ] 补 smoke / audit，防止资源键和 flow config 漏配

## 执行顺序

### 第 1 批：先把 shared 工具层补全

- [ ] 把 `resourceKey`、descriptor、selector、projection profile 固定到 `packages/shared`
- [ ] 把资源显示标签、排序、颜色这些纯函数从 client helper 中回收到 shared
- [ ] 先不改 server runtime，只先把共享合同定死

### 第 2 批：把 server instance 改成多资源桶

- [ ] 把实例内单一 `auraByTile` 改成按 `resourceKey` 存储
- [ ] 保留 `getTileAura()` 兼容层，但底层改为从默认 `aura.refined.neutral` 读取
- [ ] 增加通用 `getTileResource()` / `addTileResource()` / `tickTileResource()` owner

### 第 3 批：把读模型和同步口径改通用

- [ ] `world-runtime-detail-query.service.ts` 输出地块资源集合或裁剪后的主资源视图
- [ ] `world-sync-*` 统一从通用 tile resource owner 取数据
- [ ] 感气视角不再写死只看 `aura`

### 第 4 批：把玩法入口接上

- [ ] 道具、技能、地块回源、地图配置都统一改为写 `resourceKey`
- [ ] 再决定是否开放玩家对更多资源家族的可见/吸收能力

## 验证

最小验证：

- `pnpm --filter @mud/shared-next build`
- `pnpm --filter @mud/server-next compile`
- 地块详情能同时看到多类资源
- 感气视角在开启后不会因新增资源键崩掉
- 持久化快照只保存偏离模板的资源条目

需要单独说明的风险：

- 若直接把同步改成“全资源全量下发”，高频包体会膨胀。
- 若不先定 shared 合同就改 runtime，后面 client/GM/editor 会再次分叉。
