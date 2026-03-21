# 道劫余生

道劫余生是一个 Web MMO MUD 项目，采用格子地图与服务端权威判定，整体风格参考传统 MUD 与类 CDDA 的多人在线生存体验。

## 游戏定位

这是一个以修行、生存、探索和风险推进为核心的在线文字化修仙世界。

- 玩家在多张二维格子地图之间移动、探索、战斗、接任务、收集掉落并持续成长
- 世界采用服务端权威判定，客户端只负责输入与渲染
- 地图存在明确的风险梯度，强调从安全区到高压区域的逐步推进

## 核心玩法

- 格子探索：在地图中逐格移动，接触 NPC、地标、传送点与怪物刷新区
- 修炼成长：通过修炼、战斗与任务推动角色属性、境界和资源积累
- 战斗与掉落：在不同危险等级区域挑战怪物，获取装备、材料、技能书等奖励
- 多图推进：通过传送点与路线分支，在不同地图中选择稳健发育或高风险收益路线
- 在线共存：所有玩家共享同一世界，位置占用、视野与状态变化统一由服务端处理

## 世界与路线

当前地图内容围绕“由低风险到高风险”的推进逻辑组织：

- 主线：云来镇 → 青竹林 → 玄铁矿洞 / 断碑遗迹 → 噬魂兽谷
- 侧线：云来镇 ↔ 荒野，并可由荒野转入青竹林

大致风险分层：

- `dangerLevel 1-2`：新手试炼与熟悉系统区域
- `dangerLevel 3`：资源与任务压力区
- `dangerLevel 5`：高危战斗区与王级怪区域

## 系统设计摘要

- Tick 驱动：服务端以 1Hz tick 处理玩家指令、状态变化与广播
- AOI 视野：玩家只接收自己视野范围内的地图与实体更新
- 单格占用：同一格不能重叠站人，移动合法性由服务端裁定
- 多地图传送：地图之间通过 portal 连接，支持跨图推进
- 断线恢复与顶号：支持会话恢复，同账号新连接会接管旧连接角色状态

更多完整设计与技术细节见 [docs/design.md](./docs/design.md)、[docs/architecture.md](./docs/architecture.md) 和 [docs/numeric-design.md](./docs/numeric-design.md)。

## 技术栈

- 服务端：NestJS + Socket.IO + TypeScript
- 前端：Vite + Canvas 2D + TypeScript
- 数据层：PostgreSQL + Redis
- Monorepo：pnpm workspace

## 项目结构

```text
packages/
  shared/   前后端共享类型、常量、协议
  server/   服务端逻辑、认证、地图、战斗、数据库
  client/   Canvas 渲染、输入、面板、网络通信
docs/       设计与架构文档
```

## 环境要求

- Node.js 18+
- pnpm 10+
- 本地开发建议准备 PostgreSQL 和 Redis
- 或直接使用 Docker Compose

## 快速开始

安装依赖：

```bash
pnpm install
```

本地启动：

```bash
./start.sh
```

Docker 启动：

```bash
./start.sh docker
```

启动后默认地址：

- 客户端：`http://localhost:5173`
- 服务端：`http://localhost:3000`

## 常用命令

构建整个工作区：

```bash
pnpm build
```

仅启动前端开发环境：

```bash
pnpm dev:client
```

仅启动服务端开发环境：

```bash
pnpm dev:server
```

## 自动部署

项目已接入自动构建与自动部署链路：

- 推送到 `main` 后，GitHub Actions 会自动构建前后端镜像并推送到 GHCR
- 构建完成后，Actions 会通过 SSH 连接生产服务器并执行 Docker Swarm 发布
- 生产环境使用 `start-first + healthcheck + rollback` 做近零停机滚动更新
- 服务端启用健康检查与优雅停机，更新时会先拉起新实例，再摘除旧实例
- 默认发布端口为前端 `11921`、后端 `11922`，适合由现有 Caddy 统一反向代理到域名
- 本地提交不会触发线上更新；只有 push 到 `main` 才会自动部署，且一次 push 只触发一次部署

关键文件：

- [docker-stack.yml](./docker-stack.yml)
- [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)
- [.github/workflows/sync.yml](./.github/workflows/sync.yml)
- [docs/deploy.md](./docs/deploy.md)
- [docs/gitee-sync.md](./docs/gitee-sync.md)

如果要配置生产环境、GitHub Secrets 或查看回滚方式，请直接参考 [docs/deploy.md](./docs/deploy.md)。

如果要增加 GitHub -> Gitee -> 国内服务器 WebHook 的镜像链路，请参考 [docs/gitee-sync.md](./docs/gitee-sync.md)。

## 说明

- 客户端不负责游戏规则正确性判定，所有关键状态以服务端为准
- 服务端状态更新围绕 tick 驱动流程组织
- `packages/shared` 是前后端协议一致性的单一来源
