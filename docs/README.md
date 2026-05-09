# 道劫余生 文档中心

本目录是项目文档的总入口，服务于 AI agent 和人类开发者。

---

## 目录结构

| 目录 | 说明 | 文档数 |
|------|------|--------|
| [architecture/](./architecture/) | 架构决策记录（ADR） | 9 |
| [chains/](./chains/) | 链路文档（数据流与职责边界） | 4 |
| [design/](./design/) | 游戏设计（玩法、数值） | 20+ |
| [plans/](./plans/) | 开发计划（进行中/待开始） | 17 |
| [runbook/](./runbook/) | 运维手册（部署、故障、验证） | 6 |
| [config/](./config/) | 配置文档（配置文件说明） | 4 |
| [content/](./content/) | 内容生产指南（怎么加内容） | 6 |
| [story/](./story/) | 剧情与世界观 | 20+ |
| [archive/](./archive/) | 已完成文档归档 | 10 |

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

- [链路总览](./chains/链路总览.md) — 核心链路概述
- [战斗链路](./chains/战斗链路.md) — 战斗系统数据流

### 内容生产

- [怪物配置](./content/monsters.md) — 如何添加怪物
- [物品配置](./content/items.md) — 如何添加物品
- [技能配置](./content/skills.md) — 如何添加技能
- [地图配置](./content/maps.md) — 如何添加地图

### 运维操作

- [部署手册](./runbook/deployment.md) — 部署、更新、回滚
- [故障排查](./runbook/incident-response.md) — 常见故障处理
- [战斗链路运维](./runbook/战斗链路运维手册.md) — 战斗系统诊断

---

## 验证命令速查

```bash
# 日常开发
pnpm verify:quick              # 1 分钟快速反馈

# 提交前
pnpm verify:standard           # 本地标准门禁

# 发布前
pnpm verify:release            # 完整发布验证
pnpm verify:release:doctor     # 环境检查
pnpm verify:release:with-db    # 带数据库验证
pnpm verify:release:full       # 最严格验证

# 专项验证
pnpm verify:client             # 客户端专项
pnpm verify:building           # 房间/风水专项
pnpm audit:protocol            # 协议审计
pnpm audit:boundaries          # 边界审计
```

---

## 文档类型说明

| 类型 | 回答什么问题 | 示例 |
|------|-------------|------|
| ADR | 为什么这样实现？ | 为什么用 PostgreSQL 而非 MongoDB |
| 链路文档 | 数据怎么流动？ | 战斗伤害从输入到结算的完整路径 |
| 设计文档 | 这个系统怎么玩？ | 炼丹系统的玩法规则 |
| 运维手册 | 出问题怎么办？ | 数据库连接失败的排查步骤 |
| 配置文档 | 怎么改配置？ | 服务端环境变量说明 |
| 内容指南 | 怎么加内容？ | 如何添加新怪物 |

---

## 文档维护规则

1. **已完成的计划**：移至 `archive/`
2. **进行中的计划**：保留在 `plans/`，更新进度
3. **长期维护的设计**：保留在 `design/` 或 `architecture/`
4. **模板文件**：各目录下的 `template.md`，新建文档时复制使用
