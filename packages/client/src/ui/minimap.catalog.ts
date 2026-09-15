/**
 * minimap.catalog.ts — 从 minimap.ts 拆分的小地图目录（catalog）域方法。
 *
 * 包含目录构建、目录渲染、显示模式切换、显示场景解析等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: Minimap, ...) 形式导出，
 * 由 minimap.ts 主类中的同名 private 方法一行委托调用。
 */
import {
  type CatalogEntry,
  type DisplayMapScene,
  type DisplaySourceAvailability,
  type MinimapDisplayMode,
  attachCatalogGroup,
  buildFallbackMapMeta,
} from './minimap';
import type { Minimap } from './minimap';
import { getRememberedMarkers, getRememberedTiles, listRememberedMapIds } from '../map-memory';
import {
  getCachedMapMeta,
  getCachedUnlockedMapSnapshot,
  listCachedUnlockedMapSummaries,
} from '../map-static-cache';
import { EMPTY_GROUND_PILES, EMPTY_VISIBLE_TILES } from '../constants/visuals/minimap';
import { t } from './i18n';
export function buildCatalogEntriesImpl(self: Minimap): CatalogEntry[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const entries = new Map<string, CatalogEntry>();
    const currentMapMeta = self.scene?.mapMeta ?? null;
    const currentMapId = currentMapMeta?.id ?? null;

    for (const mapId of listRememberedMapIds()) {
      const existing = entries.get(mapId);
      entries.set(mapId, attachCatalogGroup({
        mapId,
        mapMeta: existing?.mapMeta ?? (mapId === currentMapId ? currentMapMeta : getCachedMapMeta(mapId)),
        hasMemory: true,
        hasUnlock: existing?.hasUnlock ?? false,
      }));
    }

    for (const entry of listCachedUnlockedMapSummaries()) {
      const existing = entries.get(entry.mapId);
      entries.set(entry.mapId, attachCatalogGroup({
        mapId: entry.mapId,
        mapMeta: existing?.mapMeta ?? entry.mapMeta,
        hasMemory: existing?.hasMemory ?? false,
        hasUnlock: true,
      }));
    }

    if (currentMapId) {
      const existing = entries.get(currentMapId);
      entries.set(currentMapId, attachCatalogGroup({
        mapId: currentMapId,
        mapMeta: currentMapMeta,
        hasMemory: existing?.hasMemory ?? false,
        hasUnlock: existing?.hasUnlock ?? !!self.scene?.snapshot,
      }));
    }

    return [...entries.values()].sort((left, right) => {
      const leftCurrentGroup = currentMapId && left.mapGroupId === entries.get(currentMapId)?.mapGroupId;
      const rightCurrentGroup = currentMapId && right.mapGroupId === entries.get(currentMapId)?.mapGroupId;
      if (leftCurrentGroup !== rightCurrentGroup) {
        return leftCurrentGroup ? -1 : 1;
      }
      const groupOrderGap = left.mapGroupOrder - right.mapGroupOrder;
      if (groupOrderGap !== 0) return groupOrderGap;
      const groupNameGap = left.mapGroupName.localeCompare(right.mapGroupName, 'zh-Hans-CN');
      if (groupNameGap !== 0) return groupNameGap;
      const memberOrderGap = left.mapGroupMemberOrder - right.mapGroupMemberOrder;
      if (memberOrderGap !== 0) return memberOrderGap;
      const leftName = left.mapMeta?.name ?? left.mapId;
      const rightName = right.mapMeta?.name ?? right.mapId;
      return leftName.localeCompare(rightName, 'zh-Hans-CN');
    });
  }

  /** renderCatalog：渲染目录。 */
export function renderCatalogImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.modalList) {
      return;
    }

    const allEntries = self.buildCatalogEntries();
    const filteredEntries = allEntries.filter((entry) => {
      if (self.catalogFilter === 'memory') {
        return entry.hasMemory;
      }
      if (self.catalogFilter === 'unlock') {
        return entry.hasUnlock;
      }
      return true;
    });

    const currentMapId = self.scene?.mapMeta?.id ?? null;
    const selectedVisible = filteredEntries.some((entry) => entry.mapId === self.selectedMapId);
    if (!selectedVisible) {
      self.selectedMapId = filteredEntries.find((entry) => entry.mapId === currentMapId)?.mapId
        ?? filteredEntries[0]?.mapId
        ?? allEntries[0]?.mapId
        ?? null;
      self.baseKey = null;
      self.hoveredModalPoint = null;
      self.closeMoveConfirm();
      self.resetModalViewport();
    }

    self.syncModalDisplaySwitch();

    self.modalTabAll?.classList.toggle('active', self.catalogFilter === 'all');
    self.modalTabMemory?.classList.toggle('active', self.catalogFilter === 'memory');
    self.modalTabUnlock?.classList.toggle('active', self.catalogFilter === 'unlock');
    if (self.deleteMemoryBtn) {
      const selectedEntry = allEntries.find((entry) => entry.mapId === self.selectedMapId) ?? null;
      self.deleteMemoryBtn.disabled = !selectedEntry?.hasMemory;
      self.deleteMemoryBtn.setAttribute('aria-label', selectedEntry?.hasMemory
        ? t('minimap.memory.delete-selected-title', { mapName: selectedEntry.mapMeta?.name ?? t('minimap.catalog.unknown-region', undefined) })
        : t('minimap.memory.delete-selected-disabled-title', undefined));
    }
    if (self.deleteAllMemoryBtn) {
      const hasAnyMemory = listRememberedMapIds().length > 0;
      self.deleteAllMemoryBtn.disabled = !hasAnyMemory;
      self.deleteAllMemoryBtn.setAttribute('aria-label', hasAnyMemory
        ? t('minimap.memory.delete-all-title', undefined)
        : t('minimap.memory.delete-all-disabled-title', undefined));
    }

    const catalogContainer = self.modalList;
    const previousScrollTop = catalogContainer.scrollTop;
    const filteredIds = new Set(filteredEntries.map((entry) => entry.mapId));
    const filteredGroupIds = new Set(filteredEntries.map((entry) => entry.mapGroupId));

    if (filteredEntries.length === 0) {
      self.removeAllCatalogNodes();
      catalogContainer.replaceChildren(self.getCatalogEmptyNode());
      return;
    }

    if (self.catalogEmptyNode?.parentElement === catalogContainer) {
      catalogContainer.removeChild(self.catalogEmptyNode);
    }

    for (const existingId of Array.from(self.catalogEntryNodes.keys())) {
      if (!filteredIds.has(existingId)) {
        self.catalogEntryNodes.get(existingId)?.remove();
        self.catalogEntryNodes.delete(existingId);
      }
    }
    for (const existingGroupId of Array.from(self.catalogGroupHeaderNodes.keys())) {
      if (!filteredGroupIds.has(existingGroupId)) {
        self.catalogGroupHeaderNodes.get(existingGroupId)?.remove();
        self.catalogGroupHeaderNodes.delete(existingGroupId);
      }
    }

    let previousNode: HTMLElement | null = null;
    let previousGroupId = '';
    for (const entry of filteredEntries) {
      if (entry.mapGroupId !== previousGroupId) {
        let headerNode = self.catalogGroupHeaderNodes.get(entry.mapGroupId);
        if (!headerNode) {
          headerNode = document.createElement('div');
          headerNode.className = 'map-minimap-modal-group-title';
          self.catalogGroupHeaderNodes.set(entry.mapGroupId, headerNode);
        }
        headerNode.textContent = entry.mapGroupName;
        self.insertCatalogItemNodeInOrder(headerNode, previousNode, catalogContainer);
        previousNode = headerNode;
        previousGroupId = entry.mapGroupId;
      }
      let node = self.catalogEntryNodes.get(entry.mapId);
      if (!node) {
        node = self.createCatalogItemNode(entry);
        self.catalogEntryNodes.set(entry.mapId, node);
      }
      self.updateCatalogItemNode(entry, node);
      self.insertCatalogItemNodeInOrder(node, previousNode, catalogContainer);
      previousNode = node;
    }

    catalogContainer.scrollTop = previousScrollTop;
  }

  /** createCatalogItemNode：创建目录物品节点。 */
export function createCatalogItemNodeImpl(self: Minimap, entry: CatalogEntry): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-minimap-modal-item';
    button.dataset.mapId = entry.mapId;

    const head = document.createElement('div');
    head.className = 'map-minimap-modal-item-head';

    const name = document.createElement('span');
    name.className = 'map-minimap-modal-item-name';
    head.appendChild(name);

    const badges = document.createElement('span');
    badges.className = 'map-minimap-modal-item-badges';
    head.appendChild(badges);

    button.appendChild(head);

    return button;
  }

  /** updateCatalogItemNode：更新目录物品节点。 */
export function updateCatalogItemNodeImpl(self: Minimap, entry: CatalogEntry, node: HTMLButtonElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const signature = [
      entry.mapId,
      entry.mapGroupId,
      entry.mapGroupName,
      entry.mapMeta?.name ?? t('minimap.catalog.unknown-region', undefined),
      entry.hasMemory ? 'memory' : '',
      entry.hasUnlock ? 'unlock' : '',
      entry.mapId === self.selectedMapId ? 'active' : '',
    ].join('|');
    if (node.dataset.catalogSignature === signature) {
      return;
    }
    node.dataset.catalogSignature = signature;

    const nameNode = node.querySelector<HTMLSpanElement>('.map-minimap-modal-item-name');
    if (nameNode) {
      nameNode.textContent = entry.mapMeta?.name ?? t('minimap.catalog.unknown-region', undefined);
    }

    const badgesNode = node.querySelector<HTMLElement>('.map-minimap-modal-item-badges');
    if (badgesNode) {
      const badges: HTMLElement[] = [];
      if (entry.hasMemory) {
        badges.push(self.buildCatalogBadge('memory', t('minimap.catalog.badge.memory', undefined)));
      }
      if (entry.hasUnlock) {
        badges.push(self.buildCatalogBadge('unlock', t('minimap.catalog.badge.unlock', undefined)));
      }
      badgesNode.replaceChildren(...badges);
    }

    node.dataset.mapId = entry.mapId;
    node.classList.toggle('active', entry.mapId === self.selectedMapId);
  }  
  /**
 * insertCatalogItemNodeInOrder：执行insert目录道具NodeIn订单相关逻辑。
 * @param node HTMLButtonElement 参数说明。
 * @param previousNode HTMLButtonElement | null 参数说明。
 * @param container HTMLElement 参数说明。
 * @returns 无返回值，直接更新insert目录道具NodeIn订单相关状态。
 */


export function insertCatalogItemNodeInOrderImpl(self: Minimap, 
    node: HTMLElement,
    previousNode: HTMLElement | null,
    container: HTMLElement,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const anchor = previousNode ? previousNode.nextElementSibling : container.firstElementChild;
    if (anchor === node) {
      return;
    }
    container.insertBefore(node, anchor);
  }

  /** getCatalogEmptyNode：读取目录Empty节点。 */
export function getCatalogEmptyNodeImpl(self: Minimap): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.catalogEmptyNode) {
      self.catalogEmptyNode = document.createElement('div');
      self.catalogEmptyNode.className = 'map-minimap-modal-empty';
    }
    self.catalogEmptyNode.textContent = t('minimap.catalog.empty', undefined);
    return self.catalogEmptyNode;
  }

  /** removeAllCatalogNodes：处理remove All目录Nodes。 */
export function removeAllCatalogNodesImpl(self: Minimap): void {
    self.catalogEntryNodes.forEach((node) => {
      node.remove();
    });
    self.catalogEntryNodes.clear();
    self.catalogGroupHeaderNodes.forEach((node) => {
      node.remove();
    });
    self.catalogGroupHeaderNodes.clear();
  }

  /** buildCatalogBadge：构建目录Badge。 */
export function buildCatalogBadgeImpl(self: Minimap, badgeClass: 'unlock' | 'memory', label: string): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = `map-minimap-modal-badge ${badgeClass}`;
    badge.textContent = label;
    return badge;
  }

  /** getCatalogDescription：读取目录Description。 */
export function getCatalogDescriptionImpl(self: Minimap, entry: CatalogEntry): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const description = entry.mapMeta?.description?.trim();
    if (description) {
      return description;
    }
    if (entry.hasUnlock && entry.hasMemory) {
      return t('minimap.catalog.desc.unlock-memory', undefined);
    }
    if (entry.hasUnlock) {
      return t('minimap.catalog.desc.unlock', undefined);
    }
    return t('minimap.catalog.desc.memory', undefined);
  }

  /** getCurrentDisplayAvailability：读取当前显示Availability。 */
export function getCurrentDisplayAvailabilityImpl(self: Minimap): DisplaySourceAvailability {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.scene) {
      return { hasMemory: false, hasUnlock: false };
    }
    return {
      hasMemory: self.scene.tileCache.size > 0
        || self.scene.visibleTiles.size > 0
        || self.scene.rememberedMarkers.length > 0
        || self.scene.visibleMarkers.length > 0,
      hasUnlock: !!self.scene.snapshot,
    };
  }

  /** getDisplayAvailability：读取显示Availability。 */
export function getDisplayAvailabilityImpl(self: Minimap, selectedMapId: string | null, current: DisplayMapScene | null): DisplaySourceAvailability {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!selectedMapId) {
      return { hasMemory: false, hasUnlock: false };
    }
    if (current && selectedMapId === current.mapId) {
      return {
        hasMemory: current.hasMemory,
        hasUnlock: current.hasUnlock,
      };
    }
    const snapshot = getCachedUnlockedMapSnapshot(selectedMapId);
    const rememberedMarkers = getRememberedMarkers(selectedMapId);
    const tileCache = getRememberedTiles(selectedMapId);
    return {
      hasMemory: tileCache.size > 0 || rememberedMarkers.length > 0,
      hasUnlock: !!snapshot,
    };
  }

  /** resolveModalDisplayMode：解析弹窗显示模式。 */
export function resolveModalDisplayModeImpl(self: Minimap, availability: DisplaySourceAvailability): MinimapDisplayMode {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (self.modalDisplayMode === 'unlock' && availability.hasUnlock) {
      return 'unlock';
    }
    if (self.modalDisplayMode === 'memory' && availability.hasMemory) {
      return 'memory';
    }
    return availability.hasUnlock ? 'unlock' : 'memory';
  }

  /** syncModalDisplaySwitch：同步弹窗显示Switch。 */
export function syncModalDisplaySwitchImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const current = self.getCurrentDisplayScene();
    const selectedMapId = self.selectedMapId ?? current?.mapId ?? null;
    const availability = self.getDisplayAvailability(selectedMapId, current);
    const showSwitch = availability.hasMemory || availability.hasUnlock;
    const nextMode = self.resolveModalDisplayMode(availability);
    self.modalDisplayMode = nextMode;

    self.modalSourceSwitch?.classList.toggle('hidden', !showSwitch);

    if (self.modalSourceMemoryBtn) {
      const active = nextMode === 'memory';
      self.modalSourceMemoryBtn.hidden = !availability.hasMemory;
      self.modalSourceMemoryBtn.disabled = !availability.hasMemory;
      self.modalSourceMemoryBtn.classList.toggle('active', active);
      self.modalSourceMemoryBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      self.modalSourceMemoryBtn.setAttribute('aria-label', availability.hasUnlock
        ? t('minimap.source.memory-title', undefined)
        : t('minimap.source.memory-only-title', undefined));
    }
    if (self.modalSourceUnlockBtn) {
      const active = nextMode === 'unlock';
      self.modalSourceUnlockBtn.hidden = !availability.hasUnlock;
      self.modalSourceUnlockBtn.disabled = !availability.hasUnlock;
      self.modalSourceUnlockBtn.classList.toggle('active', active);
      self.modalSourceUnlockBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      self.modalSourceUnlockBtn.setAttribute('aria-label', availability.hasMemory
        ? t('minimap.source.unlock-title', undefined)
        : t('minimap.source.unlock-only-title', undefined));
    }
  }

  /** setModalDisplayMode：处理set弹窗显示模式。 */
export function setModalDisplayModeImpl(self: Minimap, mode: MinimapDisplayMode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const current = self.getCurrentDisplayScene();
    const selectedMapId = self.selectedMapId ?? current?.mapId ?? null;
    const availability = self.getDisplayAvailability(selectedMapId, current);
    if ((mode === 'memory' && !availability.hasMemory) || (mode === 'unlock' && !availability.hasUnlock)) {
      return;
    }
    if (self.modalDisplayMode === mode) {
      return;
    }
    self.modalDisplayMode = mode;
    self.baseKey = null;
    self.hoveredModalPoint = null;
    self.closeMoveConfirm();
    self.syncModalDisplaySwitch();
    self.scheduleRender();
  }

  /** getCurrentDisplayScene：读取当前显示场景。 */
export function getCurrentDisplaySceneImpl(self: Minimap): DisplayMapScene | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.scene?.mapMeta) {
      return null;
    }
    const availability = self.getCurrentDisplayAvailability();
    return {
      mapId: self.scene.mapMeta.id,
      mapMeta: self.scene.mapMeta,
      snapshot: self.scene.snapshot,
      rememberedMarkers: self.scene.rememberedMarkers,
      visibleMarkers: self.scene.visibleMarkers,
      tileCache: self.scene.tileCache,
      visibleTiles: self.scene.visibleTiles,
      visibleEntities: self.scene.visibleEntities,
      groundPiles: self.scene.groundPiles,
      player: self.scene.player,
      viewRadius: self.scene.viewRadius,
      isCurrent: true,
      memoryVersion: self.scene.memoryVersion,
      displayMode: availability.hasUnlock ? 'unlock' : 'memory',
      hasMemory: availability.hasMemory,
      hasUnlock: availability.hasUnlock,
    };
  }

  /** getModalDisplayScene：读取弹窗显示场景。 */
export function getModalDisplaySceneImpl(self: Minimap): DisplayMapScene | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const current = self.getCurrentDisplayScene();
    if (!self.modalOpen) {
      return null;
    }
    const selectedMapId = self.selectedMapId ?? current?.mapId ?? null;
    if (!selectedMapId) {
      return current;
    }
    if (current && selectedMapId === current.mapId) {
      const mode = self.resolveModalDisplayMode({
        hasMemory: current.hasMemory,
        hasUnlock: current.hasUnlock,
      });
      self.modalDisplayMode = mode;
      return {
        ...current,
        snapshot: mode === 'unlock' ? current.snapshot : null,
        displayMode: mode,
      };
    }

    const snapshot = getCachedUnlockedMapSnapshot(selectedMapId);
    const rememberedMarkers = getRememberedMarkers(selectedMapId);
    const tileCache = getRememberedTiles(selectedMapId);
    const hasMemory = tileCache.size > 0 || rememberedMarkers.length > 0;
    const hasUnlock = !!snapshot;
    if (!hasUnlock && !hasMemory) {
      return current;
    }

    const mode = self.resolveModalDisplayMode({ hasMemory, hasUnlock });
    self.modalDisplayMode = mode;
    const mapMeta = getCachedMapMeta(selectedMapId) ?? buildFallbackMapMeta(selectedMapId, snapshot, tileCache);
    return {
      mapId: selectedMapId,
      mapMeta,
      snapshot: mode === 'unlock' ? snapshot : null,
      rememberedMarkers,
      visibleMarkers: [],
      tileCache,
      visibleTiles: EMPTY_VISIBLE_TILES,
      visibleEntities: [],
      groundPiles: EMPTY_GROUND_PILES,
      player: null,
      viewRadius: 0,
      isCurrent: false,
      memoryVersion: tileCache.size,
      displayMode: mode,
      hasMemory,
      hasUnlock,
    };
  }
