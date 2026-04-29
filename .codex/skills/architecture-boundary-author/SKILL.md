---
name: architecture-boundary-author
description: Use this skill when changing project architecture boundaries in packages/*, splitting large modules, moving responsibilities across client/shared/server/config-editor, or deciding whether logic belongs in runtime, network, persistence, UI, rendering, config, tools, or a Rust acceleration boundary.
---

# 架构边界与职责收敛

用于处理跨模块职责、分层边界、巨型模块拆分和工程主线收敛。目标是让改动落在正确层级，避免把运行时规则、协议装配、持久化 IO、UI 状态和冷路径工具重新混在一起。

## 商业级 MMO 口径

- 架构决策必须支撑长期在线、多地图、多玩家并发、可灰度替换和故障定位。
- 模块边界要服务于权威一致性、包体成本、持久化恢复、运维验证和后续扩容。
- 任何跨层捷径都要能解释为什么不会破坏 tick 权威、协议分层、数据库真源或客户端连续操作。
- 新边界必须可测试、可观测、可回滚；不能只在本地 happy path 成立。

## 默认落点

- `packages/shared`：协议、共享类型、共享常量、跨端契约。
- `packages/server/src/runtime`：服务端权威游戏状态和 tick 内执行。
- `packages/server/src/network`：socket/http 入口、协议适配、广播边界。
- `packages/server/src/persistence`：数据库真源、Redis 在线态、迁移和恢复链。
- `packages/client/src/network`：协议消费和连接状态。
- `packages/client/src/runtime`、`packages/client/src/next`：客户端派生状态、应用状态、交互流。
- `packages/client/src/game-map`、`packages/client/src/renderer`：地图、相机、Canvas 渲染。
- `packages/client/src/ui`：HUD、面板、弹层、DOM UI。
- `packages/config-editor`：配置编辑、schema、导入导出、校验。

## 强制流程

1. 先判断改动属于哪个主包、哪一层，不先动文件。
2. 如果跨层，先写清每层只承担什么职责。
3. 拆大模块时按职责拆：编排、规则、查询、持久化、协议装配、运行时状态、冷路径工具。
4. 保留薄编排层，但不要让 facade 重新吞下所有细节。
5. 新抽象必须减少真实复杂度、降低重复或匹配既有边界。
6. 后端性能问题先确认热路径和瓶颈；只有 TypeScript 结构优化仍不足时，才考虑 Rust/N-API/WASM 边界。

## 硬规则

- 不做单纯换目录、换文件名、换写法的“重构”。
- 不为架构调整改变玩法规则、协议语义、持久化语义或面板职责。
- 客户端不得承担移动合法性、碰撞、战斗结算等权威裁定。
- 网络层只做协议入口、出包和适配，不沉淀游戏规则。
- 持久化层提供真源读写和恢复链，不承载 tick 内规则执行。
- Rust 加速必须有稳定、窄口、可测边界；不能把业务状态拆到两个真源里。

## 交付说明

- 改动落在哪些层，为什么。
- 这次边界是否能承担商业级 MMO 的并发、恢复、验证和运维要求。
- 是否拆清了运行时、协议、持久化、UI、工具职责。
- 是否引入新抽象；若引入，解决了什么具体复杂度。
- 是否涉及热路径或 Rust 加速边界，以及验证结果。
