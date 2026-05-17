# 装备稳定 InstanceID 改造计划

> 落点：`packages/shared` + `packages/server` + `packages/client` + `packages/config-editor`
> 类型：跨 shared / runtime / persistence / network / UI 的资产身份基础设施改造
> 优先级：**P0**（修补强化/装/卸/市场/邮件多处身份歧义；当前依赖 slotIndex 定位资产，存在意图与目标错配的可观测风险）

## 1. 背景

### 1.1 现状

`ItemStack`（`packages/shared/src/item-runtime-types.ts`）目前只有 `itemId` + `enhanceLevel` 这一对值标识"种类"，没有任何**实例身份**字段。

资产定位完全靠"格子下标"：

- 背包：`player.inventory.items[slotIndex]`
- 装备：`player.equipment.slots.find(s => s.slot === slot)`

数据库 `player_inventory_item.item_instance_id` 列虽然存在，但实际值在 `packages/server/src/persistence/player-domain-persistence.service.ts:3350` 的写入路径是：

```ts
const itemInstanceId =
  normalizeOptionalString(entry?.itemInstanceId)
  ?? `inv:${playerId}:${slotIndex}`;
```

也就是 `(playerId, slotIndex)` 的字符串编码。`equip:{playerId}:{slotType}` 同理。这只是一个让 PG 行有稳定主键以便 upsert 的"行 ID"，**不是物品身份**：把物品挪到别的格子，`item_instance_id` 跟着新位置走；同一个 `inv:p_xxx:0` 在不同时间点指向的可能是完全不同的物品。

### 1.2 风险点

| 链路 | 当前行为 | 风险 |
|---|---|---|
| 强化启动 `startEnhancement` | `EnhancementTargetRef = { source: 'inventory', slotIndex }` 单凭格子定位 | 启动到执行间任何让 slotIndex 内容变化的操作（吃丹、装/卸、掉物、整理、堆叠合并）都能让强化作用到错的物品 |
| 强化队列 `EnhancementQueueItem` | 队列项保留 `target`，真正出队执行时**再次**按 slotIndex 解析 | 队列等待期间格子重排会让目标漂移 |
| 装备 `equipItem` | 用 `createItemStackSignature(itemId#enhanceLevel)` 把卸下的旧装备合并到背包同签名堆叠 | 若同 itemId+enhanceLevel 的两件装备本身有"运行时差异"（未来扩展），无法区分 |
| 装备 `unequipItem` | 同上，按签名合并到现有 stack | 同上 |
| 市场 `createSellOrder` / `sellNow` | `payload.slotIndex` 定位卖家物品，无身份校验 | 玩家"先点选 +9 剑挂单"和"实际挂出"之间挪格可能挂错 |
| 邮件附件 `claimAttachments` | 系统/GM 邮件物品按 itemId 分配，不涉及身份歧义 | 但若运营要"补偿玩家某把具名装备"则没有钩子 |
| 拾取 / 掉落 | 按 `(itemId, enhanceLevel)` 重新构造堆叠 | 装备从地面回背包后无法溯源 |
| 审计 / 客服 | 没有跨链路追溯单件装备命运的能力 | "这把 +12 神器是怎么没的" 无法回答 |

### 1.3 问题定性

按 `AGENTS.md` §8 "权威运行时红线" 与 §13 "持久化与运营数据红线"：

> **不可覆盖或会影响资产/战斗/交易的意图，必须有明确的排队、幂等、去重、冷却或拒绝规则，不能靠客户端节流保证正确性。**

强化是典型的"会影响资产"的意图，目前完全靠"客户端在派发到执行之间不出现任何会改变背包槽位的操作"这种隐式假设兜底，不符合服务端权威红线。

## 2. 目标

1. 给装备类（`type === 'equipment'`）物品引入由**生成时刻分配、之后跟随物品全程不变**的稳定 `itemInstanceId`。
2. 让强化、市场挂单、装/卸装备等"对单件资产做操作"的协议入口能携带 `expectedItemInstanceId` 做乐观一致性校验；服务端在解析 target 后强校验，不一致直接拒绝。
3. 让背包 / 装备 / 邮件 / 市场 / 地面 / durable_operation 全链路在落库与水合时统一保留 `itemInstanceId`。
4. 提供**迁移期兼容**：旧数据/旧客户端在过渡期内不出错；过渡期结束后才进入硬校验。
5. 不破坏现有玩家体验：堆叠语义、市场同质化交易、邮件领取等行为对玩家肉眼无变化。
6. 落地后能解决：
   - 强化 / 市场 / 装备装卸的目标错配
   - 资产追溯（"这把装备从哪里来到哪里去"）
   - 客户端展示同 itemId+enhanceLevel 多件装备时的稳定 React/DOM key

## 3. 范围与边界

### 3.1 命中范围（必须改）

| 域 | 文件/模块 | 修改点 |
|---|---|---|
| shared 类型 | `packages/shared/src/item-runtime-types.ts` | `ItemStack.itemInstanceId?: string` |
| shared 类型 | `packages/shared/src/synced-panel-types.ts` | `SyncedItemStack.itemInstanceId?: string` |
| shared 工具 | `packages/shared/src/item-stack.ts` | 新增 `hasItemInstanceId(item)` / `canMergeItemStack(item)`；签名合并逻辑明确"带 instance 的不参与合并" |
| shared 协议 | `packages/shared/src/client-service-request-types.ts` | `StartEnhancementRequestView`、`MarketSellRequestView`、`EquipItemRequestView` 等增加可选 `expectedItemInstanceId` |
| shared 强化 | `packages/shared/src/crafting-types.ts` | `EnhancementTargetRef.expectedItemInstanceId?: string`；`SyncedEnhancementItemView.itemInstanceId?: string`；`SyncedEnhancementCandidateView.item.itemInstanceId` 透传 |
| 服务端模板 | `packages/server/src/content/content-template-utils.ts` | `ITEM_INSTANCE_FIELD_KEYS` 加 `itemInstanceId` 白名单 |
| 服务端持久化 | `packages/server/src/persistence/inventory-item-persistence.ts` | `buildPersistedInventoryItemRawPayload` 不再吞 `itemInstanceId`（走列存储）；`hydratePersistedInventoryItem` 把列里的 instanceId 注入回 ItemStack |
| 服务端持久化 | `packages/server/src/persistence/player-domain-persistence.service.ts` | 改 `inv:` / `equip:` fallback 为：装备类强制要求 sourceItem 自带 instanceId，否则报错并日志 |
| 服务端持久化 | `packages/server/src/persistence/durable-operation.service.ts` | `inventory_grant` / `claim_mail_attachments` 写入路径透传 `itemInstanceId`；不再 fallback |
| 服务端运行时 | `packages/server/src/runtime/player/player-runtime.service.ts` | `equipItem` / `unequipItem` 改成"带 instance 的物品独立成槽，不与同签名堆叠合并"；`receiveInventoryItem`、`splitInventoryItem`、`peekInventoryItem` 透传 instanceId |
| 服务端运行时 | `packages/server/src/runtime/world/world-runtime-equipment.service.ts` | 增加 `expectedItemInstanceId` 校验 |
| 服务端运行时 | `packages/server/src/runtime/craft/craft-panel-runtime.service.ts` | `resolveEnhancementTarget` 增加 `expectedItemInstanceId` 校验；`finishEnhancementJob` / `resolveEnhancementJobItem` 显式继承 `job.item.itemInstanceId`；强化队列项透传 instanceId |
| 服务端运行时 | `packages/server/src/runtime/world/world-runtime-loot-container.service.ts` | 装备掉落 / 拾取生成 instanceId（拾取端继承 ground 上的 id；ground 上的装备掉落时分配） |
| 服务端运行时 | `packages/server/src/runtime/market/market-runtime.service.ts` | 卖家挂单脱壳：`market_listing` 不保留 instanceId；买家成交：`deliverItemToPlayer` 时**新分配** instanceId |
| 服务端运行时 | `packages/server/src/runtime/mail/mail-runtime.service.ts` | 系统邮件附件入库时分配 instanceId（仅装备类）；`claimAttachments` 透传到 grant |
| 服务端运行时 | `packages/server/src/runtime/redeem/redeem-code-runtime.service.ts` | 兑换码发出装备时分配 instanceId |
| 服务端运行时 | `packages/server/src/runtime/world/world-runtime-npc-shop.service.ts` | NPC 商店购买装备时分配 instanceId |
| 服务端 GM | `packages/server/src/http/native/native-gm-player.service.ts` | GM 给装备时分配 instanceId |
| 服务端启动 | `packages/server/src/runtime/player/player-runtime.service.ts:hydratePlayer` 等水合入口 | 检测旧 fallback ID（`inv:` / `equip:` 前缀），lazy 升级为新 nanoid，下次 flush 时落库 |
| 客户端 UI | `packages/client/src/ui/craft-enhancement-view.ts` / `craft-workbench-modal.ts` | 强化 payload 透传 `expectedItemInstanceId`；列表项 key 用 instanceId |
| 客户端 UI | `packages/client/src/ui/panels/inventory-panel.ts` / `equipment-panel.ts` | 装/卸 / 上架 / 拆分等 payload 透传 expectedItemInstanceId |
| 客户端 UI | `packages/client/src/ui/panels/market-panel.ts` | 卖家挂单透传 expectedItemInstanceId |
| 客户端协议 | `packages/client/src/network/socket-send-panel.ts` 等 | 协议字段透传 |

### 3.2 不在本次范围

- 非装备类（consumable / material / quest_item / skill_book）**不分配 instanceId**。它们是同质堆叠资产，没有"实例"概念；保留现有 `(itemId, enhanceLevel)` 签名合并语义。
- 阵盘（`formationDiskTier`）、灵根种子等"特殊单件资产"目前 ItemType 为 `material` 或 `consumable`，本次也不引入 instanceId；后续若需要再延伸。
- 市场撮合算法、价格、撮合优先级保持不变；只在"卖家脱壳" / "买家入手"两个边界处理 instanceId。
- `ItemStack` 上的其他实例字段（`enhanceLevel` 等）语义不变。

### 3.3 关键设计选择

#### 3.3.1 字段名

| 选项 | 评估 |
|---|---|
| `instanceId` | 简洁，但 ItemStack 上还有 `mapUnlockId`、`itemId` 等 id 字段，单 `instanceId` 易混淆 |
| `uid` | 太短，语义不明 |
| **`itemInstanceId`**（推荐） | 与数据库列名 `item_instance_id` 一致；与"item 实例"语义清晰；与现有 `durable-operation.service.ts:122` 已存在的 `itemInstanceId` 字段名对齐 |

**采用 `itemInstanceId`**。

#### 3.3.2 ID 生成

- 使用 `crypto.randomUUID()`（Node 18+ 内置）。
- 服务端独占生成，客户端只读。
- 长度 36 字符（带连字符 UUID v4）；若考虑包体可选 nanoid（21 字符 url-safe）但需要新依赖。**优先 randomUUID**，不引入新依赖；后续若 `inventory` 全量包体压力大再切 nanoid。
- 无前缀（与原 `inv:` / `equip:` 伪 ID 区分：新 ID 不含冒号、不以字母前缀开头），便于水合时检测旧 fallback。

#### 3.3.3 适用范围

只对 **`type === 'equipment'`** 的 ItemStack 强制分配 instanceId；其它类型可选。

判定函数：

```ts
// packages/shared/src/item-stack.ts
export function isItemInstanceTracked(item: Pick<ItemStack, 'type'>): boolean {
  return item?.type === 'equipment';
}
```

#### 3.3.4 堆叠合并规则

| 物品状态 | 合并规则 |
|---|---|
| `type !== 'equipment'` 且无 instanceId | 按现有 `(itemId, enhanceLevel)` 签名合并 |
| `type === 'equipment'` | **永远独立成 slot**，count 始终为 1，不参与合并 |
| 其它带 instanceId 的物品（未来扩展） | 永远独立成 slot |

新工具函数：

```ts
// packages/shared/src/item-stack.ts
export function canMergeItemStack(item: ItemStack): boolean {
  return !isItemInstanceTracked(item) && !item.itemInstanceId;
}
```

所有"找现有堆叠合并"的代码（`equipItem` / `unequipItem` / `receiveInventoryItem` / inventory grant snapshot 合并 / `applyMarketSellNowToInventory` 等）必须用 `canMergeItemStack` 判定。

## 4. 字段定义

### 4.1 运行时类型

```ts
// packages/shared/src/item-runtime-types.ts
export interface ItemStack {
  itemId: string;
  // ... 现有字段
  /**
   * itemInstanceId：装备的稳定实例 ID。
   *
   * 仅装备类（type === 'equipment'）强制存在；
   * 由服务端在物品生成时刻分配（randomUUID v4），
   * 之后跟随物品全程不变：装/卸、市场流通边界除外（市场脱壳后买家会获得新 ID）。
   *
   * 客户端只读，用于：
   *   - 协议层乐观一致性校验（强化、装/卸、上架等）
   *   - UI 列表稳定 key
   *   - 资产追溯审计
   *
   * 与堆叠语义的关系：带 instanceId 的物品永远独立成 slot，count 恒为 1，
   * 不与同 (itemId, enhanceLevel) 签名的其它堆叠合并。
   */
  itemInstanceId?: string;
}
```

```ts
// packages/shared/src/synced-panel-types.ts
export interface SyncedItemStack {
  itemId: string;
  count: number;
  // ... 现有字段
  /** 装备稳定实例 ID；仅装备类必填，其它物品不携带。 */
  itemInstanceId?: string;
}
```

### 4.2 协议字段

```ts
// packages/shared/src/crafting-types.ts
export interface EnhancementTargetRef {
  source: 'inventory' | 'equipment';
  slotIndex?: number;
  slot?: EquipSlot;
  /**
   * expectedItemInstanceId：客户端选中目标时看到的 itemInstanceId。
   *
   * 服务端在 resolveEnhancementTarget 之后比对：
   *   - 若 expected 存在但 target.item.itemInstanceId !== expected：拒绝，提示"目标已变更"
   *   - 若 expected 不存在（旧客户端 / 非装备）：跳过校验，记录 warn 日志
   *   - 若 target.item.itemInstanceId 是迁移期 fallback（含 ":"）：跳过校验
   */
  expectedItemInstanceId?: string;
}
```

```ts
// packages/shared/src/client-service-request-types.ts
export interface EquipItemRequestView {
  slotIndex: number;
  expectedItemInstanceId?: string;
}

export interface UnequipItemRequestView {
  slot: EquipSlot;
  expectedItemInstanceId?: string;
}

export interface MarketSellRequestView {
  slotIndex: number;
  quantity: number;
  unitPrice: number;
  expectedItemInstanceId?: string;
  // ... 现有字段
}
```

### 4.3 数据库字段

`player_inventory_item.item_instance_id varchar(180) PRIMARY KEY` —— **已存在**，无需 schema 变更。
`player_equipment_slot.item_instance_id varchar(180) NOT NULL UNIQUE` —— **已存在**。

迁移期间含义升级：

- 旧值（`inv:p_xxx:0`、`equip:p_xxx:weapon`）继续合法，但视为"未稳定"。
- 新值（UUID）视为"稳定身份"。
- 区分判据：是否含 `:`。

### 4.4 持久化 rawPayload

`buildPersistedInventoryItemRawPayload` 现在只保留 `enhanceLevel`。改造后：

- `itemInstanceId` **走列存储**（`item_instance_id` 列），不放进 `raw_payload`。
- `enhanceLevel` 保持现状走 `raw_payload`。
- 水合 `hydratePersistedInventoryItem` 时把列里的 itemInstanceId 注入到返回的 ItemStack 上。

## 5. 生成时机

下表枚举所有"装备从模板进入玩家持有"的入口；每条都必须分配 `itemInstanceId`。

| 入口 | 文件 | 分配方式 |
|---|---|---|
| 怪物掉落 / 容器掉落 | `packages/server/src/runtime/world/world-runtime-loot-container.service.ts` | 在 `prepareLootSource` 阶段构造 ItemStack 时调用 `assignItemInstanceIdIfNeeded(item)` |
| 地面 pile / ground drop | 同上 | 装备落地前分配；拾取时 instanceId 跟随进入背包 |
| 炼器合成产物 | `packages/server/src/runtime/craft/craft-panel-runtime.service.ts:finishCraftJob` | 产出装备时分配 |
| 强化产物（成功 / 失败 / 取消 / 降级） | 同上 `finishEnhancementJob` → `resolveEnhancementJobItem` | **继承 `job.item.itemInstanceId`**（不重新分配，保持身份） |
| 强化保护物消耗 | `consumeProtectionItemForFailure` | 不影响产物 instanceId |
| 老角色初始化装备 | `packages/server/src/runtime/player/player-runtime.service.ts` 角色初始化路径 | 分配 |
| GM 给物品 | `packages/server/src/http/native/native-gm-player.service.ts` | 分配 |
| 邮件附件入库（系统 / GM 发邮件时） | `packages/server/src/runtime/mail/mail-runtime.service.ts` 写邮件时 | 装备类分配；附件领取时 instanceId 跟随进背包 |
| 邮件附件领取 | 同上 `claimAttachments` | 透传，不重新分配 |
| 兑换码奖励 | `packages/server/src/runtime/redeem/redeem-code-runtime.service.ts` | 装备类分配 |
| NPC 商店购买 | `packages/server/src/runtime/world/world-runtime-npc-shop.service.ts` | 装备类分配 |
| 市场买家成交 | `packages/server/src/runtime/market/market-runtime.service.ts:deliverItemToPlayer` | **新分配**（卖家挂单时已脱壳，市场内只剩"种类 + 强化等级"） |
| 任务奖励发放 | `packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts` 等任务奖励路径 | 装备类分配 |

新增统一工具：

```ts
// packages/server/src/runtime/world/item-instance-id.helpers.ts（新文件）
import { randomUUID } from 'node:crypto';
import type { ItemStack } from '@mud/shared';
import { isItemInstanceTracked } from '@mud/shared';

/** 若需要 instanceId 但缺失，则就地分配；返回是否进行了分配。 */
export function assignItemInstanceIdIfNeeded(item: ItemStack): boolean {
  if (!isItemInstanceTracked(item)) {
    return false;
  }
  if (typeof item.itemInstanceId === 'string' && item.itemInstanceId.length > 0 && !item.itemInstanceId.includes(':')) {
    return false;
  }
  item.itemInstanceId = randomUUID();
  return true;
}

/** 强制分配新 instanceId（市场买家成交、内部克隆等需要"刷新身份"的边界使用）。 */
export function reassignItemInstanceId(item: ItemStack): string {
  const id = randomUUID();
  item.itemInstanceId = id;
  return id;
}

/** 判断一个 instanceId 是否是迁移期 fallback。 */
export function isLegacyItemInstanceId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.length > 0 && id.includes(':');
}
```

`assignItemInstanceIdIfNeeded` 是幂等的：已有合法 ID 不动；遇到旧 fallback ID（含 `:`）会**升级**为新 UUID。这同时承担了"水合时 lazy 升级"的职责（见 §10）。


## 6. 强化集成（核心）

### 6.1 启动 `startEnhancement`

```
                                ┌──────────────────────────┐
client 选中目标(slotIndex/slot) │ payload 携带：           │
        │                       │  - target               │
        ▼                       │  - expectedItemInstanceId│
StartEnhancement(payload) ─────►│  - protection            │
                                └──────────────────────────┘
                                          │
                                          ▼
              resolveEnhancementTarget(player, payload.target)
                                          │
                                          ▼
              ┌── target.item.itemInstanceId vs payload.expected ──┐
              │  match → 继续                                       │
              │  mismatch + 双方都存在 + 非 legacy → 拒绝           │
              │  expected=undefined（旧客户端） → 跳过校验+warn 日志│
              │  target.itemInstanceId is legacy → 跳过校验         │
              └─────────────────────────────────────────────────────┘
                                          │
                                          ▼
              extractInventoryItemAt(player, slotIndex)
                                          │
                                          ▼
              enhancementJob.item = workingItem  (instanceId 保留)
```

**关键代码改动**：

```ts
// packages/server/src/runtime/craft/craft-panel-runtime.service.ts
resolveEnhancementTarget(player, ref) {
  const resolved = /* 现有逻辑：按 source/slot 取 item */;
  if (!resolved) {
    return null;
  }
  const expected = typeof ref?.expectedItemInstanceId === 'string'
    ? ref.expectedItemInstanceId.trim()
    : '';
  if (expected) {
    const actual = resolved.item.itemInstanceId ?? '';
    if (!actual) {
      // 装备类必须有 instanceId；走到这里说明遇到了未水合的旧数据，记录 warn 但不拒绝
      this.logger.warn(`enhancement target missing itemInstanceId player=${player.playerId} slot=${ref.slotIndex ?? ref.slot}`);
    } else if (!isLegacyItemInstanceId(actual) && actual !== expected) {
      return { mismatched: true };  // 让 startEnhancement 拒绝并返回明确文案
    }
    // legacy 期：跳过比对（迁移期玩家可能携带升级前的 expected）
  }
  return resolved;
}
```

`startEnhancement` 在 `target = resolveEnhancementTarget(...)` 之后判断 `mismatched`：

```ts
if (target.mismatched) {
  return buildCraftMutationResult('强化目标已变更，请重新选择。');
}
```

### 6.2 队列项 `EnhancementQueueItem`

队列项 `target` 字段沿用 `EnhancementTargetRef`，`expectedItemInstanceId` 自然透传。出队执行时再次走 `resolveEnhancementTarget`，校验逻辑相同。

**额外考虑**：队列等待期间，玩家如果取消装备、丢弃、上架了原物品，出队时会因为：
- target.item 找不到 → 现有"强化目标不存在" 错误路径
- 或 target.item.itemInstanceId 不匹配 → 新增"目标已变更"错误路径

两者都会让队列项作废（现有 `enqueueCraftQueueItem` / 出队失败处理已能容忍）。

### 6.3 完成 `finishEnhancementJob`

`enhancementJob.item` 在启动时已经把原物品的 instanceId 保留下来。完成时 `resolveEnhancementJobItem` 重组装备：

```ts
// packages/server/src/runtime/craft/craft-panel-runtime.service.ts
function resolveEnhancementJobItem(contentTemplateRepository, job, enhanceLevel) {
  const source = /* 现有逻辑 */;
  const itemInstanceId = job?.item?.itemInstanceId
    || source?.itemInstanceId
    || undefined;
  const normalized = contentTemplateRepository.normalizeItem({
    /* 现有字段 */
    itemInstanceId,  // 显式继承
  });
  return normalized;
}
```

**这是 instanceId 必须贯穿的核心点**：成功 +1、失败 -1、保护降级、取消都走这条路径，instanceId 保持不变 → 玩家手里"那把剑"全程是同一个实例。

`setEquippedItem(player, slot, resolvedItem)` 与 `receiveInventoryItem(player, repo, resolvedItem)` 都不应该剥离 instanceId（见 §6.4）。

### 6.4 `receiveInventoryItem` 与堆叠合并

现有 `receiveInventoryItem`（在 craft-panel-runtime.service.ts 末尾、player-runtime.service.ts、loot-container 等多处都有相似实现）会按签名找现有堆叠合并 count。

**改造**：

```ts
function receiveInventoryItem(player, repo, item) {
  if (!canMergeItemStack(item)) {
    // 装备 / 带 instanceId 的物品 → 永远独立成 slot
    player.inventory.items.push(repo.normalizeItem({ ...item, count: 1 }));
    return;
  }
  // 现有合并逻辑
  const signature = createItemStackSignature(item);
  const existing = player.inventory.items.find(...);
  if (existing) { existing.count += item.count; }
  else { player.inventory.items.push(...); }
}
```

`canMergeItemStack` 工具放在 `packages/shared/src/item-stack.ts`，参见 §3.3.4。

## 7. 装备装/卸

### 7.1 `equipItem`

```ts
// packages/server/src/runtime/player/player-runtime.service.ts
equipItem(playerId, slotIndex, expectedItemInstanceId?) {
  const player = this.getPlayerOrThrow(playerId);
  const item = player.inventory.items[slotIndex];
  if (!item) throw new NotFoundException(`背包槽位不存在：${slotIndex}`);

  // 新增：乐观一致性校验
  if (expectedItemInstanceId && item.itemInstanceId
      && !isLegacyItemInstanceId(item.itemInstanceId)
      && item.itemInstanceId !== expectedItemInstanceId) {
    throw new BadRequestException('装备目标已变更，请重新选择。');
  }

  /* 现有装备槽流程 */

  // 改造：旧装备返回背包时，因为带 instanceId，永远独立成 slot
  const previousEquipped = equipmentEntry.item ?? null;
  if (previousEquipped) {
    if (canMergeItemStack(previousEquipped)) {
      // 极端情况：旧装备没有 instanceId（迁移前数据）→ 走旧合并路径，但首先升级 instanceId
      assignItemInstanceIdIfNeeded(previousEquipped);
    }
    player.inventory.items.push(previousEquipped);  // 不合并
  }
}
```

`unequipItem` 同理：卸下的装备必有 instanceId（startup 时已 lazy 升级），永远独立 push 到 inventory。

### 7.2 网络入口

`world-runtime-equipment.service.ts:dispatchEquipItem` / `dispatchUnequipItem` 在透传时把 payload 里的 `expectedItemInstanceId` 传到 `equipItem` / `unequipItem`。

`world.gateway.ts` 对应的 socket handler 不变，因为 payload 是 RequestView 透传。

## 8. 市场

### 8.1 卖家挂单 `createSellOrder` / `sellNow`

**现状**：`payload.slotIndex` 找物品 → `splitInventoryItem` 拿出 → `toOrderItem` 转挂单形态 → 进入 `market_listing` / 撮合。

**改造**：

```ts
async createSellOrder(playerId, payload) {
  const item = this.playerRuntimeService.peekInventoryItem(playerId, payload.slotIndex);
  if (!item) return this.singleMessage(playerId, '要挂售的物品不存在。');

  // 新增：乐观一致性校验
  if (payload.expectedItemInstanceId
      && item.itemInstanceId
      && !isLegacyItemInstanceId(item.itemInstanceId)
      && item.itemInstanceId !== payload.expectedItemInstanceId) {
    return this.singleMessage(playerId, '挂售目标已变更，请重新选择。');
  }

  /* 现有挂单流程 */
  const orderItem = this.toOrderItem(item);
  // toOrderItem 内：删除 instanceId 字段（市场内同质化）
}

toOrderItem(item) {
  const normalized = this.toFullItem(item);
  const { itemInstanceId, ...rest } = normalized;
  return { ...rest, count: 1 };
}
```

### 8.2 买家成交 `deliverItemToPlayer`

```ts
deliverItemToPlayer(buyerId, item, context) {
  const buyerItem = {
    ...item,
    itemInstanceId: isItemInstanceTracked(item) ? randomUUID() : undefined,
  };
  // 现有 grant 流程
}
```

每件分发都重新分配（即使买家一次买 5 件 +0 凡铁剑，也是 5 个独立 instanceId）。

### 8.3 求购 `createBuyOrder` / `buyNow`

求购侧不受影响：求购本就只携带 `(itemId, enhanceLevel)`；卖家成交后买家收到的物品由 `deliverItemToPlayer` 重新分配 instanceId。

## 9. 邮件

### 9.1 系统/GM 发邮件

`mail-runtime.service.ts` 写邮件附件入库时，对装备类附件分配 instanceId，落入 `mail_attachment.item_instance_id` 列（如果该列已存在；否则在 raw_payload JSON 中存）。

### 9.2 玩家领取附件 `claimAttachments`

附件领取走的是 `claimAttachmentsDurably` → `durableOperationService.claimMailAttachments`，最终落入背包。

**改造**：领取时 `nextInventoryItems` 里的装备类附件保留 instanceId；不重新分配。

### 9.3 玩家发邮件附装备（如果未来支持）

当前看代码，玩家间邮件功能尚未完全开放；若开放，规则与市场买家成交类似：发件人脱壳，收件人领取时新分配 instanceId（避免发件人删号后该 ID 仍被引用）。

## 10. 拾取与地面物品

### 10.1 装备掉落到地面

`world-runtime-loot-container.service.ts:prepareLootSource` 构造 ItemStack 时分配 instanceId。地面 ground drop 数据结构（`instance_ground_item` 表 + 内存 ground state）保留 instanceId 字段。

### 10.2 玩家拾取

`grantInventoryItems` 路径已经透传 sourceItem 到 inventory；只要 sourceItem 带 instanceId，落入背包后就保留。

### 10.3 装备从背包丢到地面（如果未来支持）

类似邮件：丢弃方丢失，落地时仍保留原 instanceId（让追溯链路连续）；玩家若再次拾取，instanceId 不变。这一条与市场不同——市场是有意脱壳同质化，而"丢弃-拾取"应该保持身份。

## 11. 持久化层改造

### 11.1 `inventory-item-persistence.ts`

```ts
// buildPersistedInventoryItemRawPayload 现状：只保留 enhanceLevel
// 改造：itemInstanceId 走列存储，不进 rawPayload
// （行为不变，只是显式说明）
export function buildPersistedInventoryItemRawPayload(source) {
  // ... 现有 enhanceLevel 处理
  // 不写入 itemInstanceId
}

// hydratePersistedInventoryItem 改造：把 source.itemInstanceId 注入返回值
export function hydratePersistedInventoryItem(source, repo) {
  const itemInstanceId = normalizeOptionalString(
    source?.itemInstanceId,
    rawPayload?.itemInstanceId,  // 兼容历史 rawPayload 写过的情况（若有）
  );
  /* 现有 hydration 流程 */
  const hydrated = /* ... */;
  return {
    ...hydrated,
    ...(itemInstanceId == null ? {} : { itemInstanceId }),
  };
}
```

调用方 `player-domain-persistence.service.ts:hydratePlayerInventory` 在 `INVENTORY_PERSISTENCE_REPO.hydratePersistedInventoryItem({ ..., itemInstanceId: row.item_instance_id })` 时把列值传入。

装备槽 `hydratePersistedEquipmentItem` 同样改造。

### 11.2 `player-domain-persistence.service.ts:replacePlayerInventoryItems`

```ts
const itemInstanceId =
  normalizeOptionalString(entry?.itemInstanceId)
  ?? `inv:${playerId}:${slotIndex}`;
```

改造为：

```ts
const itemInstanceId = normalizeOptionalString(entry?.itemInstanceId);
if (!itemInstanceId) {
  // 装备类必须有 instanceId；走到这里说明上游遗漏了分配
  if (entry?.itemId && isItemInstanceTracked({ type: entry?.type } as any)) {
    throw new Error(`replacePlayerInventoryItems: 装备类必须携带 itemInstanceId playerId=${playerId} slot=${slotIndex} itemId=${entry.itemId}`);
  }
  // 非装备类：用旧 fallback 兜底（保持持久化层主键稳定）
  rows.push({ item_instance_id: `inv:${playerId}:${slotIndex}`, ... });
  continue;
}
rows.push({ item_instance_id: itemInstanceId, ... });
```

装备槽 `replacePlayerEquipmentSlots` 同理：装备槽永远是装备类，必须有 instanceId，否则报错。

**注意**：抛错而不是静默 fallback，是为了让"上游遗漏分配"的 bug 在测试期立即暴露（`durable-operation-smoke` 等会捕获）。生产期在迁移过渡期内，水合环节已经 lazy 升级，不会真正走到这条 throw 路径。

### 11.3 `durable-operation.service.ts`

`grantInventoryItems` / `claimMailAttachments` 当前同样有：

```ts
item_instance_id: `inv:${playerId}:${index}`,
```

的 fallback。改造后透传 sourceItem.itemInstanceId；若装备类无 instanceId 也抛错（同 §11.2）。

### 11.4 不需要 schema 变更

`item_instance_id` 列已存在且有 `varchar(180) PRIMARY KEY` / `UNIQUE` 约束；本次改造只是把列值的语义从"格子编码"升级为"物品身份"。

需要新建索引：
- 暂无；现有 PK / UNIQUE 已经覆盖按 instanceId 查询的需求。
- 若后续要做"按 instanceId 跨表追溯审计"，再考虑新建复合索引。

## 12. 协议层

### 12.1 协议字段对照表

| 协议事件 | 字段 | 类型 | 说明 |
|---|---|---|---|
| `C2S_StartEnhancement` | `target.expectedItemInstanceId` | `string?` | 客户端选中目标时看到的 instanceId |
| `C2S_StartEnhancement` | `protection.expectedItemInstanceId` | `string?` | 保护物的 instanceId（保护物若是装备类才需要） |
| `C2S_EquipItem` | `expectedItemInstanceId` | `string?` | 装备的物品 instanceId |
| `C2S_UnequipItem` | `expectedItemInstanceId` | `string?` | 卸下的物品 instanceId |
| `C2S_MarketCreateSellOrder` | `expectedItemInstanceId` | `string?` | 挂售物品的 instanceId |
| `C2S_MarketSellNow` | `expectedItemInstanceId` | `string?` | 立即出售的物品 instanceId |
| `S2C_PanelInventoryDelta` | `slots[].item.itemInstanceId` | `string?` | 客户端读取并缓存 |
| `S2C_PanelEquipmentDelta` | `slots[].item.itemInstanceId` | `string?` | 同上 |
| `S2C_SyncedEnhancementCandidate` | `item.itemInstanceId` | `string?` | 强化面板候选项 |

### 12.2 包体影响评估

UUID v4 字符串长度 36 字节（含连字符），非 UUID-binary 形式。

- 背包全量包：装备格子数 ~5–20 个 → 增量 ~0.7KB（一次性、首包/重连）。
- 装备面板全量：6–8 槽 → 增量 ~0.3KB。
- 高频增量包：单格 patch 时多 ~36B；按 AGENTS.md §9 红线"高频包必须最小字段"，这是可接受的——instanceId 是装备身份的最小必要字段。

若后续观测到背包全量包成为热点（如玩家装备格子扩到 100+），可切换到 nanoid（21 字节）或裁剪为 UUID-binary 编码。

### 12.3 协议审计

`pnpm audit:protocol` 会校验 RequestPayloads / ResponsePayloads 的字段一致性。新增字段为 optional 不会破坏现有校验，但需要在 `packages/server/src/tools/protocol-audit.ts` 的允许字段列表里把 `expectedItemInstanceId` / `itemInstanceId` 显式列出。

## 13. 客户端改造

### 13.1 强化面板 `craft-enhancement-view.ts` / `craft-workbench-modal.ts`

```ts
// payload 构造
const payload: StartEnhancementPayload = {
  target: {
    source: 'inventory',
    slotIndex: selected.ref.slotIndex,
    expectedItemInstanceId: selected.item.itemInstanceId,
  },
  protection: protection ? {
    source: 'inventory',
    slotIndex: protection.ref.slotIndex,
    expectedItemInstanceId: protection.item.itemInstanceId,
  } : undefined,
  // ... 其它字段
};
```

UI 列表的 React/DOM key：
- 优先用 `item.itemInstanceId`
- fallback 到 `slotIndex`（迁移期 / 非装备）

### 13.2 装备面板 `inventory-panel.ts` / `equipment-panel.ts`

装/卸按钮发包时携带 `expectedItemInstanceId`：

```ts
socket.sendEquipItem({
  slotIndex,
  expectedItemInstanceId: item.itemInstanceId,
});
```

### 13.3 市场面板 `market-panel.ts`

挂单 / 立即出售时携带 `expectedItemInstanceId`。

### 13.4 客户端运行态

`packages/client/src/runtime/main-low-frequency-state.ts` 等 inventory/equipment 状态投影时，把 `itemInstanceId` 字段透传保留，不丢弃。

### 13.5 错误提示

服务端拒绝（"目标已变更"）后，客户端 UI 应：
- 弹一次轻量提示（toast / 系统消息）
- 自动刷新背包/装备面板（或者依赖服务端被动 patch 推送）
- 不强制中断玩家其它操作

### 13.6 React UI

`packages/client/src/react-ui/` 当前为渐进式新 UI 区域；本次改造**不要求** React UI 同步上线 instanceId 校验，但要求 React UI 在读取 SyncedItemStack 时不丢弃 itemInstanceId 字段，便于后续对齐。

## 14. 迁移与过渡

### 14.1 现存数据

数据库 `player_inventory_item.item_instance_id` 与 `player_equipment_slot.item_instance_id` 列已被填充：

```
inv:p_xxx:0           ← 旧 fallback，需要升级
inv:p_xxx:1           ← 同上
equip:p_xxx:weapon    ← 同上
```

### 14.2 升级策略：水合期 lazy 升级（推荐）

**不**写一次性 SQL 迁移脚本（避免离线迁移风险）。改为：

1. 玩家上线 → `hydratePlayer` → 读取 inventory/equipment 行
2. 水合时 `hydratePersistedInventoryItem` 把 `row.item_instance_id` 注入到 ItemStack
3. 紧接着调用 `assignItemInstanceIdIfNeeded(item)`（参见 §5）：
   - 检测到含 `:` 的旧 fallback → 替换为 randomUUID
   - 标记 player.dirtyDomains 含 `inventory` / `equipment`
4. 下一次 flush 时落库；从此该装备拥有稳定 instanceId

**优点**：
- 零停机迁移
- 离线玩家的数据保持原状，不会因 batch 操作导致一致性问题
- 失败可回滚（删除新代码 → 旧 fallback 仍然合法）

**缺点**：
- 长期不上线的玩家继续保留旧 fallback（不影响功能）
- 数据库统计、审计查询需要兼容两种格式

### 14.3 过渡期硬校验启用门槛

引入服务端配置项 `ITEM_INSTANCE_ID_HARD_CHECK`（默认 `false`）：

| 状态 | `expectedItemInstanceId` 不匹配 | 旧客户端不带 expected |
|---|---|---|
| `false`（迁移期） | 跳过校验 + warn 日志 | 跳过校验 + warn 日志 |
| `true`（迁移完成后） | 拒绝 + 玩家可见提示 | 拒绝 + 玩家可见提示 |

实施步骤：
1. **第 1 周**：上线代码（`HARD_CHECK=false`）；新装备开始分配 UUID；旧装备 lazy 升级；客户端开始发送 expected。
2. **第 2 周**：观察 warn 日志，确认 mismatch 频次极低（< 1/万次操作）。若不达标说明客户端 / 协议有遗漏，修复。
3. **第 3 周**：开 `HARD_CHECK=true`，进入硬校验。

### 14.4 客户端旧版本兼容

老客户端不发 `expectedItemInstanceId`：

- 服务端见到 expected 缺失 → 跳过校验 + 单次 warn 日志（每个 playerId 限频，避免日志风暴）
- 不拒绝请求，确保旧客户端可用
- 升级到新客户端后自然进入硬校验路径

### 14.5 旧 fallback ID 保留期

`inv:p_xxx:N` 这类旧 ID 在水合时升级，但**不**主动清理数据库——升级会在玩家下次操作 inventory/equipment 时通过常规 flush 路径完成。极少数永远不再上线的玩家会保留旧 ID，不影响系统运行。

## 15. 测试与验证

### 15.1 新增 smoke

- `packages/server/src/tools/item-instance-id-assignment-smoke.ts`
  - 各生成入口（loot / craft / enhancement / GM / mail / market / redeem / npc-shop / 初始化）都分配 instanceId 且为 UUID 格式
  - 同 itemId+enhanceLevel 的两件装备 instanceId 不同
  - 非装备类不分配
- `packages/server/src/tools/world-runtime-enhancement-instance-id-smoke.ts`
  - 玩家 A 同时持有 +0 凡铁剑（slot 5）和 +9 凡铁剑（slot 0）
  - 选中 +9 启动强化（payload.expectedItemInstanceId = id_of_+9）
  - 在出队前模拟"slot 5 的 +0 因为吃药消失，slot 4 内容上移到 slot 5"
  - 现有逻辑：会强化错的物品；新逻辑：因 expectedItemInstanceId 不匹配（mismatched）拒绝
  - 验证 `enhancementJob.item.itemInstanceId` 在成功/失败/取消三条路径上保持一致
- `packages/server/src/tools/equipment-equip-instance-id-smoke.ts`
  - 装/卸装备时旧装备返回背包，永远独立成 slot，count 始终 1
  - 同 itemId+enhanceLevel 的两件装备各自独立显示
- `packages/server/src/tools/market-instance-id-smoke.ts`
  - 卖家 A 挂单 +0 凡铁剑 ×3（3 个独立 instanceId）
  - 撮合 / 立即出售 / 求购成交 后买家 B 收到的 3 件，instanceId 与卖家挂单时不同
  - 验证 `market_listing` 落库不带 instanceId
- `packages/server/src/tools/inventory-grant-instance-id-smoke.ts`
  - durable_operation 写入装备时透传 instanceId
  - 装备类缺失 instanceId 时抛错（验证防呆）

### 15.2 现有 smoke 兼容

下列 smoke 涉及手写 ItemStack / inventory，需要补 `itemInstanceId`：

- `packages/server/src/tools/world-runtime-enhancement-smoke.ts`
- `packages/server/src/tools/durable-operation-smoke.ts`
- `packages/server/src/tools/player-domain-persistence-smoke.ts`
- `packages/server/src/tools/inventory-grant-durable-smoke.ts`
- `packages/server/src/tools/world-runtime-loot-container-smoke.ts`
- `packages/server/src/tools/world-runtime-npc-shop-smoke.ts`
- `packages/server/src/tools/world-runtime-craft-smoke.ts`
- `packages/server/src/tools/redeem-code-runtime-durable-smoke.ts`
- `packages/server/src/tools/market-runtime-buy-now-smoke.ts`
- `packages/server/src/tools/market-runtime-sell-now-smoke.ts`
- `packages/server/src/tools/world-runtime-player-combat-smoke.ts`（战斗后掉落装备）

修改原则：smoke 内部直接调用 `assignItemInstanceIdIfNeeded` 或硬写一个固定 UUID（例如 `'00000000-0000-0000-0000-000000000001'`），保持夹具确定性。

### 15.3 自动清理

按 AGENTS.md §13："新增任何会落库或进入持久化目录的测试夹具时，必须同步补成功、失败、中断后的清理链"。

新增 smoke 都按现有 `cleanupRows(pool, instanceId)` / `cleanupRows(pool, playerId)` 模式补 finally 清理。

### 15.4 验证门禁

| 改动域 | 门禁 |
|---|---|
| shared 类型 | `pnpm build:shared` + `pnpm audit:protocol` |
| server runtime | `pnpm verify:quick` + 新 smoke |
| 持久化 | `pnpm verify:release:with-db` |
| 大范围联动 | `pnpm verify:release` |
| 上线前 | `pnpm verify:release:full` |

### 15.5 性能验证

- `pnpm bench:*` 中现有 inventory/equipment bench：观察 instanceId 引入后内存与序列化开销。
- 预期影响 < 5%（每件装备多一个 36 字节字符串字段）。
- 若超出阈值，考虑延迟生成（只在装备生成时分配，水合时不主动 lazy 升级）或切换 nanoid。

## 16. 实施步骤（推荐顺序）

按风险从低到高、依赖从底到顶：

1. **共享层**（`packages/shared`）
   - `item-runtime-types.ts`：`ItemStack.itemInstanceId?: string`
   - `synced-panel-types.ts`：`SyncedItemStack.itemInstanceId?: string`
   - `item-stack.ts`：`isItemInstanceTracked` / `canMergeItemStack` 工具
   - `crafting-types.ts`：`EnhancementTargetRef.expectedItemInstanceId?`
   - `client-service-request-types.ts`：相关 RequestView 增加 expected 字段
   - `pnpm build:shared` + `pnpm audit:protocol` 通过

2. **服务端工具层**
   - 新增 `packages/server/src/runtime/world/item-instance-id.helpers.ts`
   - `content-template-utils.ts`：`ITEM_INSTANCE_FIELD_KEYS` 加 `itemInstanceId`
   - 单元 smoke 验证 helpers 行为

3. **持久化层**（不开生成入口、不开校验，先打通水合/落库通道）
   - `inventory-item-persistence.ts`：水合注入 itemInstanceId
   - `player-domain-persistence.service.ts`：写入读取列；保留旧 fallback（先保险）
   - `durable-operation.service.ts`：透传 itemInstanceId
   - `pnpm verify:release:with-db` 通过

4. **生成入口**（开始分配 instanceId）
   - 各 generation 路径调用 `assignItemInstanceIdIfNeeded`
   - 强化产物 `resolveEnhancementJobItem` 显式继承
   - 市场买家成交 `deliverItemToPlayer` 重新分配
   - 全量 smoke 通过

5. **堆叠合并改造**
   - `equipItem` / `unequipItem` / `receiveInventoryItem` 接入 `canMergeItemStack`
   - 装备永远独立成 slot
   - smoke 验证

6. **水合 lazy 升级**
   - `hydratePlayer` 路径调用 `assignItemInstanceIdIfNeeded` 升级旧 fallback

7. **协议入口与服务端校验（软模式）**
   - `resolveEnhancementTarget` / `equipItem` / `createSellOrder` 等加入 expectedItemInstanceId 校验
   - `ITEM_INSTANCE_ID_HARD_CHECK = false`：mismatch 只警告
   - 客户端 `craft-*-view.ts`、`inventory-panel.ts`、`market-panel.ts` 透传 expected

8. **客户端发布**
   - 客户端开始发送 expectedItemInstanceId
   - 观察 1–2 周，确认 mismatch warn 频次低于阈值

9. **硬校验上线**
   - `ITEM_INSTANCE_ID_HARD_CHECK = true`
   - mismatch 直接拒绝并提示玩家

每一步都是独立可回滚的小步快走。任何一步失败都不影响玩家正常使用（最多回到旧的 slot-based 寻址）。

## 17. 回滚策略

### 17.1 整体回滚

直接回滚代码包。`item_instance_id` 列上的新 UUID 值在旧代码下仍然合法（只是不会再被读取/校验），不会破坏 schema。新装备分配的 UUID 在旧代码下视为普通字符串，写库不报错。

### 17.2 单步回滚

| 步骤 | 回滚方式 |
|---|---|
| shared 类型 | 直接还原；optional 字段不影响序列化 |
| 持久化 | 还原写入逻辑；列值保持不变（旧/新混用） |
| 生成入口 | 还原；新装备不再分配，旧装备保留 |
| 堆叠合并 | 还原；带 instanceId 的装备**会**重新合并到同签名堆叠 → 这是唯一**不可干净回滚**的步骤；需要 release note 说明 |
| 协议校验 | `HARD_CHECK = false` 即可立即软化 |
| 客户端 | 老客户端不发 expected → 服务端兼容 |

### 17.3 数据修复

如果硬校验上线后发现误判（玩家正常操作被错误拒绝），通过：
1. 临时把 `HARD_CHECK = false`
2. 收集 mismatch 日志，定位漏改的代码路径
3. 修复后重新启用

## 18. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 某个生成入口漏改，导致装备无 instanceId 被持久化 | §11.2 的 throw 守卫；smoke 全覆盖 |
| 装/卸合并改造遗漏，导致玩家装备被合成单个 stack | smoke 验证；玩家 inventory.items 长度 = 槽位数装备数 |
| 强化产物丢失 instanceId（写回不一致） | §6.3 显式继承；smoke 全 5 条路径覆盖（成功/失败/降级/取消/中断） |
| 客户端老版本永不升级 | 软校验阶段保持兼容；硬校验前观察日志确认升级比例 |
| 内存 / 包体上涨 | bench 监控；可降级为 nanoid 或 binary 编码 |
| 数据库 PK 冲突（极小概率 UUID 碰撞） | UUID v4 碰撞概率可忽略；UNIQUE 约束兜底 |
| 玩家断线重连期间出现 mismatch | 客户端首包重读后 expected 必然刷新；不构成永久状态 |

## 19. 待办与未覆盖

本次方案**不**覆盖：

- 装备拆解 / 销毁 / 熔炼 链路（当前未实现，未来引入时记得带 instanceId）
- 装备转赠 / 玩家间交易（同上）
- 装备绑定 / 灵魂绑定标记（与 instanceId 正交，但属于"实例属性"，未来可在同一字段层扩展）
- 装备外观 / 词缀 / 随机后缀（如果未来引入运行时随机属性，instanceId 是承载这些差异的关键基础设施）
- 历史数据审计回溯（旧装备没有可信身份，无法追溯 instanceId 上线前的命运）

## 20. 总结

| 项目 | 结论 |
|---|---|
| 解决的核心问题 | 强化 / 装/卸 / 市场挂单 / 装备身份追溯 |
| 改造规模 | shared 5 文件、server 15+ 文件、client 5+ 文件，分 9 步小步快走 |
| 风险等级 | 中（涉及核心资产链路；但每步可回滚） |
| 数据迁移 | 零停机 lazy 升级；无 schema 变更 |
| 包体影响 | UUID v4 每件装备 +36B；可接受 |
| 验证链路 | 新增 5 个 smoke；现有 10+ smoke 适配；release:with-db 通过 |
| 落地节奏 | 第 1 周代码上线（软校验）→ 第 2 周观察 → 第 3 周硬校验 |

落地后，`AGENTS.md` §8 "服务端权威" 与 §13 "持久化真源" 红线在装备资产链路上得到补齐：装备从生成到销毁的全程都有稳定身份，意图与目标的错配可在协议层显式拒绝，资产追溯链路可以跨表/跨链路追踪到单件装备的命运。


## 21. 落地任务清单

> 实施期间持续维护此清单。每条任务真正完成（代码 + 验证均到位）后才打勾。
> 验证统一遵循 §15.4 的门禁矩阵；本节中的"最小验证"列出该任务最低需通过的门禁。

### 21.1 shared 层（阶段 1）

- [x] **S1**：`packages/shared/src/item-runtime-types.ts` 给 `ItemStack` 增加 `itemInstanceId?: string`
- [x] **S2**：`packages/shared/src/synced-panel-types.ts` 给 `SyncedItemStack` 增加 `itemInstanceId?: string`
- [x] **S3**：`packages/shared/src/item-stack.ts` 增加 `isItemInstanceTracked` / `canMergeItemStack` / `isLegacyItemInstanceId` 工具
- [x] **S4**：`packages/shared/src/crafting-types.ts` 给 `EnhancementTargetRef` 增加 `expectedItemInstanceId?: string`；`SyncedEnhancementItemView` 增加 `itemInstanceId?: string`
- [x] **S5**：`packages/shared/src/client-service-request-types.ts` 给 `EquipItemRequestView` / `UnequipItemRequestView` / `MarketCreateSellOrderRequestView` / `MarketSellNowRequestView` 等增加 `expectedItemInstanceId?`
- [x] **S6**：`pnpm build:shared` 通过
- [~] **S7**：`pnpm audit:protocol` —— 当前分支 baseline 已有失败（`cloneItemPreservingTemplate` 与冻结模板写入 itemId 的问题，与本方案改动正交，详见 §21 末尾"已知 baseline 风险"）；本方案的协议字段增加只是 optional 字段，不破坏 protobuf / envelope 形状校验

### 21.2 服务端工具层（阶段 2）

- [x] **T1**：新增 `packages/server/src/runtime/world/item-instance-id.helpers.ts`，导出 `assignItemInstanceIdIfNeeded` / `reassignItemInstanceId` / `isLegacyItemInstanceId`
- [x] **T2**：`packages/server/src/content/content-template-utils.ts` 在 `ITEM_INSTANCE_FIELD_KEYS` 加入 `itemInstanceId`
- [x] **T3**：`pnpm build:server` 通过

### 21.3 持久化层（阶段 3）

- [x] **P1**：`packages/server/src/persistence/inventory-item-persistence.ts` 的 `hydratePersistedInventoryItem` / `hydratePersistedEquipmentItem` 把 source.itemInstanceId 注入返回的物品；`buildPersistedInventoryItemRawPayload` / `buildPersistedEquipmentItemRawPayload` 不写入 itemInstanceId（已经走列存储）
- [x] **P2**：`packages/server/src/persistence/player-domain-persistence.service.ts` inventory SELECT 增加 `item_instance_id` 列；hydrate 时把列值注入回 ItemStack；写入路径已支持 entry.itemInstanceId 优先
- [x] **P3**：`packages/server/src/persistence/player-domain-persistence.service.ts` equipment 写入路径已经支持 entry/item.itemInstanceId 优先（既有逻辑），新增 hydrate 透传
- [x] **P4**：`packages/server/src/persistence/durable-operation.service.ts` 的 `DurableInventoryItemSnapshot` 增加 `itemInstanceId?` 字段；`replacePlayerInventoryItems` 优先使用 sourceItem.itemInstanceId（fallback 保留）；inventory-grant.helpers `buildNextInventorySnapshots` / `buildGrantedInventorySnapshots` 透传 itemInstanceId

### 21.4 生成入口（阶段 4）

> 核心策略：在 `ContentTemplateRepository.createItem` 这个"新实例创建"瓶颈统一调用 `assignItemInstanceIdIfNeeded`，覆盖大部分入口；强化产物路径 `resolveEnhancementJobItem` 显式继承；GM / 市场等特殊入口单点处理。

- [x] **G1**：怪物 / 容器掉落（drop-table.registry / loot-container 调 createItem，自动覆盖）
- [x] **G2**：炼器合成产物（receiveInventoryItem 已分配；craft-panel 内 createItem 自动）
- [x] **G3**：强化产物继承（`resolveEnhancementJobItem` 显式继承 `job.item.itemInstanceId`）
- [x] **G4**：GM 给装备（`native-gm-player.service.ts` 显式 `assignItemInstanceIdIfNeeded`）
- [x] **G5**：邮件附件入库时分配（mail-runtime 调 receiveInventoryItem，自动覆盖）
- [x] **G6**：兑换码（redeem-code-runtime 调 createItem / receiveInventoryItem，自动覆盖）
- [x] **G7**：NPC 商店（npc-shop-query 调 createItem，自动覆盖）
- [x] **G8**：市场买家成交（toOrderItem 显式剥离 instanceId；deliverItemToPlayer → receiveInventoryItem 重新分配）
- [x] **G9**：任务奖励（quest-query 调 createItem / npc-quest-write 调 receiveInventoryItem，自动覆盖）
- [x] **G10**：玩家初始装备（createStarterInventory 调 createItem，自动覆盖；当前 createDefaultEquipment 全 null，无需处理）

### 21.5 堆叠合并改造（阶段 5）

- [x] **M1**：`equipItem`：旧装备返回背包永远独立成 slot，不与同签名合并；同时 lazy 升级 instanceId
- [x] **M2**：`unequipItem`：卸下装备永远独立成 slot；同时 lazy 升级
- [x] **M3**：`receiveInventoryItem`（player-runtime / craft-panel-runtime 两处实现）：接入 `canMergeItemStack`
- [x] **M4**：`world-runtime-inventory-grant.helpers.ts:buildNextInventorySnapshots` / `buildGrantedInventorySnapshots`：透传 itemInstanceId（已在阶段 3 一并完成）

### 21.6 水合 lazy 升级（阶段 6）

- [x] **H1**：`packages/server/src/runtime/player/player-runtime.service.ts:hydrateFromSnapshot` 在末尾遍历 `inventory.items` 与 `equipment.slots`，对带 fallback ID 的装备调 `assignItemInstanceIdIfNeeded` 升级，并 markDirty + bumpPersistentRevision 触发下次 flush
- [x] **H2**：装备槽水合回流路径同步处理（H1 一并覆盖 equipment.slots）

### 21.7 协议软校验 + 客户端透传（阶段 7）

- [ ] **C1**：`packages/server/src/config` 增加 `ITEM_INSTANCE_ID_HARD_CHECK` 布尔配置（默认 false）
- [ ] **C2**：`craft-panel-runtime.service.ts:resolveEnhancementTarget` / `startEnhancement`：实施 expectedItemInstanceId 软校验
- [ ] **C3**：`player-runtime.service.ts:equipItem` / `unequipItem` 接受并校验 `expectedItemInstanceId`；网络入口 `world-runtime-equipment.service.ts` 透传
- [ ] **C4**：`market-runtime.service.ts:createSellOrder` / `sellNow`：实施 expectedItemInstanceId 软校验
- [ ] **C5**：客户端 `craft-enhancement-view.ts` / `craft-workbench-modal.ts`：payload 透传 expectedItemInstanceId
- [ ] **C6**：客户端 `inventory-panel.ts` / `equipment-panel.ts`：装/卸/上架 payload 透传
- [ ] **C7**：客户端 `market-panel.ts`：挂售 payload 透传

### 21.8 测试与验证（阶段 8）

- [ ] **V1**：新增 `packages/server/src/tools/item-instance-id-assignment-smoke.ts`
- [ ] **V2**：新增 `packages/server/src/tools/world-runtime-enhancement-instance-id-smoke.ts`
- [ ] **V3**：新增 `packages/server/src/tools/equipment-equip-instance-id-smoke.ts`
- [ ] **V4**：新增 `packages/server/src/tools/market-instance-id-smoke.ts`
- [ ] **V5**：新增 `packages/server/src/tools/inventory-grant-instance-id-smoke.ts`
- [ ] **V6**：现有 smoke 适配（`world-runtime-enhancement-smoke` / `durable-operation-smoke` / `player-domain-persistence-smoke` / `inventory-grant-durable-smoke` / `world-runtime-loot-container-smoke` / `world-runtime-npc-shop-smoke` / `world-runtime-craft-smoke` / `redeem-code-runtime-durable-smoke` / `market-runtime-buy-now-smoke` / `market-runtime-sell-now-smoke` / `world-runtime-player-combat-smoke`）
- [ ] **V7**：`pnpm build:shared` / `pnpm build:server` 通过
- [ ] **V8**：`pnpm audit:protocol` 通过
- [ ] **V9**：`pnpm verify:quick` 通过

### 21.9 最终审计

- [ ] **F1**：方案文档 §21 所有勾选项确认完成
- [ ] **F2**：交付说明：完成内容、修改文件、验证结果、未覆盖项
