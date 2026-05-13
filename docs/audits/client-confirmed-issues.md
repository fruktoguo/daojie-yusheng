# 道劫余生 客户端代码审计 — 已确认问题清单

> 以下所有问题均经过源码逐行验证，确认存在。
> 审计时间：2026-05-13
> 范围：packages/client/src/ 全部 259 文件

---

## P0 — 确定存在且影响稳定性/正确性

### 1. socket 回调执行无异常保护
- 文件：`network/socket-event-registry.ts:59-63`
- 现状：`for (const callback of getCallbacks(event)) { callback(data); }` 无 try/catch
- 影响：任何一个回调抛异常，后续所有回调被跳过。如果 Kick 事件的回调链中某个抛了，disconnect 逻辑可能不执行
- 同样问题：`socket-lifecycle-controller.ts:84,90,94` 的 forEach 回调也无保护

### 2. socket connect() 无并发保护
- 文件：`network/socket.ts:72-84`
- 现状：connect() 直接 disposeSocket → 创建新 socket → 绑定事件，无锁/状态标记
- 影响：快速连续调用（如 token 刷新竞态、用户快速点击重连）可能导致 socket 引用与已绑定事件的实例不一致

### 3. React UI 无 ErrorBoundary
- 文件：`react-ui/` 整个目录
- 现状：搜索 ErrorBoundary 结果为 0
- 影响：React 组件树中任何未捕获异常会导致整个 React overlay 层白屏消失，用户无法恢复

### 4. socket 事件回调只增不减（内存泄漏）
- 文件：`network/socket-lifecycle-controller.ts:34-36`
- 现状：`onKickCallbacks`/`onDisconnectCallbacks`/`onConnectErrorCallbacks` 只有 push，无 off/remove
- 文件：`network/socket-event-registry.ts:77`
- 现状：`getCallbacks(event).push(cb)` 只增不减
- 影响：如果上层代码在组件生命周期中反复注册回调，回调数组无限增长

---

## P1 — 确定存在且影响性能

### 5. mergeTickEntities / replaceVisibleEntities 每 tick 全量深拷贝
- 文件：`game-map/store/map-store.ts:797`
- 现状：`this.entities = entities.map((entry) => decorateObservedEntity(cloneJson(entry), this.player))`
- cloneJson 底层是递归遍历+对象重建（clonePlainValue），每个实体都完整克隆
- 影响：50 个实体/秒 = 每秒 50 次递归深拷贝 + 50 次 decorateObservedEntity 新对象分配

### 6. floating-tooltip move() 写-读-写强制回流
- 文件：`ui/floating-tooltip.ts:241-249`
- 现状：先写 `style.left='0px'` + `style.top='0px'`，再读 `getBoundingClientRect()`，再写 left/top
- 影响：每次鼠标移动触发一次强制同步布局（layout thrashing），高频操作下性能损耗明显

### 7. PanelSystemStore.getState() 每次调用全量克隆
- 文件：`ui/panel-system/store.ts:46-57`
- 现状：getState() 每次 spread 整个 state + 递归 clone slots/panels
- patchState 内调用两次 getState()（previousState + nextState）= 每次状态变更两次全量克隆
- 影响：面板状态频繁变更时（如拖拽、切换）产生大量短命对象

### 8. tileCache 在同一地图内只增不减
- 文件：`game-map/store/map-store.ts:333`
- 现状：tileCache 只在切换地图/实例/reset 时 clear()，同一地图内只 set 不 delete
- 影响：大地图长时间游走，缓存持续增长（200x200 地图理论上限 40000 条目），无 LRU 淘汰

---

## P1 — 确定存在且影响可维护性

### 9. panels.css .tech-side-tab 两处定义属性冲突
- 文件：`styles/panels.css:953` vs `styles/panels.css:1010`
- 第一处：min-height:36px, padding:0 12px, justify-content:space-between, gap:8px
- 第二处：min-height:74px, padding:6px 2px 5px, justify-content:center, gap:4px
- 影响：第二处完全覆盖第一处的四个属性，实际渲染取决于声明顺序，维护时极易出错

### 10. panels.css .market-storage-card 同一 @media 内三次定义
- 文件：`styles/panels.css` 行 5073, 5197, 5507 — 全在 `@media (max-width: 720px)` 内
- 影响：后面的覆盖前面的，前两处是死代码

### 11. 模态框两套实现
- `.detail-modal` + `.detail-modal-card`（panels.css:1471/1489）
- `.ui-modal-layer` + `.ui-modal-card`（ui-modal.css:3/16）
- 几乎相同的 CSS 模式，维护成本翻倍

---

## P1 — 确定存在的事件监听器泄漏

### 12. window 级事件监听器永不移除（已验证 removeEventListener 搜索结果为 0）

| 文件 | 事件 | 说明 |
|------|------|------|
| `ui/detail-modal-host.ts:257` | window keydown | 无 remove |
| `ui/entity-detail-modal.ts:120` | window 自定义事件 | 无 remove |
| `ui/confirm-modal-host.ts:114` | window keydown (capture) | 无 remove |
| `ui/side-panel.ts:416` | window resize | 无 remove |
| `ui/side-panel.ts:417` | window orientationchange | 无 remove |
| `ui/side-panel.ts:418` | visualViewport resize | 无 remove |
| `input/keyboard.ts:17` | window keydown | 构造函数注册，无 destroy |

注：如果这些是单例且生命周期等于页面生命周期，则不算泄漏。但 detail-modal-host 和 confirm-modal-host 如果会被多次实例化，则每次都会累加监听器。

---

## P2 — 确定存在但影响较小

### 13. 中文输入法兼容缺失
- 文件：`input/keyboard.ts:21-28`
- 现状：检查了 HTMLInputElement/HTMLTextAreaElement 过滤，但无 `e.isComposing` 检查
- 影响：中文输入法组合输入时按方向键可能误触发移动（取决于浏览器行为，现代浏览器多数已自动处理）

### 14. z-index 无 token 系统
- 现状：z-index 值散布在多个 CSS 文件中（20/100/120/150/260/320/1200/2000/2100/4500）
- `.floating-tooltip` 和 `.detail-modal` 某处都用 2000，可能撞层
- 影响：弹层叠加时可能出现遮挡错误

### 15. 触控目标过小
- `.map-minimap-modal-close`: 30px
- `.map-minimap-modal-filter`: 30px
- `.map-minimap-modal-source-toggle`: 28px
- 推荐最小 44px（WCAG 2.5.5）

### 16. 移动端安全区缺失
- `#toast` (fixed top:24px) 无 safe-area-inset-top
- `.observe-modal` (fixed) 无 safe-area-inset

### 17. sendEvent 断线时静默丢弃
- 文件：`network/socket.ts:114`
- 现状：`this.socket?.emit(...)` — socket 为 null 时可选链直接跳过
- 影响：断线期间的操作（如使用物品、交易确认）被静默丢弃，用户无感知。不过服务端权威保证了不会出现数据错误，只是体验问题。

### 18. socket-event-registry 双重 as never
- 文件：`network/socket-event-registry.ts:65`
- 现状：`deps.getSocket()?.on(event as never, listener as never)`
- 影响：完全绕过类型检查，如果事件名或回调签名不匹配，编译期无法发现

---

## 排除项（审计后确认不是问题）

| 原始怀疑 | 排除原因 |
|----------|----------|
| cloneJson 用 JSON.parse/stringify | 实际用 clonePlainValue（递归浅拷贝），不是 JSON 序列化 |
| tileCache 无限增长导致 OOM | 切换地图/实例时会 clear()，同一地图内有上限（地图尺寸） |
| keyboard.ts 无 destroy 导致泄漏 | 单例，生命周期等于页面，不算泄漏 |
| PanelSystemStore patchState "两次深拷贝" | 实际是浅拷贝 + spread，不是 JSON 深拷贝，开销可控 |

---

## 修复优先级建议

**立即修（影响线上稳定性）**：
1. #1 socket 回调加 try/catch
2. #3 React UI 加 ErrorBoundary
3. #2 socket connect 加连接锁

**近期修（影响性能和体验）**：
4. #5 entities 深拷贝改为按需浅拷贝或 revision 比较
5. #6 tooltip 用 transform 替代 top/left 避免回流
6. #9 panels.css 合并重复选择器

**计划修（技术债）**：
7. #12 事件监听器补 destroy 链
8. #4 socket 回调数组补 off() 能力
9. #11 modal CSS 合并
10. #14 z-index token 化
