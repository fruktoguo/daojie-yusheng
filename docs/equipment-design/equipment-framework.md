# 装备框架设计

状态：草案 v1

适用范围：

- 当前 `packages/shared / packages/server / packages/client` 三端共享的装备定义与运行时框架
- 当前 `5` 个装备槽位：`weapon / head / body / legs / accessory`
- 目标是把装备从“静态数值物品”升级为“像技能一样可配置、可扩展、可统一结算的系统”

## 1. 设计目标

当前技能系统已经具备比较清晰的链路：

- 静态 JSON 配置
- `ContentService` 统一加载
- 共享类型约束配置结构
- 运行时按效果类型统一结算

装备系统现在还停留在：

- `ItemStack.equipAttrs`
- `ItemStack.equipStats`
- `EquipmentService` 负责穿脱和静态加成重算

这导致两个问题：

- 想加新效果时，只能继续往 `ItemStack` 平铺字段里塞
- 条件触发、持续代价、邪道副作用、时段效果都没有稳定入口

因此，装备框架的目标是：

- 装备定义方式与技能保持同一风格：配置驱动、统一类型、统一加载
- 装备效果分层：静态属性、事件触发、持续效果、邪道代价分开表达
- 装备效果可以被服务端统一驱动，不把判定散落到 tick、战斗、修炼各处
- 保持首期实现可控，不一上来就做成万能脚本语言

## 2. 非目标

这套框架首期不追求以下能力：

- 任意 Lua / JS 脚本式装备逻辑
- 装备随机词条系统
- 套装锻造、精炼、洗练、镶嵌
- 前端本地判定装备特效

首期先做“有限但够用的配置系统”，优先解决：

- 夜间生效
- 修炼加速
- 持续掉血 / 掉蓝
- 受击触发
- 移动触发
- 杀敌触发
- 区域 / 地图限定效果

## 3. 当前实现缺口

现有代码中的边界很明确：

- [packages/shared/src/types.ts](/home/yuohira/mud-mmo/packages/shared/src/types.ts) 里，装备还是 `ItemStack` 的平铺字段
- [packages/server/src/game/equipment.service.ts](/home/yuohira/mud-mmo/packages/server/src/game/equipment.service.ts) 只负责穿脱与静态属性叠加
- [packages/server/src/game/world.service.ts](/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts) 已有较成熟的技能 Buff 结算模板
- [packages/server/src/game/technique.service.ts](/home/yuohira/mud-mmo/packages/server/src/game/technique.service.ts) 已支持修炼 tick 推进
- [packages/server/src/game/tick.service.ts](/home/yuohira/mud-mmo/packages/server/src/game/tick.service.ts) 已有自然恢复和每 tick 驱动点

换句话说：

- “装备给静态数值”已经有
- “装备像技能一样配置事件和效果”还没有
- “装备持续掉血换修炼速度”这种邪道逻辑，需要有统一的装备事件入口和运行时效果状态

## 4. 总体架构

建议把装备框架拆成四层：

| 层级 | 职责 | 位置建议 |
| --- | --- | --- |
| 装备模板层 | 定义装备基础信息、槽位、品阶、静态词条、特效列表 | `packages/shared/src/types.ts` + `packages/server/data/content/items/*.json` |
| 效果定义层 | 定义触发器、条件、效果类型、参数结构 | `packages/shared/src/types.ts` |
| 内容加载层 | 读取 JSON、归一化、校验、建立索引 | `packages/server/src/game/content.service.ts` |
| 运行时结算层 | 在 tick / 战斗 / 修炼 / 昼夜切换时派发装备事件并结算 | `packages/server/src/game/equipment.service.ts` + 新增 `equipment-effect.service.ts` |

设计原则：

- 静态模板负责“这件装备是什么”
- 运行时状态负责“它现在有没有触发、叠了几层、还剩几息”
- 事件入口统一归口，不允许每种装备效果都直接写进不同业务模块

## 5. 配置模型

建议把“装备物品模板”和“装备效果定义”合在同一份装备数据里，避免后期维护两套 ID。

### 5.1 装备模板

建议新增独立结构：

```ts
interface EquipmentDef {
  itemId: string;
  name: string;
  type: 'equipment';
  grade: TechniqueGrade;
  level: number;
  desc: string;
  equipSlot: EquipSlot;
  equipAttrs?: Partial<Attributes>;
  equipStats?: PartialNumericStats;
  tags?: string[];
  effects?: EquipmentEffectDef[];
}
```

说明：

- `equipAttrs / equipStats` 继续保留，作为静态常驻词条
- `effects` 用于定义事件型或条件型特效
- `tags` 用于地图投放、系统筛选和条件判断，例如：
  - `fanren`
  - `evil_path`
  - `night_walk`
  - `cultivation`
  - `ruins`
  - `mine`

### 5.2 装备效果定义

装备效果不建议做成一个“超大而松散”的对象，而应仿照技能效果做联合类型。

```ts
type EquipmentEffectDef =
  | EquipmentStatAuraEffectDef
  | EquipmentTimedBuffEffectDef
  | EquipmentPeriodicCostEffectDef
  | EquipmentProgressEffectDef
  | EquipmentTriggerBuffEffectDef;
```

首期建议先收敛成五类：

| 效果类型 | 作用 |
| --- | --- |
| `stat_aura` | 常驻或条件常驻数值加成 |
| `timed_buff` | 触发后给自己施加临时 Buff |
| `periodic_cost` | 每 tick 扣血 / 扣蓝 / 扣资源 |
| `progress_boost` | 修炼、功法、掉落、视野等推进或成长收益 |
| `trigger_buff` | 对受击、移动、击杀等事件做触发型结算 |

## 6. 触发器设计

装备框架不能只支持“穿上就加”，必须有统一触发器。

### 6.1 触发器枚举

建议首期支持：

```ts
type EquipmentTrigger =
  | 'on_equip'
  | 'on_unequip'
  | 'on_tick'
  | 'on_move'
  | 'on_attack'
  | 'on_hit'
  | 'on_kill'
  | 'on_skill_cast'
  | 'on_cultivation_tick'
  | 'on_time_segment_changed'
  | 'on_enter_map';
```

设计说明：

- `on_tick` 负责持续代价、夜间常驻、区域光环一类效果
- `on_move` 负责轻身装、游斗装、步法类装备
- `on_hit` 负责“受击后强撑”“受创后化煞”
- `on_kill` 负责邪兵、凶器、噬血类设计
- `on_cultivation_tick` 专门承接“掉血换修炼”这类邪道装
- `on_time_segment_changed` 专门承接昼夜装备

## 7. 条件系统

有触发器还不够，必须有条件过滤，不然所有事件都要进业务逻辑判断。

建议定义：

```ts
interface EquipmentConditionGroup {
  mode?: 'all' | 'any';
  items: EquipmentConditionDef[];
}
```

```ts
type EquipmentConditionDef =
  | { type: 'time_segment'; in: Array<'dawn' | 'day' | 'dusk' | 'night'> }
  | { type: 'map'; mapIds: string[] }
  | { type: 'map_tag'; tags: string[] }
  | { type: 'hp_ratio'; op: '<=' | '>='; value: number }
  | { type: 'qi_ratio'; op: '<=' | '>='; value: number }
  | { type: 'is_cultivating'; value: boolean }
  | { type: 'has_buff'; buffId: string; minStacks?: number }
  | { type: 'target_kind'; in: Array<'monster' | 'player' | 'tile'> };
```

首期不要做复杂表达式树。

只做：

- `all` 全满足
- `any` 任一满足

这样就足够覆盖大多数装备：

- 夜间才生效
- 只在修炼时生效
- 血量低于 40% 才生效
- 只在灵脊岭 / 断碑遗迹 / 兽谷生效

## 8. 效果类型设计

### 8.1 常驻 / 条件常驻数值效果 `stat_aura`

适用于：

- 夜间视野提升
- 修炼时功法经验提升
- 低血时破招提升
- 地图限定的移动速度提升

建议结构：

```ts
interface EquipmentStatAuraEffectDef {
  type: 'stat_aura';
  trigger?: 'on_equip' | 'on_tick' | 'on_time_segment_changed';
  conditions?: EquipmentConditionGroup;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
}
```

说明：

- `trigger` 默认可视为 `on_tick` 检查并维持
- 满足条件时加，不满足时移除
- 这类效果不应产生额外独立 Buff 状态，避免 UI 噪音

### 8.2 触发后临时 Buff `timed_buff`

适用于：

- 移动后首击加成
- 受击后短暂化解
- 击杀后短暂回血或加速

建议结构：

```ts
interface EquipmentTimedBuffEffectDef {
  type: 'timed_buff';
  trigger: EquipmentTrigger;
  cooldown?: number;
  chance?: number;
  conditions?: EquipmentConditionGroup;
  buff: {
    buffId: string;
    name: string;
    desc: string;
    duration: number;
    maxStacks?: number;
    category?: 'buff' | 'debuff';
    visibility?: 'public' | 'private' | 'hidden';
    color?: string;
    attrs?: Partial<Attributes>;
    stats?: PartialNumericStats;
  };
}
```

这部分可以最大化复用现有技能 Buff 体系。

## 8.3 持续代价 `periodic_cost`

这是邪道装备的关键。

适用于：

- 每 tick 掉血
- 每 tick 掉蓝
- 修炼状态下额外掉血
- 夜间佩戴会缓慢亏命

建议结构：

```ts
interface EquipmentPeriodicCostEffectDef {
  type: 'periodic_cost';
  trigger: 'on_tick' | 'on_cultivation_tick';
  conditions?: EquipmentConditionGroup;
  resource: 'hp' | 'qi';
  mode: 'flat' | 'max_ratio_bp' | 'current_ratio_bp';
  value: number;
  minRemain?: number;
}
```

说明：

- `minRemain` 用来约束“最多扣到 1 血”还是允许自杀
- 邪道装备大多数建议留 `minRemain: 1`
- 这类效果必须由服务端 tick 统一结算

### 8.4 成长 / 修炼推进 `progress_boost`

适用于：

- 修炼速度提升
- 功法经验速度提升
- 掉落率提升
- 夜间搜寻收益提升

建议结构：

```ts
interface EquipmentProgressEffectDef {
  type: 'progress_boost';
  trigger?: 'on_equip' | 'on_tick' | 'on_cultivation_tick';
  conditions?: EquipmentConditionGroup;
  stats?: Pick<PartialNumericStats,
    'playerExpRate'
    | 'techniqueExpRate'
    | 'realmExpPerTick'
    | 'techniqueExpPerTick'
    | 'lootRate'
    | 'rareLootRate'
    | 'viewRange'>;
}
```

首期这类效果其实可以和 `stat_aura` 合并，但单独列出来更利于文案与策划理解。

### 8.5 邪道复合效果

“持续掉血，不加战斗属性，但增加修炼速度”这种需求，不建议做成特殊硬编码。

应通过两个效果组合表达：

```json
{
  "type": "periodic_cost",
  "trigger": "on_cultivation_tick",
  "resource": "hp",
  "mode": "max_ratio_bp",
  "value": 100,
  "minRemain": 1
}
```

```json
{
  "type": "progress_boost",
  "trigger": "on_cultivation_tick",
  "stats": {
    "techniqueExpPerTick": 12,
    "realmExpPerTick": 2
  }
}
```

这样配置层就足够表达：

- 噬血修炼
- 焚脉引气
- 逆血养灵
- 折寿求道

## 9. 运行时状态设计

装备效果一旦进入事件型，就需要最小运行时状态。

建议新增：

```ts
interface EquipmentRuntimeState {
  itemId: string;
  effectId: string;
  cooldownLeft?: number;
  activeUntilTick?: number;
  stacks?: number;
  lastTriggeredAt?: number;
}
```

挂载位置建议：

- 首期可直接挂在 `PlayerState`
- 或者由 `EquipmentEffectService` 内部用 `Map<playerId, Map<effectId, state>>` 管理

推荐先用服务端内存态，不先写进持久化。

原因：

- 首期主要是短时特效和条件 Buff
- 断线恢复问题可以放第二阶段处理
- 避免一开始就把玩家存档结构复杂化

## 10. 事件派发链路

建议新增统一入口：

```ts
equipmentEffectService.dispatch(player, event)
```

事件源建议分布：

| 事件 | 派发位置 |
| --- | --- |
| `on_equip` / `on_unequip` | `equipment.service.ts` |
| `on_tick` | `tick.service.ts` |
| `on_move` | `navigation.service.ts` 或移动执行点 |
| `on_attack` / `on_hit` / `on_kill` / `on_skill_cast` | `world.service.ts` |
| `on_cultivation_tick` | `technique.service.ts` |
| `on_time_segment_changed` | `time.service.ts` |
| `on_enter_map` | 传送 / 换图结算点 |

关键要求：

- 业务模块只负责派发事件
- 装备效果是否生效、如何叠层、是否进冷却，都归装备效果服务判定
- 不允许在 `world.service.ts` 里对某件装备写专属 `if`

## 11. 与现有 Buff 体系的关系

建议尽量复用现有 `TemporaryBuffState` 体系。

原则：

- 常驻静态效果：直接进装备加成汇总，不生成 Buff
- 触发后短时增益：转成 `TemporaryBuffState`
- 持续代价：直接由装备效果服务在 tick 中结算
- 修炼 / 掉落 / 搜寻 / 视野一类成长收益：优先走数值面板，不额外造一套系统

这样做的好处：

- 客户端 Buff UI 不用重做
- 服务端属性重算链不需要推翻
- 技能 Buff 和装备 Buff 可以共享显示与持久化逻辑

## 12. 配置文件组织建议

当前装备都堆在：

- `packages/server/data/content/items/equipment.*.json`

如果以后装备效果丰富起来，建议拆分为：

```text
packages/server/data/content/items/equipment/
  fanren-town.json
  fanren-wildlands.json
  fanren-bamboo.json
  fanren-mine.json
  fanren-ruins.json
  fanren-beast-valley.json
  fanren-spirit-ridge.json
```

优点：

- 方便按地图和章节维护
- 装备来源和剧情绑定更清楚
- 不会把几十件装备全塞进一份大 JSON

`ContentService` 仍可像读取功法目录一样读取整个子目录。

## 13. 首期实现顺序

建议按 `P0 -> P1 -> P2` 三段推进。

### P0 静态框架

目标：

- 引入共享类型
- 装备数据支持 `effects`
- `ContentService` 能加载、归一化、校验装备效果配置

此阶段先不做触发。

### P1 核心事件型框架

目标：

- 新增 `equipment-effect.service.ts`
- 支持 `on_tick`
- 支持 `on_cultivation_tick`
- 支持 `stat_aura`
- 支持 `periodic_cost`
- 支持 `progress_boost`

这一步就足够实现：

- 夜间加成
- 修炼加速
- 持续掉血换修炼
- 地图限定常驻效果

### P2 战斗触发型框架

目标：

- 支持 `on_move`
- 支持 `on_hit`
- 支持 `on_attack`
- 支持 `on_kill`
- 支持 `timed_buff`

这一步再去做：

- 移动后首击
- 受击后强撑
- 击杀后噬血
- 邪兵叠煞

## 14. 示例：邪道装备配置

下面是一件“折寿修炼”的典型装备设计：

```json
{
  "itemId": "equip.blood_burn_rope",
  "name": "焚脉黑绳",
  "type": "equipment",
  "grade": "yellow",
  "level": 3,
  "desc": "以焦血浸过的黑绳缠腕，行功时会反噬经脉，却也逼得气机转得更快。",
  "equipSlot": "accessory",
  "tags": ["fanren", "evil_path", "cultivation"],
  "effects": [
    {
      "type": "periodic_cost",
      "trigger": "on_cultivation_tick",
      "resource": "hp",
      "mode": "max_ratio_bp",
      "value": 80,
      "minRemain": 1
    },
    {
      "type": "progress_boost",
      "trigger": "on_cultivation_tick",
      "stats": {
        "techniqueExpPerTick": 10,
        "realmExpPerTick": 2
      }
    }
  ]
}
```

这个结构表达的是：

- 不直接加战斗属性
- 只有在修炼中才付代价并获得收益
- 代价与收益都可配置，不需要新增专属字段

## 15. 与凡人篇装备设计的关系

凡人篇文档里提到的很多效果，其实都可以收敛到这套框架：

- 夜间视野提升
- 黑暗区更稳
- 修炼加速
- 受击后短时化解
- 掉血换悟道
- 地图限定勘探收益

所以后续凡人篇装备设计应遵守一个原则：

- `P0` 阶段先写静态版
- `P1 / P2` 阶段再把需要事件和代价的装备改成 `effects` 配置

不要在凡人篇文档里继续发明独立字段。

## 16. 结论

装备框架应当尽量贴近现有技能框架：

- 用共享类型定义结构
- 用内容服务统一加载
- 用事件派发统一驱动
- 用 Buff 与数值系统复用已有结算能力

真正要先做的，不是某一件邪道装备，而是先把这套“触发器 + 条件 + 效果类型 + 运行时派发”的骨架立住。

骨架立住后，后面的夜行装、镇煞装、邪修装、叩门装，都会变成普通配置问题，而不是新系统问题。
