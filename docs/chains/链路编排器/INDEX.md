# 链路编排器

本目录记录跨服务、跨真源、跨运行态开关的全局编排合同。这里回答“链路如何被统一编排”，不是替代业务链路总览。

编排器文档按链路组拆分。每组一个文档，避免启动、关闭、连接、迁移、发布恢复等顺序混在同一个大文件里。

## 编排原则

1. 一个链路只能有一个权威编排入口。
2. 服务只暴露幂等阶段能力，不在 `onModuleInit` / `onApplicationBootstrap` 中自行抢跑关键循环。
3. traffic、tick、flush、outbox、worker、instance write、player attach 必须受统一闸门控制。
4. DB 持久化真源、实例租约、运行时内存态、Redis 在线态、网络流量按固定阶段闭环。
5. 失败策略必须明确 fail-fast、degraded、quarantine 或 retry，不允许靠日志报警继续写入。
6. readiness / GM / 日志必须能看到阶段、耗时、失败原因和隔离对象。

## 链路组

| 文档 | 状态 | 说明 |
|------|------|------|
| [启动链路](启动链路.md) | 已定义，已开始落地 | 进程启动到 socket 玩家流量开放 |
| [关闭链路](关闭链路.md) | 已定义，待落地 | GM restart / SIGTERM 到 drain、flush、release lease、退出 |
| [玩家连接链路](玩家连接链路.md) | 待补 | socket connect / hello / bootstrap / session fencing |
| [跨图传送链路](跨图传送链路.md) | 待补 | source detach、target lease、落点、AOI、静态同步 |
| [实例迁移链路](实例迁移链路.md) | 待补 | GM/自动迁移、lease handoff、玩家隔离 |
| [发布恢复链路](发布恢复链路.md) | 待补 | 镜像发布、readiness、灰度、回滚、数据恢复 |
| [运维导入链路](运维导入链路.md) | 待补 | 配置/存档导入、校验、切换、审计 |

占位链路在补齐设计前不得被实现当成“已有编排合同”引用。

## 代码落点

当前启动编排器代码落在：

- `packages/server/src/lifecycle/startup-status.service.ts`
- `packages/server/src/lifecycle/startup-barrier.service.ts`
- `packages/server/src/lifecycle/server-lifecycle-coordinator.service.ts`

后续关闭、连接、迁移等链路应继续按“薄编排器 + 服务幂等阶段能力 + 闸门状态”的方式扩展，不把运行时规则、持久化 IO、网络协议拼装重新卷进一个巨型 service。
