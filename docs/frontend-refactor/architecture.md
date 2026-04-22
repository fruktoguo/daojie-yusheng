# 前端重构架构

## 1. 主入口

前端主入口位于：

- `packages/client/src/main.ts`

它负责：

- 加载样式入口
- 初始化 UI 风格配置
- 初始化响应式视口
- 绑定网络事件
- 挂载 HUD、面板、弹层、地图运行时

## 2. 样式层分布

当前样式入口顺序如下：

1. `tokens.css`
2. `base.css`
3. `layout.css`
4. `hud.css`
5. `overlays.css`
6. `ui-primitives.css`
7. `ui-modal.css`
8. `ui-shells.css`
9. `panels.css`
10. `ui-responsive.css`
11. `responsive.css`

含义：

- `tokens.css`
  - 设计 token、字号、颜色、缩放变量。
- `base.css`
  - 页面基础样式与基础排版。
- `layout.css`
  - 三栏主布局、面板容器、移动端壳体。
- `hud.css`
  - HUD 专属样式。
- `overlays.css`
  - 登录层、浮层、提示、遮罩等覆盖层。
- `ui-primitives.css`
  - 通用 section、row、按钮、空态、filter、subtabs、inline-meta。
- `ui-modal.css`
  - 单实例详情弹层骨架与尺寸变体。
- `ui-shells.css`
  - tabbed/split/three-pane/stats/form-actions 等复用壳体。
- `panels.css`
  - 各业务面板和业务弹层自己的专用样式。
- `ui-responsive.css`
  - 公共 UI 骨架的响应式规则。
- `responsive.css`
  - 页面主布局、HUD、地图和业务面板的响应式规则。

## 3. UI 目录结构

UI 代码主要分布在：

- `packages/client/src/ui/`
- `packages/client/src/ui/panels/`
- `packages/client/src/ui/panel-system/`

大致职责：

- `ui/`
  - 弹层、HUD、聊天、小地图、教程、建议反馈、登录、浮动 tooltip 等横向能力。
- `ui/panels/`
  - 属性、背包、装备、功法、任务、市场、行动、世界、设置等主面板。
- `ui/panel-system/`
  - 面板注册、布局配置、能力定义、store 与 panel system 编排。

## 4. 公共 UI 基建

当前已经存在的公共 UI 基建包括：

- `ui-modal-frame.ts`
  - 统一 detail modal 的尺寸和 variant class 解析。
- `ui-primitives.ts`
  - 通用按钮、空态、section、ensureChild 等原语。
- `detail-modal-host.ts`
  - 单实例详情弹层 host。
- `selection-preserver.ts`
  - 局部 patch 时保持选区/焦点连续性。
- `responsive-viewport.ts`
  - 响应式断点与有效布局状态同步。
- `ui-style-config.ts`
  - UI 缩放与字体层级配置。

## 5. 当前重构状态

已经完成：

- 把旧版 UI 公共化迁移到 `packages/client`
- 把公共样式从 `panels.css` 里拆出独立文件
- 让 `inventory / quest / technique / body-training / mail` 等面板改成固定壳体 + 局部 patch

还没有完全完成：

- 业务卡片体系统一
- 列表/详情/表单/工具栏 recipe 彻底统一
- 面板模板类名进一步收敛为更少的语义类
