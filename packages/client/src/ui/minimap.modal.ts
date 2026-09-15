/**
 * minimap.modal.ts — 从 minimap.ts 拆分的小地图弹窗（modal）域方法。
 *
 * 包含弹窗挂载、开关、平移、确认弹层（移动确认/记忆删除）等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: Minimap, ...) 形式导出，
 * 由 minimap.ts 主类中的同名 private 方法一行委托调用。
 */
import { type MapMeta, type Tile } from '@mud/shared';
import type { MinimapScene } from './minimap';
import { Minimap } from './minimap';
import {
  deleteAllRememberedMaps,
  deleteRememberedMap,
  listRememberedMapIds,
} from '../map-memory';
import { detailModalHost } from './detail-modal-host';
import { getViewportRoot } from './responsive-viewport';
import { formatDisplayInteger } from '../utils/number';
import { t } from './i18n';
export function mountModalToBodyImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.modal) {
      return;
    }
    const root = getViewportRoot(document) ?? document.body;
    if (self.modal.parentElement === root) {
      return;
    }
    root.appendChild(self.modal);
  }

  /** isCompactViewport：判断是否Compact视口。 */
export function isCompactViewportImpl(self: Minimap): boolean {
    return window.innerWidth <= 900;
  }

export function syncResponsiveModalChromeImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const catalogVisible = self.isCompactViewport() ? self.mobileCatalogOpen : true;
    if (self.modal) {
      self.modal.dataset.mobileCatalogOpen = catalogVisible ? 'true' : 'false';
    }
    if (self.modalCatalogToggleBtn) {
      self.modalCatalogToggleBtn.classList.toggle('active', catalogVisible);
      self.modalCatalogToggleBtn.setAttribute('aria-expanded', catalogVisible ? 'true' : 'false');
      self.modalCatalogToggleBtn.textContent = catalogVisible
        ? t('minimap.catalog.toggle.collapse', undefined)
        : t('minimap.catalog.toggle.open', undefined);
      self.modalCatalogToggleBtn.setAttribute('aria-label', catalogVisible
        ? t('minimap.catalog.toggle.collapse-title', undefined)
        : t('minimap.catalog.toggle.open-title', undefined));
    }
  }

export function openModalImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.modal) {
      return;
    }
    self.modalOpen = true;
    self.mobileCatalogOpen = !self.isCompactViewport();
    if (!self.selectedMapId) {
      self.selectedMapId = self.scene?.mapMeta?.id ?? null;
    }
    self.resetModalViewport();
    self.renderCatalog();
    self.refreshChrome();
    self.syncResponsiveModalChrome();
    self.modal.classList.remove('hidden');
    self.modal.setAttribute('aria-hidden', 'false');
    self.scheduleRender();
  }

  /** closeModal：关闭弹窗。 */
export function closeModalImpl(self: Minimap): void {
    self.modalOpen = false;
    self.mobileCatalogOpen = false;
    self.hoveredModalPoint = null;
    self.cancelModalPan();
    self.closeMoveConfirm();
    detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    self.modal?.classList.add('hidden');
    self.modal?.setAttribute('aria-hidden', 'true');
    self.syncResponsiveModalChrome();
    self.refreshChrome();
    self.scheduleRender();
  }

  /** resetModalViewport：重置弹窗视口。 */
export function resetModalViewportImpl(self: Minimap): void {
    self.modalZoom = 1;
    self.modalPanX = 0;
    self.modalPanY = 0;
  }

  /** cancelModalPan：取消弹窗Pan。 */
export function cancelModalPanImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (self.modalPanState && self.modalCanvas?.hasPointerCapture(self.modalPanState.pointerId)) {
      self.modalCanvas.releasePointerCapture(self.modalPanState.pointerId);
    }
    self.modalPanState = null;
  }

export function openMoveConfirmImpl(self: Minimap, mapMeta: MapMeta, x: number, y: number, mapId: string): void {
    self.pendingMovePoint = { x, y };
    detailModalHost.open({
      ownerId: Minimap.MOVE_CONFIRM_OWNER,
      title: t('minimap.move-confirm.title', undefined),
      subtitle: t('minimap.coordinate.with-map', { mapName: mapMeta.name, x, y }),
      hint: t('minimap.modal.hint.cancel-outside', undefined),
      renderBody: (body) => {
        body.replaceChildren(
          self.createConfirmMessage(t('minimap.move-confirm.message', undefined)),
          self.createMoveConfirmActions(x, y),
        );
      },
      onAfterRender: (body, signal) => {
        self.bindMoveConfirmActions(body, signal, x, y, mapId);
      },
      onClose: () => {
        self.pendingMovePoint = null;
      },
    });
  }

  /** closeMoveConfirm：关闭移动Confirm。 */
export function closeMoveConfirmImpl(self: Minimap): void {
    self.pendingMovePoint = null;
    detailModalHost.close(Minimap.MOVE_CONFIRM_OWNER);
  }

  /** openDeleteMemoryConfirm：打开Delete Memory Confirm。 */
export function openDeleteMemoryConfirmImpl(self: Minimap, scope: 'selected' | 'all'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const allEntries = self.buildCatalogEntries();
    const selectedMapId = self.selectedMapId;
    const selectedEntry = selectedMapId ? allEntries.find((candidate) => candidate.mapId === selectedMapId) : null;
    const rememberedMapIds = listRememberedMapIds();
    if (scope === 'selected' && (!selectedMapId || !selectedEntry?.hasMemory)) {
      return;
    }
    if (scope === 'all' && rememberedMapIds.length === 0) {
      return;
    }
    const mapName = scope === 'all'
      ? t('minimap.memory.delete-all.subtitle', { count: formatDisplayInteger(rememberedMapIds.length) })
      : (selectedEntry?.mapMeta?.name ?? t('minimap.catalog.unknown-region', undefined));
    const title = scope === 'all'
      ? t('minimap.memory.delete-all.confirm-title', undefined)
      : t('minimap.memory.delete-selected.confirm-title', undefined);
    const message = scope === 'all'
      ? t('minimap.memory.delete-all.message', undefined)
      : t('minimap.memory.delete-selected.message', undefined);
    detailModalHost.open({
      ownerId: Minimap.DELETE_MEMORY_OWNER,
      title,
      subtitle: mapName,
      hint: t('minimap.modal.hint.cancel-outside', undefined),
      renderBody: (body) => {
        body.replaceChildren(
          self.createConfirmMessage(message),
          self.createDeleteMemoryActions(scope),
        );
      },
      onAfterRender: (body, signal) => {
        self.bindDeleteMemoryActions(body, signal, scope, selectedMapId);
      },
    });
  }

  /** createConfirmMessage：创建确认说明。 */
export function createConfirmMessageImpl(self: Minimap, message: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = message;
    section.append(hint);
    return section;
  }

  /** createMoveConfirmActions：创建移动确认按钮区。 */
export function createMoveConfirmActionsImpl(self: Minimap, x: number, y: number): HTMLElement {
    const actions = self.createConfirmActions();
    const cancelButton = self.createConfirmButton(t('minimap.action.cancel', undefined), 'small-btn ghost');
    cancelButton.dataset.mapMoveCancel = 'true';
    const confirmButton = self.createConfirmButton(t('minimap.action.confirm-move', undefined), 'small-btn');
    confirmButton.dataset.mapMoveConfirm = 'true';
    actions.append(cancelButton, confirmButton);
    return actions;
  }

  /** bindMoveConfirmActions：绑定移动确认弹层按钮。 */
export function bindMoveConfirmActionsImpl(self: Minimap, body: HTMLElement, signal: AbortSignal, x: number, y: number, mapId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    body.querySelector<HTMLButtonElement>('[data-map-move-cancel="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      self.closeMoveConfirm();
    }, { signal });

    body.querySelector<HTMLButtonElement>('[data-map-move-confirm="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!self.moveHandler) {
        self.closeMoveConfirm();
        return;
      }
      self.moveHandler(x, y, mapId);
      self.closeMoveConfirm();
    }, { signal });
  }

  /** createDeleteMemoryActions：创建删除记忆按钮区。 */
export function createDeleteMemoryActionsImpl(self: Minimap, scope: 'selected' | 'all'): HTMLElement {
    const actions = self.createConfirmActions();
    const cancelButton = self.createConfirmButton(t('minimap.action.cancel', undefined), 'small-btn ghost');
    cancelButton.dataset.mapMemoryDeleteCancel = 'true';
    const confirmButton = self.createConfirmButton(
      scope === 'all'
        ? t('minimap.action.confirm-delete-all', undefined)
        : t('minimap.action.confirm-delete', undefined),
      'small-btn danger',
    );
    confirmButton.dataset.mapMemoryDeleteConfirm = 'true';
    actions.append(cancelButton, confirmButton);
    return actions;
  }

  /** bindDeleteMemoryActions：绑定删除记忆确认弹层按钮。 */
export function bindDeleteMemoryActionsImpl(self: Minimap, body: HTMLElement, signal: AbortSignal, scope: 'selected' | 'all', selectedMapId: string | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    body.querySelector<HTMLButtonElement>('[data-map-memory-delete-cancel="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    }, { signal });

    body.querySelector<HTMLButtonElement>('[data-map-memory-delete-confirm="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (scope === 'all') {
        self.deleteAllMemory();
      } else if (selectedMapId) {
        self.deleteSelectedMemory(selectedMapId);
      }
      detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    }, { signal });
  }

  /** createConfirmActions：创建确认动作容器。 */
export function createConfirmActionsImpl(self: Minimap): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'ui-modal-footer-actions';
    return actions;
  }

  /** createConfirmButton：创建确认按钮。 */
export function createConfirmButtonImpl(self: Minimap, label: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    button.textContent = label;
    return button;
  }

  /** deleteSelectedMemory：处理delete Selected Memory。 */
export function deleteSelectedMemoryImpl(self: Minimap, mapId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    deleteRememberedMap(mapId);
    self.memoryDeleteHandler?.([mapId]);
    self.applyMemoryDeletionToScene([mapId]);
    self.renderCatalog();
    self.scheduleRender();
  }

  /** deleteAllMemory：处理delete All Memory。 */
export function deleteAllMemoryImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const rememberedMapIds = listRememberedMapIds();
    if (rememberedMapIds.length === 0) {
      return;
    }
    deleteAllRememberedMaps();
    self.memoryDeleteHandler?.(null);
    self.applyMemoryDeletionToScene(null);
    self.renderCatalog();
    self.scheduleRender();
  }

  /** applyMemoryDeletionToScene：同步小地图本地场景中的记忆删除结果。 */
export function applyMemoryDeletionToSceneImpl(self: Minimap, mapIds: readonly string[] | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    self.baseKey = null;
    self.closeMoveConfirm();
    if (self.scene?.mapMeta?.id && (mapIds === null || mapIds.includes(self.scene.mapMeta.id))) {
      const nextScene: MinimapScene = {
        ...self.scene,
        rememberedMarkers: [],
        memoryVersion: self.scene.memoryVersion + 1,
      };
      if (!self.scene.snapshot) {
        const visibleOnlyTileCache = new Map<string, Tile>();
        for (const key of self.scene.visibleTiles) {
          const tile = self.scene.tileCache.get(key);
          if (tile) {
            visibleOnlyTileCache.set(key, tile);
          }
        }
        nextScene.tileCache = visibleOnlyTileCache;
      }
      self.scene = nextScene;
    }
  }  
