# 02 钉死 next 真源与协议主线

目标：让 `packages/*` 内部不再存在“谁才是真源”的歧义。

## 任务

- [ ] 确认 `packages/shared/src/protocol.ts` 是唯一协议真源
- [ ] 确认 `packages/shared/src/types.ts` 是唯一共享类型真源
- [ ] 确认 `packages/server/data/content/*` 是唯一内容真源
- [ ] 确认 `packages/server/data/maps/*` 是唯一地图真源
- [ ] 确认 `packages/server/src/runtime/*` 是唯一服务端运行时主链
- [ ] 确认 `packages/client/src/network/socket.ts` 是唯一前台 Socket 主链
- [ ] 确认 `packages/client/src/main.ts` 是唯一前台入口主链
- [ ] 盘点仍通过 legacy 文件定义 next 行为的入口
- [ ] 清掉“next 行为由 legacy 文件决定”的残留路径
- [ ] 盘点 `NEXT_C2S` 声明与 `world.gateway.js` 实现差异
- [ ] 盘点 `NEXT_S2C` 声明与客户端监听差异
- [ ] 决定 `SaveAlchemyPreset` 是否保留
- [ ] 决定 `DeleteAlchemyPreset` 是否保留
- [ ] 如果保留，补齐服务端实现
- [ ] 如果不保留，删除共享协议声明和客户端发送入口
- [ ] 跑一次协议审计，确认 client/server/shared 三边一致

## 完成定义

- [ ] 不再存在“共享协议声明了但服务端没实现”的空洞
- [ ] 不再通过 legacy 文件决定 next 主链行为
