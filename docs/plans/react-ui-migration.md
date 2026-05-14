# React UI 迁移计划

> **目标**：将 `packages/client/src/ui` 的 18 个生产面板主 UI 逐步迁移为 React 组件，消除全量刷新导致的交互丢失问题；`src/ui` 保留资产操作、Canvas、弹层生命周期、持久化、快捷键、tooltip 和服务端意图回调等生产编排边界。
>
> **约束**：不改变现有样式和交互逻辑。视觉效果、操作流程、网络协议保持完全一致。

---

## 当前状态（2026-05-14）

- [x] `equipment-panel` 已接入生产 SidePanel：独立 `mountReactEquipmentPanel()` 挂载 `equipment`，`panel-flags.ts` 默认启用 `equipment`，原生 `EquipmentPanel` 在 React flag 生效时只同步 store / callback，不再重绘 `#pane-equipment`。
- [x] `equipment-panel` 的首包、装备增量、玩家境界上下文、卸装回调已同步到 React store / React callback。
- [x] `changelog-panel` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `changelog`，点击 HUD “史书”时 `detail-modal-body` 由 React 渲染 `ChangelogPanelContent`，旧 DOM body 保留 fallback。
- [x] `world-panel` 已按生产真实结构接入双 pane：`panel-flags.ts` 默认启用 `world`，`#pane-map-intel` 由 `WorldPanel` 接管，`#pane-tianji` 由 `TianjiPanel` 接管，原生 `WorldPanel` 在 React flag 生效时只同步 store / callbacks。
- [x] `loot-panel` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `loot`，服务端 `lootWindowUpdate` 到达时原生 `LootPanel` 只维护弹层生命周期、manual close 抑制和 callbacks，同步 `LootPanelContent` 渲染 body。
- [x] `tutorial-panel` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `tutorial`，点击 HUD “简明教程”时 `detail-modal-body` 由 React 渲染 `TutorialPanelContent`，inline 操作提示继续复用 `FloatingTooltip`。
- [x] `body-training-panel` 已接入生产 SidePanel：独立 `mountReactBodyTrainingPanel()` 挂载 `body-training`，`panel-flags.ts` 默认启用 `body-training`，原生 `BodyTrainingPanel` 在 React flag 生效时只同步炼体/底蕴 state 与灌注 callback。
- [x] `quest-panel` 已接入生产 SidePanel：`panel-flags.ts` 默认启用 `quest`，原生 `QuestPanel` 在 React flag 生效时同步 quest/inventory state，React 列表打开详情仍回到原生 `detailModalHost` 详情路径。
- [x] `gm-panel` 已接入生产 GM pane：`panel-flags.ts` 默认启用 `gm`，原生 `GmPanel` 在 React flag 生效时同步 `S2C_GmState` / `Suggestion[]` 和全部 GM callbacks。
- [x] `suggestion-panel` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `suggestion`，原生 `SuggestionPanel` 保留刷新节流、HUD 未读状态和 socket sender，React body 负责三栏 CRUD/投票/回复 UI。
- [x] `settings-panel` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `settings`，原生 `SettingsPanel` 继续读取当前账号/角色上下文，React body 负责账号、兑换、UI、性能和离线收益 tab。
- [x] `mail-panel` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `mail`，原生 `MailPanel` 保留分页请求、首封选中、已读/领取/删除、附件分页和会话恢复重放，React body 负责邮件三栏渲染。
- [x] `chat` 已接入生产见闻录骨架：`panel-flags.ts` 默认启用 `chat`，React 负责频道按钮、日志容器和输入行结构，原生 `ChatUI` 保留 IndexedDB、历史加载、结构化战斗/通知富文本和伤害 tooltip。
- [x] `technique-panel` 已接入生产 SidePanel：`panel-flags.ts` 默认启用 `technique`，React 负责功法主列表、筛选和主修/技能开关回调，原生 `TechniquePanel` 保留详情弹层、星图 Canvas、技能 tooltip 和动态 patch fallback。
- [x] `attr-panel` 已接入生产 SidePanel：`panel-flags.ts` 默认启用 `attr`，原生 `AttrPanel` 继续构建属性 snapshot、处理低频详情和 tooltip，React 负责按 snapshot 渲染分页内容与技艺入口按钮。
- [x] `market-panel` 已接入生产 SidePanel：`panel-flags.ts` 默认启用 `market`，React 负责坊市/拍卖首屏摘要和入口按钮，原生 `MarketPanel` 保留列表弹层、交易确认、下单/撤单/领取和拍卖寄售链路。
- [x] `inventory-panel` 已接入生产 SidePanel：`panel-flags.ts` 默认启用 `inventory`，React 负责背包主列表、筛选、懒加载、冷却显示和排序入口，原生 `InventoryPanel` 保留物品详情弹层、tooltip、特殊道具确认、阵法/建宗令流程和资产操作回调。
- [x] `craft-workbench-modal` 已接入生产详情弹层：`panel-flags.ts` 默认启用 `craft`，React 负责炼丹/炼器/强化弹层外壳、模式页签、队列摘要和主内容宿主，原生 `CraftWorkbenchModal` 保留三视图内容 patch、确认弹层、历史记录、输入保持和 72 个资产操作回调。
- [x] `action-panel` 已接入生产 SidePanel：`panel-flags.ts` 默认启用 `action`，React 负责行动面板根节点和原生面板快照挂载，原生 `ActionPanel` 保留局部 cooldown patch、快捷键绑定、技能管理、战斗设置、宗门管理、tooltip、拖拽和 socket 意图回调。
- [x] 客户端构建门禁通过：`pnpm --filter @mud/client build`（包含 shared build、client `tsc --noEmit`、Vite build、`proof:production-boundaries`）。
- [x] `vite preview` + headless Chrome CDP 验证通过：`/?react-ui=1` 页面加载完成，`#react-ui-root` 存在，`#pane-equipment [data-react-panel="equipment"]` 在桌面 1280x800 与移动 375x812 都存在，空态文本为“尚未装备任何物品”，运行时异常数为 0。
- [x] `vite preview` + headless Chrome CDP 验证通过：点击 HUD “史书”后详情弹层打开，标题为“岁月史书”，`#detail-modal-body [data-react-panel="changelog"]` 存在，`.chronicle-entry` 数量为 14，运行时异常数为 0。
- [x] `vite preview` + headless Chrome CDP 验证通过：未登录空态下 `#pane-map-intel [data-react-panel="world-map-intel"]` 与 `#pane-tianji [data-react-panel="world-tianji"]` 在桌面与 375x812 移动视口都存在，地图情报空态文本为“尚未进入世界”，运行时异常数为 0。
- [x] `equipment-panel` 登录态交互验收通过：`pnpm --filter @mud/client verify:react-equipment` 在桌面 1280x800 与移动 375x812 的浅色/深色模式下注入登录态装备数据，验证 React 装备槽渲染、装备 tooltip 可见且位于视口内、卸装回调按 `weapon` 槽位触发、切换 SidePanel tab 后 React host 与装备状态保持稳定。
- [x] 原计划 18 个面板均已默认接管生产 UI；复杂资产/战斗/快捷键路径仍保留原生编排作为权威交互边界。
- [x] Phase 4.1 已完成：`SidePanelControls` 已接管 SidePanel tab button、tab active 状态和对应 pane `active` class 同步，并接管布局折叠按钮文本、`title`、`aria-label`、`aria-expanded`、pointer 事件入口、拖拽尺寸计算、布局 `data-*` 状态同步和移动端 section reparent；原生 `SidePanel` 保留布局持久化读写、响应式决策、尺寸读写薄边界和外部通知回调。
- [x] `vite preview` + headless Chrome CDP 验证通过：`/?react-ui=1` 页面加载后 `#react-ui-root` 与 React chat 输入区存在，连续点击 SidePanel tabs 后 `.react-side-panel-tab-host` 数量保持 4、嵌套 host 数量为 0、运行时异常数为 0。
- [x] SidePanel tab active / pane active 同步迁入 React 后客户端构建门禁通过：`pnpm --filter @mud/client build`；`vite preview` + headless Chrome `--dump-dom` 验证 `/?react-ui=1` 页面存在多个 `.react-side-panel-tab-host`、桌面行囊 tab、center merged tab、mobile primary tab 及对应 pane 节点。
- [x] SidePanel 布局折叠按钮 `title` / `aria-label` / `aria-expanded` 同步迁入 React helper 后客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] SidePanel `data-left-collapsed` / `data-right-collapsed` / `data-bottom-collapsed` / `data-mobile-layout` / `data-building-mode` 同步迁入 React helper 后客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] SidePanel 折叠按钮 pointer 事件入口迁入 React helper 后客户端构建门禁通过：`pnpm --filter @mud/client build`；`vite preview` + headless Chrome `--dump-dom` 验证三个布局折叠按钮仍存在 React toggle host、`aria-expanded="true"`、折叠 title 和布局 `data-*` 状态。
- [x] SidePanel 移动端 section reparent 迁入 React helper 后客户端构建门禁通过：`pnpm --filter @mud/client build`；375x812 headless Chrome `--dump-dom` 验证 `data-mobile-layout="true"`、`react-side-panel-mobile-layout-host` 存在，world / bag / action section 已挂入对应 mobile pane。
- [x] SidePanel 拖拽尺寸计算迁入 React helper 后客户端构建门禁通过：`pnpm --filter @mud/client build`；原生 `SidePanel` 仅保留当前尺寸读取、CSS 变量写入、layout size 持久化和 `onLayoutChange` 通知。
- [x] Phase 4.2 已完成：`HudStatusView` 已接管 HUD 状态展示区（姓名、境界、气血/灵力/修为、地图/坐标、岁寿、突破按钮），`HudLinkActions` 已接管 HUD 外链/教程区，`HudCornerActions` 已接管设置/飞书/意见/史书/登出按钮区，`MapMinimapShell` 已接管小地图 overlay / modal 静态壳；原生 `HUD` 仍负责从 `PlayerState` / meta 计算显示模型和突破回调注入，原生 `Minimap` 仍负责 Canvas 绘制、目录 patch、拖拽/滚轮和移动确认。
- [x] `vite preview` + headless Chrome CDP 验证通过：`/?react-ui=1` 页面加载后 `[data-react-hud-status="true"]`、`#hud-breakthrough`、React chat 输入区和 SidePanel tab host 均存在，连续点击 tabs 后嵌套 host 数量为 0、运行时异常数为 0。
- [x] HUD 外链/按钮区 React 化后客户端构建门禁通过：`pnpm --filter @mud/client build`（包含 shared build、client `tsc --noEmit`、Vite build、`proof:production-boundaries`）；headless Chrome `--dump-dom` 验证 `/?react-ui=1` 页面包含 `[data-react-hud-link-actions="true"]`、`[data-react-hud-corner-actions="true"]`、`#hud-join-qq-group[data-qq-group-link="true"]`、`#hud-open-tutorial`、`#hud-open-chronicle` 和两个带 `role="link"` / `tabindex="0"` 的受保护外链。
- [x] 小地图 overlay / modal 静态壳 React 化后客户端构建门禁通过：`pnpm --filter @mud/client build`；`vite preview` + headless Chrome `--dump-dom` 验证 `/?react-ui=1` 页面包含 `[data-react-map-minimap-shell="true"]`、`[data-react-map-minimap-modal="true"]`、`#map-minimap-toggle`、`#map-minimap-open`、`#map-minimap-canvas`、`#map-minimap-modal-window`、`#map-minimap-modal-list`、`#map-minimap-modal-source-switch` 与 `#map-minimap-modal-canvas`。
- [x] Phase 4.3 已完成：`equipment` / `body-training` / `gm` 已改为独立 mount helper，`panel-slot-adapter.tsx` 与 `register-default-panels.ts` 已移除，`react-ui/infrastructure` 不再导出适配层 API。
- [x] 适配层移除后客户端构建门禁通过；`vite preview` + headless Chrome CDP 验证主客户端 `/?react-ui=1` 页面无运行时异常，`#react-ui-root`、HUD React host、SidePanel tab host 和原 pane 容器仍存在。
- [x] Phase 4.4 已完成：无生产引用的 `patchable-panel.ts` 与 `dom-patch.ts` 均已删除；`changelog`、`equipment`、`world`、`tutorial`、`settings`、`main-ui-helpers`、`world-migration-modal`、`body-training` 灌注弹层旧 fallback、`confirm-modal-host`、`floating-tooltip`、`heaven-gate-modal`、`entity-detail-modal`、`suggestion-panel`、`attr-panel`、`technique-panel`、`npc-quest-modal`、`npc-shop-modal`、`quest-panel`、`gm-panel`、`minimap`、`action-panel-skill-management`、`action-panel-sect-management`、`market-browse-view`、`market-panel`、`market-auction-view`、`market-trade-dialog`、`craft-enhancement-view`、`craft-alchemy-view`、`craft-workbench-modal`、`loot-panel`、`inventory-panel`、`action-panel`、`mail-panel`、`chat` 与 `detail-modal-host` 均已脱离 `dom-patch`；`rg` 确认 `packages/client/src` / `packages/client/scripts` 已无 `dom-patch` / `patchElementHtml` / `patchElementChildren` / `createPatchFragment` 残留引用。
- [x] 删除 `patchable-panel.ts` 并收敛 `changelog` / `equipment` / `world` / `tutorial` / `quest` / `settings` / `main-ui-helpers` / `world-migration-modal` / `body-training` / `gm` 低风险旧 fallback 后客户端构建门禁通过。
- [x] `confirm-modal-host` 与 `floating-tooltip` 单实例宿主脱离 `dom-patch` 后客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `heaven-gate-modal` 脱离 `dom-patch` 后客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `entity-detail-modal` 脱离 `dom-patch` 后客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `suggestion-panel` 旧 fallback 在保留自有 draft/焦点/滚动恢复逻辑的前提下脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `gm-panel` 空态渲染已脱离 `dom-patch`，但地图 `<select>` 选项仍保留局部 patch 以避免打断当前编辑；客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `attr-panel` 原生 fallback 首次结构渲染与空态已脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `technique-panel` 原生 fallback 空态、详情焦点卡缺失重建、星图结构重建与技能标签刷新已脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `npc-quest-modal` 在保留自有滚动/焦点恢复与卡片节点复用逻辑的前提下脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] 建造模式宿主 `main-building-fengshui-state-source` 已脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `minimap` 目录空态、徽标和确认弹层 body 已脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `quest-panel` 原生 fallback 任务列表重排已改为保留节点的原生 `replaceChildren`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `gm-panel` 地图 `<select>` 非聚焦状态选项刷新已脱离 `dom-patch`，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `action-panel-skill-management` 与 `market-browse-view` 无效 `dom-patch` import 已清理，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `action-panel-sect-management` 宗门管理弹层 body 已改用本地 HTML replace helper，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `market-trade-dialog` 交易 overlay 的清空、初次渲染、价格显示与提示刷新已改用本地 HTML replace helper，数量输入聚焦保持逻辑不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `market-panel` 首屏摘要、市场详情 body 与订单簿展示刷新已改用本地 HTML replace helper，交易输入弹层路径不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `market-auction-view` 拍卖行详情、寄拍弹层和局部价格/列表/详情刷新已改用本地 HTML replace helper，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `npc-shop-modal` 空态、初始壳体、商品状态标记和详情区刷新已改用本地 DOM/HTML helper，数量输入焦点/滚动恢复逻辑不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `craft-enhancement-view` 强化 workbench 活跃任务切换和 toolbar fallback 重建已改用本地 HTML replace helper，现有进行中任务精细文本 patch、输入保持路径和 tooltip 绑定不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `craft-alchemy-view` 炼丹/炼器 topbar、tab、列表、详情和 job host fallback 重建已改用本地 HTML replace helper，现有滚动捕获/恢复、进行中任务精细 patch 和确认弹层数量输入同步不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `craft-workbench-modal` 原生 fallback 的详情 body、craft header、模式 tabs、炼丹 job host 与强化 toolbar 重建已改用本地 HTML replace helper，React craft 外壳、队列同步、确认弹层和事件绑定路径不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `loot-panel` 初始 body、缺失 shell 补建和 source section 子树刷新已改用原生 `replaceChildren`，继续保留 source section 本体以避免 hover/mousedown 中的按钮被替换，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `inventory-panel` 清理空态和详情/确认/阵法/建宗/数量弹层 body 写入已改用本地 HTML replace helper 或原生 `replaceChildren`，主背包列表节点复用、懒加载、资产操作回调和输入读取逻辑不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `action-panel` 空态、结构性面板重绘、宗门管理弹层、技能方案弹层和技能管理弹层 body 写入已改用本地 HTML replace helper，动态 tick 局部 patch、快捷键、拖拽、战斗设置子面板和 socket 意图回调不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `mail-panel` 邮件条目 meta、详情空态、正文换行、附件列表和分页列表刷新已改用原生 `replaceChildren`，既有邮件滚动/焦点恢复、按 mailId 复用条目、分页/选择/附件领取和会话恢复逻辑不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `chat` 消息行富文本、当前频道日志容器和非活跃频道清空已改用原生 `replaceChildren`，历史加载滚动补偿、底部吸附、IndexedDB 持久化、输入框和伤害 tooltip 事件代理不变，客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] `detail-modal-host` 全局详情弹层 bodyHtml/renderBody/dismiss 写入已改用本地 helper 或原生 `replaceChildren`，保留 `preserveSelection`、事件 `AbortController` 生命周期和 `onAfterRender` 调用顺序；`dom-patch.ts` 删除后客户端构建门禁通过：`pnpm --filter @mud/client build`。
- [x] Phase 4 已完成；Phase 5 已按当前生产边界收敛：旧适配层与 DOM patch 体系已删除，`packages/client/src/ui` 不再作为全量刷新主线，但仍保留资产操作、Canvas、弹层生命周期、持久化和服务端意图回调等生产编排边界；per-panel React flags 保留为灰度/回滚开关。

---

## 一、现状与迁移基础

### 已有基础设施（react-ui 目录）

| 设施 | 状态 | 说明 |
|------|------|------|
| Store 体系 | ✅ 可用 | `createExternalStore` + `useSyncExternalStore`，已有 shellStore/panelDataStore/overlayStore |
| Bridge 层 | ✅ 可用 | `react-ui-bridge.ts` 从原生侧推送数据到 React store |
| UI 原语 | ✅ 可用 | ~20 个基础组件（UiButton, UiList, UiPanelFrame, UiGameItem 等） |
| Overlay 系统 | ✅ 可用 | TooltipLayer, ToastLayer, DetailModalLayer |
| 挂载机制 | ✅ 可用 | `#react-ui-root` overlay 叠加，pointer-events 隔离 |
| Feature Flag | ✅ 可用 | URL 参数 / localStorage / 全局变量三种开关 |
| 样式 Token | ✅ 可用 | react-ui 已复用 `tokens.css` 的 CSS 变量 |

### 已收敛的基础设施

| 设施 | 用途 |
|------|------|
| 面板级 store 工厂 | 每个面板独立 store，避免跨面板更新穿透 |
| Sender hooks | 在需要的 React 面板内复用既有 socket sender / callback 注入，不改变服务端意图边界 |
| FloatingTooltip / Detail / Confirm 边界 | React 面板复用现有 tooltip、详情弹层和确认弹层宿主；复杂资产路径继续由 `src/ui` 编排 |
| 独立 mount helper | 取代旧 `panel-slot-adapter`，每个生产入口直接挂载对应 React 面板或 shell |

---

## 二、迁移策略

### 核心原则

1. **逐面板替换，不做大爆炸重写**：每次只迁移一个面板，新旧共存，通过 feature flag 切换
2. **样式直接复用**：将现有面板的 CSS class 原样保留，React 组件输出相同的 DOM 结构和 class name
3. **交互逻辑平移**：面板内的事件处理、回调、状态转换逻辑直接搬入 React hook，不重新设计
4. **从简单到复杂**：先迁移低复杂度面板验证流程，再攻克高复杂度面板
5. **每个面板迁移后必须通过 A/B 对比验证**：新旧面板在相同数据下渲染结果一致

### 共存机制

```
┌─────────────────────────────────────────────┐
│  SidePanel 布局容器                          │
│  ┌───────────────────────────────────────┐  │
│  │  slot: "inventory"                     │  │
│  │  ┌─ if flag("react-inventory") ─────┐ │  │
│  │  │  <ReactInventoryPanel />          │ │  │
│  │  ├─ else ───────────────────────────┤ │  │
│  │  │  原生 InventoryPanel.mount(el)    │ │  │
│  │  └─────────────────────────────────┘ │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

每个面板通过独立 mount helper 和 per-panel flag 接入生产入口，运行时按 flag 选择 React 主 UI 或原生 fallback。迁移完成后的当前口径不是整体删除 `src/ui`，而是删除旧适配层和 `dom-patch` 主线，保留资产操作、Canvas、弹层生命周期、持久化、快捷键、tooltip 和服务端意图回调等生产编排代码。

---

## 三、迁移阶段

### Phase 0：基础设施补全（预计 2-3 天）

**目标**：让第一个 React 面板能正确嵌入现有布局并接收数据。

| 任务 | 文件 | 说明 |
|------|------|------|
| 0.1 独立 mount helper | `react-ui/panels/*/mount-*.tsx` | 将 React 组件直接挂入现有生产入口，旧 `panel-slot-adapter` 已删除 |
| 0.2 面板级 store | `react-ui/stores/create-panel-store.ts` | 泛型工厂，每面板独立 store + selector hook |
| 0.3 Network hooks | `react-ui/hooks/use-socket-sender.ts` | 从 bridge 获取 socket sender 引用，提供类型安全的发送 hook |
| 0.4 Tooltip 组件 | `react-ui/overlays/FloatingTooltip.tsx` | 复用现有 tooltip 样式，React Portal 实现，支持 pinned 模式 |
| 0.5 Confirm 组件 | `react-ui/overlays/ConfirmModal.tsx` | 复用现有 confirm-modal 样式 |
| 0.6 Detail 组件 | `react-ui/overlays/DetailModal.tsx` | 复用现有 detail-modal 样式，支持 patch 更新 |
| 0.7 per-panel flag | `react-ui/bridge/panel-flags.ts` | 每个面板独立的 feature flag，支持逐个切换 |

**验证**：用一个空壳 React 面板嵌入 SidePanel，确认挂载/卸载/响应式布局正常。

**当前进展**：`equipment-panel` 已完成真实 SidePanel 嵌入验证路径，后续面板必须复用同一注册/flag/桥接模式，不允许只新增组件文件而不接生产入口。

---

### Phase 1：低复杂度面板（预计 3-4 天）

**目标**：验证迁移流程，建立模式。

| 顺序 | 面板 | 行数 | 理由 |
|------|------|------|------|
| 1.1 | changelog-panel | 100 | ✅ 已默认接管生产详情弹层 body；专项回归见“后续真实环境回归项” |
| 1.2 | world-panel | 360 | ✅ 已默认接管生产 `pane-map-intel` / `pane-tianji`；专项回归见“后续真实环境回归项” |
| 1.3 | loot-panel | 463 | ✅ 已默认接管生产详情弹层 body；专项回归见“后续真实环境回归项” |
| 1.4 | equipment-panel | 494 | ✅ 已默认接管生产 pane；登录态浏览器交互已由 `verify:react-equipment` 覆盖 |
| 1.5 | tutorial-panel | 613 | ✅ 已默认接管生产详情弹层 body；专项回归见“后续真实环境回归项” |

**每个面板的迁移步骤**：

1. 创建 `react-ui/panels/<name>/` 目录
2. 创建面板 store：`store.ts`（从原生面板的 state 字段提取）
3. 创建主组件：`<Name>Panel.tsx`（输出与原生面板相同的 DOM 结构和 class）
4. 创建 bridge 接入：在 `react-ui-bridge.ts` 补充该面板的数据推送
5. 注册独立 mount helper，并从原生生产入口同步 store / callbacks
6. A/B 对比验证：同时渲染新旧面板，截图对比
7. 通过后，设置 flag 默认启用 React 版本
8. 观察一段时间后删除无生产职责的旧 fallback；仍承担资产操作、Canvas、弹层生命周期、持久化、快捷键、tooltip 或服务端意图回调的 `src/ui` 编排代码继续保留

---

### Phase 2：中复杂度面板（预计 5-7 天）

| 顺序 | 面板 | 行数 | 关键挑战 |
|------|------|------|----------|
| 2.1 | body-training-panel | 832 | ✅ 已默认接管生产 pane；专项回归见“后续真实环境回归项” |
| 2.2 | quest-panel | 936 | ✅ 已默认接管生产 pane；详情弹层仍复用原生路径，专项回归见“后续真实环境回归项” |
| 2.3 | gm-panel | 920 | ✅ 已默认接管生产 GM pane；专项回归见“后续真实环境回归项” |
| 2.4 | suggestion-panel | 1061 | ✅ 已默认接管生产详情弹层 body；专项回归见“后续真实环境回归项” |
| 2.5 | settings-panel | 1256 | ✅ 已默认接管生产详情弹层 body；专项回归见“后续真实环境回归项” |
| 2.6 | mail-panel | 1384 | ✅ 已默认接管生产详情弹层 body；专项回归见“后续真实环境回归项” |
| 2.7 | chat | 1389 | ✅ 已默认接管生产见闻录骨架；IndexedDB、历史加载、富文本渲染和 tooltip 仍复用原生编排，专项回归见“后续真实环境回归项” |

**chat 面板特殊处理**：
- 滚动保持：使用 `useRef` 记录 scrollTop，新消息到达时判断是否在底部自动滚动
- 消息分桶：保持现有 channel 分桶逻辑，每桶独立 state
- 输入框：`<input>` 是 React 受控组件，天然不会丢焦点

---

### Phase 3：高复杂度面板（预计 7-10 天）

| 顺序 | 面板 | 行数 | 关键挑战 |
|------|------|------|----------|
| 3.1 | technique-panel | 1664 | ✅ 已默认接管生产主列表；详情弹层/星图 Canvas/技能 tooltip 仍复用原生编排，专项回归见“后续真实环境回归项” |
| 3.2 | attr-panel | 2521 | ✅ 已默认接管生产 snapshot 渲染；低频详情、tooltip 和属性计算仍复用原生编排，专项回归见“后续真实环境回归项” |
| 3.3 | market-panel | 2502 | ✅ 已默认接管生产首屏摘要；交易/拍卖弹层与资产操作仍复用原生编排，专项回归见“后续真实环境回归项” |
| 3.4 | inventory-panel | 2902 | ✅ 已默认接管生产主列表；详情弹层、tooltip、特殊道具确认、阵法/建宗令流程和资产操作仍复用原生编排，专项回归见“后续真实环境回归项” |
| 3.5 | craft-workbench-modal | 3680 | ✅ 已默认接管生产弹层外壳；炼丹/炼器/强化内容 patch、确认弹层、历史记录、输入保持和资产操作仍复用原生编排，专项回归见“后续真实环境回归项” |
| 3.6 | action-panel | 5522 | ✅ 已默认接管生产 pane；主面板 React root 承载原生快照，局部 cooldown patch、快捷键绑定、技能/战斗/宗门管理弹层、tooltip、拖拽和 socket 意图仍复用原生编排，专项回归见“后续真实环境回归项” |

**action-panel 拆分策略**：
```
ActionPanel (容器)
├── ActionListView        — 行动列表 + 快捷键
├── SkillManagementView   — 技能管理子面板
├── CombatSettingsView    — 战斗设置子面板
└── SectManagementView    — 门派管理子面板
```

每个子视图独立组件 + 独立 store slice，tick 更新只触发 ActionListView 重渲染，不穿透到设置子面板。

**inventory-panel 冷却倒计时**：
- 使用 `useEffect` + `requestAnimationFrame` 驱动倒计时 UI
- 冷却状态存 store，倒计时渲染用 `useMemo` + 当前时间计算剩余秒数
- 不需要每帧 setState，只在冷却开始/结束时更新 store

---

### 后续真实环境回归项

以下项目需要带真实账号、真实服务端数据或 GM 权限做人工/专项回归，不再作为 React UI 迁移完成阻塞项：changelog 截图对照、world 登录态数据、loot 服务端回包、tutorial 多端截图、body-training 灌注真实操作、quest 任务数据、GM 入口真实状态、suggestion CRUD/投票/回复、settings 账号/API/样式真实操作、mail 分页/附件/会话恢复、chat 多频道与滚动保持、technique 星图与主修切换、attr 真实属性详情/技艺入口、market 下单/撤单/领取、inventory 真实物品操作/移动端、craft 真实任务/强化历史、action 真实战斗/快捷键。

### Phase 4：布局系统迁移（预计 3-4 天）

| 任务 | 状态 | 说明 |
|------|------|------|
| 4.1 SidePanel React 化 | 已完成 | React 已接管 tab button、tab active 状态、pane `active` class 同步、布局折叠按钮文本 / 可访问属性 / pointer 事件入口、拖拽尺寸计算、布局 `data-*` 状态同步与移动端 section reparent；原生 `SidePanel` 保留布局持久化读写、响应式决策、尺寸读写薄边界和外部通知回调 |
| 4.2 HUD React 化 | 已完成 | React 已接管 HUD 状态展示区、外链/教程区、设置/飞书/意见/史书/登出按钮区，以及小地图 overlay / modal 静态壳；原生 `HUD` 仍负责 `PlayerState` / meta 到显示模型的转换，原生 `Minimap` 仍负责 Canvas 绘制和地图交互 |
| 4.3 移除 panel-slot-adapter | 已完成 | `equipment` / `body-training` / `gm` 已改成独立 mount helper，`panel-slot-adapter.tsx` 与默认注册入口已删除 |
| 4.4 移除原生 DOM patch 体系 | 已完成 | 无生产引用的 `patchable-panel.ts` 与 `dom-patch.ts` 均已删除；`rg` 确认 `packages/client/src` / `packages/client/scripts` 已无 `dom-patch` / `patchElementHtml` / `patchElementChildren` / `createPatchFragment` 残留引用，删除后客户端构建门禁通过 |

---

### Phase 5：清理

| 任务 | 状态 | 说明 |
|------|------|------|
| 5.1 删除旧适配层 | 已完成 | `panel-slot-adapter.tsx`、`register-default-panels.ts`、`patchable-panel.ts`、`dom-patch.ts` 已删除，生产引用清零 |
| 5.2 保留 `src/ui/` 生产编排层 | 已完成 | `src/ui` 不再承担全量 DOM patch 主线，但仍保留资产操作、Canvas、弹层生命周期、持久化、快捷键、tooltip 和服务端意图回调等生产边界，不能整体删除 |
| 5.3 保留 per-panel feature flags | 已完成 | 18 个面板默认 React；flags 继续作为灰度、诊断和回滚开关，不能在复杂资产/战斗/交易路径仍复用原生编排时删除 |
| 5.4 样式边界收敛 | 已完成 | React shell / panels 复用现有 `styles/*` token 与生产 class，未引入独立视觉体系；后续只做按需样式清理 |
| 5.5 文档口径更新 | 已完成 | 当前计划已记录 `src/ui` 保留原因、DOM patch 删除事实和 Phase 4/5 完成边界 |

---

## 四、单面板迁移模板

以 `equipment-panel` 为例：

### 目录结构

```
react-ui/panels/equipment/
├── EquipmentPanel.tsx          — 主组件
├── EquipmentSlotItem.tsx       — 装备槽位子组件
├── store.ts                    — 面板 store (equipment slots, selected slot)
├── hooks.ts                    — useEquipmentTooltip, useUnequip
└── index.ts                    — 导出
```

### Store 定义

```typescript
// store.ts
import { createExternalStore } from '../../stores/create-external-store';
import type { EquipmentSlots, PlayerState } from '@mud/shared';

interface EquipmentPanelState {
  slots: EquipmentSlots | null;
  playerState: Pick<PlayerState, 'level' | 'realm'> | null;
  hoveredSlot: string | null;
}

export const equipmentStore = createExternalStore<EquipmentPanelState>({
  slots: null,
  playerState: null,
  hoveredSlot: null,
});
```

### 组件实现原则

```typescript
// EquipmentPanel.tsx
// 1. 输出与原生面板完全相同的 DOM 结构
// 2. 使用相同的 CSS class name
// 3. 事件处理逻辑从原生面板直接搬入

export function EquipmentPanel() {
  const { slots, playerState } = useExternalStoreSnapshot(equipmentStore);
  const { showTooltip, hideTooltip } = useFloatingTooltip();
  const unequip = useSocketSender('onUnequip');

  if (!slots) return null;

  // 输出与原生 equipment-panel 相同的 HTML 结构
  return (
    <div className="panel-equipment">
      {SLOT_ORDER.map(slotKey => (
        <EquipmentSlotItem
          key={slotKey}
          slot={slotKey}
          item={slots[slotKey]}
          onHover={(e) => showTooltip(buildItemTooltipPayload(slots[slotKey]), e)}
          onLeave={hideTooltip}
          onUnequip={() => unequip(slotKey)}
        />
      ))}
    </div>
  );
}
```

### Bridge 接入

```typescript
// react-ui-bridge.ts 补充
syncEquipment(slots: EquipmentSlots) {
  equipmentStore.patchState({ slots });
}
```

### 验证清单模板

以下是后续新增面板迁移时的模板项，不计入当前迁移计划剩余任务：

- 渲染结果与原生面板 DOM 结构一致（class name、层级、属性）
- 样式无差异（浅色/深色/手机端三种模式截图对比）
- tooltip 内容和位置一致
- 卸装操作正常发送 socket 消息
- 装备变化时只更新变化的槽位，不重建整个面板
- 面板切换时不丢失其他面板的交互状态

---

## 五、关键技术决策

### 状态管理

- **不引入 Redux/Zustand/Jotai**：继续使用现有的 `createExternalStore` + `useSyncExternalStore`
- 每面板独立 store，通过 bridge 从 network 层推送数据
- 面板内部交互状态（展开/选中/筛选）用 `useState`，不入 store

### 样式方案

- **不引入 CSS-in-JS / Tailwind / CSS Modules**
- 继续使用现有 CSS 文件 + CSS 变量 token 体系
- React 组件输出与原生面板相同的 class name，复用现有样式表
- 新增组件样式写在 `react-ui/styles/` 下，以 `react-ui-` 前缀隔离

### Tooltip / Modal

- 使用 React Portal 渲染到 `#floating-tooltip-root` / `#modal-root`
- 提供 hook API：`useFloatingTooltip()` / `useDetailModal()` / `useConfirmModal()`
- 内部实现复用现有 CSS class，视觉效果不变

### 与 Canvas 地图的关系

- Canvas 渲染层不迁移，保持现有 `renderer/` 体系
- React UI 只负责 DOM 面板，与 Canvas 通过事件/store 通信
- 地图点击 → 更新 store → React 面板响应，不需要直接 DOM 操作

### 性能保障

- 高频更新面板（action-panel）使用 `React.memo` + selector 精确订阅
- tick 推送只更新变化字段，store 做浅比较决定是否通知组件
- 列表使用稳定 key（itemId / slotIndex），避免不必要的 unmount/mount
- 倒计时/进度条用 CSS animation 或 RAF，不逐帧 setState

---

## 六、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 迁移期间新旧系统交互冲突 | per-panel flag 隔离，同一面板只有一个实现活跃 |
| 样式不一致 | 复用相同 class name + 截图对比验证 |
| 性能退化 | 迁移后跑 `pnpm verify:client`，对比渲染帧率 |
| 迁移周期过长，新功能开发受阻 | 按优先级迁移，低频面板可延后；新功能直接用 React 写 |
| 移动端适配遗漏 | 每个面板迁移后必须在 375px 视口验证 |

---

## 七、时间线总览

| 阶段 | 预计工时 | 里程碑 |
|------|----------|--------|
| Phase 0: 基础设施 | 2-3 天 | 第一个 React 面板能嵌入布局 |
| Phase 1: 低复杂度 (5 面板) | 3-4 天 | 验证迁移流程可行 |
| Phase 2: 中复杂度 (7 面板) | 5-7 天 | 主要交互面板完成 |
| Phase 3: 高复杂度 (6 面板) | 7-10 天 | 全部面板完成 |
| Phase 4: 布局系统 | 3-4 天 | 移除适配层 |
| Phase 5: 清理 | 2 天 | 删除旧适配层与 DOM patch 主线，保留生产编排层 |
| **总计** | **22-30 天** | |

---

## 八、迁移后的架构

```
packages/client/src/
├── network/          — socket 生命周期、发包（不变）
├── runtime/          — 客户端运行态、tick 投影（不变）
├── renderer/         — Canvas 2D 渲染（不变）
├── react-ui/         — 18 个面板主 UI 与 SidePanel / HUD shell
│   ├── stores/       — 面板级 store
│   ├── hooks/        — 通用 hook（tooltip, modal, socket sender）
│   ├── panels/       — 18 个面板组件
│   ├── overlays/     — tooltip, modal, toast
│   ├── primitives/   — 基础 UI 原语
│   ├── shell/        — SidePanel, HUD, 小地图静态壳
│   ├── bridge/       — network → store 数据推送
│   └── styles/       — CSS（复用 tokens.css）
├── ui/               — 生产编排层：资产操作、Canvas、弹层生命周期、快捷键、tooltip、服务端意图回调
├── styles/           — 全局 token + 基础样式
├── input/            — 输入处理（不变）
├── game-map/         — 地图交互（不变）
└── content/          — 内容缓存（不变）
```

迁移完成后的当前生产形态：React 接管 18 个面板主 UI 与 SidePanel / HUD shell 渲染，`src/ui/` 保留为服务端意图回调、资产操作、Canvas、弹层生命周期、持久化、快捷键、tooltip 和低风险 fallback 的编排层；dom-patch 体系已废弃并删除。UI 更新优先由 React reconciliation 或局部节点更新保证，禁止回到全量刷新主线。
