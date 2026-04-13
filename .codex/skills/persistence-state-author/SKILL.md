---
name: persistence-state-author
description: Use this skill when designing or modifying persistent state in this repo, including player/account state, GM tools, settings, editor drafts, map maintenance parameters, cache-vs-database decisions, source-of-truth definition, and delivery-time checks for next-session durability.
---

# 持久化状态设计

这个 skill 用于处理“下次还在”的状态。重点不是把数据先存起来，而是先确认真源是谁、运行时副本是谁、缓存是谁、退出重进后由谁恢复。

适用场景：

- 新增或修改账号、角色、GM、设置、编辑器、草稿、地图维护参数
- 判断某个状态该落 PostgreSQL、Redis 还是仅做本地缓存
- 梳理某个系统的正式持久化真源
- 交付前检查“刷新/重连/重启/下次登录后是否仍在”

## 先做状态分类

先回答四个问题：

- 这个状态是不是“下次还在”
- 这个状态是谁拥有：玩家、账号、角色、地图、GM、系统配置
- 这个状态是运行时热点，还是长期真源
- 这个状态丢失后是否会造成功能错误、权限错误或内容回退

只要答案落到“下次还在”，正式真源默认必须是数据库。

## 存储职责

- PostgreSQL：正式持久化真源；玩家、GM、配置、编辑器、草稿、维护参数等只要要长期存在，最终都应落库。
- Redis：在线态、实时态、短期协同态、加速读写；不要把它当唯一真源。
- `localStorage` / `sessionStorage` / runtime JSON / 本地配置文件：只做缓存、会话介质、迁移导入，不做正式持久化落点。

## 强制流程

1. 先定义状态拥有者和正式真源。
2. 再定义运行时副本、缓存层、回填路径。
3. 如果运行时会先落 Redis，再确认数据库何时写入、何时回读、失败如何补偿。
4. 如果是编辑器、GM、设置、草稿、地图维护参数，默认做一次“刷新后还在”和“服务重启后还在”的推演。
5. 交付前明确哪些字段已经正式持久化，哪些仍然只是缓存或会话态。

## 硬规则

- 只要某状态应当下次仍在，正式持久化真源就必须是数据库。
- 不要把 `localStorage`、`sessionStorage`、runtime JSON、本地配置文件当正式真源。
- 不要在说明里把“已写入 Redis”表述成“已完成持久化”。
- 运行时缓存、镜像、投影、会话态必须和真源区分清楚。
- 如果无法完成持久化闭环，交付时必须明确风险和缺口。

## 交付时必须说明

- 这次改动涉及哪些需要下次仍在的状态
- 它们的正式真源、运行时副本、缓存层分别是什么
- 是否做了持久化检查；如果没做，阻塞点是什么
- 是否存在仅 Redis 持有、仅前端缓存持有、或尚未落库的残缺状态
