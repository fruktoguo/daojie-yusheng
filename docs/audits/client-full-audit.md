# 道劫余生 客户端全量代码审计报告

> 审计范围：`packages/client/src/` 全部 259 个 TypeScript/TSX 文件（115,921 行）
> 审计时间：2026-05-13
> 审计维度：CSS样式、网络层、运行时、UI层、地图渲染、React UI、GM工具、渲染器、内容层、输入层、工具函数

---

## 一、CSS 样式问题

### 1.1 重复/冲突选择器（panels.css 重灾区，10633行）

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| panels.css:953 vs 1010 | `.tech-side-tab` 两次定义，min-height/padding/justify-content/gap 完全冲突 | 高 |
| panels.css:973 vs 1019 | `.tech-side-tab.active` 两次定义，box-shadow 互相覆盖 | 高 |
| panels.css:1156 vs 1436 | `.body-training-attr-chip` 两次定义，完全不同属性 | 高 |
| panels.css:1360/1386/1404 | `.body-training-infuse-preview` 三次定义 | 高 |
| panels.css:5073/5197/5507 | `.market-storage-card` 在同一 @media(max-width:720px) 内三次 | 高 |
| panels.css @media 内 | 30+ 个重复选择器散布在媒体查询中 | 高 |
| responsive.css | `.map-shell` 在同一媒体查询里出现三次 | 中 |
| base.css:30 vs overlays.css:215 | `#game-canvas` 重复定义，base.css 冗余 | 低 |
| overlays.css:554 vs 574 | `.building-mode-exit` 两次定义，第二次完全覆盖第一次 | 中 |

### 1.2 模态框两套实现

| 位置 | 问题 |
|------|------|
| panels.css:1471 `.detail-modal` | 与 ui-modal.css:3 `.ui-modal-layer` 几乎相同 |
| panels.css:1489 `.detail-modal-card` | 与 ui-modal.css:16 `.ui-modal-card` 几乎相同 |

应合并为一套，`.detail-modal` 复用 `.ui-modal-layer`。

### 1.3 z-index 混战（无 token 系统）

```
#game-shell:           20
#login-overlay:       100
.observe-modal:       120
.map-minimap-modal:   150 → 移动端260
.detail-modal:        320
.market-trade-modal: 1200
.floating-tooltip:   2000
.detail-modal(另处): 2000  ← 与 tooltip 撞层！
.confirm-modal:      2100
#toast:              4500
```

问题：无统一 token，tooltip 和 modal 共用 2000 会打架。

### 1.4 响应式断点散乱

- responsive.css / ui-responsive.css 用 1180px / 920px（一致）
- panels.css 自行散布 720px、760px、900px、980px、560px 五个断点，无统一 token

### 1.5 移动端安全区缺失

| 位置 | 问题 |
|------|------|
| `.observe-modal` (fixed) | 无 safe-area-inset |
| `#toast` (fixed top:24px) | 无 safe-area-inset-top |
| `.map-minimap-modal-window` | 桌面模式无 safe-area |

### 1.6 触控目标过小

| 选择器 | 实际尺寸 | 推荐最小 |
|--------|----------|----------|
| `.map-minimap-modal-close` | 30px | 44px |
| `.map-minimap-modal-filter` | 30px | 44px |
| `.map-minimap-modal-source-toggle` | 28px | 44px |

### 1.7 设计 token 不一致

| 位置 | 问题 |
|------|------|
| foundation.css | `rgba(17,17,17,0.12)` 硬编码，应用 `var(--wash-ink)` |
| index.css | `rgba(17,17,17,0.14)` 与 `--wash-ink`(0.12) 微妙不同 |
| foundation.css vs prototype.css | 血条颜色不一致：`rgba(207,90,64)` vs `rgba(197,60,60)` |
| 全局 | 无 border-radius token，React UI 用 999px 和 12px 无统一定义 |

### 1.8 溢出风险

- `.sect-member-table` 移动端设了 `overflow-x: visible`，宽内容会水平溢出

---

## 二、网络层问题 (network/)

### 2.1 内存泄漏

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| socket-lifecycle-controller.ts:34-36 | `onKickCallbacks`/`onDisconnectCallbacks`/`onConnectErrorCallbacks` 只 push 无 off() | 严重 |
| socket-event-registry.ts:30,77 | `callbacks` 桶只增不减，无取消订阅能力 | 严重 |
| socket-lifecycle-controller.ts:72-95 | `bind(socket)` 不移除旧监听器，`dispose()` 只清心跳 | 中 |
| socket-event-registry.ts:58-66 | `bindServerEvent` 不清理旧绑定 | 中 |

### 2.2 错误处理缺陷

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| socket-event-registry.ts:59-63 | 回调执行无 try/catch，一个抛异常后续全跳过 | 严重 |
| socket.ts:114 | `sendEvent` 断线时静默丢弃消息，调用方无感知 | 中 |
| socket.ts:114 | `encodeClientEventPayload` 无异常保护 | 中 |
| socket-lifecycle-controller.ts:84 | `onKickCallbacks` 执行无保护，异常会阻止 disconnect | 低 |

### 2.3 竞态条件

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| socket.ts:72-84 | `connect()` 无并发保护，快速连续调用可能导致 socket 引用不一致 | 严重 |
| socket-event-registry.ts:65 | `getSocket()` 时序问题 | 中 |
| socket-lifecycle-controller.ts:73-81 | 重连后心跳竞态 | 中 |
| socket.ts:123-132 | `reconnect()` 不检查 token 有效性 | 低 |

### 2.4 类型安全

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| socket-event-registry.ts:65 | 双重 `as never` 完全绕过类型检查 | 严重 |
| socket-event-registry.ts:43,48 | 不安全类型断言 | 中 |
| socket-send-panel.ts:41,65 | `as object` 和 `as never` 断言 | 中 |

---

## 三、运行时层问题 (runtime/)

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| server-tick.ts:2-6 | 模块级可变状态无响应式通知，UI 层无法自动感知变更 | 中 |
| server-tick.ts:36-37 | 断线时 tick 估算无上限/过期保护，冷却计算可能错误 | 中 |
| server-tick.ts:14 | 无效 tick 输入时仍重置 syncedAt，语义不精确 | 低 |

---

## 四、UI 层问题 (ui/ + panels/ + panel-system/)

### 4.1 事件监听器泄漏

| 位置 | 问题 |
|------|------|
| detail-modal-host.ts:257 | `window.addEventListener('keydown')` 永不移除 |
| confirm-modal-host.ts:114 | `window.addEventListener('keydown', capture:true)` 永不移除 |
| side-panel.ts:416-418 | `window resize/orientationchange` + `visualViewport` 永不移除 |
| chat.ts:869 | `log.addEventListener('scroll')` 无清理路径 |
| equipment-panel.ts:436-448 | `pane.addEventListener` 无 destroy 机制 |
| technique-panel.ts | 构造函数绑定事件无清理 |
| floating-tooltip.ts:71 | 全局事件绑定永不移除 |
| tutorial-panel.ts:180 | addEventListener 无清理 |
| login.ts | 大量 addEventListener 无 destroy |

### 4.2 性能问题

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| floating-tooltip.ts:241-249 | `move()` 写-读-写模式，每次鼠标移动触发强制回流 | 高 |
| panel-system/store.ts:111-119 | `patchState` 每次执行两次深拷贝 | 高 |
| panel-system/capability.ts:22-34 | `readSafeAreaInsets` 无 try/finally，异常时 DOM 泄漏 | 中 |
| chat.ts:1128-1136 | 大量消息时一次性重建大量 DOM | 中 |
| attr-panel.ts | 雷达图每次 update 都重算所有坐标 | 低 |

### 4.3 无障碍缺陷

| 位置 | 问题 |
|------|------|
| detail-modal-host.ts | 无焦点陷阱、无焦点恢复、缺 role="dialog" |
| confirm-modal-host.ts | 无焦点陷阱和焦点恢复 |
| technique-panel.ts:506-509 | 筛选按钮缺 aria-pressed/aria-selected |
| inventory-panel.ts | 物品网格缺 role="grid"/role="gridcell"、缺 aria-label |
| equipment-panel.ts | 装备槽位缺 aria-label |
| chat.ts:851-858 | 频道标签缺 role="tab"/role="tablist"/aria-selected |
| side-panel.ts:288-296 | 标签页按钮缺 role="tab" 和 aria-selected |
| hud.ts | 进度条缺 role="progressbar"/aria-valuenow/aria-valuemax |
| floating-tooltip.ts | 缺 role="tooltip" 和 aria-live |
| login.ts | 表单错误缺 aria-live="polite" 或 role="alert" |
| 所有面板 | 普遍缺少键盘导航支持 |

### 4.4 移动端问题

| 位置 | 问题 |
|------|------|
| detail-modal-host.ts | 缺 overscroll-behavior:contain 防滚动穿透 |
| confirm-modal-host.ts | 同上 |
| chat.ts | 虚拟键盘弹出时输入框可能被遮挡 |
| side-panel.ts | 拖拽阈值 6px 对触摸设备偏小 |

---
