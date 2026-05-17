# 数据冗余审计：模板数据 vs 实例数据分离问题

> 审计日期：2026-03-21
> 项目：mud-mmo-next (道界余生)

## 核心问题

项目中存在大量"本应只存 ID + 运行时差异，却把完整模板数据（描述、公式、每级加成等静态信息）一起塞进实例"的情况。持久化层已部分修复，但网络传输层和内存层仍有严重冗余。

---

## 严重程度总览

| 优先级 | 问题 | 影响 | 冗余量估算 |
|--------|------|------|-----------|
| **P0** | 物品 `{...entry}` 展开原型链写入持久化+网络 | 每次 flush + 每次面板推送 | 每物品 ~500B × 背包容量 |
| **P0** | Protobuf 编码完全未启用，全走 JSON | 所有网络传输 | 带宽浪费 30-50% |
| **P1** | 功法 skills/layers 完整推送客户端 | 每次功法面板更新 | 每功法 1-5KB |
| **P1** | 怪物实例完整克隆模板数据到内存 | 常驻内存 | 每怪物 ~2KB × 地图怪物数 |
| **P1** | Bootstrap 首包已精简但 PanelDelta 未对齐 | 运行时增量比首包还大 | 设计矛盾 |
| **P2** | 行动面板推送模板字段 | 每次行动面板更新 | 每行动 ~100B |
| **P3** | 怪物持久化含冗余模板字段 | 地图实例 flush | 每怪物 ~50B |

---

## P0-A：物品系统 — `{...entry}` 展开原型链导致模板数据泄漏

### 问题描述

物品实例通过 `Object.create(template)` 创建，运行时通过原型链共享模板数据（内存零开销）。但在持久化和网络序列化时使用 `{...entry}` 展开，导致原型链上所有 enumerable 属性被平铺为自有属性。

### 涉及文件

- 类型定义：`packages/shared/src/item-runtime-types.ts:590-810`
- 网络同步视图：`packages/shared/src/synced-panel-types.ts:11-198`
- 持久化展开：`packages/server/src/runtime/player/player-runtime.service.ts:5577-5580`
- 面板投影展开：`packages/server/src/runtime/world-projector.helpers.ts:895-896`
- 实例创建（原型链）：`packages/server/src/content/content-template-utils.ts:9`

### 数据结构对比

**实际需要存储/传输的实例数据（4个字段）：**
```typescript
{
  itemId: string;           // 物品模板 ID
  count: number;            // 数量
  itemInstanceId?: string;  // 装备实例唯一 ID
  enhanceLevel?: number;    // 强化等级
}
```

**实际被序列化的数据（~30个字段）：**
```typescript
{
  itemId, count, itemInstanceId, enhanceLevel,  // ✅ 实例数据
  // ❌ 以下全部是模板数据，通过 {...entry} 从原型链展开
  name: "玄铁剑",
  type: "weapon",
  desc: "一把由玄铁锻造的长剑...",
  grade: "yellow",
  level: 15,
  equipSlot: "weapon",
  equipAttrs: { str: 12, agi: 5, ... },
  equipStats: { attack: 150, critRate: 0.05, ... },
  effects: [{ buffId: "...", name: "...", duration: ..., attrs: {...} }],
  healAmount: undefined,
  cooldown: undefined,
  consumeBuffs: [...],
  tags: ["sword", "metal"],
  groundLabel: "一把剑",
  materialCategory: "metal",
  materialValues: { ... },
  alchemySuccessRate: undefined,
  alchemySpeedRate: undefined,
  enhancementSuccessRate: undefined,
  // ... 还有约10个模板字段
}
```

### 问题代码

```typescript
// packages/server/src/runtime/player/player-runtime.service.ts:5577-5580
inventory: needsDomain('inventory') ? {
    revision: player.inventory.revision,
    capacity: player.inventory.capacity,
    items: player.inventory.items.map((entry) => ({ ...entry })),  // ❌ 展开原型链
} : { ... }

// packages/server/src/runtime/world-projector.helpers.ts:895-896
items: player.inventory.items.map((entry) => ({ ...entry }))  // ❌ 同样的问题
```

### 修复方案

```typescript
// 白名单提取实例字段
items: player.inventory.items.map((entry) => ({
  itemId: entry.itemId,
  count: entry.count,
  itemInstanceId: entry.itemInstanceId,
  enhanceLevel: entry.enhanceLevel,
}))
```

客户端通过 `itemId` 查本地物品模板注册表获取 name/type/desc 等静态信息。

---

## P0-B：Protobuf 编码完全未启用 — 全走 JSON 序列化

### 问题描述

项目已经编写了完整的 protobuf schema（~340 行）和 toWire/fromWire 编解码器（~600+ 行），但**从未实际启用**。所有网络传输走 socket.io 默认的 JSON 序列化。

### 涉及文件

- Schema 定义：`packages/shared/src/network-protobuf-schema.ts:351-355`
- 编解码器（死代码）：`packages/shared/src/network-protobuf.ts:64-71`
- 更新编解码器（死代码）：`packages/shared/src/network-protobuf-update-codecs.ts`

### 问题代码

```typescript
// packages/shared/src/network-protobuf-schema.ts:351-355
export const PROTOBUF_S2C_EVENTS = new Set<string>(); // ❌ 空集合！
export const PROTOBUF_C2S_EVENTS = new Set<string>(); // ❌ 空集合！

// packages/shared/src/network-protobuf.ts:64-71
export function encodeServerEventPayload<T>(event: string, payload: T): T | Uint8Array {
  if (PROTOBUF_S2C_EVENTS.has(event)) { // 永远为 false
    // protobuf 编码逻辑（永远不执行）
  }
  return payload; // 始终原样返回 JSON
}
```

### 影响

- ~1000 行 protobuf 相关代码是死代码（维护负担）
- 所有高频事件（WorldDelta、PanelDelta、SelfDelta）走 JSON，带宽效率比 protobuf 低 30-50%
- 结合 P0-A 的原型链展开问题，JSON 序列化会把所有模板字段都传输出去

### 修复方案

将高频事件注册到 `PROTOBUF_S2C_EVENTS` 集合中即可激活已有的编解码逻辑。

---

## P1-A：功法系统 — skills/layers 完整推送到客户端

### 问题描述

`TechniqueState` 在运行时通过引用共享 `skills` 和 `layers`（内存无额外开销），但网络传输时通过 `JSON.stringify` 完整序列化推送给客户端。一个天阶功法可能有 49 层 layers + 多个 SkillDef（每个含递归公式树、效果定义、buff 定义），单个功法 wire 数据量可达数 KB。

### 涉及文件

- 类型定义：`packages/shared/src/cultivation-types.ts:425-487`
- 面板视图：`packages/shared/src/panel-update-types.ts:124-185`
- 网络编码：`packages/shared/src/network-protobuf-update-codecs.ts:22-46`
- 构建函数：`packages/server/src/content/content-template-utils.ts:284-307`
- 投影器克隆：`packages/server/src/runtime/world-projector.helpers.ts:903-904`

### 数据结构对比

**实际需要传输的实例数据：**
```typescript
{
  techId: string;         // 功法 ID
  level: number;          // 当前等级
  exp: number;            // 当前经验
  expToNext: number;      // 升级所需经验
  realm: TechniqueRealm;  // 当前境界
  realmLv: number;        // 境界等级
  skillsEnabled: boolean; // 技能开关
}
```

**实际被传输的数据：**
```typescript
{
  techId, level, exp, expToNext, realm, realmLv, skillsEnabled,  // ✅ 实例数据
  name: "太虚剑诀",           // ⚠️ 模板数据
  grade: "heaven",            // ⚠️ 模板数据
  category: "sword",          // ⚠️ 模板数据
  skills: [{                  // ❌ 完整技能定义
    id: "skill_001",
    name: "剑气纵横",
    desc: "以真气化剑，攻击前方敌人...",
    cooldown: 3,
    cost: 50,
    range: 5,
    targeting: { mode: "line", width: 1, length: 5 },
    effects: [{
      type: "damage",
      formula: { op: "mul", left: { ref: "atk" }, right: { val: 2.5 } },
      // ... 递归公式树
    }],
    unlockLevel: 10,
    playerCast: { animation: "slash", sound: "sword_qi" },
  }],
  layers: [                   // ❌ 完整层级定义（可能49层）
    { level: 1, expRequired: 100, attrs: { str: 1 }, stats: { attack: 5 } },
    { level: 2, expRequired: 250, attrs: { str: 2 }, stats: { attack: 12 } },
    // ... 最多49层
  ],
}
```

### 问题代码

```typescript
// packages/shared/src/network-protobuf-update-codecs.ts:22-46
wire.skillsJson = JSON.stringify(entry.skills);   // ❌ 完整技能定义序列化
wire.layersJson = JSON.stringify(entry.layers);   // ❌ 完整层级配置序列化

// packages/server/src/runtime/world-projector.helpers.ts:903-904
cloneTechniqueEntry(entry)  // ❌ 完整克隆含 skills/layers
```

### 修复方案

1. 客户端建立功法模板注册表，首次登录时下发或按需拉取
2. 面板增量推送只发实例字段：`techId + level + exp + expToNext + realm + skillsEnabled`
3. 将 `TechniqueUpdateEntryView` 拆分为 `TechniqueInstanceView`（传输用）和 `TechniqueFullView`（仅首次/按需）

---

## P1-B：怪物系统 — 每个实例完整克隆模板数据

### 问题描述

每个怪物实例在创建时将模板的 skills、attrs、numericStats、initialBuffs 等完整复制到实例对象上。同一地图上 10 只相同怪物 = 10 份相同的属性/技能副本。

### 涉及文件

- 实例创建：`packages/server/src/content/registries/monster-template.registry.ts:109-164`
- 持久化：`packages/server/src/runtime/instance/map-instance-persistence-projector.ts:63-81`

### 数据结构对比

**实际需要的实例数据：**
```typescript
{
  runtimeId: string;      // 运行时唯一 ID
  monsterId: string;      // 模板 ID
  x: number; y: number;   // 位置
  hp: number;             // 当前血量
  alive: boolean;         // 存活状态
  respawnLeft: number;    // 重生倒计时
  facing: Direction;      // 朝向
  level: number;          // 等级
  tier: number;           // 阶级
  aggroTarget?: string;   // 仇恨目标
}
```

**实际存储在每个实例上的数据：**
```typescript
{
  runtimeId, monsterId, x, y, hp, alive, respawnLeft, facing, level, tier,  // ✅ 实例数据
  // ❌ 以下从模板复制到每个实例
  name: "赤焰虎",                    // 模板数据
  char: "T",                          // 模板数据（显示字符）
  color: "#ff4400",                   // 模板数据
  respawnTicks: 300,                  // 模板数据
  aggroRange: 8,                      // 模板数据
  leashRange: 15,                     // 模板数据
  attackRange: 1,                     // 模板数据
  attackCooldownTicks: 20,            // 模板数据
  statFormula: { ... },               // 模板数据
  ratioDivisors: { ... },            // 模板数据
  initialBuffs: [{ ... }],           // 模板数据
  skills: [{ id, name, desc, effects, formula, ... }],  // ❌ 完整技能定义
  baseAttrs: { str: 50, agi: 30, ... },      // ❌ 新对象，可从模板+等级推导
  baseNumericStats: { attack: 200, ... },    // ❌ 新对象，可从模板+等级推导
  expMultiplier: 1.5,                        // 可从模板+等级推导
}
```

### 问题代码

```typescript
// packages/server/src/content/registries/monster-template.registry.ts:109-164
createRuntimeMonsterSpawn(monsterId, options) {
    const template = this.getTemplate(monsterId);
    return {
        ...instanceFields,
        name: template.name,                   // ⚠️ 每个实例复制一份
        skills: template.skills,               // 引用共享（还行，但不该在实例上）
        baseAttrs: resolvedStats.attrs,        // ❌ 新对象，每实例一份
        baseNumericStats: resolvedStats.numericStats,  // ❌ 新对象
        // ... 十几个模板字段
    };
}
```

### 修复方案

```typescript
// 方案 A：运行时查模板
createRuntimeMonsterSpawn(monsterId, options) {
    return {
        runtimeId: generateId(),
        monsterId,
        x, y, hp: resolvedStats.maxHp,
        alive: true, respawnLeft: 0,
        facing, level, tier,
    };
}
// 使用时：const template = registry.getTemplate(monster.monsterId);

// 方案 B：Object.create 原型链（需注意序列化陷阱）
const instance = Object.create(templateView);
Object.assign(instance, { runtimeId, x, y, hp, alive, ... });
```

---

## P1-C：Bootstrap 首包已精简但 PanelDelta 未对齐 — 设计矛盾

### 问题描述

Bootstrap 首包（`BootstrapSelfView`）已经正确实现了模板/实例分离：
- `BootstrapItemStackView` 只含 `itemId + count + enhanceLevel`
- `BootstrapTechniqueView` 只含 `techId + level + exp + expToNext + skillsEnabled`

客户端通过 `hydrateBootstrapPlayer` 用本地模板补齐。

但后续的 PanelDelta 增量更新**没有采用同样的策略**，反而推送完整模板数据。这意味着：首次登录传输精简数据，之后的每次更新反而传输更多数据。

### 涉及文件

- Bootstrap 精简视图：`packages/shared/src/session-sync-types.ts`
- PanelDelta 完整视图：`packages/shared/src/synced-panel-types.ts`
- 客户端 hydrate：`packages/client/src/main-panel-delta-state-source.ts:589-669`

### 数据流对比

```
首次登录（Bootstrap）：
  服务端 → { itemId, count, enhanceLevel } → 客户端 hydrate 补齐模板 ✅

后续更新（PanelDelta）：
  服务端 → { itemId, count, enhanceLevel, name, type, desc, grade, equipAttrs, ... } → 客户端 ❌
```

### 修复方案

PanelDelta 应该与 Bootstrap 对齐，只发实例字段。客户端已有 `hydrateSyncedItemStack` 函数做模板补齐，只需服务端不再发送模板字段即可。

---

## P2：行动面板 — 推送模板字段

### 涉及文件

- `packages/shared/src/panel-update-types.ts:188-244`

### 数据结构对比

**需要传输的实例数据：**
```typescript
{
  id: string;                   // 行动 ID
  cooldownLeft: number;         // 冷却剩余
  autoBattleEnabled: boolean;   // 自动战斗开关
  autoBattleOrder: number;      // 自动战斗优先级
  skillEnabled: boolean;        // 技能启用状态
}
```

**实际传输的数据：**
```typescript
{
  id, cooldownLeft, autoBattleEnabled, autoBattleOrder, skillEnabled,  // ✅
  name: "剑气纵横",           // ⚠️ 模板数据
  type: "attack",             // ⚠️ 模板数据
  desc: "以真气化剑...",      // ⚠️ 模板数据
  range: 5,                   // ⚠️ 模板数据
  requiresTarget: true,       // ⚠️ 模板数据
  targetMode: "entity",       // ⚠️ 模板数据
}
```

---

## P3：怪物持久化含冗余字段

### 涉及文件

- `packages/server/src/runtime/instance/map-instance-persistence-projector.ts:63-81`

### 冗余字段

```typescript
interface MonsterRuntimeEntry {
  // ✅ 需要持久化
  monsterRuntimeId, monsterId, tileIndex, x, y,
  hp, maxHp, qi, maxQi, alive, respawnLeft,
  monsterLevel, aggroTargetPlayerId, statePayload,
  // ⚠️ 冗余 - 可从 monsterId 查模板
  monsterName: string;      // 模板数据
  monsterTier: string;      // 可从 monsterId + level 推导
  respawnTicks: number;     // 模板数据
  maxHp: number;            // 可从模板 + level 推导
  maxQi: number;            // 可从模板 + level 推导
}
```

---

## 设计合理的部分（无需修改）

以下系统已正确实现"只存 ID + 差异"模式：

| 系统 | 实现方式 | 说明 |
|------|---------|------|
| 地图实例 | `template` 引用 + 增量 delta + 稀疏 TypedArray | 不克隆地图模板，只存运行时变化 |
| 门派系统 | 玩家只存 `sectId` | 门派数据独立持久化 |
| 任务系统 | 只存进度字段 | 叙事内容通过 questId 按需查模板 |
| 功法持久化 | 手动白名单提取 | 不存 skills/layers（但存了 name/grade/category） |
| 邮件附件 | 只存 `itemId + count` | 领取时查模板生成实例 |
| 地图 Tile | TypedArray + 位标志 | 不存完整地形定义 |
| 灵气/资源节点 | `resourceKey + tileIndex + value` | 不克隆模板 |
| 地面掉落物 | 最小展示信息 | 不内联完整物品模板 |
| 装备系统 | `templateId + enhanceLevel + rolledBonusStats` | 正确的实例数据 |
| WorldDelta 实体同步 | 投影器精简 + revision diff | 只传渲染所需最小字段 |
| 审计日志 | 纯元数据 | 不嵌入对象快照 |

---

## 客户端侧问题

### 客户端已有模板注册表但未被协议层利用

**文件**：`packages/client/src/content/local-templates.ts`

客户端已有基于 `editor-catalog.generated.json`（16354 行）的本地模板缓存：
- `itemTemplateMap` — 物品模板
- `techniqueTemplateMap` — 功法模板
- `skillTemplateMap` — 技能模板
- `buffTemplateMap` — Buff 模板

但这些模板仅用于 "预览补齐"（`resolvePreviewItem`、`resolvePreviewTechnique`），而非协议层的正式模板/实例分离。服务端在 PanelDelta 中仍然推送完整模板字段。

### 客户端状态管理直接存储完整数据

**文件**：`packages/client/src/main-panel-delta-state-source.ts`

```typescript
// 行 412-413: 缓存完整条目（含模板字段）
let latestTechniqueMap = new Map<string, TechniqueState>();
let latestActionMap = new Map<string, ActionDef>();

// 行 1060-1092: 直接写入 player（含模板字段）
player.techniques = mergedTechniques;
player.actions = mergedActions;
player.inventory = mergedInventory;
```

---

## 根因分析

1. **`{...obj}` 和 `JSON.stringify` 穿透原型链**：`Object.create(template)` 模式在运行时很优雅，但序列化时需要自定义 `toJSON()` 或白名单提取，项目没有做这一步
2. **客户端模板注册表未被协议层利用**：客户端已有模板数据，但服务端不信任客户端有模板，每次都推送完整数据
3. **Bootstrap 和 PanelDelta 设计不一致**：Bootstrap 已经做了精简，但 PanelDelta 没有对齐，说明是不同时期写的代码
4. **怪物实例创建时图省事**：直接从模板复制所有字段到实例，方便战斗系统直接读取，但牺牲了内存效率
5. **类型定义未区分职责**：`TechniqueState`/`ItemStack` 同时承担"运行时状态"、"网络传输视图"、"持久化载荷"三个职责
6. **Protobuf 编码写了但没启用**：可能是因为调试方便或者还没来得及切换

---

## 建议修复路线

### 阶段一：止血（低风险，高收益）

1. **修复物品序列化**：持久化和面板投影中的 `{...entry}` → 白名单提取 4 个实例字段
2. **PanelDelta 对齐 Bootstrap**：物品/功法/行动的增量推送只发实例字段
3. **启用 Protobuf**：将高频事件注册到 `PROTOBUF_S2C_EVENTS`，激活已有编解码逻辑

### 阶段二：优化（中等风险）

4. **正式化客户端模板注册表**：将 `local-templates.ts` 从 "预览补齐" 升级为协议层的正式模板源
5. **怪物实例瘦身**：改为只存实例差异，运行时通过 `monsterId` 查模板
6. **统一类型层**：定义 `XxxInstanceData`（持久化/传输）、`XxxTemplateData`（静态定义）、`XxxRuntimeView`（运行时合成视图）

### 阶段三：架构升级（高风险，长期）

7. **Flyweight 模式**：怪物/物品实例只持有 templateRef + 实例差异，共享模板对象
8. **网络协议双通道**：模板同步通道（低频、全量）+ 实例增量通道（高频、精简）
9. **物品实例添加 `toJSON()` 方法**：从根源上防止原型链泄漏
