/**
 * 掉落与拾取服务：地面物品堆、容器搜索、拾取窗口、物品过期
 */
import { Injectable } from '@nestjs/common';
import {
  createItemStackSignature,
  GroundItemEntryView,
  GroundItemPileView,
  GROUND_ITEM_EXPIRE_TICKS,
  ItemStack,
  LootWindowItemView,
  LootWindowState,
  PlayerState,
  TechniqueGrade,
  manhattanDistance,
} from '@mud/shared';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { ContainerConfig, DropConfig, MapService } from './map.service';

type LootMessageKind = 'system' | 'loot';

interface LootMessage {
  playerId: string;
  text: string;
  kind: LootMessageKind;
}

interface LootEntry {
  item: ItemStack;
  createdTick: number;
  expiresAtTick?: number;
  visible: boolean;
}

interface GroundPileState {
  sourceId: string;
  mapId: string;
  x: number;
  y: number;
  entries: LootEntry[];
}

interface ContainerState {
  sourceId: string;
  mapId: string;
  containerId: string;
  generatedAtTick?: number;
  refreshAtTick?: number;
  entries: LootEntry[];
  activeSearch?: {
    itemKey: string;
    totalTicks: number;
    remainingTicks: number;
  };
}

interface LootSession {
  playerId: string;
  mapId: string;
  tileX: number;
  tileY: number;
}

interface GroupedLootRow {
  itemKey: string;
  item: ItemStack;
  entries: LootEntry[];
}

interface LootTickResult {
  dirtyPlayers: string[];
}

interface LootActionResult {
  error?: string;
  messages: LootMessage[];
  dirtyPlayers: string[];
  inventoryChanged?: boolean;
}

const CONTAINER_SEARCH_TICKS: Record<TechniqueGrade, number> = {
  mortal: 1,
  yellow: 1,
  mystic: 2,
  earth: 2,
  heaven: 3,
  spirit: 3,
  saint: 4,
  emperor: 4,
};

@Injectable()
export class LootService {
  private readonly mapTicks = new Map<string, number>();
  private readonly groundPiles = new Map<string, GroundPileState>();
  private readonly containers = new Map<string, ContainerState>();
  private readonly sessions = new Map<string, LootSession>();

  constructor(
    private readonly mapService: MapService,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
  ) {}

  /** 每 tick 处理掉落物过期、容器刷新、搜索进度 */
  tick(mapId: string, players: PlayerState[]): LootTickResult {
    const currentTick = (this.mapTicks.get(mapId) ?? 0) + 1;
    this.mapTicks.set(mapId, currentTick);

    const dirtyPlayers = new Set<string>();
    const playerById = new Map(players.map((player) => [player.id, player]));

    for (const [sourceId, pile] of this.groundPiles.entries()) {
      if (pile.mapId !== mapId) {
        continue;
      }
      const remaining = pile.entries.filter((entry) => (entry.expiresAtTick ?? Number.MAX_SAFE_INTEGER) > currentTick);
      if (remaining.length === pile.entries.length) {
        continue;
      }
      if (remaining.length === 0) {
        this.groundPiles.delete(sourceId);
      } else {
        pile.entries = remaining;
      }
      this.markTileViewersDirty(mapId, pile.x, pile.y, dirtyPlayers);
    }

    for (const [sourceId, state] of this.containers.entries()) {
      if (state.mapId !== mapId || state.refreshAtTick === undefined || state.refreshAtTick > currentTick) {
        continue;
      }
      state.entries = [];
      state.generatedAtTick = undefined;
      state.refreshAtTick = undefined;
      state.activeSearch = undefined;
      const container = this.resolveContainerBySourceId(sourceId);
      if (container) {
        this.markTileViewersDirty(mapId, container.x, container.y, dirtyPlayers);
      }
    }

    for (const [playerId, session] of [...this.sessions.entries()]) {
      if (session.mapId !== mapId) {
        continue;
      }

      const player = playerById.get(playerId);
      if (!player) {
        this.sessions.delete(playerId);
        continue;
      }

      if (!this.isPlayerWithinLootRange(player, session.tileX, session.tileY)) {
        this.sessions.delete(playerId);
        dirtyPlayers.add(playerId);
        continue;
      }

      const container = this.mapService.getContainerAt(mapId, session.tileX, session.tileY);
      if (container) {
        const state = this.ensureContainerState(mapId, container);
        if (!state.activeSearch && this.hasHiddenContainerEntries(state.entries)) {
          this.beginContainerSearch(mapId, container);
          dirtyPlayers.add(playerId);
        }
      }

      if (!this.hasAnyLootSource(mapId, session.tileX, session.tileY)) {
        this.sessions.delete(playerId);
        dirtyPlayers.add(playerId);
      }
    }

    for (const state of this.containers.values()) {
      if (state.mapId !== mapId || !state.activeSearch) {
        continue;
      }
      const container = this.resolveContainerBySourceId(state.sourceId);
      if (!container) {
        state.activeSearch = undefined;
        continue;
      }

      state.activeSearch.remainingTicks -= 1;
      this.markTileViewersDirty(mapId, container.x, container.y, dirtyPlayers);
      if (state.activeSearch.remainingTicks > 0) {
        continue;
      }

      const target = state.entries.find((entry) => !entry.visible && createItemStackSignature(entry.item) === state.activeSearch?.itemKey);
      if (target) {
        target.visible = true;
      }
      state.activeSearch = undefined;

      if (this.hasHiddenContainerEntries(state.entries) && this.hasActiveViewerForTile(mapId, container.x, container.y)) {
        this.beginContainerSearch(mapId, container);
      }
    }

    return { dirtyPlayers: [...dirtyPlayers] };
  }

  /** 将物品掉落到地面 */
  dropToGround(mapId: string, x: number, y: number, item: ItemStack): string[] {
    const sourceId = this.buildGroundSourceId(mapId, x, y);
    const currentTick = this.getCurrentTick(mapId);
    const pile = this.groundPiles.get(sourceId) ?? {
      sourceId,
      mapId,
      x,
      y,
      entries: [],
    };
    pile.entries.push({
      item: { ...item },
      createdTick: currentTick,
      expiresAtTick: currentTick + GROUND_ITEM_EXPIRE_TICKS,
      visible: true,
    });
    this.groundPiles.set(sourceId, pile);
    return this.getTileViewerIds(mapId, x, y);
  }

  /** 将物品放入容器 */
  dropToContainer(mapId: string, containerId: string, item: ItemStack): string[] {
    const container = this.mapService.getContainerById(mapId, containerId);
    if (!container) {
      return [];
    }
    const state = this.ensureContainerState(mapId, container);
    state.entries.push({
      item: { ...item },
      createdTick: this.getCurrentTick(mapId),
      visible: true,
    });
    return this.getTileViewerIds(mapId, container.x, container.y);
  }

  /** 打开拾取窗口 */
  openLootWindow(player: PlayerState, x: number, y: number): LootActionResult {
    if (!this.isPlayerWithinLootRange(player, x, y)) {
      return { error: '拿取范围只有 1 格。', messages: [], dirtyPlayers: [] };
    }

    if (!this.hasAnyLootSource(player.mapId, x, y)) {
      return { error: '目标格子没有可拿取的物品或容器。', messages: [], dirtyPlayers: [] };
    }

    const session: LootSession = {
      playerId: player.id,
      mapId: player.mapId,
      tileX: x,
      tileY: y,
    };

    const container = this.mapService.getContainerAt(player.mapId, x, y);
    if (container) {
      this.beginContainerSearch(player.mapId, container);
    }

    this.sessions.set(player.id, session);
    return { messages: [], dirtyPlayers: [player.id] };
  }

  /** 从指定来源拾取物品 */
  takeFromSource(player: PlayerState, sourceId: string, itemKey: string): LootActionResult {
    const session = this.sessions.get(player.id);
    if (!session || session.mapId !== player.mapId) {
      return { error: '请先打开拿取界面。', messages: [], dirtyPlayers: [] };
    }
    if (!this.isPlayerWithinLootRange(player, session.tileX, session.tileY)) {
      this.sessions.delete(player.id);
      return { error: '你已离开拿取范围。', messages: [], dirtyPlayers: [player.id] };
    }

    if (sourceId.startsWith('ground:')) {
      return this.takeFromGround(player, session, sourceId, itemKey);
    }
    if (sourceId.startsWith('container:')) {
      return this.takeFromContainer(player, session, sourceId, itemKey);
    }
    return { error: '未知的拿取来源。', messages: [], dirtyPlayers: [] };
  }

  /** 构建当前拾取窗口的视图数据 */
  buildLootWindow(player: PlayerState): LootWindowState | null {
    const session = this.sessions.get(player.id);
    if (!session || session.mapId !== player.mapId) {
      return null;
    }
    if (!this.isPlayerWithinLootRange(player, session.tileX, session.tileY)) {
      this.sessions.delete(player.id);
      return null;
    }

    const sources: LootWindowState['sources'] = [];
    const groundSourceId = this.buildGroundSourceId(session.mapId, session.tileX, session.tileY);
    const pile = this.groundPiles.get(groundSourceId);
    if (pile && pile.entries.length > 0) {
      sources.push({
        sourceId: groundSourceId,
        kind: 'ground',
        title: '地面物品',
        searchable: false,
        items: this.buildLootWindowItems(pile.entries),
        emptyText: '地面上已经没有东西了。',
      });
    }

    const container = this.mapService.getContainerAt(session.mapId, session.tileX, session.tileY);
    if (container) {
      const state = this.ensureContainerState(session.mapId, container);
      const items = this.buildVisibleLootWindowItems(state.entries);
      sources.push({
        sourceId: this.buildContainerSourceId(session.mapId, container.id),
        kind: 'container',
        title: container.name,
        desc: container.desc,
        grade: container.grade,
        searchable: true,
        search: state.activeSearch
          ? {
              totalTicks: state.activeSearch.totalTicks,
              remainingTicks: state.activeSearch.remainingTicks,
              elapsedTicks: state.activeSearch.totalTicks - state.activeSearch.remainingTicks,
            }
          : undefined,
        items,
        emptyText: this.hasHiddenContainerEntries(state.entries)
          ? '正在翻找，每完成一轮搜索会显露一件物品。'
          : '容器里已经空了。',
      });
    }

    if (sources.length === 0) {
      this.sessions.delete(player.id);
      return null;
    }

    return {
      tileX: session.tileX,
      tileY: session.tileY,
      title: `拿取 · (${session.tileX}, ${session.tileY})`,
      sources,
    };
  }

  /** 获取玩家视野内的地面物品堆视图 */
  getVisibleGroundPiles(viewer: PlayerState, visibleKeys: Set<string>): GroundItemPileView[] {
    const result: GroundItemPileView[] = [];
    for (const pile of this.groundPiles.values()) {
      if (pile.mapId !== viewer.mapId || pile.entries.length === 0) {
        continue;
      }
      if (!visibleKeys.has(`${pile.x},${pile.y}`)) {
        continue;
      }
      result.push({
        sourceId: pile.sourceId,
        x: pile.x,
        y: pile.y,
        items: this.buildGroundItemEntries(pile.entries),
      });
    }
    result.sort((left, right) => (left.y - right.y) || (left.x - right.x));
    return result;
  }

  /** 获取投影坐标系下的可见地面物品堆（用于跨地图视野） */
  getProjectedVisibleGroundPiles(
    sourceMapId: string,
    visibleKeys: Set<string>,
    projectPoint: (x: number, y: number) => { x: number; y: number } | null,
  ): GroundItemPileView[] {
    const result: GroundItemPileView[] = [];
    for (const pile of this.groundPiles.values()) {
      if (pile.mapId !== sourceMapId || pile.entries.length === 0) {
        continue;
      }
      const projected = projectPoint(pile.x, pile.y);
      if (!projected || !visibleKeys.has(`${projected.x},${projected.y}`)) {
        continue;
      }
      result.push({
        sourceId: pile.sourceId,
        x: projected.x,
        y: projected.y,
        items: this.buildGroundItemEntries(pile.entries),
      });
    }
    result.sort((left, right) => (left.y - right.y) || (left.x - right.x));
    return result;
  }

  private takeFromGround(player: PlayerState, session: LootSession, sourceId: string, itemKey: string): LootActionResult {
    const expectedSourceId = this.buildGroundSourceId(session.mapId, session.tileX, session.tileY);
    if (sourceId !== expectedSourceId) {
      return { error: '当前拿取界面与目标地面物品不一致。', messages: [], dirtyPlayers: [] };
    }

    const pile = this.groundPiles.get(sourceId);
    if (!pile || pile.entries.length === 0) {
      return { error: '地面物品已经被拿走了。', messages: [], dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY) };
    }

    const row = this.groupLootEntries(pile.entries).find((entry) => entry.itemKey === itemKey);
    if (!row) {
      return { error: '目标物品已经不存在。', messages: [], dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY) };
    }
    if (!this.canAddItems(player, row.entries.map((entry) => entry.item))) {
      return { error: '背包空间不足，无法拿取该物品。', messages: [], dirtyPlayers: [] };
    }

    this.addItems(player, row.entries.map((entry) => entry.item));
    const keySet = new Set(row.entries);
    pile.entries = pile.entries.filter((entry) => !keySet.has(entry));
    if (pile.entries.length === 0) {
      this.groundPiles.delete(sourceId);
    }

    return {
      messages: [{
        playerId: player.id,
        text: `你拾起了 ${row.item.name} x${row.item.count}。`,
        kind: 'loot',
      }],
      dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      inventoryChanged: true,
    };
  }

  private takeFromContainer(player: PlayerState, session: LootSession, sourceId: string, itemKey: string): LootActionResult {
    const container = this.mapService.getContainerAt(session.mapId, session.tileX, session.tileY);
    if (!container) {
      return { error: '该格子当前没有容器。', messages: [], dirtyPlayers: [player.id] };
    }

    const expectedSourceId = this.buildContainerSourceId(session.mapId, container.id);
    if (sourceId !== expectedSourceId) {
      return { error: '当前拿取界面与目标容器不一致。', messages: [], dirtyPlayers: [] };
    }

    const state = this.ensureContainerState(session.mapId, container);
    const row = this.groupLootEntries(state.entries.filter((entry) => entry.visible)).find((entry) => entry.itemKey === itemKey);
    if (!row) {
      return { error: '目标物品已经被其他人拿走了。', messages: [], dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY) };
    }
    if (!this.canAddItems(player, row.entries.map((entry) => entry.item))) {
      return { error: '背包空间不足，无法拿取该物品。', messages: [], dirtyPlayers: [] };
    }

    this.addItems(player, row.entries.map((entry) => entry.item));
    const keySet = new Set(row.entries);
    state.entries = state.entries.filter((entry) => !keySet.has(entry));

    return {
      messages: [{
        playerId: player.id,
        text: `你从 ${container.name} 中拿走了 ${row.item.name} x${row.item.count}。`,
        kind: 'loot',
      }],
      dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      inventoryChanged: true,
    };
  }

  private hasAnyLootSource(mapId: string, x: number, y: number): boolean {
    const pile = this.groundPiles.get(this.buildGroundSourceId(mapId, x, y));
    if (pile && pile.entries.length > 0) {
      return true;
    }
    return Boolean(this.mapService.getContainerAt(mapId, x, y));
  }

  private buildGroundItemEntries(entries: LootEntry[]): GroundItemEntryView[] {
    return this.groupLootEntries(entries).map((entry) => ({
      itemKey: entry.itemKey,
      name: entry.item.name,
      count: entry.item.count,
    }));
  }

  private buildLootWindowItems(entries: LootEntry[]): LootWindowItemView[] {
    return this.groupLootEntries(entries).map((entry) => ({
      itemKey: entry.itemKey,
      item: entry.item,
    }));
  }

  private buildVisibleLootWindowItems(entries: LootEntry[]): LootWindowItemView[] {
    return this.groupLootEntries(entries.filter((entry) => entry.visible)).map((entry) => ({
      itemKey: entry.itemKey,
      item: entry.item,
    }));
  }

  private groupLootEntries(entries: LootEntry[]): GroupedLootRow[] {
    const rows: GroupedLootRow[] = [];
    const index = new Map<string, GroupedLootRow>();

    const sorted = [...entries].sort((left, right) => left.createdTick - right.createdTick);
    for (const entry of sorted) {
      const itemKey = createItemStackSignature(entry.item);
      const existing = index.get(itemKey);
      if (existing) {
        existing.item.count += entry.item.count;
        existing.entries.push(entry);
        continue;
      }
      const created: GroupedLootRow = {
        itemKey,
        item: { ...entry.item },
        entries: [entry],
      };
      index.set(itemKey, created);
      rows.push(created);
    }

    return rows;
  }

  private canAddItems(player: PlayerState, items: ItemStack[]): boolean {
    const simulated = player.inventory.items.map((item) => ({ ...item }));
    for (const item of items) {
      const signature = createItemStackSignature(item);
      const existing = simulated.find((entry) => createItemStackSignature(entry) === signature);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      if (simulated.length >= player.inventory.capacity) {
        return false;
      }
      simulated.push({ ...item });
    }
    return true;
  }

  private addItems(player: PlayerState, items: ItemStack[]): void {
    for (const item of items) {
      this.inventoryService.addItem(player, { ...item });
    }
  }

  private ensureContainerState(mapId: string, container: ContainerConfig): ContainerState {
    const sourceId = this.buildContainerSourceId(mapId, container.id);
    const existing = this.containers.get(sourceId);
    if (existing && existing.generatedAtTick !== undefined) {
      return existing;
    }

    const currentTick = this.getCurrentTick(mapId);
    const generated: ContainerState = existing ?? {
      sourceId,
      mapId,
      containerId: container.id,
      entries: [],
      activeSearch: undefined,
    };
    generated.entries = this.generateContainerEntries(container, currentTick);
    generated.generatedAtTick = currentTick;
    generated.refreshAtTick = container.refreshTicks ? currentTick + container.refreshTicks : undefined;
    generated.activeSearch = undefined;
    this.containers.set(sourceId, generated);
    return generated;
  }

  private generateContainerEntries(container: ContainerConfig, currentTick: number): LootEntry[] {
    const entries: LootEntry[] = [];
    for (const drop of container.drops) {
      if (Math.random() > drop.chance) {
        continue;
      }
      const item = this.createItemFromDrop(drop);
      if (!item) {
        continue;
      }
      entries.push({
        item,
        createdTick: currentTick,
        visible: false,
      });
    }
    return entries;
  }

  private beginContainerSearch(mapId: string, container: ContainerConfig): void {
    const state = this.ensureContainerState(mapId, container);
    if (state.activeSearch) {
      return;
    }

    const nextHidden = this.groupLootEntries(state.entries.filter((entry) => !entry.visible))[0];
    if (!nextHidden) {
      return;
    }

    const totalTicks = CONTAINER_SEARCH_TICKS[container.grade] ?? 1;
    state.activeSearch = {
      itemKey: nextHidden.itemKey,
      totalTicks,
      remainingTicks: totalTicks,
    };
  }

  private hasHiddenContainerEntries(entries: LootEntry[]): boolean {
    return entries.some((entry) => !entry.visible);
  }

  private hasActiveViewerForTile(mapId: string, x: number, y: number): boolean {
    for (const session of this.sessions.values()) {
      if (session.mapId === mapId && session.tileX === x && session.tileY === y) {
        return true;
      }
    }
    return false;
  }

  private createItemFromDrop(drop: DropConfig): ItemStack | null {
    return this.contentService.createItem(drop.itemId, drop.count) ?? {
      itemId: drop.itemId,
      name: drop.name,
      type: drop.type,
      count: drop.count,
      desc: drop.name,
    };
  }

  private getCurrentTick(mapId: string): number {
    return this.mapTicks.get(mapId) ?? 0;
  }

  private buildGroundSourceId(mapId: string, x: number, y: number): string {
    return `ground:${mapId}:${x}:${y}`;
  }

  private buildContainerSourceId(mapId: string, containerId: string): string {
    return `container:${mapId}:${containerId}`;
  }

  private resolveContainerBySourceId(sourceId: string): ContainerConfig | null {
    const [, mapId, containerId] = sourceId.split(':');
    if (!mapId || !containerId) {
      return null;
    }
    return this.mapService.getContainerById(mapId, containerId) ?? null;
  }

  private isPlayerWithinLootRange(player: PlayerState, x: number, y: number): boolean {
    return manhattanDistance(player, { x, y }) <= 1;
  }

  private markTileViewersDirty(mapId: string, x: number, y: number, dirtyPlayers: Set<string>): void {
    for (const playerId of this.getTileViewerIds(mapId, x, y)) {
      dirtyPlayers.add(playerId);
    }
  }

  private getTileViewerIds(mapId: string, x: number, y: number): string[] {
    const result: string[] = [];
    for (const session of this.sessions.values()) {
      if (session.mapId !== mapId || session.tileX !== x || session.tileY !== y) {
        continue;
      }
      result.push(session.playerId);
    }
    return result;
  }
}
