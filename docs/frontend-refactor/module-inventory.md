# 前端模块清单

## 1. 样式文件

位于 `packages/client/src/styles/`：

- `tokens.css`
- `base.css`
- `layout.css`
- `hud.css`
- `overlays.css`
- `panels.css`
- `responsive.css`
- `ui-primitives.css`
- `ui-modal.css`
- `ui-shells.css`
- `ui-responsive.css`

## 2. UI 横向能力

位于 `packages/client/src/ui/`：

- `detail-modal-host.ts`
- `ui-modal-frame.ts`
- `ui-primitives.ts`
- `selection-preserver.ts`
- `responsive-viewport.ts`
- `ui-style-config.ts`
- `floating-tooltip.ts`
- `skill-tooltip.ts`
- `stat-preview.ts`
- `item-inline-tooltip.ts`
- `equipment-tooltip.ts`
- `login.ts`
- `hud.ts`
- `chat.ts`
- `side-panel.ts`
- `debug-panel.ts`
- `mail-panel.ts`
- `suggestion-panel.ts`
- `tutorial-panel.ts`
- `changelog-panel.ts`
- `minimap.ts`
- `npc-shop-modal.ts`
- `npc-quest-modal.ts`
- `entity-detail-modal.ts`
- `heaven-gate-modal.ts`

## 3. 主面板

位于 `packages/client/src/ui/panels/`：

- `attr-panel.ts`
- `inventory-panel.ts`
- `equipment-panel.ts`
- `technique-panel.ts`
- `body-training-panel.ts`
- `quest-panel.ts`
- `market-panel.ts`
- `action-panel.ts`
- `loot-panel.ts`
- `settings-panel.ts`
- `world-panel.ts`
- `gm-panel.ts`

附属模块：

- `action-panel-helpers.ts`
- `technique-constellation-canvas.ts`

## 4. 面板系统

位于 `packages/client/src/ui/panel-system/`：

- `bootstrap.ts`
- `capability.ts`
- `layout-profiles.ts`
- `registry.ts`
- `store.ts`
- `types.ts`

## 5. UI 常量

位于 `packages/client/src/constants/ui/`：

- `action.ts`
- `attr-panel.ts`
- `changelog.ts`
- `chat.ts`
- `inventory-panel.ts`
- `inventory.ts`
- `market.ts`
- `panel-system.ts`
- `performance.ts`
- `quest-panel.ts`
- `responsive.ts`
- `skill-tooltip.ts`
- `stat-preview.ts`
- `style.ts`
- `suggestion.ts`
- `technique-constellation.ts`
- `text.ts`
- `tutorial.ts`
- `update.ts`
- `viewport.ts`

## 6. 当前已完成 patch-first 的主要区域

已经完成“固定壳体 + 局部 patch”的主要模块：

- `inventory-panel.ts`
- `quest-panel.ts`
- `technique-panel.ts`
- `body-training-panel.ts`
- `mail-panel.ts`

这些模块当前是前端重构的稳定基座，后续继续压缩样式时应优先复用，不要回退成整块 `innerHTML` 重建。
