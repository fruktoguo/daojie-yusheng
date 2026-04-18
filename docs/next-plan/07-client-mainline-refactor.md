# 07 客户端主链收口

目标：把 client-next 收成稳定的 next 单线前台。

## 当前基线

客户端当前最重的入口和面板文件已经足够说明需要“按状态流和 patch 路径拆”，不是继续把逻辑堆进 `main.ts`：

- `packages/client/src/main.ts`
  - `4301` 行
  - 当前同时混着：应用启动、socket 事件消费、地图/HUD/UI wiring、面板状态、部分 GM/调试连接。
- `packages/client/src/network/socket.ts`
  - `825` 行
  - 当前是 socket 主入口，应继续保持唯一消费层，不让监听逻辑回流到其它文件。
- `packages/client/src/gm.ts`
  - `6262` 行
  - 当前是独立大块，后续应单独判断是否长期保留，不应继续侵入前台主链。
- 主要面板文件：
  - `action-panel.ts` `2846` 行
  - `inventory-panel.ts` `1769` 行
  - `market-panel.ts` `1778` 行
  - `technique-panel.ts` `1387` 行
  - `attr-panel.ts` `1263` 行
  - `quest-panel.ts` `838` 行
  - `settings-panel.ts` `856` 行

客户端还存在几类明确的状态边界：

- 地图与视野
  - `packages/client/src/game-map/*`
- 单实例详情与模态
  - `entity-detail-modal.ts`
  - `detail-modal-host.ts`
  - `npc-shop-modal.ts`
  - `npc-quest-modal.ts`
  - `craft-workbench-modal.ts`
  - `heaven-gate-modal.ts`
- 面板系统与响应式
  - `ui/panel-system/*`
  - `ui/responsive-viewport.ts`
  - `styles/ui-responsive.css`
  - `styles/responsive.css`

## 本阶段原则

- 默认保持 patch-first，不把低频更新改回整块重建。
- `socket.ts` 是唯一 socket 事件消费主入口。
- `main.ts` 应收成编排层，不继续承载具体面板和事件细节。
- 详情弹层继续坚持单实例 host，不新增多个互相打架的详情容器。
- 必须分别考虑：
  - 浅色模式
  - 深色模式
  - 手机模式

## 任务

- [ ] 继续整理 `packages/client/src/main.ts`
- [ ] 继续整理 `packages/client/src/network/socket.ts`
- [ ] 继续整理地图渲染与交互边界
- [ ] 继续整理主面板 patch-first 更新路径
- [ ] 清掉仍依赖大块重建的 UI 区域
- [ ] 收口详情弹层状态来源
- [x] 收口邮件面板状态来源
- [x] 收口建议面板状态来源
- [ ] 收口任务面板状态来源
- [x] 收口市场面板状态来源
- [x] 收口设置面板状态来源
- [ ] 检查 GM 页面、GM 世界查看器、地图编辑器是否长期保留
- [ ] 明确哪些状态只能由 Socket 增量驱动
- [ ] 明确哪些状态允许客户端本地派生缓存
- [ ] 补浅色模式检查
- [ ] 补深色模式检查
- [ ] 补手机模式检查

## 执行顺序

### 第 1 批：把 `main.ts` 收成薄编排层

- [ ] 把 `main.ts` 收成：
  - 应用启动
  - 模块装配
  - 生命周期编排
  - 最薄事件桥接
- [ ] 不再让 `main.ts` 直接承担大量面板 patch 逻辑
- [ ] 不再让 `main.ts` 自己成为协议真源

优先抽走的内容：

- 面板状态同步分发
- 地图外的低频 UI 刷新
- 模态与详情弹层管理

最小验证：

- `pnpm --filter @mud/client-next build`
- `pnpm build`

### 第 2 批：固定 `socket.ts` 为唯一消费层

- [ ] 所有 `NEXT_S2C` 监听统一收在 `packages/client/src/network/socket.ts`
- [ ] `main.ts` 及各面板不再直接各自监听 socket
- [ ] 把事件消费明确分成：
  - 首包 / 低频静态
  - 高频 delta
  - 详情 / 请求返回
  - 结果 / notice / error

重点事件：

- `Bootstrap / InitSession / MapEnter / MapStatic`
- `WorldDelta / SelfDelta / PanelDelta`
- `Detail / TileDetail / AttrDetail`
- `Mail* / Market* / SuggestionUpdate / NpcShop`

最小验证：

- `pnpm --filter @mud/client-next build`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 3 批：收口地图与面板边界

- [ ] 地图运行态继续只由：
  - `game-map/*`
  - `map-static-cache.ts`
  - `map-memory.ts`
  管理
- [ ] 面板运行态继续只由 panel system / 面板模块管理
- [ ] 不让地图状态和面板状态继续在 `main.ts` 里交叉污染

特别注意：

- 移动、视野、小地图、观察详情不要把面板整块抖动重建
- 地图高频状态只消费增量，不回退成大对象重刷

最小验证：

- `pnpm --filter @mud/client-next build`
- 手工回归：
  - 地图移动
  - 小地图路径
  - 观察详情

### 第 4 批：按面板逐个收口状态来源

- [ ] `action-panel.ts`
  - 保持 patch-first
  - 不因行动条、自动战斗、小变更整块重建
- [x] `inventory-panel.ts`
  - 已完成：inventory 状态来源与编排已从 `main.ts` 抽到 `packages/client/src/main-inventory-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`InventoryPanel` 保持原有 patch-first 更新路径
- [x] `market-panel.ts`
  - 只消费 market 相关低频结果与增量更新
  - 已完成：market 低频状态来源、`MarketPanel` 创建与结果分发已从 `main.ts` 抽到 `packages/client/src/main-market-state-source.ts`，`main.ts` 保留 socket 事件注册，`socket.ts` 仍保持唯一消费主入口，`MarketPanel` 内部渲染与请求行为保持不变
- [x] `mail-panel.ts`
  - 已完成：mail 低频状态来源与结果分发已从 `main.ts` 抽到 `packages/client/src/main-mail-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`MailPanel` 保持原有内部请求、渲染与 patch 行为
- [ ] `quest-panel.ts`
  - 只消费 quest 相关状态
  - 首刀已完成：quest 状态源与低频编排已从 `main.ts` 抽到 `packages/client/src/main-quest-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`QuestPanel` 保持 patch-first
- [x] `world-panel.ts` 的低频详情链
  - 已完成：world leaderboard / world-summary 的低频状态来源、`WorldPanel` 回调 wiring 与详情弹层刷新已从 `main.ts` 抽到 `packages/client/src/main-world-summary-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`WorldPanel` 本体渲染不变
- [x] `settings-panel.ts`
  - 已完成：settings 低频编排与状态来源已从 `main.ts` 抽到 `packages/client/src/main-settings-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`SettingsPanel` 保持原有渲染/交互行为
- [x] `suggestion-panel.ts`
  - 已完成：suggestion 低频状态来源与结果分发已从 `main.ts` 抽到 `packages/client/src/main-suggestion-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`SuggestionPanel` 保持原有内部请求、渲染与交互行为
- [ ] `attr-panel.ts` / `technique-panel.ts`
  - 区分按需详情与高频自我状态

最小验证：

- `pnpm --filter @mud/client-next build`
- 手工回归：
  - 打开面板后触发低频刷新
  - 检查滚动/展开态是否保留

### 第 5 批：收口单实例详情与模态系统

- [ ] 继续以 `detail-modal-host.ts` 为唯一详情 host
- [ ] 不让 `entity-detail-modal.ts`、`npc-shop-modal.ts`、`npc-quest-modal.ts`、`craft-workbench-modal.ts` 自己再各起一套状态主线
- [ ] 所有“点击展开详情”继续保持单实例弹层
- [ ] 低频更新不应把已打开弹层整块重建

最小验证：

- `pnpm --filter @mud/client-next build`
- 手工回归：
  - 打开详情弹层
  - 触发一次低频刷新
  - 确认焦点/选区/滚动不丢

### 第 6 批：明确客户端本地派生边界

- [ ] 只能由 Socket 增量驱动的状态：
  - 世界对象与位置
  - 玩家权威状态
  - 面板运行态 revision
  - 邮件/市场/建议等服务端文档状态
- [ ] 允许客户端本地派生缓存的状态：
  - 当前 tab / 子 tab
  - 面板展开态
  - 当前排序/筛选
  - 当前详情弹层打开目标
  - 响应式布局状态

不允许本地派生替代服务端权威的：

- 移动合法性
- 碰撞
- 战斗/结算
- 权限与邮件/市场真实状态

### 第 7 批：补主题与终端形态回归

- [ ] 浅色模式
- [ ] 深色模式
- [ ] 手机模式

至少检查：

- 文本对比度
- 弹层尺寸
- 面板关闭路径
- 点击命中范围
- 滚动路径

最小验证：

- `pnpm --filter @mud/client-next build`
- 参考 [docs/frontend-refactor/verification.md](../frontend-refactor/verification.md)

## 客户端保留/归档检查

- [ ] 判断 `packages/client/src/gm.ts` 是否继续作为长期客户端主链的一部分
- [ ] 判断 `gm-map-editor.ts` / `gm-map-editor-helpers.ts` 是否继续长期保留
- [ ] 判断 `content/editor-catalog.ts` 是否继续作为客户端 generated 数据保留

这一步只做“是否保留”的判断，不在这里做内容/地图真源清理，真源清理由 `08` 负责。

## 收口检查表

- [ ] `main.ts` 不再承担大量具体面板逻辑
- [ ] `socket.ts` 成为唯一 socket 事件消费主入口
- [ ] 主面板都以 patch-first 或局部更新为主
- [ ] 详情弹层继续是单实例 host
- [ ] 主要面板不再依赖旧协议或旧 UI 兼容逻辑
- [ ] 已检查浅色 / 深色 / 手机模式

## 本阶段不做的事

- 不在这里重做协议定义，协议真源由 `02/08` 负责。
- 不在这里处理内容或地图真源清理。
- 不为了视觉改版去顺手重做整套 UI 风格。

## 完成定义

- [ ] 客户端主链不再依赖旧协议或旧 UI 兼容逻辑
- [ ] 主要面板都以 patch-first 或局部更新为主
