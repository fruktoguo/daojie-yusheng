# 《道劫余生》项目潜在问题与规范违背检测报告

本报告严格对照项目执行规范 `AGENTS.md`，通过对 `packages/server` 等核心服务端的静态分析，全面细致地排查当前项目中潜在的规范违背、设计缺陷及性能隐患。

---

## 1. 核心红线违背：后端发送未结构化的中文纯文本通知 (P0)

### 关联规范条款
> **14. 通知消息规范**
> **核心原则：后端只传数据，前端负责文本拼接和渲染。**
> - 通知消息只发送结构化数据（消息 key + 变量），不拼接中文文本
> - 禁止新增纯文本拼接的 `queuePlayerNotice` 调用
> - 禁止在服务端用模板字符串拼接玩家可见的中文消息
> - 新增或修改通知消息时，必须使用结构化载荷格式

### 漏洞详情
在 `packages/server` 中存在大量直接拼接中文文本或模板字符串并调用 `queuePlayerNotice` 的情况。这严重违背了“后端只传数据，前端拼接文本”的红线，为多语言本地化和多端渲染埋下了隐患。

#### 典型案例 1：建筑系统运行时服务
在 [world-runtime-building.service.ts](file:///packages/server/src/runtime/world/world-runtime-building.service.ts) 中：
*   **行 107-111**：直接发送了硬编码的中文字符串：
    ```typescript
    runtime.queuePlayerNotice(
        playerId,
        `开始建造：${resolveBuildingDisplayName(context.instance, result.building) ?? buildingView.defId}`,
        'info',
    );
    ```
*   **行 176**：调用 `buildBuildingInterruptMessage` 直接拼接了中文的打断原因：
    ```typescript
    runtime.queuePlayerNotice(playerId, buildBuildingInterruptMessage(job.buildingName, reason), 'system');
    ```
    而在行 484 的实现中，甚至直接在服务端使用了复杂的中文拼装逻辑：
    ```typescript
    function buildBuildingInterruptMessage(buildingNameInput, reason) {
        // ...
        const reasonLabel = reason === 'move' ? '移动' : ...
        return `${buildingName} 的营造被${reasonLabel}打断。`;
    }
    ```
*   **行 195**：硬编码中文提示：
    ```typescript
    runtime.queuePlayerNotice(playerId, '建造目标已经不存在。', 'warn');
    ```
*   **行 477**：拼接中文文本：
    ```typescript
    runtime.queuePlayerNotice(playerId, `${buildingName}已完工`, 'success');
    ```

#### 典型案例 2：指令执行与挂起指令服务
在 [world-runtime-pending-command.service.ts](file:///packages/server/src/runtime/world/command/world-runtime-pending-command.service.ts#L399) 和 [world-runtime-player-command.service.ts](file:///packages/server/src/runtime/world/command/world-runtime-player-command.service.ts#L256) 中：
*   直接透传拼接好的中文文本，例如：
    ```typescript
    deps.queuePlayerNotice(playerId, noticeMessage, 'warn');
    deps.queuePlayerNotice?.(playerId, pendingActivityText, 'system');
    ```

### 危害分析
1.  **国际化与多语言失效**：直接在服务端拼接中文，导致客户端无法根据玩家的语言偏好动态转换文本。
2.  **网络带宽冗余**：发送长中文字符串比发送紧凑的 `key` 与 `vars` 结构化载荷占用更多包体字节，违背了“网络同步红线”（网络同步必须最小字段、最小频率）。

### 建议修复方案
重构上述所有 `queuePlayerNotice` 调用，统一改用结构化通知载荷。例如：
```typescript
// 推荐结构化改造
const notice = buildStructuredNotice('building', 'notice.building.start', `开始建造：{buildingName}`, {
    vars: { buildingName },
    pills: [{ key: 'buildingName', style: 'highlight' }]
});
runtime.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
```

---

## 2. 性能虚设：Encoding Worker Pool 被硬编码禁用 (P1)

### 关联规范条款
> **8. 性能红线**
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配 → 再减少重复序列化
> - **经验教训**：Encoding Worker Pool "已启用"但生产中 0 任务提交（所有调用者被硬编码禁用）

### 漏洞详情
在 [aoi-envelope-encoder.service.ts](file:///packages/server/src/network/aoi-envelope-encoder.service.ts) 与 [world-sync-worker-encode.service.ts](file:///packages/server/src/network/world-sync-worker-encode.service.ts) 中，核心异步序列化机制被硬编码绕过。

#### 1. aoi-envelope-encoder.service.ts
*   **行 73-80**：同步和异步的单 payload 编码均被直接写死返回 `null`：
    ```typescript
    /** 单 payload 同步编码。当前显式禁用 Buffer，保持 JSON 对象直发。 */
    encodePayloadSync(_payload: unknown): Buffer | null {
      return null;
    }
  
    /** 单 payload worker 编码。当前显式禁用 Buffer，保持 JSON 对象直发。 */
    async encodePayloadAsync(_payload: unknown): Promise<Buffer | null> {
      return null;
    }
    ```

#### 2. world-sync-worker-encode.service.ts
*   **行 43-45**：显式写死不进入 worker 预编码路径：
    ```typescript
    /** 是否应使用 worker 异步编码路径。当前禁用 Buffer 编码，保持 JSON 直发，不进入 worker 预编码路径。 */
    shouldUseWorkerEncode(): boolean {
      return false;
    }
    ```

### 危害分析
在高并发（5000 玩家、10000 地图实例）的高频 Tick AOI 同步中，所有 S2C 数据包的 JSON 序列化和数据组装都必须在 Node.js 主线程上同步完成。这使得主线程 CPU 会在密集的 `JSON.stringify` 运算中过载，导致卡顿、网络延迟增加和严重的 Tick 抖动，使得 Encoding Worker 模块完全成为“摆设”。

### 建议修复方案
1.  根据网络包体收益评估，逐步恢复并激活 Encoding Worker 的 Buffer/Zlib/Protobuf 压缩或预编码，让大流量 AOI 包在 Worker 线程池中并行序列化。
2.  若决定保持 JSON 直发，应在设计层面明确移除或重构此未使用的 Worker Pool，避免模块虚化引入不必要的系统开销和代码复杂度。

---

## 3. 并发真空：Instance Worker Pool 预计算结果被忽略 (P1)

### 关联规范条款
> **8. 性能红线 / 经验教训**
> - Instance Worker Pool "已启用"但预计算结果被完全忽略（resolveMonsterTargetWithHint 是空壳）
> - idle hint 跳过全量扫描不完全安全（resolveMonsterTarget还承担仇恨系统tick推进）

### 漏洞详情
在 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts) 中：
*   **行 6173-6199**：`resolveMonsterTargetWithHint` 旨在通过多线程预计算的目标 Intent 提示来加速妖兽的目标解析，但除 `action === 'idle' && !monster.aggroTargetPlayerId` 分支利用了快速路径之外，其他所有情况都直接回退到了全量主线程扫描 `resolveMonsterTarget(monster)`：
    ```typescript
    resolveMonsterTargetWithHint(monster, preIntent) {
        if (!preIntent) {
            return this.resolveMonsterTarget(monster);
        }
        // ...
        // 其他情况 fallback 完整扫描（保证仇恨系统正确推进）
        return this.resolveMonsterTarget(monster);
    }
    ```

### 危害分析
1.  **CPU 计算冗余**：虽然有 Worker Pool 在后台做预计算，但由于主线程大范围 fallback，预计算出来的 `hint` 实质上被白白废弃，额外耗费了 Worker 线程和主线程的通信开销。
2.  **热路径性能风险**：大量的妖兽仍需在每个 Tick 的主线程循环中调用 `resolveMonsterTarget`，执行开销巨大的 `collectVisibleTileIndices` (Shadowcasting 视线算法) 以及仇恨衰减与扫描，导致大规模同屏战斗时服务器性能急剧下降。

### 建议修复方案
重写仇恨推进与目标决策系统，将“仇恨值 Tick 衰减/推进”与“目标 Sight 射线检测/决策”解耦，允许在利用 `preIntent` 的前提下，安全地绕过主线程 Shadowcasting 视线阻挡计算，释放主线程运算压力。

---

## 4. tick 降频补偿缺陷：无玩家实例 Tick 暂停的副作用停滞 (P1)

### 关联规范条款
> **8. 性能红线 / 经验教训**
> - 无玩家实例跳过 tick 不能简单跳过 (有 6 项需要补偿的副作用)

### 漏洞详情
在 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts#L644) 中：
*   `performThrottleCatchUp` 补偿了两个字段的流逝：怪物复活时间 (`monster.respawnLeft`) 和地块复生时间 (`damage.respawnLeft`)。
*   然而，若地图实例在没有任何玩家时暂停或降频，当玩家再次进入触发 `Catch-Up` 时，**并未补偿以下关键的副作用**：
    1.  **自然回复与衰减**：玩家/怪物的生命值、元气等自然回复与流失停滞。
    2.  **技能冷却 (Cooldown)**：技能 CD 未在此期间流逝，玩家可能进入地图后发现技能仍被异常锁死。
    3.  **状态效果 (Buff/Debuff) 持续时间**：状态效果的 Tick 未按真实时间自然推移，导致时效被异常拉长。
    4.  **风水与灵气流转**：房间的风水和自然灵气场的流转（如 `auraByTile`）在此期间静止。
    5.  **建造/生产进度**：建筑的建造时间 (`buildRemainingTicks`) 无法在降频或无玩家实例中获得合理解算。

### 危害分析
玩家在离开并重新返回某张地图后，会感受到明显的时序不一致性（例如，在城里挂机 10 分钟返回副本，发现里面的妖兽技能 CD 还处于刚刚的状态，或者自身的状态未恢复），严重损害游戏体验和逻辑正确性。

### 建议修复方案
实现完整的 `InstanceCatchUpService`，在触发 Catch-Up 时，除了简单的 `respawnLeft` 扣减外，应对上述 6 类高阶状态变化提供对应的“等效时间加速解算”，或者在挂接/脱钩玩家时进行显式的时序断点重算。

---

## 5. 寻路设计瓶颈：妖兽移动决策极其简陋 (P2)

### 关联规范条款
> **4. 权威运行时红线**
> - **经验教训**：深度限制 BFS 替代 A* 的建议是错误的（需要完整路径支持多格移动和绕障）

### 漏洞详情
在 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts) 的 `chooseMonsterStep` (行 7819) 中，怪物的每步移动决策仅依赖一个简单的正负符号判断（贪心法试探）：
```typescript
function chooseMonsterStep(fromX, fromY, targetX, targetY) {
    const dx = Math.sign(targetX - fromX);
    const dy = Math.sign(targetY - fromY);
    // 直接拼装成 dx/dy 的 1 格候选
    // ...
}
```
这是一种纯粹的贪心决策，妖兽在追踪目标时只会直奔目标，而根本无法支持复杂的寻路和绕障。

### 危害分析
如果怪物与玩家之间存在墙壁、建筑或非可行走的地表（如深渊、石墙），怪物会被直接卡住，永远无法绕过障碍物袭击玩家。这极大降低了战斗的真实性与难度，玩家可以通过简单的地形机制无伤“卡怪”。

### 建议修复方案
怪物追击应当在遭遇阻挡时，引入带深度限制的轻量级寻路，或者在 `AsyncPathfindingService` (异步 A*) 中增加支持怪物实例寻路的通道，从而实现真实而高性能的怪物绕障 AI。

---

## 6. 静态代码治理：测试及工具脚本中 `@ts-nocheck` 的滥用 (P2)

### 关联规范条款
> **2. 工作总原则**
> - 禁止 `// @ts-nocheck`、`// @ts-ignore`、`// @ts-expect-error`（除非有明确的单行注释说明不可避免的原因）
> - 所有新增和修改的 `.ts` 文件必须是规范的 TypeScript

### 漏洞详情
在 `packages/server/src/tools/` 目录下（如 `gm-database-smoke.ts`、`combat-formula-main-parity-smoke.ts` 等），存在 **超过 170 个** 文件在首行声明了 `// @ts-nocheck`，选择性关闭了 TypeScript 类型检查。

### 危害分析
虽然多数文件为测试烟雾测试 (smoke) 或是基准测试 (bench)，但这些工具通常作为 CI/CD 流程中对权威数据库和持久化边界的验证防线。彻底屏蔽类型检查极易造成这些烟雾测试在 API 发生变更时沦为“失效检查”，导致持久化真源在发布前无法得到百分之百的类型边界审计。

### 建议修复方案
在版本发布加固阶段，将工具脚本逐步重构为强类型 TypeScript 文件，并在编译选项中剥离无意义的 `@ts-nocheck`，保证验证基线（如 `pnpm verify:release:full`）的绝对可靠。

---

## 7. 幂等与去重失效隐患：建筑操作缓存完全滞留于运行时内存 (P1)

### 关联规范条款
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿。

### 漏洞详情
在 [world-runtime-building.service.ts](file:///packages/server/src/runtime/world/world-runtime-building.service.ts) 中：
*   在 `handleBuildPlaceIntent` (行 39) 和 `handleBuildDeconstructIntent` (行 233) 中，系统通过读取 `runtime.buildingOperationResultsByKey` 来进行请求的幂等去重判断，防止玩家通过高频重发请求造成材料二次扣除：
    ```typescript
    const operationKey = buildBuildingOperationKey('place', playerId, requestId);
    const replay = runtime.buildingOperationResultsByKey.get(operationKey);
    if (replay) {
        return { ...replay, duplicate: true };
    }
    ```
*   在行 322-336 的 `recordBuildingOperation` 中，系统仅仅同步把操作记录推入了内存中的 Map 和 Array 缓存：
    ```typescript
    function recordBuildingOperation(runtime, operationKey, result, meta) {
        const stableResult = { ...result };
        runtime.buildingOperationResultsByKey.set(operationKey, stableResult);
        runtime.buildingOperationAuditLog.push({ ... });
        // ...
        return stableResult;
    }
    ```

### 危害分析
这些去重和审计状态**完全存在于进程内存中**，数据库和 Redis 中没有任何持久化与回放保障。
如果服务端进程重启或发生多节点故障转移 (Failover)，内存 Map 会瞬间丢失。此时若玩家重发建造 (`place`) 请求，去重保护完全失效，系统会再次扣减玩家的建造材料（`consumeBuildingCost`）并生成重复半成品，导致严重的玩家核心资产异常和数据污染。

### 建议修复方案
重构建筑操作的幂等与审计系统，将其并入 `durableOperationService` 或在 Redis 中设立带 TTL 淘汰周期的分布式操作缓存（例如 `building:place:${playerId}:${requestId}`），以确保进程生命周期之外的跨节点幂等一致性。

---

## 8. 持久化瓶颈：双重 await 串行限制卡死数据库高并发写回 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连。
> - 热路径性能与长期运营稳定性必须成立。
> **8. 性能红线**
> - 优化顺序：优先减少重复计算 → 再减少重复分配 → 再减少重复序列化。

### 漏洞详情
在 [player-persistence-flush.service.ts](file:///packages/server/src/persistence/player-persistence-flush.service.ts) 中：
*   在行 331 的刷盘循环中，脏玩家数据被以 `PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE` (24) 为一组分成了多个批次，然后使用 `for (const batch of batches)` 进行了串行 `await` 循环。
*   更严重的是，在行 333 调用的并行工具 `runConcurrent` 实现中：
    ```typescript
    async function runConcurrent<T>(
      values: T[],
      parallelism: number,
      worker: (value: T) => Promise<void>,
      // ...
    ): Promise<void> {
      const normalizedParallelism = Math.max(1, Math.trunc(parallelism));
      for (let index = 0; index < values.length; index += normalizedParallelism) {
        const slice = values.slice(index, index + normalizedParallelism);
        const results = await Promise.allSettled(slice.map((value) => worker(value)));
        // ...
      }
    }
    ```
    它每次只在当前 `batch` 中取 `PLAYER_PERSISTENCE_FLUSH_PARALLELISM` (4) 个玩家调用 `Promise.allSettled` 并进行 `await` 阻塞。

### 危害分析
在高并发（5000 玩家在线）的批量写回周期中，由于“双重 await 串行”设计的硬性牵制，每次写回循环实质上变成了成百上千次的微型同步事件流。即便数据库连接池空闲资源充沛，主线程也会陷入漫长的微任务等待和等待排队中，导致一次批量 Flush 需要极长的时间。这使得 1.5s 的崩溃丢失窗口形同虚设，并在宕机时发生严重的“来不及存盘导致的数据大回档”。

### 建议修复方案
重构 `runConcurrent` 与 `batches` 的调度流程，采用基于令牌桶或 Semaphore (信号量) 的动态并发限制滑动窗口，而不是双重分组串行 await，让数据库连接池的并发潜力得到充分释放。

---

## 9. 缓存击穿与主线程耗竭：AOI 视线阻挡缓存设计粒度过粗 (P1)

### 关联规范条款
> **5. 网络同步红线**
> - 高频同步必须最小字段、最小范围、最小频率。
> **8. 性能红线**
> - 热路径禁止依赖字符串签名比较、每 tick 全表扫描。
> - 经验教训：idle hint 跳过全量扫描不完全安全（resolveMonsterTarget还承担仇恨系统tick推进）。

### 漏洞详情
在 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts) 的 `buildPlayerView` (行 2209) 中，系统依赖 `this.worldRevision` 来判断玩家的 FOV 视线缓存是否有效：
```typescript
if (cached
    && cached.worldRevision === this.worldRevision
    && cached.selfRevision === player.selfRevision
    && cached.x === player.x
    && cached.y === player.y
    && cached.radius === normalizedRadius) {
    return view;
}
```
但在 `map-instance.runtime.ts` 中，有超过 30 处会无差别地使 `this.worldRevision` 加一，例如：**地块日常灵气自然传导 (每秒发生)、怪物踏步位移、地表资源或非阻挡地块耐久微弱受损**。

### 危害分析
灵气波动或远端怪物的踏步位移，根本不会改变阻挡玩家视线（`blocksSightMask`）的墙壁和地形关系，玩家也并未移动。然而，由于 `worldRevision` 的**无差别脏标记击穿**，所有玩家在每个 Tick 里的 `buildPlayerView` 缓存全部失效，被迫在主线程中每帧重新计算昂贵且高频的 8 八分区 Shadowcasting 视线阻挡，造成服务器主线程 CPU 的极度耗竭。

### 建议修复方案
将“视野阻挡层 (BlocksSight)”的修订版本（例如 `blocksSightRevision`）与一般的地块数据和怪物数据 revision 彻底分离。只有在真正阻挡视线的物体（如墙壁倒塌、门开关）发生改变时，才失效 FOV 缓存。

---

## 10. 热路径内存分配压力：灵气流转高频分配短命对象造成 Minor GC 抖动 (P1)

### 关联规范条款
> **8. 性能红线**
> - 热路径优化顺序：优先减少重复计算 → 再减少重复分配 → 再减少重复序列化。

### 漏洞详情
在 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts) 的 `advanceTileResourceFlow` (行 3446) 中，用于处理地图地块灵气向基线自然衰减的 Tick 路径里：
*   **行 3448**：高频遍历流转 Indices Map：
    ```typescript
    for (const [resourceKey, tileIndices] of Array.from(this.tileResourceFlowIndicesByKey.entries())) {
    ```
*   **行 3459**：高频转换 Set 为数组进行灵气自然回补遍历：
    ```typescript
    for (const tileIndex of Array.from(tileIndices.values())) {
    ```

### 危害分析
`Array.from(map.entries())` 和 `Array.from(set.values())` 会在堆内存中高频分配并产生短命的临时数组对象。在 10000 个地图实例的生产口径下，每秒发生上万次的流转计算。这种在热路径中密集的垃圾对象分配，会导致 V8 引擎频繁发生 Minor GC (Scavenge) 垃圾回收停顿，极易抢占主线程 CPU 并带来不可避免的微卡顿和 Tick 抖动。

### 建议修复方案
避免在热路径中使用 `Array.from` 转换，直接利用 `for (const [resourceKey, tileIndices] of this.tileResourceFlowIndicesByKey)` 及 `for (const tileIndex of tileIndices)` 采用迭代器直接循环，实现热路径下的零临时数组分配。

---

## 11. 时序与竞态漏洞：客户端双模 UI 挂载引发的未捕获 Crash 与事件失联 (P2)

### 关联规范条款
> **6. UI 与客户端交互红线**
> - 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
> - UI 更新优先局部 patch；手机端要考虑触控安全区。

### 漏洞详情
在客户端聊天面板的初始化逻辑中，Vanilla JS 风格的 `ChatUI` 在 [chat.ts](file:///packages/client/src/ui/chat.ts) 中通过 `replaceChildren` 动态挂载 React 版本的 `ChatPanel`：
*   **行 1028-1033**：
    ```typescript
    if (shouldUseReactChatPanel()) {
      mountReactChatPanel(this.panel);
      this.input = document.getElementById('chat-input') as HTMLInputElement;
      this.sendBtn = document.getElementById('chat-send')!;
      this.tabs = [...this.panel.querySelectorAll<HTMLElement>('[data-chat-channel]')];
      this.panes = [...this.panel.querySelectorAll<HTMLElement>('[data-chat-pane]')];
    }
    ```
由于 `mountReactChatPanel` 调用的 React `root.render` 过程是异步的，在执行行 1030 时，`chat-input` 等 DOM 节点有极大概率**还未被 React 挂载渲染到 DOM 树中**。

### 危害分析
1.  **未捕获的运行时 Crash**：行 1030 拿到的 `this.input` 会为 `null`，导致后续同步调用的 `this.input.addEventListener` 直接发生 Null Pointer Error 崩溃，中断整个主界面的初始化。
2.  **事件失联与死锁**：即便未 Crash，原有 Vanilla 逻辑也可能会将事件监听绑定在已被 `replaceChildren` 废弃和销毁的原有静态 HTML 节点上，导致聊天 Tab 频道点击失效，输入框回车或点击发送按钮毫无反应。所有使用此种挂载模式（双模 UI）的客户端面板均存在此隐患。

### 建议修复方案
摒弃 Vanilla 主动抓取 React 内部 DOM 节点进行事件绑定的做法。统一将用户输入和发送回调以 `props` 或者是 `Bridge` 状态形式单向流入 React 组件内部，利用 React 内部合成事件 (SyntheticEvent) 派发意图，彻底根除挂载期的 DOM 竞态问题。

---

## 12. 慢 Tick 隐患：死亡玩家安全网设计退化为全量地图实例嵌套扫描 (P1)

### 关联规范条款
> **4. 权威运行时红线**
> - 单服多地图，每张地图独立 tick 循环；当前 tick 频率按现有实现保持 `1Hz`。
> **8. 性能红线**
> - 优化顺序：优先减少重复计算 → 再减少重复分配。
> - 热路径禁止依赖每 tick 全表扫描替代索引。

### 漏洞详情
在 [world-runtime-instance-tick-orchestration.service.ts](file:///packages/server/src/runtime/world/world-runtime-instance-tick-orchestration.service.ts) 中：
*   为了解决死亡结算冲突，系统引入了 `reconcileDefeatedPlayersBeforeTick`。虽然设计了 `defeatedPlayerIds` 增量集合来优化死亡检索。
*   但在行 122-149 的“安全网”逻辑中，当增量集合为空时，系统会全量回退到对所有地图实例及其内部玩家的全表深度嵌套循环扫描：
    ```typescript
    // 安全网：增量 Set 为空时仍执行全量扫描
    const playerRuntimeService = deps?.playerRuntimeService;
    // ...
    for (const instance of deps.listInstanceRuntimes?.() ?? []) {
      for (const playerId of instance.listPlayerIds()) {
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp > 0) continue;
        // 执行死亡状态校准和仇恨清理...
      }
    }
    ```

### 危害分析
在绝大多数的 Tick 帧中，实际上并不会有玩家发生死亡（即 `defeatedPlayerIds.size` 恒为 0）。这意味着，系统反而会在“最常见的常态帧”中，每一个 Tick (1Hz) 都无差别地对万张地图实例 (`listInstanceRuntimes`) 和所有在线玩家执行一次昂贵的、跨服务的全量嵌套轮询。这直接击穿了增量集合设计的初衷，使得服务器在大实例高并发运营场景下的主线程 CPU 经常被“安全网”带来的无休止全表扫描拖垮。

### 建议修复方案
彻底剥离在 Tick 热路径中的全量实例扫描安全网。将异常死亡玩家的回收校准逻辑，移入玩家登录、重连、跨图重组、或者专门在后台低频执行（例如每 60 秒检查一次）的“离线/异常回收任务”中，使每帧 Tick 专注于纯增量计算。

---

## 13. 时序与事件丢失漏洞：Event Bus 无条件全局 Tick Flush 导致网络抖动期玩家核心更新丢失 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连。
> - 客户端操作连续性与多端可用性必须得到保证。
> **4. 权威运行时红线**
> - 服务端按领域收集玩家意图，并在每息受控执行；同类可覆盖意图以最后一次为准。

### 漏洞详情
在每个 Tick 周期结束时，`WorldTickService` 会触发事件总线的清理逻辑 [runtime-event-bus.service.ts](file:///packages/server/src/runtime/event-bus/runtime-event-bus.service.ts#L496)。
在 `flushTick()` 内部，系统对所有尚未被在线网络同步 `drain` 掉的玩家事件队列（`playerQueues`）执行了**无差别的强制删除**：
```typescript
// 清空未被在线同步 drain 的玩家维度队列，EventBus 只保留当前 tick 的暂存事件。
for (const [playerId, queue] of this.playerQueues) {
  // ... (指标统计)
  this.playerQueues.delete(playerId);
}
```
正常情况下，`WorldSyncEnvelopeService.createDeltaEnvelope` 在玩家的 Tick 帧同步逻辑中会被调用，触发 `drainPlayerEventBusPayload(playerId)` 消费并删除玩家队列中的通知（notices）、面板更新（panelPatches）、反馈（feedback）等数据。
然而，在 Node.js 中，Tick 推进与 WebSocket 的发送是由独立的定时/微任务流控制的。一旦客户端发生短暂的网络波动、处于跨图加载的微小网络窗口中，或者在服务器高负载下 Socket.io 发送队列发生排队积压，导致该玩家当 Tick 的 `createDeltaEnvelope` 被略微延迟，一旦跨越 Tick 的时序终点（即 `flushTick()` 触发），这部分未被消费的事件将被**在内存中永久抹去**。

### 危害分析
在高并发多人在线或玩家网络出现瞬间抖动时，玩家会**随机丢失核心的界面更新**（例如：功法升级、境界提升、背包获得贵重道具的 panelPatches 丢失）、技能进度条（activeJob 丢包）以及操作的弹出式 notices 提示，造成严重的“界面状态卡死不同步”或“战斗/事件消息吞包”缺陷，极大损害了游戏的操作连续性。

### 建议修复方案
重构事件总线的生命周期管理。避免在每个 Tick 结束时进行一刀切式的 delete 强制抹除，而是：
1.  允许待发事件拥有一个短暂的生存期限（如 TTL 5-10秒），未被 drain 且未过期的事件保留在队列中。
2.  引入明确的客户端 Ack 机制，或在玩家彻底 Disconnect 登出时再由下线逻辑（`discardPlayer`）调用 delete，实现真正的网络可靠分发。

---

## 14. 协议设计与高并发瓶颈：分频辅助状态独立 emit 破坏 Envelope 合并，成倍恶化网络 PPS 带宽成本 (P1)

### 关联规范条款
> **5. 网络同步红线**
> - 高频同步必须最小字段、最小范围、最小频率。
> - 能发 patch 的不发完整对象；能单播就不 AOI，能 AOI 就不全图。
> - 协议变更必须能解释字段属于哪一层、谁接收、频率多高、生命周期多长。

### 漏洞详情
在每个 Tick 的网络数据 write 回逻辑 [world-sync.service.ts](file:///packages/server/src/network/world-sync.service.ts) 的 `syncDeltaForPlayer` (行 172-185) 中：
系统首先会调用 `this.emitEnvelope(socket, envelope)` 发送包含 `worldDelta`、`selfDelta`、`panelDelta` 的主 `SyncEnvelope` 消息。
然而，在此之后，系统在同一个 Tick 瞬间，针对同一个客户端 Socket，连续且独立地触发了多次 WebSocket 消息的单播发送：
*   **行 177**：调用 `this.emitAuxDeltaSync(...)` 独立 emit 了 `S2C.RoomSummaryPatch` 或 `S2C.FengShuiOverlayPatch`；
*   **行 179**：调用 `this.worldSyncQuestLootService.emitQuestSyncIfChanged(...)` 独立 emit 了任务更新事件 `S2C.Quests`；
*   **行 183**：调用 `this.emitPendingPlayerStatisticRecords(...)` 独立 emit 了离线挂机收益 `S2C.OfflineGainReports`。

```typescript
const { envelope, player, auxDeferred } = this.prepareDeltaForPlayer(playerId, sessionId, socket, view, breakdown);
this.emitEnvelope(socket, envelope);
// ...
if (auxDeferred) {
    runMeasuredAuxSync(breakdown, () => this.emitAuxDeltaSync(playerId, socket, view, player));
}
this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, playerId, player?.quests?.revision);
this.emitPendingRuntimeEvents(playerId, socket, envelope);
this.emitPendingPlayerStatisticRecords(playerId, socket);
```

### 危害分析
虽然游戏从设计上通过 SyncEnvelope 合并了世界与属性增量以期望“一帧一包”。但是在实际热路径的 flush 执行中，由于机制和服务的割裂，每个 Tick 仍会对每个玩家独立产生 3-4 次 WebSocket 的小包 `emit` 投递。
在 5000 玩家在线的商业级 MMO 并发口径下，这意味着每秒服务器需要发出 15,000 到 20,000 次网络 TCP 小包。这会使 Node.js 主线程在密集小包序列化和操作系统 Socket 写入（PPS，Packets Per Second）中瞬间达到网卡和内核瓶颈，极易引起服务器网络队列拥堵、包延迟暴增及严重的网络微卡顿。

### 建议修复方案
重构高频网络同步边界，将辅助状态（AuxDelta）、任务更新（Quests）以及挂机报告（OfflineGainReports）等分频变动统一打包、编排进 `SyncEnvelope` 或 `worldDelta.eventBus` 的协议负载中。让客户端在单次 envelope 帧接收中统一投影解码，真正落地“高频单包增量同步”的网络红线要求。

---

## 15. 客户端 DOM 局部 Patch 密钥错位：基于槽位索引 (slotIndex) 绑定 DOM 导致移位后 Tooltip 与对话框信息张冠李戴 (P2)

### 关联规范条款
> **6. UI 与客户端交互红线**
> - 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
> - UI 更新优先局部 patch；高频 UI 更新不得打断焦点、滚动、选区、展开态、当前输入、当前操作。

### 漏洞详情
在客户端背包面板更新逻辑 [inventory-panel.ts](file:///packages/client/src/ui/panels/inventory-panel.ts) 的 `patchList` (行 2419) 中，系统试图通过 DOM 复用来避免背包列表重绘闪烁。
然而，系统复用 DOM 的 key（缓存索引）完全绑定在背包的 `slotIndex` 上，而非物品的唯一标识符（`itemInstanceId`）：
```typescript
const orderedCells = renderedItems.map(({ item, slotIndex }) => {
  usedSlotIndexes.add(slotIndex);
  let cell = this.cellBySlotIndex.get(slotIndex);
  if (!cell) {
    cell = this.createInventoryCell(slotIndex);
    this.cellBySlotIndex.set(slotIndex, cell);
  }
  const cooldownState = cooldownStateMap.get(item.itemId) ?? null;
  if (!this.patchInventoryCell(cell, item, slotIndex, cooldownState)) {
    return null;
  }
  return cell;
});
```
在 MUD / MMO 游戏中，玩家**整理背包（Sort）**，或者**消耗、丢弃、卖出排在前面的堆叠物品**是极高频的操作。当这些操作触发时，后续物品的 `slotIndex` 会发生大范围物理位移。
由于 `cellBySlotIndex` 严重依赖 slotIndex，移位发生时，原有 DOM 节点并没有随物品物理移动，而是直接原地被 `patchInventoryCell` 抹去旧属性并覆写成了新移入的物品数据。

### 危害分析
这会导致两项极度恶劣的客户端交互隐患：
1.  **焦点与操作完全被打断**：若玩家当前点击了某格物品并开启了批量使用/批量摧毁对话框（`actionDialog`，行 2390），或者正悬停其上查看 Floating Tooltip，只要此时背包物品由于外界事件（如挂机产出、自动吃药、排序）发生位置平移，由于槽位被 patch 成了其他物品，当前开启的对话框/Tooltip 绑定的数据会瞬间发生**“张冠李戴”**。玩家极易因为 UI 信息不同步而误点确定，导致**摧毁或误消耗另一格贵重的高阶武器或开天门草药**，酿成重大的玩家资产损毁事故。
2.  **视觉闪烁与微卡顿**：本应可以通过移动 DOM 节点实现的排序效果退化为了全量槽位的 DOM 数据覆盖改写，失去了局部 patch 稳定前端 UI 焦点的意义。

### 建议修复方案
重构 `cellBySlotIndex` 缓存结构。将复用 key 替换为全局唯一的 `itemInstanceId`（对于无 InstanceId 的低阶堆叠物品可使用 `itemId:stackIndex`），在渲染时通过 CSS Flex `order` 或物理移动 DOM 节点来改变列表排序，确保道具 DOM 节点在移动中其绑定的事件、Tooltip 焦点与对话框状态随实体的生命周期一致，彻底斩断越界操作的安全风险。

---

## 16. 数据库连接池隐患：高并发批量刷盘锁冲突 (Lock Activity) 极易引发 pg 连接池完全耗竭 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 热路径性能与长期运营稳定性必须成立。
> - 任何会影响玩家资产、位置、战斗、交易、邮件、市场、GM 操作、地图状态的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - tick 内避免直接数据库 IO；需要持久化时通过 flush、outbox、worker、快照或受控队列转出。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复。

### 漏洞详情
在 [database-pool.provider.ts](file:///packages/server/src/persistence/database-pool.provider.ts) 中：
系统将数据库连接池依据业务重要程度拆分为了多个 Pool Group。其中承担高频脏数据落盘的 `flush` 池，最大物理连接上限配置为 `DEFAULT_POOL_MAX.flush = 16`（在 `resolveDatabasePoolMax` 中最大热限限制为 50）。
在 `PlayerPersistenceFlushService` 的主刷盘循环中，多达数十或成百上千脏玩家的各种分域增量（如 `inventory`、`equipment`、`buff`）会被以并行度 `PLAYER_PERSISTENCE_FLUSH_PARALLELISM = 4` 的滑动窗口推送到 pg 中。
如果多个高并发玩家在同一时刻执行刷盘，且由于游戏内的交互（例如在同一宗门下贡献、在同一个共享风水房间投影更新、或者拥有相同的地块锚点写入冲突），PostgreSQL 内部会高频产生多处行级或页面级锁竞争。
然而，在连接池创建配置中，**并未指定 `statement_timeout`（查询执行超时熔断）**。虽然连接获取超时限制为 5s，但在连接被正常分配出去后，一旦 SQL 执行在 pg 内部因为锁竞争而处于 `Lock` 锁等待状态（pg_stat_activity 里的 `wait_event_type = 'Lock'`），该数据库物理连接将被永久挂起直至锁超时。

### 危害分析
在高并发（5000 玩家在线）批量刷盘的峰值时段，一旦发生连锁性的宗门、地图锁竞争，`flush` 连接池中的所有 16-50 个数据库连接将瞬间因为锁等待而处于死锁锁死状态，无法被释放并交还给连接池。
由于连接池被锁死的连接无法回收，不仅后续所有积压的脏玩家刷盘请求完全停滞崩溃，更会迅速产生反水效应，使主线程核心 Tick 运行时（依赖 `runtimeCritical` 池）也因为无法申请到可用的数据库物理连接而整体陷入卡死（Freeze），直接诱发全服雪崩式宕机。

### 建议修复方案
1.  In `DatabasePoolProvider` 连接池初始化配置中，增加显式的 `query_timeout`（如 3000ms 查询超时熔断），确保在产生死锁时强制取消执行以交还连接。
2.  In 增量分域投影刷盘 SQL（如 savePlayerSnapshotProjectionDomains）中，针对大面积并发热点表，采用行锁安全避让（例如 `SELECT ... FOR UPDATE SKIP LOCKED`）或者在进入主线程并发 IO 前，在 Node.js 端按宗门/实例 ID 进行内存分组排序串行化投影，杜绝数据库锁冲突拖垮整个连接池。

---

## 17. 状态不一致隐患：持续性阵法释放与数据库状态不同步导致垃圾孤儿数据及状态“起尸”漏洞 (P1)

### 关联规范条款
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复。

### 漏洞详情
在阵法权威运行时服务 [world-runtime-formation.service.ts](file:///packages/server/src/runtime/world/world-runtime-formation.service.ts) 中：
*   在 `releaseInstance` (行 1052-1072) 方法中，用于处理地图实例销毁或 fencing 卸载收口。其设计注释中明确声称：
    > “仅在没有持续性阵法（持续性阵法以阵眼实例为准，不应跟随承载实例销毁丢失）时清理；持续性阵法转入 `active=false` 的标记，等待持久化层在阵眼销毁路径上单独清理。”
*   但在实际代码执行中，该 `if-else` 分支并未区分普通阵法与持续性阵法，均无条件执行了对内存中阵法映射的删除：
    ```typescript
    const formations = this.formationsByInstanceId.get(normalizedInstanceId);
    if (Array.isArray(formations) && formations.length > 0) {
        this.formationsByInstanceId.delete(normalizedInstanceId);
    } else {
        this.formationsByInstanceId.delete(normalizedInstanceId);
    }
    this.restoredFormationInstanceIds.delete(normalizedInstanceId);
    ```
这里仅仅从内存 Map 中清空了当前承载实例 ID 的所有阵法对象，但并没有触发任何将这些处于“物理卸载”状态的持续性阵法（如护宗大阵）的 `active` 字段置为 `false` 并刷写回数据库的逻辑，同时无条件清除了用于判定是否安全覆盖数据库的 `restoredFormationInstanceIds`。

### 危害分析
1.  **数据库持久化垃圾数据累积**：由于大阵被物理卸载时没有在数据库中将 `active` 标记更新为 `false`，这批已物理消亡的实例所承载的持续性阵法会在数据库表 `instance_formation_state` 中永久残留 `active=true` 的过期垃圾数据。
2.  **阵法状态异常“起尸”**：当该地图实例后续由于玩家活动或定时任务被重新载入/恢复（例如通过 `restoreInstanceFormations`）时，由于数据库中此前的脏状态仍为 `active=true`，它们会被当作正常活跃大阵重新读入并激活。这种时序割裂导致了已被物理卸载的失效阵法跨生命周期“起尸”，容易引起游戏规则越界、大阵越权生效，并随着服务器运行时间推移在公共大地图区块累积大量失效的“大阵废墟”脏数据，严重拖慢全表载入时的 CPU 效率和 SQL 开销。

### 建议修复方案
重构 `releaseInstance` 物理卸载收口，在执行 delete 之前增加对持续性阵法（`isPersistentFormation`）的显式过滤与状态落盘。应将需要暂时停摆或跟随卸载的阵法其 `active` 置为 `false` 并调用 `persistFormationSnapshotSoon(formation)` 同步刷入数据库，保证内存真源与持久化真源的双向严格一致。

---

## 18. 热路径内存泄漏：通天塔空闲物理销毁未清理 cachedLayerInstances 造成内存持续溢出与“丧尸”实例复用漏洞 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连、长期运营稳定性。
> **8. 性能红线**
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配。

### 漏洞详情
在通天塔权威运行时服务 [world-runtime-tongtian-tower.service.ts](file:///packages/server/src/runtime/world/world-runtime-tongtian-tower.service.ts) 中，系统在成员变量中维护了一个层级实例字典 `cachedLayerInstances` 用于加速特定层数实例的缓存与读写：
```typescript
private readonly cachedLayerInstances = new Map<number, any>();
```
*   在 `cleanupIdleInstances` (行 205-248) 中，系统负责周期性地对没有任何在线玩家、已处于空闲超时的通天塔地图实例进行物理注销、状态落盘及销毁：
    ```typescript
    instance.meta.runtimeStatus = 'stopped';
    instance.meta.status = 'destroyed';
    deps.worldRuntimeInstanceStateService?.deleteInstanceRuntime?.(instanceId);
    deps.worldRuntimeTickProgressService?.clearInstance?.(instanceId);
```
    ```

### 危害分析
1.  **高并发长周期内存溢出（OOM 崩溃）**：通天塔作为副本类玩法，玩家会高频在各层级之间跳转或自动进出。虽然大地图在全局运行时中已被标记为 `destroyed` 并注销，但其强引用却由于 `cachedLayerInstances` 字典未清理而被该单例服务永久持有在内存中。已被物理销毁的巨大 `MapInstanceRuntime` 实例（包含大量地块、NPC、妖兽实体及事件流闭包）无法被 Node.js 垃圾回收器（GC）回收，服务器堆内存将随运行时间无界恶性增长，引发线上服务严重的 OOM 宕机事故。
2.  **“丧尸”实例逻辑偏离**：当下一次有玩家进入该已被销毁的层级时，系统会优先尝试调用 `takeCachedLayerInstance` 获取已被废弃的“丧尸”实例。虽然会对其重新强行改写状态并激活，但其之前生命周期中残留的怪物刷新位置冲突（occupied Set 残留）、未处理干净的脏事件流监听以及已损毁地块状态将被全部带入新流程中，极易引起妖兽不刷新、地块逻辑穿透甚至主 Tick 崩溃。

### 建议修复方案
在 `cleanupIdleInstances` 的销毁执行链路中，当成功判定并注销通天塔实例时，应增加对应的缓存清理行，确保执行 `this.cachedLayerInstances.delete(layer)` 彻底从强引用字典中剥离该实例，解除 GC 回收限制，规避状态和内存双重泄露。

---

## 19. 状态脑裂与玩家卡死：宗门解散与踢除未同步更新离线玩家数据库真源 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 服务端是唯一权威来源；任何会影响玩家资产、位置、战斗的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。

### 漏洞详情
在宗门系统运行时服务 [world-runtime-sect.service.ts](file:///packages/server/src/runtime/world/world-runtime-sect.service.ts) 中：
*   在解散宗门 `dissolveSect` (行 744-770) 以及踢出成员 `removeSectMember` (行 684-703) 时，系统尝试清理宗门成员的所属关系，调用了：
    ```typescript
    this.clearPlayerSectIdIfLoaded(memberId, sect.sectId);
    ```
*   但在 `clearPlayerSectIdIfLoaded` (行 786-796) 的具体实现中，系统仅从在线活跃内存列表中尝试抓取玩家对象：
    ```typescript
    clearPlayerSectIdIfLoaded(playerId, sectId) {
        const loaded = this.playerRuntimeService.getPlayer?.(playerId);
        if (!loaded || normalizeOptionalString(loaded.sectId) !== sectId) {
            return;
        }
        if (typeof this.playerRuntimeService.setPlayerSectId === 'function') {
            this.playerRuntimeService.setPlayerSectId(playerId, null);
        } else {
            loaded.sectId = null;
        }
    }
    ```
如果目标玩家此时**处于离线状态（即其不在在线玩家列表中）**，`loaded` 判定会直接为 `null`，导致该清理函数静默 `return`，**根本不会产生任何对数据库玩家实体中 `sect_id` 字段的写回和擦除动作**。

### 危害分析
1.  **离线玩家再次登录发生未捕获崩溃与卡死**：对于被踢或由于宗门解散而失去宗门的离线玩家而言，他们下次上线时，其主 `player` 表中的数据库实体仍然驻存着原先过期的旧 `sect_id`。玩家在登录热路径中带着此脏 ID进入初始化，而由于内存宗门字典中该宗门已解散或他的名字已被剔除，这会导致在各种依赖宗门实体、宗门面板、技能计算的热路径中抛出未捕获的空指针异常（`NullPointerError`），直接使这一批玩家**永久被拦截在登录加载界面，无法上线**。
2.  **典型脑裂与属性割裂**：即便未发生登录 Crash，玩家自认为属于某宗门（根据数据库 `player` 真源），但系统核心宗门表名册中却查无此人，造成两层属性状态的脑裂失真，严重破坏了 MMO 数据一致性完整锁链。

### 建议修复方案
重构离线玩家宗门关系的擦除路径。对于解散或强踢的成员，不能仅依靠在线内存的 `clearPlayerSectIdIfLoaded` 避让。应在宗门持久化写回时，引入对离线玩家实体的批量落盘异步写回或写透逻辑（例如通过持久化出信箱 Outbox，或者通过单独的异步 SQL 将 `UPDATE player SET sect_id = NULL WHERE playerId = ANY($1) AND sect_id = $2` 同步投影回 pg 主库），确保多租户及跨进程下的真源双向一致。

---

## 20. 热路径性能瓶颈：风水 Overlay 渲染采用全图地块 O(N) 扫描替代局部边界检索 (P1)

### 关联规范条款
> **8. 性能红线**
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配。
> - 热路径禁止依赖每 tick 全表扫描替代索引。

### 漏洞详情
在建筑风水系统运行时服务 [world-runtime-building.service.ts](file:///packages/server/src/runtime/world/world-runtime-building.service.ts) 中：
系统提供了为玩家渲染局部风水网格的 Overlay 更新 `buildFengShuiOverlayPatch` (行 534-572) 方法。
该方法原本的目的是只为以玩家坐标 `(centerX, centerY)` 为中心、半径 `radius = 12` 的 25x25 局部视野区域生成风水数据。
然而，在具体实现中，系统却采用了一次粗暴的针对整个地图实例所有单元格的全量 O(N) 扫描：
```typescript
const count = Math.max(0, Math.trunc(Number(instance.tilePlane?.getCellCount?.()) || 0));
for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    const x = instance.tilePlane.getX(cellIndex);
    const y = instance.tilePlane.getY(cellIndex);
    if (Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) > radius) {
        continue;
    }
    // ...
}
```

### 危害分析
1.  **大规模地块扫描拖慢 Tick 推进**：在商业级 MMO 的生产口径下，地图总格子数随着地图规模扩展非常巨大（例如一张 256x256 的大世界地图包含 65,536 个单元格，而玩家实际可见的风水格子仅有 625 个）。在多玩家并发移动或高频开启风水观察热路径中，对于每一次移动或刷新，主线程都必须为每个玩家进行多达数万次的全量 for 循环遍历与坐标差值计算。
2.  **大实例高并发 CPU 瞬间耗竭**：在一万个地图实例且有 5000 玩家高频在线位移时，这种全图地块扫描的设计会导致 V8 引擎在热路径上的 CPU 运算开销以 O(W * H) 平方级恶性膨胀，造成主 Tick 推进出现秒级拥堵，严重危害线上服务器的响应速度与整体承载带宽。

### 建议修复方案
重构该风水局域地块扫描为基于边界的局部 Chebyshev 检索。避免全图 `cellCount` 的 linear 扫描，直接以 `[centerX - 12, centerX + 12]` 与 `[centerY - 12, centerY + 12]` 为界，通过嵌套的双层小范围 range 循环，直接抓取在视野范围内的有效 `cellIndex`，将检索开销由 $O(N)$ 彻底压缩为恒定的 $O(1)$ 常数级开销（625 次循环）。

---

## 21. 玩家核心资产损毁漏洞：放置建筑时扣料事务性缺失导致物料扣减中途故障发生材料永久凭空消失 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 服务端是唯一权威来源；任何会影响玩家资产、位置、战斗、交易的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿。

### 漏洞详情
在建筑放置服务 [world-runtime-building.service.ts](file:///packages/server/src/runtime/world/world-runtime-building.service.ts) 的 `handleBuildPlaceIntent` (行 35-100) 中：
系统在校验了所需的建筑建材数量后，物理放置了建筑半成品，随后调用 `consumeBuildingCost` 去真实扣除玩家背包中的消耗材料：
```typescript
try {
    consumeBuildingCost(runtime.playerRuntimeService, playerId, costResolution.consumedItems);
}
catch (error) {
    context.instance.deconstructBuildingInstance?.(result.building?.id);
    throw error;
}
```
然而，在 `consumeBuildingCost` 的内部，系统是通过一个简单的同步循环来逐一触发玩家背包字段的扣减操作的：
```typescript
function consumeBuildingCost(playerRuntimeService, playerId, consumedItems) {
    for (const entry of Array.isArray(consumedItems) ? consumedItems : []) {
        const itemId = typeof entry?.itemId === 'string' ? entry.itemId : '';
        const count = Math.max(0, Math.trunc(Number(entry?.count) || 0));
        if (itemId && count > 0) {
            playerRuntimeService.consumeInventoryItemByItemId(playerId, itemId, count);
        }
    }
}
```

### 危害分析
1.  **极度恶劣的物料永久消失缺陷**：在 MMO 制造玩法中，高级建筑往往需要多种珍贵的矿石、木材与天材地宝。如果 `consumeBuildingCost` 执行中，扣除前面几种物料已经成功，而在扣除后面的某种物料时（例如由于并发写锁冲突 pg 超时抛错，或玩家下线引发异常），整个执行流抛出错误被 try-catch 拦截，系统虽然在地图上物理回滚删除了放置的半成品建筑（`deconstructBuildingInstance`）。
2.  **缺乏补偿导致背包资产受损**：由于在此之前已被成功扣除的前几种珍贵建材并没有任何回加（回滚）背包的业务代码补偿，这些好不容易攒齐的高阶资产在背包里会被直接抹去且半成品未生成，导致玩家核心资产凭空被彻底吞掉，极易诱发严重的玩家流失事故和客服维权事件。

### 建议修复方案
重构放置建筑的资产扣减，要么：
1. 引入背包扣减的事务性回滚器（Rollbacker），一旦扣减循环中途发生任何报错，逆向还原已成功扣除的全部材料。
2. 或者是先采用原子的 `Wallet/Inventory` 预冻结模式，在整个放置动作和数据库刷写完全完毕后再一并统一标记为扣除，坚守 MMO 资产交易和消耗的原子性底线。

---

## 22. 悄然状态大回档隐患：制造与强化 Tick 持久化采用 Fire-and-Forget 异步调用导致 DB 写入失败发生隐蔽角色存盘丢失 (P1)

### 关联规范条款
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复。

### 漏洞详情
在玩家制造突变服务 [world-runtime-craft-mutation.service.ts](file:///packages/server/src/runtime/world/world-runtime-craft-mutation.service.ts) 的核心写回收口 `flushCraftMutation` (行 133-160) 中：
当每次炼丹成功一炉、或者是装备强化 +12 级别成功的 Tick 被结算完成后，系统都需要将该技艺活动（activeJob）的快照持久化到数据库中。
然而，在写回的逻辑处理中，系统却将该核心的持久化落库动作写成了一个异步、且完全不作阻断等待和失败容灾的 `void` 任务，并对失败仅记录了一条警告日志：
```typescript
if (!options.skipActiveJobPersistence && !isDurableActiveJobPersistenceEnabled(deps)) {
    void this.persistActiveJobIfNeeded(playerId, deps).catch((error) => {
        this.logger.warn(`活跃任务持久化记账失败：${error instanceof Error ? error.message : String(error)}`);
    });
}
```

### 危害分析
1.  **极度致命的制造/强化状态回档隐患**：如果服务器高并发运行中，数据库发生暂时性的锁等待（Lock Activity）或者连接池超载（pg 物理连接耗竭），该写回快照落盘任务 `persistActiveJobIfNeeded` 会抛出 Timeout 或执行失败异常。然而在 Node.js 主线程内存中，玩家的角色早已结算成功（例如神兵强化成功、或者高级九转培元丹已经出炉），且没有任何中断或同步报错返给玩家。
2.  **内存与持久化彻底脱轨**：一旦在此之后服务器因为宕机发生热切换（Failover）或玩家断线重连重新从 pg 数据库载入真源，由于此前的写回悄悄丢失了，玩家上线时会惊愕地发现自己好不容易强化 +12 成功的武器变回了 +11，炼制的高阶丹药也彻底回档消失。这种缺乏强事务回读与失败熔断的“Fire-and-Forget”做法直接击穿了商业级 MMO 权威真源的最终一致性红线。

### 建议修复方案
重构技艺突变和强化的落盘逻辑。攸关装备级别及高级产出的关键 Tick 结算不应使用忽略等待的 `void` 挂起写入。必须采用同步 `await` 保证在 pg 连接池成功入库，或者引入出信箱（Outbox）高阶事务队列对失败进行持久化重试保障，若最终落库失败应在内存端优雅地进行降级阻断或回滚，守护持久化的数据铁律。

---

## 23. 时空一致性黑洞：地图降频实例 Throttling 补偿黑洞导致环境灵气流转、怪物技能 CD 及离线建造完全冻结漏洞 (P1)

### 关联规范条款
> **4. 权威运行时红线**
> - 单服多地图，每张地图独立 tick 循环；当前 tick 频率按现有实现保持 `1Hz`。
> **8. 性能红线**
> - **经验教训**：无玩家实例跳过 tick 不能简单跳过 (有 6 项需要补偿的副作用)。

### 漏洞详情
在地图运行时服务 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts) 中：
*   当一个长期处于无玩家在线而降频或暂停推进的地图实例重新被玩家登入接管时，系统会触发 `performThrottleCatchUp` (行 646-678) 补偿逻辑。
*   在该方法的实现中，系统试图批量解算并追平降频期间漏掉的 Tick（`missedTicks`）：
    ```typescript
    // 仅补偿了以下两项
    // 1. 怪物 respawnLeft
    monster.respawnLeft = Math.max(0, monster.respawnLeft - missedTicks);
    // 2. 地块损坏 respawnLeft
    const newRespawnLeft = Math.max(0, damage.respawnLeft - missedTicks);
    ```
然而，在这一短暂的 Catch-Up 补偿中，**多项环境物理副作用及实体时间线被直接无视并静止**。

### 危害分析
1.  **环境风水与天时灵气卡死**：房间风水刷新与地块自然灵气场流转（`advanceTileResourceFlow`）在离线降频期间完全被冻结。这导致挂机几个小时重新进入副本的玩家会遇到“时空静止”的环境（灵气分布和浓度同此前完全一致，毫无演进），严重危害风水流转的一致性。
2.  **怪物技能冷却（CD）时间线错乱**：怪物的攻击冷却时间（`attackCooldownTicks`）和 `attackReadyTick` 没有随漏掉的 Tick 被扣减和补偿。当玩家重新踏入副本时，本已脱战数小时的妖兽由于内部 Tick 时序未对齐，一旦接战，可能会因为时序差错误导致技能冷却被异常锁死或触发“连发多个瞬发技能”的秒杀 Bug。
3.  **挂机离线生产与建造进度归零**：在降频地图中正在进行自动建造、资源生产的建筑半成品，由于其建造时间（`buildRemainingTicks`）没有在 Catch-Up 中得到时间流逝的重算，使得离线期间所有的建筑和生产进度直接被吞掉，严重受损玩家的离线收益体验。

### 建议修复方案
重构 `performThrottleCatchUp` 补偿器。遵循“6项需要补偿的副作用”规范红线，在计算出 `missedTicks` 后：
1. 对该实例内的所有怪物执行技能 CD 的批量扣减。
2. 对处于建造或生产状态 of 建筑执行等效时间进度扣除。
3. 对地图灵气场资源流转进行断点等效流失解算，保证离线与在线的时空同步。

---

## 24. 妖兽追击贪心算法缺陷：chooseMonsterStep 盲目直扑导致拐角永久卡死与死区抖动漏洞 (P2)

### 关联规范条款
> **4. 权威运行时红线**
> - **经验教训**：深度限制 BFS 替代 A* 的建议是错误的（需要完整路径支持多格移动和绕障）。
> **8. 性能红线**
> - 热路径优化顺序：优先减少重复计算。

### 漏洞详情
在妖兽权威运行时 advancer 模块 [map-instance-monster-advancer.ts](file:///packages/server/src/runtime/instance/map-instance-monster-advancer.ts) 中：
*   在 `chooseMonsterStep` (行 258-277) 中，系统仅通过目标的 Chebyshev 距离符号对 X 与 Y 轴方向进行绝对贪心逼近：
    ```typescript
    const dx = Math.sign(targetX - fromX);
    const dy = Math.sign(targetY - fromY);
    // 仅收集这 1 到 2 个正向格子作为 candidates
    ```
*   在 `tryMoveMonsterToward` (行 319-341) 中，系统依次检查这几个 candidates，如果有任何一个格子是打开的（`isOpenTile`），就作为下一步移动指令输出。

### 危害分析
1.  **盲目直扑导致地形死区与拐角卡死**：这是一种完全基于正负号方向的直扑式贪心决策。如果怪物与玩家之间存在一个简单的“L”型墙角，或者被其他的障碍物（如建筑、阻挡地块）拦截，怪物正向逼近的方向全部会被 `isOpenTile` 标记为不可通行，进而导致 `tryMoveMonsterToward` 直接返回 `null`（原地不动）。妖兽完全无法感知侧向或绕路路径，会被地形**永久卡死在墙角**，玩家可以通过简单的卡视角地形机制实现无伤“卡怪”刷本，摧毁了战斗的真实性。
2.  **原地抖动现象**：当处于斜角边缘且其中一个方向被挡住时，怪物会在两个方向之间产生滑步或者来回左右踏步的原地抖动，视觉表现粗糙。
3.  **大批阻挡怪兽依然空耗主线程 Shadowcasting 算力**：更严重的是，即使大量后排怪物（例如一波 15 只怪物）被前排怪物彻底堵死（正向格子 `isOpenTile` 恒为 false 无法移动），但主线程在每个 Tick 的推进中，仍然在为这些“注定动弹不得”的后排怪兽们逐个调用 `resolveMonsterTarget` 里的 `collectVisibleTileIndices`（极其昂贵的多方向 Shadowcasting 视线投影计算），这带来了极大的热路径 CPU 资源浪费，引发高密度同屏战斗时服务器主线程帧率出现剧烈断崖式下滑。

### 建议修复方案
1.  重构妖兽寻路逻辑。在遭遇直扑阻挡时，引入带轻量级深度限制的 A* 启发式寻路或 BFS 路径检索，让妖兽具备基本的绕角和折返智能。
2.  在 `resolveMonsterTarget` 之前引入“完全被阻挡”状态监测。对于因四周或正向地块被挤满、本帧被判定绝对无法移动的后排妖兽，提前跳过或降频执行其昂贵的 Shadowcasting 视线投影检测，从热路径上最大程度减少无用功计算，释放 CPU 算力。

---

## 25. 境界突破与凝炼根基非原子化扣减导致材料“扣除逃逸”与“中途抛错资产蒸发”漏洞 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 任何会影响玩家资产、位置、战斗、交易、邮件、市场、GM 操作、地图状态的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复。

### 漏洞详情
在境界与进阶运行时服务 [player-progression.service.ts](file:///packages/server/src/runtime/player/player-progression.service.ts) 中：
1. **境界突破材料扣减逃逸**：
   在 `attemptBreakthrough` (行 892-903) 方法中，扣减突破消耗材料的逻辑为：
   ```typescript
   const transition = this.breakthroughTransitions.get(realm.realmLv);
   let consumedItems = false;
   for (const requirement of transition?.requirements ?? []) {
       if (requirement.type !== 'item' || !hasInventoryItemCountAtLeast(player, requirement.itemId, requirement.count)) {
           continue;
       }
       this.consumeInventoryItemById(player, requirement.itemId, requirement.count);
       consumedItems = true;
   }
   ```
   虽然前面执行了 `preview.canBreakthrough` 整体合法性校验，但在主线程真正顺序执行材料扣减时，却缺少全套 requirements 的二次一致性断言。如果在高并发重发请求或多端竞态异动下，某个要求的珍贵材料已在扣减中途被消耗完，那么该 requirement 会由于 `!hasInventoryItemCountAtLeast` 判定成立而直接被 `continue` **静默跳过**！
   这导致突破并没有被拦截，依然成功达成（境界 `preview.targetRealmLv` 被赋予并存盘），但部分材料却在未被扣除的情况下直接漏掉，变成了“玩家材料不够也强行突破成功”的重大逃逸漏洞。
   
2. **凝炼根基扣减非原子化导致资产凭空损毁**：
   在 `refineRootFoundation` (行 930-938) 中：
   ```typescript
   for (const item of preview.items) {
       this.consumeInventoryItemById(player, item.itemId, item.count);
   }
   ```
   此处更是完全没有进行扣除前的 all-or-nothing 预校验，就直接顺序扣减背包中的各要求材料。如果在扣到中途某个材料（例如第 2 或第 3 个）时，由于背包整理、并发消耗导致数量不够抛出 Error 崩溃中断，前面已经成功执行过 `consumeInventoryItemById` 的前几种珍贵道具就已经被物理扣除，而整个方法却因为崩溃中途夭折（`player.rootFoundation` 未增加，境界也未重置）。这导致被扣掉的道具凭空消失，无法回滚恢复。

### 危害分析
1. **游戏平衡与数值逃逸**：恶意玩家可以通过网络构造或高并发多开触发竞态，实现用残缺、不足额的突破丹药/天门草药直接白嫖高阶突破或凝炼根基，造成极高阶装备或修为被滥刷。
2. **重度玩家资产永久蒸发**：正常玩家在卡顿、重发或整理背包的边缘时，极易因 `refineRootFoundation` 中途抛错而导致辛苦收集的几百个高阶凝根材料白白蒸发，造成恶性存盘损毁，引起极度严重的客诉。

### 建议修复方案
1. **引入 All-or-Nothing 原子预校验**：在开始执行任何扣除物理材料的循环前，必须遍历所有的 `requirements` 进行数量前置确认。只有在全部物品数量都绝对满足的前提下，才获准进入扣除阶段，否则立刻拒绝操作。
2. **实现扣除回滚 (Rollback) 或库存锁定事务**：对 `refineRootFoundation` 与 `attemptBreakthrough` 引入快照补偿（使用已有的 rollback 模式捕获状态），若扣除中途发生异常，应如数退回已扣除材料；或在消耗时采用底层具备原子性的 `durableOperationService` 批量消耗事务，确保操作的绝对原子性。

---

## 26. 分布式多节点部署下纯内存互斥锁虚设导致唯一兑换码高并发“双花”超发重大逻辑缺陷 (P0)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连、长期运营稳定性。
> - 任何会影响玩家资产、位置、交易、邮件、市场的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。

### 漏洞详情
在兑换码权威运行时服务 [redeem-code-runtime.service.ts](file:///packages/server/src/runtime/redeem/redeem-code-runtime.service.ts) 中，校验和兑换的核心方法 `redeemCodes` 使用了基于 Node.js 内存 Promise 链的互斥机制 `runExclusive`：
```typescript
async redeemCodes(playerId, submittedCodes) {
    // ...
    return this.runExclusive(async () => {
        // ...
        for (const submittedCode of submittedCodes) {
            const codeEntry = this.codes.find((entry) => entry.code === submittedCode);
            if (codeEntry.status === 'used') continue; // 校验是否已使用
            
            // 异步调用外部持久化与账户发物 (此处包含了 await pg 连接池/外部 IO)
            if (inventoryItems.length > 0) {
                await this.grantInventoryRewards(player, inventoryItems, submittedCode);
            }
            for (const item of walletItems) {
                await this.grantWalletReward(player, item, submittedCode);
            }
            
            // 异步发奖成功后，才在内存中置为已使用
            codeEntry.status = 'used'; 
            // ...
        }
        if (changed) { await this.persist(); }
    });
}
```
虽然单服下单节点的并发请求在进入 `action` 时会被 `mutationQueue` 串行化，但是在商业级分布式多节点并发口径下，这种基于单机内存的 `mutationQueue` 互斥锁完全是虚设的！
当玩家 A 在节点 A 发送兑换请求，玩家 B 在节点 B 发送兑换请求，两个人都兑换同一个唯一的激活码 `X` 时：
1. 节点 A 的 `this.codes.find` 和 节点 B 的 `this.codes.find` 几乎同时执行，均认定兑换码 `X` 状态为 `active`。
2. 节点 A 的协程在执行 `await grantInventoryRewards` 时暂时让出 CPU 并阻塞等待 pg IO。
3. 同时，节点 B 的协程也通过了校验，并同样并行调用 `await grantInventoryRewards` 执行发物 pg 写入。
4. 两个节点的玩家都成功获得了该唯一兑换码绑定的珍贵奖励。
5. 之后，两个节点先后把状态置为 `used` 并各自覆盖写入数据库 `server_redeem_code` 关系表，没有引发任何冲突 and 拦截。
最终，本该唯一的兑换码被成功“双花”兑换了两次或更多次！

### 危害分析
高并发或玩家恶意通过工具多开、跨地区同时发送相同兑换码请求，可以直接击穿服务器内存限制，实现同一个限量绝版礼包码、充值码、元宝码的无限次重复领取，无限超发元宝与充值资产，造成毁灭性的商业级经济雪崩。

### 建议修复方案
1. **状态核销下沉数据库真源事务**：彻底废除基于单机内存的 `mutationQueue` 进行状态校验的虚假隔离设计。
2. **引入乐观锁/悲观锁原子更新**：兑换码的使用状态校验必须采用数据库物理锁或带状态断言的原子更新（例如 `UPDATE server_redeem_code SET status = 'used', used_by_player_id = $1, used_at = now() WHERE code = $2 AND status = 'active'`）。
3. **“先扣减，后发货”发奖机制**：只有在上述原子更新 SQL 返回的影响行数确为 1 时，才判定本次兑换码核销合法；通过核销检验后，再去调用 `grantInventoryRewards` 发放道具。彻底根除跨节点并发下的双花超发隐患。

---

## 27. 属性重算系统缺乏分级缓存与脏状态检查导致高并发下 CPU 计算雪崩与 Minor GC 抖动 (P1)

### 关联规范条款
> **8. 性能红线**
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配。
> - 热路径禁止依赖临时字符串键拼装、每 tick 全表扫描替代索引。

### 漏洞详情
在玩家属性结算服务 [player-attributes.service.ts](file:///packages/server/src/runtime/player/player-attributes.service.ts) 中：
1. **属性重算缺乏分级脏检查**：
   在 `recalculate` (行 41-73) 中，每次调用都会同步触发完整的 `buildState` 重新计算。然而，玩家的基础六维属性（`rawBaseAttrs`）、已装备列表（`player.equipment.slots`）、以及已激活的功法状态（`player.techniques`）在绝大部分游戏时间里都是绝对恒定不变的（仅在脱穿装备、境界突破等低频操作时变化）。
   但是，在目前的实现中，系统完全没有提供“基础属性层”、“装备层”、“功法层”和“Buff层”的分级缓存与 dirty 守卫检查。只要玩家由于高频位移触发了地块风水变化（更新 `player.fengShuiLuck`）、或者受到外界任何微弱状态波动，就会被迫在主线程中同步执行一次极其庞大的全量属性与战斗数值解算，包括对每个装备槽位境界乘区转换 `applyEquipmentAttributeEffectivenessToItemStack` 等。
2. **高频堆对象分配导致 Minor GC 抖动**：
   在 `buildState` (行 80-232) 中，每次重算都在内存中频繁通过 `cloneAttributes`、`normalizeRawBaseAttributes` 甚至 `cloneNumericStats` 分配新的短命属性和大型嵌套数值对象。高并发下频繁的 Minor GC (Scavenge) 垃圾回收会占用大量主线程时间片，从而引起严重的 Tick 抖动与微卡顿。
3. **技艺升级后属性面板无法实时更新 (时序滞后)**：
   在技艺管线 [technique-activity-pipeline.service.ts](file:///packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts) 的 `applyTechniqueActivityResolveExperience` 方法中，当技艺发生升级时，虽然调用了 `markPipelineDirty(player, ['profession'])` 标脏了持久化分域，但**完全没有同步触发 `playerAttributesService.recalculate(player)`** 属性重算！这导致受技艺等级直接加成的面板属性（如锻造成功率、炼丹速度加成等）在玩家重新穿戴装备或下线重连前，完全无法实时生效。

### 危害分析
在高并发（5000 玩家在线）激战或大范围跑图时，成千上万个玩家的高频移动会因为风水场或环境 Buff 波动在每个主 Tick 触发上万次全量 `recalculate`，使得 Node.js 单线程瞬间过载，造成严重卡顿；同时技艺升级后的面板属性滞后对玩家体验造成不良影响。

### 建议修复方案
1. **实现分级缓存与脏隔离**：在 `PlayerAttributesService` 中将基础境界层、装备加成层、Buff 临时层解耦并各自进行脏标记守卫。只有在各自领域发生实质性改变时，才重写对应缓存层，利用轻量级的增量叠加替代主线程全表重算。
2. **零临时对象重构**：复用内存中的 `Scratch` 结构（如已有的 `percentBonusAccumulatorScratch` 等），将频繁分配的短命对象改写为可复用的结构体，彻底斩断 GC 压力。
3. **补齐技艺升级重算路径**：在技艺升级标脏 profession 时，同步触发一次 `recalculate(player)` 从而保障面板数值的绝对准确性。

---

## 28. 离线/登出强注销无条件重置制造剩余 ticks (remainingTicks = 0) 导致离线制造进度永久卡死与死锁漏洞 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 任何会影响玩家资产、位置、战斗、交易、邮件、市场的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。

### 漏洞详情
在玩家分批刷盘持久化服务 [player-persistence-flush.service.ts](file:///packages/server/src/persistence/player-persistence-flush.service.ts) 中：
在玩家下线或被断线踢出进行数据强行注销刷盘的收口方法 `forceDiscardAndMarkOffline` (行 600-630) 中：
```typescript
if (player.alchemyJob) player.alchemyJob.remainingTicks = 0;
if (player.forgingJob) player.forgingJob.remainingTicks = 0;
if (player.enhancementJob) player.enhancementJob.remainingTicks = 0;
if (player.gatherJob) player.gatherJob.remainingTicks = 0;
if (player.buildingJob) player.buildingJob.remainingTicks = 0;
```
系统在这里对离线注销玩家身上的所有活跃制造任务执行了**无差别的强制重置为 0**！
而玩家所有的技艺任务推进是在 `WorldRuntimeCraftTickService` 中仅对在线玩家进行的。
当玩家下线后，系统不仅没有针对离线时间对这些任务进行等效的流逝计算（挂机补偿缺失），相反，还把 `remainingTicks` 直接刷成了 `0` 并永久写入了 PostgreSQL 数据库。
这导致当玩家下一次重新上线并重新加载 these 任务时：
在技艺管线推进的 Stage 1 Guard 条件中：
```typescript
// Stage 1: Guard
if (!job || Number(job.remainingTicks) <= 0) return emptyTickLifecycleResult(kind);
```
由于 `remainingTicks` 已经被覆写为 `0`，上面的 `Number(job.remainingTicks) <= 0`永远成立，导致该方法每次都被直接 `return` 拦截！制造工作被迫直接死锁在 `remainingTicks === 0` 的非结算非取消状态！

### 危害分析
玩家在炼制需要数小时的极高阶绝版丹药或神兵利器时，如果发生断线、闪退或正常下线，其制造工作**永远无法完成结算**，而且也无法成功取消（取消会因为 `completedCount` 等时序状态与 ticks 不一致而报异常），该任务槽被永久死锁封印，且珍贵材料与金钱永久损毁。

### 建议修复方案
1. **废除下线时的 `remainingTicks = 0` 覆写**：移除 `forceDiscardAndMarkOffline` 中对制造任务 `remainingTicks` 的强制归零，保留其下线前的真实进度，确保数据真源在离线和存盘时绝对完好。
2. **引入离线挂机制造补偿 (Offline Crafting Catch-Up)**：当玩家重新上线加载 `player` 实体时，根据其离线时间戳（`offlineSinceAt`）计算与当前时间差，折算出离线流逝 ticks 数，并在启动时一次性对 `remainingTicks` 执行等效的 Catch-Up 扣减与批次结算，实现真正的离线制造补偿。

---

## 29. 装备境界缩放边界未定义逃逸导致非玩家实体免折减越权获取高阶神兵 100% 满额属性重大逻辑漏洞 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 服务端是唯一权威来源；客户端只做显示、输入、表现层状态、缓存和可回放派生。
> **4. 权威运行时红线**
> - 属性体系、境界缩放以及非玩家实体的属性与战斗计算。

### 漏洞详情
在共享层装备折减计算函数 `getEquipmentRealmEffectiveness` ([enhancement.ts](file:///packages/shared/src/enhancement.ts#L104-L115)) 中：
```typescript
export function getEquipmentRealmEffectiveness(
  playerRealmLv: number | undefined | null,
  equipmentRealmLv: number | undefined | null,
): number {
  const normalizedPlayerRealmLv = normalizeOptionalPlayerRealmLv(playerRealmLv);
  if (normalizedPlayerRealmLv === undefined) {
    return 1;
  }
  const normalizedEquipmentRealmLv = normalizeEquipmentRealmLv(equipmentRealmLv);
  const realmGap = Math.max(0, normalizedEquipmentRealmLv - normalizedPlayerRealmLv);
  return EQUIPMENT_REALM_EFFECTIVENESS_FACTOR_PER_LEVEL ** realmGap;
}
```
该方法被设计用于在玩家（Player）越级穿戴高阶装备时，根据玩家境界与装备境界的差值（`realmGap`）对装备属性进行指数衰减折算。
然而，在非玩家实体（例如：玩家召唤的宠物、傀儡分身、召唤物，或者拥有独立装备栏的 NPC 护卫、野外穿装怪物等）在通过属性解算服务（`player-attributes.service.ts` 或通用属性引擎）计算其装备属性加成时，由于 these 非玩家实体在主实体结构中并不存在 `realmLv` 字段，传入的 `playerRealmLv` 会为 `undefined` 或 `null`。
此时，函数会由于 `normalizedPlayerRealmLv === undefined` 条件成立而**直接返回 `1`**（即 100% 满额加成，不产生任何境界缩放折减）！

### 危害分析
1. **战力严重崩坏与越级白嫖**：低境界玩家（如练气期）召唤的低阶傀儡分身，如果装备了玩家越级给予的化神期甚至渡劫期“开天神兵”，按正常逻辑，该神兵在此低境界分身上应产生极大幅度的折减（如只发挥 1% 属性）。但由于境界逃逸漏洞，分身在计算属性时传入 `realmLv = undefined`，直接触发 `return 1` 判定，使其完美发挥 100% 化神期神兵属性。这导致召唤物/傀儡战力瞬间暴涨万倍，秒杀全图，彻底摧毁游戏的境界压制和数值平衡。
2. **潜在的反常物理边界**：当高阶怪物穿戴高阶装备时，也可能由于 `undefined` 绕过折减，导致低阶玩家在特殊地图面对怪物时被非正常物理秒杀。

### 建议修复方案
对 `getEquipmentRealmEffectiveness` 引入明确的缺省降级守卫。当检测到 `playerRealmLv` 为 `undefined` 且目标实体系越级穿戴时，不应无条件返回 `1`，而是应该：
1. 传入当前实体的境界上下边界（例如，对于非玩家傀儡，缺省境界应降级绑定为其主人的境界等级，或默认为最低境界等级 `1`）。
2. 在 `getEquipmentRealmEffectiveness` 中，如果主体境界缺失，应基于防御性原则，对高阶装备默认执行最大折减系数或默认折算为 1 级境界，只有在装备等级小于等于 1 级时才免折减。

---

## 30. 高并发 AOE 击杀掉落物交付空间校验与塞物非原子化导致背包超载物理爆仓与角色存盘死锁崩溃漏洞 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 任何会影响玩家资产、位置、战斗、交易、邮件、市场的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - tick 内避免直接数据库 IO；需要持久化时通过 flush、outbox、worker、快照或受控队列转出。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复和审计追踪。

### 漏洞详情
在怪物击杀掉落服务 [world-runtime-player-combat.service.ts](file:///packages/server/src/runtime/world/combat/world-runtime-player-combat.service.ts#L251-L274) 中：
```typescript
    async deliverMonsterLoot(playerId: string, instance: any, x: number, y: number, item: any, deps: any, sourceRefId = '') {
        if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                throw new Error(`inventory_grant_player_missing:${playerId}`);
            }
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            ...
            return;
        }
        deps.spawnGroundItem(instance, x, y, item);
        ...
    }
```
此处存在重大的非原子操作漏洞：
1. **空间校验与塞物分离**：调用 `canReceiveInventoryItem` 检查背包是否有余位，与随后调用的 `receiveInventoryItem` 物理往背包塞道具，二者是分离的同步步骤。
2. **高并发 AOE 击杀的协程交错竞态**：当玩家使用大范围 AOE 技能瞬间击杀 10 只怪物时，系统会在同一个 Tick 内为每个死亡怪物触发掉落物交付。虽然单个 Node.js 进程在微观上是单线程的，但由于 `deliverMonsterLoot` 内部有大量的 `async/await`（例如调用其他异步钩子或在循环处理中发生协程切换），如果在并发处理中，多个掉落物品的 `deliverMonsterLoot` 被同时调度，在进行 `canReceiveInventoryItem` 判定时，背包里的临时占用尚未被执行的 `receiveInventoryItem` 填满，这就导致所有 10 次独立掉落的空间校验**同时通过**。
3. 随后，这 10 个道具被依次物理塞进背包（`receiveInventoryItem`），使背包实际容量瞬间超出了最大容量（Capacity，如 40 格），导致背包物理爆仓（装了 45/40 个道具）。

### 危害分析
1. **存盘回写崩溃与角色永久锁死**：一旦玩家背包中持有的物品数量超出了最大物理上限，在随后的 5 秒周期或断线强刷 `PlayerPersistenceFlushService` 存盘时，数据库的 schema 校验（或 pg 字段长度限制、JSON 属性长度验证）会直接抛出**“背包格数超出上限约束”**的异常崩溃，导致整个存盘流程夭折。该角色的数据将永远无法回写进 PostgreSQL，任何后续的金钱、境界、装备更新全部丢失。
2. **“起尸”登录卡死**：如果玩家此时下线或重启服务，当他重新上线时，登录解析器在反序列化玩家 `inventory` 字段时，会由于背包数组超限而触发 JSON/Schema 强一致性断言崩溃，将玩家永久拦截在 Loading 加载界面，造成毁灭性的角色“废号”事故。

### 建议修复方案
1. **引入排队锁与原子增量占位**：在执行掉落交付前，对该玩家的掉落处理流程引入内存同步队列表，或者重构 `receiveInventoryItem`：使其在执行空间判定与塞物时，使用单条同步事务锁（All-or-Nothing）或者在判定通过时立刻在背包中插入“预分配槽位（Reservation Slot）”占坑，从根本上防止越界爆仓。
2. **物理溢出容错**：在 `receiveInventoryItem` 底层增加二次极限断言。如果因并发异动导致塞物时背包已满，应立刻将该道具退化抛出，由外层捕获并无条件调用 `spawnGroundItem` 扔在地上，保证背包数组长度绝对不越界。

---

## 31. Distributed 多节点部署下坊市内存互斥锁虚设与离线 Storage 并发覆盖写导致严重资产脑裂与“双花”刷物重大一致性漏洞 (P0)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连、长期运营稳定性。
> - 服务端是唯一权威来源；高频链路必须按玩家数、实体数、地图数增长后的成本设计。
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复和审计追踪。

### 漏洞详情
在坊市交易运行时服务 [market-runtime.service.ts](file:///packages/server/src/runtime/market/market-runtime.service.ts) 中存在两个致命的分布式竞态缺陷：
1. **内存串行锁的跨节点失效**：
   坊市的修改机制 `runExclusive` (行 3615-3631) 依赖于单进程内的 Promise 链 `this.marketOperationQueue` 进行操作串行化。
   这种基于单机内存的串行化机制在**分布式多节点（多服集群）**环境下毫无防备。当多名玩家在不同的物理节点服务器上对同一个挂单、或者对同一个离线玩家的挂单执行买入/撮合操作时，不同节点上的 `runExclusive` 会完美并行运行，毫无拦截效果。
2. **离线 Storage 的全量覆写导致 Lost Update**：
   由于 `canUseDurableBuyNow` 与 `canUseDurableSellNow` 被硬编码写死为 `false`，系统在买入一口价 `buyNow` 和卖出一口价 `sellNow` 中，对离线玩家的资产处理会直接退化走内存操作。
   系统在内存中直接调用 `this.addItemToStorage(playerId, item, context)` 往已 Hydrate 进内存的离线 storage 塞物。在交易结束时，系统将通过 `marketPersistenceService.persistMutation` 全量 `upsert` 这个离线玩家在当前节点上的 `storage` 全量 JSON 结构。
   如果在分布式环境下，节点 A 的玩家购买了该离线玩家挂单 A（获得金钱），节点 B 的玩家同时也购买了该离线玩家挂单 B（获得金钱）。两个节点各自 Hydrate 了离线玩家的 storage 快照并进行了局部修改，随后并发写回 PostgreSQL。
   这会导致**写回覆盖（Lost Update）**：后写回的节点会无情覆盖掉先写回节点的数据。这导致其中一笔交易的钱直接被物理抹除，钱货凭空消失！
3. **挂单双花（Double Spending）刷物**：
   同理，如果同一个挂售订单 `Order1` 正在被两个不同节点上的玩家同时抢购，由于跨节点无锁且为非原子 SQL 更新，两个节点均认定 `Order1.remainingQuantity > 0`。撮合完成后，两边都会把 `Order1` 的道具发放给各自节点的买家，随后各自全量 `upsertOrders` 写入数据库。这导致了同一个坊市挂单被物理复制了两份并发放给不同玩家的**重特大刷物/双花漏洞**！

### 危害分析
1. **毁灭性的坊市刷物与双花**：恶意玩家可以通过简单的多开和高并发网络重发，在不同服务器节点上并行抢购高阶武器挂单，实现 100% 成功率的绝版神兵、极品功法双花复制，彻底搞垮全服经济体系。
2. **重度玩家资产凭空蒸发**：离线玩家的坊市仓库（Storage）在高并发撮合中被无情覆盖，造成“货卖掉了但金钱未到账”、“存入坊市仓库的珍贵材料离奇消失”等特大恶性事故，且没有任何事务回滚机制，直接瘫痪客服渠道。

### 建议修复方案
1. **强制恢复并接入 Durable ACID 事务**：必须移除硬编码的 `canUseDurableBuyNow = false`，恢复并全面激活基于 pg 乐观锁/行级排他锁或两阶段提交的 `durableOperationService`。所有的金额扣减、货物转移必须绑定在 pg 的原子事务（Database Transaction）中。
2. **废除全量 Storage 覆写，改用原子增量 SQL**：对 `storage` 表的修改绝不能使用全量 upsert，而必须改用细粒度的原子增量 SQL操作（如 `INSERT INTO market_storage ... ON CONFLICT DO UPDATE ...` 或只对特定 slot 进行更新），杜绝任何 Lost Update 覆盖风险。

---

## 32. 分布式并发邮件写覆盖静默丢包与非持久化发物顺序倒置导致附件“无限重领”无限刷物重特大安全漏洞 (P0)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 任何会影响玩家资产、位置、战斗、交易、邮件、市场的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。
> - 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复和审计追踪。

### 漏洞详情
在邮件系统运行时服务 [mail-runtime.service.ts](file:///packages/server/src/runtime/mail/mail-runtime.service.ts) 中，存在极度致命的并发写覆盖与发奖事务倒置漏洞：
1. **多节点下邮件列表并发写覆盖与丢失**：
   与坊市系统类似，`MailRuntimeService` 采用单机内存锁 `runSerializedMailboxWrite` (行 821-835) 来串行化同一个玩家的邮箱写操作。
   然而，在多节点（或多服分布式集群）环境下，当系统跨节点同时向同一个玩家的邮箱发送邮件时（例如：玩家在节点 A 挂机产出发送邮件，同时 GM 在管理节点发送全服补偿邮件）：
   - 节点 A 和节点 B 会分别加载该玩家的 mailbox 全量 JSON 结构。
   - 节点 A 追加了挂机邮件，将 `mailbox.revision` 从 5 增至 6，并执行 `persistMailboxMutation` 写回。
   - 节点 B 并行追加了 GM 补偿邮件，同样将 `mailbox.revision` 从 5 增至 6，并写回。
   由于写回是基于全量 payload 更新（`serializeMailboxPayload`），后写入的节点会**无条件覆盖抹去**先写入节点追加的新邮件，导致高并发或跨节点下的**邮件大范围静默丢失**与 `revision` 错位！
2. **非持久化分支下“发物在前、核销在后”导致的无限刷物漏洞**：
   在玩家批量提取邮件附件 `claimAttachments` (行 258-358) 中，如果未启用 `durableOperationService`，系统会回退执行以下非强事务分支：
   ```typescript
   // 1. 先把钱发给玩家钱包
   for (const credit of resolution.walletCredits) {
       this.playerRuntimeService.creditWallet(playerId, credit.walletType, credit.count);
   }
   // 2. 先把附件道具物理塞进玩家背包
   for (const item of resolution.inventoryItems) {
       this.playerRuntimeService.receiveInventoryItem(playerId, item);
   }
   const now = Date.now();
   // 3. 在内存中把邮件状态改成已领取 (claimedAt = now)
   for (const entry of visible) {
       entry.claimedAt = now;
       ...
   }
   mailbox.revision += 1;
   this.compactMailbox(mailbox);
   // 4. 最后，异步 await 持久化邮件状态写回数据库
   await this.persistMailboxMutation(playerId, mailbox, visible);
   ```
   系统**先将极其珍贵的附件道具和大量金钱物理发放到了玩家的在线内存中，然后再异步去数据库中将该邮件的领取状态标记为“已领”**。
   如果在这个过程中，当道具和钱已经发到背包后，执行 `await this.persistMailboxMutation` 发生了任何数据库连接超时、死锁、崩溃或者 Node.js 进程重启：
   - 玩家的背包和钱包已经实实在在地拿到了这批道具和钱。
   - 数据库中的邮件状态**依然保持为 `claimedAt = null`（未领取状态）**！
   当玩家再次登录，或者邮箱在内存中被淘汰重建后，这封邮件在数据库中还是“未领”状态，玩家又可以再次点击“批量领取”，重复白嫖！

### 危害分析
1. **毁灭性的无限刷物品 BUG**：恶意玩家可以通过网络延迟工具、故意制造数据库高负载或锁竞争，让 `persistMailboxMutation` 超时失败，从而在游戏中实现**无限次重复领取欢迎信附件、全服大奖、拍卖退款或充值奖励邮件**！这可以直接以指数级速度刷出无限的元宝、极阶道具，彻底摧毁商业游戏的生命线。
2. **大范围邮件静默丢失与客诉**：多节点并发写导致普通玩家在副本或挂机时产出的奖励邮件被静默抹除，引起海量的客诉和负面舆论，破坏游戏的正常留存。

### 建议修复方案
1. **扭转核心发奖与核销事务顺序，实施“先核销，后发货”**：在领取附件时，必须首先在数据库中采用带乐观锁或状态断言的原子 SQL 更新，将邮件的 `claimed_at` 从 `NULL` 变更为当前时间（例如：`UPDATE player_mail SET claimed_at = now() WHERE mail_id = $1 AND claimed_at IS NULL`）。
2. **强一致性事务保障**：only 且仅在上述数据库原子核销更新成功（确认返回行数为 1）后，系统才获准调用 `receiveInventoryItem` 向玩家背包发放道具。即使后续玩家发放因网络原因未成功，也可保留审计日志并进行失败补偿，从根本上物理杜绝任何通过阻断持久化写回以无限白嫖附件的刷物漏洞！
3. **剥离全量 Mailbox 更新，改用增量邮件行模型**：废除把所有邮件全部挤在一个大 JSON 字段里的反商业设计，将邮件改为关系型数据库的单行记录（Row-per-Mail），增删查改全部基于行级 SQL 交互，彻底规避跨节点覆盖丢失。

---

## 33. ActorPersistencePolicyService 架构设计虚设与核心落盘服务零鉴权接入导致非持久化实体脏数据污染与玩家快照物理损坏漏洞 (P1)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连、长期运营稳定性。
> - 任何会影响玩家资产、位置、战斗、交易、邮件、市场的改动，都必须考虑持久化、审计、回读、恢复和测试清理。
> **9. 持久化与运营数据红线**
> - 只要某状态要求"下次还在"，正式真源就必须是数据库。

### 漏洞详情
在 `packages/server/src/runtime/actor/actor-persistence-policy.service.ts` 中设计并定义了多套 Actor 的持久化策略服务（例如对于 `bot` 默认使用 `none` 拒绝持久化，对于 `clone` 或 `pet` 默认拒绝大多数独立分域持久化）：
```typescript
function defaultPolicyForKind(kind: EphemeralActorKind | null): ActorPersistencePolicy {
  if (kind === 'bot') {
    return { kind: 'none' };
  }
  if (kind === 'clone' || kind === 'pet') {
    return { kind: 'none' };
  }
  return { kind: 'full' };
}
```
并且在行 31-32 的设计注释中声称：
> “第 1 批接入点先约定枚举，下一批由具体服务调用 isPersistenceAllowed 时声明。”

然而，在目前的整个服务端落地上，除了 `native-bot.service.ts` 做了一些非核心的辅助性绑定之外，**核心的脏数据落库与强持久化事务服务（如 `PlayerPersistenceFlushService`）根本没有任何一处接入或调用 `ActorPersistencePolicyService.isPersistenceAllowed` 来进行鉴权过滤！**
这导致核心持久化落盘服务直接无视了该策略服务的控制，对所有实体都默认执行了 `full`（全量读写）持久化机制。

### 危害分析
1. **非持久化实体脏数据大范围污染**：分身（`clone`）、宠物（`pet`）或临时机器人（`bot`）等实体，在代码层由于复用了大部分玩家 entity 的基础属性和背包逻辑，它们的 `playerId` 也有可能由于运行时构造冲突而被临时写入内存。当进行周期的批量脏快照 Flush 时，由于存盘服务缺少对 `isPersistenceAllowed` 的策略鉴权，这些临时实体的属性变动、临时背包、临时 Buff 状态会被**强行存入数据库的 player 关系表中**！
2. **玩家存档物理覆盖与损坏**：如果分身实体的 `playerId` 被复用（例如分身继承了 owner 的 ID 并在派生时没有做严格的 ID 隔离），分身在退出或销毁时触发的脏刷盘，会将玩家真实的账号存档覆盖，发生毁灭性的“角色存档回滚和状态错乱”特大安全事故。

### 建议修复方案
1. **强制核心 Flush 服务接入策略鉴权**：在 `PlayerPersistenceFlushService` 执行批量脏玩家落盘循环前，必须首先调用 `ActorPersistencePolicyService.isPersistenceAllowed(playerId, domain)` 进行严格的策略鉴权，只有在明确允许持久化时，才执行写入 SQL，否则立刻无条件丢弃或阻断该实体的存盘动作。
2. **在启动期和执行期补齐完整的边界审计单元**：对非持久化类型的 ephemeral 实体建立严格的物理 ID 强制隔离前缀（例如 `bot_`、`clone_`），防止其与普通玩家 ID 产生交叉污染。

---

## 34. 全局 Tick 调度串行叠加机制导致多地图实例“时序严重漂移失真”与玩家跨图技能冷却/Buff 瞬间失效/永久死锁重大逻辑缺陷 (P0)

### 关联规范条款
> **3. 商业级 MMO 口径**
> - 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连、长期运营稳定性。
> - 服务端是唯一权威来源；高频链路必须按玩家数、实体数、地图数增长后的成本设计。
> **4. 权威运行时红线**
> - 单服多地图，每张地图独立 tick 循环；当前 tick 频率按现有实现保持 `1Hz`。

### 漏洞详情
在多地图逻辑帧推进管理服务 `world-runtime-instance-tick-orchestration.service.ts` 的 `advanceFrame` (行 325-400) 中，多张地图实例的所有逻辑步（steps）是在同一个 CPU 循环内**顺序、串行叠加累加**的：
```typescript
        for (const { instance, steps, speed, sleepMonsterAi } of instanceStepPlans) {
            for (let index = 0; index < steps; index += 1) {
                ...
                deps.tick += 1;
                totalLogicalTicks += 1;
                ...
                result = instance.tickOnce(instanceIntents, { sleepMonsterAi: sleepMonsterAi === true }) ?? result;
```
每当当前地图实例在当前的 1 秒物理帧周期内推进逻辑步时，全局的 `deps.tick` （世界总 Revision）就会自增 `1`。
在商业级 MMO 的 10,000 个地图实例的生产口径下，如果本秒物理时间内有 1,000 个实例处于活跃并推进 1 步：
- 实例 1 在运行时，`deps.tick` 从 100 自增为 101，随后运行其 `tickOnce`。
- 实例 2 在运行时，`deps.tick` 从 101 自增为 102，运行其 `tickOnce`。
- ...
- 实例 1000 在运行时，`deps.tick` 自增为了 1100，随后运行其 `tickOnce`。
明明所有的实例是在**现实时间的同一个 1 秒物理周期内并行发生 Tick 推进**的。但在时序逻辑中，由于 `deps.tick` 的串行叠加，使得实例 1000 在运行其当前秒的第一帧 Tick 时，全局时钟 `deps.tick` 已经直接**漂移前进了 1,000 帧（相当于 1000 秒）**！

### 危害分析
1. **玩家跨图时 Buff 瞬时过期与 CD 离奇刷新**：如果玩家从实例 1（当前帧全局 tick = 101）瞬间跨图传送到实例 1000（当前帧全局 tick = 1100），由于全局时钟的恐怖时序漂移，玩家在系统判定中直接离奇度过了 **999 秒**！这会导致玩家身上挂载的各种护盾、增益 Buff 瞬间因“时效过期”被全部强制清除，而其原本需要几分钟 CD 的高阶大招其 `cooldownReadyTick` 会直接被全局 tick 追上，实现瞬间刷新！
2. **反向跨图导致的技能 CD 永久死锁锁死**：相反，如果玩家从实例 1000（全局 tick = 1100）反向传送到实例 1。此时实例 1 的全局 tick 仅仅是 101。由于玩家身上的技能 `cooldownReadyTick` 之前被标记为了 1100 之后的未来帧，而实例 1 拿到的时钟还在 101 慢步，这会导致该玩家的技能冷却在当前地图被**物理封印死锁**！直到整个服务器物理运行几个小时、让 tick 缓慢爬升超过 1100 后，玩家才能重新释放技能，造成极度灾难性的玩家体验。
3. **时序投影与网络 Delta 包脑裂**：时序的大范围无规律漂移，会使高并发下的 AOI 同步与 delta 包的时钟校验彻底错乱，造成客户端严重卡顿、回弹与状态异常。

### 建议修复方案
1. **解耦实例 Local Tick 与全局时钟 World Tick**：全局的 `WorldTick` （世界总 Revision）在单次物理 frame 步进中，只应在所有实例开始循环前**统一自增 1**（即所有并行的实例在当秒内拿到的 `WorldTick` 绝对是恒定相同的，例如都是 101）。
2. **引入相对时间戳解算**：技能 Cooldown 与 Buff 持续时间的推进，应基于实例本地时钟（`instance.tick`）或基于现实物理时间的增量计算，从根本上杜绝由于串行遍历导致全局 tick 步进失真脑裂的灾难。

---

## 35. 修为底蕴溢出转化衰减公式在极高境界与极限底蕴下发生浮点数精度下溢 (Underflow) 导致挂机收益永久归零重大数值漏洞 (P1)

### 关联规范条款
> **8. 性能红线**
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配。
> **10. 配置与内容生产红线**
> - 内容错误尽量在编辑器、导入期或服务端启动期暴露，不拖到运行时。

### 漏洞详情
在玩家修行状态推进服务 `player-progression.service.ts` 的 `calculateOverflowFoundationGain` (行 2312-2325) 中，用于计算满经验后溢出值转化为底蕴（Foundation）的数学公式为：
```typescript
function calculateOverflowFoundationGain(player, realm, amount) {
    const normalized = normalizeProgressionAmount(amount);
    if (normalized <= 0) { return 0; }
    const referenceProgress = normalizeProgressionAmount(realm?.progressToNext);
    if (referenceProgress <= 0) { return normalized; }
    const currentFoundation = normalizeProgressionAmount(player?.foundation);
    const decayRate = Math.log(2) / (referenceProgress * 10);
    const decaySeed = Math.exp(-decayRate * currentFoundation);
    return rollFractionalGain(Math.log1p(decayRate * normalized * decaySeed) / decayRate);
}
```
此处的对数与指数函数（`Math.log1p` 与 `Math.exp`）存在严重的 IEEE-754 双精度浮点数下溢（Underflow）数学漏洞：
1. **极高境界下的 `decayRate` 下溢**：当玩家处于渡劫期、大乘期等极高境界时，升级所需的 `realm.progressToNext` 极其庞大（高达几百亿或几万亿）。这会导致 `decayRate` 的值变成极其微弱的浮点数（几乎接近 JavaScript 双精度浮点数表示下限，如 `1e-15`）。在浮点数乘法 `decayRate * normalized` 中，由于精度下溢，计算结果会直接**被截断为零（`0`）**，导致返回值恒为 `0`！
2. **极限底蕴下的 `decaySeed` 物理归零**：如果低境界玩家（如练气期）通过离线挂机积攒了超乎寻常的 `foundation`（如几千万），而当前境界的 `referenceProgress` 却很小（如几百），会导致 `decayRate * currentFoundation` 变成一个极其庞大的正数（如 `13,800`）。在进行 `Math.exp(-13800)` 指数运算时，在 JavaScript 中任何超过 `-745` 指数的 exp 计算都会**被物理归零（下溢返回 `0`）**！
这会导致 `decaySeed` 变为 `0`，使得整个转换后的底蕴收益无条件变为 `0`！

### 危害分析
1. **高境界玩家挂机/杀怪经验收益永久冻结**：高境界玩家无论使用多少极品丹药、击杀多少妖王，其溢出经验在转化为底蕴时均会因下溢而物理归零，玩家战力永久卡死，彻底封死了大乘期以后的底蕴提升道路。
2. **离线补偿完全失效与玩家流失**：挂机积攒了大量底蕴的玩家，会发现在底蕴达到一定限度后，后续获得的所有溢出经验转化直接为 0，付出的现实时间和精力完全打水漂，造成不可挽回的毁灭性客诉。

### 建议修复方案
1. **引入浮点数精度保护阈值**：在进行对数和指数计算前，增加对 `decayRate` 以及底蕴乘积的范围边界校验。当 `decayRate` 低于安全精度下限（例如 `1e-8`）时，采用泰勒一阶展开式 `Math.log1p(x) / x ≈ 1` 快速化简计算，规避高精度乘除带来的下溢。
2. **对 `Math.exp` 指数加设安全底线**：当 `-decayRate * currentFoundation` 小于安全下限（如 `-700`）时，强制截断并回退为安全的底线常数，防止 `decaySeed` 物理归零。

---

## 36. 功法配置文件负向 cooldown 字段被启动加载硬性斩断为 0 冷却导致大招顺发与客户端 UI 时序错乱逻辑漏洞 (P2)

### 关联规范条款
> **10. 配置与内容生产红线**
> - 内容错误尽量在编辑器、导入期或服务端启动期暴露，不拖到运行时。
> **2. 工作总原则**
> - 一切改动优先服务于当前生产主线，不顺手跨越到无关模块。

### 漏洞详情
在 `packages/server/data/content/techniques/` 的多个功法和术法配置文件（如 `玄阶术法.json`、`地阶内功.json`）中，系统配置了大量的负数 `cooldown` 字段：
*   `"cooldown": -14.854` 
*   `"cooldown": -6.026` 
然而，在服务端的模板加载公共服务 `packages/server/src/content/content-template-utils.ts` (行 1408) 中：
```typescript
    const cooldown = Math.max(0, Math.trunc(Number(candidate.cooldown)));
```
系统在启动加载时，通过 `Math.max(0, ...)` 强行将所有读取到的负数 `cooldown` **无条件全部归零（斩断为 `0`）**！

### 危害分析
1. **大招技能冷却失效变成无限顺发**：如果功法设计人员的初衷是在此负数功法上提供“技能冷却缩减（cooldownSpeed）”加成，却由于配置错置直接写在了 `cooldown` 字段下。这会导致服务器在启动时将这些大招技能的物理冷却时间强行判定为 `0` 秒！玩家可以无冷却、无间断地在战斗中疯狂瞬间释放高阶毁灭性大招，彻底摧毁副本机制。
2. **客户端 UI 界面负数冷却时序错乱**：由于客户端直接读取了原始 JSON 配置文件，并没有执行服务器端的 `Math.max(0, Math.trunc(...))` 强行斩断逻辑。客户端在渲染技能面板时，会物理显示“冷却时间：-14秒”，引起极其反常和粗糙的视觉表现，严重降低了游戏品质。

### 建议修复方案
1. **完善启动期 Schema 配置强一致性校验**：在 `ContentTemplateRepository` 的加载流程中增加对 `cooldown` 字段的非负断言校验。如果检测到负数 `cooldown`，必须在启动加载阶段或编辑器打包阶段立即抛出显式编译警告并拦截启动，决不允许将脏配置带入运行时并静默斩断。
2. **区分“冷却时间”与“冷却时间缩减”字段**：重构并清晰规范功法配置文件 schema，任何冷却缩减加成必须强制限定在 `cooldownSpeed` 中，严禁将负数写入基础冷却配置。

---

## 37. 大地图风水高频局部重算 buildRoomAggregates 退化为全量地块与受损数据扫描导致“风水重算 Revision 缓存失效风暴”CPU 雪崩隐患 (P1)

### 关联规范条款
> **6. UI 与客户端交互红线**
> - 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
> **8. 性能红线**
> - 热路径禁止依赖每 tick 全表扫描替代索引。
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配。

### 漏洞详情
在世界大地图建筑与房间风水系统 [map-instance.runtime.ts](file:///packages/server/src/runtime/instance/map-instance.runtime.ts) 中：
当玩家破坏地块、安放地块、捡起地上掉落物、灵气自然流转等微小事件发生时，会触发对应地块所属房间风水的局部重算 `recalculateFengShuiAfterRoomInfluenceChange` (行 1604)。
该方法的本意是“只重算受影响房间的风水”，以避免全量大地图重建。
然而，在计算核心输入聚合的 `buildRoomAggregates` (行 1704-1750) 内部：
```typescript
        const aggregates = new Map();
        for (const room of this.roomsById.values()) {
            if (selectedRoomIds && !selectedRoomIds.has(room.id)) { continue; }
            aggregates.set(room.id, createRoomAggregate(room));
        }
        ...
        for (const [roomId, cells] of this.roomCellIndicesById.entries()) {
            const aggregate = aggregates.get(roomId);
            if (!aggregate) { continue; }
            for (const cellIndex of cells) {
                aggregate.qiRaw += this.auraByTile?.[cellIndex] ?? 0;
            }
        }
        for (const [tileIndex, damage] of this.tileDamageByTile.entries()) {
            ...
            const roomIds = this.collectRoomInfluenceRoomIdsByCell(tileIndex);
            for (const roomId of roomIds) {
                const aggregate = aggregates.get(roomId);
                if (!aggregate) { continue; }
                aggregate.integrityPenalty += Math.max(1, Math.round(30 * damageRatio));
                aggregate.aggregateRevision += 1;
            }
        }
```
这里存在两个极严重的性能扫描退化：
1. **地块索引全表扫描**：即便指定了局部重算房间（`roomIdsInput` 限制了 `aggregates` 的大小），但系统仍被迫在行 1718 遍历 `this.roomCellIndicesById.entries()`。而在 `this.roomIdByCell` 具有 `256 x 256 = 65,536` 个元素的物理口径下，这种全量地块与索引扫描的开销难以避免。
2. **损坏地块全量扫描**：在行 1727 调用的地块破损惩罚累加中，系统在每一次局部风水重算时，均会**全量遍历大地图所有受损地块 `tileDamageByTile` 字典**，并在内部反复调用高频的 `collectRoomInfluenceRoomIdsByCell` 去抓取该损坏地块影响的房间！

### 危害分析
在高频战斗或多人激战时，怪物受伤、大范围掉落物高频被捡起（如每秒发生数十次 `ground_item_taken`）、或者地块被大面积破坏。
这会导致每个 Tick 发生上百次风水重新计算投影。
而每一次所谓的“局部重算”都被迫在主线程同步全量遍历 `roomCellIndicesById` 的所有地块元素，并无差别扫描所有损坏地块的 entries！
这产生了极其恐怖的 **“风水重算 Revision 缓存失效风暴（Feng Shui Calc Storm）”**，导致主线程 CPU 被无用扫描彻底吃满，服务器瞬间卡死。

### 建议修复方案
1. **建立受损地块至房间的细粒度脏缓存索引**：废除在 `buildRoomAggregates` 中对所有受损地块 `tileDamageByTile` 的全表轮询。应建立 `roomId -> damagedCells` 的双向细粒度映射。在特定房间风水重算时，只从其对应的映射集合中获取已受损的地块，实现真正的 $\mathcal{O}(1)$ 增量风水计算。
2. **彻底解耦高频事件与风水重算**：对于灵气自然传导或普通物品掉落，不应高频同步触发风水重算，应将其节流（Throttle）或降频延迟至帧 Tick 的末尾合并进行单次批量重算。

---

## 38. AoiEnvelopeEncoderService 异步空壳微任务 Promise 链空转引发高并发下 Node.js 主线程微任务队列积压与 Minor GC 频繁抖动性能隐患 (P1)

### 关联规范条款
> **5. 网络同步红线**
> - 高频同步必须最小字段、最小范围、最小频率。
> **8. 性能红线**
> - 性能优化顺序：优先减少重复计算 → 再减少重复分配 → 再减少重复序列化。
> - 经验教训：Encoding Worker Pool "已启用"但生产中 0 任务提交（所有调用者被硬编码禁用）。

### 漏洞详情
在玩家 S2C 消息预编码服务 [aoi-envelope-encoder.service.ts](file:///packages/server/src/network/aoi-envelope-encoder.service.ts#L57-L80) 中：
若服务器启用了 `EncodingWorkerPool`（即 `this.encodingPool` 有效且 `isEnabled() === true`），系统在高频广播时会调用异步编码：
```typescript
  async encodeEnvelopeAsync(envelope: EnvelopeLike): Promise<EncodedEnvelope> {
    if (!this.encodingPool) {
      return this.encodeEnvelopeSync(envelope);
    }
    const [mapEnter, worldDelta, selfDelta, panelDelta] = await Promise.all([
      this.encodePayloadAsync(envelope?.mapEnter),
      this.encodePayloadAsync(envelope?.worldDelta),
      this.encodePayloadAsync(envelope?.selfDelta),
      this.encodePayloadAsync(envelope?.panelDelta),
    ]);
    return { mapEnter, worldDelta, selfDelta, panelDelta };
  }
```
然而，底层的异步 payload 编码 `encodePayloadAsync` 实际上被写死为了 **“不进行任何 Worker Pool 交互的空壳”**：
```typescript
  async encodePayloadAsync(_payload: unknown): Promise<Buffer | null> {
    return null;
  }
```
它根本没有提交任务到 Worker 线程池，仅仅在主线程原地返回了一个 `Promise.resolve(null)`。

### 危害分析
在 5,000 玩家在线的商业并发口径下，每个 Tick（1Hz）主循环同步为每个玩家构建并发送 `SyncEnvelope` 消息包：
系统会为 5,000 个玩家各自调用一次 `encodeEnvelopeAsync`。
由于该方法调用了 `Promise.all` 且包裹了 4 个空壳 async 异步任务，这会在 Node.js 主进程的 V8 虚拟机中无差别地物理产生并在微任务队列中塞入：
$$\text{5,000} \times (1 + 4) = 25,000 \text{ 个无意义的 Promise 微任务对象！}$$
微任务（Microtask）是在同一事件循环迭代末尾同步清空的。
在每个 Tick 瞬间，主线程在执行网络写回时，会突然面临 25,000 个无意义微任务 Promise 协程的连续解析与回调。
这会造成极其庞大的 **微任务队列积压（Microtask Queue Bloat）**；同时每个 Tick 积压产生的几万个短命临时 Promise 垃圾对象会给 V8 的 Minor GC (Scavenge) 垃圾回收器带来极大的内存回收负担，引发高频的 CPU 卡顿、微小网络抖动及每 Tick 的物理耗时大幅攀升。

### 建议修复方案
1. **当 Worker 停用时强制退化走同步极速路径**：如果在设计上将 `encodePayloadAsync` 硬编码返回 `null`（保持 JSON 直发），则 `isEnabled()` 或 `shouldUseWorkerForPlayer` 必须无条件强制返回 `false`，从而在 `encodeEnvelopeAsync` 中直接物理走 `encodeEnvelopeSync` 同步返回机制，彻底根除高频 Promise 对象的分配。
2. **剔除无意义的 `Promise.all` 嵌套**：若需使用 Worker 异步序列化，应当在 `encodePayloadAsync` 内部真正接通 `this.encodingPool.submit` 通道，让序列化压力流转到工作线程，实现主线程减负，而非让主协程白白为空微任务队列埋单。





