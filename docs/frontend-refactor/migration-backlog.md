# 前端重构后续待办

## P0：继续压业务 recipe

目标不是再抽标题字号，而是压掉业务层重复布局。

优先级最高的模块：

1. `suggestion-panel.ts`
2. `settings-panel.ts`
3. `inventory-panel.ts`
4. `market-panel.ts`

原因：

- 这几块同时拥有大量卡片、列表、工具栏、表单、详情区
- 是最容易形成统一 recipe 的地方
- 压下来之后，对 `panels.css` 的减量最明显

## P1：建立统一 recipe

建议新增的样式骨架：

- `ui-card`
- `ui-card--interactive`
- `ui-card--muted`
- `ui-pane`
- `ui-list-pane`
- `ui-detail-pane`
- `ui-toolbar-field`
- `ui-form-field`
- `ui-data-table`
- `ui-data-row`
- `ui-meta-block`
- `ui-chip`

## P2：清理双类并存

当前仍有一批模板是：

- 旧业务类名 + 新公共类名并存

例如：

- `suggestion-stat ui-stat-card`
- `settings-modal-shell ui-tabbed-modal-shell`
- `tutorial-modal-shell ui-split-panel-shell`

后续策略：

- 先保证公共层足够稳定
- 再逐步删掉旧业务类上的重复视觉定义
- 最终让旧业务类只保留语义，不再定义完整长相

## P3：文档和验收

后续每轮前端重构都应该补三类验收：

- 是否保持 patch-first，不回退整块重建
- 是否在浅色/深色/手机模式都成立
- 是否真的删掉了业务重复样式，而不是只是新增公共类

## 风险

最大的风险不是“拆文件”，而是：

- 公共层和业务层边界定义不清
- 把不稳定的业务视觉过早塞进公共层
- 导致公共层再次膨胀，重新变成第二个 `panels.css`

因此后续抽取时必须坚持一个原则：

- 公共层只接收已经在至少两个以上业务模块稳定复用的结构
- 单模块专用视觉不要硬塞进去
