/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';

import { ContentTemplateRepository } from '../../content/content-template.repository';
import { resolveProjectPath } from '../../common/project-path';
import { MapInstanceRuntime } from '../instance/map-instance.runtime';
import { TongtianTowerPersistenceService } from '../../persistence/tongtian-tower-persistence.service';
import { MapTemplateRepository } from '../map/map-template.repository';
import {
  acquireCatalogBackedInstanceLeaseForRestore,
  destroyManagedInstance,
} from './world-runtime-instance-lease.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';

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
  layerChangeCooldownSeconds: number;
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
const TOWER_ENTER_ACTION_ID = 'tower:tongtian:enter';
const TOWER_PREVIOUS_ACTION_ID = 'tower:tongtian:previous';
const TOWER_NEXT_ACTION_ID = 'tower:tongtian:next';
const TOWER_EXIT_ACTION_ID = 'tower:tongtian:exit';

@Injectable()
export class WorldRuntimeTongtianTowerService {
  private readonly logger = new Logger(WorldRuntimeTongtianTowerService.name);
  private readonly config: TongtianTowerConfig;
  private readonly layerMaterializationTasks = new Map<string, Promise<any | null>>();
  private materializationGeneration = 0;
  private materializationResetInProgress = false;
  private readonly resetQuiescedInstances = new Map<any, string>();

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
    const resolvedTemplateId = this.ensureLayerTemplate(layer);
    if (templateId && templateId !== resolvedTemplateId) {
      return false;
    }
    // 塔层只注册模板，不在启动时缓存 catalog 行或持有 detached lease。
    // 玩家真正引用该层时会 fresh load catalog，并按 instanceId 串行物化。
    return true;
  }

  async resetLayerInstanceCache(deps: any): Promise<void> {
    this.materializationResetInProgress = true;
    this.materializationGeneration += 1;
    this.resetQuiescedInstances.clear();
    for (const [instanceId, instance] of deps.listInstanceEntries?.() ?? []) {
      if (parseTowerLayerFromInstanceId(String(instanceId)) <= 0 || !instance?.meta) {
        continue;
      }
      this.resetQuiescedInstances.set(instance, instance.meta.runtimeStatus ?? 'running');
      instance.meta.runtimeStatus = 'ownership_transition';
    }
    const pending = Array.from(this.layerMaterializationTasks.entries());
    if (pending.length > 0) {
      await Promise.allSettled(pending.map(([, task]) => task));
    }
    for (const [instanceId, task] of pending) {
      if (this.layerMaterializationTasks.get(instanceId) === task) {
        this.layerMaterializationTasks.delete(instanceId);
      }
    }
  }

  completeLayerInstanceCacheReset(): void {
    for (const [instance, previousRuntimeStatus] of this.resetQuiescedInstances) {
      if (instance?.meta?.runtimeStatus === 'ownership_transition') {
        instance.meta.runtimeStatus = previousRuntimeStatus;
      }
    }
    this.resetQuiescedInstances.clear();
    this.materializationResetInProgress = false;
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
        id: TOWER_ENTER_ACTION_ID,
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
    const layerChangeCooldown = playerId && progress
      ? this.resolveLayerChangeCooldownProjection(playerId, progress.layerChangeCooldownUntilMs, view, deps)
      : { cooldownLeft: 0 };
    if (layer > 1) {
      actions.push({
        id: TOWER_PREVIOUS_ACTION_ID,
        name: '退到上一层',
        type: 'travel',
        desc: `退回通天塔第 ${layer - 1} 层。`,
        ...layerChangeCooldown,
      });
    }
    if (progress && progress.highestLayer >= layer + 1) {
      actions.push({
        id: TOWER_NEXT_ACTION_ID,
        name: '前往下一层',
        type: 'travel',
        desc: `前往通天塔第 ${layer + 1} 层。`,
        ...layerChangeCooldown,
      });
    }
    actions.push({
      id: TOWER_EXIT_ACTION_ID,
      name: '退出通天塔',
      type: 'travel',
      desc: '离开通天塔并返回栖真渡，保留当前层数记录。',
      cooldownLeft: 0,
    });
    return actions;
  }

  async executeAction(playerId: string, actionId: string, deps: any): Promise<any> {
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    if (player && Number.isFinite(player.hp) && Number(player.hp) <= 0) {
      throw new BadRequestException('重伤倒地时不能操作通天塔');
    }
    if (actionId === TOWER_ENTER_ACTION_ID) {
      return this.enterTower(playerId, deps);
    }
    if (actionId === TOWER_PREVIOUS_ACTION_ID) {
      return this.moveLayer(playerId, -1, deps);
    }
    if (actionId === TOWER_NEXT_ACTION_ID) {
      return this.moveLayer(playerId, 1, deps);
    }
    if (actionId === TOWER_EXIT_ACTION_ID) {
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
      if (typeof deps.flushInstanceDomains !== 'function') {
        this.logger.warn(`通天塔空闲实例缺少落盘能力，保留运行态：${instanceId}`);
        continue;
      }
      try {
        await deps.flushInstanceDomains(instanceId);
      } catch (error) {
        this.logger.warn(`通天塔空闲实例落盘失败，保留运行态：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const remainingDirtyInstanceIds = typeof deps.listDirtyPersistentInstances === 'function'
        ? deps.listDirtyPersistentInstances()
        : [];
      if (Array.isArray(remainingDirtyInstanceIds) && remainingDirtyInstanceIds.includes(instanceId)) {
        this.logger.warn(`通天塔空闲实例落盘后仍有未持久化状态，保留运行态：${instanceId}`);
        continue;
      }
      let destroyResult: { ok?: boolean; reason?: string } | null = null;
      try {
        destroyResult = await destroyManagedInstance(deps, instanceId, 'tongtian_idle_timeout');
      } catch (error) {
        this.logger.warn(`通天塔空闲实例销毁失败，保留运行态：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (destroyResult?.ok !== true) {
        this.logger.warn(`通天塔空闲实例销毁被拒绝，保留运行态：${instanceId} reason=${destroyResult?.reason ?? 'unknown'}`);
        continue;
      }
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

  /** 兼容同步查询入口：只返回已经完成 lease/hydrate 的塔层，不在这里创建或接管。 */
  activateCachedLayerInstanceForRestore(
    input: { instanceId?: string | null; templateId?: string | null },
    deps: any,
  ): any | null {
    if (this.materializationResetInProgress) {
      return null;
    }
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
    const resolvedInstanceId = this.getTowerInstanceId(layer);
    const existing = deps.getInstanceRuntime?.(resolvedInstanceId) ?? null;
    return isTowerInstanceReady(existing, deps) ? existing : null;
  }

  ensureLayerInstanceForRestore(
    input: { instanceId?: string | null; templateId?: string | null },
    deps: any,
    _options: { allowCreate?: boolean; requireCatalogEntry?: boolean } = {},
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
    return this.activateCachedLayerInstanceForRestore(input, deps);
  }

  /**
   * 从权威 catalog 按需物化稳定塔层。
   *
   * 同一 instanceId 只允许一个任务执行；catalog-backed 路径绕开 createInstance 的自动
   * readiness，先 direct mount 为 stopped，再 exact claim/revive、完整 hydrate，最后开放 gate。
   */
  async materializeLayerInstanceForRestore(
    input: { instanceId?: string | null; templateId?: string | null },
    deps: any,
    options: { allowCreateIfMissing?: boolean } = {},
  ): Promise<any | null> {
    if (this.materializationResetInProgress) {
      return null;
    }
    const instanceId = typeof input?.instanceId === 'string' ? input.instanceId.trim() : '';
    const templateId = typeof input?.templateId === 'string' ? input.templateId.trim() : '';
    const layer = parseTowerLayerFromInstanceId(instanceId) || parseTowerLayerFromTemplateId(templateId);
    if (layer <= 0) {
      return null;
    }
    const expectedTemplateId = `${TOWER_TEMPLATE_PREFIX}${layer}`;
    const resolvedInstanceId = this.getTowerInstanceId(layer);
    if ((instanceId && instanceId !== resolvedInstanceId) || (templateId && templateId !== expectedTemplateId)) {
      return null;
    }
    const ready = deps.getInstanceRuntime?.(resolvedInstanceId) ?? null;
    if (isTowerInstanceReady(ready, deps)) {
      return ready;
    }
    const pending = this.layerMaterializationTasks.get(resolvedInstanceId);
    if (pending) {
      return pending;
    }
    const generation = this.materializationGeneration;
    const task = this.materializeLayerInstance(
      layer,
      resolvedInstanceId,
      expectedTemplateId,
      generation,
      deps,
      options,
    );
    this.layerMaterializationTasks.set(resolvedInstanceId, task);
    try {
      return await task;
    } catch (error) {
      this.logger.warn(
        `通天塔按需物化异常：${resolvedInstanceId} ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      if (this.layerMaterializationTasks.get(resolvedInstanceId) === task) {
        this.layerMaterializationTasks.delete(resolvedInstanceId);
      }
    }
  }

  /** 恢复 catalog 中通天塔条目的模板注册（不创建实例）。 */
  restoreCatalogTowerTemplate(
    entry: { template_id?: string; instance_id?: string; [key: string]: unknown },
    _deps?: any,
  ): boolean {
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
    if (state.activeWave) {
      this.includeWaveParticipants(state.activeWave, listPlayerIds(instance));
    } else if (state.nextSpawnTick <= instance.tick) {
      this.spawnWave(instance, state);
    }
  }

  private async enterTower(playerId: string, deps: any): Promise<any> {
    const current = deps.getPlayerLocationOrThrow(playerId);
    const instance = deps.getInstanceRuntime(current.instanceId);
    const position = instance?.getPlayerPosition?.(playerId);
    if (!instance || instance.template?.id !== this.config.entryMapId || !position || !isNear(position.x, position.y, this.config.entryX, this.config.entryY)) {
      throw new BadRequestException('需要靠近栖真渡的通天塔入口');
    }
    const progress = this.persistence.getOrCreateProgress(playerId);
    return this.connectPlayerToLayer(playerId, progress.currentLayer, deps);
  }

  private async moveLayer(playerId: string, direction: -1 | 1, deps: any): Promise<any> {
    const layer = this.requireCurrentTowerLayer(playerId, deps);
    const progress = this.persistence.getOrCreateProgress(playerId);
    const nextLayer = layer + direction;
    if (nextLayer < 1) {
      throw new BadRequestException('第一层不能退到上一层');
    }
    if (direction > 0 && progress.highestLayer < nextLayer) {
      throw new BadRequestException('尚未通关当前层，不能前往下一层');
    }
    const cooldownLeft = this.resolveLayerChangeCooldownLeft(progress.layerChangeCooldownUntilMs, deps);
    if (cooldownLeft > 0) {
      throw new BadRequestException(`通天塔换层冷却尚未结束，还需 ${cooldownLeft} 秒`);
    }
    const view = await this.connectPlayerToLayer(playerId, nextLayer, deps);
    this.persistence.updateCurrentLayer(playerId, nextLayer);
    return view;
  }

  private async exitTower(playerId: string, deps: any): Promise<any> {
    this.requireCurrentTowerLayer(playerId, deps);
    deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
    deps.clearPendingCommand?.(playerId);
    const targetInstance = deps.getOrCreatePublicInstance(this.config.exitMapId);
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    const view = await this.connectPlayerAfterLeaseReady({
      playerId,
      sessionId: player?.sessionId ?? `session:${playerId}`,
      instanceId: targetInstance.meta.instanceId,
      preferredX: this.config.exitX,
      preferredY: this.config.exitY,
      relocateExisting: true,
    }, deps);
    const exitMapName = targetInstance.template?.name ?? '栖真渡';
    const exitNotice = buildStructuredNotice(
      'success',
      'notice.tower.exited',
      `你退出通天塔，回到${exitMapName}。`,
      { vars: { mapName: exitMapName }, pills: [{ key: 'mapName', style: 'target' }] },
    );
    deps.queuePlayerNotice?.(
      playerId,
      exitNotice.text,
      exitNotice.kind,
      undefined,
      undefined,
      exitNotice.structured,
    );
    void this.cleanupIdleInstances(deps).catch((error) => {
      this.logger.warn(`通天塔空闲实例清理失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return view;
  }

  private async connectPlayerToLayer(playerId: string, layerInput: number, deps: any): Promise<any> {
    const layer = normalizeLayer(layerInput);
    const instance = await this.materializeLayerInstanceForRestore(
      {
        instanceId: this.getTowerInstanceId(layer),
        templateId: `${TOWER_TEMPLATE_PREFIX}${layer}`,
      },
      deps,
      { allowCreateIfMissing: true },
    );
    if (!instance) {
      throw new BadRequestException(`通天塔第 ${layer} 层暂不可进入`);
    }
    deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
    deps.clearPendingCommand?.(playerId);
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    const view = await this.connectPlayerAfterLeaseReady({
      playerId,
      sessionId: player?.sessionId ?? `session:${playerId}`,
      instanceId: instance.meta.instanceId,
      preferredX: this.config.spawnX,
      preferredY: this.config.spawnY,
      relocateExisting: true,
    }, deps);
    const state = this.ensureLayerState(instance, layer, deps.tick);
    this.markLayerActive(state, deps.tick);
    if (state.activeWave) {
      this.includeWaveParticipants(state.activeWave, listPlayerIds(instance));
    } else if (state.nextSpawnTick <= instance.tick) {
      this.spawnWave(instance, state);
    }
    const enteredNotice = buildStructuredNotice(
      'success',
      'notice.tower.entered',
      `你进入通天塔第 ${layer} 层。`,
      { vars: { layer }, pills: [{ key: 'layer', style: 'damage' }] },
    );
    deps.queuePlayerNotice?.(
      playerId,
      enteredNotice.text,
      enteredNotice.kind,
      undefined,
      undefined,
      enteredNotice.structured,
    );
    return view;
  }

  private async connectPlayerAfterLeaseReady(input: any, deps: any): Promise<any> {
    const sessionService = deps.worldRuntimePlayerSessionService;
    if (typeof sessionService?.connectPlayerWhenReady === 'function') {
      return sessionService.connectPlayerWhenReady(input, deps);
    }
    return sessionService.connectPlayer(input, deps);
  }

  private async materializeLayerInstance(
    layer: number,
    instanceId: string,
    templateId: string,
    generation: number,
    deps: any,
    options: { allowCreateIfMissing?: boolean },
  ): Promise<any | null> {
    const mounted = deps.getInstanceRuntime?.(instanceId) ?? null;
    if (mounted && !isTowerInstanceReady(mounted, deps)) {
      await waitForInstanceReadiness(instanceId, deps);
      const settledMounted = deps.getInstanceRuntime?.(instanceId) ?? null;
      if (isTowerInstanceReady(settledMounted, deps)) {
        return settledMounted;
      }
      if (settledMounted) {
        this.logger.warn(`通天塔已有运行态尚未就绪，拒绝覆盖物化：${instanceId}`);
        return null;
      }
    }

    const catalogEnabled = deps.instanceCatalogService?.isEnabled?.() === true;
    const catalog = catalogEnabled && typeof deps.instanceCatalogService?.loadInstanceCatalog === 'function'
      ? await deps.instanceCatalogService.loadInstanceCatalog(instanceId)
      : null;
    if (generation !== this.materializationGeneration) {
      return null;
    }
    if (!catalog) {
      if (options.allowCreateIfMissing !== true) {
        return null;
      }
      const current = deps.getInstanceRuntime?.(instanceId) ?? null;
      if (current) {
        if (isTowerInstanceReady(current, deps)) {
          return current;
        }
        this.logger.warn(`通天塔已有运行态尚未就绪，拒绝新建覆盖：${instanceId}`);
        return null;
      }
      let created: any | null = null;
      try {
        created = deps.createInstance({
          instanceId,
          templateId: this.ensureLayerTemplate(layer),
          kind: 'tower',
          persistent: true,
          linePreset: 'peaceful',
          lineIndex: layer,
          displayName: `通天塔 第 ${layer} 层`,
          instanceOrigin: 'gm_manual',
          routeDomain: 'system',
          supportsPvp: false,
          canDamageTile: false,
        });
        await waitForInstanceReadiness(instanceId, deps);
        if (generation !== this.materializationGeneration
          || deps.getInstanceRuntime?.(instanceId) !== created
          || !isTowerInstanceReady(created, deps)) {
          await this.cleanupOwnedMaterialization(instanceId, created, deps);
          return null;
        }
        this.ensureLayerState(created, layer, deps.tick);
        return created;
      } catch (error) {
        await this.cleanupOwnedMaterialization(instanceId, created, deps);
        throw error;
      }
    }

    if (!isExpectedTowerCatalogEntry(catalog, instanceId, templateId)) {
      this.logger.warn(`通天塔 catalog 身份不一致，拒绝物化：${instanceId}`);
      return null;
    }
    const current = deps.getInstanceRuntime?.(instanceId) ?? null;
    if (current) {
      if (isTowerInstanceReady(current, deps)) {
        return current;
      }
      this.logger.warn(`通天塔已有运行态尚未就绪，拒绝 catalog 覆盖物化：${instanceId}`);
      return null;
    }
    if (typeof deps.worldRuntimeInstanceStateService?.setInstanceRuntime !== 'function'
      || typeof deps.worldRuntimeInstanceStateService?.deleteInstanceRuntime !== 'function') {
      this.logger.warn(`通天塔按需物化缺少 direct mount 能力：${instanceId}`);
      return null;
    }

    const instance = this.createDetachedLayerInstance(layer, instanceId, deps, catalog);
    instance.meta.runtimeStatus = 'stopped';
    deps.worldRuntimeInstanceStateService.setInstanceRuntime(instanceId, instance);
    try {
      const acquired = await acquireCatalogBackedInstanceLeaseForRestore(
        deps,
        instanceId,
        instance,
        { expectedTemplateId: templateId, expectedInstanceType: 'tower' },
      );
      if (acquired?.ok !== true) {
        this.logger.warn(`通天塔按需物化未取得实例租约：${instanceId} reason=${acquired?.reason ?? 'unknown'}`);
        await this.cleanupOwnedMaterialization(instanceId, instance, deps);
        return null;
      }
      if (generation !== this.materializationGeneration) {
        await this.cleanupOwnedMaterialization(instanceId, instance, deps);
        return null;
      }
      this.ensureLayerState(instance, layer, deps.tick ?? instance.tick ?? 0);
      deps.worldRuntimeTickProgressService?.initializeInstance?.(instanceId);
      this.openMaterializedInstanceGates(instanceId, deps);
      return instance;
    } catch (error) {
      await this.cleanupOwnedMaterialization(instanceId, instance, deps);
      this.logger.warn(`通天塔按需物化失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private openMaterializedInstanceGates(instanceId: string, deps: any): void {
    this.openMaterializedInstanceWriteGate(instanceId, deps);
    this.openMaterializedInstanceAttachGate(instanceId, deps);
  }

  private openMaterializedInstanceWriteGate(instanceId: string, deps: any): void {
    const snapshot = deps.startupBarrierService?.getSnapshot?.();
    if (!snapshot || snapshot.instanceWriteOpen === true) {
      deps.startupBarrierService?.openInstanceWrites?.([instanceId]);
    }
  }

  private openMaterializedInstanceAttachGate(instanceId: string, deps: any): void {
    const snapshot = deps.startupBarrierService?.getSnapshot?.();
    if (!snapshot || snapshot.instanceAttachOpen === true) {
      deps.startupBarrierService?.openInstanceAttach?.([instanceId]);
    }
  }

  private async cleanupOwnedMaterialization(instanceId: string, instance: any, deps: any): Promise<void> {
    if (!instance || deps.getInstanceRuntime?.(instanceId) !== instance) {
      return;
    }
    await this.releaseDetachedLayerLease(instanceId, instance, deps);
    this.discardDetachedLayerRuntime(instanceId, deps, instance);
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
      const normalizedWorldTick = Math.max(0, Math.trunc(Number(worldTick) || 0));
      const persistedAnchor = Math.max(
        Math.max(0, Math.trunc(Number(existing.lastActiveTick) || 0)),
        existing.lastEmptyTick === null ? 0 : Math.max(0, Math.trunc(Number(existing.lastEmptyTick) || 0)),
      );
      if (normalizedWorldTick < persistedAnchor) {
        // world tick 是进程内时钟；重启后从 0 重计，不能沿用上一进程的空闲锚点。
        existing.lastActiveTick = normalizedWorldTick;
        existing.lastEmptyTick = null;
      }
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

  private discardDetachedLayerRuntime(instanceId: string, deps: any, expectedInstance?: any): void {
    if (expectedInstance && deps.getInstanceRuntime?.(instanceId) !== expectedInstance) {
      return;
    }
    deps.worldRuntimeInstanceStateService?.deleteInstanceRuntime?.(instanceId);
    deps.worldRuntimeTickProgressService?.clearInstance?.(instanceId);
    deps.worldRuntimeLootContainerService?.removeInstanceState?.(instanceId);
    deps.runtimeEventBusService?.discardInstance?.(instanceId);
    deps.worldRuntimeFormationService?.releaseInstance?.(instanceId);
  }

  private async releaseDetachedLayerLease(instanceId: string, instance: any, deps: any): Promise<void> {
    if (!deps.instanceCatalogService?.isEnabled?.()
      || typeof deps.instanceCatalogService.releaseInstanceLease !== 'function') {
      return;
    }
    const nodeId = typeof deps.nodeRegistryService?.getNodeId === 'function'
      ? String(deps.nodeRegistryService.getNodeId()).trim()
      : '';
    const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string'
      ? instance.meta.assignedNodeId.trim()
      : '';
    const leaseToken = typeof instance?.meta?.leaseToken === 'string'
      ? instance.meta.leaseToken.trim()
      : '';
    if (!nodeId || assignedNodeId !== nodeId || !leaseToken) {
      return;
    }
    try {
      const released = await deps.instanceCatalogService.releaseInstanceLease({
        instanceId,
        nodeId,
        leaseToken,
      });
      if (released === true) {
        instance.meta.assignedNodeId = null;
        instance.meta.leaseToken = null;
        instance.meta.leaseExpireAt = null;
        instance.meta.runtimeStatus = 'running';
      }
    } catch (error) {
      this.logger.warn(`通天塔缓存 lease 释放失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createDetachedLayerInstance(
    layer: number,
    instanceId: string,
    deps: any,
    entry: Record<string, unknown> = {},
  ): any {
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
      runtimeStatus: typeof entry.runtime_status === 'string' ? entry.runtime_status : 'running',
      assignedNodeId: typeof entry.assigned_node_id === 'string' ? entry.assigned_node_id : null,
      leaseToken: typeof entry.lease_token === 'string' ? entry.lease_token : null,
      leaseExpireAt: entry.lease_expire_at ? new Date(entry.lease_expire_at as string | number | Date).toISOString() : null,
      ownershipEpoch: Number.isFinite(Number(entry.ownership_epoch)) ? Math.trunc(Number(entry.ownership_epoch)) : 0,
      clusterId: typeof entry.cluster_id === 'string' ? entry.cluster_id : null,
      shardKey: typeof entry.shard_key === 'string' && entry.shard_key.trim() ? entry.shard_key : instanceId,
      routeDomain: typeof entry.route_domain === 'string' ? entry.route_domain : 'system',
      destroyAt: entry.destroy_at ? new Date(entry.destroy_at as string | number | Date).toISOString() : null,
      lastActiveAt: entry.last_active_at ? new Date(entry.last_active_at as string | number | Date).toISOString() : null,
      lastPersistedAt: entry.last_persisted_at ? new Date(entry.last_persisted_at as string | number | Date).toISOString() : null,
    });
    if (typeof instance.setDynamicTileBlocker === 'function') {
      const blocker: any = (x, y, context = null) => (
        typeof deps.worldRuntimeFormationService?.isBoundaryBarrierBlocked === 'function'
          ? deps.worldRuntimeFormationService.isBoundaryBarrierBlocked(instanceId, x, y, context?.playerId) === true
          : false
      );
      blocker.forEachBlockedTile = (playerId, visitor) => {
        deps.worldRuntimeFormationService?.forEachBoundaryBarrierBlockedTile?.(instanceId, playerId, visitor);
      };
      instance.setDynamicTileBlocker(blocker);
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

  private includeWaveParticipants(wave: TongtianTowerWaveState, playerIds: string[]): void {
    if (playerIds.length <= 0) {
      return;
    }
    const participantIds = new Set(wave.participantPlayerIds);
    for (const playerId of playerIds) {
      if (participantIds.has(playerId)) {
        continue;
      }
      participantIds.add(playerId);
      wave.participantPlayerIds.push(playerId);
    }
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
    const firstClearNotice = buildStructuredNotice(
      'success',
      'notice.tower.layer-cleared',
      `通天塔第 ${state.layer} 层已通关，可前往第 ${unlockedLayer} 层。`,
      {
        vars: { layer: state.layer, unlockedLayer },
        pills: [
          { key: 'layer', style: 'damage' },
          { key: 'unlockedLayer', style: 'damage' },
        ],
      },
    );
    const cooldownNotice = buildStructuredNotice(
      'success',
      'notice.tower.layer-cleared-cooldown',
      `通天塔第 ${state.layer} 层已清空，需等待 ${this.config.layerChangeCooldownSeconds} 秒后换层。`,
      {
        vars: {
          layer: state.layer,
          cooldownSeconds: this.config.layerChangeCooldownSeconds,
        },
        pills: [
          { key: 'layer', style: 'damage' },
          { key: 'cooldownSeconds', style: 'damage' },
        ],
      },
    );
    const cooldownUntilMs = resolveCurrentTimeMs(deps) + this.config.layerChangeCooldownSeconds * 1_000;
    for (const playerId of wave.participantPlayerIds) {
      const clearResult = this.persistence.recordLayerClear(playerId, unlockedLayer, cooldownUntilMs);
      const notice = clearResult.firstClear ? firstClearNotice : cooldownNotice;
      deps.queuePlayerNotice?.(
        playerId,
        notice.text,
        notice.kind,
        undefined,
        undefined,
        notice.structured,
      );
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

  private resolveLayerChangeCooldownProjection(
    playerId: string,
    cooldownUntilMs: number,
    view: any,
    deps: any,
  ): { cooldownLeft: number; cooldownReadyTick?: number } {
    const cooldownLeft = this.resolveLayerChangeCooldownLeft(cooldownUntilMs, deps);
    if (cooldownLeft <= 0) {
      return { cooldownLeft: 0 };
    }
    const currentTickInput = typeof deps?.resolveCurrentTickForPlayerId === 'function'
      ? deps.resolveCurrentTickForPlayerId(playerId)
      : view?.tick;
    const currentTick = Number.isFinite(Number(currentTickInput))
      ? Math.max(0, Math.trunc(Number(currentTickInput)))
      : 0;
    return {
      cooldownLeft,
      cooldownReadyTick: currentTick + cooldownLeft,
    };
  }

  private resolveLayerChangeCooldownLeft(cooldownUntilMs: number, deps: any): number {
    const remainingMs = Math.max(0, Math.trunc(Number(cooldownUntilMs) || 0) - resolveCurrentTimeMs(deps));
    return remainingMs > 0 ? Math.ceil(remainingMs / 1_000) : 0;
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
    layerChangeCooldownSeconds: normalizePositiveInteger(raw.layerChangeCooldownSeconds, 30),
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

function hasLocalCatalogLease(instance: any, deps: any): boolean {
  if (!deps.instanceCatalogService?.isEnabled?.()) {
    return true;
  }
  const nodeId = typeof deps.nodeRegistryService?.getNodeId === 'function'
    ? String(deps.nodeRegistryService.getNodeId()).trim()
    : '';
  const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string'
    ? instance.meta.assignedNodeId.trim()
    : '';
  const leaseToken = typeof instance?.meta?.leaseToken === 'string'
    ? instance.meta.leaseToken.trim()
    : '';
  const leaseExpireAt = instance?.meta?.leaseExpireAt
    ? new Date(instance.meta.leaseExpireAt).getTime()
    : 0;
  return Boolean(nodeId)
    && assignedNodeId === nodeId
    && Boolean(leaseToken)
    && Number.isFinite(leaseExpireAt)
    && leaseExpireAt > Date.now();
}

function isTowerInstanceReady(instance: any, deps: any): boolean {
  const destroyAt = instance?.meta?.destroyAt
    ? new Date(instance.meta.destroyAt).getTime()
    : 0;
  if (!instance
    || instance?.meta?.status === 'destroyed'
    || (Number.isFinite(destroyAt) && destroyAt > 0 && destroyAt <= Date.now())) {
    return false;
  }
  const runtimeStatus = typeof instance?.meta?.runtimeStatus === 'string'
    ? instance.meta.runtimeStatus.trim()
    : '';
  if (runtimeStatus === 'stopped'
    || runtimeStatus === 'ownership_transition'
    || runtimeStatus === 'creating'
    || runtimeStatus === 'fenced'
    || runtimeStatus === 'lease_degraded'
    || runtimeStatus === 'destroying'
    || runtimeStatus === 'cleanup_pending') {
    return false;
  }
  return hasLocalCatalogLease(instance, deps);
}

async function waitForInstanceReadiness(instanceId: string, deps: any): Promise<void> {
  if (typeof deps.waitForInstanceLeaseReady === 'function') {
    await deps.waitForInstanceLeaseReady(instanceId);
    return;
  }
  await deps.worldRuntimeService?.waitForInstanceLeaseReady?.(instanceId);
}

function isExpectedTowerCatalogEntry(
  entry: Record<string, unknown>,
  instanceId: string,
  templateId: string,
): boolean {
  const runtimeStatus = String(entry.runtime_status ?? '').trim();
  return String(entry.instance_id ?? '').trim() === instanceId
    && String(entry.template_id ?? '').trim() === templateId
    && String(entry.instance_type ?? '').trim() === 'tower'
    && runtimeStatus !== 'cleanup_pending'
    && runtimeStatus !== 'creating'
    && runtimeStatus !== 'template_missing';
}

function isNear(xInput: unknown, yInput: unknown, targetX: number, targetY: number): boolean {
  const x = Number(xInput);
  const y = Number(yInput);
  return Number.isFinite(x) && Number.isFinite(y) && Math.max(Math.abs(Math.trunc(x) - targetX), Math.abs(Math.trunc(y) - targetY)) <= 1;
}

function resolveCurrentTimeMs(deps: any): number {
  const resolved = typeof deps?.resolveCurrentTimeMs === 'function'
    ? Number(deps.resolveCurrentTimeMs())
    : Date.now();
  return Number.isFinite(resolved) ? Math.max(0, Math.trunc(resolved)) : Date.now();
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
