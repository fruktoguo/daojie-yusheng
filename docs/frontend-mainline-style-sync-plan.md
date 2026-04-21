# 前端表现对齐计划

更新时间：2026-04-21  
表现真源：`参考/main-packages-ref/packages/client`  
执行目标：当前 `packages/client`

## 目标

这份计划只做一件事：

- 把当前 `next` 前端的所有玩家可见表现和内容，逐步对齐到 `main` 当前版本。

这里的“表现和内容”包括：

- 页面与面板布局
- 视觉样式
- 文案与默认值
- 交互顺序
- 空态、提示态、摘要态、详情态
- 面板入口、分组与按钮层级

这里的“不强制照搬”只包括：

- 当前 `next` 的内部架构组织
- `main-*` 状态源拆分
- `socket-send-*` 分层
- `detailModalHost` / 增量 patch / game-map runtime 等实现方式

一句话口径：

- `main` 决定前端应该“长什么样、显示什么、怎么交互”。
- `next` 决定这些结果“内部怎么实现”。

## 真源与参考

后续一律以这套目录作为前端表现真源：

- `参考/main-packages-ref/packages/client`

对比时优先看：

- `src/styles/*`
- `src/ui/*`
- `src/ui/panels/*`
- `src/game-map/*`
- `src/renderer/*`
- `src/constants/ui/*`

不再以 `legacy/*` 作为这轮前端对齐的主参考。

## 总原则

### 1. 先表现，后实现

- 先确认 `main` 当前玩家看到的结果是什么。
- 再在 `next` 架构里实现出同样的结果。
- 不允许因为“现在的 next 结构更顺手”就保留不同的 UI 结果。

### 2. 可以重构实现，不可以自创表现

- 允许用更清晰的状态源、patch 和桥接层实现。
- 不允许保留和 `main` 不一致的布局、样式、文案、按钮层级。

### 3. 高可见区优先

- 优先处理玩家最常看、最常点、最容易感知差异的区域。
- 不要先钻冷门配置页，再放着主 HUD 和主面板不统一。

### 4. 一次一个闭环

- 每轮只做一个明确模块或一个明确子模块。
- 该模块至少要同时覆盖：
  - 结构
  - 样式
  - 文案
  - 默认值
  - 相关最小交互

### 5. 不把协议和热路径打坏

- 表现对齐不能破坏：
  - 增量同步
  - detail modal 单实例
  - 面板局部 patch
  - game-map/runtime 权责
  - socket-send 分层

## 不做的事

- 不把 `main` 整个前端源码直接覆盖到 `next`
- 不把 `legacy/*` 当成当前真源
- 不为了追样式而回退到整面板重绘
- 不把服务端权威规则挪进前端
- 不顺手扩展新玩法、新系统、新入口

## 模块优先级

## P0：高可见核心区

### 1. 世界面板与天机阁

- `world-panel`
- `leaderboard / world summary` 入口外观
- 地图情报、附近实体、建议、天机阁四区的结构与样式

当前进度：

- `天机阁` 已经从 `next` 过渡壳层开始回收，结构和文案正在按 `main` 对齐。
- `world-panel` 四个 pane 的 DOM 结构已开始切回 `main` 当前版。
- 剩余主要工作是样式细节、留白、响应式和相邻卷宗入口的一致性。

完成标准：

- 结构、文案、卡片样式、按钮语气、间距与 `main` 对齐
- `天机阁` 不再保留 `next` 过渡期皮肤

### 2. 动作面板与战斗设置

- `action-panel`
- `技能管理`
- `战斗设置`
- `技能方案`

当前进度：

- 样式层已开始往 `main` 当前版回收，动作页签、技能子页签、技能管理摘要、技能方案卡片区已经补进 `main` 的对应样式语义。
- `技能` 主标签已经补回 `已启用/上限` 计数，`技能管理` 的排序区也回到了 `main` 当前的交互顺序：不再保留额外的“应用到当前顺位”按钮，切回 `当前顺位` 或点击顶部 `应用` 时才写回真实顺位。
- `技能管理` 的排序读数、顶部摘要和提示语已进一步往 `main` 收窄；`战斗设置` 副标题、状态区和 `技能方案` 的冗余说明也已经收回一轮。
- `action-panel` 这一轮又把顶部 tab、技能区、技能管理、战斗设置、技能方案里的 `ui-tab-strip / ui-surface-* / ui-empty-hint / ui-count-chip` 过渡壳继续收回了一轮，主骨架已更接近 `main` 当前版。
- 技能管理单条技能卡也进一步对齐了 `main`：
  - 排序指标回到右侧读数
  - `上移 / 下移` 改回常驻显示，只用 `disabled` 控制不可点
  - 自动丹药槽、药品选择器和条件卡里的计数文案不再写成“背包 N”
- 剩余主要工作是局部布局密度、少量文案细节和个别交互边角继续对齐 `main`。

完成标准：

- 所有 tab、列表、按钮、提示、摘要区和 `main` 当前版本一致
- `next` 只保留内部状态流改造，不保留自定义表现

### 3. 邮件面板

- `mail-panel`
- 列表区、详情区、附件区、批量操作区

完成标准：

- 列表高度、详情布局、按钮行、摘要卡全部和 `main` 一致
- 少量邮件时不再出现条目被异常拉高

当前进度：

- 少量邮件时条目被自动拉高的问题已修复。
- 邮件弹窗尺寸语义和空态皮肤已开始回收为 `main` 当前版。
- 标题区 `subtitle / hint` 与列表/详情/正文/附件空态已统一为同一套可见结果，不再出现首屏渲染和局部 patch 的视觉分叉。
- 标题栏元数据结构也已经收回到 `main` 当前语义，不再额外 patch title。
- 剩余主要工作是列表/详情/附件区的细节结构与交互顺序继续和 `main` 抠齐。

### 4. 背包 / 装备 / 拾取 / Tooltip

- `inventory-panel`
- `equipment-panel`
- `loot-panel`
- `equipment-tooltip`
- `item-inline-tooltip`

当前进度：

- `inventory-panel` 详情弹层的信息密度和结构已经往 `main` 收回一轮：
  - 去掉了 `功法概要 / 当前已装备` 这类 `main` 没有的额外块
  - 详情骨架重新回到 `quest-detail-*`
  - 非装备物品的属性标题也统一回 `装备属性`
- `equipment-tooltip` 已补回 `强化速度 / 强化成功修正` 两条 `main` 当前已有的功能词条。
- `equipment-panel` 的外层壳、槽位壳和空态节点已去掉 `ui-surface-* / ui-empty-hint` 过渡挂点，回到 `main` 当前结构语义。
- `loot-panel` 这轮已把草药采集专用表现整块补回：
  - 恢复 `detail-modal--herb-gather`
  - 恢复 `loot-source-section--herb / herb-gather-summary / herb-gather-card`
  - 草药副标题、库存卡、停止采集按钮、空态和顶部信息布局已回到 `main` 当前口径
- 剩余主要工作是列表区壳层细节、tooltip 局部文案，以及这组在浅色/深色/手机模式下的逐项点检。

完成标准：

- 格子、详情结构、说明顺序、状态色、空态和 `main` 一致

### 5. 属性 / 观察 / 实体详情

- `attr-panel`
- `observe`
- `entity-detail-modal`

当前进度：

- `attr-panel` 这一轮已经把 `ui-tab-strip / ui-surface-* / ui-empty-hint` 这层过渡壳收回到 `main` 当前语义，属性页签、数值卡和空态不再保留额外包装。
- 属性 tooltip 的视觉层级也已回到 `main` 当前口径：主值高亮、固定值/百分比 pill、子项缩进和弱提示 note 都已对齐。
- 属性低频详情改回按需请求：不再在 bootstrap 或切到属性页签时主动预取，只在面板内 tooltip 交互时请求。
- `observe` 已撤掉“整卡点开实体详情”和内联“稳定掉落”预览，回到 `main` 的观察顺序：角色信息卡 + `掉落物` 按钮。
- `entity-detail-modal` 这轮只保留兼容链路，没有再让它继续扩张主观察流；剩余工作主要是确认这条详情链是否还需要在其他入口保留，以及样式细节和移动端点检。

完成标准：

- 属性 breakdown、观察卡层级、详情弹层结构和 `main` 一致

## P1：系统壳层

### 6. HUD / 聊天 / 登录 / 更新日志 / 设置

- `hud`
- `chat`
- `login`
- `changelog-panel`
- `settings-panel`

完成标准：

- 视觉层级、按钮密度、排版节奏和 `main` 一致

### 7. 小地图 / 地图浮层 / 详情浮层

- `minimap`
- `floating-tooltip`
- `detail-modal-host`
- `overlays.css`

完成标准：

- 浮层风格、层级关系、边框与留白对齐 `main`

## P2：次高频与扩展面板

### 8. 市场 / NPC 商店 / 任务 / 体修 / 功法

- `market-panel`
- `npc-shop-modal`
- `quest-panel`
- `body-training-panel`
- `technique-panel`

完成标准：

- 结构、文案、空态和 `main` 一致

## 执行方法

每轮固定按这个顺序做：

1. 在 `参考/main-packages-ref/packages/client` 找对应真源文件
2. 明确当前模块哪些地方和 `main` 不一致
3. 先改结构，再改样式，再改文案和默认值
4. 只在必要时补状态源或协议消费
5. 跑最小验证
6. 更新差异审计文档

## 验收口径

每一轮至少回答这几个问题：

- 这块 UI 的结构是否和 `main` 一致
- 这块样式是否和 `main` 一致
- 这块文案和默认值是否和 `main` 一致
- 这块交互顺序是否和 `main` 一致
- 是否仍然保持 `next` 的增量更新与状态源分层

## 默认验证

- `pnpm --filter ./packages/client exec tsc --noEmit`
- 改动较大时：
  - `pnpm --filter ./packages/client build`
- 涉及 shared / server 联动时，再补：
  - `pnpm --filter ./packages/shared build`
  - `pnpm --filter ./packages/server exec tsc -p tsconfig.json --noEmit`

## 风险提示

这轮工作不能按“整包替换 main 前端文件”处理，原因是：

- 当前 `next` 已经有自己的状态源和桥接结构
- 很多差异不只是 CSS，还涉及 DOM 结构和事件绑定
- 直接覆盖会把已经补好的链路打坏

所以必须按模块收口，而不是暴力同步。

## 当前执行顺序

后续默认按下面顺序推进：

1. `world-panel / 天机阁`
2. `mail-panel`
3. `action-panel / 战斗设置 / 技能管理`
4. `inventory / equipment / loot / tooltip`
5. `attr / observe / entity detail`
6. `hud / chat / settings / changelog`
7. `minimap / overlays / detail modal`
8. `market / npc shop / quest / technique / body training`

## 完成定义

当以下条件同时成立时，这轮前端表现对齐才算完成：

- 当前 `packages/client` 的玩家可见布局、样式、文案和默认值已经以 `main` 为准
- 只保留 `next` 的内部架构差异，不再保留可见表现差异
- 审计文档里的前端差异项已经全部收敛到“逻辑实现差异”而非“表现差异”
