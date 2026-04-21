# 前端主线差异审计

更新时间：2026-04-21  
基线分支：`main`  
目标分支：当前 `next`

## 目标

这份文档只做一件事：把 `main` 分支里和当前 `next` 前端仍然不一致的地方按功能域逐项列出来，并明确后续整理原则。

约束如下：

- UI 以 `main` 的玩家可见结果为基线。
- 逻辑不照搬 `main` 的旧组织方式，必须落在当前 `next` 的架构里。
- 前端逻辑入口优先落在 `packages/client/src/main-*`、`packages/client/src/network/socket-send-*`、`packages/client/src/game-map/*`、`packages/client/src/ui/panels/*`。
- 协议与共享类型优先落在 `packages/shared/src/*`，不回退到旧的大杂烩类型入口。
- 只把真正影响当前前端体验、功能闭环和替换进度的差异记成缺口；纯重命名、纯拆文件、纯清理不单列为前端缺口。

## 审计方法

本轮审计基于以下比对：

- `git diff main -- packages/client packages/shared`
- 对 `packages/client/src/ui/*`、`packages/client/src/ui/panels/*`、`packages/client/src/main-*`、`packages/client/src/network/*`、`packages/client/src/game-map/*`、`packages/client/src/styles/*` 做功能域归类
- 结合当前 `next` 已回灌项，过滤掉已完成但仍存在文件级 diff 的部分

## 对齐总原则

### 1. UI 结果跟 `main`

- 面板入口、分组、文案、按钮层级、详情弹层结构、显隐顺序、默认值、空态和提示语，优先跟 `main`。
- 高优先级界面需要同时对齐浅色、深色、手机模式。

### 2. 逻辑落点跟 `next`

- 启动与装配：走 `main-bootstrap-assembly.ts`、`main-app-*`、`main-startup-bindings.ts`
- 面板状态：走 `main-*-state-source.ts`
- 高频动态：走 `main-panel-delta-state-source.ts`、`main-runtime-delta-state-source.ts`
- 发包：走 `network/socket-send-panel.ts`、`socket-send-runtime.ts`、`socket-send-social-economy.ts`
- 地图与视野：走 `game-map/runtime`、`game-map/store`、`main-map-runtime-bridge-source.ts`
- 弹层：统一走 `detailModalHost`

### 3. 不要做的事

- 不把 `main.ts` 再变回巨石入口。
- 不把前端缺口用临时 `confirm`、临时 DOM、临时全量重绘糊过去。
- 不把服务端规则判定搬进前端。
- 不为了追 UI 结果而破坏当前 `next` 的分层和增量同步。

## 差异清单

下面按玩家可见功能域逐项列当前仍需处理的差异。

---

## 1. 前端装配与状态源

### main 基线

- `packages/client/src/main.ts`
- `packages/client/src/main-*`
- `packages/client/src/network/socket-event-registry.ts`
- `packages/client/src/network/socket-lifecycle-controller.ts`

### 当前差异

- `main.ts` 已收口成纯装配入口，当前差异主要不再是“巨石入口回潮”。
- `bootstrap` 阶段的两条 `P0` 已补齐：
  - 进入首包前会先清理 targeting 暂态，不再把旧的选目标高亮、hover 和 ESC 取消态残留到新会话。
  - 战斗设置真源会在状态源里完成默认值规整，再同步到 bridge 和动作面板，不再只靠 `ActionPanel` 本地 fallback 掩盖。
- 当前装配链剩余的前端缺口，主要收窄为：
  - 少量低频事件仍有声明存在但消费落点未完全收口
  - 个别非动作面板消费者还没统一复用已规整的动作/战斗设置状态

### 后续整理原则

- 前端功能缺口优先补到对应 `main-*-state-source.ts`，不要继续把逻辑堆回 `main.ts`。
- 所有玩家可见面板状态优先走“状态源 -> panel context -> panel”链路。
- 网络事件注册和发送职责继续拆在 `socket-event-registry.ts` 和 `socket-send-*`，不做散点 emit。

### 优先级

- `P0`

---

## 2. 动作面板、战斗设置、技能管理

### main 基线

- `packages/client/src/ui/panels/action-panel.ts`
- `packages/client/src/ui/panels/action-panel-helpers.ts`
- `packages/client/src/main-action-state-source.ts`
- `packages/shared/src/automation-types.ts`

### 当前差异

- 本轮已补齐 `技能管理 / 战斗设置 / 技能方案` 入口，并继续把可见结果往 `main` 当前版回收；`索敌方案` 保持独立入口，`战斗设置` 收回到 `丹药自动服用 / 目标选择` 两标签页。
- 丹药自动服用的条件摘要和药品效果摘要文案也已回到接近 `main` 的口径。
- 技能主标签现在会直接显示 `已启用/上限` 计数；技能区标题、技能管理 subtitle/提示语、排序指标读数、`上移 / 下移` 这组信息密度和操作入口也已经补回一轮。
- `技能管理` 的排序区已回到 `main` 当前心智模型：
  - 去掉了额外的“应用到当前顺位”按钮
  - 非“当前顺位”模式下，切回 `当前顺位` 或点击顶部 `应用` 才写回真实顺位
  - 排序读数重新收窄到 `伤害 / 蓝耗` 两类
  - 自动技能提示重新强调“超过上限会自动禁用末位技能”
- `技能管理` 的关闭草稿仍然接进 `detailModalHost` 的统一请求关闭链，右上角关闭、遮罩关闭和 `ESC` 也会走同一套拦截。
- `技能方案` 的删除也已经改成面板内二次确认，不再弹系统 `confirm`。
- 这一轮又补回了 `main` 的两条关键逻辑：
  - 技能槽上限摘要、技能管理外部 revision 和方案外部 revision 现在都会跟随槽位上限变化
  - 技能管理在非“当前顺位”模式下，切回 `当前顺位` 或点击 `应用` 时，会把当前排序结果写回真实顺位
- 功法兜底技能补全也提升了一轮：
  - 现在会按已启用功法、技能解锁等级和玩家境界过滤
  - fallback 技能会和当前技能一起走统一规整，再按槽位上限裁掉超限技能
- 样式层已开始往 `main` 当前版回收：
  - `action-tab-bar / action-tab-btn`
  - `action-skill-subtabs / action-skill-subtab-btn / action-skill-subtab-count`
  - `skill-manage-summary span / skill-manage-metric-readout`
  - `skill-preset-card / list-card / import-card / save-row / actions / list / item`
- `action-panel.ts` 这轮又把一批玩家可见的过渡壳收掉了：
  - 顶部 tab、技能区、技能管理、战斗设置、技能方案里的 `ui-tab-strip / ui-surface-* / ui-empty-hint / ui-count-chip` 已继续回收为 `main` 当前 DOM 语义
  - 技能管理单条技能卡的排序指标已回到右侧读数
  - `上移 / 下移` 按钮改回常驻显示，只用 `disabled` 控制不可点
  - 自动丹药槽、药品选择器和条件卡里的计数文案已不再写成“背包 N”
- 战斗设置和技能方案这轮又进一步对齐了 `main` 的可见结果：
  - `战斗设置` 副标题重新改回 `自动丹药 X 种 · 当前标签页`
  - 去掉了 `combatSettingsStatus` 这块额外状态区
  - `技能方案` 去掉了名称草稿摘要、导入摘要和“当前选中 xxx”这类 `main` 没有的额外信息
  - `技能方案` 列表说明、空态文案和名称输入占位文案已回到 `main` 当前口径
- 当前这一块不再是“入口缺失”问题，剩下的是细节一致性和规则生效范围问题。
- 仍需逐项核对：
  - 技能管理的筛选、排序、拖拽顺位、批量切换的最终细节一致性
  - 技能方案的导入导出、状态提示、命名规则和局部布局细节
  - 战斗设置的丹药槽和条件编辑细节
  - 目标选择规则的实际服务端生效范围
  - 自动索敌模式和目标选择规则的组合行为

### 后续整理原则

- UI 继续跟 `main`。
- 逻辑只落在 `main-action-state-source.ts`、`socket-send-panel.ts`、`automation-types.ts`。
- 目标选择的服务端判定按当前 `next` 运行时分层接，不回退成 `main` 那套旧 `game/*` 直连。

### 优先级

- `P0`

---

## 3. 属性、观察、世界摘要、实体详情

### main 基线

- `main-attr-detail-state-source.ts`
- `main-observe-state-source.ts`
- `main-detail-state-source.ts`
- `main-world-summary-state-source.ts`
- `ui/entity-detail-modal.ts`
- `ui/panels/attr-panel.ts`
- `ui/panels/world-panel.ts`

### 当前差异

- `attr-panel` 的低频详情链已经补上：`main-attr-detail-state-source.ts -> attr-panel` 现在支持按需请求 `AttrDetail`，并把 `numericStatBreakdowns` 接进数值 tooltip。
- `attr-panel` 这一轮已去掉 `ui-tab-strip / ui-surface-* / ui-empty-hint` 这层过渡壳，属性页签、数值卡和空态结构重新收回到 `main` 当前版。
- 属性数值 tooltip 也已重新按 `main` 口径分层：主值高亮、固定值/百分比 pill、子项缩进和 note 提示不再沿用 `next` 的压平样式。
- 属性低频详情请求时机已经回到 `main`：不再在 bootstrap 或切到属性页签时主动预取，而是在 tooltip 交互时按需请求。
- `observe` 已撤掉“整卡点开实体详情”和怪物卡内联“稳定掉落”预览，当前观察顺序重新回到 `main` 的 `角色信息` + `掉落物` 按钮模型。
- `entity-detail-modal` 仍保留兼容实现与现有详情回包消费链，但这轮已不再让它继续占据主观察流入口。
- `天下榜 / 世界总览 / 天机追索 / 玩家详情` 这一条前端低频链已经补出一个闭环：
  - `天下榜` 和 `世界总览` 现在可以互跳
  - 榜册顶部已有卷宗概览卡
  - 玩家击杀榜已有“立即追索”入口
  - 玩家详情会消费当前追索册页，显示天机追索坐标
- 原 `leaderboard-modal.ts` 在 `main` 已被替换为新的状态源/详情链路，当前 `next` 需要继续检查排行榜、追索结果、实体详情之间的串联。
- `world-panel` 的独立 `天机阁` 入口区块已补回；地图情报、附近实体、当前建议和天机阁四区的 DOM 结构也已开始回收为 `main` 当前版，不再继续保留 `ui-surface-* / ui-card-list / ui-key-value-list` 这类过渡壳层。
- 当前这一组剩余差异已经收窄为：
  - `world-panel` 的剩余样式细节、留白和手机模式还需继续和 `main` 抠齐
  - 其他榜单和详情类型还没有接入“卷宗互跳 / 追索情报”这套低频链
  - `entity-detail-modal` 是否还应作为其他入口保留，以及它自身字段密度与文案的进一步收敛
  - 排行榜册页、追索结果和详情弹层之间的剩余交互细节
  - 动作面板仍然是独立的 P0 收尾块

### 后续整理原则

- 一切详情展示走 `detailModalHost` 单实例详情弹层。
- 详情数据继续按“摘要、详情、增量”拆，不把长文本和静态信息塞回高频链路。
- 详情回接优先补 `main-detail-state-source.ts`、`main-observe-state-source.ts`、`main-world-summary-state-source.ts`。
- 属性详情链里 `numericStatBreakdowns` 已正式补回 `shared` 的 `AttrUpdateView` 真源；后续再扩写时优先保持协议、protobuf codec 和前端状态源同步收口。

### 优先级

- `P0`

---

## 4. 背包、装备、拾取、物品提示

### main 基线

- `main-inventory-state-source.ts`
- `ui/panels/inventory-panel.ts`
- `ui/panels/equipment-panel.ts`
- `ui/panels/loot-panel.ts`
- `ui/item-display.ts`
- `ui/equipment-tooltip.ts`
- `ui/item-inline-tooltip.ts`

### 当前差异

- `main-inventory-state-source.ts` 已经补进当前 `next`，背包同步时会先同步玩家上下文，`已学 / 已阅 / 已装备对比` 这类 tooltip/详情判断不再滞后。
- `equipment-tooltip.ts` 已补了一轮字段密度：
  - 条件文案已回到 `时段 / 地图 / 目标` 这组中文口径
  - 药品分类补了 `药材 / 异材`
  - 装备 tooltip 和背包对比里已带上炼丹相关加成与更完整的功能词条摘要
  - 功法书 tooltip 已补 `功法 / 境界 / 品阶 / 满层属性 / 附带技能`
- `inventory-panel.ts` 已补：
  - 装备详情里的 `装备属性`
  - 功法书详情里的 `功法概要`
  - 可装备物品详情里的 `当前已装备` 对照
- `equipment-panel.ts` 的槽位 meta 已改成复用新的装备词条整理，条件文案和 tooltip 对齐。
- `loot-panel.ts` 已补一轮：
  - 来源副标题会带品级
  - 描述从按钮区回到内容区
  - 连续采摘/停止采集/空态文案已更接近 `main`
  - 手动关闭后的自动重开抑制已补上
- `item-inline-tooltip.ts` 现在会透传本地模板的完整字段，地图解锁、炼丹词条、额外效果等信息能正常进内联 tooltip。
- 当前这组已经不再是“主链缺失”问题，剩下的是细节一致性和少量底层语义差异。
- 仍需继续核对：
  - 拾取面板里草药/连续采摘的底层语义仍是按当前 `next` 字段推断，不是 `main` 的专用真源结构
  - 背包格子、装备槽和 tooltip 的视觉层级与手机模式细节
  - item source / editor catalog 前端落点的进一步一致性

### 后续整理原则

- UI 继续对齐 `main` 的格子、详情和 tooltip 结构。
- 逻辑继续走 `main-inventory-state-source.ts`、`socket-send-panel.ts` 和共享 item/view types。
- tooltip 统一复用单实例悬浮提示，不新增平行实现。
- 草药/采集这类来源如果后续继续对齐，优先补 shared/server 真源，不再继续堆前端推断。

### 优先级

- `P0`

---

## 5. 背包、装备、拾取与 Tooltip

### main 基线

- `ui/panels/inventory-panel.ts`
- `ui/panels/equipment-panel.ts`
- `ui/panels/loot-panel.ts`
- `ui/equipment-tooltip.ts`
- `ui/item-inline-tooltip.ts`

### 当前差异

- 这一轮已把这组的高可见偏差继续往 `main` 当前版收了一轮：
  - `inventory-panel` 详情弹层去掉了 `功法概要 / 当前已装备` 这类 `main` 没有的额外信息，详情骨架也从 `ui-detail-*` 收回到 `quest-detail-*` 结构。
  - `inventory-panel` 非装备物品的属性标题不再单独叫 `附加词条`，已统一回 `装备属性` 这套口径。
  - `equipment-tooltip` 补回了 `强化速度 / 强化成功修正` 两条 `main` 里已有、当前 `next` 曾经丢掉的功能词条。
  - `equipment-panel` 的外层壳、槽位卡片壳和空态节点已去掉 `ui-surface-* / ui-empty-hint` 过渡挂点，回到 `main` 当前的 `panel-section / equip-slot / empty-hint` 结构语义。
  - `loot-panel` 已重新接回草药采集专用表现：
    - 恢复 `detail-modal--herb-gather` variant
    - 恢复 `loot-source-section--herb / herb-gather-summary / herb-gather-card`
    - 草药副标题、草药库存卡、停止采集按钮和空态文案都回到 `main` 当前口径
    - 来源说明重新回到顶部操作区，而不是独立落在标题区下方
- `item-inline-tooltip` 这轮没有发现明确的玩家可见差异，暂时不动。
- 这组现在剩下的主要是细节一致性，不再是主结构缺失：
  - `inventory-panel` 列表区和背包壳层仍有部分 `next` 的辅助挂点
  - `equipment-tooltip` 的地块资源文案还比 `main` 更细
  - `loot-panel` 的草药显示虽然已经回到 `main` 结构，但连续采摘运行时语义仍沿用当前 `next` 真源

### 后续整理原则

- 继续以 `main` 的可见结果为准，但不为了对齐视觉去改 `shared/server` 的真源定义。
- `inventory / equipment / loot` 保持当前 `next` 的增量 patch 和单实例详情弹层链路，不回退成整块重绘。
- 草药/采集如果后续继续对齐运行时行为，优先补 shared/server 真源，不再继续堆前端推断。

### 优先级

- `P0`

---

## 6. 市场、邮件、NPC 商店、任务

### main 基线

- `main-market-state-source.ts`
- `main-mail-state-source.ts`
- `main-quest-state-source.ts`
- `ui/panels/market-panel.ts`
- `ui/mail-panel.ts`
- `ui/npc-shop-modal.ts`
- `ui/npc-quest-modal.ts`
- `ui/panels/quest-panel.ts`

### 当前差异

- 这些模块在 `main` 上已经按新状态源拆开，当前 `next` 仍有不少文件级和功能级差异。
- `mail-panel` 已开始回收可见差异：
  - 邮件条目“少量数据时被自动拉高”的样式问题已修掉
  - 邮件弹窗不再强制使用 `next` 的 `lg` 尺寸覆写，已回到 `main` 当前弹窗尺寸语义
  - 列表、详情、附件空态已改回 `main` 当前的 `empty-hint` 风格，不再沿用 `ui-empty-hint` 过渡皮肤
  - 标题区 `subtitle / hint`、列表空态、详情空态、正文空态、附件空态已统一成同一套结果，不再出现首屏渲染和局部 patch 的可见分叉
- 任务链路尤其要补：
  - `npc-quest-modal.ts` 的主线入口和对话桥
  - 任务面板筛选、详情、导航状态
  - 邮件列表、邮件详情、附件交互剩余的结构与交互细节差异
  - 市场列表、订单详情、价格输入器与数量步进器

### 后续整理原则

- 这组模块全部按 `state source + panel/modal` 去补，不恢复旧巨型 panel 内直读 socket 数据的方式。
- 发包走 `socket-send-social-economy.ts` 和对应 request payload types。
- 任务、邮件、市场详情保持“列表摘要 + 明细详情”的分层。

### 优先级

- `P1`

---

## 6. 功法、体修、突破、炼丹、工坊、天门

### main 基线

- `main-technique-state-source.ts`
- `main-breakthrough-state-source.ts`
- `ui/panels/technique-panel.ts`
- `ui/panels/body-training-panel.ts`
- `ui/heaven-gate-modal.ts`
- `ui/craft-workbench-modal.ts`
- `ui/alchemy-modal.ts` 在 `main` 已被拆解/替换

### 当前差异

- 功法和体修面板已存在，但结构、详情层级、技能星图和辅助面板与 `main` 仍有差异。
- `main` 已把部分旧弹层替换成新的工作台/详情式实现，`next` 还需要继续跟。
- 炼丹、工坊、突破、天门这些功能在当前 `next` 前端仍有不完全一致的 UI 组织方式。

### 后续整理原则

- 继续沿用 `detailModalHost` 和状态源，不把已经被 `main` 淘汰的旧 modal 架构搬回来。
- 复杂系统优先对齐玩家操作路径，再补细节视觉。
- 技能、突破、丹药、工坊相关共享类型继续收敛到 `packages/shared/src/*-types.ts`。

### 优先级

- `P1`

---

## 7. HUD、聊天、登录、教程、更新日志、设置

### main 基线

- `ui/hud.ts`
- `ui/chat.ts`
- `ui/login.ts`
- `ui/tutorial-panel.ts`
- `ui/changelog-panel.ts`
- `ui/panels/settings-panel.ts`
- `ui/performance-config.ts`
- `main-settings-state-source.ts`

### 当前差异

- 当前 `next` 在 HUD、聊天、设置和性能项上已经有部分同步，但仍未完全跟齐 `main`。
- 主要差异点包括：
  - HUD 信息密度与状态条组织
  - 聊天面板的存储、提示、输入体验
  - 登录与规则说明文案
  - 教程面板与引导流程
  - 更新日志入口与内容组织
  - 设置面板的性能、输入、功能分组

### 后续整理原则

- UI 跟 `main`，但逻辑继续走本地状态和状态源。
- 聊天与 HUD 仍要保证增量 patch，避免高频重建。
- 设置项默认值和实际运行时开关必须对齐，不做只改显示不改真值的假同步。

### 优先级

- `P1`

---

## 8. 地图、MiniMap、Renderer、目标辅助

### main 基线

- `game-map/*`
- `main-map-runtime-bridge-source.ts`
- `main-targeting-helpers.ts`
- `minimap.ts`
- `renderer/text.ts`

### 当前差异

- 地图 runtime、map store、camera、viewport、minimap、projection、renderer 文本层都有 diff。
- 当前 `next` 已补入一部分主线显示，例如玩家敌对条、入魔徽记、FPS 上限、排行榜坐标追索，但仍有大量地图侧表现和交互细节未完全跟齐。
- `main` 中地图相关静态信息、运行时桥接和 UI 观察层的边界更清晰，当前 `next` 还需继续收口。

### 后续整理原则

- 地图侧 UI 以 `map-runtime + map-store + main-map-runtime-bridge-source.ts` 为真源。
- 任何会影响正确性的交互判断继续留在服务端或权威运行时。
- 只补表现和桥接，不把路径判定、占位判定等回退到前端。

### 优先级

- `P0`

---

## 9. 面板系统、弹层系统、样式与响应式

### main 基线

- `ui/detail-modal-host.ts`
- `ui/ui-modal-frame.ts`
- `ui/ui-primitives.ts`
- `styles/panels.css`
- `styles/responsive.css`
- `styles/ui-*.css`
- `ui/panel-system/*`

### 当前差异

- 当前 `next` 的面板系统和 `main` 仍有较大 diff，尤其在：
  - 面板能力注册
  - layout profiles
  - 响应式布局
  - 详情弹层壳子
  - 公共 UI primitive
  - 分拆样式文件后的视觉一致性

### 后续整理原则

- 视觉结果优先跟 `main`，但继续保留 `next` 的单实例详情弹层与面板状态模型。
- 新视觉抽象优先沉到 `ui-primitives.ts`、`ui-style-config.ts`、`styles/ui-*.css`，不要继续把公共皮肤硬写进单面板。
- 手机模式、浅色、深色必须按组件级别验证。

### 优先级

- `P0`

---

## 10. GM 前端

### main 基线

- `gm.ts`
- `gm-world-viewer.ts`
- `gm-map-editor.ts`
- `gm/helpers/*`
- `ui/panels/gm-panel.ts`

### 当前差异

- GM 相关在 `main` 上有明显扩展，包括玩家列表、风控信息、世界查看和编辑辅助。
- 当前 `next` 的 GM 面板和 GM 页面仍有 diff，尤其是列表组织、筛选、标记和操作流。

### 后续整理原则

- GM UI 跟 `main`，但逻辑继续走当前 `next` 的 `next-gm-contract.ts`、runtime auth 和 player snapshot/source service。
- GM 页面和正式玩家前端分开治理，不把试验性工具直接混进玩家主界面链路。

### 优先级

- `P2`

---

## 11. Shared 前端相关契约

### main 基线

- `packages/shared/src/automation-types.ts`
- `packages/shared/src/panel-update-types.ts`
- `packages/shared/src/player-runtime-types.ts`
- `packages/shared/src/protocol*.ts`
- `packages/shared/src/world-*-types.ts`
- `packages/shared/src/detail-view-types.ts`
- `packages/shared/src/entity-detail-types.ts`

### 当前差异

- 当前 `next` 已同步一部分共享契约，但和 `main` 相比仍有大量前端可见类型差异。
- 特别要持续关注：
  - 战斗设置与自动化类型
  - 面板 delta 类型
  - 详情和观察视图类型
  - 世界 patch / world view / runtime player state
  - request / response envelope 拆分

### 后续整理原则

- 共享类型以“前端实际要消费的视图”为中心，不把服务端内部字段直接透出。
- 高频链路继续保持最小字段与静态/动态分层。
- 任何新增 UI 功能都先补共享类型，再补状态源和面板。

### 优先级

- `P0`

## 优先级建议

### 第一批

- 动作面板与战斗设置
- 属性/观察/世界摘要/实体详情
- 地图、Minimap、Renderer、目标辅助
- 面板系统、弹层系统、样式与响应式
- shared 前端契约

### 第二批

- 背包/装备/拾取/tooltip
- 市场/邮件/NPC 商店/任务
- HUD/聊天/登录/教程/设置
- 功法/体修/突破/炼丹/工坊/天门

### 第三批

- GM 前端
- React prototype / next UI prototype 相关资产
- 非玩家主流程的辅助页和部署壳差异

## 执行顺序建议

1. 先补 shared 契约和状态源真源  
2. 再补面板和弹层 UI  
3. 最后清地图侧表现、响应式和 GM 工具

## 结论

当前 `next` 相比 `main`，前端不是“只差几个按钮”。

真正的差异面主要有三层：

- 玩家可见 UI 结果还没完全对齐
- 状态源与发包链虽然已经迁到 `next` 架构，但仍有不少模块没彻底收口
- shared 前端视图契约还需要继续按功能域补齐

后续如果按这份文档推进，原则应当始终保持一致：

- UI 看 `main`
- 逻辑落 `next`
- 协议先行
- 增量更新优先
