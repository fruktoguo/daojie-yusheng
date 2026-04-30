# 服务端

`packages/server` 是道劫余生的服务端工作区，负责游戏运行时、网络协议入口、持久化、运维工具和验证脚本。

## 职责

- 提供 NestJS HTTP 服务与 Socket.IO 实时连接
- 维护服务端权威的地图、玩家、战斗、物品、市场、邮件和 GM 状态
- 管理 PostgreSQL 持久化真源、Redis 在线态和恢复流程
- 提供 smoke、proof、audit、with-db、shadow、acceptance、full 等验证入口

## 常用命令

```bash
pnpm build:server
pnpm --filter @mud/server start:dev
pnpm verify:release:doctor
pnpm verify:release:local
pnpm verify:release:with-db
pnpm verify:release:acceptance
pnpm verify:release:full
```

## 文档

- [测试说明](./TESTING.md)
- [运维 Runbook](./RUNBOOK.md)
- [验证与验收](../../docs/next-plan/09-verification-and-acceptance.md)
- [协议审计](../../docs/protocol-audit.md)
