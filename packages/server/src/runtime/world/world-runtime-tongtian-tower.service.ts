import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';

import { ContentTemplateRepository } from '../../content/content-template.repository';
import { resolveProjectPath } from '../../common/project-path';
import { MapInstanceRuntime } from '../instance/map-instance.runtime';
import { TongtianTowerPersistenceService } from '../../persistence/tongtian-tower-persistence.service';
import { MapTemplateRepository } from '../map/map-template.repository';

interface TongtianTowerConfig {
  id: string;
  name: string;
  entryMapId: string;
  entryX: number;
  entryY: number;
  exitMapId: string;
  exitX: number;
  exitY: number;
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  previousX: number;
  previousY: number;
  nextX: number;
  nextY: number;
  exitPortalX: number;
  exitPortalY: number;
  spawnIntervalTicks: number;
  normalMonstersPerPlayer: number;
  eliteMonstersPerPlayer: number;
  idleDestroyTicks: number;
  monsterId: string;
  eliteMonsterId: string;
}

interface TongtianTowerWaveState {
  waveId: number;
  layer: number;
  participantPlayerIds: string[];
  monsterRuntimeIds: string[];
}

interface TongtianTowerLayerState {
  layer: number;
  nextWaveId: number;
  nextSpawnTick: number;
  lastEmptyTick: number | null;
  lastActiveTick: number;
  activeWave: TongtianTowerWaveState | null;
}

const TOWER_INSTANCE_PREFIX = 'tower:tongtian:layer:';
const TOWER_TEMPLATE_PREFIX = 'tongtian_tower_layer_';

@Injectable()
export class WorldRuntimeTongtianTowerService {
  private readonly logger = new Logger(WorldRuntimeTongtianTowerService.name);
  private readonly config: TongtianTowerConfig;
  private readonly cachedLayerInstances = new Map<number, any>();

  constructor(
    @Inject(ContentTemplateRepository)
    private readonly contentTemplateRepository: any,
    @Inject(MapTemplateRepository)
    private readonly templateRepository: any,
    private readonly persistence: TongtianTowerPersistenceService,
  ) {
    this.config = loadTongtianTowerConfig();
  }

  async primeLayerInstanceCache(entry: { instance_id?: string; template_id?: string }, deps: any): Promise<boolean> {
    const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
    const templateId = typeof entry?.template_id === 'string' ? entry.template_id.trim() : '';
    const layer = parseTowerLayerFromInstanceId(instanceId) || parseTowerLayerFromTemplateId(templateId);
    if (layer <= 0) {
      return false;
    }
    if (this.cachedLayerInstances.has(layer) || deps.getInstanceRuntime?.(this.getTowerInstanceId(layer))) {
      return true;
    }
    const resolvedTemplateId = this.ensureLayerTemplate(layer);
    if (templateId && templateId !== resolvedTemplateId) {
      return false;
    }
    const instance = this.createDetachedLayerInstance(layer, this.getTowerInstanceId(layer), deps);
    try {
      if (typeof deps.hydratePersistentInstanceSnapshot === 'function') {
        await deps.hydratePersistentInstanceSnapshot(instance.meta.instanceId, instance);
      }
    } catch (error) {
      this.logger.warn(`通天塔实例恢复缓存失败：${instance.meta.instanceId} ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    this.ensureLayerState(instance, layer, deps.tick ?? instance.tick ?? 0);
    this.cachedLayerInstances.set(layer, instance);
    return true;
  }

  buildContextActions(view: any, deps: any): any[] {
    const actions: any[] = [];
    const mapId = String(view?.instance?.templateId ?? '').trim();
    const self = view?.self;
    if (!self || !Number.isFinite(Number(self.x)) || !Number.isFinite(Number(self.y))) {
      return actions;
    }
    if (mapId === this.config.entryMapId && isNear(self.x, self.y, this.config.entryX, this.config.entryY)) {
      actions.push({
        id: 'tower:tongtian:enter',
        name: '进入通天塔',
        type: 'travel',
        desc: '进入通天塔，继续当前记录层数。',
        cooldownLeft: 0,
      });
      return actions;
    }
    const layer = parseTowerLayerFromInstanceId(String(view?.instance?.instanceId ?? ''));
    if (layer <= 0) {
      return actions;
    }
    const playerId = resolveViewPlayerId(view);
    const progress = playerId ? this.persistence.getOrCreateProgress(playerId) : null;
    if (layer > 1) {
      actions.push({
        id: 'tower:tongtian:previous',
        name: '退到上一层',
        type: 'travel',
        desc: `退回通天塔第 ${layer - 1} 层。`,
        cooldownLeft: 0,
      });
    }
    if (progress && progress.highestLayer >= layer + 1) {
      actions.push({
        id: 'tower:tongtian:next',
        name: '前往下一层',
        type: 'travel',
        desc: `前往通天塔第 ${layer + 1} 层。`,
        cooldownLeft: 0,
      });
    }
    actions.push({
      id: 'tower:tongtian:exit',
      name: '退出通天塔',
      type: 'travel',
      desc: '离开通天塔并返回栖真渡，保留当前层数记录。',
      cooldownLeft: 0,
    });
    return actions;
  }

  executeAction(playerId: string, actionId: string, deps: any): any {
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    if (player && Number.isFinite(player.hp) && Number(player.hp) <= 0) {
      throw new BadRequestException('重伤倒地时不能操作通天塔');
    }
    if (actionId === 'tower:tongtian:enter') {
      return this.enterTower(playerId, deps);
    }
    if (actionId === 'tower:tongtian:previous') {
      return this.moveLayer(playerId, -1, deps);
    }
    if (actionId === 'tower:tongtian:next') {
      return this.moveLayer(playerId, 1, deps);
    }
    if (actionId === 'tower:tongtian:exit') {
      return this.exitTower(playerId, deps);
    }
    return null;
  }

  advanceInstance(instance: any, deps: any): void {
    const layer = parseTowerLayerFromInstanceId(String(instance?.meta?.instanceId ?? ''));
    if (layer <= 0) {
      return;
    }
    const state = this.ensureLayerState(instance, layer, deps.tick);
    const playerIds = listPlayerIds(instance);
    if (playerIds.length <= 0) {
      this.clearActiveWave(instance, state);
      if (state.lastEmptyTick === null) {
        state.lastEmptyTick = deps.tick;
      }
      return;
    }
    this.markLayerActive(state, deps.tick);
    if (state.activeWave) {
      const aliveCount = state.activeWave.monsterRuntimeIds
        .map((runtimeId) => instance.getMonster?.(runtimeId))
        .filter((monster) => monster?.alive === true).length;
      if (aliveCount <= 0) {
        this.completeWave(instance, state, deps);
      }
      return;
    }
    if (state.nextSpawnTick <= instance.tick) {
      this.spawnWave(instance, state);
    }
  }

  async cleanupIdleInstances(deps: any): Promise<void> {
    const entries = Array.from(deps.listInstanceEntries?.() ?? []);
    for (const [instanceId, instance] of entries as Array<[string, any]>) {
      const layer = parseTowerLayerFromInstanceId(instanceId);
      if (layer <= 0) {
        continue;
      }
      const state = this.ensureLayerState(instance, layer, deps.tick);
      if (listPlayerIds(instance).length > 0) {
        this.markLayerActive(state, deps.tick);
        continue;
      }
      this.clearActiveWave(instance, state);
      if (state.lastEmptyTick === null) {
        state.lastEmptyTick = deps.tick;
      }
      if (deps.tick - state.lastEmptyTick < this.config.idleDestroyTicks) {
        continue;
      }
      if (typeof deps.flushInstanceDomains === 'function') {
        try {
          await deps.flushInstanceDomains(instanceId);
        } catch (error) {
          this.logger.warn(`通天塔空闲实例落盘失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      instance.meta.runtimeStatus = 'stopped';
      instance.meta.status = 'destroyed';
      instance.meta.destroyAt = instance.meta.destroyAt ?? new Date().toISOString();
      deps.worldRuntimeInstanceStateService?.deleteInstanceRuntime?.(instanceId);
      deps.worldRuntimeTickProgressService?.clearInstance?.(instanceId);
      deps.instanceTickProgressById?.delete?.(instanceId);
      deps.worldRuntimeLootContainerService?.removeInstanceState?.(instanceId);
      if (typeof (deps as { runtimeEventBusService?: { discardInstance?: (id: string) => void } }).runtimeEventBusService?.discardInstance === 'function') {
        (deps as { runtimeEventBusService: { discardInstance: (id: string) => void } }).runtimeEventBusService.discardInstance(instanceId);
      }
      const formationService = (deps as { worldRuntimeFormationService?: { releaseInstance?: (id: string) => void } }).worldRuntimeFormationService;
      if (typeof formationService?.releaseInstance === 'function') {
        formationService.releaseInstance(instanceId);
      }
      await this.markCatalogDestroyed(deps, instanceId, instance);
      this.logger.log(`通天塔空闲实例已销毁：${instanceId}`);
    }
  }

  async flushPlayerProgress(playerId: string): Promise<void> {
    await this.persistence.flushProgress(playerId);
  }

  getLayerMonsterLevel(layerInput: number): number {
    return normalizeLayer(layerInput);
  }

  getTowerInstanceId(layerInput: number): string {
    return `${TOWER_INSTANCE_PREFIX}${normalizeLayer(layerInput)}`;
  }

  ensureLayerInstanceForRestore(
    input: { instanceId?: string | null; templateId?: string | null },
    deps: any,
    options: { allowCreate?: boolean } = {},
  ): any | null {
    const instanceId = typeof input?.instanceId === 'string' ? input.instanceId.trim() : '';
    const templateId = typeof input?.templateId === 'string' ? input.templateId.trim() : '';
    const layer = parseTowerLayerFromInstanceId(instanceId) || parseTowerLayerFromTemplateId(templateId);
    if (layer <= 0) {
      return null;
    }
    const expectedTemplateId = `${TOWER_TEMPLATE_PREFIX}${layer}`;
    if (templateId && templateId !== expectedTemplateId) {
      return null;
    }
    const existing = deps.getInstanceRuntime?.(this.getTowerInstanceId(layer));
    if (existing) {
      return existing;
    }
    if (options.allowCreate === false) {
      return null;
    }
    const cached = this.takeCachedLayerInstance(layer);
    if (cached) {
      this.prepareRestoredLayerInstance(cached, layer, deps.tick);
      if (typeof deps.setInstanceRuntime === 'function') {
        deps.setInstanceRuntime(this.getTowerInstanceId(layer), cached);
      } else if (typeof deps.worldRuntimeInstanceStateService?.setInstanceRuntime === 'function') {
        deps.worldRuntimeInstanceStateService.setInstanceRuntime(this.getTowerInstanceId(layer), cached);
      }
      deps.worldRuntimeTickProgressService?.initializeInstance?.(this.getTowerInstanceId(layer));
      return cached;
    }
    return this.ensureLayerInstance(layer, deps);
  }

  /** 恢复 catalog 中通天塔条目的模板注册（不创建实例）。 */
  restoreCatalogTowerTemplate(entry: { template_id?: string; instance_id?: string }, _deps?: any): boolean {
    const templateId = typeof entry?.template_id === 'string' ? entry.template_id.trim() : '';
    const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
    const layer = parseTowerLayerFromTemplateId(templateId) || parseTowerLayerFromInstanceId(instanceId);
    if (layer <= 0) {
      return false;
    }
    this.ensureLayerTemplate(layer);
    return true;
  }

  onPlayerSessionAttachedToLayer(instance: any, deps: any): void {
    const layer = parseTowerLayerFromInstanceId(String(instance?.meta?.instanceId ?? ''));
    if (layer <= 0) {
      return;
    }
    const state = this.ensureLayerState(instance, layer, deps.tick);
    this.markLayerActive(state, deps.tick);
    if (!state.activeWave && state.nextSpawnTick <= instance.tick) {
      this.spawnWave(instance, state);
    }
  }

  private enterTower(playerId: string, deps: any): any {
    const current = deps.getPlayerLocationOrThrow(playerId);
    const instance = deps.getInstanceRuntime(current.instanceId);
    const position = instance?.getPlayerPosition?.(playerId);
    if (!instance || instance.template?.id !== this.config.entryMapId || !position || !isNear(position.x, position.y, this.config.entryX, this.config.entryY)) {
      throw new BadRequestException('需要靠近栖真渡的通天塔入口');
    }
    const progress = this.persistence.getOrCreateProgress(playerId);
    return this.connectPlayerToLayer(playerId, progress.currentLayer, deps);
  }

  private moveLayer(playerId: string, direction: -1 | 1, deps: any): any {
    const layer = this.requireCurrentTowerLayer(playerId, deps);
    const progress = this.persistence.getOrCreateProgress(playerId);
    const nextLayer = layer + direction;
    if (nextLayer < 1) {
      throw new BadRequestException('第一层不能退到上一层');
    }
    if (direction > 0 && progress.highestLayer < nextLayer) {
      throw new BadRequestException('尚未通关当前层，不能前往下一层');
    }
    this.persistence.updateCurrentLayer(playerId, nextLayer);
    return this.connectPlayerToLayer(playerId, nextLayer, deps);
  }

  private exitTower(playerId: string, deps: any): any {
    this.requireCurrentTowerLayer(playerId, deps);
    deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
    deps.clearPendingCommand?.(playerId);
    const targetInstance = deps.getOrCreatePublicInstance(this.config.exitMapId);
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    const view = deps.worldRuntimePlayerSessionService.connectPlayer({
      playerId,
      sessionId: player?.sessionId ?? `session:${playerId}`,
      instanceId: targetInstance.meta.instanceId,
      preferredX: this.config.exitX,
      preferredY: this.config.exitY,
    }, deps);
    deps.queuePlayerNotice?.(playerId, '你退出通天塔，回到栖真渡。', 'success');
    void this.cleanupIdleInstances(deps).catch((error) => {
      this.logger.warn(`通天塔空闲实例清理失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return view;
  }

  private connectPlayerToLayer(playerId: string, layerInput: number, deps: any): any {
    const layer = normalizeLayer(layerInput);
    const instance = this.ensureLayerInstance(layer, deps);
    deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
    deps.clearPendingCommand?.(playerId);
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    const view = deps.worldRuntimePlayerSessionService.connectPlayer({
      playerId,
      sessionId: player?.sessionId ?? `session:${playerId}`,
      instanceId: instance.meta.instanceId,
      preferredX: this.config.spawnX,
      preferredY: this.config.spawnY,
    }, deps);
    const state = this.ensureLayerState(instance, layer, deps.tick);
    this.markLayerActive(state, deps.tick);
    if (!state.activeWave && state.nextSpawnTick <= instance.tick) {
      this.spawnWave(instance, state);
    }
    deps.queuePlayerNotice?.(playerId, `你进入通天塔第 ${layer} 层。`, 'success');
    return view;
  }

  private ensureLayerInstance(layer: number, deps: any): any {
    const instanceId = this.getTowerInstanceId(layer);
    const existing = deps.getInstanceRuntime(instanceId);
    if (existing) {
      return existing;
    }
    const cached = this.takeCachedLayerInstance(layer);
    if (cached) {
      this.prepareRestoredLayerInstance(cached, layer, deps.tick);
      if (typeof deps.setInstanceRuntime === 'function') {
        deps.setInstanceRuntime(instanceId, cached);
      } else if (typeof deps.worldRuntimeInstanceStateService?.setInstanceRuntime === 'function') {
        deps.worldRuntimeInstanceStateService.setInstanceRuntime(instanceId, cached);
      }
      deps.worldRuntimeTickProgressService?.initializeInstance?.(instanceId);
      return cached;
    }
    const templateId = this.ensureLayerTemplate(layer);
    const instance = deps.createInstance({
      instanceId,
      templateId,
      kind: 'tower',
      persistent: true,
      linePreset: 'peaceful',
      lineIndex: layer,
      displayName: `通天塔 第 ${layer} 层`,
      instanceOrigin: 'gm_manual',
      routeDomain: 'system',
    });
    this.ensureLayerState(instance, layer, deps.tick);
    return instance;
  }

  private ensureLayerTemplate(layer: number): string {
    const templateId = `${TOWER_TEMPLATE_PREFIX}${layer}`;
    if (this.templateRepository.has(templateId)) {
      return templateId;
    }
    const row = '.'.repeat(this.config.width);
    this.templateRepository.registerRuntimeMapTemplate({
      id: templateId,
      name: `通天塔 第 ${layer} 层`,
      width: this.config.width,
      height: this.config.height,
      mapGroupId: 'secret_realm',
      mapGroupName: '秘境',
      mapGroupOrder: 300,
      mapGroupMemberOrder: layer,
      routeDomain: 'system',
      terrainProfileId: 'tower_floor',
      mapLv: this.getLayerMonsterLevel(layer),
      description: '通天塔内纯粹空白的一层，四面无墙，只有上下层与退出的塔内交互。',
      hideMinimap: true,
      tiles: Array.from({ length: this.config.height }, () => row),
      portals: [],
      spawnPoint: { x: this.config.spawnX, y: this.config.spawnY },
      time: {
        offsetTicks: 2700,
        scale: 0,
        light: { base: 0, timeInfluence: 100 },
      },
      auras: [],
      resources: [],
      safeZones: [],
      tileEffects: [],
      resourceNodeGroups: [],
      landmarks: this.buildLayerLandmarks(layer),
      npcs: [],
      monsterSpawns: [],
    });
    return templateId;
  }

  private ensureLayerState(instance: any, layer: number, worldTick: number): TongtianTowerLayerState {
    const existing = instance.tongtianTowerState as TongtianTowerLayerState | undefined;
    if (existing) {
      return existing;
    }
    const state: TongtianTowerLayerState = {
      layer,
      nextWaveId: 1,
      nextSpawnTick: instance?.tick ?? 0,
      lastEmptyTick: null,
      lastActiveTick: worldTick,
      activeWave: null,
    };
    instance.tongtianTowerState = state;
    return state;
  }

  private markLayerActive(state: TongtianTowerLayerState, worldTick: number): void {
    state.lastActiveTick = worldTick;
    state.lastEmptyTick = null;
  }

  private cacheLayerInstance(layer: number, instance: any): void {
    this.cachedLayerInstances.set(normalizeLayer(layer), instance);
  }

  private takeCachedLayerInstance(layer: number): any | null {
    const normalizedLayer = normalizeLayer(layer);
    const cached = this.cachedLayerInstances.get(normalizedLayer) ?? null;
    if (cached) {
      this.cachedLayerInstances.delete(normalizedLayer);
    }
    return cached;
  }

  private prepareRestoredLayerInstance(instance: any, layer: number, worldTick: number): void {
    if (!instance || typeof instance !== 'object') {
      return;
    }
    instance.meta = instance.meta ?? {};
    instance.meta.persistent = true;
    instance.meta.persistentPolicy = 'persistent';
    instance.meta.status = 'active';
    instance.meta.runtimeStatus = instance.meta.assignedNodeId && instance.meta.leaseToken ? 'leased' : 'running';
    instance.meta.destroyAt = null;
    const state = this.ensureLayerState(instance, layer, worldTick);
    this.markLayerActive(state, worldTick);
  }

  private createDetachedLayerInstance(layer: number, instanceId: string, deps: any): any {
    const templateId = this.ensureLayerTemplate(layer);
    const template = this.templateRepository.getOrThrow(templateId);
    const instance = new MapInstanceRuntime({
      instanceId,
      template,
      buffRegistry: this.contentTemplateRepository.buffRegistry,
      monsterSpawns: this.contentTemplateRepository.createRuntimeMonstersForMap(template.id),
      kind: 'tower',
      persistent: true,
      persistentPolicy: 'persistent',
      createdAt: Date.now(),
      displayName: `通天塔 第 ${layer} 层`,
      linePreset: 'peaceful',
      lineIndex: layer,
      instanceOrigin: 'gm_manual',
      defaultEntry: false,
      supportsPvp: false,
      canDamageTile: false,
      status: 'active',
      runtimeStatus: 'running',
      routeDomain: 'system',
    });
    if (typeof instance.setDynamicTileBlocker === 'function') {
      instance.setDynamicTileBlocker((x, y, context = null) => (
        typeof deps.worldRuntimeFormationService?.isBoundaryBarrierBlocked === 'function'
          ? deps.worldRuntimeFormationService.isBoundaryBarrierBlocked(instanceId, x, y, context?.playerId) === true
          : false
      ));
    }
    return instance;
  }

  private spawnWave(instance: any, state: TongtianTowerLayerState): void {
    const participants = listPlayerIds(instance);
    if (participants.length <= 0) {
      return;
    }
    const waveId = state.nextWaveId++;
    const normalCount = participants.length * this.config.normalMonstersPerPlayer;
    const eliteCount = participants.length * this.config.eliteMonstersPerPlayer;
    const monsterRuntimeIds: string[] = [];
    const occupied = new Set<string>();
    let spawnIndex = 0;
    for (let index = 0; index < normalCount; index += 1) {
      const runtimeId = this.spawnWaveMonster(instance, state, waveId, spawnIndex, this.config.monsterId, `虚影·${state.layer}层`, occupied);
      monsterRuntimeIds.push(runtimeId);
      spawnIndex += 1;
    }
    for (let index = 0; index < eliteCount; index += 1) {
      const runtimeId = this.spawnWaveMonster(instance, state, waveId, spawnIndex, this.config.eliteMonsterId, `虚影精英·${state.layer}层`, occupied);
      monsterRuntimeIds.push(runtimeId);
      spawnIndex += 1;
    }
    state.activeWave = {
      waveId,
      layer: state.layer,
      participantPlayerIds: participants,
      monsterRuntimeIds,
    };
    state.nextSpawnTick = Number.POSITIVE_INFINITY;
  }

  private spawnWaveMonster(
    instance: any,
    state: TongtianTowerLayerState,
    waveId: number,
    spawnIndex: number,
    monsterId: string,
    name: string,
    occupied: Set<string>,
  ): string {
    const origin = this.resolveSpawnOrigin(spawnIndex);
    const position = this.findOpenSpawnPosition(instance, origin.x, origin.y, occupied);
    occupied.add(`${position.x},${position.y}`);
    const runtimeId = `tower:tongtian:${state.layer}:wave:${waveId}:monster:${spawnIndex}`;
    const spawn = this.contentTemplateRepository.createRuntimeMonsterSpawn(monsterId, {
      runtimeId,
      x: position.x,
      y: position.y,
      spawnOriginX: position.x,
      spawnOriginY: position.y,
      spawnKey: `tower_wave:${state.layer}:${waveId}`,
      level: this.getLayerMonsterLevel(state.layer),
      respawnTicks: this.config.spawnIntervalTicks,
      wanderRadius: 0,
      name,
    });
    if (!spawn) {
      throw new Error(`通天塔怪物配置不存在：${monsterId}`);
    }
    instance.addRuntimeMonster?.(spawn);
    return runtimeId;
  }

  private completeWave(instance: any, state: TongtianTowerLayerState, deps: any): void {
    const wave = state.activeWave;
    if (!wave) {
      return;
    }
    for (const runtimeId of wave.monsterRuntimeIds) {
      instance.removeRuntimeMonster?.(runtimeId);
    }
    const unlockedLayer = state.layer + 1;
    for (const playerId of wave.participantPlayerIds) {
      this.persistence.promoteHighestLayer(playerId, unlockedLayer);
      deps.queuePlayerNotice?.(playerId, `通天塔第 ${state.layer} 层已通关，可前往第 ${unlockedLayer} 层。`, 'success');
    }
    state.activeWave = null;
    state.nextSpawnTick = instance.tick + this.config.spawnIntervalTicks;
  }

  private clearActiveWave(instance: any, state: TongtianTowerLayerState): void {
    const wave = state.activeWave;
    if (!wave) {
      return;
    }
    for (const runtimeId of wave.monsterRuntimeIds) {
      instance.removeRuntimeMonster?.(runtimeId);
    }
    state.activeWave = null;
    state.nextSpawnTick = instance.tick + this.config.spawnIntervalTicks;
  }

  private requireCurrentTowerLayer(playerId: string, deps: any): number {
    const location = deps.getPlayerLocationOrThrow(playerId);
    const layer = parseTowerLayerFromInstanceId(location.instanceId);
    if (layer <= 0) {
      throw new BadRequestException('当前不在通天塔内');
    }
    return layer;
  }

  private buildLayerLandmarks(layer: number): Array<Record<string, unknown>> {
    const landmarks: Array<Record<string, unknown>> = [
      {
        id: `tongtian_tower_${layer}_next`,
        name: '前往下一层',
        x: this.config.nextX,
        y: this.config.nextY,
        desc: '通天塔向上的层阶，通关并解锁后可前往下一层。',
        container: {
          grade: 'mortal',
          char: '上',
          color: '#c7f9cc',
          drops: [],
          lootPools: [],
        },
      },
      {
        id: `tongtian_tower_${layer}_exit`,
        name: '退出通天塔',
        x: this.config.exitPortalX,
        y: this.config.exitPortalY,
        desc: '离开通天塔并返回栖真渡。',
        container: {
          grade: 'mortal',
          char: '出',
          color: '#fef3c7',
          drops: [],
          lootPools: [],
        },
      },
    ];
    if (layer > 1) {
      landmarks.unshift({
        id: `tongtian_tower_${layer}_previous`,
        name: '退到上一层',
        x: this.config.previousX,
        y: this.config.previousY,
        desc: '通天塔向下的层阶，可退回上一层。',
        container: {
          grade: 'mortal',
          char: '下',
          color: '#bfdbfe',
          drops: [],
          lootPools: [],
        },
      });
    }
    return landmarks;
  }

  private async markCatalogDestroyed(deps: any, instanceId: string, instance: any): Promise<void> {
    if (typeof deps.instanceCatalogService?.isEnabled !== 'function' || deps.instanceCatalogService.isEnabled() !== true) {
      return;
    }
    try {
      await deps.instanceCatalogService.upsertInstanceCatalog({
        instanceId,
        templateId: instance?.template?.id ?? '',
        instanceType: typeof instance?.meta?.kind === 'string' ? instance.meta.kind : 'tower',
        persistentPolicy: typeof instance?.meta?.persistentPolicy === 'string' ? instance.meta.persistentPolicy : 'persistent',
        ownerPlayerId: null,
        ownerSectId: null,
        partyId: null,
        lineId: instance?.meta?.lineId ?? null,
        status: 'destroyed',
        runtimeStatus: 'stopped',
        assignedNodeId: null,
        leaseToken: null,
        leaseExpireAt: null,
        ownershipEpoch: instance?.meta?.ownershipEpoch ?? 0,
        clusterId: instance?.meta?.clusterId ?? null,
        shardKey: instance?.meta?.shardKey ?? instanceId,
        routeDomain: instance?.meta?.routeDomain ?? null,
        destroyAt: instance?.meta?.destroyAt ?? new Date().toISOString(),
        lastActiveAt: instance?.meta?.lastActiveAt ?? null,
        lastPersistedAt: instance?.meta?.lastPersistedAt ?? null,
      });
    } catch (error) {
      this.logger.warn(`通天塔实例目录销毁标记失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resolveSpawnOrigin(index: number): { x: number; y: number } {
    const ring = 1 + Math.floor(index / 8);
    const offset = index % 8;
    const candidates = [
      { x: this.config.spawnX - ring, y: this.config.spawnY - ring },
      { x: this.config.spawnX, y: this.config.spawnY - ring },
      { x: this.config.spawnX + ring, y: this.config.spawnY - ring },
      { x: this.config.spawnX + ring, y: this.config.spawnY },
      { x: this.config.spawnX + ring, y: this.config.spawnY + ring },
      { x: this.config.spawnX, y: this.config.spawnY + ring },
      { x: this.config.spawnX - ring, y: this.config.spawnY + ring },
      { x: this.config.spawnX - ring, y: this.config.spawnY },
    ];
    return candidates[offset] ?? { x: this.config.spawnX, y: this.config.spawnY };
  }

  private findOpenSpawnPosition(instance: any, x: number, y: number, occupied: Set<string>): { x: number; y: number } {
    const preferred = clampPoint(x, y, this.config.width, this.config.height);
    if (instance.isOpenTile?.(preferred.x, preferred.y) === true && !occupied.has(`${preferred.x},${preferred.y}`)) {
      return preferred;
    }
    for (let radius = 1; radius < Math.max(this.config.width, this.config.height); radius += 1) {
      for (let yy = Math.max(0, preferred.y - radius); yy <= Math.min(this.config.height - 1, preferred.y + radius); yy += 1) {
        for (let xx = Math.max(0, preferred.x - radius); xx <= Math.min(this.config.width - 1, preferred.x + radius); xx += 1) {
          if (Math.abs(xx - preferred.x) !== radius && Math.abs(yy - preferred.y) !== radius) {
            continue;
          }
          if (occupied.has(`${xx},${yy}`)) {
            continue;
          }
          if (instance.isOpenTile?.(xx, yy) === true) {
            return { x: xx, y: yy };
          }
        }
      }
    }
    return preferred;
  }
}

function loadTongtianTowerConfig(): TongtianTowerConfig {
  const filePath = resolveProjectPath('packages', 'server', 'data', 'content', 'tongtian-tower.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  return {
    id: normalizeString(raw.id, 'tongtian_tower'),
    name: normalizeString(raw.name, '通天塔'),
    entryMapId: normalizeString(raw.entryMapId, 'qizhen_crossing'),
    entryX: normalizeCoordinate(raw.entryX, 0),
    entryY: normalizeCoordinate(raw.entryY, 0),
    exitMapId: normalizeString(raw.exitMapId, 'qizhen_crossing'),
    exitX: normalizeCoordinate(raw.exitX, 0),
    exitY: normalizeCoordinate(raw.exitY, 0),
    width: normalizePositiveInteger(raw.width, 20),
    height: normalizePositiveInteger(raw.height, 20),
    spawnX: normalizeCoordinate(raw.spawnX, 10),
    spawnY: normalizeCoordinate(raw.spawnY, 10),
    previousX: normalizeCoordinate(raw.previousX, 2),
    previousY: normalizeCoordinate(raw.previousY, 10),
    nextX: normalizeCoordinate(raw.nextX, 17),
    nextY: normalizeCoordinate(raw.nextY, 10),
    exitPortalX: normalizeCoordinate(raw.exitPortalX, 10),
    exitPortalY: normalizeCoordinate(raw.exitPortalY, 17),
    spawnIntervalTicks: normalizePositiveInteger(raw.spawnIntervalTicks, 60),
    normalMonstersPerPlayer: normalizePositiveInteger(raw.normalMonstersPerPlayer, 4),
    eliteMonstersPerPlayer: normalizeNonNegativeInteger(raw.eliteMonstersPerPlayer, 1),
    idleDestroyTicks: normalizePositiveInteger(raw.idleDestroyTicks, 3600),
    monsterId: normalizeString(raw.monsterId, 'm_tongtian_shadow'),
    eliteMonsterId: normalizeString(raw.eliteMonsterId, 'm_tongtian_shadow_elite'),
  };
}

function parseTowerLayerFromInstanceId(instanceId: string): number {
  if (!instanceId.startsWith(TOWER_INSTANCE_PREFIX)) {
    return 0;
  }
  return normalizeLayer(instanceId.slice(TOWER_INSTANCE_PREFIX.length));
}

function parseTowerLayerFromTemplateId(templateId: string): number {
  if (!templateId.startsWith(TOWER_TEMPLATE_PREFIX)) {
    return 0;
  }
  return normalizeLayer(templateId.slice(TOWER_TEMPLATE_PREFIX.length));
}

function resolveViewPlayerId(view: any): string | null {
  const candidates = [
    view?.playerId,
    view?.self?.playerId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const playerId = candidate.trim();
    if (playerId) {
      return playerId;
    }
  }
  return null;
}

function listPlayerIds(instance: any): string[] {
  return typeof instance?.listPlayerIds === 'function'
    ? instance.listPlayerIds().filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function isNear(xInput: unknown, yInput: unknown, targetX: number, targetY: number): boolean {
  const x = Number(xInput);
  const y = Number(yInput);
  return Number.isFinite(x) && Number.isFinite(y) && Math.max(Math.abs(Math.trunc(x) - targetX), Math.abs(Math.trunc(y) - targetY)) <= 1;
}

function normalizeLayer(value: unknown): number {
  const layer = Number(value);
  return Number.isFinite(layer) ? Math.max(1, Math.trunc(layer)) : 1;
}

function normalizeString(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.trunc(parsed)) : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function normalizeCoordinate(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function clampPoint(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(width - 1, Math.trunc(x))),
    y: Math.max(0, Math.min(height - 1, Math.trunc(y))),
  };
}
