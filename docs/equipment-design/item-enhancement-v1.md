# 物品强化系统 V1 设计

本文档定义《道劫余生》首版物品强化系统的数据落点、默认值、强化公式与失败规则。当前版本先覆盖装备强化，不直接改动物品真源 JSON 结构。

## 目标

- 强化等级属于物品实例态，不写回物品模板 JSON
- 某个物品是否可强化，只取决于是否存在对应强化配置
- 强化配置统一放在独立目录，按大境界分层维护
- 相同强化等级的同物品可堆叠，不同强化等级不可堆叠
- 读写时如果没有传入强化等级，自动视为 `0`

## 范围

- V1 仅支持装备强化
- V1 仅强化装备的静态基础属性，不影响特效、触发器、Buff、被动说明文本
- V1 的成功率、灵石消耗公式为固定规则，不进入配置

## 运行时默认值

### 强化等级默认值

- `enhanceLevel` 为物品实例字段
- 读取旧存档、旧协议、旧掉落、旧订单、旧邮件附件、旧托管仓时：
  未传 `enhanceLevel` 一律按 `0` 处理
- 写入新数据时：
  如果调用方未显式传入 `enhanceLevel`，落库前归一化为 `0`

### 可强化判定

- 只有在强化配置目录中存在该 `targetItemId` 的配置时，物品才允许进入强化流程
- 物品或装备模板 JSON 本身不增加“是否可强化”字段

## 数据目录

强化配置不放在 `items/` 下，单独维护在新目录：

```text
packages/server/data/content/enhancements/
  凡人期/
    武器.json
    防具.json
  练气期/
    武器.json
    防具.json
  更高境界/
```

说明：

- 目录按大境界拆分，例如 `凡人期`、`练气期`
- 文件内可按装备类型继续拆，例如 `武器.json`、`防具.json`
- 服务端启动阶段一次性加载全部强化配置，运行期只读内存结构

## 配置模型

每条强化配置对应一个可强化目标物品。

```ts
interface EquipmentEnhancementConfig {
  targetItemId: string;
  protectionItemId?: string;
  steps: EquipmentEnhancementStep[];
}

interface EquipmentEnhancementStep {
  targetEnhanceLevel: number;
  materials?: Array<{
    itemId: string;
    count: number;
  }>;
}
```

字段说明：

- `targetItemId`
  目标装备物品 ID，必须指向装备模板
- `protectionItemId`
  可选的保护物品 ID
- `steps`
  每一级强化到目标等级时所需的额外材料配置
- `steps[].targetEnhanceLevel`
  本次强化成功后到达的等级，例如 `1` 表示 `+0 -> +1`
- `steps[].materials`
  本次强化额外消耗材料；不填或空数组时，表示本级只消耗灵石

## 保护规则

保护规则按以下顺序解释：

- 如果配置了 `protectionItemId`，则本配置允许使用该物品作为保护物
- 如果未配置 `protectionItemId`，则当前版本没有“独立保护符”
- 在没有独立保护符时，若玩法侧允许玩家勾选保护，暂时只允许额外消耗 1 个同 `targetItemId` 装备本体作为保护
- 如果玩家未提供保护物，则按无保护强化处理

这条规则的目的是兼容你提出的“配置里可不填保护物，当前先只支持用物品本身保护”。

## 灵石消耗

灵石消耗不进入配置，统一按目标物品模板等级计算。

公式：

```text
spiritStoneCost = max(1, ceil(itemLevel / 10))
```

说明：

- 固定消耗物品为 `spirit_stone`
- `itemLevel` 取目标装备模板的 `level`
- 最低消耗 1 个灵石
- 该消耗与当前强化等级无关，每次强化都按同一公式计算

示例：

- `level = 1`，消耗 `1`
- `level = 9`，消耗 `1`
- `level = 10`，消耗 `1`
- `level = 11`，消耗 `2`
- `level = 27`，消耗 `3`

## 成功率

成功率不进配置，当前版本固定为：

```text
successRate(targetEnhanceLevel) = 50 - floor((targetEnhanceLevel - 1) / 2) * 5
```

按目标强化等级分组：

- `+1`、`+2`：`50%`
- `+3`、`+4`：`45%`
- `+5`、`+6`：`40%`
- `+7`、`+8`：`35%`

说明：

- 这里的“目标强化等级”指本次成功后到达的等级
- 实现时应对结果做下限保护，最低不低于 `0%`

## 强化属性增幅

### 生效范围

V1 只强化装备的静态基础属性，包含：

- `equipAttrs`
- `equipStats`
- `equipValueStats`

V1 不强化：

- `effects`
- `consumeBuffs`
- 任意特效触发概率、冷却、Buff 层数、触发器逻辑

### 增幅公式

每级增加 `5%`，按指数增幅，并将增幅百分比向上取整到整数百分比点。

公式：

```text
enhancePercent(level) = ceil(100 * (1.05 ^ level))
enhancedValue(baseValue, level) = ceil(baseValue * enhancePercent(level) / 100)
```

说明：

- 百分比不保留小数，例如不会出现 `110.25%`
- 最终属性值向上取整
- 强化带来的显示增量为：
  `enhancedValue - baseValue`

示例：

- `+0`：`100%`
- `+1`：`105%`
- `+2`：`111%`
- `+3`：`116%`
- `+4`：`122%`

数值示例：

```text
基础 physAtk = 6
+1 => ceil(6 * 105 / 100) = 7
+2 => ceil(6 * 111 / 100) = 7
+3 => ceil(6 * 116 / 100) = 7
+4 => ceil(6 * 122 / 100) = 8
```

## 失败规则

### 无保护失败

- 强化失败后，强化等级立刻降为 `0`

### 有保护失败

- 强化失败后，消耗保护物
- 强化等级只降低 `1` 级

示例：

- `+4 -> +5` 失败且无保护：变为 `+0`
- `+4 -> +5` 失败且有保护：消耗保护物，变为 `+3`
- `+1 -> +2` 失败且有保护：消耗保护物，变为 `+0`

## 堆叠与显示口径

- 同 `itemId` 且同 `enhanceLevel` 的物品允许堆叠
- 同 `itemId` 但不同 `enhanceLevel` 的物品不可堆叠
- 市场主列表后续应按基础物品聚合显示
- 市场详情再按 `enhanceLevel` 分层展示，不让不同强化等级占多个主格子

## UI 入口与交互

### 入口

- 强化 UI 不挂在背包面板内部
- 与炼丹保持一致，走行动列表入口
- 当玩家装备了允许开启强化功能的装备或器具后，服务端在行动列表中注入一个独立动作
- 动作 ID 建议使用：`enhancement:open`
- 客户端点击后，打开独立强化弹层，不进入目标选择态

说明：

- 这一步只定义 UI 入口形式
- “什么装备会解锁强化按钮”后续可通过专门标签或专用器具配置决定
- UI 层不自行判定是否有资格强化，只消费服务端给出的动作

### 弹层形态

- 强化使用独立详情弹层
- 视觉风格沿用当前炼丹与坊市弹层体系，不单独做另一套皮肤
- 推荐使用 `detail-modal-host`
- 建议 `variantClass`：`detail-modal--enhancement`

推荐布局：

```text
左侧：可强化装备列表
中间：当前强化工作台
右侧：成功率阶梯与强化记录
```

手机模式下改为纵向：

```text
顶部：当前选中装备与强化结果预览
中部：材料 / 保护 / 操作按钮
底部：候选装备列表 + 成功率记录折叠区
```

### 参考方向

本项目可借鉴 Milky Way Idle 强化界面的几个思路，但不照搬其数值规则：

- 强化界面是独立工作台，不混在背包页里
- 保护槽是显式独立区域，点击后选择保护物
- 即使当前未持有，也可以把合法保护物候选展示出来，帮助玩家理解规则
- 强化按钮上方直接展示本次成功率、失败后果和材料消耗
- 右侧保留强化相关记录区，而不是把信息都塞进按钮文案

### 左侧：可强化装备列表

左侧列表只显示当前背包中“存在强化配置”的装备物品。

每个条目建议展示：

- 物品名
- 当前强化等级，例如 `+0`、`+3`
- 当前堆叠数量
- 装备部位
- 当前成功率摘要
- 是否可强化的状态提示

列表规则：

- 同 `itemId` 且同 `enhanceLevel` 的堆叠显示为一条
- 同 `itemId` 不同 `enhanceLevel` 的条目分开显示
- 默认按装备等级、部位、强化等级排序
- 当前选中项切换时，不要重建整个弹层，只 patch 中间与右侧区域

交互建议：

- 点击条目切换当前强化目标
- 支持搜索或筛选，但 V1 可先不做
- 当某个条目因材料不足不能强化时，也继续显示，只把操作按钮禁用

### 中间：强化工作台

中间区域是强化主操作区，建议固定包含以下模块。

#### 1. 当前装备卡

展示当前选中装备：

- 名称
- 部位
- 当前强化等级
- 当前数量
- 物品 tooltip 入口

#### 2. 本次强化摘要

明确展示：

- 本次目标：`+N -> +(N+1)`
- 本次成功率
- 失败后果
- 当前是否使用保护

失败后果文案建议直接写死可读说明：

- 无保护：失败降为 `+0`
- 有保护：失败降为 `+(N-1)` 并消耗保护物

#### 3. 材料区

材料区展示本次强化所需：

- 灵石消耗
- 配置材料列表
- 每种材料的持有量 / 需求量

如果本级没有额外材料，应明确显示：

- `本级无需额外材料，仅消耗灵石`

#### 4. 保护槽

保护槽单独展示，不和材料区混为一行文本。

保护槽规则：

- 点击保护槽，打开保护物选择子面板
- 如果配置了 `protectionItemId`，展示该保护物
- 如果未配置 `protectionItemId`，展示“同名装备本体保护”
- 即使当前未持有合法保护物，也继续展示候选项，但标记为未持有
- 保护槽需要明确显示“已选择哪个保护物”以及“本次会消耗几个”

推荐文案：

- `未使用保护`
- `使用 镜纹护符 x1`
- `使用同名本体保护 x1`

#### 5. 属性预览区

这里不要只写百分比，要直接给玩家看强化后的数值变化。

建议按行展示：

- 当前值
- 强化后值
- 增量

只显示会被强化影响的静态属性：

- `equipAttrs`
- `equipStats`
- `equipValueStats`

不显示不受强化影响的特效增幅，避免误解。

#### 6. 操作按钮

V1 建议只保留一个主按钮：

- `强化一次`

按钮禁用条件：

- 未选中物品
- 当前物品没有下一等级配置
- 灵石不足
- 额外材料不足
- 选择了保护但保护物数量不足

按钮旁边建议显示一句短提示，而不是让玩家自己猜为什么不能点。

### 右侧：成功率阶梯与强化记录

右侧信息区建议拆成两个卡片。

#### 1. 成功率阶梯

这个区域展示当前规则表，而不是只展示本次单点概率。

示例：

```text
+1 / +2  50%
+3 / +4  45%
+5 / +6  40%
+7 / +8  35%
```

当前目标等级所在行高亮，帮助玩家快速理解现在卡在哪一档。

#### 2. 强化记录

这里参考 Milky Way Idle 的“每个等级单独看记录”的思路，但按本项目需要做成更直观的表。

建议按“当前选中物品模板”维度展示角色自己的强化记录：

- 到达 `+1` 成功次数
- 到达 `+2` 成功次数
- 到达 `+3` 成功次数
- 对应失败次数
- 最高到达等级

推荐表格字段：

```text
等级 | 成功率 | 成功次数 | 失败次数 | 历史最高
```

说明：

- 这里是玩家侧记录展示，不参与强化结算
- V1 如果后端暂未实现记录持久化，可以先只显示成功率阶梯
- 真要落持久化时，建议按 `playerId + itemId + targetEnhanceLevel` 维度累计

### 交互连续性要求

强化弹层实现时应遵守当前客户端 UI 约束：

- 切换物品时只 patch 工作台与记录区
- 不要因背包变化而关闭弹层
- 已选中的强化目标如果仍存在，应保持选中
- 保护槽已选中的候选若仍合法，应尽量保持
- 材料数变化时只更新数量、按钮态、提示文案
- tooltip、滚动位置、展开态在局部刷新后要尽量保留

### 与炼丹的关系

强化 UI 的入口方式与炼丹一致，但内容结构不应直接复制炼丹。

可复用的部分：

- `detailModalHost`
- 独立 modal 生命周期
- 顶部摘要区
- 左侧列表 + 右侧详情的双栏骨架
- 手机模式下的纵向收纳思路

不建议直接照抄的部分：

- 丹方配方列表语义
- 炼丹 job 进度条
- 批量数量输入
- 炼丹预设条

强化更接近“单次高风险操作台”，不是持续生产面板。

### 后续最小协议需求

如果后续进入实现，强化 UI 最少需要一个独立面板快照协议，建议包含：

```ts
interface EnhancementPanelState {
  availableItems: Array<{
    itemKey: string;
    item: SyncedItemStack;
    count: number;
    enhanceLevel: number;
    canEnhance: boolean;
    blockedReason?: string;
  }>;
  selectedItemKey?: string;
  attempt?: {
    currentLevel: number;
    targetLevel: number;
    successRate: number;
    spiritStoneCost: number;
    materials: Array<{ itemId: string; required: number; owned: number }>;
    protectionOptions: Array<{
      itemId: string;
      label: string;
      owned: number;
      source: 'configured_item' | 'same_item';
    }>;
    selectedProtectionItemId?: string;
    failResultLevelWithoutProtection: number;
    failResultLevelWithProtection: number;
    previewStats: Array<{
      statKey: string;
      currentValue: number;
      nextValue: number;
    }>;
  };
  rateTable: Array<{
    fromLevel: number;
    toLevel: number;
    successRate: number;
  }>;
  history?: Array<{
    targetLevel: number;
    successCount: number;
    failureCount: number;
    highestReached: boolean;
  }>;
}
```

该协议只是 UI 草案，不代表最终字段必须一字不差照抄。

## 配置模板

```json
[
  {
    "targetItemId": "equip.example_weapon",
    "protectionItemId": "item.example_protection",
    "steps": [
      {
        "targetEnhanceLevel": 1,
        "materials": [
          { "itemId": "black_iron_chunk", "count": 1 }
        ]
      },
      {
        "targetEnhanceLevel": 2
      },
      {
        "targetEnhanceLevel": 3,
        "materials": [
          { "itemId": "black_iron_chunk", "count": 2 },
          { "itemId": "rune_shard", "count": 1 }
        ]
      }
    ]
  }
]
```

## 凡人期示例

下面给一个可直接参考的凡人期示例：

```json
[
  {
    "targetItemId": "equip.rust_saber",
    "steps": [
      {
        "targetEnhanceLevel": 1,
        "materials": [
          { "itemId": "black_iron_chunk", "count": 1 }
        ]
      },
      {
        "targetEnhanceLevel": 2
      },
      {
        "targetEnhanceLevel": 3,
        "materials": [
          { "itemId": "black_iron_chunk", "count": 2 }
        ]
      },
      {
        "targetEnhanceLevel": 4,
        "materials": [
          { "itemId": "black_iron_chunk", "count": 2 },
          { "itemId": "rune_shard", "count": 1 }
        ]
      }
    ]
  }
]
```

该示例表示：

- `equip.rust_saber` 可强化
- 没有独立保护物配置
- `+2` 只消耗灵石
- 保护强化如要启用，当前只能额外消耗同一把 `equip.rust_saber`

## 实现归一化要求

后续代码实现时，至少要统一以下归一化逻辑：

- `enhanceLevel` 缺失、`null`、非数字：按 `0`
- `enhanceLevel < 0`：按 `0`
- 强化配置缺少 `steps` 或目标等级不连续：视为非法配置
- `targetItemId` 若不是装备：V1 视为非法配置
- `materials[].count <= 0`：视为非法配置
- `protectionItemId === targetItemId`：允许，但语义上等同“用本体作保护”

## 本阶段不做

- 不做强化转移
- 不做降级保护概率修正
- 不做祝福值、保底值、失败累计值
- 不做强化发光、特效外观、名称染色
- 不做非装备类物品强化收益
- 不把强化规则写回物品模板 JSON
