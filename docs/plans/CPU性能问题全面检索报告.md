# CPU 性能问题全面检索报告

> 目标口径：8 核 CPU / 16GB 内存 / 5000 并发玩家 / 10000 地图实例 / 1Hz tick
> 本文档汇总项目中已识别的 CPU 性能瓶颈、热路径问题和优化状态。

---

## 一、致命级（扩容硬阻塞）

### 1.1 实例 tick 全串行（S26）

- **文件**：`runtime/world/world-runtime-instance-tick-orchestration.service.ts`
- **现象**：所有 instance 在单 `for` 循环内串行 tick，无并行化
- **影响**：10000 实例 × 1Hz 串行 tick 总耗时远超 1s，世界推进直接停滞
- **当前状态**：已有 worker_threads 基础设施（Instance pool），但实例 tick 主循环仍为串行
- **关联计划**：`服务端与客户端多线程并行化改造计划.md`

### 1.2 单实例内存占用无预算约束（S81）

- **文件**：`runtime/instance/map-instance.runtime.ts`
- **现象**：100×100 地图 × 5 数组 ≈ 200KB/实例，10000 实例 ≈ 2GB 仅基础数组
- **影响**：超出 16GB 部署预算，间接导致 GC 压力和 CPU 开销
- **待确认**：chunk-based 按需分配 / 不活跃实例完全卸载 / 冷数据 lazy 加载

---

## 二、高优先级（性能显著影响）

### 2.1 protobuf 热路径 JSON.stringify（S77）

- **文件**：`packages/shared/src/network-protobuf-update-codecs.ts`
- **现象**：每 tick 协议组包路径用 `JSON.stringify` 序列化复杂字段（13 处），包括：
  - skills、layers、bodyTraining、autoUsePills、combatTargetingRules
  - bonuses、numericStatBreakdowns、6 种生活技能状态
- **影响**：5000 玩家 × 10+ 字段/tick = 5-10 万次 stringify/秒，GC 压力显著
- **待确认**：为每个字段设计真正的 protobuf message schema，还是先做增量 patch 降频

### 2.2 Buff remainingTicks 每 tick 递减触发全量重发

- **文件**：网络同步 buff delta 路径
- **现象**：`remainingTicks` 每 tick -1 导致 buff signature 变化，触发整个 buff 面板全量重发
- **影响**：5000 玩家 × 每 tick 全量 buff 重发（500-5KB），CPU 用于序列化和比较
- **方案**：客户端本地递减，仅 buff 新增/移除/stacks 变化时同步

### 2.3 cooldownLeft 每 tick 递减触发 action 面板全量重发

- **文件**：网络同步 action delta 路径
- **现象**：`cooldownLeft` 每 tick 递减触发全量 action entry 重发（含静态字段）
- **影响**：战斗中每 tick 重发所有技能条目，CPU 用于序列化
- **方案**：拆为独立轻量通道 `{actionId: remaining}`

### 2.4 lifeElapsedTicks 每 tick +1 触发 attr delta

- **文件**：网络同步 attr delta 路径
- **现象**：`lifeElapsedTicks` 每 tick +1 触发整个属性面板 delta 重发
- **影响**：5000 玩家每 tick 都触发 attr 面板序列化（含 bonuses、numericStatBreakdowns）
- **方案**：移出 attr 面板，客户端本地递增

### 2.5 A* 寻路无路径缓存（S99）

- **文件**：`runtime/world/world-runtime.path-planning.helpers.ts`
- **现象**：auto-combat 每 tick 重新规划路径，无缓存
- **影响**：1500 玩家 × 1Hz × A*(10000 cells) 单次 1-5ms，可能吃满一个核
- **当前状态**：encoding worker 已有 grid 缓存（按 mapId+revision），但路径结果本身无缓存
- **待确认**：路径缓存策略 / JPS 替代 / worker_threads 算路

---

## 三、中优先级（当前规模可控，扩容后成为瓶颈）

### 3.1 inventory 全部 Array.find() 线性扫描（S90）

- **文件**：`runtime/player/player-runtime.service.ts`（10+ 处）
- **现象**：5000 玩家 × 频繁背包操作，每秒数十万次 N=60 线性扫
- **影响**：N=60 在 V8 中约 1-5μs/次，当前阶段不紧急
- **待确认**：Map<signature, ItemEntry> 索引 / dirty bit 索引

### 3.2 持久化刷盘 CPU 开销

- **文件**：`persistence/player-domain-persistence.service.ts`、`instance-domain-persistence.service.ts`
- **现象**：历史上玩家刷盘 461-776ms，地图 316-348ms（已部分修复）
- **已完成优化**：
  - 删除无效 persistenceWorkerPool 预序列化
  - 地图 domain 批量写入（事务数从 ~40-50 降到个位数）
  - 高频 dirty 合并窗口（tile_damage/tile_resource 3-5s 合并）
  - PG pool 分级（runtime-critical / flush / outbox / gm-diagnostics）
- **剩余问题**：统一 flush task 模型、生产编排落地

### 3.3 同步组包路径重复遍历

- **文件**：`network/world-sync-*.service.ts` 系列
- **现象**：视野同步、minimap、威胁箭头等路径存在重复遍历和临时数组分配
- **已完成优化**（见性能优化清单）：
  - buildVisibleTileKeySet 去重复查询
  - diffThreatArrows 改为一次性索引 diff
  - buildLegacyTileRows 改为按行收集后一次 join
  - normalizePlayerIds 单次循环完成
  - 恢复队列改为二分插入

### 3.4 自动战斗目标选择重复遍历

- **文件**：`runtime/world/combat/world-runtime-auto-combat.service.ts`
- **已完成优化**：
  - 预计算怪物敌对关系并复用
  - 候选 metrics 改为单次累积
  - 技能选择改为一次构建索引

---

## 四、Worker Pool 并行化状态

### 4.1 已完成的 Worker 形态

| Pool | 职责 | 并发度 | 状态 |
|------|------|--------|------|
| Encoding (CPU) | protobuf encode / A* / FOV / fengshui | min(N_cpu-2, 6) | ✅ 默认启用 |
| Instance | 实例 tick 子阶段（monster AI intent） | 按 instanceId 哈希分片 | ✅ 默认启用 |
| Persistence | 持久化 write plan 构造 | 2 | ✅ 默认启用 |

### 4.2 Worker 已证明的收益

- 主线程 CPU 时间下降 ≥ 40%（bench 证明）
- encoding worker 复用 grid 缓存，同 map+revision 不重建
- 各 pool 维护 `activeWorkerCount` 常量计数，避免热路径数组扫描

### 4.3 Worker 剩余问题

- 实例 tick 主循环仍为串行 for 循环（worker 只处理 monster AI intent 预计算）
- persistence worker 输出已成为写库输入，但统一 flush task 模型未完成

---

## 五、网络同步 CPU 开销

### 5.1 当前编码现状

| 项目 | 状态 |
|------|------|
| 编码格式 | protobuf（已启用），部分字段仍用 JSON.stringify 塞入 wire string |
| 压缩 | 无 perMessageDeflate |
| 批量合并 | worldDelta/selfDelta/panelDelta 各自独立 emit |
| 增量机制 | WorldProjector 前帧缓存 + SyncSlot 脏检测 |
| Worker 编码 | Encoding pool 已启用 |

### 5.2 每 tick 触发不必要重发的字段

| 字段 | 触发原因 | CPU 影响 | 方案 |
|------|----------|----------|------|
| remainingTicks | 每 tick -1 | buff 全量重发 | 客户端本地递减 |
| cooldownLeft | 每 tick -1 | action 全量重发 | 独立轻量通道 |
| lifeElapsedTicks | 每 tick +1 | attr 全量重发 | 客户端本地递增 |
| realmProgress | 修炼中每 tick 变化 | attr delta 触发 | 降频或客户端预测 |
| exp (technique) | 修炼中每 tick 变化 | 整个 entry 重发 | 拆数值增量通道 |

---

## 六、启动期 CPU/IO 爆炸

### 6.1 导入存档后启动恢复 IO 爆炸（已修复）

- **现象**：普通 API 启动调用全量实例恢复，逐实例读取 14+ 分域数据
- **根因**：`rebuildPersistentRuntimeAfterRestore` 默认走全量恢复语义
- **修复**：普通启动走轻量恢复，显式导入/恢复路径保留全量能力

### 6.2 flush ledger 消费默认批量过大

- **现象**：默认 player/instance 各最多 claim 1024 条，并行度 16
- **修复**：生产友好默认值（小批量、低并发、可通过环境变量提高）

---

## 七、调度与反压

### 7.1 SchedulerManager 统一调度（已实现骨架）

- 统一管理 tick / flush / outbox / maintenance / manual 任务
- ExecutionGovernor 读取 flush pool waiting、lock wait、backlog、CPU
- 低优先级任务在高负载时自动降频
- GM 面板展示统一调度快照

### 7.2 服务运行角色拆分（已完成）

- `api` 角色：HTTP + Socket.IO + 权威 tick，不消费 flush
- `worker` 角色：flush + outbox + backup + cleanup，不监听 HTTP
- 生产 stack 已拆分为 `server(api)` + `server_worker(worker)`

---

## 八、已完成的性能优化汇总

### 8.1 网络同步层

- 视野同步去重复查询
- 威胁箭头 diff 改为索引 diff
- minimap 字符串分配优化
- 恢复队列二分插入
- 会话绑定快照单轮遍历

### 8.2 运行时层

- 自动战斗目标/技能选择索引化
- 实例恢复路径去无意义 map() 转换
- worker pool activeWorkerCount 常量计数
- encoding worker grid 缓存复用

### 8.3 持久化层

- 各分域写入去重复序列化（inventory/wallet/equipment/technique/buff/quest）
- 行签名复用避免双重 JSON.stringify
- 批量 JSON payload 预生成复用
- 实例分域保存去重复 map() 和序列化
- 邮件/市场清理路径 payload 复用
- durable 操作路径去重复序列化
- outbox topic prefix 规范化复用
- 玩家身份查找 helper 复用

---

## 九、优先级排序建议

| 优先级 | 问题 | 预期收益 | 复杂度 |
|--------|------|----------|--------|
| P0 | 实例 tick 并行化 | 解除扩容硬阻塞 | 高 |
| P0 | 每 tick 递减字段触发全量重发 | 降低 50%+ 同步 CPU | 中 |
| P1 | protobuf 热路径 JSON.stringify | 降低 GC 压力 | 中 |
| P1 | 单实例内存预算 | 解除内存硬阻塞 | 高 |
| P1 | A* 路径缓存 | 降低寻路 CPU | 低 |
| P2 | inventory 索引化 | 微优化 | 低 |
| P2 | 统一 flush task 模型 | 架构收敛 | 中 |
