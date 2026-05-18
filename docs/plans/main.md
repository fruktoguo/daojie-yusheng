# 生产主线维护任务计划

更新时间：2026-05-10

这份文档是当前生产主线总索引。

使用规则：

- `[ ]` 代表未完成
- `[x]` 代表已完成
- 如果某项不做了，直接删掉，不保留僵尸任务

---

## 已完成里程碑（归档）

以下里程碑已全部完成，详细历史记录见 [archive/](../archive/)：

---

## 当前进行中

### 1. server TS 类型补强

- [x] `.js` 真源清零
- [x] `env-alias.js` 兼容壳移除
- [ ] 逐步去掉迁移期 `// @ts-nocheck` 并补强类型约束

### 2. 后续专项通用化规划

对应专题文档：

- [12 气机资源统一化规划](./12-qi-resource-unification.md)
- [13 敌我判定规则统一化规划](./13-combat-relation-rules-unification.md)
- [14 技艺活动框架统一化规划](./14-technique-activity-framework.md)
- [15 地图地块特征统一化规划](./15-map-tile-feature-unification.md)

执行顺序：

- [ ] 先把 `qi / craft-skill / craft-duration / craft-success` 这类 shared 纯函数合同固定下来
- [ ] 再收口手动技能 / 普攻 / 自动战斗的统一敌我关系判定
- [ ] 再把地块单值 `aura` 升成通用 tile resource runtime
- [ ] 最后把炼丹 / 强化 / 采集收口为统一技艺活动框架

### 3. P0 潜在问题已修复项

来源：`docs/plans/服务端潜在问题清单.md` 全面审计

- [x] S9 — login 候选串行 verifyPassword → 改为 Promise.all 并行验证（2026-05-10）
- [x] S16 — outbox 死信迁移分两步可丢消息 → 合并为单事务 RETURNING（2026-05-10）
- [x] S19 — 战斗审计内存队列溢出无日志 → 添加溢出计数 + 限频 warn（2026-05-10）
- [x] S93 — tick-dispatch catch{} 吞错 → 添加 TypeError/ReferenceError 日志（2026-05-10）
- [x] S96 — 生产代码无 unhandledRejection handler → 已有（确认）
- [x] S94（部分）— runtime 服务 catch{} 吞错 → 关键路径添加日志（2026-05-10）
- [x] S6 — tick shutdown 等待无超时 → 已有 5s deadline（确认）
- [x] S7 — setInterval 跳帧不暴露 → 已改为递归 setTimeout + 跳帧检测（确认）
- [x] S8 — tick 异常不影响 readiness → 添加 consecutiveTickFailures + isTickHealthy()（2026-05-19）
- [x] S10 — bcrypt compareSync 阻塞 → 改为异步 compare（2026-05-10）
- [x] S28 — runtimeOwnerId Math.random → crypto.randomBytes（2026-05-19）
- [x] S38 — leaseToken Math.random → crypto.randomBytes（2026-05-19）
- [x] S56 — main.ts 缺 graceful shutdown timeout → 添加 15s SIGTERM 超时兜底（2026-05-19）
- [x] S102 — 备份文件权限 → 已有 mode: 0o600（确认）

### 4. P0 潜在问题待确认修复项

来源：`docs/plans/服务端潜在问题清单.md` 全面审计

#### S26 — instance tick 全串行（10000 实例 1Hz 不可能收敛）

- 文件：`runtime/world/world-runtime-instance-tick-orchestration.service.ts:69-133`
- 现状：所有 instance 在单 for 循环内串行 tick，无并行化
- 需确认：并行化方案选择（Promise.all 分桶 / worker_threads / SharedArrayBuffer）
- 关联计划：[服务端与客户端多线程并行化改造计划](./服务端与客户端多线程并行化改造计划.md)
- 影响程度：**致命** — 当前实例数 < 100 时无感，但按目标 10000 实例计算，串行 tick 总耗时远超 1s 间隔，世界推进直接停滞。是扩容到目标并发的硬性阻塞。
- [ ] 确认并行化方案并启动实施

#### S65 — creditWallet/debitWallet 内存路径绕过 durable fence

- 文件：`runtime/player/player-runtime.service.ts:1122-1177`
- 现状：钱包变更仅操作内存 + markDirty，依赖异步 flush，崩溃时丢失
- 需确认：是否将钱包变更纳入 DurableOperationService，还是接受当前 flush 间隔风险
- 影响程度：**中等** — flush 间隔 5s 内崩溃会丢失灵石变更。单服稳定运行时概率低，但 docker 更新/OOM kill 时必然触发。影响范围：最近 5s 内有灵石变动的玩家（通常 < 50 人）。
- [ ] 确认钱包 durable 改造范围

#### S76 — PvP/Combat 完全不走 DurableOperationService，战斗结算无事务

- 文件：`runtime/combat/` 和 `runtime/world/combat/` 全部文件（0 处 DurableOperation 引用）
- 现状：PvP 杀人奖励、掉落、计数器全走内存 fire-and-forget
- 需确认：DurableOperation 改造范围（仅 PvP 死亡链路 / 全部战斗结算 / 仅资产变更部分）
- 关联计划：[战斗链路商业化重构计划](./战斗链路商业化重构计划.md)
- 影响程度：**高** — PvP 死亡是玩家最敏感场景，崩溃时"杀了人但奖励没到"或"死了但对方没扣血"会引发严重投诉。PvE 战斗影响较小（怪物重刷即可）。当前阶段 PvP 活跃度低时风险可控，上线运营后必须解决。
- [ ] 确认战斗 durable 改造范围

#### S64 — 战斗/强化/灵根/掉落全用 Math.random 无 seed PRNG

- 关键文件：craft-panel-runtime.service.ts、player-progression.service.ts、map-instance.runtime.ts、world-runtime-loot-container.service.ts
- 现状：所有随机判定直接 Math.random()，不可重放、不可审计
- 需确认：seed 来源（per-tick seed / per-operation seed）、审计格式、是否需要回放能力
- 影响程度：**低（功能正确，运营风险）** — 不影响游戏正确性，但玩家投诉"强化概率不对"时无法举证回放。对于商业运营是合规风险而非技术风险。可延后到正式运营前处理。
- [ ] 确认 seeded PRNG 方案

#### S100 — GM /server/restart 接口可触发自杀，无 audit/二次确认

- 文件：`http/native/native-gm.controller.ts:1108-1129`
- 现状：单次 POST 即触发 SIGTERM，无 audit log、无二次确认、无速率限制
- 需确认：是否接入 GmAuditLogPersistenceService + 二次确认 token 机制
- 影响程度：**中等** — GM 密码泄漏或 XSS 时攻击者可反复重启服务器造成 DoS。当前 GM 接口仅内网暴露时风险可控，公网暴露时为高危。
- [ ] 确认 restart 接口安全加固方案

#### S67 — GM 接口缺统一 audit log（部分已有）

- 文件：`http/native/native-gm.controller.ts`、`native-gm-world.service.ts` 等
- 现状：GmAuditLogPersistenceService 已存在且 native-gm-player.service 已接入，但其他 GM 接口（restart/ban/flush/backup/restore）未接入
- 需确认：哪些 GM 操作必须接入 audit log，是否需要统一 interceptor
- 影响程度：**低（运维风险）** — 不影响玩家体验，但出事后无法追溯"谁在什么时候做了什么"。多人 GM 团队时风险上升。
- [ ] 确认 GM audit log 全面接入范围

#### S92 — PlayerDomainPersistence 多 domain 各自独立事务

- 文件：`persistence/player-domain-persistence.service.ts`（32 处 savePlayerXxxDomain）
- 现状：每个域独立事务，同 cycle 部分失败导致状态分裂
- 需确认：是否改为 flushPlayer 单事务（性能影响）/ 按 domain group 分批事务 / 失败重试策略
- 影响程度：**中等** — DB 瞬断时触发，概率低但后果严重（玩家"花钱没东西"）。当前 PG 稳定运行时几乎不触发，但扩容/维护窗口期风险上升。改造工作量大（32 处），需要性能基准验证。
- [ ] 确认 flush 事务化方案

### 5. P1 潜在问题待确认修复项

来源：`docs/plans/服务端潜在问题清单.md` 全面审计

#### S77 — protobuf 热路径 13 处 JSON.stringify

- 文件：`packages/shared/src/network-protobuf-update-codecs.ts`、`network-protobuf-tick-codecs.ts`
- 现状：每 tick 协议组包路径用 JSON.stringify 序列化复杂字段塞入 wire string 字段（skills、layers、buffs、bonuses 等）
- 违反 §12 红线：tick 热路径禁止 JSON.stringify
- 需确认：为每个字段设计真正的 protobuf message schema，还是先做增量 patch 降频
- 影响程度：**高（性能）** — 5000 玩家 × 10+ 字段/tick = 5-10 万次 stringify/秒，GC 压力显著。是当前 tick 耗时的主要贡献者之一。但改造涉及前后端协议同步变更，工作量大。
- [ ] 确认 protobuf schema 改造范围和优先级

#### S81 — map-instance 单实例内存占用未受预算约束

- 文件：`runtime/instance/map-instance.runtime.ts`
- 现状：100×100 地图 × 5 数组 ≈ 200KB/实例，10000 实例 ≈ 2GB 仅基础数组
- 需确认：chunk-based 按需分配 / 不活跃实例完全卸载 / 冷数据 lazy 加载
- 影响程度：**高（内存）** — 按目标 10000 实例计算，仅基础数组 2GB + Map/Set 开销可达 5-10GB，超出 16GB 部署预算的 1/3-2/3。当前实例数 < 200 时无感（< 100MB）。是扩容的硬性阻塞之一。
- [ ] 确认实例内存预算方案

#### S86 — 服务端不连 Redis，与 AGENTS.md §2 描述不符

- 文件：生产代码 0 处 Redis 连接，docker-stack 启动 Redis 容器空跑
- 现状：在线态/session fencing 全用 PG advisory lock 兜底
- 需确认：补上 Redis（在线态镜像 + session 路由缓存 + lease）还是裁剪（移除 Redis 容器 + 更新文档）
- 影响程度：**低（当前单节点）** — 单节点部署时 PG advisory lock 完全够用。多节点扩展时才成为瓶颈。Redis 容器空跑仅浪费约 50MB 内存。建议先裁剪文档消除误导，多节点时再补。
- [ ] 确认 Redis 策略方向

#### S99 — A* 寻路无路径缓存，auto-combat 每 tick 重新规划

- 文件：`runtime/world/world-runtime.path-planning.helpers.ts`、`runtime/world/combat/world-runtime-auto-combat.service.ts`
- 现状：1500 玩家 × 1Hz × A*(10000 cells) 单次 1-5ms，可能吃满一个核
- 需确认：路径缓存策略（位置/目标/地图版本未变时复用）/ JPS 替代 / worker_threads 算路
- 影响程度：**中等（性能）** — 当前玩家数 < 100 时无感（< 100ms/tick）。1500+ 开 auto-combat 时可能占满单核。但实际地图多为小图（30×30），A* 成本远低于 10000 cells 的理论值。建议压测后按需优化。
- [ ] 确认寻路优化方案

#### S90 — inventory 全部 Array.find() 线性扫描

- 文件：`runtime/player/player-runtime.service.ts`（10+ 处 O(N) 线性扫）
- 现状：5000 玩家 × 频繁背包操作，每秒数十万次 N=60 线性扫
- 需确认：维护 Map<signature, ItemEntry> 索引 / immutable structure / dirty bit 索引
- 影响程度：**低（当前规模）** — N=60 的线性扫描在 V8 中约 1-5μs/次，5000 玩家 × 1 次/秒 ≈ 5-25ms/秒总 CPU（< 3% 单核）。背包扩容到 200+ 或高频批量操作时才成为瓶颈。当前阶段不紧急，压测暴露后再优化。
- [ ] 确认 inventory 索引化方案

### 6. 客户端/shared 扫描结果（P1/P2）

来源：2026-05-19 全面扫描

- [ ] GmMapEditor 异步方法 `.catch(() => {})` 吞网络错误，用户无反馈（P1）— 影响：GM 操作失败时无提示，需手动刷新才能发现
- [ ] MarketAuctionView 通过 `as any` 访问 tradeDialogView，运行时崩溃风险（P1）— 影响：重构面板时编译不报错但运行时白屏
- [ ] GmMapEditor 无 dispose，window 事件监听器永不移除（P2）— 影响：当前单例使用无泄漏，仅代码规范问题
- [ ] MarketBrowseView/CraftWorkbenchModal 多处 `as any` 绕过类型检查（P2）— 影响：同上，重构时的隐患
- [ ] localStorage 写入 catch{} 静默失败，强化历史丢失无提示（P2）— 影响：隐私模式下强化历史不保存，用户无感知
- shared 层代码质量良好，无 P0/P1 问题
