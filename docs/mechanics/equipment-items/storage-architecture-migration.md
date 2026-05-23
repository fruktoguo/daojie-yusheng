# 存储架构迁移方案：对齐九州式关系表模式

## 一、现状评估

### 1.1 当前项目已完成的部分

经过代码审查，当前项目的持久化层**已经基本实现了九州的核心设计理念**：

| 域 | 持久化现状 | 是否对齐九州 |
|---|---|---|
| 物品/装备 | `player_inventory_item` 表：列字段存 item_id/count/enhance_level，`raw_payload` 只存 `{ enhanceLevel }` | ✅ 已对齐 |
| 功法 | `player_technique_state` 表：列字段存 tech_id/level/exp/realm_lv/skills_enabled，`raw_payload` 只存动态字段 | ✅ 已对齐 |
| 装备槽 | `player_equipment_slot` 表：列字段存 slot_type/item_id/item_instance_id，`raw_payload` 只存 enhanceLevel | ✅ 已对齐 |
| Buff | `player_persistent_buff_state` 表：列字段存 buff_id/remaining_ticks/duration/stacks 等 | ✅ 已对齐 |
| 技能 | 无独立表，内嵌在功法模板 `skills[]` 中 | ⚠️ 部分差异 |
| 背包容量 | 无独立表，存在 inventory 快照的 capacity 字段 | ⚠️ 部分差异 |
| 货币 | `player_wallet` 分域表 | ✅ 已对齐（九州直接存角色表） |

### 1.2 水合机制已就绪

- **物品**：`hydratePersistedInventoryItem()` 通过 `Object.create(template)` 实现原型链共享
- **功法**：`hydrateTechniqueState()` 通过 `buildTechniqueRuntimeStateFromTemplate()` 从模板恢复完整状态
- **技能**：功法模板的 `skills[]` 在 hydrate 时直接引用模板只读数组

### 1.3 与九州的核心差异

| 差异点 | 九州做法 | 当前项目做法 | 影响 |
|--------|---------|-------------|------|
| 技能槽位 | 独立 `character_skill_slot` 表，玩家主动配置战斗技能 | 技能由功法层级自动解锁，无独立槽位管理 | 玩法差异，非架构缺陷 |
| 背包容量 | 独立 `inventory` 表存 bag_capacity/warehouse_capacity | 容量存在 inventory 快照域 | 可优化为独立列 |
| 物品实例 ID | 数据库自增 BigInt | UUID v4 字符串 | 各有优劣 |
| 词条/宝石 | `item_instance` 存 affixes/socketed_gems JSON | 当前无随机词条系统 | 未来扩展点 |
| 角色主表 | 独立 `characters` 表存境界/属性点/货币等 | 分域表 + 快照 | 已有等效实现 |

---

## 二、需要迁移的部分

基于现状分析，真正需要改动的是以下几个方面：

### Phase 1：技能槽位独立化

**前提条件**：当前项目是否需要"玩家主动选择装配哪些技能到战斗槽"的玩法？

- 如果**不需要**（技能由功法层级自动解锁，全部可用）→ 无需迁移，当前设计合理
- 如果**需要**（未来要做技能槽位限制、玩家选择装配）→ 新增独立表

#### 1.1 新增表结构（仅在需要时）

```sql
CREATE TABLE IF NOT EXISTS player_skill_slot (
  player_id    varchar(100) NOT NULL,
  slot_index   smallint NOT NULL,
  skill_id     varchar(120) NOT NULL,
  source_tech_id varchar(120),  -- 技能来源功法
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id, slot_index),
  UNIQUE(player_id, skill_id)
);
CREATE INDEX player_skill_slot_player_idx
  ON player_skill_slot(player_id);
```

#### 1.2 运行时变更

- `PlayerState` 新增 `equippedSkillSlots: { slotIndex: number; skillId: string }[]`
- 战斗系统从 `equippedSkillSlots` 读取可用技能，而非遍历所有功法的 skills[]
- `autoBattleSkills` 配置改为引用 `equippedSkillSlots` 中的技能

#### 1.3 Save/Load 链路

- Save：从 `equippedSkillSlots` 写入 `player_skill_slot` 表
- Load：从表读取后填充 `equippedSkillSlots`
- 兼容：无 `player_skill_slot` 数据时，fallback 为"所有已解锁技能全部装配"

---

### Phase 2：背包容量独立列化

**目标**：将背包容量从 inventory 快照域提升为独立列字段，支持高效查询。

#### 2.1 表变更

```sql
-- 在 player_inventory_item 的索引表或新增 player_inventory_meta 表
CREATE TABLE IF NOT EXISTS player_inventory_meta (
  player_id          varchar(100) PRIMARY KEY,
  bag_capacity       int NOT NULL DEFAULT 50,
  warehouse_capacity int NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
```

#### 2.2 收益

- 扩容操作可直接 UPDATE 单行，无需触发整个 inventory 域 flush
- 容量查询不需要加载完整背包

---

### Phase 3：装备随机词条系统（未来扩展）

**前提条件**：当前项目无随机词条，装备属性完全由模板决定。如果未来要加入九州式的随机词条系统：

#### 3.1 扩展 raw_payload

```typescript
// player_inventory_item.raw_payload 扩展为：
interface EquipmentInstancePayload {
  enhanceLevel?: number;
  affixes?: AffixInstance[];       // 随机词条
  socketedGems?: string[];         // 镶嵌宝石 itemId
  quality?: string;                // 品质（如果随机）
  qualityRank?: number;
  refineLv?: number;               // 精炼等级
  customName?: string;             // 自定义名称
}
```

#### 3.2 模板与实例的关系

- 模板定义：基础属性、可用词条池、品质权重
- 实例存储：随机结果（词条 roll 值、品质）
- 运行时：模板基础 + 实例随机 = 最终属性

---

## 三、不需要迁移的部分

以下是当前项目已经做对的设计，无需改动：

1. **物品持久化**：`raw_payload` 只存 enhanceLevel，模板字段通过 Object.create 共享 ✅
2. **功法持久化**：只存 techId/level/exp/realm 等动态字段，hydrate 时从模板恢复 ✅
3. **分域增量 flush**：只写脏域，1500ms 间隔批量刷盘 ✅
4. **原型链内存优化**：物品实例通过 Object.create(template) 节省内存 ✅
5. **配置热更新**：下次 hydrate 自动获取最新模板 ✅

---

## 四、架构对比总结

```
┌─────────────────────────────────────────────────────────┐
│                    九州模式                               │
├─────────────────────────────────────────────────────────┤
│  静态定义层：JSON 文件 → 启动期加载到内存 Map            │
│  玩家实例层：关系表（item_instance / character_technique）│
│  运行时：查表 + JOIN 缓存拼装完整视图                    │
│  优势：跨玩家查询强、配置热更简单                        │
│  代价：读取需要 JOIN/缓存，实现复杂度高                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 当前项目模式（已优化后）                   │
├─────────────────────────────────────────────────────────┤
│  静态定义层：JSON 文件 → 启动期加载到内存 Map + 冻结     │
│  玩家实例层：分域表（player_inventory_item 等）           │
│             只存 ID + 动态字段，raw_payload 极简          │
│  运行时：加载时 hydrate（Object.create + 模板恢复）      │
│         tick 内直接读内存对象，零查询                     │
│  优势：tick 热路径零 IO、断线恢复简单、内存原型共享       │
│  代价：跨玩家查询需 JSONB 内查或遍历                     │
└─────────────────────────────────────────────────────────┘
```

**结论**：当前项目在持久化层已经实现了九州"定义统一存储 + 玩家只存 ID 和进度"的核心理念，同时保留了"运行时完整自包含对象"的 tick 性能优势。两者的差异主要在于：

1. 九州用关系型多表 + 外键约束，适合需要频繁跨玩家查询的场景
2. 当前项目用分域表 + hydrate，适合高频 tick 驱动的实时游戏场景

---

## 五、建议行动项

| 优先级 | 行动 | 理由 |
|--------|------|------|
| P0 | 无需改动 | 核心架构已对齐 |
| P1 | 评估是否需要技能槽位玩法 | 决定 Phase 1 是否执行 |
| P2 | 背包容量独立列化 | 小改动，提升扩容操作效率 |
| P3 | 随机词条系统设计 | 等玩法需求明确后再做 |

---

## 六、验证方式

任何迁移实施后：
- `pnpm verify:quick` — 服务端门禁
- `pnpm verify:release:with-db` — 带数据库验证
- 手动验证：创建角色 → 获取装备/功法 → 下线 → 重新上线 → 确认数据完整恢复
- 回滚策略：load 链路保留 fallback，旧格式 raw_payload 仍可正常 hydrate
