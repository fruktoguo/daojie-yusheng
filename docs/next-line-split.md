# 新线拆分执行文档

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

后续切 `server-next` 时，再补：

- `pnpm --filter @mud/server-next compile`
- 必要 smoke case
