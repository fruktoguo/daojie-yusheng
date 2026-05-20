# S2C 网络包体优化计划

## 问题总览

22 分钟采样期间总下发 ~94 MB，核心问题：
1. 签名函数包含高频变化字段 → 伪增量，每 tick 触发全量重发
2. 面板增量发送了大量静态模板数据 → 客户端本地有模板，不需要服务端重复下发
3. 部分包无节流 → 每 tick 都发

---

## 设计原则：多级按需下发

| 层级 | 触发时机 | 内容 | 说明 |
|------|----------|------|------|
| L0 骨架 | 首连 | ID + 位置 + HP/MP + 钱包 | Bootstrap 首帧最小集 |
| L1 摘要 | 首连异步 + 增量同步 | 实例态字段（id + count + level） | 面板列表渲染所需最小集 |
| L2 详情 | 用户主动查看（hover/打开面板） | 属性构成、技能描述、装备效果 | 按需请求 |
| 静态 | 客户端本地模板 | name/desc/grade/category/skills/layers/equipAttrs | 从 itemId/techId/buffId 查本地模板 |

**核心规则：高频同步只发 L1，L2 走按需请求，静态数据永远不发。**

---

## 1. s2c_PanelDelta（74.2 MB / 1336次 / 均次 56.9 KB）

### 1.1 止血：修复伪增量签名

| 问题 | 位置 | 修复 |
|------|------|------|
| `attrSignature` 含 `lifeElapsedTicks`（每 tick +1） | `buildAttrPanelSignature` L802 | 移除该字段，客户端本地递增 |
| `buffSignature` 含 `remainingTicks`（每 tick -1） | `buildBuffListSignature` L891 | 移除该字段，客户端本地倒计时 |
| `actionSignature` 含 `combatTargetId`（战斗中频变） | `buildActionPanelSignature` L867 | 移除，走 SelfDelta 或 EventBus |
| 换图分支无条件全量 | `world-projector.service.ts` L113 | 恢复增量 diff |
| attrSignature 变化时发全量 | `buildPanelDeltaFromCursor` L1305 | 改用 `buildAttrDeltaFromState` 增量 |

### 1.2 瘦身：面板增量只发 L1 实例态

#### 背包 (inv)

**当前**：每个 slot 发完整 `SyncedItemStack`（30+ 字段，含 name/desc/equipAttrs/effects 等）

**优化后**：只发实例态字段
```ts
interface PanelInvSlotSync {
  slotIndex: number;
  item: { itemId: string; count: number; itemInstanceId?: string; enhanceLevel?: number } | null;
}
```
客户端用 `itemId` 查本地 `ItemTemplateRegistry` 补齐 name/type/grade/equipSlot 等静态字段。

**注意**：Bootstrap 首包已经是这个精简格式（`BootstrapItemStackView`），面板增量应对齐。

#### 装备 (eq)

**当前**：每个槽位发完整 `SyncedItemStack`

**优化后**：同背包，只发 `{ slot, item: { itemId, itemInstanceId, enhanceLevel } | null }`

#### 功法 (tech)

**当前**：`TechniqueUpdateEntryView` 含 name/grade/category/skills/layers

**优化后**：只发实例态
```ts
interface PanelTechSync {
  techId: string;
  level?: number;
  exp?: number;
  expToNext?: number;
  realmLv?: number;
  realm?: TechniqueRealm;
  skillsEnabled?: boolean | null;
}
```
- `name/grade/category`：客户端从 `TechniqueTemplateRegistry[techId]` 获取
- `skills/layers`：详情级，用户打开功法详情时走 `RequestDetail` 按需拉取

#### 行动 (act)

**当前**：`ActionUpdateEntryView` 含 name/type/desc/range/requiresTarget/targetMode

**优化后**：只发实例态
```ts
interface PanelActSync {
  id: string;
  cooldownLeft?: number;
  autoBattleEnabled?: boolean | null;
  autoBattleOrder?: number | null;
  skillEnabled?: boolean | null;
}
```
- `name/type/desc/range/requiresTarget/targetMode`：客户端从技能模板获取
- Bootstrap 首包已经是这个格式（`BootstrapActionView`），面板增量应对齐

#### 属性 (attr)

**当前**：全量发送 baseAttrs/bonuses/finalAttrs/numericStats/ratioDivisors/specialStats/craftSkills

**优化后**：分为 L1 摘要 + L2 详情

L1（高频同步，面板数字显示）：
```ts
interface PanelAttrSyncL1 {
  r: number;
  finalAttrs?: Partial<Attributes>;     // 最终六维（面板显示的数字）
  numericStats?: PartialNumericStats;    // 攻防速等数值
  specialStats?: Partial<PlayerSpecialStats>; // 根基/悟性/气运
  realmProgress?: number;
  realmProgressToNext?: number;
  realmBreakthroughReady?: boolean;
}
```

L2（按需请求，hover 属性时展示构成）：
```ts
// 已有 C2S.RequestAttrDetail → S2C.AttrDetail
interface AttrDetailView {
  baseAttrs: Attributes;
  bonuses: AttrBonus[];          // 属性加成来源明细
  finalAttrs: Attributes;
  numericStats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
  numericStatBreakdowns: NumericStatBreakdownMap;
  craftSkills: { alchemy, forging, building, gather, enhancement, mining };
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears: number;
}
```

#### Buff (buff)

**当前**：`VisibleBuffState` 含 name/desc/shortMark/category/visibility/color/attrs/stats 等

**优化后**：只发实例态
```ts
interface PanelBuffSync {
  buffId: string;
  remainingTicks: number;   // 首次同步时发，之后客户端本地倒计时
  duration: number;
  stacks: number;
  sourceSkillId?: string;
  realmLv?: number;
  infiniteDuration?: boolean;
  presentationScale?: number;
}
```
- `name/desc/shortMark/category/color`：客户端从 `BuffTemplateRegistry[buffId]` 获取
- `attrs/stats/qiProjection`：详情级，hover buff 时按需请求

---

## 2. s2c_WorldDelta（13.3 MB / 737次 / 均次 18.5 KB）

### 2.1 止血：容器倒计时不触发 diff

| 问题 | 位置 | 修复 |
|------|------|------|
| `hasDynamicContainerCountdown` 每 tick 强制重算 | `world-projector.service.ts` L124 | 移除该条件 |
| 容器 diff 中 `rr` 字段参与比较 | `projector-diff.ts` L209 | 移除 rr 比较，仅首次出现时发 |

### 2.2 瘦身：世界实体只发 ID + 坐标 + 动态状态

#### 怪物 (WorldMonsterPatch)

**当前**：含 `n`(name)、`c`(color)、`tr`(tier) — 这些是静态模板数据

**优化后**：
- 首次出现：发 `{ id, mid, x, y, hp, maxHp, qi, maxQi }`
- 增量：只发变化字段（位置/血量）
- `name/color/tier`：客户端从 `MonsterTemplate[mid]` 获取

#### NPC (WorldNpcPatch)

**当前**：含 `n`(name)、`ch`(char)、`c`(color)、`sh`(hasShop)

**优化后**：
- 首次出现：发 `{ id, x, y, qm }`
- `name/char/color/hasShop`：客户端从 `NpcTemplate[id]` 获取（NPC 是地图静态配置）

#### 传送门 (WorldPortalPatch)

**当前**：含 `n`(name)、`ch`(char)、`tm`(targetMapId)、`d`(direction)

**优化后**：
- 首次出现：发 `{ id, x, y, tr }`（tr=是否自动触发，运行时可变）
- `name/char/targetMapId/direction`：客户端从地图模板获取（传送门是地图静态配置）

---

## 3. s2c_Realm（800.5 KB / 558次 / 均次 1.4 KB）

### 问题
`progress` 每 tick 递增 → `isSameRealmState` 每 tick 检测到变化 → 全量发送

### 修复
`isSameRealmState` 中对 `progress` 做阈值比较：变化 < `progressToNext * 1%` 视为相同。

效果：从 558次 → ~50次（仅在 progress 跨越 1% 阈值或 stage/breakthroughReady 变化时发送）。

---

## 4. s2c_EnhancementPanel（772.4 KB / 347次 / 均次 2.2 KB）

### 问题
`flushCraftMutation` 中 `hasActiveCraftPanelJob` 条件导致有活跃任务时每 tick 发送面板 patch。

### 修复
移除 `hasActiveCraftPanelJob` 条件，仅在 `result.panelChanged` 时发送。
进行中的进度已通过 EventBus `queueActiveJobProgress` 推送（含 progress/remainingMs）。

效果：从 347次 → ~10次。

---

## 5. s2c_OfflineGainReports（434.9 KB / 559次 / 均次 797 B）

### 问题
`consumePlayerStatisticTotalsForEmit` 每 tick 都有待发数据（修炼/战斗统计每 tick 累积）。

### 修复
`emitPendingPlayerStatisticRecords` 中对 totals 加时间节流：每 10 秒最多发送一次。

效果：从 559次 → ~13次。

---

## 6. s2c_MarketListings / MarketUpdate / MarketOrders（合计 1.3 MB / 55次）

### 问题
交易完成后对所有订阅者全量重发完整分页数据，无增量 diff。

### 修复
方案 A：交易后仅发 `{ revision: number }` 通知客户端数据过期，客户端按需重新请求。
方案 B：维护条目级 diff，仅推送变化的条目。

优先级 P2，推荐方案 A（实现简单）。

---

## 7. s2c_MinimapLibraryDelta（429.5 KB / 4次 / 均次 107.4 KB）

### 问题
单张 minimap 的 `terrainRows` 是完整字符矩阵，体积大。

### 修复
terrainRows 使用 RLE 编码（相邻相同字符合并为 `字符+重复次数`）。

优先级 P3。

---

## 8. s2c_MapStatic（1.5 MB / 16次 / 均次 97.1 KB）

### 问题
换图时全量发送 tile 矩阵，未压缩。

### 修复
tile 矩阵使用字典编码或 RLE 压缩。

优先级 P3。

---

## 9. 关于 Buffer 编码

### 现状
提交 `72a660a1` 引入了 `AoiEnvelopeEncoderService`，所有 envelope 事件被转为 `Buffer.from(JSON.stringify(payload), 'utf-8')` 再 emit。

### 问题
- 没有任何压缩，只是多了一次 Buffer 分配
- 客户端采样工具看到的是 binary 而非可读 JSON
- Socket.IO 的 `perMessageDeflate` 未启用

### 修复建议
- 短期：启用 Socket.IO WebSocket 层的 `perMessageDeflate` 压缩（JSON 文本压缩率 70-80%）
- 中期：替换为 protobuf 编码（这是当初引入 Buffer 的设计意图）
- 或：移除 Buffer 包装，回退到直接 JSON emit + perMessageDeflate

---

## 实施路线

### 第一阶段：止血（修复伪增量）

修改 4 个签名函数 + 换图分支 + 容器 diff + Realm 节流 + Enhancement 节流 + OfflineGain 节流。

预期效果：总下发从 94 MB → ~15 MB（减少 84%）。

### 第二阶段：瘦身（面板增量对齐 Bootstrap 精简格式）

将 PanelDelta 中的 SyncedItemStack/TechniqueUpdateEntry/ActionUpdateEntry/VisibleBuffState 精简为 L1 实例态格式，与 Bootstrap 首包对齐。

预期效果：PanelDelta 均次从 56.9 KB → ~2 KB。

### 第三阶段：世界实体精简

WorldDelta 中的怪物/NPC/传送门移除静态模板字段，客户端从本地模板补齐。

预期效果：WorldDelta 均次从 18.5 KB → ~8 KB。

### 第四阶段：传输层压缩

启用 perMessageDeflate 或替换为 protobuf。

预期效果：在第一~三阶段基础上再减少 70%。

---

## 客户端配合要求

| 改动 | 客户端需要做的 |
|------|---------------|
| buff 移除 remainingTicks 高频同步 | 收到 buff 时记录 startTick + duration，本地每帧计算剩余 |
| 容器移除 rr 高频同步 | 收到容器首次出现时的 rr，本地倒计时 |
| 背包/装备精简为 itemId+count | 用 ItemTemplateRegistry[itemId] 补齐 name/type/grade 等 |
| 功法精简为 techId+level+exp | 用 TechniqueTemplateRegistry[techId] 补齐 name/grade/category |
| 行动精简为 id+cooldownLeft | 用技能模板补齐 name/type/desc/range |
| buff 精简为 buffId+stacks+duration | 用 BuffTemplateRegistry[buffId] 补齐 name/desc/color |
| 属性拆分 L1/L2 | 面板数字用 L1 finalAttrs，hover 详情走 RequestAttrDetail |
| 怪物移除 name/color/tier | 用 MonsterTemplate[mid] 补齐 |
| NPC 移除 name/char/color | 用 NpcTemplate[id] 补齐 |

---

## 无需修复的包

| 包名 | 次数 | 均次 | 说明 |
|------|------|------|------|
| s2c_Bootstrap | 9 | 32.1 KB | 首连全量，已精简 |
| s2c_Leaderboard | 9 | 11.4 KB | 请求-响应 |
| s2c_AlchemyPanel | 6 | 7.2 KB | 低频请求-响应 |
| s2c_AttrDetail | 3 | 10.2 KB | 低频按需请求 |
| s2c_SelfDelta | 720 | 141 B | 正常增量 |
| s2c_Quests | 723 | 257 B | 正常增量 |
| s2c_AuctionListings | 17 | 3.7 KB | 请求-响应 |
