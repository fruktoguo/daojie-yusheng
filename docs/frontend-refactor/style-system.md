# 前端样式系统

## 1. 当前公共层

当前前端公共层分成四块：

### `ui-primitives.css`

负责：

- `ui-panel-section`
- `ui-panel-row`
- `ui-panel-label`
- `ui-panel-value`
- `ui-btn`
- `ui-empty-hint`
- `ui-filter-tabs`
- `ui-subtabs`
- `ui-inline-meta-row`
- `ui-modal-footer-actions`

### `ui-modal.css`

负责：

- `ui-modal-layer`
- `ui-modal-card`
- `ui-modal-card--sm/md/lg/xl/wide/full`
- `ui-modal-head`
- `ui-modal-body`
- `ui-modal-actions`
- `ui-modal-section`

### `ui-shells.css`

负责：

- `ui-modal-main-tabs`
- `ui-split-panel-shell`
- `ui-split-panel-tabs`
- `ui-split-panel-content`
- `ui-stats-grid`
- `ui-stat-card`
- `ui-three-pane-layout`
- `ui-pane-head`
- `ui-tab-row`
- `ui-list-toolbar`
- `ui-form-actions`
- `ui-tabbed-modal-shell`
- `ui-inline-actions-end`

### `ui-responsive.css`

负责：

- `ui-modal-card` 的移动端规则
- `ui-modal-actions` 的移动端规则
- `ui-subtabs` 的断点规则

## 2. 为什么样式量仍然大

虽然公共层已经抽出来，但 `panels.css` 仍然很大，原因不是标题、按钮、字号这些基础件没有抽，而是业务层本身仍然有大量专用样式。

主要来源：

- 背包格子的品阶描边、格子密度、名字裁切、操作按钮布局
- 功法星图、层级焦点卡、技能节点和状态层
- 坊市挂单、交易对话框、价格预设、订单卡片
- 建议反馈的会话流、卡片、回复区
- 设置面板的数据表格、预览行、性能卡
- 小地图、天门、世界信息等专用视觉块

这些部分不是简单的 `title/button/toggle` 原语能直接覆盖。

## 3. 当前样式分层原则

### 公共层只放稳定结构

适合进入公共层的内容：

- 所有面板都会反复出现的 section / row / button / empty
- 所有详情弹层都会用到的 modal 结构
- 明确复用的 split / tabbed / three-pane / stats / toolbar / form-actions

### 业务层保留专用视觉

继续留在 `panels.css` 的内容：

- 某个面板独占的视觉
- 强业务语义布局
- 仍未被统一成 recipe 的卡片结构

## 4. 下一阶段真正减量的方法

如果目标是进一步降低前端样式代码量，不能继续只抽“按钮/标题”，而应该抽“业务 recipe”。

优先抽的 recipe：

- `ui-card`
- `ui-card--interactive`
- `ui-card--compact`
- `ui-list-pane`
- `ui-detail-pane`
- `ui-toolbar-field`
- `ui-form-field`
- `ui-data-row`
- `ui-data-table`
- `ui-status-chip`

只有把这些 recipe 做出来，`inventory / market / suggestion / settings / quest` 这些模块的私有样式才会明显下降。

## 5. 当前量化结果

本轮重构后：

- `panels.css`
  - `5828 -> 5451`
- `responsive.css`
  - `1165 -> 1158`

旧的两大文件合计减少 `384` 行。

新增公共样式文件：

- `ui-primitives.css`
  - `250`
- `ui-modal.css`
  - `103`
- `ui-shells.css`
  - `260`
- `ui-responsive.css`
  - `36`

新增公共层合计 `649` 行。

结论：

- 大文件已经被拆层
- 旧文件的共享块已经移出
- 但业务层 recipe 还没做完，所以总量没有大幅下降
