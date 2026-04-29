---
name: client-ui-author
description: Use this skill when implementing or refactoring packages/client UI, HUD, panels, modals, overlays, DOM updates, detail popups, responsive layouts, light/dark themes, mobile support, or client UI performance while avoiding full rerenders and reusing existing modules.
---

# 客户端 UI 与增量更新

用于修改 HUD、面板、弹层、overlay 和 DOM UI。核心目标：避免全量刷新，尽量复用现有模块，同时兼容浅色、深色和手机端。

## 商业级 MMO 口径

- UI 必须支撑长时间在线、频繁状态更新、聊天/背包/市场/战斗等多面板并存和移动端操作。
- 高频数据变化只能局部 patch，不能打断玩家输入、滚动、阅读、选择或交易操作。
- 新 UI 要复用现有模块和主题体系，保证浅色、深色、手机端都可用且可维护。
- UI 只呈现状态和收集意图，不承接会影响玩家资产、位置、战斗或交易结果的权威判断。

## 强制流程

1. 先找现有 UI 模块、store、弹层宿主、样式变量、响应式工具和组件模式。
2. 判断这次是结构变化还是数据变化；数据变化优先 patch 现有节点。
3. 列表、日志、背包、任务、市场等优先按 item patch，不整容器 `innerHTML`。
4. 输入、选中、滚动、展开态、tooltip、弹层打开状态必须尽量保持连续。
5. 点击展开详情默认使用单实例详情弹层，支持点击外部关闭。
6. 协议变化后优先消费 delta/patch，不把 UI 消费端改回整包重绘。
7. 新 UI 必须同时考虑浅色模式、深色模式、手机模式和触控命中。

## 硬规则

- 禁止高频 UI 更新整面板、整 HUD、整弹层重建，除非是初始化、空态切换或结构完全变化。
- 禁止为局部数值变化销毁并重建根节点。
- 禁止另起一套和现有 UI 风格、主题变量、断点体系冲突的样式。
- 禁止只在桌面浅色模式下验证可读性。
- 客户端 UI 不能承接影响正确性的服务端规则裁定。

## 实现偏好

- 优先缓存节点引用，减少全树 `querySelector`。
- 优先更新 `textContent`、class、属性、按钮状态、局部子节点。
- 主题、字号、断点、安全区优先复用现有配置。
- 手机端关注弹层高度、滚动路径、固定按钮遮挡、触控命中范围。

## 交付说明

- 哪些区域是局部 patch，哪些区域需要重建及原因。
- 是否满足商业级 MMO 的频繁更新、操作连续、移动端和多主题要求。
- 是否复用了现有 UI 模块和样式体系。
- 是否保持焦点、滚动、选区、展开态连续。
- 是否检查浅色、深色和手机端；未检查要说明风险。
