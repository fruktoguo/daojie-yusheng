# 新线拆分执行文档

更新时间：2026-04-11（当前轮次）

## 当前轮次判断

这份文档现在要回答的不是“要不要拆线”，而是“拆到哪一步了、哪几个边界已经切开、下一步还该先切什么”。

当前可以直接下结论：

- `client-next` 和 `shared-next` 已经是明确的新线起点，不再只是临时副本
- `server-next` 仍然处在过渡期，协议、会话、投影和 GM/运维面还有大量 compat 负担
- 所以现在不是继续扩张新线 compat，而是继续把新线边界往前推，优先切掉重复字段、整量投影和巨型共享状态

## 背景

当前仓库已经同时存在旧线与 `server-next`：

- 旧线：`packages/client` + `packages/server` + `packages/shared`
- 新后端线：`packages/server-next`

实际对比后可以确认，`server-next` 已经不只是“旧服的内部重写版”，而是在运行时、会话、持久化、GM/账号、协议边界上都逐步形成了独立实现。继续让它一边重写、一边维持对旧前端与旧接口的大量兼容层，收益越来越低，后续维护成本会越来越高。

因此这条线现在改为：

- 停止继续扩张 `server-next` 对旧前端的 compat 适配
- 保留旧线继续开发和维护
- 新开一条真正独立的新线，让新前端直接对接新后端

## 目录策略

不新建更深一层的嵌套 monorepo，也不把整仓库机械复制到新的顶级子文件夹。

原因：

- 根 `pnpm-workspace.yaml` 已经使用 `packages/*`
- 继续沿用 sibling package 最容易接入现有 workspace、构建和依赖管理
- 旧线与新线可以共存，边界比“复制整个仓库”更清晰

当前采用的目录方案：

- 旧线保留：
  - `packages/client`
  - `packages/server`
  - `packages/shared`
- 新线新增：
  - `packages/client-next`
  - `packages/shared-next`
  - `packages/server-next`

## 边界原则

### 1. 旧线继续是稳定开发线

- 旧前端继续只对接旧后端
- 旧 shared 继续服务旧线
- 旧线上的功能开发、修复、活动内容，不被新线试验牵连

### 2. 新线不再以 compat 为中心

- `client-next` 直接面向 `server-next`
- `shared-next` 作为新线协议与共享常量的独立落点
- 后续新增协议、新运行态字段、新同步策略，优先落在 `shared-next`

### 3. compat 只做收敛，不再扩张

- `server-next` 现有 compat/legacy 能跑就先保留
- 除非是为了保证过渡期启动或验证，否则不再继续把新逻辑包成旧接口
- 新线功能不以“伪装成旧服”为目标

## 当前已经切开的边界

这几条边界现在可以视作已经切开，后续只是在继续收口，不该再倒回去：

1. `client-next` 已经从旧 `client` 分出去，自己的事件面、UI 接入和构建链路都开始独立。
2. `shared-next` 已经从旧 `shared` 分出去，协议、数值和新线常量有了独立落点。
3. `server-next` 的 auth / snapshot / session / trace 已经形成独立验证链，不再只是旧后端的影子实现。
4. `server-next` 的协议审计、replace-ready 和 shadow 门禁已经可以单独跑，不再必须依赖旧线来证明自己。

## 现在还不能切的边界

下面这些边界现在还不适合一刀切开，因为它们仍然和主链真源、门禁或者高频热路径绑在一起：

1. `server-next` 的 `auth/token/bootstrap/snapshot/session` 主链不能和别的真源改动混切。
2. `WorldProjector` 和 `WorldSyncService` 不能在没有基准和 slice 方案前直接大改。
3. `PlayerState`、`PanelDelta`、`MapStatic`、`Bootstrap` 这些首包和同步结构不能继续无约束堆字段。
4. `shared-next` 的协议和类型基线不能只靠人工补洞，必须逐步转成检查驱动。

## 为什么不继续写兼容层

主要问题有三类：

1. 协议边界已经分叉  
   新后端的数据组织、同步方式和运行时模型，已经不是旧前端天然可消费的形态。

2. 兼容层会把开发成本转成长期负债  
   每做一个新特性，都要同时考虑“新实现”和“如何伪装成旧行为”，维护成本高，而且会掩盖真正的新线边界。

3. 兼容层会拖慢协议与运行时清理  
   新后端本该收敛协议、清掉旧包袱，但 compat 会迫使很多旧字段、旧流程、旧接口继续存在。

## 本轮落地范围

本轮只做拆线起步，不做大规模协议改造：

1. 写清楚拆线文档
2. 建立 `shared-next`
3. 建立 `client-next`
4. 让 `client-next` 直接依赖 `shared-next`
5. 在 workspace 中补齐新线常用脚本

本轮暂不做：

- 不把 `server-next` 一次性整体切到 `shared-next`
- 不删除 `server-next` 中已有 compat 目录
- 不修改旧线前后端的既有对接关系

## 下一步最值得切的边界

这一轮优先级要和 [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md) 里的 `T15 / T16 / T20` 对齐，先切下面 5 个边界：

1. `Bootstrap + MapStatic + PanelDelta` 的首包边界。
   对应 `T15`，目标是先把重复字段和重复分层压薄，不要再把静态、低频和面板初始化混在一起。
2. `WorldProjector` 的整量 capture/diff 边界。
   对应 `T16`，目标是把 projector 从“整量快照 + 差量比较”推进到稳定 slice / revision 驱动。
3. `PlayerState / sync-projector` 的扩展边界。
   对应 `T20`，目标是以后新增系统默认走 slice 接入，不再往巨型状态结构继续堆字段。
4. `client-next` 的旧 alias 边界。
   先把 `onMapStaticSync / onRealmUpdate` 这类兼容层逐步压掉，再把对外事件面完全收成 next-native 命名。
5. `shared-next` 的字段补全边界。
   先把 `bootstrap / panel / delta` 的初始化、克隆、重置、投影规则写硬，后续再继续扩一致性检查。

## 后续迁移顺序

建议按下面顺序继续推进：

1. 先让 `client-next` 可以独立开发、独立构建
2. 再把 `server-next` 的共享协议依赖逐步迁到 `shared-next`
3. 之后在 `shared-next` 中开始演进新线协议
4. 最后逐步删除 `server-next` 中已无价值的 compat/legacy 代码

## server-next 迁移 shared-next 的最小路径

这一轮不切，但后面最小路径已经明确：

1. 把 `server-next` 的 `@mud/shared` 依赖改成 `@mud/shared-next`
2. 调整 `compile` 脚本，先构建 `@mud/shared-next`
3. 批量替换 `server-next/src` 下对 `@mud/shared` 的引用
4. 跑现有 smoke，确认运行时和工具链仍可用

这样改不会改变 `server-next` 现有 tick、持久化、热路径结构，只是把共享协议真源换到新线。

## 当前状态判断

首轮只创建 `shared-next` 和 `client-next`，而不立刻切 `server-next`，是安全的：

- 旧线完全不受影响
- `server-next` 继续按当前方式编译和验证
- `shared-next` 先作为新线协议副本存在，不会干扰旧 shared
- 下一步可以在不打断旧线开发的前提下，逐步把新后端迁过去

## 验证要求

每完成一个阶段，至少做对应最小验证：

- `pnpm --filter @mud/shared-next build`
- `pnpm --filter @mud/client-next build`
- `pnpm --filter @mud/server-next exec node dist/tools/bench-first-package.js`
- `pnpm --filter @mud/server-next exec node dist/tools/bench-sync.js`

后续切 `server-next` 时，再补：

- `pnpm --filter @mud/server-next compile`
- 必要 smoke case
