# jiuzhou 可吸收部分整理

更新时间：2026-04-15

来源基线：

- 总审计文档：[jiuzhou-next-architecture-audit.md](./jiuzhou-next-architecture-audit.md)
- 参考项目：`参考/jiuzhou`

这份文档只回答一件事：

- `jiuzhou` 里哪些设计和实现值得 `next` 吸收

这份文档不回答：

- 两边谁整体更强
- 哪些地方不该借鉴
- 全面对比结论

这些统一看：

- [jiuzhou-next-architecture-audit.md](./jiuzhou-next-architecture-audit.md)

---

## 1. 吸收原则

吸收 `jiuzhou` 的前提不是“让 `next` 变得更像 `jiuzhou`”，而是：

1. 不回退 `next` 现有的 Canvas 地图运行时
2. 不回退 `shared-next` 的协议真源
3. 不回退 `world tick + projector + sync` 这条服务端主线
4. 不破坏 `shadow / with-db / acceptance / full` 这套验证门禁

所以这里的“吸收”，只允许发生在：

- 更成熟的辅助抽象
- 更成熟的长流程编排
- 更成熟的生产运维设施
- 不改变 `next` 主架构方向的局部增强

---

## 2. 前端可吸收部分

### 2.1 战斗实时归一化层

参考文件：

- [参考/jiuzhou/client/src/services/battleRealtime.ts](../参考/jiuzhou/client/src/services/battleRealtime.ts)

可吸收点：

- 把 socket 到达的战斗消息先归一化成“可直接渲染的完整状态”
- 在归一化层完成日志增量合并、单位状态合并、终态收口
- 不让页面和面板自己各写一套 battle delta 兜底逻辑

建议落地方向：

- 给 `client-next` 的战斗/事件型面板单独补一层 `realtime normalizer`
- 尤其适用于：
  - 战斗日志
  - 多阶段技能表现
  - 连续战斗/自动战斗状态
  - 需要“晚订阅也能直接拿到完整态”的 UI

### 2.2 低优先级请求延后调度

参考文件：

- [参考/jiuzhou/client/src/pages/Game/shared/useDeferredGameRequest.ts](../参考/jiuzhou/client/src/pages/Game/shared/useDeferredGameRequest.ts)

可吸收点：

- 把不影响当前主操作链的请求延后
- 避免首次打开页面时同时堆太多 HTTP / socket 请求
- 让“先能操作、后补细节”的加载顺序更稳定

建议落地方向：

- 给 `client-next` 增加一层轻量 deferred request helper
- 优先用于：
  - 世界总览
  - 排行榜
  - 低频详情
  - 非首屏必需的说明性内容

### 2.3 在线态 / presence 聚合 hook 思路

参考文件：

- [参考/jiuzhou/client/src/pages/Game/shared/useRealtimeMemberPresence.ts](../参考/jiuzhou/client/src/pages/Game/shared/useRealtimeMemberPresence.ts)

可吸收点：

- 把在线广播收敛成可直接消费的 presence 结果
- 不让 UI 自己拼在线/离线状态和最近活跃时间
- 把 socket 缓存回放和 UI 订阅分开

建议落地方向：

- 用在 `next` 的：
  - 组队
  - 好友
  - GM 在线列表
  - 可能出现的门派/帮会成员面板

### 2.4 长页面共享辅助层的组织方式

参考文件：

- [参考/jiuzhou/client/src/pages/Game/shared](../参考/jiuzhou/client/src/pages/Game/shared)

可吸收点：

- 对格式化、判定、展示文本、局部交互策略做“共享辅助模块”沉淀
- 让复杂面板不把所有辅助逻辑都塞回主文件

建议落地方向：

- `client-next` 继续保持“主面板 + helpers”分层
- 但不要回退成 `Game/index.tsx` 那种大协调器模式

---

## 3. 后端可吸收部分

### 3.1 battle session 式长流程编排

参考文件：

- [参考/jiuzhou/server/src/services/battleSession](../参考/jiuzhou/server/src/services/battleSession)

可吸收点：

- 把“开始 / 推进 / 查询 / 恢复 / 终态处理”收成独立服务
- 不让 battle 逻辑、socket 逻辑、控制器逻辑各自维护一份流程推进状态

建议落地方向：

- `next` 里凡是跨多个动作、多个阶段、多个结果落点的链路，都适合参考这个模式：
  - 战斗会话
  - 炼丹任务
  - 强化任务
  - 长时采集
  - 未来的副本/秘境/挂机链路

### 3.2 启动流水线化

参考文件：

- [参考/jiuzhou/server/src/bootstrap/startupPipeline.ts](../参考/jiuzhou/server/src/bootstrap/startupPipeline.ts)

可吸收点：

- 把启动阶段要做的事情显式列成步骤
- 包括：
  - 数据准备
  - 缓存预热
  - worker 初始化
  - 清理任务
  - 状态恢复
  - 最终监听端口

建议落地方向：

- 给 `server-next` 的启动补一个更清晰的 pipeline 文档和编排层
- 即使不大改启动代码，也至少把：
  - runtime maintenance
  - persistence flush
  - bootstrap readiness
  - shadow gate 依赖
 统一挂到清晰的启动顺序说明里

### 3.3 单真源时间快照广播

参考文件：

- [参考/jiuzhou/server/src/services/gameTimeService.ts](../参考/jiuzhou/server/src/services/gameTimeService.ts)

可吸收点：

- 时间系统单独维护
- 对外只广播统一时间快照
- 让客户端不自己推时间语义

建议落地方向：

- `next` 继续把世界时间作为独立低频快照维护
- 不要让地图、任务、HUD 各自拼时间状态

### 3.4 worker 协调器思路

参考文件：

- [参考/jiuzhou/server/src/workers](../参考/jiuzhou/server/src/workers)
- [参考/jiuzhou/server/src/services/techniqueGenerationJobRunner.ts](../参考/jiuzhou/server/src/services/techniqueGenerationJobRunner.ts)
- [参考/jiuzhou/server/src/services/partnerRecruitJobRunner.ts](../参考/jiuzhou/server/src/services/partnerRecruitJobRunner.ts)

可吸收点：

- 把长时任务和异步 job 从主线程职责里抽开
- 用协调器统一管理启动、恢复、状态汇报、停机

建议落地方向：

- `next` 后续如果补更多异步长任务，可以参考这种 runner / worker 协调器结构
- 重点不是照搬 worker 数量或实现，而是借鉴：
  - 任务边界
  - 协调器职责
  - 启停顺序

---

## 4. 数据库与持久化可吸收部分

### 4.1 更明确的真源可视化

参考文件：

- [参考/jiuzhou/server/prisma/schema.prisma](../参考/jiuzhou/server/prisma/schema.prisma)

可吸收点：

- 即使 `next` 继续使用 `persistent_documents`，也应该补一层“逻辑 schema 文档”
- 让每个 scope 的结构、版本、索引需求、读取方、写入方清晰可见

建议落地方向：

- 不一定引入 Prisma
- 但应该补：
  - `player snapshot` 逻辑结构说明
  - `player identity` 逻辑结构说明
  - `market/mail/suggestion/map` 的 scope 结构说明

### 4.2 备份与恢复职责前置

参考文件：

- [参考/jiuzhou/docker-stack.yml](../参考/jiuzhou/docker-stack.yml)

可吸收点：

- 备份不只是“有脚本可跑”，而应成为显式运维职责
- 数据库备份 worker、恢复窗口、回滚路径都应更前置

建议落地方向：

- `next` 继续保留现有 `gm-database-smoke` 和 destructive gate
- 同时补“常驻运维面”的：
  - 周期备份
  - 备份保留策略
  - 恢复检查脚本

---

## 5. 运维与部署可吸收部分

### 5.1 监控设施

参考文件：

- [参考/jiuzhou/ops/monitoring/README.md](../参考/jiuzhou/ops/monitoring/README.md)
- [参考/jiuzhou/docker-stack.yml](../参考/jiuzhou/docker-stack.yml)

可吸收点：

- Prometheus
- Grafana
- postgres-exporter
- 明确的数据库/服务指标面

建议落地方向：

- `next` 现在强在验证门禁，不强在持续监控
- 下一步最值得补的是：
  - world tick 耗时
  - sync flush 耗时
  - connected players
  - persistence flush 成功率
  - shadow 实例健康指标

### 5.2 更明确的镜像/部署脚本分工

参考文件：

- [参考/jiuzhou/docker-build.sh](../参考/jiuzhou/docker-build.sh)
- [参考/jiuzhou/server/Dockerfile](../参考/jiuzhou/server/Dockerfile)

可吸收点：

- 构建、推送、部署、回滚职责更清晰
- 镜像内启动前置动作更明确

建议落地方向：

- `next` 可以继续保留现在的 proof gate
- 但在部署层补：
  - 更清晰的镜像构建脚本
  - 更稳定的环境变量装配约定
  - 更清晰的 shadow / replace-ready 部署入口

---

## 6. 吸收优先级

### P0：最该马上吸收

1. battle realtime 归一化层
2. battle/session 长流程服务编排
3. deferred request 调度 helper
4. 监控设施补齐方案

### P1：适合中期吸收

1. startup pipeline 组织方式
2. presence 聚合 hook / service
3. 备份 worker 与恢复流程前置
4. 更明确的逻辑 schema 文档

### P2：只在需要时吸收

1. 更多 worker 协调器模式
2. 更完整的 deploy 脚本体系
3. 页面型组件/样式共享组织经验

---

## 7. 最终判断

`jiuzhou` 最值得 `next` 吸收的，不是主架构，而是“成熟工程外围”：

- battle/session 编排经验
- 一些前端辅助抽象
- startup pipeline
- 监控与部署设施
- 备份与恢复制度化

`next` 不应该吸收的，是那些会把自己重新拉回传统页面应用和巨型 socket 服务的部分。

正确做法应该是：

- 保留 `next` 的主骨架
- 吸收 `jiuzhou` 的成熟外围能力
- 让 `next` 变成“架构方向正确 + 工程外围成熟”的版本
