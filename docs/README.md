# 道劫余生 文档中心

本目录是项目文档的总入口，服务于 AI agent 和人类开发者。

---

## 目录结构

| 目录 | 说明 |
|------|------|
| [architecture/](./architecture/) | 架构决策记录（ADR） |
| [chains/](./chains/) | 链路总览（数据流与职责边界） |
| [design/](./design/) | 游戏设计（玩法、数值） |
| [plans/](./plans/) | 开发计划 + 问题清单 |
| [runbook/](./runbook/) | 运维手册（部署、故障、验证） |
| [config/](./config/) | 配置文档 |
| [content/](./content/) | 内容生产指南 |
| [story/](./story/) | 剧情与世界观 |

---

## 快速导航

### 新手入门

1. [术语表](./glossary.md) — 理解项目术语
2. [服务端环境变量](./config/server-env.md) — 配置开发环境
3. [部署手册](./runbook/deployment.md) — 部署流程

### 架构理解

- [服务端权威模型](./architecture/0001-server-authority.md) — 为什么服务端说了算
- [Tick 调度模型](./architecture/0002-tick-model.md) — 时间如何推进
- [网络同步分层](./architecture/0003-network-sync-layers.md) — 数据如何同步
- [持久化分层策略](./architecture/0004-persistence-layers.md) — 数据如何存储

### 链路文档

- [链路总览](./chains/链路总览.md) — 全系统数据流概述

### 内容生产

- [怪物配置](./content/monsters.md) — 如何添加怪物
- [物品配置](./content/items.md) — 如何添加物品
- [技能配置](./content/skills.md) — 如何添加技能
- [地图配置](./content/maps.md) — 如何添加地图

### 运维操作

- [部署手册](./runbook/deployment.md) — 部署、更新、回滚
- [故障排查](./runbook/incident-response.md) — 常见故障处理
- [战斗链路运维](./runbook/战斗链路运维手册.md) — 战斗系统诊断
