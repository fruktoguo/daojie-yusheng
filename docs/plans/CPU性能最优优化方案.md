# CPU 性能最优优化方案

> 基于三轮代码级验证的精确事实，针对当前架构给出最优优化路径。
> 当前实际规模：~247 实例 / 少量玩家，tick 耗时约 5-22ms（预算利用率 2.5-11%）。
> 目标规模：5000 并发玩家 / 10000 地图实例 / 8 核 16GB / 1Hz tick。

---

## 开发任务表

### 第一阶段：零风险高收益（改动 <100 行，1-2 天）

- [ ] **T-01** 移除 `lifeElapsedTicks` 从 `buildAttrPanelSignature`
  - 文件：`packages/server/src/network/world-projector.helpers.ts` L794
  - 改动：从 signature 数组中删除 `player.lifeElapsedTicks`
  - 改动：`canReuseAttrPanelSlice()` 移除 lifeElapsedTicks 比较
  - 客户端：`main-panel-delta-state-source.ts` 首包接收基准值，用 `getEstimatedServerTick()` 本地递增
  - 验证：`pnpm verify:quick` + `pnpm verify:client`
  - 预期：消除所有玩家每 tick 必发 attr delta

- [ ] **T-02** 移除 `remainingTicks` 从 `buildBuffListSignature`
  - 文件：`packages/server/src/network/world-projector.helpers.ts` L890
  - 改动：从 buff signature 中删除 `entry.remainingTicks`
  - 改动：`buildBuffEntrySignatures` 中排除 remainingTicks 字段
  - 客户端：首次下发 buff 时带 remainingTicks + envelope tick，本地递减
  - 验证：`pnpm verify:quick` + `pnpm verify:client`
  - 预期：有 buff 玩家不再每 tick 发送 buff delta

- [ ] **T-03** 修复 `resolveMonsterTargetWithHint` 使用 worker intent
  - 文件：`packages/server/src/runtime/instance/map-instance.runtime.ts` L6138-6140
  - 改动：idle hint + 无锁定目标 → 跳过全量扫描（保留 decayMonsterThreats）
  - 改动：attack hint + 目标仍有效 → 跳过全量遍历
  - 改动：hint 失效 → fallback 完整 resolveMonsterTarget
  - 验证：`pnpm verify:quick` + 现有 monster smoke
  - 预期：大多数 idle 怪物 O(1) 返回 null，跳过 shadowcasting

---

### 第二阶段：中等改动高收益（100-300 行，3-5 天）

- [ ] **T-04** 无玩家实例降频 tick
  - 文件：`packages/server/src/runtime/world/world-runtime-instance-tick-orchestration.service.ts`
  - 改动：`advanceFrame` 构建 instanceStepPlans 时检查 `instance.listPlayerIds().length === 0`
  - 改动：无玩家实例 `speed *= 0.1`（降频到 0.1Hz）
  - 改动：怪物重生倒计时补偿（跳过 N tick 时 `respawnLeft -= N`）
  - 改动：玩家进入时立即恢复正常频率
  - 验证：`pnpm verify:quick` + 新增 smoke 验证降频/恢复
  - 预期：10000 实例中 80% 无玩家 → tick 循环从 10000 次降到 ~2800 次

- [ ] **T-05** 接入 AsyncPathfindingService（导航寻路走 Worker）
  - 文件：`packages/server/src/runtime/world/world-runtime-navigation.service.ts`
  - 改动：注入 `AsyncPathfindingService`
  - 改动：新增 `buildBlockedUint8Array(instance, playerId)` 适配函数
  - 改动：`materializeNavigationCommands` 中调用 `findPathAsync` 替代 `findOptimalPathOnMap`
  - 改动：保留同步 `findOptimalPathOnMap` 作为 Worker 超时 fallback
  - 注意：自动战斗寻路（`findPathToTargetWithinRangeOnMap`）因 `canStopAt` 回调无法异步化，暂不改
  - 验证：`pnpm verify:quick` + worker-pool-equivalence-smoke
  - 预期：导航寻路从主线程移到 Encoding Worker

- [ ] **T-06** cooldownLeft 改为 cooldownReadyTick
  - 文件：`packages/shared/src/action-combat-types.ts`（ActionDef 接口）
  - 文件：`packages/server/src/runtime/world/world-runtime-context-action-query.service.ts`
  - 文件：`packages/server/src/network/world-projector.helpers.ts`（buildActionEntrySignatures）
  - 改动：ActionDef 增加 `cooldownReadyTick?: number`，服务端只在技能进入冷却时发送
  - 改动：`buildActionEntrySignatures` 中排除 cooldownLeft（或改为只含 cooldownReadyTick）
  - 客户端：用 `Math.max(0, cooldownReadyTick - estimatedServerTick)` 本地计算
  - 验证：`pnpm verify:quick` + `pnpm verify:client` + `pnpm audit:protocol`
  - 预期：有技能冷却的玩家不再每 tick 发送 action delta

- [ ] **T-07** 合并多个 emit 为单 envelope
  - 文件：`packages/server/src/network/world-sync-protocol.service.ts`
  - 文件：`packages/shared/src/protocol-events.ts`（新增 S2C.Envelope 事件）
  - 文件：`packages/client/src/network/socket-event-registry.ts`
  - 改动：WorldDelta/SelfDelta/PanelDelta 合并为单次 `socket.emit(S2C.Envelope, {...})`
  - 客户端：解包单 envelope 分发到各处理器
  - 验证：`pnpm verify:quick` + `pnpm verify:client` + `pnpm audit:protocol`
  - 预期：TCP 包数量减少 60-80%

---

### 第三阶段：架构级优化（扩容到目标规模必须，1-2 周）

- [ ] **T-08** 自动战斗寻路改为深度限制 BFS
  - 文件：`packages/server/src/runtime/world/combat/world-runtime-auto-combat.service.ts`
  - 文件：`packages/server/src/runtime/world/world-runtime.path-planning.helpers.ts`（新增 `findNextStepBFS`）
  - 改动：自动战斗移动只需 1 步方向，用 BFS 深度限制为 1 替代完整 A*
  - 验证：`pnpm verify:quick` + auto-combat smoke
  - 预期：自动战斗寻路从 O(N log N) 降为 O(8)

- [ ] **T-09** stableShallowSignature 改为 FNV-1a 数值 hash
  - 文件：`packages/server/src/network/world-projector.helpers.ts`（stableShallowSignature）
  - 文件：`packages/server/src/network/projector-types.ts`（signature 类型 string → number）
  - 改动：递归字符串拼接 → 递归数值 hash
  - 改动：所有 `*Signature` 字段类型从 string 改为 number
  - 验证：`pnpm verify:quick` + `pnpm verify:client`
  - 预期：消除热路径字符串分配，GC 压力大幅降低

- [ ] **T-10** 启用 protobuf 二进制编码
  - 文件：`packages/server/src/network/aoi-envelope-encoder.service.ts`（取消 null 硬编码）
  - 文件：`packages/server/src/network/world-sync-worker-encode.service.ts`（shouldUseWorkerEncode → true）
  - 文件：`packages/client/src/network/`（启用 protobuf 解码路径）
  - 前提：T-07 合并 emit 完成后再启用（减少编码次数）
  - 验证：`pnpm verify:quick` + `pnpm verify:client` + 包体大小 benchmark
  - 预期：带宽减少 30-70%，编码卸载到 Encoding Worker

- [ ] **T-11** 客户端分层 Canvas + 脏区域检测
  - 文件：`packages/client/src/renderer/text.ts`（renderWorld 拆分）
  - 文件：`packages/client/src/renderer/canvas-text-renderer-adapter.ts`（多 Canvas 管理）
  - 改动：静态地块层（只在地块变化时重绘）+ 动态实体层 + 特效层
  - 改动：场景完全静止时跳过渲染（dirty flag）
  - 验证：`pnpm verify:client` + 移动端帧率测试
  - 预期：移动端帧率翻倍

- [ ] **T-12** 寻路 TypedArray 池化（Worker 内）
  - 文件：`packages/shared/src/pathfinding.ts`（findBoundedPath）
  - 文件：`packages/server/src/concurrency/workers/encoding.worker.ts`
  - 改动：按地图尺寸预分配 Float64Array/Int32Array，tick 间复用（`.fill()` 重置）
  - 验证：worker-pool-perf-bench
  - 预期：消除 Worker 内 120MB/s 临时内存分配

---

### 后续储备（目标规模最后一公里）

- [ ] **T-13** 实例 tick 主体并行化（将 tickOnce 核心逻辑移到 Worker）
- [ ] **T-14** 怪物 AI 完整移到 Instance Worker（不只是 intent 预计算）
- [ ] **T-15** perMessageDeflate 启用（需压测验证 CPU 开销）
- [ ] **T-16** 逐玩家隔离调用合并为批量（减少 35000 闭包/tick）
- [ ] **T-17** reconcileDefeatedPlayers 改为增量 Set
- [ ] **T-18** runIsolatedSyncOperation details 惰性构建
- [ ] **T-19** tickOnce 返回值预分配复用
- [ ] **T-20** 怪物技能几何缓存（属性不变时几何不变）

---

## 预期效果

| 阶段 | 网络 IO | 主线程 CPU | 支撑规模 |
|------|---------|-----------|---------|
| 第一阶段完成 | 减少 50-70% | tick 从 5-22ms 降到 3-15ms | 当前规模优化体验 |
| 第二阶段完成 | 进一步减少 20% | 导航寻路移到 Worker，无玩家实例降 90% | 1000-2000 玩家 / 3000-5000 实例 |
| 第三阶段完成 | 带宽减 30-70%（protobuf） | 自动战斗 O(8)，GC 压力大幅降低 | 3000-5000 玩家 / 10000 实例 |
| 后续储备完成 | — | 实例 tick 并行化 | 5000 玩家 / 10000 实例（目标） |
