# next 客户端运行时同步问题总结

补充说明：

- 这份文档保留为“整条 `server-next -> shared-next -> client-next` 高频动态链”的问题总结。
- 如果只看前端长期边界、只想看 `client-next` 应遵守的同步规则，统一看 [docs/frontend-refactor/sync-pitfalls.md](./frontend-refactor/sync-pitfalls.md)。

## 背景

这轮排查表面上是在修：

- 移动不同步
- 进入战斗时瞬移一息
- 怪物移动没有动画
- 飘字、攻击拖尾、锁定目标箭头缺失
- 视野 tile 不更新
- 路径高亮不消失

但实际根因并不是单个模块写错，而是 `server-next -> shared-next -> client-next` 这一整条高频动态链路里，状态职责分工还没有完全收死。

## 这类问题的共性

这类问题通常都符合下面一个或多个特征：

1. 同一份状态被多条同步链重复驱动
2. 空间动画和非空间辅助更新混在同一个高频包里
3. 客户端外层业务态、地图 store、renderer 同时在改同一份位置或实体状态
4. 世界增量、SelfDelta、PanelDelta 在同一帧里互相覆盖
5. 逻辑上“状态是对的”，但表现层的动画时钟被后续包压平

## 这次实际暴露出的根因模式

### 1. 位置状态多源驱动

本地玩家位置一度同时受下面几条链影响：

- `WorldDelta.p`
- `SelfDelta.x/y`
- `main.ts` 外层 `myPlayer.x/y`
- `MapStore.player`
- `renderer` 内部实体插值状态

只要其中两条同时写坐标，就很容易出现：

- 普通移动正常
- 进入战斗或切目标时瞬移
- 一部分同步看起来是“慢一拍”

### 2. 非空间更新误重置空间动画时钟

`next` 的 `WorldDelta` 不只承载位置变化，还承载：

- `threatArrows`
- `fx`
- `path`
- 其他辅助字段

如果客户端把每条 `WorldDelta` 都当成“新一轮位移动画开始”，就会出现：

- 第一条包刚建立好位移动画
- 第二条只带箭头/特效的包立刻把动画压平
- 体感上就是“瞬移一息”

### 3. SelfDelta 越权碰地图实体

在当前 `next` 主链里，常规位置同步已经回到 `WorldDelta.p`。

此时 `SelfDelta` 应该只负责：

- `mapId`
- `hp/qi`
- `facing`
- 自我状态变化

如果 `SelfDelta` 继续被包装成完整 `playerPatch` 去走 `mergeTickEntities()`，就会在同帧里覆盖掉刚刚由 `WorldDelta` 建好的位移动画。

### 4. 自动战斗、寻路、手动操作抢占规则不清

这轮还暴露出运行时规则层问题：

- 手动移动没有切掉主动自动战斗
- 开启战斗/强制攻击没有真正打断寻路
- 已在自动战斗中切目标时，仍然会即时补一发移动

这类问题的表现看上去像“客户端瞬移”，但根因其实在服务端命令抢占顺序。

## 为什么“一个移动和漂字”会牵这么多地方

因为这些表现共享的是同一条高频动态链，而不是互相独立的模块。

移动、飘字、箭头、怪物动画、视野更新本质上都依赖：

1. 服务端 tick 内的真实状态推进
2. 协议是否正确拆分
3. 客户端 store 是否只接受单一真源
4. renderer 是否只对空间变化启动空间插值

只要其中任意一层的职责没收死，问题就会跨表现形式一起出现。

所以看起来是：

- 修移动
- 修飘字
- 修箭头
- 修怪物动画

实际上是在修：

- 状态所有权
- 高频协议分层
- 动画时钟
- 运行时命令抢占

## 这类问题的标准诊断顺序

以后遇到类似问题，优先按这个顺序查：

1. 先确认服务端是否真的推进了状态
2. 再确认协议里到底发了什么
3. 再确认客户端是不是把同一状态从多条链都写了一遍
4. 最后才看 renderer

具体到实现层：

### 第一步：查服务端真实状态

优先看：

- `packages/server/src/runtime/world/world-runtime.service.js`
- `packages/server/src/runtime/instance/map-instance.runtime.js`

要先确认：

- 玩家/怪物是否真的移动了
- 自动战斗是否真的下发了命令
- 寻路是否真的被打断

### 第二步：查发包分层

优先看：

- `packages/server/src/network/world-projector.service.js`
- `packages/server/src/network/world-sync.service.js`
- `packages/shared/src/protocol.ts`

要确认：

- 空间变化是不是走 `WorldDelta`
- 自我状态是不是走 `SelfDelta`
- 辅助信息是否错误混入空间动画链

### 第三步：查客户端 store 是否重复写状态

优先看：

- `packages/client/src/main.ts`
- `packages/client/src/game-map/store/map-store.ts`

重点确认：

- 外层 `myPlayer` 是否提前写坐标
- `MapStore.player` 是否是另一份对象
- `SelfDelta` 是否还在伪造实体 patch

### 第四步：查 renderer 是否把辅助更新当成空间更新

优先看：

- `packages/client/src/renderer/text.ts`
- `packages/client/src/game-map/renderer/canvas-text-renderer-adapter.ts`

重点确认：

- 哪些更新会重置 `oldWX/targetWX`
- 哪些更新会重置 motion sync token
- 非空间更新是否错误调用了空间插值刷新

## 这轮涉及过的典型修复类型

### 服务端运行时

- `moveTo` 只要客户端路径合法就优先采用，不强制重算最优路径
- 连续移动按整条路径和预算执行，不因转角被人造截断
- 手动移动打断主动自动战斗，但不关闭 `autoRetaliate`
- 主动开战打断寻路
- 已经处于自动战斗时切目标，不再即时补一发移动

### 服务端同步

- `CombatEffect` 真正进入 next `WorldDelta`
- 锁定目标箭头真正进入 next 主链
- 视野 tile 全量和 patch 真正进入 next 同步
- 本地玩家位置同步职责收回 `WorldDelta.p`

### 客户端 store / runtime

- 本地玩家实体常驻，不再因 patch 缺席被误删
- `WorldDelta` 先驱动地图插值，再同步外层玩家态
- `SelfDelta` 没有位置时不再碰地图实体
- 只有真正的空间实体变化才重置动画时钟

### 渲染器

- 本地玩家即使不在实体列表里，也能作为箭头锚点
- 怪物和本地玩家插值不再被无关同步压平
- 飘字、拖尾、警戒区走统一 effect 链

## 后续高风险模块

这类问题在下面几块仍然最容易复发：

### 1. 技能释放与吟唱

高风险点：

- 同一帧同时发：
  - 位移
  - 技能飘字
  - buff
  - action panel 更新

容易出现：

- 技能起手瞬移
- 吟唱条和人物动作错位
- 技能特效有了但位置动画被压平

### 2. 怪物追击与脱战

高风险点：

- 怪物移动、仇恨切换、脱战重置都是高频动态

容易出现：

- 怪物瞬移
- 追击中动画断帧
- 仇恨箭头和真实目标不一致

### 3. 跨图/传送/断线重连

高风险点：

- `MapEnter`
- `WorldDelta`
- `SelfDelta`
- tile 全量和 tile patch

容易出现：

- 跨图后路径残留
- 相机和实体不同步
- 重连后一帧内出现旧地图实体残影

### 4. 面板与世界联动

高风险点：

- 自动战斗
- 锁定目标
- 技能可用性
- 战斗设置

容易出现：

- 面板状态已切换，但世界行为晚一拍
- 世界行为已发生，但面板没跟上

## 后续开发约束

为避免再出现同类问题，后续改动默认遵守：

1. 常规空间位置只允许一条主同步链驱动
2. `SelfDelta` 不得越权驱动地图实体插值，除非它真的承载空间变化
3. 非空间 `WorldDelta` 不得重置空间动画时钟
4. 外层业务态不得在 `MapStore` 之前抢先写位置
5. 手动操作与自动战斗、寻路的抢占规则必须在服务端单点收死

## 一句话结论

这类问题不是“动画没做完”，而是“高频动态状态分层还没完全收死”。

只要一份空间状态同时被：

- 服务端多条包
- 客户端多层状态
- 渲染器多次刷新

重复驱动，最后表现出来就会是：

- 瞬移
- 慢一拍
- 漂字/箭头/怪物动画丢失
- 视野和位置不同步

所以以后遇到类似现象，优先查状态所有权和增量链分工，不要先从表现层猜。
