---
name: client-app-author
description: Use this skill when changing packages/client application state, client runtime, packages/client/src/next, network-derived state, overlays, interaction flows, or client-side projections while keeping authority on the server and reusing existing client modules.
---

# 客户端应用状态与交互流

用于修改客户端运行态、应用状态、网络消费后的派生状态和 overlay 交互。目标是复用现有模块，让客户端只做显示、输入和可回放派生，不承担服务端权威裁定。

## 商业级 MMO 口径

- 客户端应用层必须支撑长时间游玩、频繁同步、断线重连、跨图切换和移动端操作连续性。
- 状态模型要能承受大量 delta 更新，不因服务端高频同步导致整页、整场景或整状态树重置。
- 所有玩家关键结果以服务端为准；客户端只维护投影、缓存、临时交互和可丢弃派生状态。
- 新交互要复用既有模块，避免形成难以维护的第二套状态流。

## 强制流程

1. 先定位现有模块：`network`、`runtime`、`next`、`game-map`、`ui`、`renderer` 中是否已有状态或能力。
2. 网络包进入客户端后，优先转成局部派生状态，不直接触发整页重建。
3. 输入只表达意图；移动合法性、碰撞、战斗结算等正确性仍由服务端裁定。
4. overlay、面板、地图交互要复用现有 store、事件总线、弹层宿主和状态容器。
5. 新增客户端状态时，明确它是服务端投影、缓存、临时 UI 状态还是派生计算结果。
6. 与 UI 或地图渲染联动时，优先传递最小变化，不把完整协议包泄漏到所有组件。

## 硬规则

- 不复制一套和服务端不一致的规则裁定。
- 不为了一个新交互绕开现有 `network/runtime/next/ui/game-map` 边界。
- 不把服务端高频 delta 在客户端消费端扩成全量刷新。
- 不让 overlay、tooltip、详情弹层各自创建互相冲突的状态宿主。
- 不新增只能在浅色桌面场景下成立的交互。

## 交付说明

- 复用了哪些现有客户端模块。
- 是否满足商业级 MMO 的长时间运行、断线重连、频繁同步和移动端交互要求。
- 新增或修改的状态属于服务端投影、派生状态还是临时 UI 状态。
- 是否保持服务端权威。
- 是否影响 UI 局部更新、深色模式或手机端。
