# 道劫余生

道劫余生是一个 Web MMO MUD 项目，采用服务端权威架构，提供多人在线地图探索、角色成长、战斗、物品、市场、邮件、GM 运维和内容配置链路。

## 技术栈

- 前端：Vite、TypeScript、Canvas 2D、DOM UI、React 渐进式 UI
- 服务端：NestJS、Socket.IO、TypeScript
- 数据库：PostgreSQL
- 在线态与缓存：Redis
- 工作区：pnpm workspace

## 目录结构

```text
packages/
  client/          游戏客户端
  shared/          前后端共享类型、协议与常量
  server/          游戏服务端、运行时、持久化与运维工具
  config-editor/   配置编辑器与内容生产工具
docs/              设计、验证、审计与运维文档
scripts/           构建、生成、验证与辅助脚本
```

## 本地开发

安装依赖：

```bash
pnpm install
```

启动本地开发环境：

```bash
./start.sh
```

分别启动客户端或服务端：

```bash
pnpm dev:client
pnpm dev:server
```

## 构建

```bash
pnpm build
pnpm build:client
pnpm build:server
pnpm build:shared
pnpm build:config-editor
```

## 验证

```bash
pnpm verify:replace-ready:doctor
pnpm verify:replace-ready
pnpm verify:replace-ready:with-db
pnpm verify:replace-ready:shadow
pnpm verify:replace-ready:acceptance
pnpm verify:replace-ready:full
pnpm audit:protocol
pnpm audit:boundaries
```

## 文档

- [验证与验收](./docs/next-plan/09-verification-and-acceptance.md)
- [协议审计](./docs/protocol-audit.md)
- [教程机制](./docs/tutorial-mechanics.md)
- [服务端说明](./packages/server/README.md)
