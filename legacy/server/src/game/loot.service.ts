/**
 * 掉落与拾取服务：地面物品堆、容器搜索、拾取窗口、物品过期
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  computeCraftSkillExpGain,
  createItemStackSignature,
  computeAdjustedCraftTicks,
  GroundItemEntryView,
  GroundItemPileView,
  GROUND_ITEM_EXPIRE_TICKS,
  ItemStack,
  LootSourceVariant,
  LootWindowHerbMeta,
  PlayerState,
  normalizeAlchemySkillState,
  resolveAlchemyGradeValue,
  SyncedItemStack,
  SyncedLootWindowItemView,
  SyncedLootWindowState,
  TechniqueGrade,
  isPointInRange,
} from '@mud/shared';
import * as fs from 'fs';
import { resolveServerDataPath } from '../common/data-path';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { ContainerConfig, DropConfig, MapService } from './map.service';
import { CONTAINER_SEARCH_TICKS } from '../constants/gameplay/loot';
import { TechniqueService } from './technique.service';

type LootMessageKind = 'system' | 'loot' | 'quest';
type LootPlayerDirtyFlag = 'inv' | 'tech' | 'attr' | 'actions';

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
  variant?: LootSourceVariant;
  generatedAtTick?: number;
  refreshAtTick?: number;
  respawnTotalTicks?: number;
  entries: LootEntry[];
  herb?: LootWindowHerbMeta;
  hp?: number;
  maxHp?: number;
  destroyed?: boolean;
  activeSearch?: {
    itemKey: string;
    mode?: 'reveal' | 'harvest';
    playerId?: string;
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
  messages: LootMessage[];
  playerDirtyFlags: Array<{ playerId: string; flags: LootPlayerDirtyFlag[] }>;
}

interface LootActionResult {
  error?: string;
  messages: LootMessage[];
  dirtyPlayers: string[];
  inventoryChanged?: boolean;
}

interface PersistedLootEntryRecord {
  item: ItemStack;
  createdTick: number;
  expiresAtTick?: number;
  visible: boolean;
}

interface PersistedGroundPileRecord {
  x: number;
  y: number;
  entries: PersistedLootEntryRecord[];
}

interface PersistedContainerSearchRecord {
  itemKey: string;
  mode?: 'reveal' | 'harvest';
  playerId?: string;
  totalTicks: number;
  remainingTicks: number;
}

interface PersistedContainerRecord {
  containerId: string;
  variant?: LootSourceVariant;
  generatedAtTick?: number;
  refreshAtTick?: number;
  respawnTotalTicks?: number;
  entries: PersistedLootEntryRecord[];
  herb?: LootWindowHerbMeta;
  hp?: number;
  maxHp?: number;
  destroyed?: boolean;
  activeSearch?: PersistedContainerSearchRecord;
}

interface PersistedLootMapState {
  tick?: number;
  groundPiles?: PersistedGroundPileRecord[];
  containers?: PersistedContainerRecord[];
}

interface PersistedLootRuntimeSnapshot {
  version: 1;
  maps: Record<string, PersistedLootMapState>;
}

const RUNTIME_STATE_SCOPE = 'runtime_state';
const MAP_LOOT_RUNTIME_DOCUMENT_KEY = 'map_loot';
const HERB_GATHER_TIME_RATE = 0.5;
const HERB_RESPAWN_TIME_RATE = 0.5;
const GATHER_SPEED_PER_LEVEL = 0.02;

@Injectable()
export class LootService implements OnModuleInit, OnModuleDestroy {
  private readonly mapTicks = new Map<string, number>();
  private readonly groundPiles = new Map<string, GroundPileState>();
  private readonly containers = new Map<string, ContainerState>();
  private readonly sessions = new Map<string, LootSession>();
  private readonly logger = new Logger(LootService.name);
  private readonly runtimeStatePath = resolveServerDataPath('runtime', 'map-loot-runtime-state.json');
  private runtimeStateDirty = false;

  constructor(
    private readonly mapService: MapService,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly persistentDocumentService: PersistentDocumentService,
    private readonly techniqueService: TechniqueService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadPersistedRuntimeState();
  }

  async onModuleDestroy(): Promise<void> {
    await this.persistRuntimeState();
  }

  async reloadRuntimeStateFromPersistence(): Promise<void> {
    this.mapTicks.clear();
    this.groundPiles.clear();
    this.containers.clear();
    this.sessions.clear();
    this.runtimeStateDirty = false;
    await this.loadPersistedRuntimeState();
  }

  /** 每 tick 处理掉落物过期、容器刷新、搜索进度 */
  tick(mapId: string, players: PlayerState[]): LootTickResult {
    const currentTick = (this.mapTicks.get(mapId) ?? 0) + 1;
    this.mapTicks.set(mapId, currentTick);
    if (this.hasPersistableRuntimeState(mapId)) {
      this.markRuntimeStateDirty();
    }

    const dirtyPlayers = new Set<string>();
    const playerById = new Map(players.map((player) => [player.id, player]));
    const messages: LootMessage[] = [];
    const playerDirtyFlags = new Map<string, Set<LootPlayerDirtyFlag>>();

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
      this.markRuntimeStateDirty();
      this.markTileViewersDirty(mapId, pile.x, pile.y, dirtyPlayers);
    }

    for (const [sourceId, state] of this.containers.entries()) {
      if (state.mapId !== mapId || state.refreshAtTick === undefined || state.refreshAtTick > currentTick) {
        continue;
      }
      const container = this.resolveContainerBySourceId(sourceId);
      if (!container) {
        continue;
      }
      if (state.variant === 'herb' && state.destroyed !== true) {
        this.applyHerbGrowth(mapId, container, state, currentTick);
        this.markTileViewersDirty(mapId, container.x, container.y, dirtyPlayers);
        continue;
      }
      state.entries = [];
      state.generatedAtTick = undefined;
      state.refreshAtTick = undefined;
      state.respawnTotalTicks = undefined;
      state.activeSearch = undefined;
      if (state.variant === 'herb') {
        state.hp = undefined;
        state.maxHp = undefined;
        state.destroyed = false;
      }
      this.markRuntimeStateDirty();
      this.markTileViewersDirty(mapId, container.x, container.y, dirtyPlayers);
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
        this.cancelActiveHarvestByPlayer(playerId);
        dirtyPlayers.add(playerId);
        continue;
      }

      const container = this.mapService.getContainerAt(mapId, session.tileX, session.tileY);
      if (container) {
        const state = this.ensureContainerState(mapId, container);
        if (!state.activeSearch && !state.destroyed && this.hasHiddenContainerEntries(state.entries)) {
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
      if (state.activeSearch.mode === 'harvest') {
        this.tickHerbHarvestProgress({
          mapId,
          container,
          state,
          playerById,
          dirtyPlayers,
          messages,
          playerDirtyFlags,
        });
        continue;
      }

      state.activeSearch.remainingTicks -= 1;
      this.markRuntimeStateDirty();
      this.markTileViewersDirty(mapId, container.x, container.y, dirtyPlayers);
      if (state.activeSearch.remainingTicks > 0) {
        continue;
      }

      const target = state.entries.find((entry) => !entry.visible && createItemStackSignature(entry.item) === state.activeSearch?.itemKey);
      if (target) {
        target.visible = true;
      }
      state.activeSearch = undefined;
      this.markRuntimeStateDirty();

      if (!state.destroyed && this.hasHiddenContainerEntries(state.entries) && this.hasActiveViewerForTile(mapId, container.x, container.y)) {
        this.beginContainerSearch(mapId, container);
      }
    }

    return {
      dirtyPlayers: [...dirtyPlayers],
      messages,
      playerDirtyFlags: [...playerDirtyFlags.entries()].map(([playerId, flags]) => ({ playerId, flags: [...flags] })),
    };
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
    this.markRuntimeStateDirty();
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
    this.markRuntimeStateDirty();
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
    if (container && container.variant !== 'herb') {
      this.beginContainerSearch(player.mapId, container);
    }

    this.sessions.set(player.id, session);
    return { messages: [], dirtyPlayers: [player.id] };
  }

  /** 关闭玩家当前的拾取窗口，并中断对应的连续采摘 */
  closeLootWindow(playerId: string): string[] {
    const dirtyPlayers = new Set<string>([playerId]);
    const session = this.sessions.get(playerId);
    if (session) {
      for (const viewerId of this.getTileViewerIds(session.mapId, session.tileX, session.tileY)) {
        dirtyPlayers.add(viewerId);
      }
      this.sessions.delete(playerId);
    }
    this.cancelActiveHarvestByPlayer(playerId);
    return [...dirtyPlayers];
  }

  /** 从指定来源拾取物品 */
  takeFromSource(player: PlayerState, sourceId: string, itemKey: string): LootActionResult {
    const session = this.sessions.get(player.id);
    if (!session || session.mapId !== player.mapId) {
      return { error: '请先打开拿取界面。', messages: [], dirtyPlayers: [] };
    }
    if (!this.isPlayerWithinLootRange(player, session.tileX, session.tileY)) {
      this.sessions.delete(player.id);
      this.cancelActiveHarvestByPlayer(player.id);
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

  /** 从指定来源拿取当前可见的全部物品 */
  takeAllFromSource(player: PlayerState, sourceId: string): LootActionResult {
    const session = this.sessions.get(player.id);
    if (!session || session.mapId !== player.mapId) {
      return { error: '请先打开拿取界面。', messages: [], dirtyPlayers: [] };
    }
    if (!this.isPlayerWithinLootRange(player, session.tileX, session.tileY)) {
      this.sessions.delete(player.id);
      this.cancelActiveHarvestByPlayer(player.id);
      return { error: '你已离开拿取范围。', messages: [], dirtyPlayers: [player.id] };
    }

    if (sourceId.startsWith('ground:')) {
      return this.takeAllFromGround(player, session, sourceId);
    }
    if (sourceId.startsWith('container:')) {
      return this.takeAllFromContainer(player, session, sourceId);
    }
    return { error: '未知的拿取来源。', messages: [], dirtyPlayers: [] };
  }

  /** 构建当前拾取窗口的视图数据 */
  buildLootWindow(player: PlayerState): SyncedLootWindowState | null {
    const session = this.sessions.get(player.id);
    if (!session || session.mapId !== player.mapId) {
      return null;
    }
    if (!this.isPlayerWithinLootRange(player, session.tileX, session.tileY)) {
      this.sessions.delete(player.id);
      this.cancelActiveHarvestByPlayer(player.id);
      return null;
    }

    const sources: SyncedLootWindowState['sources'] = [];
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
      const isHerb = container.variant === 'herb';
      const herbRespawning = isHerb && this.isHerbRespawningState(state);
      const respawnRemainingTicks = isHerb ? this.getRespawnRemainingTicks(session.mapId, state) : undefined;
      const items = state.destroyed
        ? []
        : (isHerb ? this.buildLootWindowItems(state.entries) : this.buildVisibleLootWindowItems(state.entries));
      const herbMeta = state.herb
        ? {
            ...state.herb,
            gatherTicks: this.computeEffectiveHerbGatherTicks(player, state.herb),
          }
        : undefined;
      sources.push({
        sourceId: this.buildContainerSourceId(session.mapId, container.id),
        kind: 'container',
        variant: state.variant,
        title: container.name,
        desc: container.desc,
        grade: state.herb?.grade ?? container.grade,
        searchable: !state.destroyed && !herbRespawning,
        search: state.activeSearch
          ? {
              totalTicks: state.activeSearch.totalTicks,
              remainingTicks: state.activeSearch.remainingTicks,
              elapsedTicks: state.activeSearch.totalTicks - state.activeSearch.remainingTicks,
            }
          : undefined,
        herb: herbMeta,
        destroyed: state.destroyed === true,
        items,
        emptyText: isHerb
            ? (state.destroyed
              ? (respawnRemainingTicks !== undefined
                ? `这株草药已被摧毁，还需 ${Math.max(1, respawnRemainingTicks)} 息再生。`
                : '这株草药已被摧毁，无法再采集。')
              : (herbRespawning
                ? `这株草药药性回生中，还需 ${Math.max(1, respawnRemainingTicks ?? 0)} 息。`
                : (state.activeSearch?.mode === 'harvest'
                  ? '正在连续采摘，满条后会自动开始下一朵。'
                  : '草药会按生长周期持续累积，点击后会自动连续采摘。')))
          : (this.hasHiddenContainerEntries(state.entries)
            ? '正在翻找，每完成一轮搜索会显露一件物品。'
            : '容器里已经空了。'),
      });
    }

    if (sources.length === 0) {
      this.sessions.delete(player.id);
      this.cancelActiveHarvestByPlayer(player.id);
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

  getContainerRuntimeView(mapId: string, container: ContainerConfig): {
    variant?: LootSourceVariant;
    herb?: LootWindowHerbMeta;
    availableCount?: number;
    hp?: number;
    maxHp?: number;
    destroyed: boolean;
    respawning: boolean;
    respawnRemainingTicks?: number;
    respawnTotalTicks?: number;
  } {
    const state = this.ensureContainerState(mapId, container);
    const respawning = this.isHerbRespawningState(state);
    const respawnRemainingTicks = state.destroyed || respawning
      ? this.getRespawnRemainingTicks(mapId, state)
      : undefined;
    return {
      variant: state.variant,
      herb: state.herb ? { ...state.herb } : undefined,
      availableCount: state.entries.reduce((sum, entry) => sum + Math.max(0, Math.floor(entry.item.count || 0)), 0),
      hp: state.hp,
      maxHp: state.maxHp,
      destroyed: state.destroyed === true,
      respawning,
      respawnRemainingTicks,
      respawnTotalTicks: respawnRemainingTicks !== undefined ? state.respawnTotalTicks : undefined,
    };
  }

  damageContainer(
    mapId: string,
    containerId: string,
    damage: number,
  ): {
    destroyed: boolean;
    hp: number;
    maxHp: number;
    appliedDamage: number;
    dirtyPlayers: string[];
    herb: LootWindowHerbMeta;
  } | null {
    const container = this.mapService.getContainerById(mapId, containerId);
    if (!container || container.variant !== 'herb') {
      return null;
    }
    const state = this.ensureContainerState(mapId, container);
    if (
      !state.herb
      || !Number.isFinite(state.maxHp)
      || state.maxHp! <= 0
      || state.destroyed === true
      || this.isHerbRespawningState(state)
    ) {
      return null;
    }

    const nextDamage = Math.max(0, Math.round(damage));
    const currentHp = Math.max(0, Math.round(state.hp ?? state.maxHp ?? 0));
    const appliedDamage = Math.min(currentHp, nextDamage);
    const nextHp = Math.max(0, currentHp - appliedDamage);
    state.hp = nextHp;
    if (nextHp <= 0) {
      state.destroyed = true;
      state.entries = [];
      state.activeSearch = undefined;
      const respawnTicks = this.resolveContainerRefreshTicks(container);
      state.refreshAtTick = respawnTicks !== undefined ? this.getCurrentTick(mapId) + respawnTicks : undefined;
      state.respawnTotalTicks = respawnTicks;
    }
    this.markRuntimeStateDirty();

    return {
      destroyed: state.destroyed === true,
      hp: Math.max(0, Math.round(state.hp ?? 0)),
      maxHp: Math.max(1, Math.round(state.maxHp ?? 1)),
      appliedDamage,
      dirtyPlayers: this.getTileViewerIds(mapId, container.x, container.y),
      herb: { ...state.herb },
    };
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
    this.markRuntimeStateDirty();

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

  private takeAllFromGround(player: PlayerState, session: LootSession, sourceId: string): LootActionResult {
    const expectedSourceId = this.buildGroundSourceId(session.mapId, session.tileX, session.tileY);
    if (sourceId !== expectedSourceId) {
      return { error: '当前拿取界面与目标地面物品不一致。', messages: [], dirtyPlayers: [] };
    }

    const pile = this.groundPiles.get(sourceId);
    if (!pile || pile.entries.length === 0) {
      return { error: '地面物品已经被拿走了。', messages: [], dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY) };
    }

    const rows = this.groupLootEntries(pile.entries);
    const result = this.takeRowsWithCapacity(player, rows);
    if (result.takenRows.length === 0) {
      return { error: '背包空间不足，无法继续拿取。', messages: [], dirtyPlayers: [] };
    }

    const keySet = new Set(result.takenRows.flatMap((row) => row.entries));
    pile.entries = pile.entries.filter((entry) => !keySet.has(entry));
    if (pile.entries.length === 0) {
      this.groundPiles.delete(sourceId);
    }
    this.markRuntimeStateDirty();

    const messages: LootMessage[] = [{
      playerId: player.id,
      text: `你拾起了 ${this.formatTakenRowsSummary(result.takenRows)}。`,
      kind: 'loot',
    }];
    if (result.blockedByCapacity) {
      messages.push({
        playerId: player.id,
        text: '背包空间不足，剩余物品暂时拿不下。',
        kind: 'system',
      });
    }

    return {
      messages,
      dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      inventoryChanged: true,
    };
  }

  private beginHerbHarvest(
    player: PlayerState,
    session: LootSession,
    container: ContainerConfig,
    state: ContainerState,
    itemKey: string,
  ): LootActionResult {
    if (state.activeSearch?.mode === 'harvest') {
      return {
        error: state.activeSearch.playerId === player.id ? '你正在采摘中，稍候即可。' : '这株草药正被他人采摘中。',
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }
    const row = this.groupLootEntries(state.entries).find((entry) => entry.itemKey === itemKey && entry.item.count > 0);
    if (!row || !state.herb) {
      return {
        error: '当前还没有可采下的草药。',
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }
    const singleHerb: ItemStack = { ...row.item, count: 1 };
    if (!this.canAddItems(player, [singleHerb])) {
      return { error: '背包空间不足，无法采下该草药。', messages: [], dirtyPlayers: [] };
    }
    const totalTicks = this.computeEffectiveHerbGatherTicks(player, state.herb);
    state.activeSearch = {
      itemKey,
      mode: 'harvest',
      playerId: player.id,
      totalTicks,
      remainingTicks: totalTicks,
    };
    this.markRuntimeStateDirty();
    return {
      messages: [],
      dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
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
    if (state.destroyed) {
      return { error: '这株草药已被摧毁，无法采集。', messages: [], dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY) };
    }
    if (container.variant === 'herb' && this.isHerbRespawningState(state)) {
      return {
        error: `这株草药尚在回生，还需 ${Math.max(1, this.getRespawnRemainingTicks(session.mapId, state) ?? 0)} 息。`,
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }
    if (container.variant === 'herb') {
      return this.beginHerbHarvest(player, session, container, state, itemKey);
    }
    const row = this.groupLootEntries(state.entries.filter((entry) => entry.visible)).find((entry) => entry.itemKey === itemKey);
    if (!row) {
      return {
        error: '目标物品已经被其他人拿走了。',
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }
    if (!this.canAddItems(player, row.entries.map((entry) => entry.item))) {
      return { error: '背包空间不足，无法拿取该物品。', messages: [], dirtyPlayers: [] };
    }

    this.addItems(player, row.entries.map((entry) => entry.item));
    const keySet = new Set(row.entries);
    state.entries = state.entries.filter((entry) => !keySet.has(entry));
    this.markRuntimeStateDirty();

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

  private takeAllFromContainer(player: PlayerState, session: LootSession, sourceId: string): LootActionResult {
    const container = this.mapService.getContainerAt(session.mapId, session.tileX, session.tileY);
    if (!container) {
      return { error: '该格子当前没有容器。', messages: [], dirtyPlayers: [player.id] };
    }

    const expectedSourceId = this.buildContainerSourceId(session.mapId, container.id);
    if (sourceId !== expectedSourceId) {
      return { error: '当前拿取界面与目标容器不一致。', messages: [], dirtyPlayers: [] };
    }

    const state = this.ensureContainerState(session.mapId, container);
    if (state.destroyed) {
      return { error: '这株草药已被摧毁，无法采集。', messages: [], dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY) };
    }
    if (container.variant === 'herb' && this.isHerbRespawningState(state)) {
      return {
        error: `这株草药尚在回生，还需 ${Math.max(1, this.getRespawnRemainingTicks(session.mapId, state) ?? 0)} 息。`,
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }
    if (container.variant === 'herb') {
      return {
        error: '草药需要逐朵采摘，不能一次全部拿取。',
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }
    const rows = this.groupLootEntries(state.entries.filter((entry) => entry.visible));
    if (rows.length === 0) {
      return {
        error: '当前没有可拿取的物品。',
        messages: [],
        dirtyPlayers: this.getTileViewerIds(session.mapId, session.tileX, session.tileY),
      };
    }

    const result = this.takeRowsWithCapacity(player, rows);
    if (result.takenRows.length === 0) {
      return { error: '背包空间不足，无法继续拿取。', messages: [], dirtyPlayers: [] };
    }

    const keySet = new Set(result.takenRows.flatMap((row) => row.entries));
    state.entries = state.entries.filter((entry) => !keySet.has(entry));
    this.markRuntimeStateDirty();

    const messages: LootMessage[] = [{
      playerId: player.id,
      text: `你从 ${container.name} 中拿走了 ${this.formatTakenRowsSummary(result.takenRows)}。`,
      kind: 'loot',
    }];
    if (result.blockedByCapacity) {
      messages.push({
        playerId: player.id,
        text: '背包空间不足，剩余物品暂时拿不下。',
        kind: 'system',
      });
    }

    return {
      messages,
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
      itemId: entry.item.itemId,
      name: entry.item.name,
      type: entry.item.type,
      count: entry.item.count,
      grade: entry.item.grade,
      groundLabel: entry.item.groundLabel,
    }));
  }

  private buildLootWindowItems(entries: LootEntry[]): SyncedLootWindowItemView[] {
    return this.groupLootEntries(entries).map((entry) => ({
      itemKey: entry.itemKey,
      item: this.toSyncedItemStack(entry.item),
    }));
  }

  private buildVisibleLootWindowItems(entries: LootEntry[]): SyncedLootWindowItemView[] {
    return this.groupLootEntries(entries.filter((entry) => entry.visible)).map((entry) => ({
      itemKey: entry.itemKey,
      item: this.toSyncedItemStack(entry.item),
    }));
  }

  private toSyncedItemStack(item: ItemStack): SyncedItemStack {
    if (this.contentService.getItem(item.itemId)) {
      return {
        itemId: item.itemId,
        count: Math.max(1, Math.floor(item.count)),
        name: item.enhanceLevel && item.enhanceLevel > 0 ? item.name : undefined,
        equipAttrs: item.enhanceLevel && item.enhanceLevel > 0 && item.equipAttrs ? structuredClone(item.equipAttrs) : undefined,
        equipStats: item.enhanceLevel && item.enhanceLevel > 0 && item.equipStats ? structuredClone(item.equipStats) : undefined,
        equipValueStats: item.enhanceLevel && item.enhanceLevel > 0 && item.equipValueStats ? structuredClone(item.equipValueStats) : undefined,
        enhanceLevel: item.enhanceLevel,
        alchemySuccessRate: item.alchemySuccessRate,
        alchemySpeedRate: item.alchemySpeedRate,
        enhancementSuccessRate: item.enhancementSuccessRate,
        enhancementSpeedRate: item.enhancementSpeedRate,
        mapUnlockId: item.mapUnlockId,
        mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
        tileAuraGainAmount: item.tileAuraGainAmount,
        allowBatchUse: item.allowBatchUse,
      };
    }
    return {
      itemId: item.itemId,
      count: Math.max(1, Math.floor(item.count)),
      name: item.name,
      type: item.type,
      desc: item.desc,
      groundLabel: item.groundLabel,
      grade: item.grade,
      level: item.level,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs ? structuredClone(item.equipAttrs) : undefined,
      equipStats: item.equipStats ? structuredClone(item.equipStats) : undefined,
      equipValueStats: item.equipValueStats ? structuredClone(item.equipValueStats) : undefined,
      effects: item.effects ? structuredClone(item.effects) : undefined,
      tags: item.tags ? [...item.tags] : undefined,
      enhanceLevel: item.enhanceLevel,
      alchemySuccessRate: item.alchemySuccessRate,
      alchemySpeedRate: item.alchemySpeedRate,
      enhancementSuccessRate: item.enhancementSuccessRate,
      enhancementSpeedRate: item.enhancementSpeedRate,
      mapUnlockId: item.mapUnlockId,
      mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
      tileAuraGainAmount: item.tileAuraGainAmount,
      allowBatchUse: item.allowBatchUse,
    };
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

  private takeRowsWithCapacity(
    player: PlayerState,
    rows: GroupedLootRow[],
  ): { takenRows: GroupedLootRow[]; blockedByCapacity: boolean } {
    const simulated = player.inventory.items.map((item) => ({ ...item }));
    const takenRows: GroupedLootRow[] = [];
    let blockedByCapacity = false;

    for (const row of rows) {
      if (!this.canAddItemsToInventory(simulated, player.inventory.capacity, row.entries.map((entry) => entry.item))) {
        blockedByCapacity = true;
        break;
      }
      this.addItems(player, row.entries.map((entry) => entry.item));
      takenRows.push(row);
    }

    return { takenRows, blockedByCapacity };
  }

  private canAddItemsToInventory(simulated: ItemStack[], capacity: number, items: ItemStack[]): boolean {
    for (const item of items) {
      const signature = createItemStackSignature(item);
      const existing = simulated.find((entry) => createItemStackSignature(entry) === signature);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      if (simulated.length >= capacity) {
        return false;
      }
      simulated.push({ ...item });
    }
    return true;
  }

  private formatTakenRowsSummary(rows: GroupedLootRow[]): string {
    const preview = rows.slice(0, 3).map((row) => `${row.item.name} x${row.item.count}`);
    if (rows.length <= 3) {
      return preview.join('、');
    }
    return `${preview.join('、')} 等 ${rows.length} 种物品`;
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
      this.syncContainerVariantState(container, existing);
      return existing;
    }

    const currentTick = this.getCurrentTick(mapId);
    const herbGrowthTicks = container.variant === 'herb' ? this.resolveContainerRefreshTicks(container) : undefined;
    const generated: ContainerState = existing ?? {
      sourceId,
      mapId,
      containerId: container.id,
      variant: container.variant,
      entries: [],
      activeSearch: undefined,
    };
    generated.entries = this.generateContainerEntries(container, currentTick);
    generated.generatedAtTick = currentTick;
    generated.refreshAtTick = container.variant === 'herb'
      ? (herbGrowthTicks !== undefined ? currentTick + herbGrowthTicks : undefined)
      : (container.refreshTicks ? currentTick + container.refreshTicks : undefined);
    generated.respawnTotalTicks = container.variant === 'herb'
      ? herbGrowthTicks
      : undefined;
    generated.activeSearch = undefined;
    generated.variant = container.variant;
    this.syncContainerVariantState(container, generated, true);
    this.containers.set(sourceId, generated);
    this.markRuntimeStateDirty();
    return generated;
  }

  private generateContainerEntries(container: ContainerConfig, currentTick: number): LootEntry[] {
    const entries: LootEntry[] = [];
    for (const pool of container.lootPools) {
      const items = this.contentService.rollLootPoolItems(pool);
      for (const item of items) {
        entries.push({
          item,
          createdTick: currentTick,
          visible: container.variant === 'herb',
        });
      }
    }

    if (entries.length > 0 || container.lootPools.length > 0) {
      return entries;
    }

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
        visible: container.variant === 'herb',
      });
    }
    return entries;
  }

  private beginContainerSearch(mapId: string, container: ContainerConfig): void {
    const state = this.ensureContainerState(mapId, container);
    if (container.variant === 'herb' || state.activeSearch || state.destroyed) {
      return;
    }

    const nextHidden = this.groupLootEntries(state.entries.filter((entry) => !entry.visible))[0];
    if (!nextHidden) {
      return;
    }

    const totalTicks = state.herb?.gatherTicks ?? (CONTAINER_SEARCH_TICKS[container.grade] ?? 1);
    state.activeSearch = {
      itemKey: nextHidden.itemKey,
      mode: 'reveal',
      totalTicks,
      remainingTicks: totalTicks,
    };
    this.markRuntimeStateDirty();
  }

  private syncContainerVariantState(container: ContainerConfig, state: ContainerState, resetHp = false): void {
    state.variant = container.variant;
    if (container.variant !== 'herb') {
      state.herb = undefined;
      state.hp = undefined;
      state.maxHp = undefined;
      state.destroyed = undefined;
      state.respawnTotalTicks = undefined;
      return;
    }
    for (const entry of state.entries) {
      entry.visible = true;
    }
    if (state.activeSearch?.mode === 'reveal') {
      state.activeSearch = undefined;
    }

    const herbItem = state.entries[0]?.item;
    if (herbItem) {
      state.herb = this.buildHerbMeta(herbItem);
    }
    if (state.herb) {
      state.herb = this.buildHerbMeta({
        itemId: state.herb.itemId,
        name: state.herb.name,
        type: 'material',
        count: 1,
        desc: state.herb.name,
        grade: state.herb.grade,
        level: state.herb.level,
      });
    }
    if (!state.herb) {
      return;
    }

    const nextMaxHp = this.computeHerbDurability(state.herb);
    state.maxHp = nextMaxHp;
    if (this.isHerbRespawningState(state)) {
      state.hp = 0;
      state.destroyed = false;
      return;
    }
    if (resetHp || !Number.isFinite(state.hp) || state.destroyed === undefined) {
      state.hp = nextMaxHp;
      state.destroyed = false;
      return;
    }
    state.hp = Math.max(0, Math.min(Math.round(state.hp!), nextMaxHp));
    state.destroyed = state.destroyed === true && state.hp <= 0;
  }

  private isHerbRespawningState(state: Pick<ContainerState, 'variant' | 'refreshAtTick' | 'entries' | 'destroyed'>): boolean {
    return state.variant === 'herb' && state.destroyed !== true && state.refreshAtTick !== undefined && state.entries.length === 0;
  }

  private getRespawnRemainingTicks(
    mapId: string,
    state: Pick<ContainerState, 'refreshAtTick'>,
  ): number | undefined {
    if (state.refreshAtTick === undefined) {
      return undefined;
    }
    return Math.max(0, state.refreshAtTick - this.getCurrentTick(mapId));
  }

  private resolveContainerRefreshTicks(container: ContainerConfig): number | undefined {
    const fixed = Number.isInteger(container.refreshTicks) && container.refreshTicks! > 0
      ? Number(container.refreshTicks)
      : undefined;
    const min = Number.isInteger(container.refreshTicksMin) && container.refreshTicksMin! > 0
      ? Number(container.refreshTicksMin)
      : fixed;
    const max = Number.isInteger(container.refreshTicksMax) && container.refreshTicksMax! > 0
      ? Number(container.refreshTicksMax)
      : (fixed ?? min);
    if (min === undefined && max === undefined) {
      return undefined;
    }
    const lower = Math.max(1, Math.min(min ?? max ?? 1, max ?? min ?? 1));
    const upper = Math.max(lower, max ?? min ?? lower);
    if (lower === upper) {
      return container.variant === 'herb'
        ? Math.max(1, Math.ceil(lower * HERB_RESPAWN_TIME_RATE))
        : lower;
    }
    const resolved = lower + Math.floor(Math.random() * (upper - lower + 1));
    return container.variant === 'herb'
      ? Math.max(1, Math.ceil(resolved * HERB_RESPAWN_TIME_RATE))
      : resolved;
  }

  private scheduleHerbRespawn(mapId: string, container: ContainerConfig, state: ContainerState): void {
    const respawnTicks = this.resolveContainerRefreshTicks(container);
    state.activeSearch = undefined;
    state.hp = 0;
    state.destroyed = false;
    if (respawnTicks === undefined) {
      state.refreshAtTick = undefined;
      state.respawnTotalTicks = undefined;
      return;
    }
    state.refreshAtTick = this.getCurrentTick(mapId) + respawnTicks;
    state.respawnTotalTicks = respawnTicks;
  }

  private buildHerbMeta(item: ItemStack): LootWindowHerbMeta {
    const grade = item.grade;
    const level = Math.max(1, Math.floor(Number(item.level) || 1));
    const nativeGatherTicks = this.computeHerbGatherTicks(grade, level);
    return {
      itemId: item.itemId,
      name: item.name,
      grade,
      level,
      gatherTicks: nativeGatherTicks,
      nativeGatherTicks,
    };
  }

  private computeHerbGatherTicks(grade: TechniqueGrade | undefined, level: number | undefined): number {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    const baseTicks = normalizedLevel + resolveAlchemyGradeValue(grade) - 1;
    return Math.max(1, Math.ceil(baseTicks * HERB_GATHER_TIME_RATE));
  }

  private computeEffectiveHerbGatherTicks(player: PlayerState, herb: LootWindowHerbMeta): number {
    const nativeGatherTicks = Math.max(1, Math.floor(Number(herb.nativeGatherTicks ?? herb.gatherTicks) || 1));
    const gatherLevel = Math.max(1, Math.floor(Number(this.ensureGatherSkill(player).level) || 1));
    const speedRate = gatherLevel * GATHER_SPEED_PER_LEVEL;
    return computeAdjustedCraftTicks(nativeGatherTicks, speedRate);
  }

  private computeHerbDurability(herb: LootWindowHerbMeta): number {
    const level = Math.max(1, Math.floor(Number(herb.level) || 1));
    return 8 + level * 6 + resolveAlchemyGradeValue(herb.grade) * 8;
  }

  private ensureGatherSkill(player: PlayerState) {
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(1)?.expToNext ?? 60);
    const normalized = normalizeAlchemySkillState(player.gatherSkill, expToNext);
    player.gatherSkill = normalized;
    return normalized;
  }

  private getGatherSkillExpToNext(level: number): number {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(0, this.contentService.getRealmLevelEntry(normalizedLevel)?.expToNext ?? 0);
  }

  private grantGatherSkillExp(
    player: PlayerState,
    herb: LootWindowHerbMeta,
  ): { changed: boolean; messages: LootMessage[]; dirtyFlags: LootPlayerDirtyFlag[] } {
    const skill = this.ensureGatherSkill(player);
    if (skill.expToNext <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    const gainResult = computeCraftSkillExpGain({
      skillLevel: skill.level,
      targetLevel: herb.level ?? 1,
      baseActionTicks: herb.nativeGatherTicks ?? herb.gatherTicks,
      successCount: 1,
      failureCount: 0,
      successMultiplier: 1,
      getExpToNextByLevel: (level) => this.getGatherSkillExpToNext(level),
    });
    const gain = gainResult.finalGain;
    if (gain <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    skill.exp += gain;
    const messages: LootMessage[] = [];
    const dirtyFlags = new Set<LootPlayerDirtyFlag>();
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
      skill.exp -= skill.expToNext;
      skill.level += 1;
      skill.expToNext = this.getGatherSkillExpToNext(skill.level);
      if (skill.expToNext <= 0) {
        skill.exp = 0;
      }
      messages.push({
        playerId: player.id,
        text: `采集技艺提升至 LV ${skill.level}。`,
        kind: 'quest',
      });
    }
    player.gatherSkill = skill;
    const craftRealmGain = this.techniqueService.grantCraftRealmExp(player, gain / 2);
    for (const flag of craftRealmGain.dirty) {
      dirtyFlags.add(flag);
    }
    for (const message of craftRealmGain.messages) {
      messages.push({
        playerId: player.id,
        text: message.text,
        kind: message.kind === 'loot'
          ? 'loot'
          : message.kind === 'quest'
            ? 'quest'
            : 'system',
      });
    }
    dirtyFlags.add('attr');
    return { changed: true, messages, dirtyFlags: [...dirtyFlags] };
  }

  private applyHerbGrowth(mapId: string, container: ContainerConfig, state: ContainerState, currentTick: number): void {
    const growthTicks = this.resolveContainerRefreshTicks(container);
    const growthEntries = this.generateContainerEntries(container, currentTick);
    if (growthEntries.length === 0) {
      state.refreshAtTick = growthTicks !== undefined ? currentTick + growthTicks : undefined;
      state.respawnTotalTicks = growthTicks;
      this.markRuntimeStateDirty();
      return;
    }
    for (const entry of growthEntries) {
      this.mergeContainerEntry(state.entries, entry);
    }
    state.generatedAtTick = currentTick;
    state.refreshAtTick = growthTicks !== undefined ? currentTick + growthTicks : undefined;
    state.respawnTotalTicks = growthTicks;
    state.destroyed = false;
    this.syncContainerVariantState(container, state, state.hp === undefined || state.hp <= 0);
    this.markRuntimeStateDirty();
  }

  private mergeContainerEntry(entries: LootEntry[], nextEntry: LootEntry): void {
    const signature = createItemStackSignature(nextEntry.item);
    const existing = entries.find((entry) => createItemStackSignature(entry.item) === signature && entry.visible === nextEntry.visible);
    if (existing) {
      existing.item.count += nextEntry.item.count;
      existing.createdTick = Math.min(existing.createdTick, nextEntry.createdTick);
      return;
    }
    entries.push({
      item: { ...nextEntry.item },
      createdTick: nextEntry.createdTick,
      expiresAtTick: nextEntry.expiresAtTick,
      visible: nextEntry.visible,
    });
  }

  private cancelActiveHarvestByPlayer(playerId: string): void {
    for (const state of this.containers.values()) {
      if (state.activeSearch?.mode === 'harvest' && state.activeSearch.playerId === playerId) {
        state.activeSearch = undefined;
        this.markRuntimeStateDirty();
      }
    }
  }

  private tickHerbHarvestProgress(params: {
    mapId: string;
    container: ContainerConfig;
    state: ContainerState;
    playerById: Map<string, PlayerState>;
    dirtyPlayers: Set<string>;
    messages: LootMessage[];
    playerDirtyFlags: Map<string, Set<LootPlayerDirtyFlag>>;
  }): void {
    const search = params.state.activeSearch;
    if (!search || search.mode !== 'harvest' || !search.playerId) {
      params.state.activeSearch = undefined;
      return;
    }
    const session = this.sessions.get(search.playerId);
    const player = params.playerById.get(search.playerId);
    if (
      !player
      || !session
      || session.mapId !== params.mapId
      || session.tileX !== params.container.x
      || session.tileY !== params.container.y
      || !this.isPlayerWithinLootRange(player, session.tileX, session.tileY)
      || params.state.destroyed
      || this.isHerbRespawningState(params.state)
    ) {
      params.state.activeSearch = undefined;
      this.markRuntimeStateDirty();
      this.markTileViewersDirty(params.mapId, params.container.x, params.container.y, params.dirtyPlayers);
      return;
    }

    search.remainingTicks -= 1;
    this.markRuntimeStateDirty();
    this.markTileViewersDirty(params.mapId, params.container.x, params.container.y, params.dirtyPlayers);
    if (search.remainingTicks > 0) {
      return;
    }

    const herbEntry = params.state.entries.find((entry) => createItemStackSignature(entry.item) === search.itemKey && entry.item.count > 0);
    if (!herbEntry || !params.state.herb) {
      params.state.activeSearch = undefined;
      this.markRuntimeStateDirty();
      return;
    }
    const harvestedItem: ItemStack = { ...herbEntry.item, count: 1 };
    if (!this.canAddItems(player, [harvestedItem])) {
      params.state.activeSearch = undefined;
      params.messages.push({
        playerId: player.id,
        text: '背包空间不足，采摘被中断。',
        kind: 'system',
      });
      this.markRuntimeStateDirty();
      return;
    }

    this.addItems(player, [harvestedItem]);
    herbEntry.item.count -= 1;
    if (herbEntry.item.count <= 0) {
      params.state.entries = params.state.entries.filter((entry) => entry !== herbEntry);
    }
    const nextRow = this.groupLootEntries(params.state.entries).find((entry) => entry.item.count > 0);
    if (!nextRow) {
      this.scheduleHerbRespawn(params.mapId, params.container, params.state);
    } else {
      params.state.herb = this.buildHerbMeta(nextRow.item);
      const nextTotalTicks = this.computeEffectiveHerbGatherTicks(player, params.state.herb);
      params.state.activeSearch = {
        itemKey: nextRow.itemKey,
        mode: 'harvest',
        playerId: player.id,
        totalTicks: nextTotalTicks,
        remainingTicks: nextTotalTicks,
      };
    }
    this.markRuntimeStateDirty();
    params.messages.push({
      playerId: player.id,
      text: `你采得了 ${harvestedItem.name} x1。`,
      kind: 'loot',
    });
    this.addPlayerDirtyFlags(params.playerDirtyFlags, player.id, ['inv']);
    const expResult = this.grantGatherSkillExp(player, params.state.herb);
    params.messages.push(...expResult.messages);
    this.addPlayerDirtyFlags(params.playerDirtyFlags, player.id, expResult.dirtyFlags);
  }

  private addPlayerDirtyFlags(
    playerDirtyFlags: Map<string, Set<LootPlayerDirtyFlag>>,
    playerId: string,
    flags: readonly LootPlayerDirtyFlag[],
  ): void {
    if (flags.length === 0) {
      return;
    }
    const flagSet = playerDirtyFlags.get(playerId) ?? new Set<LootPlayerDirtyFlag>();
    for (const flag of flags) {
      flagSet.add(flag);
    }
    playerDirtyFlags.set(playerId, flagSet);
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
    return isPointInRange(player, { x, y }, 1);
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

  async persistRuntimeState(): Promise<void> {
    if (!this.runtimeStateDirty) {
      return;
    }

    try {
      const snapshot: PersistedLootRuntimeSnapshot = {
        version: 1,
        maps: {},
      };

      const mapIds = this.collectPersistedMapIds();
      for (const mapId of mapIds) {
        const groundPiles = [...this.groundPiles.values()]
          .filter((pile) => pile.mapId === mapId && pile.entries.length > 0)
          .sort((left, right) => left.y - right.y || left.x - right.x)
          .map((pile) => ({
            x: pile.x,
            y: pile.y,
            entries: pile.entries.map((entry) => this.toPersistedLootEntry(entry)),
          }));

        const containers = [...this.containers.values()]
          .filter((state) => state.mapId === mapId && this.resolveContainerBySourceId(state.sourceId))
          .sort((left, right) => left.containerId.localeCompare(right.containerId, 'zh-CN'))
          .map((state) => ({
            containerId: state.containerId,
            variant: state.variant,
            generatedAtTick: state.generatedAtTick,
            refreshAtTick: state.refreshAtTick,
            respawnTotalTicks: state.respawnTotalTicks,
            entries: state.entries.map((entry) => this.toPersistedLootEntry(entry)),
            herb: state.herb ? { ...state.herb } : undefined,
            hp: state.hp,
            maxHp: state.maxHp,
            destroyed: state.destroyed,
            activeSearch: state.activeSearch
              ? {
                  itemKey: state.activeSearch.itemKey,
                  mode: state.activeSearch.mode,
                  playerId: state.activeSearch.playerId,
                  totalTicks: state.activeSearch.totalTicks,
                  remainingTicks: state.activeSearch.remainingTicks,
                }
              : undefined,
          }));

        if (groundPiles.length === 0 && containers.length === 0) {
          continue;
        }

        snapshot.maps[mapId] = {
          tick: this.getCurrentTick(mapId),
          groundPiles,
          containers,
        };
      }

      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_LOOT_RUNTIME_DOCUMENT_KEY, snapshot);
      this.runtimeStateDirty = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`掉落运行时持久化到 PostgreSQL 失败: ${message}`);
    }
  }

  private async loadPersistedRuntimeState(): Promise<void> {
    let snapshot = await this.persistentDocumentService.get<Partial<PersistedLootRuntimeSnapshot>>(
      RUNTIME_STATE_SCOPE,
      MAP_LOOT_RUNTIME_DOCUMENT_KEY,
    );
    if (!snapshot) {
      await this.importLegacyRuntimeStateIfNeeded();
      snapshot = await this.persistentDocumentService.get<Partial<PersistedLootRuntimeSnapshot>>(
        RUNTIME_STATE_SCOPE,
        MAP_LOOT_RUNTIME_DOCUMENT_KEY,
      );
    }
    if (!snapshot) {
      return;
    }

    try {
      if (!snapshot?.maps || typeof snapshot.maps !== 'object') {
        this.logger.warn('掉落运行时持久化数据格式非法，已忽略');
        return;
      }

      let restoredPileCount = 0;
      let restoredContainerCount = 0;
      for (const [mapId, rawState] of Object.entries(snapshot.maps)) {
        if (!rawState || typeof rawState !== 'object') {
          continue;
        }

        const tick = typeof rawState.tick === 'number' && Number.isFinite(rawState.tick)
          ? Math.max(0, Math.floor(rawState.tick))
          : 0;
        this.mapTicks.set(mapId, tick);

        if (Array.isArray(rawState.groundPiles)) {
          for (const rawPile of rawState.groundPiles) {
            const pile = this.normalizePersistedGroundPile(mapId, rawPile);
            if (!pile) {
              continue;
            }
            this.groundPiles.set(pile.sourceId, pile);
            restoredPileCount += 1;
          }
        }

        if (Array.isArray(rawState.containers)) {
          for (const rawContainer of rawState.containers) {
            const container = this.normalizePersistedContainerState(mapId, rawContainer);
            if (!container) {
              continue;
            }
            this.containers.set(container.sourceId, container);
            restoredContainerCount += 1;
          }
        }
      }

      if (restoredPileCount > 0 || restoredContainerCount > 0) {
        this.logger.log(`已恢复掉落运行时状态：地面物品堆 ${restoredPileCount} 处，容器 ${restoredContainerCount} 个`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取掉落运行时持久化数据失败: ${message}`);
    }
  }

  private async importLegacyRuntimeStateIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.runtimeStatePath)) {
      return;
    }

    try {
      const snapshot = JSON.parse(fs.readFileSync(this.runtimeStatePath, 'utf-8')) as PersistedLootRuntimeSnapshot;
      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_LOOT_RUNTIME_DOCUMENT_KEY, snapshot);
      this.logger.log('已从旧掉落运行时 JSON 导入 PostgreSQL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`导入旧掉落运行时 JSON 失败: ${message}`);
    }
  }

  private collectPersistedMapIds(): string[] {
    const mapIds = new Set<string>();
    for (const pile of this.groundPiles.values()) {
      if (pile.entries.length > 0) {
        mapIds.add(pile.mapId);
      }
    }
    for (const state of this.containers.values()) {
      if (this.resolveContainerBySourceId(state.sourceId)) {
        mapIds.add(state.mapId);
      }
    }
    return [...mapIds].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }

  private hasPersistableRuntimeState(mapId: string): boolean {
    for (const pile of this.groundPiles.values()) {
      if (pile.mapId === mapId && pile.entries.length > 0) {
        return true;
      }
    }
    for (const state of this.containers.values()) {
      if (state.mapId === mapId && this.resolveContainerBySourceId(state.sourceId)) {
        return true;
      }
    }
    return false;
  }

  private toPersistedLootEntry(entry: LootEntry): PersistedLootEntryRecord {
    return {
      item: { ...entry.item },
      createdTick: entry.createdTick,
      expiresAtTick: entry.expiresAtTick,
      visible: entry.visible,
    };
  }

  private normalizePersistedGroundPile(mapId: string, raw: unknown): GroundPileState | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedGroundPileRecord>;
    if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y) || !Array.isArray(candidate.entries)) {
      return null;
    }

    const entries = candidate.entries
      .map((entry) => this.normalizePersistedLootEntry(entry))
      .filter((entry): entry is LootEntry => entry !== null);
    if (entries.length === 0) {
      return null;
    }

    return {
      sourceId: this.buildGroundSourceId(mapId, Number(candidate.x), Number(candidate.y)),
      mapId,
      x: Number(candidate.x),
      y: Number(candidate.y),
      entries,
    };
  }

  private normalizePersistedContainerState(mapId: string, raw: unknown): ContainerState | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedContainerRecord>;
    if (typeof candidate.containerId !== 'string' || !Array.isArray(candidate.entries)) {
      return null;
    }

    const entries = candidate.entries
      .map((entry) => this.normalizePersistedLootEntry(entry))
      .filter((entry): entry is LootEntry => entry !== null);

    return {
      sourceId: this.buildContainerSourceId(mapId, candidate.containerId),
      mapId,
      containerId: candidate.containerId,
      variant: candidate.variant === 'herb' ? 'herb' : undefined,
      generatedAtTick: Number.isInteger(candidate.generatedAtTick) ? Number(candidate.generatedAtTick) : undefined,
      refreshAtTick: Number.isInteger(candidate.refreshAtTick) ? Number(candidate.refreshAtTick) : undefined,
      respawnTotalTicks: Number.isInteger(candidate.respawnTotalTicks) ? Number(candidate.respawnTotalTicks) : undefined,
      entries,
      herb: this.normalizePersistedHerbMeta(candidate.herb),
      hp: Number.isFinite(candidate.hp) ? Math.max(0, Math.round(Number(candidate.hp))) : undefined,
      maxHp: Number.isFinite(candidate.maxHp) ? Math.max(1, Math.round(Number(candidate.maxHp))) : undefined,
      destroyed: candidate.destroyed === true,
      activeSearch: this.normalizePersistedContainerSearch(candidate.activeSearch),
    };
  }

  private normalizePersistedHerbMeta(raw: unknown): LootWindowHerbMeta | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }
    const candidate = raw as Partial<LootWindowHerbMeta>;
    if (
      typeof candidate.itemId !== 'string'
      || typeof candidate.name !== 'string'
      || !Number.isInteger(candidate.gatherTicks)
    ) {
      return undefined;
    }
    return {
      itemId: candidate.itemId,
      name: candidate.name,
      grade: candidate.grade,
      level: Number.isFinite(candidate.level) ? Math.max(1, Math.floor(Number(candidate.level))) : undefined,
      gatherTicks: Math.max(1, Math.floor(Number(candidate.gatherTicks))),
      nativeGatherTicks: Number.isFinite(candidate.nativeGatherTicks)
        ? Math.max(1, Math.floor(Number(candidate.nativeGatherTicks)))
        : undefined,
    };
  }

  private normalizePersistedContainerSearch(raw: unknown): ContainerState['activeSearch'] {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }

    const candidate = raw as Partial<PersistedContainerSearchRecord>;
    if (
      typeof candidate.itemKey !== 'string'
      || !Number.isInteger(candidate.totalTicks)
      || !Number.isInteger(candidate.remainingTicks)
    ) {
      return undefined;
    }

    const totalTicks = Math.max(1, Number(candidate.totalTicks));
    const remainingTicks = Math.max(0, Math.min(totalTicks, Number(candidate.remainingTicks)));
    if (remainingTicks <= 0) {
      return undefined;
    }

    return {
      itemKey: candidate.itemKey,
      mode: candidate.mode === 'harvest' ? 'harvest' : 'reveal',
      playerId: typeof candidate.playerId === 'string' && candidate.playerId.length > 0 ? candidate.playerId : undefined,
      totalTicks,
      remainingTicks,
    };
  }

  private normalizePersistedLootEntry(raw: unknown): LootEntry | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedLootEntryRecord>;
    const item = this.normalizePersistedItemStack(candidate.item);
    if (!item || !Number.isInteger(candidate.createdTick) || typeof candidate.visible !== 'boolean') {
      return null;
    }

    return {
      item,
      createdTick: Math.max(0, Number(candidate.createdTick)),
      expiresAtTick: Number.isInteger(candidate.expiresAtTick) ? Math.max(0, Number(candidate.expiresAtTick)) : undefined,
      visible: candidate.visible,
    };
  }

  private normalizePersistedItemStack(raw: unknown): ItemStack | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<ItemStack>;
    if (
      typeof candidate.itemId !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.type !== 'string'
      || !Number.isInteger(candidate.count)
      || typeof candidate.desc !== 'string'
    ) {
      return null;
    }

    return JSON.parse(JSON.stringify({
      ...candidate,
      count: Math.max(1, Number(candidate.count)),
    })) as ItemStack;
  }

  private markRuntimeStateDirty(): void {
    this.runtimeStateDirty = true;
  }
}
