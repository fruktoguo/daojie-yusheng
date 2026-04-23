# packages/client/src/next React UI 重构计划

## 1. 目标

- 在 `packages/client` 内新增 React UI 实现，目录落点为 `packages/client/src/react-ui/`
- 仅重构前端 UI，不改动游戏世界渲染、地图 runtime、tick 逻辑、玩法规则判定
- 重构后的 UI 在功能上与当前 `packages/client` 保持一致
- 最大化复用现有视觉原语、展示逻辑、领域格式化逻辑与协议结构
- 明确禁止整页、整面板、整弹层的全量刷新，避免打断输入、滚动、选中与 hover 操作

## 2. 非目标

- 不在本阶段引入新的玩法、新的系统、新的面板职责
- 不在本阶段改动 `packages/server` / `packages/shared` 协议语义
- 不在本阶段替换 Canvas 地图渲染
- 不在本阶段把整个客户端拆成独立的新 workspace 包

## 3. 为什么不新开独立客户端包

当前 `packages/client` 的世界渲染、socket 连接、`PanelDelta` 分发、地图 runtime、输入处理都集中在现有入口中。第一阶段若直接新开独立包，会立刻引入：

- 双入口
- 双状态源
- 双构建链
- 旧 UI / 新 UI / 世界渲染三方桥接

第一阶段的最优解是在 `packages/client/src/react-ui/` 内新增 React UI 目录，复用现有运行时与协议消费链，只替换 UI 实现。

## 4. 目录规划

建议目录如下：

```text
packages/client/src/react-ui/
  app/
  bridge/
  stores/
  layout/
  primitives/
  overlays/
  panels/
  hooks/
  adapters/
  styles/
```

各目录职责：

- `app/`
  - React UI 顶层装配
  - 入口组件 `ReactUiRoot`
- `bridge/`
  - 与现有 `main.ts` 对接
  - 接收 `PanelDelta`、地图上下文、登录态、壳层状态
- `stores/`
  - React UI 的外部状态仓
  - 按领域拆 slice，不使用“大一统全局 Context”
- `layout/`
  - 桌面/移动端壳层
  - 左右栏、底栏、响应式布局
- `primitives/`
  - 按钮、胶囊、空态、标题块、列表项、基础表单
- `overlays/`
  - Tooltip、详情弹层、Toast、浮层、单实例 modal host
- `panels/`
  - 各业务面板的 React 版本
- `hooks/`
  - 面板局部交互 hook
- `adapters/`
  - 复用旧逻辑的数据适配层
- `styles/`
  - React UI 自身样式入口
  - 只补 React 层必要样式，不重复定义已有 token

## 5. 可复用内容

### 5.1 直接复用

- `packages/client/src/ui/responsive-viewport.ts`
- `packages/client/src/ui/ui-style-config.ts`
- `packages/client/src/constants/ui/*`
- `packages/client/src/styles/tokens.css`
- 现有通用样式 token、色彩、字号、按钮语气
- `packages/client/src/ui/equipment-tooltip.ts`
- `packages/client/src/ui/item-display.ts`
- `packages/client/src/domain-labels.ts`
- `packages/client/src/utils/number.ts`
- `packages/client/src/ui/panel-system/*` 中的布局能力与 profile 语义

### 5.2 包适配层后复用

- 详情弹层单实例语义
  - 参考 `packages/client/src/ui/detail-modal-host.ts`
- 浮动 tooltip 行为
  - 参考 `packages/client/src/ui/floating-tooltip.ts`
- 通用按钮/空态/标题块 class 与视觉
  - 参考 `packages/client/src/ui/ui-primitives.ts`
  - 参考 `packages/client/src/styles/ui-primitives.css`

### 5.3 只复用逻辑基线，不直接复用 DOM 实现

- `inventory-panel.ts`
- `market-panel.ts`
- `action-panel.ts`
- `technique-panel.ts`
- `world-panel.ts`
- `mail-panel.ts`
- `suggestion-panel.ts`

这些文件内部仍混有大量 `replaceChildren`、`innerHTML`、模板字符串渲染与局部 patch 混写，不适合作为 React 组件直接复用，但适合作为行为与字段基线。

## 6. 状态架构

### 6.1 基本原则

- 现阶段仍由现有 `main.ts` 持有 socket、世界 runtime 与协议入口
- React UI 只接管显示层与交互层
- 所有 UI 状态更新都通过外部 store 增量写入
- 禁止使用“整份 `PlayerState` 下发给整个 React 树”的粗粒度更新方式

### 6.2 store 切分

建议拆分为以下 slice：

- `shellStore`
- `attrStore`
- `inventoryStore`
- `equipmentStore`
- `techniqueStore`
- `actionStore`
- `questStore`
- `marketStore`
- `worldPanelStore`
- `mailStore`
- `overlayStore`

### 6.3 bridge 职责

`bridge/` 负责把现有协议处理结果写入 React store：

- `NEXT_S2C_PanelDelta`
- 登录态 / 当前角色
- 响应式壳层能力
- 地图名称、世界摘要、可见实体摘要
- 单实例 modal / tooltip 打开关闭事件

不把 socket 直接暴露给每个 React 面板。

## 7. 禁止全量刷新的硬约束

以下规则必须作为重构红线：

1. 顶层 `ReactUiRoot` 不允许因单一面板字段变化整体重渲染
2. 列表类面板必须 item 级更新，不允许每个包到来时重建整个列表
3. 单实例详情弹层必须 patch 内容，不允许字段变化时整弹层 remount
4. Tooltip 必须单实例 portal，hover 时只换 payload，不重新生成浮层树
5. 输入框、滚动位置、选中项、展开态必须保存在本地 UI 状态或专门 UI store，不能被服务端快照覆盖
6. 高风险区域不得用“重建根节点”的方式做动态更新

## 8. 重点要解决的现有痛点

### 8.1 频繁全量渲染

当前高风险文件：

- `packages/client/src/ui/panels/market-panel.ts`
- `packages/client/src/ui/panels/action-panel.ts`
- `packages/client/src/ui/panels/technique-panel.ts`
- `packages/client/src/ui/panels/inventory-panel.ts`
- `packages/client/src/ui/mail-panel.ts`

这些文件存在以下问题：

- 模板字符串大块渲染
- `replaceChildren`
- `innerHTML`
- 局部 patch 与整体 render 混用
- 弹层频繁 reopen / rerender

### 8.2 操作连续性差

现有问题表现：

- 输入容易被打断
- 列表滚动位置丢失
- 选中项丢失
- 弹层重新打开
- hover 提示闪烁

重构后必须把这些作为一级验收项。

## 9. 迁移顺序

### 阶段 0：基础骨架

- 建立 `src/next/` 目录
- 搭建 React 入口
- 建立 `bridge/` 和 `stores/`
- 保留旧 UI 与新 UI 的切换开关

### 阶段 1：共享原语

- 按钮
- 胶囊 / tag
- 空态
- 标题块
- 单实例 tooltip
- 单实例详情弹层
- Toast

本阶段必须先把视觉和交互原语稳定下来，避免后续面板迁移重复返工。

### 阶段 2：低风险壳层

- 登录 UI
- HUD
- 设置面板
- 布局壳层

### 阶段 3：高复用展示面板

- 背包
- 装备
- 属性
- 物品详情与 hover 展示

### 阶段 4：复杂交互面板

- 行动
- 功法
- 任务
- 世界侧栏

### 阶段 5：最容易打断操作的大面板

- 坊市
- 邮件
- 建议
- NPC 商店 / NPC 委托
- 炼丹 / 强化工作台

### 阶段 6：收尾

- 旧 UI 逐步下线
- `main.ts` 中的 UI 直连逻辑迁入 `bridge/`
- 完成默认切换

## 10. 面板迁移策略

每个面板迁移都按同一流程执行：

1. 先确认旧实现的字段、禁用态、排序、筛选、hover、弹层行为
2. 先做静态结构和视觉对齐
3. 再接协议增量更新
4. 再做交互连续性验证
5. 最后在旧 UI / 新 UI 双实现下对照切换

## 11. 与协议的关系

React UI 重构不改变协议分层：

- `PanelDelta` 仍是主 UI 增量来源
- 世界地图高频动态仍由世界渲染链处理
- UI 只消费当前已有的分层结果

如果某个面板当前缺乏可稳定增量消费的字段，再考虑补桥接层，不先动协议。

## 12. 验收标准

### 12.1 功能对齐

- 新 UI 与旧 UI 在可见功能、字段展示、按钮禁用态、弹层入口上保持一致
- 不新增用户可见玩法差异

### 12.2 连续性

以下问题必须视为阻塞：

- 输入中断
- 滚动跳回顶部
- 选中项丢失
- 弹层频繁重新挂载
- hover tooltip 闪烁

### 12.3 兼容性

- 浅色模式
- 深色模式
- 手机模式

### 12.4 构建验证

- `pnpm build` 必须通过

## 13. 当前执行顺序

第一步先做：

1. React UI 骨架
2. bridge/store
3. Tooltip / 胶囊 / 详情弹层原语

第二步再迁：

1. 背包
2. 装备
3. 属性

第三步再处理最难的：

1. 坊市
2. 邮件
3. 行动 / 功法

---

这份文档是 `packages/client/src/react-ui/` 的重构基线。后续若要进入实施阶段，应先按此文档落基础骨架，再逐面板迁移，不允许跳过 bridge/store 直接把旧 DOM 实现改写成 React。
