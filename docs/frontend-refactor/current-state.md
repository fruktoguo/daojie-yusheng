# 前端当前状态

## 1. 当前定位

`client-next` 现在更适合被描述为：

- 玩家主链已经基本 next-native
- 已具备独立构建、独立协议消费、独立 UI 基座
- 但还没有达到“前端结构完全收死、可宣称极致可维护”的状态

它已经不是“旧前端的事件名替换版”，但也还不是最终态 UI 基建。

## 2. 已经完成的前端主链收口

从当前代码和仓库级主计划可以确认，前端主链已经完成了这些收口：

- `socket.ts` 已只消费 next 事件
- `main.ts` 的主同步入口围绕 `Bootstrap / WorldDelta / SelfDelta / PanelDelta`
- 主前端线已经明确落在 `packages/client`
- 样式入口已经从单一 `panels.css` 扩成“公共层 + 业务层”
- 面板系统、桌面布局、手机布局、主题/缩放基础能力已经独立成套

## 3. 已完成的 UI 基建

当前已经可视为稳定基建的部分：

- `detail-modal-host.ts`
- `ui-modal-frame.ts`
- `ui-primitives.ts`
- `selection-preserver.ts`
- `responsive-viewport.ts`
- `ui-style-config.ts`
- `ui-primitives.css`
- `ui-modal.css`
- `ui-shells.css`
- `ui-responsive.css`

这批文件现在负责：

- 单实例详情弹层
- 通用 section / row / button / empty
- split/tabbed/three-pane 复用壳体
- 响应式 modal 与 subtabs 公共规则
- 局部 patch 时的交互连续性保留

## 4. 当前前端的真实短板

根据代码检索和现有 gap 文档，当前短板主要是这几类：

### 4.1 仍有整块重建

下面这些区域仍明显存在 `innerHTML` 整块重建或大段模板重刷：

- `world-panel.ts`
- `action-panel.ts`
- `attr-panel.ts`
- `equipment-panel.ts`
- `gm-panel.ts`
- `market-panel.ts`
- `npc-shop-modal.ts`
- `npc-quest-modal.ts`
- `suggestion-panel.ts`
- `settings-panel.ts` 的兑换结果区
- `detail-modal-host.ts` 的 body 装载

这说明 patch-first 已经开始，但还没全覆盖。

### 4.2 业务 recipe 仍不足

虽然基础控件已经抽离，但业务层仍没有完全统一成少量 recipe：

- card
- list-pane
- detail-pane
- toolbar
- form-field
- data-row / data-table

因此业务样式依然偏大。

### 4.3 运行时与 UI 的高频边界仍需继续收死

根据当前同步边界，高频动态链路仍然要继续防止：

- 同一状态被多源驱动
- 非空间更新压平空间动画
- `SelfDelta` 越权碰地图实体
- 面板状态与世界行为之间出现时序错位

### 4.4 手工 UI 回归未闭环

当前只能确认：

- 代码上已经同时考虑桌面 / 手机 / 浅色 / 深色

但还不能确认：

- 这些模式已经做过系统手工回归

## 5. 当前进度判断

按前端侧单独看，当前更合理的描述是：

- `client-next` 主链 ready 度：较高
- 前端结构化程度：中高
- 前端样式可复用性：已建立基座，但业务层还需继续压缩
- 正式替换旧前端的主要阻塞：已经不主要在前端，而在后端 auth/session/bootstrap 和 replace-ready 证明链

## 6. 后续优先级

如果只看前端，下一轮最值得继续做的是：

1. 把业务 UI 压成 recipe，而不是继续只抽标题按钮。
2. 把仍整刷的 modal/list/detail 区继续改成局部 patch。
3. 补一轮真正的浅色 / 深色 / 手机人工回归。
