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
  shared-next/ next 协议与 next 共享类型
  server-next/ next 替换线服务端与 replace-ready 验证
  client-next/ next 替换线前端
docs/       设计与架构文档
```

其中共享常量当前采用目录化组织：

- 主目录为 `packages/shared/src/constants/`
- 外层分类优先使用符合非开发者认知的 `gameplay`、`network`、`ui`、`visuals`
- `packages/shared/src/constants.ts` 仍保留为兼容层，用于承接旧导入路径，不再作为新增常量的首选落点

同时，单端私有常量也按端内目录集中维护：

- 客户端私有常量位于 `packages/client/src/constants/`
- 服务端私有常量位于 `packages/server/src/constants/`
- 客户端目录优先按 `ui`、`visuals`、`world`、`editor`、`input` 拆分
- 服务端目录优先按 `auth`、`storage`、`gameplay`、`world` 拆分
- 仅单端使用的缩放参数、UI 默认配置、服务端运行时哨兵值等，不再继续散落在业务文件顶部

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

`local` 模式会先检查本机 `localhost:5432` 和 `localhost:6379`。如果机器上已经存在 `mud-local-postgres` / `mud-local-redis` 这样的旧本地容器，会优先直接启动它们；只有没有现成容器时，才会执行 `docker compose up -d postgres redis` 拉起仓库自带的本地 PostgreSQL / Redis。因此重启电脑后如果 Docker 守护进程还没启动，需要先启动 Docker Desktop 或 `docker` 服务，再执行脚本。

如果你使用的是自己本机或远程的数据库 / Redis，可以在 `packages/server/.env` 里覆盖连接配置，或直接使用：

```bash
SKIP_LOCAL_INFRA=1 ./start.sh
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

## server-next 状态

- `server-next` 当前仍处于独立 shadow / replace-ready 验收阶段，不是默认正式替换入口
- 先用 `pnpm verify:replace-ready:doctor` 检查本地 / with-db / shadow 三条链当前缺哪些环境变量
- 当前推荐的本地主证明链入口是 `pnpm verify:replace-ready`
- 如需带数据库闭环，使用 `pnpm verify:replace-ready:with-db`
- 如需只复跑最小带库 `auth/token/bootstrap` 真源证明链，使用 `pnpm verify:replace-ready:proof:with-db`
- 如需验证已部署 shadow 实例，使用 `pnpm verify:replace-ready:shadow`
- 如需串行跑“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”，使用 `pnpm verify:replace-ready:acceptance`
- `pnpm verify:server-next*` 当前只是兼容别名；需要独立 CI 带库补证时，可触发 [verify-server-next-with-db.yml](/home/yuohira/mud-mmo/.github/workflows/verify-server-next-with-db.yml)
- 这些验证只说明 replace-ready 主证明链已覆盖到当前范围，不等于 `next` 已完整替换整体游戏
- 详细口径见 [packages/server-next/TESTING.md](/home/yuohira/mud-mmo/packages/server-next/TESTING.md)、[packages/server-next/REPLACE-RUNBOOK.md](/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md) 和 [docs/next-gap-analysis.md](/home/yuohira/mud-mmo/docs/next-gap-analysis.md)

## 自动部署

项目当前的镜像与部署链路如下：

- 推送到 `main` 后，GitHub Actions 会自动构建前后端镜像并推送到 GHCR，测试服务器继续跟随 `latest` / `sha-提交号` 自动更新
- 需要给正式服务器发布稳定版时，在 GitHub Actions 页面手动运行 `Publish Prod Image`，额外生成 `prod` 标签镜像
- 正式服务器只需要把拉取镜像的标签从 `latest` 改成 `prod`，以后就不会再被你的日常测试推送影响
- 生产环境使用 `start-first + healthcheck + rollback` 做近零停机滚动更新
- 服务端启用健康检查与优雅停机，更新时会先拉起新实例，再摘除旧实例
- 默认发布端口为前端 `11921`、后端 `11922`，适合由现有 Caddy 统一反向代理到域名
- 本地提交仍会自动更新测试服，但不会自动生成正式服使用的 `prod` 镜像

关键文件：

- [docker-stack.yml](./docker-stack.yml)
- [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)
- [.github/workflows/publish-prod-image.yml](./.github/workflows/publish-prod-image.yml)
- [.github/workflows/sync.yml](./.github/workflows/sync.yml)
- [docs/deploy.md](./docs/deploy.md)
- [docs/gitee-sync.md](./docs/gitee-sync.md)

如果要配置生产环境、GitHub Secrets 或查看回滚方式，请直接参考 [docs/deploy.md](./docs/deploy.md)。

如果要增加 GitHub -> Gitee -> 国内服务器 WebHook 的镜像链路，请参考 [docs/gitee-sync.md](./docs/gitee-sync.md)。

## 说明

- 客户端不负责游戏规则正确性判定，所有关键状态以服务端为准
- 服务端状态更新围绕 tick 驱动流程组织
- `packages/shared` 是前后端协议一致性的单一来源
- 共享常量默认放在 `packages/shared/src/constants/` 的分类目录下；`packages/shared/src/constants.ts` 目前仅承担兼容导出职责
