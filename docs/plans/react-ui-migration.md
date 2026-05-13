# React UI 迁移计划

> **目标**：将 `packages/client/src/ui` 的 18 个原生 DOM 面板逐步迁移为 React 组件，消除全量刷新导致的交互丢失问题。
>
> **约束**：不改变现有样式和交互逻辑。视觉效果、操作流程、网络协议保持完全一致。

---

## 一、现状与迁移基础

### 已有基础设施（react-ui 目录）

| 设施 | 状态 | 说明 |
|------|------|------|
| Store 体系 | ✅ 可用 | `createExternalStore` + `useSyncExternalStore`，已有 shellStore/panelDataStore/overlayStore |
| Bridge 层 | ✅ 可用 | `react-ui-bridge.ts` 从原生侧推送数据到 React store |
| UI 原语 | ✅ 可用 | ~20 个基础组件（UiButton, UiList, UiPanelFrame, UiGameItem 等） |
| Overlay 系统 | ✅ 可用 | TooltipLayer, ToastLayer, DetailModalLayer |
| 挂载机制 | ✅ 可用 | `#react-ui-root` overlay 叠加，pointer-events 隔离 |
| Feature Flag | ✅ 可用 | URL 参数 / localStorage / 全局变量三种开关 |
| 样式 Token | ✅ 可用 | react-ui 已复用 `tokens.css` 的 CSS 变量 |

### 需要新建的基础设施

| 设施 | 用途 |
|------|------|
| 面板级 store 工厂 | 每个面板独立 store，避免跨面板更新穿透 |
| Network hook 层 | 封装 socket sender 为 React hook，替代构造函数注入 |
| FloatingTooltip React 版 | 替代当前命令式 tooltip 单例 |
| ConfirmModal React 版 | 替代 confirmModalHost 单例 |
| 面板容器适配器 | 让 React 面板嵌入现有 SidePanel 布局系统 |

---

## 二、迁移策略

### 核心原则

1. **逐面板替换，不做大爆炸重写**：每次只迁移一个面板，新旧共存，通过 feature flag 切换
2. **样式直接复用**：将现有面板的 CSS class 原样保留，React 组件输出相同的 DOM 结构和 class name
3. **交互逻辑平移**：面板内的事件处理、回调、状态转换逻辑直接搬入 React hook，不重新设计
4. **从简单到复杂**：先迁移低复杂度面板验证流程，再攻克高复杂度面板
5. **每个面板迁移后必须通过 A/B 对比验证**：新旧面板在相同数据下渲染结果一致

### 共存机制

```
┌─────────────────────────────────────────────┐
│  SidePanel 布局容器                          │
│  ┌───────────────────────────────────────┐  │
│  │  slot: "inventory"                     │  │
│  │  ┌─ if flag("react-inventory") ─────┐ │  │
│  │  │  <ReactInventoryPanel />          │ │  │
│  │  ├─ else ───────────────────────────┤ │  │
│  │  │  原生 InventoryPanel.mount(el)    │ │  │
│  │  └─────────────────────────────────┘ │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

每个面板通过 `panelAdapter` 注册两个实现，运行时按 flag 选择。迁移完成后删除原生实现。

---

## 三、迁移阶段

### Phase 0：基础设施补全（预计 2-3 天）

**目标**：让第一个 React 面板能正确嵌入现有布局并接收数据。

| 任务 | 文件 | 说明 |
|------|------|------|
| 0.1 面板适配器 | `react-ui/adapter/panel-slot-adapter.tsx` | 将 React 组件包装为与原生面板相同的 mount/unmount 接口，嵌入 SidePanel |
| 0.2 面板级 store | `react-ui/stores/create-panel-store.ts` | 泛型工厂，每面板独立 store + selector hook |
| 0.3 Network hooks | `react-ui/hooks/use-socket-sender.ts` | 从 bridge 获取 socket sender 引用，提供类型安全的发送 hook |
| 0.4 Tooltip 组件 | `react-ui/overlays/FloatingTooltip.tsx` | 复用现有 tooltip 样式，React Portal 实现，支持 pinned 模式 |
| 0.5 Confirm 组件 | `react-ui/overlays/ConfirmModal.tsx` | 复用现有 confirm-modal 样式 |
| 0.6 Detail 组件 | `react-ui/overlays/DetailModal.tsx` | 复用现有 detail-modal 样式，支持 patch 更新 |
| 0.7 per-panel flag | `react-ui/bridge/panel-flags.ts` | 每个面板独立的 feature flag，支持逐个切换 |

**验证**：用一个空壳 React 面板嵌入 SidePanel，确认挂载/卸载/响应式布局正常。

---

### Phase 1：低复杂度面板（预计 3-4 天）

**目标**：验证迁移流程，建立模式。

| 顺序 | 面板 | 行数 | 理由 |
|------|------|------|------|
| 1.1 | changelog-panel | 100 | 纯静态展示，零网络交互，最小风险 |
| 1.2 | world-panel | 360 | 轻量信息展示，3 个事件绑定 |
| 1.3 | loot-panel | 463 | 弹层式，简单回调，验证 overlay 集成 |
| 1.4 | equipment-panel | 494 | 轻量展示 + tooltip，验证 tooltip 集成 |
| 1.5 | tutorial-panel | 613 | 静态引导 + detailModal，验证 modal 集成 |

**每个面板的迁移步骤**：

1. 创建 `react-ui/panels/<name>/` 目录
2. 创建面板 store：`store.ts`（从原生面板的 state 字段提取）
3. 创建主组件：`<Name>Panel.tsx`（输出与原生面板相同的 DOM 结构和 class）
4. 创建 bridge 接入：在 `react-ui-bridge.ts` 补充该面板的数据推送
5. 注册到 panel-slot-adapter
6. A/B 对比验证：同时渲染新旧面板，截图对比
7. 通过后，设置 flag 默认启用 React 版本
8. 观察一段时间后删除原生实现

---

### Phase 2：中复杂度面板（预计 5-7 天）

| 顺序 | 面板 | 行数 | 关键挑战 |
|------|------|------|----------|
| 2.1 | body-training-panel | 832 | 灌注操作 + 进度展示 |
| 2.2 | quest-panel | 936 | inline tooltip + 物品/怪物 chip |
| 2.3 | gm-panel | 920 | 独立入口，不影响主线，13 个回调 |
| 2.4 | suggestion-panel | 1061 | CRUD + 定时刷新 + 投票 |
| 2.5 | settings-panel | 1256 | 多 tab + auth-api + 主题切换 |
| 2.6 | mail-panel | 1384 | 分页列表 + 附件领取 + 详情弹层 |
| 2.7 | chat | 1389 | 实时消息流 + 滚动保持 + IndexedDB |

**chat 面板特殊处理**：
- 滚动保持：使用 `useRef` 记录 scrollTop，新消息到达时判断是否在底部自动滚动
- 消息分桶：保持现有 channel 分桶逻辑，每桶独立 state
- 输入框：`<input>` 是 React 受控组件，天然不会丢焦点

---

### Phase 3：高复杂度面板（预计 7-10 天）

| 顺序 | 面板 | 行数 | 关键挑战 |
|------|------|------|----------|
| 3.1 | technique-panel | 1664 | 星图 Canvas + 详情弹层 + 主修切换 |
| 3.2 | attr-panel | 2521 | 大量计算逻辑 + 属性推送驱动 + 雷达图 |
| 3.3 | market-panel | 2502 | 多视图(auction/browse/trade) + 请求-响应 |
| 3.4 | inventory-panel | 2902 | 高频物品操作 + 阵法子系统 + 冷却倒计时 |
| 3.5 | craft-workbench-modal | 3680 | 炼丹/锻造/强化三视图 + 72 个回调 |
| 3.6 | action-panel | 5522 | 最复杂，每 tick 刷新，3 个子面板 |

**action-panel 拆分策略**：
```
ActionPanel (容器)
├── ActionListView        — 行动列表 + 快捷键
├── SkillManagementView   — 技能管理子面板
├── CombatSettingsView    — 战斗设置子面板
└── SectManagementView    — 门派管理子面板
```

每个子视图独立组件 + 独立 store slice，tick 更新只触发 ActionListView 重渲染，不穿透到设置子面板。

**inventory-panel 冷却倒计时**：
- 使用 `useEffect` + `requestAnimationFrame` 驱动倒计时 UI
- 冷却状态存 store，倒计时渲染用 `useMemo` + 当前时间计算剩余秒数
- 不需要每帧 setState，只在冷却开始/结束时更新 store

---

### Phase 4：布局系统迁移（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| 4.1 SidePanel React 化 | 将桌面端拖拽分栏 + 移动端 tab 切换改为 React 组件 |
| 4.2 HUD React 化 | 顶部状态栏、小地图容器 |
| 4.3 移除 panel-slot-adapter | 所有面板已是 React，不再需要适配层 |
| 4.4 移除原生 DOM patch 体系 | 删除 dom-patch.ts、patchable-panel.ts 及相关工具 |

---

### Phase 5：清理（预计 2 天）

| 任务 | 说明 |
|------|------|
| 5.1 删除 `src/ui/` 目录 | 所有原生面板代码 |
| 5.2 删除 feature flags | 迁移完成，不再需要切换 |
| 5.3 合并样式 | 将 `styles/` 和 `react-ui/styles/` 统一 |
| 5.4 更新 AGENTS.md | 移除 dom-patch 相关规范，更新客户端架构描述 |

---

## 四、单面板迁移模板

以 `equipment-panel` 为例：

### 目录结构

```
react-ui/panels/equipment/
├── EquipmentPanel.tsx          — 主组件
├── EquipmentSlotItem.tsx       — 装备槽位子组件
├── store.ts                    — 面板 store (equipment slots, selected slot)
├── hooks.ts                    — useEquipmentTooltip, useUnequip
└── index.ts                    — 导出
```

### Store 定义

```typescript
// store.ts
import { createExternalStore } from '../../stores/create-external-store';
import type { EquipmentSlots, PlayerState } from '@mud/shared';

interface EquipmentPanelState {
  slots: EquipmentSlots | null;
  playerState: Pick<PlayerState, 'level' | 'realm'> | null;
  hoveredSlot: string | null;
}

export const equipmentStore = createExternalStore<EquipmentPanelState>({
  slots: null,
  playerState: null,
  hoveredSlot: null,
});
```

### 组件实现原则

```typescript
// EquipmentPanel.tsx
// 1. 输出与原生面板完全相同的 DOM 结构
// 2. 使用相同的 CSS class name
// 3. 事件处理逻辑从原生面板直接搬入

export function EquipmentPanel() {
  const { slots, playerState } = useExternalStoreSnapshot(equipmentStore);
  const { showTooltip, hideTooltip } = useFloatingTooltip();
  const unequip = useSocketSender('onUnequip');

  if (!slots) return null;

  // 输出与原生 equipment-panel 相同的 HTML 结构
  return (
    <div className="panel-equipment">
      {SLOT_ORDER.map(slotKey => (
        <EquipmentSlotItem
          key={slotKey}
          slot={slotKey}
          item={slots[slotKey]}
          onHover={(e) => showTooltip(buildItemTooltipPayload(slots[slotKey]), e)}
          onLeave={hideTooltip}
          onUnequip={() => unequip(slotKey)}
        />
      ))}
    </div>
  );
}
```

### Bridge 接入

```typescript
// react-ui-bridge.ts 补充
syncEquipment(slots: EquipmentSlots) {
  equipmentStore.patchState({ slots });
}
```

### 验证清单

- [ ] 渲染结果与原生面板 DOM 结构一致（class name、层级、属性）
- [ ] 样式无差异（浅色/深色/手机端三种模式截图对比）
- [ ] tooltip 内容和位置一致
- [ ] 卸装操作正常发送 socket 消息
- [ ] 装备变化时只更新变化的槽位，不重建整个面板
- [ ] 面板切换时不丢失其他面板的交互状态

---

## 五、关键技术决策

### 状态管理

- **不引入 Redux/Zustand/Jotai**：继续使用现有的 `createExternalStore` + `useSyncExternalStore`
- 每面板独立 store，通过 bridge 从 network 层推送数据
- 面板内部交互状态（展开/选中/筛选）用 `useState`，不入 store

### 样式方案

- **不引入 CSS-in-JS / Tailwind / CSS Modules**
- 继续使用现有 CSS 文件 + CSS 变量 token 体系
- React 组件输出与原生面板相同的 class name，复用现有样式表
- 新增组件样式写在 `react-ui/styles/` 下，以 `react-ui-` 前缀隔离

### Tooltip / Modal

- 使用 React Portal 渲染到 `#floating-tooltip-root` / `#modal-root`
- 提供 hook API：`useFloatingTooltip()` / `useDetailModal()` / `useConfirmModal()`
- 内部实现复用现有 CSS class，视觉效果不变

### 与 Canvas 地图的关系

- Canvas 渲染层不迁移，保持现有 `renderer/` 体系
- React UI 只负责 DOM 面板，与 Canvas 通过事件/store 通信
- 地图点击 → 更新 store → React 面板响应，不需要直接 DOM 操作

### 性能保障

- 高频更新面板（action-panel）使用 `React.memo` + selector 精确订阅
- tick 推送只更新变化字段，store 做浅比较决定是否通知组件
- 列表使用稳定 key（itemId / slotIndex），避免不必要的 unmount/mount
- 倒计时/进度条用 CSS animation 或 RAF，不逐帧 setState

---

## 六、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 迁移期间新旧系统交互冲突 | per-panel flag 隔离，同一面板只有一个实现活跃 |
| 样式不一致 | 复用相同 class name + 截图对比验证 |
| 性能退化 | 迁移后跑 `pnpm verify:client`，对比渲染帧率 |
| 迁移周期过长，新功能开发受阻 | 按优先级迁移，低频面板可延后；新功能直接用 React 写 |
| 移动端适配遗漏 | 每个面板迁移后必须在 375px 视口验证 |

---

## 七、时间线总览

| 阶段 | 预计工时 | 里程碑 |
|------|----------|--------|
| Phase 0: 基础设施 | 2-3 天 | 第一个 React 面板能嵌入布局 |
| Phase 1: 低复杂度 (5 面板) | 3-4 天 | 验证迁移流程可行 |
| Phase 2: 中复杂度 (7 面板) | 5-7 天 | 主要交互面板完成 |
| Phase 3: 高复杂度 (6 面板) | 7-10 天 | 全部面板完成 |
| Phase 4: 布局系统 | 3-4 天 | 移除适配层 |
| Phase 5: 清理 | 2 天 | 删除旧代码 |
| **总计** | **22-30 天** | |

---

## 八、迁移后的架构

```
packages/client/src/
├── network/          — socket 生命周期、发包（不变）
├── runtime/          — 客户端运行态、tick 投影（不变）
├── renderer/         — Canvas 2D 渲染（不变）
├── react-ui/         — 所有 UI（迁移后的唯一 UI 层）
│   ├── stores/       — 面板级 store
│   ├── hooks/        — 通用 hook（tooltip, modal, socket sender）
│   ├── panels/       — 18 个面板组件
│   ├── overlays/     — tooltip, modal, toast
│   ├── primitives/   — 基础 UI 原语
│   ├── layout/       — SidePanel, HUD, 响应式容器
│   ├── bridge/       — network → store 数据推送
│   └── styles/       — CSS（复用 tokens.css）
├── styles/           — 全局 token + 基础样式
├── input/            — 输入处理（不变）
├── game-map/         — 地图交互（不变）
└── content/          — 内容缓存（不变）
```

迁移完成后，`src/ui/` 目录整体删除，dom-patch 体系废弃。UI 更新由 React reconciliation 保证，不再有全量刷新导致交互丢失的可能。
