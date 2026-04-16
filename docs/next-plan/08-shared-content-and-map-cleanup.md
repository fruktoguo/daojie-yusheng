# 08 shared 与内容地图收口

目标：把 shared、内容、地图的真源和一致性都压稳。

## 当前基线

shared 当前核心文件体积：

- `packages/shared/src/protocol.ts`
  - `2638` 行
- `packages/shared/src/types.ts`
  - `1481` 行
- `packages/shared/src/network-protobuf.ts`
  - `1072` 行

shared 当前已有护栏：

- `check-network-protobuf-contract.cjs`
- `check-numeric-stats.cjs`
- `check-protocol-event-maps.cjs`
- `check-protocol-payload-shapes.cjs`

内容与地图当前真源目录：

- 内容
  - `/packages/server/data/content/alchemy/recipes.json`
  - `/packages/server/data/content/items/*`
  - `/packages/server/data/content/monsters/*`
  - `/packages/server/data/content/quests/*`
  - `/packages/server/data/content/techniques/*`
  - `/packages/server/data/content/technique-buffs/*`
  - `/packages/server/data/content/enhancements/*`
  - `breakthroughs.json`
  - `realm-levels.json`
  - `resource-nodes.json`
  - `starter-inventory.json`
- 地图
  - `/packages/server/data/maps/*.json`
  - `/packages/server/data/maps/compose/*`

客户端当前可见的 generated / editor 辅助数据：

- `packages/client/src/content/editor-catalog.ts`
- `packages/client/dist/assets/world-editor-catalog-*.js`

## 任务

- [ ] 继续整理 `packages/shared/src/protocol.ts`
- [ ] 继续整理 `packages/shared/src/types.ts`
- [ ] 继续整理 `packages/shared/src/network-protobuf.ts`
- [ ] 给新增协议字段补一致性检查
- [ ] 给新增数值字段补完整性检查
- [ ] 确保 shared 变更默认受 audit / check 保护
- [ ] 重新标注哪些 `packages/server/data/content/*` 是玩法真源
- [ ] 重新标注哪些数据是编辑器辅助产物
- [ ] 检查地图文档、怪物包、任务、物品、功法之间的引用一致性
- [ ] 检查 compose 地图结构规范
- [ ] 检查室内地图规范
- [ ] 检查传送点规范
- [ ] 检查 NPC 锚点规范
- [ ] 决定哪些客户端 generated 数据继续保留
- [ ] 决定哪些客户端 generated 数据可以删掉或重做

## 执行顺序

### 第 1 批：先把 shared 分层固定

- [ ] `protocol.ts`
  - 只负责事件、payload、合同层
- [ ] `types.ts`
  - 只负责通用共享结构，不继续变成第二份协议文件
- [ ] `network-protobuf.ts`
  - 只负责 wire event / protobuf 映射

禁止继续发生的事：

- 在客户端或服务端本地重复复制 shared 结构
- 用本地 alias 反向定义 shared 协议
- 把运行时派生字段偷偷塞回共享合同

最小验证：

- `pnpm --filter @mud/server-next audit:next-protocol`
- `pnpm build`

### 第 2 批：把 shared 守卫补成默认门禁

- [ ] 新增协议字段时必须同时过：
  - `check-protocol-event-maps`
  - `check-protocol-payload-shapes`
  - `check-network-protobuf-contract`
- [ ] 新增数值字段时必须同时过：
  - `check-numeric-stats`
- [ ] 明确哪些 shared 变更需要额外补 protocol audit

最小验证：

- `pnpm --filter @mud/server-next audit:next-protocol`
- `pnpm verify:replace-ready`

### 第 3 批：把内容真源分类写死

- [ ] 标出玩法真源：
  - items
  - monsters
  - quests
  - techniques
  - technique-buffs
  - alchemy
  - enhancements
  - breakthroughs
  - realm-levels
  - resource-nodes
  - starter-inventory
- [ ] 标出编辑器辅助产物：
  - editor catalog
  - 客户端 generated 缓存
- [ ] 不允许客户端 generated 数据反向成为服务端真源

### 第 4 批：跑内容引用一致性清单

- [ ] 任务 -> NPC / 地图 / 怪物 / 物品 / 功法引用
- [ ] 怪物包 -> 地图 / 掉落 / 物品引用
- [ ] 功法 -> skill / buff / 数值模板引用
- [ ] 物品 -> 技能 / buff / 消耗效果 / 地图解锁引用
- [ ] 炼丹 / 强化 -> 配方 / 材料 / 结果物品引用

这一步不要求顺手改内容平衡，只要求把引用闭环压稳。

### 第 5 批：跑地图结构清单

- [ ] compose 地图规范
- [ ] 室内地图规范
- [ ] 传送点规范
- [ ] NPC 锚点规范
- [ ] 室内/洞窟/副图与主图连通关系

至少要明确：

- 地图 id 命名
- portal 指向是否合法
- 室内图是否有明确回到主图路径
- NPC 是否落在合法地图与坐标

### 第 6 批：决定 generated 数据的去留

- [ ] 继续保留的 generated 数据
  - 明确生成来源、更新命令、消费方
- [ ] 可以删掉或重做的 generated 数据
  - 明确为什么不再需要
- [ ] 重点确认：
  - `packages/client/src/content/editor-catalog.ts`
  - 其它客户端构建产物中的 world/editor catalog

## 文件级检查表

### shared

- [ ] `protocol.ts` 不再承载隐式运行时逻辑
- [ ] `types.ts` 不再成为第二份事件合同
- [ ] `network-protobuf.ts` 与 `protocol.ts` 没有漂移

### content

- [ ] 每个内容目录都能回答“它是不是玩法真源”
- [ ] 没有客户端 generated 副本反向定义服务端内容

### maps

- [ ] 每张地图都能回答 portal / npc / 室内层级是否合法
- [ ] compose 规则不再靠隐式约定

## 本阶段不做的事

- 不在这里顺手重构客户端面板状态流，那是 `07`。
- 不在这里顺手重构服务端 runtime 架构，那是 `06`。
- 不在这里顺手新增内容或改数值平衡。

## 完成定义

- [ ] shared 不再成为隐形不稳定源
- [ ] 内容、地图、引用关系完成一次系统性清理
