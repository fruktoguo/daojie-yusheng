# CPU 性能最优优化方案

> 基于三轮代码级验证 + 完整链路追踪的精确事实。
> 当前实际规模：~247 实例 / 少量玩家，tick 耗时约 5-22ms（预算利用率 2.5-11%）。
> 目标规模：5000 并发玩家 / 10000 地图实例 / 8 核 16GB / 1Hz tick。

---

## 开发任务表

### 第一阶段：零风险高收益（改动 <100 行，1-2 天）

- [ ] **T-01** 移除 `lifeElapsedTicks` 从 attr signature
  - 文件：`packages/server/src/network/world-projector.helpers.ts` L794, L949
  - 改动：从 `buildAttrPanelSignature` 数组中删除 `player.lifeElapsedTicks`
  - 改动：从 `canReuseAttrPanelSlice` 移除 lifeElapsedTicks 比较
  - 保留：`captureAttrPanelSlice`、`buildFullAttrDeltaFromState`、`buildAttrDeltaFromState` 中仍保留此字段（其他属性变化时附带最新值）
  - 客户端：HUD 骨龄显示改为本地递增估算（最小显示单位是"天"=7200 ticks，精度要求极低）
  - 安全性：✅ 首包/重连/跨图时客户端获得精确值；显示精度远低于更新频率
  - 验证：`pnpm verify:quick` + `pnpm verify:client`
  - 预期：消除所有玩家每 tick 必发 attr delta（当前最大无效网络 IO）

- [ ] **T-02** 移除 `remainingTicks` 从 buff signature
  - 文件：`packages/server/src/network/world-projector.helpers.ts` L890
  - 改动：从 `buildBuffListSignature` 中删除 `entry.remainingTicks`
  - 改动：`buildBuffEntrySignatures` 中排除 remainingTicks（需从 stableShallowSignature 输入中剔除）
  - 保留：buff delta payload 中仍包含 remainingTicks（buff 新增/刷新时发送）
  - 客户端：实现本地 buff remainingTicks 递减（每秒 -1，收到服务端 delta 时覆盖）
  - 安全性：✅ buff 过期由服务端 removeBuffIds 驱动；stacks/name 变化仍触发 delta；断线重连时 full delta 包含完整值
  - 客户端使用点：进度环 UI（秒级精度足够）、buff 存活判断（> 0 检查）、presentationScale 提取
  - 验证：`pnpm verify:quick` + `pnpm verify:client`
  - 预期：有 buff 玩家不再每 tick 发送 buff delta

- [ ] **T-03** 修复 `resolveMonsterTargetWithHint` 使用 worker intent
  - 文件：`packages/server/src/runtime/instance/map-instance.runtime.ts` L6138-6140
  - **核心矛盾**：resolveMonsterTarget 不仅选目标，还承担仇恨系统 tick 推进（被动仇恨累积 + 衰减）
  - 安全的实现方案：
    - idle hint + 无 aggroTarget + 快速距离检查确认无玩家在范围内 → 只执行 decayMonsterThreats → return null（跳过 shadowcasting）
    - idle hint 但有玩家在范围内 → **必须 fallback**（否则永远不会发现新玩家）
    - attack hint + 目标有效 → 可跳过 shadowcasting，但**仍需执行被动仇恨累积和衰减**（否则目标切换失效）
    - attack hint + 目标无效 → **必须 fallback**
  - 实际收益：idle 怪物跳过 shadowcasting O(R²)；attack 怪物跳过全量玩家遍历但保留仇恨计算
  - 风险：中。attack hint 跳过被动仇恨会导致坦克抢仇恨机制延迟。建议 attack 路径仍执行完整仇恨逻辑，只跳过 shadowcasting。
  - 验证：`pnpm verify:quick` + monster smoke + 多玩家仇恨切换测试
  - 预期：无玩家附近的 idle 怪物 O(1) 返回 null

---

### 第二阶段：中等改动高收益（100-300 行，3-5 天）

- [ ] **T-04** 无玩家实例降频 tick
  - 文件：`packages/server/src/runtime/world/world-runtime-instance-tick-orchestration.service.ts`
  - **关键约束**（链路验证发现）：
    - `instance.tick` 必须按实际跳过数递增（绝对 tick 比较：技能冷却、临时地块过期）
    - 怪物 respawnLeft 需要补偿递减
    - 灵气流动是半衰期收敛，可用公式 `next = base + (current - base) * (1-rate)^N` 批量计算
    - 地块恢复需要补偿（respawnLeft -= N, hp += regenPerTick * N）
    - 阵法灵力预算需要补偿扣除
    - 通天塔实例不应降频（有波次推进逻辑）
    - 有活跃阵法的实例降频需谨慎（灵气注入是非线性的）
  - 改动：无玩家实例 `speed *= 0.1`（降频到 0.1Hz）
  - 改动：玩家进入时执行 catch-up 补偿（批量递减 respawnLeft、tick buff、恢复 HP、计算灵气目标值、扣除阵法预算）
  - 改动：排除通天塔实例和有活跃阵法的实例
  - 验证：`pnpm verify:quick` + 新增 smoke（降频/恢复/补偿正确性）
  - 预期：10000 实例中 80% 无玩家 → tick 循环大幅减少

- [ ] **T-05** 接入 AsyncPathfindingService（导航寻路走 Worker）
  - 文件：`packages/server/src/runtime/world/world-runtime-navigation.service.ts`
  - **关键约束**（链路验证发现）：
    - `materializeNavigationCommands` 当前是同步函数，需改为 async
    - advanceFrame 已是 async 且后续 `dispatchPendingCommands` 也是 await，改造不破坏时序
    - 返回值不兼容：async 版返回 `{ status, path }` vs 同步版 `{ points, cost }`，需适配层
    - blocked 掩码需从 `Set<number>` 转换为 `Uint8Array`
    - clientPathHint 优先级高于 async 寻路（有效时完全跳过服务端寻路）
    - 超时 500ms 后自动 fallback 到同步计算（不会返回空结果）
    - 加速 tick 场景：补偿寻路建议用同步 fallback（避免累积延迟）
  - 改动：注入 AsyncPathfindingService，新增 blocked Uint8Array 转换函数
  - 改动：resolveNavigationStep 改为 async，优先 clientPathHint → async 寻路 → 同步 fallback
  - 验证：`pnpm verify:quick` + worker-pool-equivalence-smoke
  - 预期：quest 导航（无 clientPathHint）从主线程移到 Worker

- [ ] **T-06** cooldownLeft 改为 cooldownReadyTick
  - 文件：`packages/shared/src/action-combat-types.ts`、`world-projector.helpers.ts`
  - 改动：服务端只在技能进入冷却时发送 `cooldownReadyTick`（绝对 tick，不变值）
  - 改动：`buildActionEntrySignatures` 中排除 cooldownLeft
  - 客户端：用 `Math.max(0, cooldownReadyTick - estimatedServerTick)` 本地计算
  - 验证：`pnpm verify:quick` + `pnpm verify:client` + `pnpm audit:protocol`
  - 预期：有技能冷却的玩家不再每 tick 发送 action delta

- [ ] **T-07** 合并多个 emit 为单 envelope
  - 文件：`packages/server/src/network/world-sync-protocol.service.ts`
  - 改动：WorldDelta/SelfDelta/PanelDelta 合并为单次 emit
  - 验证：`pnpm verify:quick` + `pnpm verify:client` + `pnpm audit:protocol`
  - 预期：TCP 包数量减少 60-80%

---

### 第三阶段：架构级优化（1-2 周）

- [ ] **T-08** 自动战斗寻路路径缓存
  - 文件：`packages/server/src/runtime/world/combat/world-runtime-auto-combat.service.ts`
  - 背景：每 tick 对每个需要移动的自动战斗玩家调用完整 A*，结果作为 path 传入 applyMove（一个 tick 内沿路径走多格，受 movePoints 和地形代价限制，硬上限 20 格）
  - 改动：缓存上一次寻路结果（path + targetPosition），下一 tick 检查目标是否移动 + 路径剩余部分是否仍可通行 → 有效则复用，无效才重规划
  - 验证：`pnpm verify:quick` + auto-combat smoke
  - 预期：大部分 tick 路径复用，仅目标移动时重规划

- [ ] **T-09** stableShallowSignature 改为 FNV-1a 数值 hash
  - 文件：`packages/server/src/network/world-projector.helpers.ts`
  - 改动：递归字符串拼接 → 递归数值 hash，所有 signature 类型 string → number
  - 验证：`pnpm verify:quick` + `pnpm verify:client`
  - 预期：消除热路径字符串分配，GC 压力大幅降低

- [ ] **T-10** 启用 protobuf 二进制编码
  - 前提：T-07 完成后再启用
  - 风险：高，需前后端联动
  - 预期：带宽减少 30-70%，编码卸载到 Encoding Worker

- [ ] **T-11** 客户端分层 Canvas + 脏区域检测
  - 预期：移动端帧率翻倍

- [ ] **T-12** 寻路 TypedArray 池化（Worker 内）
  - 预期：消除 Worker 内 120MB/s 临时内存分配

---

### 后续储备

- [ ] **T-13** 实例 tick 主体并行化（将 tickOnce 核心逻辑移到 Worker）
- [ ] **T-14** 怪物 AI 完整移到 Instance Worker
- [ ] **T-15** perMessageDeflate 启用
- [ ] **T-16** 逐玩家隔离调用合并为批量
- [ ] **T-17** reconcileDefeatedPlayers 改为增量 Set
- [ ] **T-18** runIsolatedSyncOperation details 惰性构建
- [ ] **T-19** tickOnce 返回值预分配复用
- [ ] **T-20** 怪物技能几何缓存

---

## 核心发现

| 事实 | 影响 |
|------|------|
| Encoding Worker Pool 生产中 0 任务提交 | Worker 线程空闲浪费 |
| Instance Worker 预计算结果被完全忽略 | Worker 做了计算但结果被丢弃 |
| 所有寻路 100% 在主线程 | 主线程承担全部寻路 CPU |
| lifeElapsedTicks 每 tick 触发 attr delta | 无效网络 IO（显示精度为天=7200 ticks） |
| buff remainingTicks 每 tick 触发 buff delta | 无效网络 IO |
| protobuf 编码被显式禁用 | 包体比 protobuf 大 2-3 倍 |
| 唯一真正工作的 Worker 是 Persistence Pool | — |
| Flush 不在 tick 热路径中 | 不影响 tick 预算 |

---

## 预期效果

| 阶段 | 网络 IO | 主线程 CPU | 支撑规模 |
|------|---------|-----------|---------|
| 第一阶段完成 | 减少 50-70% | tick 从 5-22ms 降到 3-15ms | 当前规模优化体验 |
| 第二阶段完成 | 进一步减少 20% | 导航寻路移到 Worker，无玩家实例降 90% | 1000-2000 玩家 / 3000-5000 实例 |
| 第三阶段完成 | 带宽减 30-70% | 自动战斗路径缓存，GC 压力大幅降低 | 3000-5000 玩家 / 10000 实例 |
| 后续储备完成 | — | 实例 tick 并行化 | 5000 玩家 / 10000 实例（目标） |
