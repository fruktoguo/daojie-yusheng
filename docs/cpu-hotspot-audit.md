# CPU 热点审计

更新时间：2026-03-27（已跟进三轮动作链优化）

## 结论

当前 CPU 主要不是耗在寻路，而是耗在高频热路径上的“重复构建、重复比较、重复序列化”：

1. 动作系统每 tick 对玩家做全量动作重建。
2. 动作重建链路里混入了场景文案拼接、功法元数据同步、属性重算。
3. 状态同步大量依赖递归深比较和深拷贝。
4. 网络统计和 protobuf 编解码中仍有较多 JSON 字符串中转。
5. 落盘热点里混有不少 I/O 前的快照构建、排序、复制。

## 当前实施进度

- 已完成：P0 第一阶段。`TickService` 已移除地图主循环里对真人玩家的两处无条件 `syncActions()`，动作列表改为“仅在 `actions` 已标脏时，且真正需要下发/执行前才重建”。
- 已完成：P0 第二阶段。纯冷却推进不再触发动作整表重建，当前仅保留动作面板差量更新。
- 已完成：P1 第一阶段。纯冷却推进的动作同步已拆到专用快路，冷却 tick 不再扫描/比较动作静态字段。
- 已完成：P1 第二阶段。`cultivation:toggle` 已改为显式状态字段驱动，动作面板不再依赖动态文案推断开关状态。
- 部分完成：动作重建仍然会在非冷却类 `actions` 脏更新时走整表重建，`getContextActions()` / `rebuildActions()` / `getSkillActions()` 的大头成本还在。
- 已完成：P2 第一阶段。`TechniqueService` 的只读入口 `getSkillActions()`、`getBreakthroughAction()` 已改成“仅在未初始化时补一次初始化”，不再每次读取都强制触发完整进度重算。
- 待处理：动作静态定义拆分、`TechniqueService` 进一步去模板字段常驻、protobuf 去 `xxxJson`、网络估包长降频、地块客户端视图延迟转换。

## 1. 动作重建是当前最大 CPU 黑洞

### 1.1 每 tick 对真人玩家常态全量重建

状态：已进一步解决

- 入口：[packages/server/src/game/tick.service.ts:891](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L891)
- 怪物影响后二次重建：[packages/server/src/game/tick.service.ts:919](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L919)
- 核心链路：[packages/server/src/game/tick.service.ts:1508](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1508)

`syncActions()` 当前流程：

1. 重建前快照：[packages/server/src/game/tick.service.ts:1509](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1509)
2. 场景动作收集：[packages/server/src/game/tick.service.ts:1512](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1512)
3. 核心动作重建：[packages/server/src/game/tick.service.ts:1515](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1515)
4. 重建后快照：[packages/server/src/game/tick.service.ts:1518](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1518)
5. 递归比较：[packages/server/src/game/tick.service.ts:1521](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1521)

这解释了为什么 `动作重建: 核心构建 / 场景动作收集 / 前后快照` 会同时进前列。

已落地变更：

- 地图主循环里这两处无条件 `syncActions()` 已移除。
- 当前改为在“动作面板即将下发”或“玩家即将执行依赖 `player.actions` 的动作”前，按需重建。
- 纯冷却推进已单独走 `actions` 差量更新，不再因为冷却变化触发整表动作重建。

### 1.2 场景动作收集在做大量 UI/文案层构建

状态：已部分解决

- 位置：[packages/server/src/game/world.service.ts:468](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L468)

热点特征：

- 默认先跑任务同步：[packages/server/src/game/world.service.ts:469](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L469)
- 每次新建整批 `ActionDef`：[packages/server/src/game/world.service.ts:474](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L474)
- 反复拼 toggle、修炼、感气、传送、NPC、任务的 `name/desc`
- 邻接 NPC 时逐个构建交互动作：[packages/server/src/game/world.service.ts:566](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L566)

这里不是算法复杂，而是把本应低频变化的动作定义和文案，放进了高频 tick 热路径。

已落地变更：

- `auto_battle / auto_retaliate / auto_battle_stationary / allow_aoe_player_hit / auto_idle_cultivation / auto_switch_cultivation / sense_qi` 这组开关类动作，已从服务端动态文案改成静态文案。
- 客户端对应状态已直接依赖 `ActionsUpdate` 面板状态字段，不再回退到解析动作 `name/desc` 猜状态。
- `cultivation:toggle` 现已补入显式 `cultivationActive` 状态字段，服务端动作定义与客户端开关卡片都不再依赖动态 `name/desc`。
- NPC、传送、任务相关动作仍保留动态文案，因此 `getContextActions()` 还不是纯静态骨架。

### 1.3 核心动作重建本身也在反复重建 Map、数组和排序

状态：已部分解决

- 位置：[packages/server/src/game/action.service.ts:17](/home/yuohira/mud-mmo/packages/server/src/game/action.service.ts#L17)

每次都会做：

- 从旧动作列表构建 `cooldowns` Map：[packages/server/src/game/action.service.ts:18](/home/yuohira/mud-mmo/packages/server/src/game/action.service.ts#L18)
- 重新取技能动作：[packages/server/src/game/action.service.ts:19](/home/yuohira/mud-mmo/packages/server/src/game/action.service.ts#L19)
- 基于自动战斗配置再建 3 个 Map：[packages/server/src/game/action.service.ts:21](/home/yuohira/mud-mmo/packages/server/src/game/action.service.ts#L21)
- 复制技能数组再排序：[packages/server/src/game/action.service.ts:24](/home/yuohira/mud-mmo/packages/server/src/game/action.service.ts#L24)
- 最后把上下文动作和技能动作再 `map` 成一份全新数组：[packages/server/src/game/action.service.ts:26](/home/yuohira/mud-mmo/packages/server/src/game/action.service.ts#L26)

已落地变更：

- 冷却推进已从完整动作 diff 中拆出，纯冷却 tick 现在仅发送 `cooldownLeft` patch。
- 这条快路不再扫描 `name/desc/range/requiresTarget/targetMode` 等静态字段，也不再比较动作顺序。
- 服务端动作同步缓存已从完整 `ActionDef` 收缩为仅参与 diff 的轻量同步态，减少了常规动作同步里的对象复制。
- 但非冷却类 `actions` 脏更新仍会走完整动作重建和完整 diff。

### 1.4 读取技能动作时夹带功法元数据同步和属性重算

状态：已部分解决

- 技能动作入口：[packages/server/src/game/technique.service.ts:659](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L659)
- 初始化实现：[packages/server/src/game/technique.service.ts:192](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L192)
- 元数据同步：[packages/server/src/game/technique.service.ts:1822](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L1822)

`getSkillActions()` 先调用 `initializePlayerProgression()`，而这个函数当前每次都会执行：

- `syncTechniqueMetadata`
- `applyRealmBonus`
- `applyTechniqueBonuses`
- `attrService.recalcPlayer`

对应位置：

- [packages/server/src/game/technique.service.ts:198](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L198)
- [packages/server/src/game/technique.service.ts:199](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L199)
- [packages/server/src/game/technique.service.ts:200](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L200)
- [packages/server/src/game/technique.service.ts:201](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts#L201)

这意味着“动作重建”热点里，实际上还夹带了功法和属性体系的维护成本。

已落地变更：

- `getSkillActions()` 与 `getBreakthroughAction()` 已改成只在玩家尚未完成初始化时才补一次初始化。
- 对已初始化玩家的高频动作读取，已不再反复触发 `syncTechniqueMetadata / applyRealmBonus / applyTechniqueBonuses / recalcPlayer`。
- 但模板字段仍常驻在 `player.techniques` 上，动作静态定义也还没拆包，所以这里只是第一阶段优化。

### 1.5 前后快照和递归比较本身就是额外整表扫描

- 快照构建：[packages/server/src/game/tick.service.ts:2131](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2131)
- 深比较实现：[packages/shared/src/structured.ts:31](/home/yuohira/mud-mmo/packages/shared/src/structured.ts#L31)

`captureActionSyncState()` 每次都会复制动作字段，包含 `name/desc` 这类字符串；随后再用 `isPlainEqual()` 递归扫描整个数组。

这不是 `JSON.stringify`，但本质上仍是高频整表对象扫描。

## 2. 同步链路有大量深比较与深拷贝

### 2.1 属性、功法、动作都依赖结构级 diff

- 属性 diff：[packages/server/src/game/tick.service.ts:2284](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2284)
- 功法 diff：[packages/server/src/game/tick.service.ts:2376](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2376)
- 动作 diff：[packages/server/src/game/tick.service.ts:2428](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2428)
- 深比较包装：[packages/server/src/game/tick.service.ts:2837](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2837)
- 深拷贝包装：[packages/server/src/game/tick.service.ts:2841](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2841)

典型问题：

- 高频 `cloneStructured(nextState)` / `cloneStructured(action)` / `cloneStructured(technique)`
- 高频 `isStructuredEqual(previous, next)`
- 静态字段和动态字段仍混在同一个 diff 单元里

对 CPU 来说，这类“为了发增量而先做大量结构扫描”的开销已经不小。

### 2.2 地块 Patch 先整片转换，再做 patch

- 客户端视图转换入口：[packages/server/src/game/tick.service.ts:1848](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L1848)
- 转换实现：[packages/server/src/game/tick.service.ts:2115](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2115)
- Patch 构建：[packages/server/src/game/tick.service.ts:2667](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2667)

当前流程是：

1. 先把整片视野 `VisibleTile[][]` 转成客户端视图
2. 每格再做 `cloneStructured`
3. 然后才比较哪些格子真的要发 patch

即使最终只发几个脏格，前面也已经先把整片可见区域做了一轮转换。

### 2.3 地块 key 仍有较多字符串拼接和 split/parse

- 脏格扫描：[packages/server/src/game/tick.service.ts:2636](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2636)
- 可见格 key 构建：[packages/server/src/game/tick.service.ts:2693](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2693)
- 删除 patch 反解 key：[packages/server/src/game/tick.service.ts:2718](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts#L2718)
- 地图运行时持久化排序：[packages/server/src/game/map.service.ts:1753](/home/yuohira/mud-mmo/packages/server/src/game/map.service.ts#L1753)
- 资源状态同步：[packages/server/src/game/map.service.ts:1902](/home/yuohira/mud-mmo/packages/server/src/game/map.service.ts#L1902)

这部分单次不重，但次数高，属于稳定型字符串开销。

## 3. 网络编解码里确实还有字符串处理浪费

### 3.1 流量统计在热路径里做估包长

- 位置：[packages/server/src/game/game.gateway.ts:923](/home/yuohira/mud-mmo/packages/server/src/game/game.gateway.ts#L923)
- 出站编码：[packages/server/src/game/game.gateway.ts:932](/home/yuohira/mud-mmo/packages/server/src/game/game.gateway.ts#L932)
- 估包长：[packages/server/src/game/game.gateway.ts:955](/home/yuohira/mud-mmo/packages/server/src/game/game.gateway.ts#L955)
- JSON 兜底：[packages/server/src/game/game.gateway.ts:979](/home/yuohira/mud-mmo/packages/server/src/game/game.gateway.ts#L979)

当前 `client.emit` 被劫持后，每次发送都要：

1. `encodeServerEventPayload`
2. `estimateSocketPacketBytes`
3. 对普通对象可能执行 `JSON.stringify(value)` 估算字节数

这意味着性能统计本身就在制造额外 CPU。

### 3.2 protobuf 层仍有大量 JSON 字符串中转

代表位置：

- 观察信息：[packages/shared/src/network-protobuf.ts:485](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L485)
- Buff 列表：[packages/shared/src/network-protobuf.ts:490](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L490)
- 功法技能：[packages/shared/src/network-protobuf.ts:621](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L621)
- 功法层级：[packages/shared/src/network-protobuf.ts:626](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L626)
- 功法属性曲线：[packages/shared/src/network-protobuf.ts:631](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L631)
- 小地图：[packages/shared/src/network-protobuf.ts:789](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L789)
- 小地图库：[packages/shared/src/network-protobuf.ts:790](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L790)
- 可见标记：[packages/shared/src/network-protobuf.ts:791](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L791)
- 属性 bonus：[packages/shared/src/network-protobuf.ts:984](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L984)
- 境界：[packages/shared/src/network-protobuf.ts:1004](/home/yuohira/mud-mmo/packages/shared/src/network-protobuf.ts#L1004)

这些字段虽然走的是 protobuf 通道，但内部仍然把复杂结构先 `JSON.stringify` 成字符串，再在接收侧 `JSON.parse`。

这和“是不是内部有什么字符串处理和浪费”的怀疑是吻合的。

## 4. 落盘热点不只是 I/O，前处理也很重

### 4.1 玩家批量落盘仍是串行

- 位置：[packages/server/src/game/player.service.ts:354](/home/yuohira/mud-mmo/packages/server/src/game/player.service.ts#L354)

`persistAll()` 仍然逐玩家 `await persistPlayerState()`，所以“落盘与外部 I/O”里会包含明显等待时间。

### 4.2 地图运行时落盘会重建缓存快照

- 位置：[packages/server/src/game/map.service.ts:1102](/home/yuohira/mud-mmo/packages/server/src/game/map.service.ts#L1102)

每轮会为 dirty map 重建持久化记录，再统一保存整份 `runtimeSnapshotCache`。

### 4.3 掉落运行时落盘包含多轮 filter/sort/map

- 位置：[packages/server/src/game/loot.service.ts:914](/home/yuohira/mud-mmo/packages/server/src/game/loot.service.ts#L914)

每个 map 都会做：

- `filter`
- `sort`
- `map`
- 每堆掉落再转换 `entries`

这部分是“序列化前加工成本”，不只是外部 I/O。

### 4.4 怪物运行时落盘还在做 JSON 深拷贝

- 入口：[packages/server/src/game/world.service.ts:4857](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L4857)
- 旧记录拷贝：[packages/server/src/game/world.service.ts:4886](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L4886)
- Buff 拷贝：[packages/server/src/game/world.service.ts:5009](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts#L5009)

这里既有排序，也有 `JSON.parse(JSON.stringify(...))`，说明落盘热点里确实掺了字符串序列化成本。

## 5. 优化优先级

### P0

把动作系统改成真正的脏标驱动，不再每 tick 无条件 `syncActions()`。

### P1

把动作静态定义和动态状态拆开：

- 静态：`id`、`type`、`requiresTarget`、`targetMode`
- 低频：`name`、`desc`、`range`
- 高频：`cooldownLeft`、`autoBattleEnabled`、`skillEnabled`

当前进度：已完成第三阶段，纯冷却推进已单独走快路，通用开关类动作与 `cultivation:toggle` 都已从动态文案状态机中剥离；尚未把动作静态定义从常规 `actions` 更新里完全拆出。

### P2

把 `getSkillActions()` 变成纯读函数，禁止里面再触发功法元数据同步和属性重算。

当前进度：已完成第一阶段，已从“每次读取强制重算”收敛为“仅未初始化时补一次”；尚未完全拆成纯模板读取。

### P3

减少热路径里的结构比较和深拷贝，优先改成 revision、signature 或显式 dirty flag。

### P4

降低网络统计和 protobuf 中的字符串中转：

- 估包长不要对普通对象走 `JSON.stringify`
- protobuf 不再把复杂结构塞成 JSON string 字段

### P5

把地块 patch、运行时落盘里的 key 字符串处理与快照构建进一步瘦身。

## 6. 本次审计范围

本次为静态代码审计，未修改业务逻辑，未做性能复测。
