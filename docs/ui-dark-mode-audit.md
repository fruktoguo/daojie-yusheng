# UI 深色模式审计（高优先级）

> 状态：审计中，**未开始实现替换**
>
> 范围：`packages/client` 与 `packages/client-next` 的高优先 UI/Canvas/CSS 深色模式兼容问题

## 1. 审计目标

- 盘点高优先 UI 模块中的硬编码颜色与深色模式风险。
- 对齐 `client` / `client-next` 的问题分布与差异。
- 给出 P0 / P1 / P2 风险矩阵。
- 给出 token 替换映射与新增 token 建议。
- 在用户确认前，**不做任何代码替换**。

## 2. 总结结论

### 2.1 当前结论

- 项目已有较完整主题变量体系，核心文件为：
  - `packages/client/src/styles/tokens.css`
  - `packages/client-next/src/styles/tokens.css`
- 现有 token 已覆盖大量基础语义：`--ink-*`、`--surface-*`、`--tooltip-*`、`--radar-*`、`--tech-*`、部分 map/overlay 变量。
- 但高优先模块仍存在大量硬编码颜色，主要分布在：
  - Canvas 绘制逻辑
  - 动态内联样式
  - 注入式 `<style>` 模板
  - HUD/Overlay CSS 渐变与 rgba 直接字面量

### 2.2 风险排序

- **P0**：`technique-constellation-canvas.ts`、`minimap.ts`、`hud.css`、`overlays.css`
- **P1**：`attr-panel.ts`、`gm-panel.ts`
- **P2**：`chat.ts`、`base.css` 之类零散 fallback/装饰项

### 2.3 client / client-next 一致性

- `chat.ts`、`gm-panel.ts`、`technique-constellation-canvas.ts`、`minimap.ts`、`hud.css` 基本一致。
- `attr-panel.ts` 存在**轻度实现差异**：
  - `client` 的 tooltip 样式更丰富，含额外的固定值/百分比 section 强调色；
  - `client-next` 的 attr tooltip 实现较简化，因此硬编码点更少。
- `overlays.css` 两侧基本同构，但 `client-next` 额外包含个别 hover 边框行号偏移；整体仍应按“同一批问题”处理。

## 3. 行级证据（高优先模块）

> 说明：以下表格优先保留**高影响、可直接驱动替换**的证据行。低价值重复色值已在同类项中合并说明。

### 3.1 chat.ts（P2）

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/ui/chat.ts` | 83 | `const COMBAT_HEAL_PILL_COLOR = '#1d6e42';` | 治疗 pill 固定绿色 |
| `packages/client/src/ui/chat.ts` | 85 | `const COMBAT_RESULT_PILL_COLOR = '#6a7282';` | 战斗结果 pill 固定灰蓝 |
| `packages/client/src/ui/chat.ts` | 285, 294 | ``return `rgba(255, 255, 255, ${alpha})`;`` | fallback 强制白色半透明 |
| `packages/client-next/src/ui/chat.ts` | 83, 85, 285, 294 | 同上 | 与 client 一致 |

**风险说明**：
- 影响面不大，但这些颜色不随主题语义变化。
- 更适合映射到聊天语义 token，而不是保留十六进制常量。

### 3.2 gm-panel.ts（P1）

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/ui/panels/gm-panel.ts` | 193 | `empty.style.color = '#666';` | 空态文本固定灰 |
| `packages/client/src/ui/panels/gm-panel.ts` | 331 | `border: 1px solid #444; ... background: rgba(0,0,0,0.2)` | 建议列表容器硬编码边框/背景 |
| `packages/client/src/ui/panels/gm-panel.ts` | 675 | `item.style.borderBottom = '1px solid #333';` | item 分隔线固定深灰 |
| `packages/client/src/ui/panels/gm-panel.ts` | 691, 713 | `#888` | 作者/票数固定灰 |
| `packages/client/src/ui/panels/gm-panel.ts` | 698 | `#aaa` | 描述文案固定灰 |
| `packages/client/src/ui/panels/gm-panel.ts` | 736 | `suggestion.status === 'completed' ? '#0f0' : '#ffcc00'` | 状态色硬编码 |
| `packages/client/src/ui/panels/gm-panel.ts` | 755 | `'#ff4444'` | 删除按钮固定红 |
| `packages/client-next/src/ui/panels/gm-panel.ts` | 193, 331, 675, 691, 698, 713, 736, 755 | 同上 | 与 client 一致 |

**风险说明**：
- 管理面板仍然使用“直接 DOM style”的老模式。
- 深色模式下可读性与品牌风格都不稳定。

### 3.3 attr-panel.ts（P1）

#### client

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/ui/panels/attr-panel.ts` | 98 | ``return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;`` | 动态生成 alpha 色，来源仍是硬编码/非 token 色 |
| 同文件 | 1212 | `stroke="${snapshot.nodes[0]?.color ?? '#ff8a65'}"` | 雷达区域 fallback 色 |
| 同文件 | 1215 | `stroke="rgba(255,255,255,0.9)"` | 节点描边强制白色 |
| 同文件 | 1330 | `snapshot.nodes[0]?.color ?? '#ff8a65'` | patch 路径同样使用 fallback |
| 同文件 | 1462, 1558 | `rgba(34,26,19,...)` | tooltip / radar 卡片边框硬编码 |
| 同文件 | 1465, 1561 | `rgba(0,0,0,...)`, `rgba(255,255,255,...)` | tooltip / radar 阴影与内发光硬编码 |
| 同文件 | 1496 | `#b85c38` | 主数值强调色 |
| 同文件 | 1511, 1513 | `#7a4b22`, `rgba(197, 128, 53, 0.14)` | fixed section 标签色 |
| 同文件 | 1517, 1519 | `#1d5d4f`, `rgba(45, 140, 115, 0.14)` | percent section 标签色 |
| 同文件 | 1532, 1536 | `#8c6742`, `#2f7e6d` | child label 强调色 |

#### client-next

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client-next/src/ui/panels/attr-panel.ts` | 96 | ``return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;`` | 动态 alpha |
| 同文件 | 994, 1112 | `'#ff8a65'` fallback | 雷达区域 fallback 色 |
| 同文件 | 997 | `rgba(255,255,255,0.9)` | 节点描边白色 |
| 同文件 | 1244, 1274 | `rgba(34,26,19,...)` | 边框硬编码 |
| 同文件 | 1247, 1277 | `rgba(0,0,0,...)`, `rgba(255,255,255,...)` | 阴影 / 高光硬编码 |

**差异说明**：
- `client` 比 `client-next` 多出一组 tooltip 语义强调色（棕 / 青色系），因此风险略高。

### 3.4 technique-constellation-canvas.ts（P0）

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/ui/panels/technique-constellation-canvas.ts` | 459 | `ctx.fillStyle = '#020205';` | 背景底色固定 |
| 同文件 | 467 | `rgba(186, 230, 253, alpha)` | 粒子青色 |
| 同文件 | 559, 568 | `rgba(14, 165, 233, ...)`, `rgba(56, 189, 248, ...)` | 已解锁路径蓝光 |
| 同文件 | 562, 571 | `#0284c7`, `#7dd3fc` | 路径阴影色 |
| 同文件 | 578, 591, 600 | 灰紫 / 紫色 progress path | 修炼进度段颜色 |
| 同文件 | 594, 608 | `#9333ea`, `#e879f9` | 进度辉光 |
| 同文件 | 606 | `#fff` | 进度核心白点 |
| 同文件 | 648-651 | 多段 `rgba(125, 211, 252, ...)` | 流光外发光 |
| 同文件 | 659, 661, 666, 668, 673 | 青/白发光与核心白点 | 节点流光 |
| 同文件 | 704-714 | 金 / 紫 / 蓝三套 gradient stops | milestone / progress / unlocked 三类节点配色 |
| 同文件 | 725, 727, 729, 731, 734 | 节点填充与 shadowColor | 节点状态色 |
| 同文件 | 742, 744 | 白色中心高亮 | 激活节点内核 |
| 同文件 | 751, 754 | 选中环描边与 shadowColor | 选中态 |
| 同文件 | 773, 775 | `c1`, `c2` 为蓝/紫魔法阵色 | 背景阵法颜色 |
| `packages/client-next/src/ui/panels/technique-constellation-canvas.ts` | 459-775 | 同上 | 与 client 一致 |

**风险说明**：
- 这是本轮最高风险文件之一。
- 颜色不是单点替换，而是“背景 / 轨迹 / 进度 / 节点 / 选中 / milestone / 魔法阵”整套视觉系统。

### 3.5 minimap.ts（P0）

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/ui/minimap.ts` | 1311 | `this.baseCtx.fillStyle = '#0d0f12';` | 小地图记忆底色 |
| 同文件 | 1319, 1338, 1826 | `?? '#888'` | 地形 fallback 色 |
| 同文件 | 1812 | `rgba(9, 10, 12, 0.8)` / `rgba(10, 11, 13, 0.84)` | 场景总背景 |
| 同文件 | 1837 | `rgba(255, 248, 214, ...)` | 当前视野高亮 |
| 同文件 | 1883 | `rgba(255, 241, 186, ...)` / `rgba(247, 233, 180, ...)` | 玩家视野框 |
| 同文件 | 1896, 1900, 1903 | `#fff7ce`, `#20140a`, `#ffca52` | 玩家点位外圈/描边/核心 |
| 同文件 | 1913 | `rgba(255, 255, 255, 0.14)` | 地图边框 |
| 同文件 | 1933 | `rgba(15, 10, 8, 0.92)` | marker 通用描边 |
| 同文件 | 1959, 1973 | `rgba(255, 241, 208, 0.92)`, `rgba(255, 245, 237, 0.9)` | container / monster 细节描边 |
| 同文件 | 2047-2053 | landmark label 面板深底/金边/浅金字 | 地标标签面板 |
| 同文件 | 2069-2075 | `#ffd9d0`, `#d9f1ff`, `#ffe6bf`, `#f8e4b7` | 不同 marker label 字色 |
| 同文件 | 2094-2095 | `#f7e39a`, `rgba(53, 36, 10, 0.95)` | 地面掉落图标色 |
| 同文件 | 2129-2134 | `rgba(8, 9, 12, ...)`, `rgba(255, 240, 213, ...)`, `rgba(255, 245, 222, ...)` | HUD guide 条 |
| 同文件 | 2161-2167 | `rgba(8, 9, 12, ...)`, `rgba(255, 240, 213, ...)`, `rgba(255, 246, 225, ...)` | hover 信息面板 |
| `packages/client-next/src/ui/minimap.ts` | 1288-2130 | 同类项同构 | 与 client 基本一致，行号前移 |

**风险说明**：
- 这是另一处 P0。
- 颜色覆盖“底图、视野、玩家、marker、label、HUD、hover panel”全链路。

### 3.6 hud.css（P0）

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/styles/hud.css` | 62-73 | `rgba(197, 60, 60, ...)`, `rgba(17, 17, 17, ...)` | realm action 按钮边框/背景 |
| 同文件 | 134-173 | 多个 `rgba(...)` 与 gradient | 资源条轨道与填充 |
| 同文件 | 261 | `linear-gradient(90deg, #c53c3c, #e49b5d)` | HUD meter 渐变 |
| 同文件 | 296, 299, 302 | `#9f2626/#d56a54`、`#285b78/#67a7b8`、`#7b5b14/#d4a447` | HP/Qi/修为三类条颜色 |
| 同文件 | 313 | `text-shadow: ... rgba(255,255,255,0.7)` | 文本可读性依赖固定白高光 |
| 同文件 | 399 | `rgba(248, 248, 245, 0.9)` | unread badge 外圈 |
| 同文件 | 423-436 | `rgba(255,120,120,...)`, `#a33131`, `#8f2626` | IFDian 按钮品牌色硬编码 |
| 同文件 | 445-456 | tutorial 按钮金红渐变 | 教程入口按钮固定主题 |
| 同文件 | 481, 484 | `#12b7f5`, `#181717` | QQ / GitHub 图标原色 |
| 同文件 | 492, 496 | `rgba(197, 60, 60, ...)` | danger 按钮背景 |
| `packages/client-next/src/styles/hud.css` | 62-496 | 同上 | 与 client 一致 |

**风险说明**：
- HUD 是玩家持续注视区；明暗切换后的对比和品牌一致性都受影响。

### 3.7 overlays.css（P0）

| 文件 | 行号 | 证据 | 说明 |
|---|---:|---|---|
| `packages/client/src/styles/overlays.css` | 62-108 | 缩放滑块边框、thumb 渐变、focus outline | 地图工具控件硬编码 |
| 同文件 | 185-186 | 顶部 radial + 深色线性背景 | `#game-stage` 背景 |
| 同文件 | 274-332 | minimap 按钮、frame、title、canvas 边框/背景 | 小地图角落缩略图区 |
| 同文件 | 338-409 | modal 遮罩、窗口、header、按钮 hover | 大地图弹层深色系 |
| 同文件 | 440-488 | 过滤器/列表项/active 状态 | 地图目录列表 |
| 同文件 | 527, 530 | `#f0d38a`, `#91c5d8` | badge 固定金色/蓝色 |
| 同文件 | 550-579 | source switch 背景/边框/hover/active | 视图切换器 |
| 同文件 | 628, 631 | observe modal 顶角暖色渐变与阴影 | 观察弹窗装饰 |
| 同文件 | 760, 764 | `rgba(140, 108, 74, 0.25)`, `rgba(44, 47, 51, 0.18)` | 实体 verdict/empty state |
| `packages/client-next/src/styles/overlays.css` | 62-764 | 同类项同构 | 基本与 client 一致 |

**风险说明**：
- overlays 承担地图与弹窗主视觉，深色模式回归影响大。

## 4. P0 / P1 / P2 风险矩阵

| 优先级 | 模块 | 原因 | 建议顺序 |
|---|---|---|---|
| P0 | `technique-constellation-canvas.ts` | Canvas 主视觉整套硬编码，深色模式最容易割裂 | 1 |
| P0 | `minimap.ts` | 地图/marker/player/HUD/hover 全链路硬编码 | 2 |
| P0 | `styles/hud.css` | HUD 是常驻高频视觉区，渐变与按钮状态多 | 3 |
| P0 | `styles/overlays.css` | 地图弹窗/缩略图/目录/observe 主视觉密集 | 4 |
| P1 | `attr-panel.ts` | 雷达图与 tooltip 注入样式颜色较多 | 5 |
| P1 | `gm-panel.ts` | 内联样式多，但仅管理面板，影响范围较窄 | 6 |
| P2 | `chat.ts` | 常量量少，替换成本低 | 7 |
| P2 | `styles/base.css` | 少量装饰色，不是本轮主风险 | 8 |

## 5. token 替换映射建议

## 5.1 可优先复用的现有 token

| 用途 | 建议 token |
|---|---|
| 主文本 / 高强调文本 | `--ink-black`, `--ink-dark`, `--color-role-body-strong` |
| 次级文本 / 辅助文本 | `--ink-grey`, `--color-role-body-muted`, `--color-role-label` |
| 面板底色 / tooltip 底色 | `--surface-card`, `--surface-card-strong`, `--surface-gradient-tooltip`, `--surface-gradient-tooltip-alt` |
| 常规边框 | `--wash-ink`, `--input-border`, `--input-border-strong` |
| 危险/警告主色 | `--stamp-red`, `--stamp-red-hover` |
| 雷达图网格 | `--radar-grid-stroke`, `--radar-grid-stroke-strong` |
| 功法 badge / progress | `--tech-badge-border`, `--tech-grade-*`, `--tech-category-*`, `--tech-realm-*`, `--tech-progress-*` |
| 遮罩 / 背景暗幕 | `--overlay-backdrop`, `--body-backdrop` |
| 观察/tooltip 细节 | `--observe-*`, `--tooltip-*` |

## 5.2 建议新增 token（高优先）

### Canvas / minimap / technique

| 建议 token | 用途 |
|---|---|
| `--tech-canvas-bg` | 功法星图底色 |
| `--tech-canvas-path-unlocked` | 已解锁路径主发光 |
| `--tech-canvas-path-progress` | 进度路径主发光 |
| `--tech-canvas-node-core` | 已解锁节点核心 |
| `--tech-canvas-node-milestone` | milestone 节点主色 |
| `--tech-canvas-node-selected-ring` | 选中环 |
| `--tech-canvas-magic-circle-primary` | 魔法阵主色 |
| `--tech-canvas-magic-circle-secondary` | 魔法阵副色 |
| `--map-canvas-bg` | minimap / modal canvas 背景 |
| `--map-canvas-vision-fill` | 当前视野高亮 |
| `--map-canvas-player-ring` | 玩家外圈 |
| `--map-canvas-player-core` | 玩家核心 |
| `--map-canvas-marker-stroke` | marker 通用描边 |
| `--map-canvas-label-bg` | 地标标签底色 |
| `--map-canvas-label-border` | 地标标签边框 |
| `--map-canvas-label-ink` | 地标/marker 文字 |
| `--map-canvas-hover-panel-bg` | hover HUD 底色 |
| `--map-canvas-hover-panel-border` | hover HUD 边框 |
| `--map-canvas-hover-panel-ink` | hover HUD 文本 |
| `--map-canvas-loot-fill` | 地面掉落图标 |

### Attr / GM / HUD / Overlay

| 建议 token | 用途 |
|---|---|
| `--attr-tooltip-accent-primary` | attr 主数值强调 |
| `--attr-tooltip-fixed-ink` | fixed section 文本 |
| `--attr-tooltip-fixed-bg` | fixed section 背景 |
| `--attr-tooltip-percent-ink` | percent section 文本 |
| `--attr-tooltip-percent-bg` | percent section 背景 |
| `--attr-tooltip-fixed-child-ink` | fixed 子项 label |
| `--attr-tooltip-percent-child-ink` | percent 子项 label |
| `--gm-suggestion-border` | GM suggestion 容器/分隔线 |
| `--gm-suggestion-muted-ink` | GM suggestion 次级文字 |
| `--gm-suggestion-pending-ink` | GM pending 状态色 |
| `--gm-suggestion-completed-ink` | GM completed 状态色 |
| `--gm-suggestion-danger-ink` | GM remove 状态色 |
| `--hud-bar-hp-start/end` | HP 条渐变 |
| `--hud-bar-qi-start/end` | Qi 条渐变 |
| `--hud-bar-cultivation-start/end` | 修为条渐变 |
| `--hud-link-ifdian-*` | 爱发电按钮边框/文本/渐变 |
| `--hud-link-tutorial-*` | 教程按钮边框/渐变 |
| `--overlay-map-control-*` | 地图缩放器、目录按钮、modal item 等 |
| `--overlay-badge-unlock-bg` | 图鉴 badge |
| `--overlay-badge-memory-bg` | 记忆 badge |

## 5.3 首批替换落点（更可执行的映射）

| 现有硬编码/用途 | 建议替换方向 |
|---|---|
| `chat.ts` 中治疗/结果 pill 常量 | 新增聊天语义 token，如 `--chat-pill-heal-ink`、`--chat-pill-result-ink` |
| `gm-panel.ts` 中 `#666/#888/#aaa` | 统一映射到 `--gm-suggestion-muted-ink`，或先过渡到 `--ink-grey` / `--color-role-body-muted` |
| `gm-panel.ts` 中 `#0f0/#ffcc00/#ff4444` | 映射到 `--gm-suggestion-completed-ink` / `--gm-suggestion-pending-ink` / `--gm-suggestion-danger-ink` |
| `attr-panel.ts` 中 `#ff8a65` fallback | 映射到 `--attr-tooltip-accent-primary` 或新增 `--radar-area-fallback-stroke` |
| `attr-panel.ts` 中 fixed/percent section 棕青色 | 分别映射到 `--attr-tooltip-fixed-*` 与 `--attr-tooltip-percent-*` |
| `technique-constellation-canvas.ts` 背景 `#020205` | 映射到 `--tech-canvas-bg` |
| `technique-constellation-canvas.ts` 蓝/紫/金 glow 组 | 拆为 unlocked / progress / milestone / selected 四套 canvas token |
| `minimap.ts` 中 `#0d0f12`、玩家/hover/guide 颜色 | 收敛到 `--map-canvas-*` 族 token |
| `hud.css` 中 HP/Qi/修为渐变 | 映射到 `--hud-bar-hp-*` / `--hud-bar-qi-*` / `--hud-bar-cultivation-*` |
| `overlays.css` 中 minimap/modal/source switch/badge 色 | 收敛到 `--overlay-map-control-*` 与 badge token |

## 6. 实施建议（尚未执行）

1. **先 token，后替换**：先把缺失 token 加进 `client/client-next` 两套 `tokens.css`。
2. **先 P0 再 P1/P2**：优先 minimap / technique / HUD / overlays。
3. **Canvas 独立抽象**：Canvas 类颜色建议集中成局部 palette 常量，常量值再从 CSS variables / computed styles 注入，而不是继续散落在 draw 函数里。
4. **减少内联 style**：`gm-panel.ts` 优先改 class + CSS token，而不是继续 `element.style.color = '#...'`。
5. **attr tooltip 统一语义色**：`client` 与 `client-next` 先对齐实现层级，再统一 token 命名。

## 6.1 建议迁移顺序（执行计划草案）

1. **定义 token**：先在 `client/client-next` 两侧 `tokens.css` 同步补齐新增 token，不动业务逻辑。
2. **替换 CSS P0**：优先 `hud.css` 与 `overlays.css`，因为验证成本最低、回归最可见。
3. **替换 Canvas P0**：再处理 `technique-constellation-canvas.ts` 与 `minimap.ts`，改为由 palette / token 驱动。
4. **替换 P1 TS 样式**：处理 `attr-panel.ts` 与 `gm-panel.ts` 的 injected style / inline style。
5. **收尾 P2**：最后替换 `chat.ts` 等少量常量与 fallback。
6. **每阶段单独验证**：每做完一类模块，立即做浅色/深色/手机模式回归，不等到全部结束再一起查。

## 6.2 回归与验证建议

- 构建验证：执行仓库标准构建（默认 `pnpm build`）。
- 视觉验证：至少对以下页面做深/浅模式对比截图：
  - 功法星图
  - 小地图缩略图
  - 大地图弹窗
  - HUD 主面板
  - 属性面板
  - GM 面板
- 交互验证：至少覆盖 hover / active / selected / disabled / unread / pending / completed / danger 等状态。
- 跨端一致性验证：同一模块在 `client` 与 `client-next` 中必须对照检查，不接受“只修一边”。
- 性能验证：Canvas 改造后重点观察是否出现帧率下降、过度重绘、阴影/模糊叠加导致的性能退化。

## 7. 手工验收清单

### 7.1 通用

- [ ] 切换浅色 / 深色时，无高亮色突然失真或消失。
- [ ] 所有高优先模块在深色模式下文字对比度可读。
- [ ] 没有“浅色专用金边 / 白描边 / 纸面渐变”直接泄漏到深色模式。

### 7.1.1 可访问性补充

- [ ] 高优先文本与背景至少满足常规阅读对比度要求（建议按 WCAG AA 检查）。
- [ ] 红 / 金 / 青 / 紫这类状态色在深色模式下不只“看得见”，还要能彼此区分。
- [ ] 不依赖单一颜色传达状态；按钮、选中态、hover、完成态最好同时保留边框/明度/阴影差异。
- [ ] 白色高光、描边、内核点在深色背景下不会过曝到刺眼。

### 7.1.2 可量化验收建议

- [ ] 正文级文本与背景建议达到 WCAG AA 对比度目标。
- [ ] 关键状态色（危险、完成、选中、进度）在深色模式下仍能通过明度差明显区分。
- [ ] 同一组件在浅色/深色截图对比中，不出现“信息层级反转”或“按钮边界消失”。
- [ ] Canvas 场景在常见窗口尺寸下不出现因 glow/alpha 叠加造成的局部不可读。

### 7.2 功法星图

- [ ] 背景、路径、进度、节点、milestone、选中环在深色模式下保持分层。
- [ ] hover / selected / unlocked / progress-target 四种状态可区分。
- [ ] 白色高光不会过曝。

### 7.3 小地图 / 大地图

- [ ] minimap 背景与 tile/marker/player 对比充足。
- [ ] landmark / npc / container / monster label 在深色模式下仍清晰。
- [ ] hover HUD 与 guide 条在深色模式下边框/文字可读。
- [ ] 视野框不会过亮刺眼。

### 7.4 HUD

- [ ] HP/Qi/修为条在浅色与深色下都清晰可分。
- [ ] danger 按钮、外链按钮、tutorial/ifdian 按钮悬浮态可读。
- [ ] unread badge 外圈与底色不会与深色背景混成一团。

### 7.5 属性 / GM

- [ ] attr 雷达图描边、节点描边、tooltip section 色块在深色模式下可读。
- [ ] GM suggestion 的 pending/completed/remove 状态色不依赖浅底。

## 8. 待确认风险

- `MINIMAP_MARKER_COLORS` 与 `TILE_MINIMAP_COLORS` 来自共享层；它们本身若仍是浅色基准，也可能需要后续单独审计。
- `client-next` 的 `attr-panel.ts` 与 `client` 实现粒度不同，替换时要先决定是“严格对齐结构”还是“仅对齐主题语义”。
- QQ / GitHub 等品牌色是否允许在深色模式下保留原色，需要产品口径确认；当前建议保留品牌色，但增加外围语义容器 token。
- 当前审计聚焦仓库内主题切换，不覆盖系统级 `prefers-color-scheme` / 浏览器强制深色之类外部环境干预。
- Canvas 模块后续实现时，需要额外验证颜色混合、发光叠加与 alpha 叠加后的真实可读性，不能只按静态 token 命名推断视觉效果。
- 当前文档未绑定责任人与排期；如果要进入正式实现阶段，建议把 P0/P1 模块明确到执行人和分批里程碑。

## 9. 当前状态

- 本文档已完成：
  - 高优先模块证据收敛
  - 风险分级
  - token 映射建议
  - 手工验收清单
- 本文档尚未进入：
  - 实际代码替换
  - 回归验证
  - build / UI 手工截图验证
