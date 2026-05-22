# CPU 性能问题全面检索报告

> 目标口径：8 核 CPU / 16GB 内存 / 5000 并发玩家 / 10000 地图实例 / 1Hz tick
> 本文档汇总项目中已识别的 CPU 性能瓶颈、热路径问题和优化状态。
> 基于代码级深度分析，包含具体行号、调用频率估算和量化收益预期。

---

## 一、致命级（扩容硬阻塞）

### 1.1 实例 tick 主体仍串行 + 逐玩家隔离调用（S26）

- **文件**：`runtime/world/world-runtime-instance-tick-orchestration.service.ts`
- **现象**：Instance Worker Pool 已启用（min(N_cpu-2, 6) 个 worker），但**只卸载了怪物 AI intent 预计算**（`precomputeInstanceWorkerIntents` 通过 `Promise.all` 并行提交）。实例 tick 的主体逻辑（`tickOnce`、玩家推进、建筑、阵法、资源流、临时地块等 80%+ 工作量）仍在主线程的串行 `for` 循环中执行。
- **影响**：10000 实例 × 1Hz 串行 tick 主体耗时可能超 1s，世界推进停滞

**深度分析 — 每 tick 临时对象分配约 38.5 万个**：

| 阶段 | 操作次数/tick | 临时对象/tick | 瓶颈描述 |
|------|-------------|-------------|---------|
| reconcileDefeatedPlayers | 10000+5000 | ~0 | 全量扫描所有实例所有玩家，绝大多数 hp>0 无效遍历 |
| 实例规划循环 | 10000 | ~40000 | 每次 `runIsolatedSyncOperation` 创建 `{instanceId, worldTick}` 对象 |
| worker 镜像构建 | ~2000×5怪 | ~10000 | `buildInstanceWorkerMirror` 对每怪物 spread cooldown |
| 实例 tickOnce | 10000 | ~30000 | 每次创建 transfers[]、monsterActions[]、返回对象 |
| advanceMonsters | 50000 | ~200000 | `buildEffectiveMonsterSkillGeometry` 每怪每技能创建几何对象 |
| 玩家子阶段(7×逐个) | 5000×7 | ~70000 | 7 个 for 循环逐玩家 try-catch + 闭包 + details 对象 |
| advanceSinglePlayerTick | 5000 | ~25000 | buff filter 临时数组 + options 对象 |
| quest refresh | 5000 | ~10000 | 逐个玩家隔离调用 |
| **合计** | — | **~385000** | — |

**关键代码热点**（L384-442）：
```typescript
// 当前：7 个 for 循环逐玩家隔离调用
for (const playerId of currentPlayerIds) {
  this.runIsolatedSyncOperation(deps, 'player_world_time_vision', {
    instanceId, playerId, instanceTick, worldTick  // ← 每玩家创建对象
  }, () => syncWorldTimeVisionForPlayers(instance, [playerId], ...));  // ← 单元素数组
}
// 重复 7 次：vision, aura, tick_advance, qi_drain, skill_cast, craft_jobs, quest
```

**优化方案**：
1. 合并为单次批量调用（减少 35000 临时对象 + 35000 闭包/tick）
2. `runIsolatedSyncOperation` 的 details 改为惰性构建（仅异常时创建）
3. `reconcileDefeatedPlayers` 改为增量 Set（从 O(15000) 降为 O(defeated_count)）
4. `tickOnce` 返回值预分配复用

### 1.2 单实例内存占用无预算约束（S81）

- **文件**：`runtime/instance/map-instance.runtime.ts`
- **现象**：100×100 地图 × 5 数组 ≈ 200KB/实例，10000 实例 ≈ 2GB 仅基础数组
- **影响**：超出 16GB 部署预算，间接导致 GC 压力和 CPU 开销
- **待确认**：chunk-based 按需分配 / 不活跃实例完全卸载 / 冷数据 lazy 加载

### 1.3 寻路 TypedArray 每次分配（致命 GC 压力）

- **文件**：`runtime/world/world-runtime.path-planning.helpers.ts` L388-393
- **现象**：每次 A* 调用分配 `Float64Array(size) + Int32Array(size)`
- **影响**：50×50 地图每次 30KB，4000 次/tick = **120MB 临时内存分配/秒**
- **方案**：按地图尺寸预分配 buffer pool，tick 间复用

---

## 二、高优先级（性能显著影响）

### 2.1 A* 寻路系统 — 主线程 CPU 超预算

**综合耗时估算**：

| 调用来源 | 次数/tick | 单次耗时 | 总耗时/tick |
|----------|-----------|----------|------------|
| 自动战斗寻路 | 3000 | 0.3ms | 900ms |
| 导航寻路 | 1000 | 0.3ms | 300ms |
| **合计** | 4000 | — | **1200ms** |

**远超 1Hz 的 1000ms 预算。**

**关键问题**：
1. 每次调用分配 Float64Array + Int32Array（120MB/s GC 压力）
2. 导航每 tick 重新规划完整路径（玩家每移动一格就重规划）
3. 自动战斗只需下一步方向，却计算完整路径
4. 主线程仍直接调用 `findOptimalPathOnMap`，未统一走 worker
5. 同一实例内多个玩家重复构建 blockMask

**优化方案**：
1. TypedArray 池化（预分配按地图尺寸的 buffer pool）
2. 导航路径缓存 + 逐步消费（目标/障碍变化时才重规划）
3. 自动战斗改为深度限制 BFS（只算 1 步方向）
4. 统一走 Worker 寻路（主线程不再直接调用 A*）
5. blockMask 实例级缓存（同 tick 同实例共享）

### 2.2 网络同步 — stableShallowSignature 字符串拼接

- **文件**：`network/world-projector.helpers.ts`
- **现象**：面板 diff 使用递归字符串拼接生成 signature
- **调用频率**：5000 玩家 × (50 物品 + 5 装备 + 20 技能 + 10 buff) = 42.5 万次递归拼接/tick
- **影响**：大量中间字符串分配，`Object.keys().sort()` 每次创建新数组
- **方案**：用数值 hash（FNV-1a/xxHash）替代字符串 signature
- **预期收益**：15-25% panel diff 时间，显著降低 GC 压力

### 2.3 每 tick 递减字段触发全量重发

| 字段 | 触发原因 | CPU 影响 | 方案 |
|------|----------|----------|------|
| remainingTicks | 每 tick -1 | buff 全量重发（500-5KB × 5000人） | 客户端本地递减 |
| cooldownLeft | 每 tick -1 | action 全量重发（含静态字段） | 独立轻量通道 |
| lifeElapsedTicks | 每 tick +1 | attr 全量重发（含 bonuses/breakdowns） | 客户端本地递增 |
| realmProgress | 修炼中每 tick 变化 | attr delta 触发 | 降频或客户端预测 |
| exp (technique) | 修炼中每 tick 变化 | 整个 entry 重发（含 skills/layers） | 拆数值增量通道 |

### 2.4 protobuf 热路径 JSON.stringify（S77）

- **文件**：`packages/shared/src/network-protobuf-update-codecs.ts`（13 处）、`network-protobuf-tick-codecs.ts`（2 处）
- **update codecs 频率**：战斗中 ~1500 玩家/tick 触发属性变化 → 1500 × 8 字段 = 12000 次 stringify
- **tick codecs 频率**：5000 玩家 × 20 可见实体 × 30% 有 buffs = 30000 次 `JSON.stringify(buffs)`
- **总计**：~42000 次 JSON.stringify/tick
- **方案**：显式字段编码 + 内容 hash 缓存（不变时复用上次结果）
- **预期收益**：10-15% tick 编码时间

### 2.5 自动战斗每 tick 重建视野和技能表

- **文件**：`runtime/world/combat/world-runtime-auto-combat.service.ts`
- **现象**：
  - 每玩家每 tick 调用 `buildPlayerView` 重建视野（遍历实例内所有实体）
  - 每玩家每 tick 调用 `buildAutoBattleSkillLookup` 重建 Map
  - `collectThreatTargetCandidates` 重复构建 Map/Set
- **频率**：3000 autoBattle 玩家 × 30 怪物/实例 = 9 万次距离计算/tick
- **方案**：
  - skillLookup 缓存在 player 对象上（装备/学习变更时失效）
  - 视野增量更新（脏标记 + 增量）
  - 路径缓存（目标未移动时复用上一 tick 路径）

---

## 三、中优先级（当前规模可控，扩容后成为瓶颈）

### 3.1 怪物 AI — 20 万怪物/tick

- **文件**：`runtime/instance/map-instance.runtime.ts` L5235-5409
- **现象**：10000 实例 × 平均 20 怪物 = 200000 怪物/tick
- **热点**：
  - `chooseMonsterSkill` 内部 `buildEffectiveMonsterSkillGeometry` 每怪每技能创建几何对象
  - 50000 怪物 × 3 技能 = 150000 次几何对象分配
  - `new Map(precomputedIntents.map(...))` 每实例一次
- **方案**：
  - 怪物技能几何缓存（属性不变时几何不变）
  - 非 aggro 怪物降频到 0.5Hz
  - intentByMonsterId 在编排层预构建传入

### 3.2 网络同步 — buildCoordKey 字符串分配

- **文件**：`network/world-sync-map-snapshot.service.ts`
- **现象**：视野 11×11=121 格 × 5000 玩家 = 605000 次 `${x},${y}` 模板字符串/tick
- **方案**：改为数值编码 `x * 10000 + y`，用 `Map<number, T>` 替代 `Map<string, T>`
- **预期收益**：8-12% aux sync 时间

### 3.3 网络同步 — 威胁箭头/小地图临时集合

- **文件**：`network/world-sync-threat.service.ts`、`world-sync-minimap.service.ts`
- **现象**：5000 × 3 Set + 5000 × 2 Map = 25000 临时集合/tick
- **方案**：复用 Set/Map 实例（clear 后重用）；无战斗玩家快速跳过
- **预期收益**：5-8% aux sync 时间

### 3.4 持久化层 — 冗余 stringify+parse 深拷贝

- **文件**：`persistence/instance-domain-persistence.service.ts` L4400-4434
- **现象**：`normalizePersistedItemPayload` 使用 `JSON.stringify + JSON.parse` 做深拷贝
- **频率**：~200 次/s（仅脏实例 flush 时）
- **方案**：替换为 `structuredClone` 或浅层 spread
- **预期收益**：5-10ms/s

### 3.5 持久化层 — isSamePersistedPayload 双重 stringify

- **文件**：`persistence/player-domain-persistence.service.ts` L3801
- **现象**：`JSON.stringify(left) === JSON.stringify(right)` 用于装备/物品去重
- **频率**：5000 玩家 × 8 装备槽 = 最多 40000 次/flush 周期
- **方案**：递归浅比较或 hash 签名缓存

### 3.6 inventory 全部 Array.find() 线性扫描（S90）

- **文件**：`runtime/player/player-runtime.service.ts`（10+ 处）
- **现象**：5000 玩家 × 频繁背包操作，每秒数十万次 N=60 线性扫
- **影响**：N=60 在 V8 中约 1-5μs/次，当前阶段不紧急

### 3.7 resolveEffectiveTickIntervalMs 全量扫描

- **文件**：`runtime/tick/world-tick.service.ts` L116-133
- **现象**：每次调度前遍历 10000 实例查找最大 tickSpeed
- **方案**：维护 `maxTickSpeed` 缓存，仅在实例 tickSpeed 变更时更新
- **预期收益**：~0.5ms/tick（绝对值小）

### 3.8 tickTemporaryBuffs 中的 filter 临时数组

- **文件**：`runtime/player/player-runtime.service.ts` L7266/7305
- **现象**：5000 玩家 × 2 次 `buffs.filter(...)` = 10000 临时数组/tick
- **方案**：改为 for 循环 in-place 压缩

---

## 四、客户端渲染 CPU 问题

### 4.1 renderWorld — 全量重绘（最大热点）

- **文件**：`renderer/text.ts` L1104-1298
- **现象**：每帧对所有可见格子（~300）执行完整绘制，无脏区域检测
- **每帧 Canvas 调用**：drawImage ~300 + fillRect ~300-600 + strokeRect ~50-200 = 650-1100 次
- **GC 压力**：`${gx},${gy}` 字符串拼接 300 格 × 60fps = 18000 临时字符串/秒
- **方案**：
  - 脏区域检测（场景静止时跳过渲染）
  - 分层 Canvas（静态地块层 + 动态实体层 + 特效层）
  - 坐标 key 改为数值编码

### 4.2 renderEntities — 每帧排序 + 临时对象

- **文件**：`renderer/text.ts` L1578-1800+
- **现象**：
  - 每帧对 50 实体排序（O(n log n)）
  - 每实体 2-3 次 `ctx.save()/restore()`
  - 每实体创建 `RenderedAnimEntity` 临时对象
- **方案**：实体列表变化时才排序（dirty flag）；对象池化

### 4.3 浮动文字 — 每帧重建分组 Map

- **文件**：`renderer/text.ts` L2435-2569
- **现象**：每帧创建 2 个 Map + N 个字符串键 + 排序，战斗密集时 256 条
- **方案**：只在 floatingTexts 数组变化时重建分组

### 4.4 MapStore — cloneJson 全量深拷贝

- **文件**：`game-map/store/`
- **现象**：
  - `mergeTickEntities` 每 tick 对所有已知实体执行深拷贝（即使未变化）
  - `rebuildRenderTileCache` 对整个地图浅拷贝重建
- **方案**：只克隆有 patch 的实体；renderTileCache 增量更新

### 4.5 伪 protobuf 解码

- **文件**：`shared/network-protobuf.ts`
- **现象**：当前"protobuf"实际是 UTF-8 编码的 JSON 字符串，解码路径为 Binary → decodeUtf8 → JSON.parse
- **影响**：WorldDelta 包体含 20-50 实体 patch，每 tick 完整 JSON.parse
- **方案**：长期改为真正的 protobuf schema

---

## 五、Worker Pool 并行化状态

### 5.1 已完成的 Worker 形态

| Pool | 职责 | 并发度 | 状态 |
|------|------|--------|------|
| Encoding (CPU) | protobuf encode / A* / FOV / fengshui | min(N_cpu-2, 6) | ✅ 默认启用 |
| Instance | 实例 tick 子阶段（monster AI intent） | 按 instanceId 哈希分片 | ✅ 默认启用 |
| Persistence | 持久化 write plan 构造 | 2 | ✅ 默认启用 |

### 5.2 Worker 剩余问题

- Instance Worker 只卸载了怪物 AI intent 预计算（`precomputeInstanceWorkerIntents`），实例 tick 主体（`tickOnce`、玩家推进、建筑、阵法等）仍在主线程串行 for 循环
- 主线程仍直接调用 `findOptimalPathOnMap`，未统一走 encoding worker
- persistence worker 只有 2 个，5000 玩家场景可能不够（建议扩到 4）
- postMessage 结构化克隆是隐式开销，大型 AOI payload 应考虑 transferable

---

## 六、启动期 CPU/IO 爆炸

### 6.1 导入存档后启动恢复 IO 爆炸（已修复）

- **根因**：`rebuildPersistentRuntimeAfterRestore` 默认走全量恢复语义
- **修复**：普通启动走轻量恢复，显式导入/恢复路径保留全量能力

### 6.2 flush ledger 消费默认批量过大（已修复）

- **修复**：生产友好默认值（小批量、低并发、可通过环境变量提高）

---

## 七、调度与反压

### 7.1 SchedulerManager 统一调度（已实现骨架）

- 统一管理 tick / flush / outbox / maintenance / manual 任务
- ExecutionGovernor 读取 flush pool waiting、lock wait、backlog、CPU
- 低优先级任务在高负载时自动降频

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
- 各分域写入去重复序列化
- 行签名复用避免双重 JSON.stringify
- 批量 JSON payload 预生成复用
- 实例分域保存去重复 map() 和序列化

---

## 九、综合 CPU 预算分析

### 9.1 服务端主线程每 tick 耗时估算（5000 玩家 / 10000 实例）

| 系统 | 耗时估算 | 占比 |
|------|----------|------|
| 自动战斗寻路（A*） | 900ms | 38% |
| 怪物 AI tickOnce（主线程串行部分） | 1000ms | 42% |
| 导航寻路 | 300ms | 13% |
| 自动战斗目标选择 | 150ms | 6% |
| 网络同步 flushConnectedPlayers | 200-400ms | 12% |
| 玩家子阶段推进 | 100-200ms | 6% |
| **合计（无优化）** | **~2650-2950ms** | **远超 1000ms 预算** |

> 注：怪物 AI intent 预计算已通过 Instance Worker Pool 并行卸载（`Promise.all`），但 `tickOnce` 内部的怪物行动应用、buff tick、hp/qi 恢复、技能选择仍在主线程串行执行。寻路也部分走 Encoding Worker，但自动战斗和导航的主线程直接调用仍存在。

### 9.2 GC 压力估算

| 来源 | 临时对象/tick | 内存/tick |
|------|-------------|-----------|
| tick 编排 details/闭包 | ~110000 | ~5MB |
| 怪物技能几何 | ~150000 | ~10MB |
| 寻路 TypedArray | ~4000 | ~120MB |
| 网络同步 signature | ~425000 | ~20MB |
| 网络同步 coord key | ~605000 | ~15MB |
| **合计** | **~1.3M 对象** | **~170MB** |

V8 在此压力下预计每 2-3 tick 触发 minor GC（2-5ms），每 30-60s 触发 major GC（50-200ms 暂停）。

### 9.3 客户端每帧耗时估算（60fps，16ms 预算）

| 模块 | 耗时估算 | 占比 |
|------|----------|------|
| renderWorld（地块） | 4-8ms | 40% |
| renderEntities（实体） | 1-3ms | 15% |
| renderFloatingTexts | 0.5-2ms | 8% |
| MapStore tick 处理 | 1-3ms (1Hz) | 10% |
| 网络解码 | 0.5-2ms (1Hz) | 8% |
| **合计** | **7-18ms** | **移动端可能超预算** |

---

## 十、优先级排序（按收益/复杂度比）

### P0 — 必须修复（解除扩容硬阻塞）

| # | 问题 | 预期收益 | 复杂度 |
|---|------|----------|--------|
| 1 | 寻路 TypedArray 池化 + 统一走 Worker | 消除 120MB/s GC + 主线程减 1200ms | 中 |
| 2 | 导航路径缓存（不每 tick 重规划） | 主线程减 300ms | 低 |
| 3 | 自动战斗改深度限制 BFS（只算 1 步） | 主线程减 900ms | 中 |
| 4 | 每 tick 递减字段改客户端本地递减 | 降低 50%+ 同步 CPU | 中 |
| 5 | 逐玩家隔离调用合并为批量 | 减少 35000 闭包 + 35000 对象/tick | 中 |

### P1 — 重要优化（20-40% 性能提升）

| # | 问题 | 预期收益 | 复杂度 |
|---|------|----------|--------|
| 6 | stableShallowSignature 改数值 hash | 15-25% panel diff 时间 | 中 |
| 7 | buildCoordKey 改数值编码 | 8-12% aux sync 时间 | 低 |
| 8 | tick codec JSON.stringify(buffs) 改显式编码 | 10-15% tick 编码 | 中 |
| 9 | 怪物技能几何缓存 | 减少 150000 临时对象/tick | 低 |
| 10 | reconcileDefeatedPlayers 改增量 Set | 从 O(15000) 降为 O(<50) | 低 |
| 11 | runIsolatedSyncOperation details 惰性构建 | 减少 40000 临时对象/tick | 低 |
| 12 | 客户端脏区域检测 + 分层 Canvas | 移动端帧率翻倍 | 高 |

### P2 — 锦上添花

| # | 问题 | 预期收益 | 复杂度 |
|---|------|----------|--------|
| 13 | 威胁/minimap 临时 Set/Map 复用 | 5-8% aux sync | 低 |
| 14 | update codec JSON.stringify 改显式编码 | 5-8% 编码 | 中 |
| 15 | 持久化 normalizePersistedItemPayload 去冗余 | 5-10ms/s | 低 |
| 16 | tickOnce 返回值预分配 | 减少 30000 数组/tick | 低 |
| 17 | tickTemporaryBuffs 消除 filter | 减少 10000 临时数组/tick | 低 |
| 18 | 非 aggro 怪物降频到 0.5Hz | 减少 50% 怪物 AI 开销 | 低 |
| 19 | persistence worker 扩容到 4 | 减少 fallback 回主线程 | 低 |
| 20 | 客户端实体排序缓存 + 对象池 | 减少每帧临时对象 | 低 |

---

## 十一、关联计划文档

- `docs/plans/服务端与客户端多线程并行化改造计划.md` — Worker pool 架构
- `docs/plans/持久化刷盘并行化根修计划.md` — flush 慢刷盘根修
- `docs/plans/商业级持久化刷盘管线改造计划.md` — flush 管线容量
- `docs/plans/服务运行角色与独立Worker改造计划.md` — api/worker 拆分
- `docs/plans/SchedulerManager设计文档.md` — 统一调度器
- `docs/plans/S2C网络包体全面分析报告.md` — 网络包体优化
- `docs/plans/性能优化清单.md` — 已完成微优化清单
- `docs/architecture/0002-tick-model.md` — tick 调度模型
- `docs/architecture/0005-aoi-system.md` — AOI 系统
- `docs/runbook/worker-pool.md` — Worker pool 运维手册
