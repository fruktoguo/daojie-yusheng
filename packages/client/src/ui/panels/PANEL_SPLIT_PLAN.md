# 大面板拆分计划

## 背景

当前三个最大面板行数过高，各自实现独立的 patch/render/capture 生命周期，维护成本高、复用性差：

| 面板 | 行数 | 问题 |
|------|------|------|
| ActionPanel | ~5630 | 技能、战斗设置、门派管理混在一起 |
| MarketPanel | ~3895 | 浏览、交易、拍卖逻辑耦合 |
| CraftWorkbenchModal | ~4061 | 炼丹、强化、制作队列混合 |

引入 `PatchablePanel<TState>` 基类后，每个子面板可独立继承、独立状态、独立 patch，逐步替换原有巨型面板。

## 拆分方案

### ActionPanel → 3 个子面板

| 子面板 | 职责 |
|--------|------|
| **SkillManagementSubpanel** | 功法列表、技能装配、技能升级、技能详情 |
| **CombatSettingsSubpanel** | 战斗策略配置、自动战斗开关、目标优先级 |
| **SectManagementSubpanel** | 门派信息、门派任务、贡献度、门派技能 |

ActionPanel 本体退化为 tab 容器 + 子面板编排层，不再直接持有子面板内部状态。

### MarketPanel → 3 个子面板

| 子面板 | 职责 |
|--------|------|
| **MarketBrowseView** | 商品分类浏览、搜索、筛选、列表展示 |
| **MarketTradeDialog** | 买入/卖出确认、价格输入、数量选择、交易结果 |
| **AuctionView** | 拍卖列表、出价、倒计时、拍卖历史 |

MarketPanel 本体负责视图切换和全局市场状态（刷新、连接、错误），子面板各自管理局部状态和 patch。

### CraftWorkbenchModal → 3 个子面板

| 子面板 | 职责 |
|--------|------|
| **AlchemyView** | 炼丹配方选择、材料投入、炼丹结果、丹方管理 |
| **EnhancementView** | 装备强化、镶嵌、精炼流程和结果展示 |
| **CraftQueueView** | 制作队列管理、进度显示、批量操作、队列状态 |

CraftWorkbenchModal 本体负责 tab 切换和共享资源（背包快照、配方索引），子面板独立 patch。

## 迁移策略

1. **新面板直接继承 `PatchablePanel`**，实现四个抽象方法即可获得统一生命周期
2. **旧面板逐步迁移**：先把子区域提取为独立子面板类，父面板在 `applyPatch` 中委托子面板更新
3. **迁移顺序**：优先拆最独立的子面板（CraftQueueView、AuctionView），验证框架可行性后再拆耦合度高的部分
4. **兼容期**：父面板可同时包含已迁移子面板和未迁移的内联渲染区域，不要求一次性全部拆完

## 验证标准

- 拆分后每个子面板独立 patch 不影响其他子面板的焦点、滚动、选区
- 父面板 tab 切换时子面板正确 mount/unmount，无内存泄漏
- 高频更新（tick 推送）时无可感知闪烁或重排
- 浅色/深色/手机端三态正常
