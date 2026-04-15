---
name: ui-performance-author
description: Use this skill when implementing or refactoring UI in this repo, including panels, HUD, modals, overlays, map-side UI, and client/client-next interaction flows, especially when preserving incremental DOM updates, focus/scroll/selection stability, and avoiding full rerenders that interrupt operation.
---

# UI 增量更新

这个 skill 用于处理正式 UI 改动，核心目标有三个：保证操作连续性、保持视觉风格一致、同时兼容浅色/深色与手机模式。这个项目的 UI 不能动不动整块重建、整面板刷新、整页刷空再回填。

适用场景：

- 新增或修改 `legacy/client/src/ui/`、`packages/client-next/src/ui/`
- 调整 HUD、面板、弹层、浮层、聊天、背包、任务、市场、地图侧栏
- 重构 UI 状态流、面板切换、弹层交互、局部刷新策略
- 协议字段变化后回接客户端 UI

## 先看哪里

优先参考这些现有实现：

- `legacy/client/src/ui/panel-system/store.ts`
- `packages/client-next/src/ui/panel-system/store.ts`
- `legacy/client/src/game-map/store/map-store.ts`
- `legacy/client/src/ui/selection-preserver.ts`
- `legacy/client/src/ui/detail-modal-host.ts`
- `legacy/client/src/ui/ui-style-config.ts`
- `legacy/client/src/ui/responsive-viewport.ts`

如果改的是旧客户端，也同时看 next；如果改的是 next，也先确认旧客户端是否需要同步。没有明确要求只改一边时，默认保持两端行为一致。

## 强制流程

1. 先定位当前 UI 是“结构变更”还是“数据变更”。
2. 如果只是数据变化，优先 patch 现有节点：`textContent`、类名、属性、局部子节点、样式宽度、按钮状态。
3. 只有结构真的变了，或者首屏初始化/空态切换/跨大场景重建时，才允许重写较大块 DOM。
4. 涉及列表、网格、日志、任务、背包、市场时，先判断能不能按 item patch，而不是整容器 `innerHTML`。
5. 涉及输入、选中、滚动、展开态、tooltip、弹层时，改动后必须检查这些状态是否被打断；必要时复用 `selection-preserver` 或自行保存恢复。
6. 涉及协议时，优先吃增量包、delta、patch；不要为了省事把高频 UI 改回整包重绘。
7. 先检查视觉是否仍然贴合当前客户端的既有设计语言，不要把单个面板做成另一套风格。
8. 必须分别检查浅色模式、深色模式和手机模式；如果只验证了其中一部分，交付时必须直说。
9. 最后执行最小必要验证；默认可用 `pnpm build`。

## 硬规则

- 禁止把高频 UI 更新做成整面板 `innerHTML` 重写，除非这是初始化、空态切换或结构确实完全变化。
- 禁止为了局部数值变化去销毁并重建整个 HUD、整个面板根节点、整个弹层根节点。
- 玩家正在输入、选中、阅读、滚动时，默认必须保住焦点、选区、滚动位置、展开态和选中项。
- “点击展开详情”统一走单实例详情弹层，不要新增多个互相打架的详情容器。
- 新增 UI 必须延续现有视觉语言：颜色、边框、阴影、留白、字号层级、按钮语气、动效强度要和当前系统一致，除非用户明确要求改风格。
- 颜色与可读性不能只在单一主题下成立；浅色和深色下都必须有足够对比度，不允许出现浅底浅字、深底深字、状态色失真。
- 手机模式不只是“能缩进去”，还要考虑触控命中范围、纵向阅读顺序、安全区、滚动路径、弹层尺寸和固定按钮遮挡。
- 客户端规则展示可以更新，但不能把影响正确性的规则判断下沉到 UI。
- 涉及高频链路时，优先减少重复计算，再减少节点重建，再减少事件重复绑定。
- 如果某个改动必须重建较大块 DOM，交付时必须明确说明原因和影响范围。

## 实现偏好

- 优先更新已缓存节点引用，而不是重复 `querySelector` 全树扫描。
- 优先局部替换受影响的列表项、计数、状态文案、进度条。
- 面板本地状态优先保存在实例字段或现有 store 里，不要每次服务端来包就整面板 reset。
- 服务端若已提供 `PanelDelta`、tile patch、marker add/remove，就沿用增量协议，不要在客户端回退成全量消费。
- 主题、字号、缩放、断点与安全区优先复用现有 `ui-style-config`、`responsive-viewport`、panel-system 能力，不要另起一套零散逻辑。
- 设计表达优先做在现有变量、类名层级和版式体系里，不要为了单个需求临时堆大量内联样式和特判。
- 空态、首次渲染、跨图重建、模态内容完全换型，才是允许较大范围重绘的主要场景。

## 交付时必须说明

- 这次 UI 改动是否保持了增量更新
- 哪些区域是局部 patch，哪些区域仍然需要重建
- 是否检查了焦点/滚动/选区/展开态连续性
- 是否检查了浅色模式、深色模式与手机模式
- 这次是否沿用了现有 UI 风格，还是有意做了新的视觉处理
- 是否执行了 `pnpm build`
