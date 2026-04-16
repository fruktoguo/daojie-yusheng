# 06 服务端主链收口

目标：把 server-next 主链收成单路径、清职责、好验证。

## 任务

- [ ] 继续拆 `packages/server/src/runtime/world/world-runtime.service.js`
- [ ] 继续拆 `packages/server/src/network/world.gateway.js`
- [ ] 继续拆 `packages/server/src/network/world-sync.service.js`
- [ ] 继续拆 `packages/server/src/network/world-projector.service.js`
- [ ] 继续拆玩家运行时的混杂职责
- [ ] 继续拆 session / bootstrap / auth 的边界
- [ ] 明确 tick 内允许写状态的入口
- [ ] 明确地图、玩家、战斗、掉落、交互写路径
- [ ] 明确哪些 GM 操作必须走 runtime queue
- [ ] 明确哪些 GM 操作允许直接改持久态
- [ ] 收口玩家从登录到进入世界到持久化的主链
- [ ] 收口地图同步、面板同步、详情查询的服务边界
- [ ] 补每个拆分阶段的最小 smoke 验证

## 完成定义

- [ ] 服务端主链按职责拆清
- [ ] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径
