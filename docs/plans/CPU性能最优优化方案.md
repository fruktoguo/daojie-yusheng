# CPU 性能最优优化方案

> 基于三轮代码级验证的精确事实，针对当前架构给出最优优化路径。
> 当前实际规模：~247 实例 / 少量玩家，tick 耗时约 5-22ms（预算利用率 2.5-11%）。
> 目标规模：5000 并发玩家 / 10000 地图实例 / 8 核 16GB / 1Hz tick。

---

## 核心发现

经过三轮验证，当前架构存在以下关键事实：

| 事实 | 影响 |
|------|------|
| Encoding Worker Pool 生产中 0 任务提交（所有调用者被禁用） | Worker 线程空闲浪费 |
| Instance Worker 预计算结果被完全忽略（resolveMonsterTargetWithHint 是空壳） | Worker 做了计算但结果被丢弃 |
| 所有寻路 100% 在主线程（AsyncPathfindingService 是死代码） | 主线程承担全部寻路 CPU |
| lifeElapsedTicks 每 tick 无条件递增导致所有玩家每 tick 必发 attr delta | 无效网络 IO |
| buff remainingTicks 参与 signature 导致有 buff 玩家每 tick 必发 buff delta | 无效网络 IO |
| protobuf 编码被显式禁用，实际走 Socket.IO 原生 JSON 序列化 | 包体比 protobuf 大 2-3 倍 |
| 无玩家实例不跳过 tick（但无玩家时怪物 AI 有快速退出路径） | 当前规模影响小，扩容后成瓶颈 |
| 唯一真正工作的 Worker 是 Persistence Pool（write plan 构建） | — |
| Flush 完全不在 tick 热路径中（独立 setInterval 定时器） | 不影响 tick 预算 |

---

## 第一阶段：零风险高收益（改动 <100 行，立即可做）

### 1.1 移除 lifeElapsedTicks 从 attr signature

**问题**：`buildAttrPanelSignature` 包含 `player.lifeElapsedTicks`，每 tick +1 导致所有玩家每 tick 必发 attr panel delta。

**改动**：
- `world-projector.helpers.ts` L794：从 signature 数组中移除 `player.lifeElapsedTicks`
- `world-projector.helpers.ts`：`canReuseAttrPanelSlice()` 移除 lifeElapsedTicks 比较
- 客户端 `main-panel-delta-state-source.ts`：首包接收基准值，后续用 `getEstimatedServerTick()` 本地递增

**收益**：消除所有玩家每 tick 必发的 attr delta（当前最大的无效网络 IO 源）
**风险**：低。客户端已有 `server-tick.ts` 提供 tick 估算基础设施。
**改动量**：~30 行

### 1.2 移除 remainingTicks 从 buff signature

**问题**：`buildBuffListSignature` 包含 `entry.remainingTicks`，每 tick -1 导致有 buff 的玩家每 tick 必发 buff panel delta。

**改动**：
- `world-projector.helpers.ts` L890：从 buff signature 中移除 `entry.remainingTicks`
- `buildBuffEntrySignatures` 中排除 remainingTicks 字段
- 客户端：首次下发 buff 时带 remainingTicks + envelope tick，本地递减

**收益**：有 buff 的玩家不再每 tick 发送 buff delta（仅 buff 添加/移除/层数变化时发送）
**风险**：低。buff 过期由服务端权威移除，客户端本地递减只影响显示。
**改动量**：~40 行

### 1.3 修复 resolveMonsterTargetWithHint 使用 worker intent

**问题**：`resolveMonsterTargetWithHint` 直接忽略 preIntent，无条件执行完整 `resolveMonsterTarget`。

**改动**（`map-instance.runtime.ts` L6138-6140）：
```typescript
resolveMonsterTargetWithHint(monster, preIntent) {
    // idle hint + 无锁定目标 → 跳过全量扫描
    if (preIntent?.action === 'idle' && !monster.aggroTargetPlayerId) {
        this.decayMonsterThreats(monster, new Set());
        return null;
    }
    // attack hint + 目标仍有效 → 跳过全量遍历
    if (preIntent?.action === 'attack' && preIntent.targetId) {
        const target = this.playersById.get(preIntent.targetId);
        if (target && this.isMonsterTargetValid(monster, target)) {
            this.addMonsterThreat(monster.runtimeId, target.playerId, ...);
            return target;
        }
    }
    // fallback 完整扫描
    return this.resolveMonsterTarget(monster);
}
```

**收益**：无玩家附近的怪物（大多数）直接 O(1) 返回 null，跳过 shadowcasting。有玩家时验证 hint 有效性 O(1) 后跳过全量遍历。
**风险**：低。Worker 镜像是上一 tick 快照，hint 失效时安全 fallback 到完整扫描。
**改动量**：~30 行

---

## 第二阶段：中等改动高收益（改动 100-300 行）

### 2.1 无玩家实例降频 tick

**问题**：所有非暂停实例每 tick 都执行 tickOnce，包括无玩家实例。当前规模影响小（无玩家时怪物 AI 有快速退出），但扩容到 10000 实例时成为瓶颈。

**方案**：无玩家实例降频到 0.1Hz，执行轻量 tick：
- 怪物重生倒计时（批量减 N 补偿跳过的 tick）
- 临时地块过期
- 地块恢复
- 跳过：怪物 AI 目标选择、shadowcasting、移动、建筑建造

**改动点**：
- `world-runtime-instance-tick-orchestration.service.ts` 的 `advanceFrame` 中检查 `instance.listPlayerIds().length === 0`
- 无玩家实例设置 `speed *= 0.1`
- 玩家进入时立即恢复正常频率

**收益**：10000 实例中假设 80% 无玩家 → tick 循环从 10000 次降到 ~2800 次
**风险**：低。怪物重生需要补偿，灵气流动降频几秒内会自平衡。
**改动量**：~50 行

### 2.2 接入 AsyncPathfindingService（导航寻路走 Worker）

**问题**：所有寻路 100% 在主线程。`AsyncPathfindingService` 已完整实现但无调用者。

**适用范围**：仅导航寻路（`findOptimalPathOnMap`）可异步化。自动战斗寻路（`findPathToTargetWithinRangeOnMap`）因 `canStopAt` 回调无法序列化到 Worker。

**改动点**：
- `world-runtime-navigation.service.ts` 注入 `AsyncPathfindingService`
- 新增 `buildBlockedUint8Array(instance, playerId)` 适配函数
- `materializeNavigationCommands` 中改为调用 `findPathAsync`
- 保留同步 `findOptimalPathOnMap` 作为 Worker 超时 fallback

**收益**：导航寻路从主线程移到 Worker。当前规模收益小，目标规模下减少主线程 300ms/tick。
**风险**：中。`materializeNavigationCommands` 已是 async 阶段，改造不破坏 tick 时序。Worker 超时 500ms 自动 fallback。
**改动量**：~100 行

### 2.3 cooldownLeft 改为 cooldownReadyTick

**问题**：技能冷却中每 tick cooldownLeft 递减 → actions.revision++ → action panel delta 每 tick 发送。

**改动**：
- `ActionDef` 接口增加 `cooldownReadyTick?: number`，移除 `cooldownLeft`（或保留为客户端派生）
- 服务端只在技能进入冷却时发送 `cooldownReadyTick`（绝对 tick，不变值）
- 客户端用 `Math.max(0, cooldownReadyTick - estimatedServerTick)` 本地计算
- `buildActionEntrySignatures` 中排除 cooldownLeft

**收益**：有技能冷却的玩家不再每 tick 发送 action delta
**风险**：中。协议变更需要前后端同步。
**改动量**：~80 行

### 2.4 合并多个 emit 为单 envelope

**问题**：每 tick 最多 5 次独立 Socket.IO emit（WorldDelta/SelfDelta/PanelDelta 等），每个有独立 packet header。

**改动**：
- `WorldSyncProtocolService` 合并为单次 `socket.emit(S2C.Envelope, { world, self, panel })`
- 客户端解包逻辑适配

**收益**：减少 TCP 小包数量 60-80%，降低 Socket.IO 帧头开销
**风险**：低。纯传输层优化，不影响数据语义。
**改动量**：~50 行

---

## 第三阶段：架构级优化（扩容到目标规模必须）

### 3.1 自动战斗寻路改为深度限制 BFS

**问题**：自动战斗只需下一步方向，却计算完整 A* 路径。

**方案**：用深度限制为 1 的 BFS 替代完整 A*，只返回最优下一步方向。

**收益**：自动战斗寻路从 O(N log N) 降为 O(8)（8 邻居检查）
**改动量**：~100 行

### 3.2 stableShallowSignature 改为数值 hash

**问题**：递归字符串拼接 + `Object.keys().sort()` 产生大量临时字符串。

**方案**：替换为 FNV-1a 数值 hash，返回 number 而非 string。

**收益**：消除热路径字符串分配，GC 压力大幅降低
**改动量**：~150 行（集中在 3 个文件）

### 3.3 启用 protobuf 二进制编码

**问题**：当前走 Socket.IO 原生 JSON 序列化，包体比 protobuf 大 2-3 倍。

**前提**：protobuf schema 和编解码函数已完整实现，只需启用。

**方案**：
- `aoi-envelope-encoder.service.ts` 启用 protobuf 编码
- `world-sync-worker-encode.service.ts` 启用 Worker 编码
- 客户端启用 protobuf 解码路径

**收益**：带宽减少 30-70%，编码可卸载到 Encoding Worker
**风险**：高。需要前后端联动，必须充分测试。
**改动量**：~200 行 + 大量测试

### 3.4 客户端分层 Canvas + 脏区域检测

**问题**：每帧全量重绘可见区域（无脏区域检测），移动端可能超 16ms 帧预算。

**方案**：
- 静态地块层：只在地块变化时重绘
- 动态实体层：只在实体移动时重绘
- 特效层：每帧重绘（浮动文字、攻击拖尾）
- 场景完全静止时跳过渲染

**收益**：移动端帧率翻倍，PC 端 CPU 占用大幅降低
**改动量**：~500 行（架构级重构）

---

## 实施路线图

```
第一阶段（1-2 天，立即可做）
├── 1.1 移除 lifeElapsedTicks 从 signature     [~30行, 收益极高]
├── 1.2 移除 remainingTicks 从 buff signature  [~40行, 收益高]
└── 1.3 修复 resolveMonsterTargetWithHint      [~30行, 收益高]

第二阶段（3-5 天）
├── 2.1 无玩家实例降频 tick                     [~50行, 扩容必须]
├── 2.2 接入 AsyncPathfindingService           [~100行, 扩容必须]
├── 2.3 cooldownLeft → cooldownReadyTick       [~80行, 收益中]
└── 2.4 合并多个 emit 为单 envelope            [~50行, 收益中]

第三阶段（1-2 周，扩容前必须）
├── 3.1 自动战斗改深度限制 BFS                  [~100行]
├── 3.2 stableShallowSignature → 数值 hash     [~150行]
├── 3.3 启用 protobuf 二进制编码               [~200行+测试]
└── 3.4 客户端分层 Canvas                      [~500行]
```

---

## 预期效果

### 第一阶段完成后
- 网络 IO 量减少 50-70%（消除每 tick 必发的 attr/buff delta）
- 怪物 AI 中 idle 怪物跳过 shadowcasting（O(1) 快速退出）
- 当前规模下 tick 耗时从 5-22ms 降到 3-15ms

### 第二阶段完成后
- 导航寻路从主线程移到 Worker
- 无玩家实例 tick 开销降低 90%
- 有冷却技能的玩家不再每 tick 发送 action delta
- TCP 包数量减少 60-80%

### 第三阶段完成后
- 自动战斗寻路从 O(N log N) 降为 O(8)
- signature 计算从字符串拼接改为数值 hash
- 带宽减少 30-70%（protobuf）
- 客户端移动端帧率翻倍

### 目标规模支撑能力
- 第一+第二阶段完成后：预计可支撑 1000-2000 玩家 / 3000-5000 实例
- 第三阶段完成后：预计可支撑 3000-5000 玩家 / 10000 实例
- 完全达到目标规模还需要：实例 tick 真正并行化（将 tickOnce 主体移到 Worker）
