/**
 * 密室建筑领域服务。
 *
 * 建筑、玩家位置与实例 tick 仍由 WorldRuntimeService 权威维护；本服务只拥有密室玩法配置、
 * 燃料和外部建筑到独立实例的稳定映射。tick 热路径只扣内存预留燃料，不访问数据库。
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  MAX_INSTANCE_TICK_SPEED,
  SPIRIT_STONE_ITEM_ID,
  type C2S_DepositTimeChamberFuelView,
  type C2S_RenameTimeChamberView,
  type C2S_ResizeTimeChamberView,
  type C2S_SetTimeChamberSpeedView,
  type TimeChamberDetailView,
  type TimeChamberOperationResultView,
  type TimeChamberSizeTier,
} from '@mud/shared';

import { resolveServerDatabaseUrl } from '../../config/env-alias';
import {
  DurableOperationService,
  type GrantInventoryItemsInput,
} from '../../persistence/durable-operation.service';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import {
  buildGrantedInventorySnapshots,
  buildNextInventorySnapshots,
  resolveInventoryGrantLeaseContext,
} from '../world/world-runtime-inventory-grant.helpers';
import {
  isDurableCommitOutcomeUnknownError,
  reconcileDurableInventoryCommitOutcome,
  type DurableInventoryMutationRequest,
} from '../world/durable-source-asset-reconciliation.helpers';
import { buildStructuredNotice } from '../world/structured-notice.helpers';
import { TimeChamberAdmissionPolicy } from './time-chamber-admission.policy';
import { WorldRuntimeInstanceScheduleService } from '../world/world-runtime-instance-schedule.service';

const TIME_CHAMBER_TABLE = 'instance_time_chamber_state';
const TIME_CHAMBER_DEF_ID = 'time_chamber';
const MAX_NAME_LENGTH = 20;
const MAX_REQUEST_ID_LENGTH = 128;
const BASE_SPEED = 1;
const RESERVE_SECONDS = 60;
const RESERVE_LOW_WATER_SECONDS = 20;
const MAX_FUEL_UNITS_PER_SPIRIT_STONE = 1_000_000_000;

const SIZE_BY_TIER: Record<TimeChamberSizeTier, { width: number; height: number }> = {
  small: { width: 9, height: 9 },
  medium: { width: 15, height: 15 },
  large: { width: 21, height: 21 },
};

type QueryResultLike = { rows: any[]; rowCount?: number };
type PoolClientLike = {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>;
  release(destroy?: boolean): void;
};
type PoolLike = {
  connect(): Promise<PoolClientLike>;
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>;
};

interface TimeChamberState {
  sourceInstanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  templateId: string;
  ownerPlayerId: string;
  displayName: string;
  sizeTier: TimeChamberSizeTier;
  capacity: number;
  configuredSpeed: number;
  databaseFuelUnits: number;
  reservedFuelUnits: number;
  fuelUnitsPerSpiritStone: number;
  maxSpeed: number;
  allowedSizeTiers: TimeChamberSizeTier[];
  revision: number;
}

@Injectable()
export class TimeChamberRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(TimeChamberRuntimeService.name);
  private readonly stateByBuildingKey = new Map<string, TimeChamberState>();
  private readonly stateByChamberInstanceId = new Map<string, TimeChamberState>();
  private readonly operationTailByKey = new Map<string, Promise<unknown>>();
  private readonly reservePromiseByKey = new Map<string, Promise<void>>();
  private pool: PoolLike | null = null;
  private enabled = false;
  private initPromise: Promise<void> | null = null;
  private worldRuntime: any = null;

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider,
    @Inject(MapTemplateRepository) private readonly templateRepository: MapTemplateRepository,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(DurableOperationService) private readonly durableOperationService: DurableOperationService,
    @Inject(WorldRuntimeInstanceScheduleService) private readonly instanceScheduleService: WorldRuntimeInstanceScheduleService,
    @Inject(TimeChamberAdmissionPolicy) private readonly admissionPolicy: TimeChamberAdmissionPolicy,
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  /** 必须在实例目录恢复前完成，确保 catalog 引用的动态 template 已存在。 */
  async prepareForWorldRecovery(): Promise<void> {
    await this.initPromise;
    for (const state of this.stateByBuildingKey.values()) {
      this.registerTemplate(state);
    }
  }

  /** 实例目录恢复后应用配置和燃料，并补建尚未进入 catalog 的密室实例。 */
  async applyRecoveredRuntimeState(runtime: any): Promise<void> {
    this.worldRuntime = runtime;
    const staleStates: TimeChamberState[] = [];
    for (const state of Array.from(this.stateByBuildingKey.values())) {
      const sourceInstance = runtime.getInstanceRuntime?.(state.sourceInstanceId);
      if (!sourceInstance || !isRuntimeInstanceWritable(runtime, sourceInstance)) {
        // 分片节点只处理本地可写实例；远端或续租降级实例不能被误判成孤儿并修改全局状态。
        const localChamberInstance = runtime.getInstanceRuntime?.(state.chamberInstanceId);
        if (localChamberInstance && isRuntimeInstanceWritable(runtime, localChamberInstance)) {
          localChamberInstance.meta.ownerPlayerId = state.ownerPlayerId;
          localChamberInstance.meta.displayName = state.displayName;
          if (state.configuredSpeed > BASE_SPEED) {
            await this.reserveFuel(state);
          }
          this.applyEffectiveSpeed(state, localChamberInstance, runtime);
        }
        continue;
      }
      const building = sourceInstance?.buildingById?.get?.(state.buildingId) ?? null;
      const config = resolveTimeChamberConfig(resolveCompiledBuilding(sourceInstance, building));
      const ownerPlayerId = normalizeString(building?.ownerPlayerId);
      if (!sourceInstance || !building || building.state !== 'active' || !config || !ownerPlayerId) {
        staleStates.push(state);
        continue;
      }
      if (state.ownerPlayerId !== ownerPlayerId && this.pool) {
        const result = await this.pool.query(
          `UPDATE ${TIME_CHAMBER_TABLE}
              SET owner_player_id = $3, revision = revision + 1, updated_at = now()
            WHERE source_instance_id = $1 AND building_id = $2 AND revision = $4`,
          [state.sourceInstanceId, state.buildingId, ownerPlayerId, state.revision],
        );
        if ((result.rowCount ?? 0) !== 1) {
          this.logger.warn(`密室创建者恢复冲突：${state.chamberInstanceId}`);
          continue;
        }
        state.ownerPlayerId = ownerPlayerId;
        state.revision += 1;
      }
      state.maxSpeed = config.maxSpeed;
      state.fuelUnitsPerSpiritStone = config.fuelUnitsPerSpiritStone;
      // 内容配置移除旧尺寸时保留现有模板，不在恢复期破坏性裁切；后续只能改到当前允许档位。
      state.allowedSizeTiers = config.allowedSizeTiers.includes(state.sizeTier)
        ? config.allowedSizeTiers
        : [state.sizeTier, ...config.allowedSizeTiers];
      if (state.configuredSpeed > state.maxSpeed) {
        await this.updateConfigRow(state, { configuredSpeed: state.maxSpeed });
        state.configuredSpeed = state.maxSpeed;
        state.revision += 1;
      }
      if (normalizeString(building.name) !== state.displayName) {
        building.name = state.displayName;
        markBuildingChanged(sourceInstance, building);
      }
      const instance = this.ensureRuntimeInstance(state, runtime);
      if (!isRuntimeInstanceWritable(runtime, instance)) {
        this.logger.warn(`密室实例当前不归本节点写入，跳过恢复应用：${state.chamberInstanceId}`);
        continue;
      }
      instance.meta.ownerPlayerId = state.ownerPlayerId;
      instance.meta.displayName = state.displayName;
      if (state.configuredSpeed > BASE_SPEED) {
        await this.reserveFuel(state);
      }
      this.applyEffectiveSpeed(state, instance, runtime);
    }
    for (const state of staleStates) {
      const result = await this.prepareDeconstruct(state.sourceInstanceId, state.buildingId, runtime);
      if (result.ok !== true) {
        this.logger.warn(`密室孤儿状态清理失败：${state.chamberInstanceId} reason=${result.reason ?? ''}`);
      }
    }
  }

  async buildDetail(
    playerId: string,
    payload: { sourceInstanceId: string; buildingId: string; requestId: string },
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'detail', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, true);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'detail', requestId, reason: resolved.reason };
      }
      return { ok: true, operation: 'detail', requestId, detail: this.buildDetailView(playerId, resolved.state, resolved.chamberInstance) };
    });
  }

  async depositFuel(
    playerId: string,
    payload: C2S_DepositTimeChamberFuelView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'deposit', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, true);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'deposit', requestId, reason: resolved.reason };
      }
      const count = Math.max(0, Math.trunc(Number(payload.spiritStoneCount) || 0));
      if (count <= 0 || count > 1_000_000) {
        return { ok: false, operation: 'deposit', requestId, reason: 'invalid_spirit_stone_count' };
      }
      const operationId = buildFuelOperationId(playerId, resolved.state, requestId);
      try {
        await this.depositFuelDurably(playerId, resolved.state, count, operationId, runtime);
        await this.reloadFuelState(resolved.state);
        if (resolved.state.configuredSpeed > BASE_SPEED) {
          await this.reserveFuel(resolved.state);
          this.applyEffectiveSpeed(resolved.state, resolved.chamberInstance, runtime);
        }
        return {
          ok: true,
          operation: 'deposit',
          requestId,
          detail: this.buildDetailView(playerId, resolved.state, resolved.chamberInstance),
        };
      } catch (error) {
        this.logger.warn(`密室投入灵石失败：${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, operation: 'deposit', requestId, reason: normalizeOperationFailure(error, 'time_chamber_deposit_failed') };
      }
    });
  }

  async setSpeed(
    playerId: string,
    payload: C2S_SetTimeChamberSpeedView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'speed', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, true);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'speed', requestId, reason: resolved.reason };
      }
      const speed = Math.trunc(Number(payload.speed));
      if (!Number.isInteger(speed) || speed < BASE_SPEED || speed > resolved.state.maxSpeed) {
        return { ok: false, operation: 'speed', requestId, reason: 'invalid_time_chamber_speed' };
      }
      if (!matchesExpectedRevision(payload.expectedRevision, resolved.state.revision)) {
        return { ok: false, operation: 'speed', requestId, reason: 'time_chamber_revision_conflict' };
      }
      if (speed > BASE_SPEED) {
        await this.reserveFuel(resolved.state, speed);
        if (resolved.state.reservedFuelUnits < fuelCostPerLogicalTick(speed)) {
          return { ok: false, operation: 'speed', requestId, reason: 'time_chamber_fuel_empty' };
        }
      }
      await this.updateConfigRow(resolved.state, { configuredSpeed: speed });
      resolved.state.configuredSpeed = speed;
      resolved.state.revision += 1;
      this.applyEffectiveSpeed(resolved.state, resolved.chamberInstance, runtime);
      await runtime.flushInstanceDomains?.(resolved.state.chamberInstanceId, ['time']);
      return {
        ok: true,
        operation: 'speed',
        requestId,
        detail: this.buildDetailView(playerId, resolved.state, resolved.chamberInstance),
      };
    });
  }

  async rename(
    playerId: string,
    payload: C2S_RenameTimeChamberView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'rename', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, true);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'rename', requestId, reason: resolved.reason };
      }
      const name = normalizeName(payload.name);
      if (!name) {
        return { ok: false, operation: 'rename', requestId, reason: 'invalid_time_chamber_name' };
      }
      if (!matchesExpectedRevision(payload.expectedRevision, resolved.state.revision)) {
        return { ok: false, operation: 'rename', requestId, reason: 'time_chamber_revision_conflict' };
      }
      await this.updateConfigRow(resolved.state, { displayName: name });
      resolved.state.displayName = name;
      resolved.state.revision += 1;
      resolved.building.name = name;
      resolved.building.updatedAtTick = Math.max(0, Math.trunc(Number(resolved.sourceInstance.tick) || 0));
      resolved.building.revision = Math.max(1, Math.trunc(Number(resolved.building.revision) || 1)) + 1;
      markBuildingChanged(resolved.sourceInstance, resolved.building);
      resolved.chamberInstance.meta.displayName = name;
      this.templateRepository.renameRuntimeMapTemplate?.(resolved.state.templateId, name);
      resolved.chamberInstance.worldRevision = Math.max(0, Math.trunc(Number(resolved.chamberInstance.worldRevision) || 0)) + 1;
      return {
        ok: true,
        operation: 'rename',
        requestId,
        detail: this.buildDetailView(playerId, resolved.state, resolved.chamberInstance),
      };
    });
  }

  async resize(
    playerId: string,
    payload: C2S_ResizeTimeChamberView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'resize', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, true);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'resize', requestId, reason: resolved.reason };
      }
      const sizeTier = normalizeSizeTier(payload.sizeTier);
      const currentConfig = resolveTimeChamberConfig(resolveCompiledBuilding(resolved.sourceInstance, resolved.building));
      const configuredSizeTiers = currentConfig?.allowedSizeTiers ?? [];
      if (!sizeTier || (sizeTier !== resolved.state.sizeTier && !configuredSizeTiers.includes(sizeTier))) {
        return { ok: false, operation: 'resize', requestId, reason: 'invalid_time_chamber_size' };
      }
      if (!matchesExpectedRevision(payload.expectedRevision, resolved.state.revision)) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_revision_conflict' };
      }
      if (resolved.chamberInstance.listPlayerIds().length > 0) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_occupied' };
      }
      if ((runtime.worldRuntimeFormationService?.listRuntimeFormations?.(resolved.state.chamberInstanceId)?.length ?? 0) > 0) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_not_empty' };
      }
      const persistence = this.playerRuntimeService.playerDomainPersistenceService;
      if (!isPlayerDomainPersistenceEnabled(persistence)
        || typeof persistence?.hasRetainedPlayersInInstance !== 'function') {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_persistence_disabled' };
      }
      if (await persistence.hasRetainedPlayersInInstance(resolved.state.chamberInstanceId)) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_occupied' };
      }
      if (resolved.state.sizeTier !== sizeTier) {
        const previousTier = resolved.state.sizeTier;
        const previousTemplate = resolved.chamberInstance.template;
        const nextState = { ...resolved.state, sizeTier };
        const nextTemplate = this.registerTemplate(nextState);
        if (resolved.chamberInstance.replaceEmptyRuntimeTemplate?.(nextTemplate) !== true) {
          this.templateRepository.registerRuntimeMapTemplate(previousTemplate.source);
          return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_not_empty' };
        }
        try {
          await this.updateConfigRow(resolved.state, { sizeTier });
        } catch (error) {
          this.templateRepository.registerRuntimeMapTemplate(previousTemplate.source);
          resolved.chamberInstance.replaceEmptyRuntimeTemplate?.(previousTemplate);
          resolved.state.sizeTier = previousTier;
          throw error;
        }
        resolved.state.sizeTier = sizeTier;
        resolved.state.allowedSizeTiers = configuredSizeTiers;
        resolved.state.revision += 1;
        await runtime.flushInstanceDomains?.(resolved.state.chamberInstanceId, ['overlay', 'tile_cell', 'tile_damage']);
      }
      return {
        ok: true,
        operation: 'resize',
        requestId,
        detail: this.buildDetailView(playerId, resolved.state, resolved.chamberInstance),
      };
    });
  }

  /** 所有人都可进入；容量判定由独立 policy 承担。 */
  async enter(playerId: string, sourceInstanceId: string, buildingId: string, runtime: any): Promise<{ ok: boolean; reason?: string }> {
    return this.runBuildingOperation({ sourceInstanceId, buildingId }, async () => {
      const resolved = await this.resolveManagedChamber(playerId, { sourceInstanceId, buildingId }, runtime, false);
      if (resolved.ok !== true) {
        return { ok: false, reason: resolved.reason };
      }
      const persistence = this.playerRuntimeService.playerDomainPersistenceService;
      if (!isPlayerDomainPersistenceEnabled(persistence)
        || typeof persistence?.listRetainedPlayerIdsInInstance !== 'function') {
        return { ok: false, reason: 'time_chamber_persistence_disabled' };
      }
      const retainedPlayerIds = (await persistence.listRetainedPlayerIdsInInstance(
        resolved.state.chamberInstanceId,
        resolved.state.capacity + 1,
      )).filter((retainedPlayerId) => {
        // 位置 checkpoint 可能比刚完成的跨图传送晚一次 flush；在线运行态已明确离开时不能继续占用名额。
        const runtimeLocation = runtime.getPlayerLocation?.(retainedPlayerId);
        const runtimePlayer = this.playerRuntimeService.getPlayer?.(retainedPlayerId);
        const currentInstanceId = normalizeString(runtimeLocation?.instanceId)
          || normalizeString(runtimePlayer?.instanceId);
        return !currentInstanceId || currentInstanceId === resolved.state.chamberInstanceId;
      });
      const admission = this.admissionPolicy.canEnter(
        resolved.chamberInstance,
        playerId,
        resolved.state.capacity,
        retainedPlayerIds,
      );
      if (!admission.ok) {
        return admission;
      }
      const location = runtime.getPlayerLocation?.(playerId);
      if (!location || location.instanceId !== resolved.state.sourceInstanceId) {
        return { ok: false, reason: 'time_chamber_source_changed' };
      }
      const transferred = this.applyVerifiedTransfer(playerId, resolved.state.chamberInstanceId, {
        playerId,
        sessionId: location.sessionId,
        fromInstanceId: location.instanceId,
        targetMapId: resolved.state.templateId,
        targetInstanceId: resolved.state.chamberInstanceId,
        targetX: resolved.chamberInstance.template.spawnX,
        targetY: resolved.chamberInstance.template.spawnY,
        reason: 'time_chamber_enter',
      }, runtime);
      return transferred ? { ok: true } : { ok: false, reason: 'time_chamber_unavailable' };
    });
  }

  async leave(playerId: string, runtime: any): Promise<{ ok: boolean; reason?: string }> {
    const initialLocation = runtime.getPlayerLocation?.(playerId);
    const state = initialLocation ? this.stateByChamberInstanceId.get(initialLocation.instanceId) : null;
    if (!initialLocation || !state) {
      return { ok: false, reason: 'not_in_time_chamber' };
    }
    return this.runBuildingOperation(state, async () => {
      const location = runtime.getPlayerLocation?.(playerId);
      if (!location || location.instanceId !== state.chamberInstanceId) {
        return { ok: false, reason: 'not_in_time_chamber' };
      }
      const sourceInstance = runtime.getInstanceRuntime?.(state.sourceInstanceId);
      const building = sourceInstance?.buildingById?.get?.(state.buildingId) ?? null;
      if (!sourceInstance || !building) {
        const fallbackMapId = runtime.resolveDefaultRespawnMapId?.();
        const fallbackInstance = fallbackMapId ? runtime.getOrCreatePublicInstance?.(fallbackMapId) : null;
        if (!fallbackMapId || !fallbackInstance) {
          return { ok: false, reason: 'time_chamber_exit_missing' };
        }
        const transferred = this.applyVerifiedTransfer(playerId, fallbackInstance.meta.instanceId, {
          playerId,
          sessionId: location.sessionId,
          fromInstanceId: location.instanceId,
          targetMapId: fallbackMapId,
          targetInstanceId: fallbackInstance.meta.instanceId,
          targetX: fallbackInstance.template.spawnX,
          targetY: fallbackInstance.template.spawnY,
          reason: 'time_chamber_emergency_leave',
        }, runtime);
        return transferred ? { ok: true } : { ok: false, reason: 'time_chamber_exit_missing' };
      }
      const transferred = this.applyVerifiedTransfer(playerId, state.sourceInstanceId, {
        playerId,
        sessionId: location.sessionId,
        fromInstanceId: location.instanceId,
        targetMapId: sourceInstance.template.id,
        targetInstanceId: state.sourceInstanceId,
        targetX: building.x,
        targetY: building.y,
        reason: 'time_chamber_leave',
      }, runtime);
      return transferred ? { ok: true } : { ok: false, reason: 'time_chamber_exit_missing' };
    });
  }

  /** 调度批次规划：仅按当前内存燃料裁剪步数，不提前扣除尚未执行的逻辑息。 */
  authorizeScheduledSteps(instanceId: string, instance: any, requestedSteps: number, speed: number, runtime: any): number {
    const state = this.stateByChamberInstanceId.get(instanceId);
    if (!state || speed <= BASE_SPEED) {
      return requestedSteps;
    }
    this.worldRuntime = runtime;
    const costPerStep = fuelCostPerLogicalTick(speed);
    const allowedSteps = Math.min(
      Math.max(0, Math.trunc(requestedSteps)),
      Math.floor(state.reservedFuelUnits / costPerStep),
    );
    if (state.reservedFuelUnits <= reserveTargetUnits(speed, RESERVE_LOW_WATER_SECONDS)) {
      this.queueFuelReserve(state);
    }
    if (allowedSteps <= 0 && requestedSteps > 0) {
      this.applyBaselineFallback(state, instance, runtime);
    }
    return allowedSteps;
  }

  /** 一个实例核心逻辑息成功后调用；只为已经真正执行的加速息扣燃料。 */
  consumeScheduledStep(instanceId: string, instance: any, speed: number, runtime: any): boolean {
    const state = this.stateByChamberInstanceId.get(instanceId);
    if (!state || speed <= BASE_SPEED) {
      return true;
    }
    this.worldRuntime = runtime;
    const costPerStep = fuelCostPerLogicalTick(speed);
    if (costPerStep <= 0) {
      return true;
    }
    if (state.reservedFuelUnits < costPerStep) {
      this.applyBaselineFallback(state, instance, runtime);
      return false;
    }
    state.reservedFuelUnits -= costPerStep;
    if (state.reservedFuelUnits <= reserveTargetUnits(speed, RESERVE_LOW_WATER_SECONDS)) {
      this.queueFuelReserve(state);
    }
    if (state.reservedFuelUnits < costPerStep) {
      this.applyBaselineFallback(state, instance, runtime);
    }
    return true;
  }

  async prepareDeconstruct(sourceInstanceId: string, buildingId: string, runtime: any): Promise<{ ok: boolean; reason?: string }> {
    const key = buildBuildingKey(sourceInstanceId, buildingId);
    return this.runBuildingOperation({ sourceInstanceId, buildingId }, async () => {
      if (!this.pool || !this.enabled) {
        return { ok: false, reason: 'time_chamber_persistence_disabled' };
      }
      let state: TimeChamberState | null = this.stateByBuildingKey.get(key) ?? null;
      if (!state) {
        const result = await this.pool.query(
          `SELECT * FROM ${TIME_CHAMBER_TABLE} WHERE source_instance_id = $1 AND building_id = $2 LIMIT 1`,
          [normalizeString(sourceInstanceId), normalizeString(buildingId)],
        );
        state = normalizeStateRow(result.rows?.[0]);
        if (state) {
          this.storeState(state);
        }
      }
      if (!state) {
        return { ok: true };
      }
      const instance = runtime.getInstanceRuntime?.(state.chamberInstanceId);
      if (instance && !isRuntimeInstanceWritable(runtime, instance)) {
        return { ok: false, reason: 'time_chamber_unavailable' };
      }
      if (instance?.listPlayerIds?.().length > 0) {
        return { ok: false, reason: 'time_chamber_occupied' };
      }
      if (instance?.canReplaceEmptyRuntimeTemplate?.() === false
        || (runtime.worldRuntimeFormationService?.listRuntimeFormations?.(state.chamberInstanceId)?.length ?? 0) > 0) {
        return { ok: false, reason: 'time_chamber_not_empty' };
      }
      const persistence = this.playerRuntimeService.playerDomainPersistenceService;
      if (!isPlayerDomainPersistenceEnabled(persistence)
        || typeof persistence?.hasRetainedPlayersInInstance !== 'function') {
        return { ok: false, reason: 'time_chamber_persistence_disabled' };
      }
      if (await persistence.hasRetainedPlayersInInstance(state.chamberInstanceId)) {
        return { ok: false, reason: 'time_chamber_occupied' };
      }
      const expectedLeaseFence = resolveRuntimeLeaseFence(instance);
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const catalogResult = await client.query(
          `SELECT assigned_node_id, lease_token, ownership_epoch,
                  assigned_node_id IS NOT NULL
                    AND lease_token IS NOT NULL
                    AND lease_expire_at IS NOT NULL
                    AND lease_expire_at > now() AS lease_active
             FROM instance_catalog
            WHERE instance_id = $1
            FOR UPDATE`,
          [state.chamberInstanceId],
        );
        const catalogRow = catalogResult.rows?.[0] ?? null;
        if (catalogRow && !canRetireCatalogRow(catalogRow, expectedLeaseFence)) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'time_chamber_unavailable' };
        }
        if (catalogRow) {
          const catalogUpdate = await client.query(
          `UPDATE instance_catalog
              SET status = 'destroyed', runtime_status = 'stopped',
                  assigned_node_id = NULL, lease_token = NULL, lease_expire_at = NULL,
                  ownership_epoch = ownership_epoch + 1,
                  metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
                  destroy_at = now(), last_active_at = now()
            WHERE instance_id = $1 AND ownership_epoch = $2`,
            [state.chamberInstanceId, normalizeCatalogOwnershipEpoch(catalogRow.ownership_epoch)],
          );
          if ((catalogUpdate.rowCount ?? 0) !== 1) {
            throw new Error('time_chamber_lease_conflict');
          }
        }
        const stateDelete = await client.query(
          `DELETE FROM ${TIME_CHAMBER_TABLE}
            WHERE source_instance_id = $1 AND building_id = $2 AND revision = $3`,
          [state.sourceInstanceId, state.buildingId, state.revision],
        );
        if ((stateDelete.rowCount ?? 0) !== 1) {
          throw new Error('time_chamber_revision_conflict');
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      this.stateByBuildingKey.delete(key);
      this.stateByChamberInstanceId.delete(state.chamberInstanceId);
      this.templateRepository.unregisterRuntimeMapTemplate?.(state.templateId);
      this.instanceScheduleService.unregister(state.chamberInstanceId);
      runtime.worldRuntimeInstanceStateService?.deleteInstanceRuntime?.(state.chamberInstanceId);
      runtime.worldRuntimeTickProgressService?.clearInstance?.(state.chamberInstanceId);
      runtime.worldRuntimeLootContainerService?.removeInstanceState?.(state.chamberInstanceId);
      runtime.runtimeEventBusService?.discardInstance?.(state.chamberInstanceId);
      runtime.worldRuntimeFormationService?.releaseInstance?.(state.chamberInstanceId);
      return { ok: true };
    });
  }

  isTimeChamberInstance(instanceId: string): boolean {
    return this.stateByChamberInstanceId.has(instanceId);
  }

  getStateByExteriorBuilding(sourceInstanceId: string, buildingId: string): TimeChamberState | null {
    return this.stateByBuildingKey.get(buildBuildingKey(sourceInstanceId, buildingId)) ?? null;
  }

  private async initialize(): Promise<void> {
    if (!resolveServerDatabaseUrl().trim()) {
      this.logger.log('密室持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    const pool = this.databasePoolProvider.getPool('time-chamber-runtime') as PoolLike | null;
    if (!pool) {
      this.logger.warn('密室持久化已禁用：数据库连接池不可用');
      return;
    }
    try {
      await ensureTimeChamberTable(pool);
      this.pool = pool;
      this.enabled = true;
      await this.reloadAllStates();
      this.logger.log(`密室持久化已启用：恢复 ${this.stateByBuildingKey.size} 条状态`);
    } catch (error) {
      this.pool = null;
      this.enabled = false;
      this.logger.error('密室持久化初始化失败，已禁用密室管理', error instanceof Error ? error.stack : String(error));
    }
  }

  private async reloadAllStates(): Promise<void> {
    if (!this.pool) {
      return;
    }
    const result = await this.pool.query(`SELECT * FROM ${TIME_CHAMBER_TABLE} ORDER BY source_instance_id, building_id`);
    this.stateByBuildingKey.clear();
    this.stateByChamberInstanceId.clear();
    for (const row of result.rows ?? []) {
      const state = normalizeStateRow(row);
      if (!state) {
        continue;
      }
      this.storeState(state);
      this.registerTemplate(state);
    }
  }

  private async resolveManagedChamber(
    playerId: string,
    payload: { sourceInstanceId?: string; buildingId?: string },
    runtime: any,
    ownerRequired: boolean,
  ): Promise<any> {
    this.worldRuntime = runtime;
    if (!this.isEnabled()) {
      return { ok: false, reason: 'time_chamber_persistence_disabled' };
    }
    const location = runtime.getPlayerLocation?.(playerId);
    const sourceInstanceId = normalizeString(payload.sourceInstanceId);
    const buildingId = normalizeString(payload.buildingId);
    const sourceInstance = sourceInstanceId ? runtime.getInstanceRuntime?.(sourceInstanceId) : null;
    const building = sourceInstance?.buildingById?.get?.(buildingId) ?? null;
    if (!sourceInstance || !building || !isTimeChamberBuilding(sourceInstance, building) || building.state !== 'active') {
      return { ok: false, reason: 'time_chamber_not_found' };
    }
    if (!isRuntimeInstanceWritable(runtime, sourceInstance)) {
      return { ok: false, reason: 'time_chamber_unavailable' };
    }
    const player = this.playerRuntimeService.getPlayer?.(playerId);
    if (!location || location.instanceId !== sourceInstanceId || !player || chebyshevDistance(player.x, player.y, building.x, building.y) > 1) {
      return { ok: false, reason: 'time_chamber_too_far' };
    }
    if (ownerRequired && normalizeString(building.ownerPlayerId) !== normalizeString(playerId)) {
      return { ok: false, reason: 'time_chamber_owner_required' };
    }
    const state = await this.ensureState(sourceInstance, building);
    if (!state) {
      return { ok: false, reason: 'time_chamber_state_create_failed' };
    }
    const chamberInstance = this.ensureRuntimeInstance(state, runtime);
    if (!isRuntimeInstanceWritable(runtime, chamberInstance)) {
      return { ok: false, reason: 'time_chamber_unavailable' };
    }
    return { ok: true, sourceInstance, building, state, chamberInstance };
  }

  private async ensureState(sourceInstance: any, building: any): Promise<TimeChamberState | null> {
    const sourceInstanceId = sourceInstance.meta.instanceId;
    const key = buildBuildingKey(sourceInstanceId, building.id);
    const existing = this.stateByBuildingKey.get(key);
    if (existing) {
      return existing;
    }
    if (!this.pool) {
      return null;
    }
    const compiled = resolveCompiledBuilding(sourceInstance, building);
    const config = resolveTimeChamberConfig(compiled);
    if (!config) {
      return null;
    }
    const ownerPlayerId = normalizeString(building.ownerPlayerId);
    if (!ownerPlayerId) {
      return null;
    }
    const stableHash = buildStableChamberHash(sourceInstanceId, building.id);
    const chamberInstanceId = `time-chamber:${stableHash}`;
    const templateId = `time-chamber-template:${stableHash}`;
    const displayName = normalizeName(building.name) || '密室';
    const result = await this.pool.query(
      `INSERT INTO ${TIME_CHAMBER_TABLE}(
         source_instance_id, building_id, chamber_instance_id, template_id,
         owner_player_id, display_name, size_tier, capacity, configured_speed,
         fuel_units, revision, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'small', $7, 1, 0, 1, now(), now())
       ON CONFLICT (source_instance_id, building_id) DO NOTHING
       RETURNING *`,
      [sourceInstanceId, building.id, chamberInstanceId, templateId, ownerPlayerId, displayName, config.capacity],
    );
    const row = result.rows?.[0] ?? (await this.pool.query(
      `SELECT * FROM ${TIME_CHAMBER_TABLE} WHERE source_instance_id = $1 AND building_id = $2 LIMIT 1`,
      [sourceInstanceId, building.id],
    )).rows?.[0];
    const state = normalizeStateRow(row, config);
    if (!state) {
      return null;
    }
    this.storeState(state);
    this.registerTemplate(state);
    return state;
  }

  private ensureRuntimeInstance(state: TimeChamberState, runtime: any): any {
    const existing = runtime.getInstanceRuntime?.(state.chamberInstanceId);
    if (existing) {
      return existing;
    }
    this.registerTemplate(state);
    return runtime.createInstance({
      instanceId: state.chamberInstanceId,
      templateId: state.templateId,
      kind: 'time_chamber',
      persistent: true,
      displayName: state.displayName,
      defaultEntry: false,
      supportsPvp: false,
      canDamageTile: false,
      ownerPlayerId: state.ownerPlayerId,
      status: 'active',
      runtimeStatus: 'running',
      shardKey: state.chamberInstanceId,
      routeDomain: `time-chamber:${state.chamberInstanceId}`,
    });
  }

  private registerTemplate(state: Pick<TimeChamberState, 'templateId' | 'displayName' | 'sizeTier' | 'chamberInstanceId'>): any {
    return this.templateRepository.registerRuntimeMapTemplate(buildTimeChamberMapDocument(state));
  }

  private buildDetailView(playerId: string, state: TimeChamberState, instance: any): TimeChamberDetailView {
    const dimensions = SIZE_BY_TIER[state.sizeTier];
    const fuelUnits = Math.max(0, state.databaseFuelUnits + state.reservedFuelUnits);
    const effectiveSpeed = resolveEffectiveInstanceSpeed(instance);
    const consumption = fuelConsumptionUnitsPerSecond(effectiveSpeed);
    return {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      chamberInstanceId: state.chamberInstanceId,
      displayName: state.displayName,
      ownerPlayerId: state.ownerPlayerId,
      isOwner: normalizeString(playerId) === state.ownerPlayerId,
      sizeTier: state.sizeTier,
      width: dimensions.width,
      height: dimensions.height,
      allowedSizes: state.allowedSizeTiers.map((tier) => ({ tier, ...SIZE_BY_TIER[tier] })),
      capacity: state.capacity,
      occupancy: instance?.listPlayerIds?.().length ?? 0,
      configuredSpeed: state.configuredSpeed,
      effectiveSpeed,
      minSpeed: BASE_SPEED,
      maxSpeed: state.maxSpeed,
      fuelUnits,
      fuelUnitsPerSpiritStone: state.fuelUnitsPerSpiritStone,
      fuelSpiritStoneEquivalent: fuelUnits / state.fuelUnitsPerSpiritStone,
      fuelConsumptionUnitsPerSecond: consumption,
      estimatedRemainingSeconds: consumption > 0 ? Math.floor(fuelUnits / consumption) : null,
      revision: state.revision,
    };
  }

  private async depositFuelDurably(playerId: string, state: TimeChamberState, count: number, operationId: string, runtime: any): Promise<void> {
    const player = this.playerRuntimeService.getPlayerOrThrow(playerId) as any;
    if (!this.durableOperationService.isEnabled?.() || !player.runtimeOwnerId || !Number.isFinite(Number(player.sessionEpoch))) {
      throw new Error('durable_inventory_unavailable');
    }
    await this.playerRuntimeService.runExclusiveAssetMutation([playerId], async () => {
      const currentItems = Array.isArray(player.inventory?.items) ? player.inventory.items.map((entry) => ({ ...entry })) : [];
      const removal = removeInventoryItemCount(currentItems, SPIRIT_STONE_ITEM_ID, count);
      if (!removal.ok) {
        throw new Error('insufficient_spirit_stone');
      }
      const leaseContext = await resolveInventoryGrantLeaseContext(player.instanceId, runtime.instanceCatalogService);
      if (player.instanceId && !leaseContext) {
        throw new Error('inventory_grant_lease_context_required');
      }
      const fuelUnits = count * state.fuelUnitsPerSpiritStone;
      if (!Number.isSafeInteger(fuelUnits) || fuelUnits <= 0) {
        throw new Error('time_chamber_fuel_limit');
      }
      const durableInput: GrantInventoryItemsInput & DurableInventoryMutationRequest = {
        operationId,
        playerId,
        expectedRuntimeOwnerId: player.runtimeOwnerId,
        expectedSessionEpoch: Math.max(1, Math.trunc(Number(player.sessionEpoch))),
        expectedInstanceId: player.instanceId ?? null,
        expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
        expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
        sourceType: 'time_chamber_fuel',
        sourceRefId: state.chamberInstanceId,
        inventoryAction: 'transfer',
        grantedItems: buildGrantedInventorySnapshots(removal.removedItems),
        nextInventoryItems: buildNextInventorySnapshots(removal.nextItems),
        sourceMutation: {
          kind: 'time_chamber_fuel',
          instanceId: state.sourceInstanceId,
          buildingId: state.buildingId,
          fuelUnits,
        },
      };
      let result;
      try {
        result = await this.durableOperationService.grantInventoryItems(durableInput);
      } catch (error) {
        if (!isDurableCommitOutcomeUnknownError(error)) {
          throw error;
        }
        const reconciliation = await reconcileDurableInventoryCommitOutcome<
          GrantInventoryItemsInput & DurableInventoryMutationRequest
        >(
          this.durableOperationService,
          durableInput,
        );
        if (reconciliation.outcome === 'failed') {
          throw reconciliation.error;
        }
        if (reconciliation.outcome === 'unknown') {
          throw error;
        }
        this.playerRuntimeService.replaceInventoryItems(playerId, reconciliation.inventoryItems);
        this.logger.warn(reconciliation.replayReadFailed
          ? `密室灵石事务已确认提交，但 operation 明细暂不可读，已按同一请求后态收敛：operationId=${operationId}`
          : `密室灵石事务 COMMIT 回包不确定，已按 durable operation 回读收敛：operationId=${operationId}`);
        return;
      }
      if (result.alreadyCommitted !== true) {
        this.playerRuntimeService.replaceInventoryItems(playerId, removal.nextItems);
      }
    });
  }

  private async reserveFuel(state: TimeChamberState, speed = state.configuredSpeed): Promise<void> {
    if (!this.pool || speed <= BASE_SPEED) {
      return;
    }
    const key = buildBuildingKey(state.sourceInstanceId, state.buildingId);
    const existing = this.reservePromiseByKey.get(key);
    if (existing) {
      await existing;
      return;
    }
    const promise = (async () => {
      const target = reserveTargetUnits(speed, RESERVE_SECONDS);
      const needed = Math.max(0, target - state.reservedFuelUnits);
      if (needed <= 0) {
        return;
      }
      const result = await this.pool!.query(
        `WITH locked AS MATERIALIZED (
           SELECT source_instance_id, building_id, fuel_units
             FROM ${TIME_CHAMBER_TABLE}
            WHERE source_instance_id = $1 AND building_id = $2
            FOR UPDATE
         )
         UPDATE ${TIME_CHAMBER_TABLE} AS chamber
            SET fuel_units = chamber.fuel_units - LEAST(locked.fuel_units, $3::bigint),
                updated_at = now()
           FROM locked
          WHERE chamber.source_instance_id = locked.source_instance_id
            AND chamber.building_id = locked.building_id
         RETURNING chamber.fuel_units AS after_units,
                   LEAST(locked.fuel_units, $3::bigint) AS reserved_units`,
        [state.sourceInstanceId, state.buildingId, needed],
      );
      const row = result.rows?.[0];
      if (!row) {
        throw new Error('time_chamber_state_not_found');
      }
      const afterUnits = normalizeSafeInteger(row?.after_units);
      state.databaseFuelUnits = afterUnits;
      state.reservedFuelUnits += normalizeSafeInteger(row?.reserved_units);
    })().finally(() => {
      if (this.reservePromiseByKey.get(key) === promise) {
        this.reservePromiseByKey.delete(key);
      }
    });
    this.reservePromiseByKey.set(key, promise);
    await promise;
  }

  private queueFuelReserve(state: TimeChamberState): void {
    void this.runBuildingOperation(state, () => this.reserveFuel(state)).then(() => {
      const runtime = this.worldRuntime;
      const instance = runtime?.getInstanceRuntime?.(state.chamberInstanceId);
      if (instance && state.configuredSpeed > BASE_SPEED && state.reservedFuelUnits >= fuelCostPerLogicalTick(state.configuredSpeed)) {
        this.applyEffectiveSpeed(state, instance, runtime);
      }
    }).catch((error) => {
      this.logger.warn(`密室燃料缓冲补充失败：${state.chamberInstanceId} ${error instanceof Error ? error.message : String(error)}`);
      const runtime = this.worldRuntime;
      const instance = runtime?.getInstanceRuntime?.(state.chamberInstanceId);
      if (instance) {
        this.applyBaselineFallback(state, instance, runtime);
      }
    });
  }

  private applyEffectiveSpeed(state: TimeChamberState, instance: any, runtime: any): void {
    const desired = state.configuredSpeed > BASE_SPEED
      && state.reservedFuelUnits >= fuelCostPerLogicalTick(state.configuredSpeed)
      ? state.configuredSpeed
      : BASE_SPEED;
    if (resolveEffectiveInstanceSpeed(instance) === desired && instance.paused !== true) {
      return;
    }
    instance.tickSpeed = desired;
    instance.paused = false;
    instance.markPersistenceDirtyDomainsHighPriority?.(['time']);
    this.instanceScheduleService.registerOrUpdate(state.chamberInstanceId, instance);
  }

  private applyBaselineFallback(state: TimeChamberState, instance: any, runtime: any): void {
    if (resolveEffectiveInstanceSpeed(instance) === BASE_SPEED) {
      return;
    }
    instance.tickSpeed = BASE_SPEED;
    instance.paused = false;
    instance.markPersistenceDirtyDomainsHighPriority?.(['time']);
    this.instanceScheduleService.registerOrUpdate(state.chamberInstanceId, instance);
    const notice = buildStructuredNotice(
      'warn',
      'notice.time-chamber.fuel-empty-fallback',
      '密室灵石耗尽，时间流速已自动回落为一倍。',
    );
    for (const playerId of instance?.listPlayerIds?.() ?? []) {
      runtime.queuePlayerNotice?.(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
    }
    this.logger.log(`密室燃料不足，已回落 1x：${state.chamberInstanceId}`);
  }

  private applyVerifiedTransfer(playerId: string, targetInstanceId: string, transfer: any, runtime: any): boolean {
    const target = runtime.getInstanceRuntime?.(targetInstanceId);
    const attachReady = typeof runtime.instanceReadyForPlayerAttach === 'function'
      ? runtime.instanceReadyForPlayerAttach(targetInstanceId)
      : { ok: isRuntimeInstanceWritable(runtime, target) };
    if (attachReady?.ok !== true) {
      return false;
    }
    try {
      runtime.applyTransfer?.(transfer);
    } catch (error) {
      this.logger.warn(`密室传送失败：playerId=${playerId} target=${targetInstanceId} ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    return normalizeString(runtime.getPlayerLocation?.(playerId)?.instanceId) === normalizeString(targetInstanceId);
  }

  private async reloadFuelState(state: TimeChamberState): Promise<void> {
    if (!this.pool) {
      return;
    }
    const result = await this.pool.query(
      `SELECT fuel_units, revision FROM ${TIME_CHAMBER_TABLE}
        WHERE source_instance_id = $1 AND building_id = $2 LIMIT 1`,
      [state.sourceInstanceId, state.buildingId],
    );
    const row = result.rows?.[0];
    if (row) {
      state.databaseFuelUnits = normalizeSafeInteger(row.fuel_units);
      state.revision = Math.max(1, normalizeSafeInteger(row.revision));
    }
  }

  private async updateConfigRow(
    state: TimeChamberState,
    patch: { configuredSpeed?: number; displayName?: string; sizeTier?: TimeChamberSizeTier },
  ): Promise<void> {
    if (!this.pool) {
      throw new Error('time_chamber_persistence_disabled');
    }
    const result = await this.pool.query(
      `UPDATE ${TIME_CHAMBER_TABLE}
          SET configured_speed = COALESCE($3, configured_speed),
              display_name = COALESCE($4, display_name),
              size_tier = COALESCE($5, size_tier),
              revision = revision + 1,
              updated_at = now()
        WHERE source_instance_id = $1 AND building_id = $2 AND revision = $6`,
      [state.sourceInstanceId, state.buildingId, patch.configuredSpeed ?? null, patch.displayName ?? null, patch.sizeTier ?? null, state.revision],
    );
    if ((result.rowCount ?? 0) !== 1) {
      throw new Error('time_chamber_revision_conflict');
    }
  }

  private storeState(state: TimeChamberState): void {
    this.stateByBuildingKey.set(buildBuildingKey(state.sourceInstanceId, state.buildingId), state);
    this.stateByChamberInstanceId.set(state.chamberInstanceId, state);
  }

  private runBuildingOperation<T>(input: { sourceInstanceId?: string; buildingId?: string } | TimeChamberState, operation: () => Promise<T>): Promise<T> {
    const sourceInstanceId = 'sourceInstanceId' in input ? normalizeString(input.sourceInstanceId) : '';
    const buildingId = 'buildingId' in input ? normalizeString(input.buildingId) : '';
    const key = buildBuildingKey(sourceInstanceId, buildingId);
    const previous = this.operationTailByKey.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operationTailByKey.set(key, current);
    return current.finally(() => {
      if (this.operationTailByKey.get(key) === current) {
        this.operationTailByKey.delete(key);
      }
    });
  }
}

async function ensureTimeChamberTable(pool: PoolLike): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TIME_CHAMBER_TABLE} (
      source_instance_id varchar(180) NOT NULL,
      building_id varchar(180) NOT NULL,
      chamber_instance_id varchar(180) NOT NULL UNIQUE,
      template_id varchar(180) NOT NULL,
      owner_player_id varchar(100) NOT NULL,
      display_name varchar(40) NOT NULL,
      size_tier varchar(16) NOT NULL CHECK (size_tier IN ('small', 'medium', 'large')),
      capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
      configured_speed integer NOT NULL DEFAULT 1 CHECK (configured_speed BETWEEN 1 AND ${MAX_INSTANCE_TICK_SPEED}),
      fuel_units bigint NOT NULL DEFAULT 0 CHECK (fuel_units >= 0),
      revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_instance_id, building_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_time_chamber_owner ON ${TIME_CHAMBER_TABLE}(owner_player_id)`);
}

function normalizeStateRow(row: any, config: ReturnType<typeof resolveTimeChamberConfig> = null): TimeChamberState | null {
  const sourceInstanceId = normalizeString(row?.source_instance_id);
  const buildingId = normalizeString(row?.building_id);
  const chamberInstanceId = normalizeString(row?.chamber_instance_id);
  const templateId = normalizeString(row?.template_id);
  const ownerPlayerId = normalizeString(row?.owner_player_id);
  if (!sourceInstanceId || !buildingId || !chamberInstanceId || !templateId || !ownerPlayerId) {
    return null;
  }
  const sizeTier = normalizeSizeTier(row?.size_tier) ?? 'small';
  return {
    sourceInstanceId,
    buildingId,
    chamberInstanceId,
    templateId,
    ownerPlayerId,
    displayName: normalizeName(row?.display_name) || '密室',
    sizeTier,
    capacity: Math.max(1, Math.trunc(Number(row?.capacity) || config?.capacity || 1)),
    configuredSpeed: Math.max(BASE_SPEED, Math.min(MAX_INSTANCE_TICK_SPEED, Math.trunc(Number(row?.configured_speed) || BASE_SPEED))),
    databaseFuelUnits: normalizeSafeInteger(row?.fuel_units),
    reservedFuelUnits: 0,
    fuelUnitsPerSpiritStone: config?.fuelUnitsPerSpiritStone ?? 36_000,
    maxSpeed: config?.maxSpeed ?? MAX_INSTANCE_TICK_SPEED,
    allowedSizeTiers: config?.allowedSizeTiers ?? ['small', 'medium', 'large'],
    revision: Math.max(1, normalizeSafeInteger(row?.revision)),
  };
}

function resolveCompiledBuilding(instance: any, building: any): any {
  return instance?.buildingCatalog?.defByHandle?.[building?.defHandle]
    ?? instance?.buildingCatalog?.defById?.get?.(building?.defId)
    ?? null;
}

function resolveTimeChamberConfig(compiled: any): { capacity: number; maxSpeed: number; fuelUnitsPerSpiritStone: number; allowedSizeTiers: TimeChamberSizeTier[] } | null {
  const capacity = Math.max(0, Math.trunc(Number(compiled?.timeChamberDefaultCapacity) || 0));
  if (capacity <= 0) {
    return null;
  }
  const allowed = Array.isArray(compiled?.timeChamberAllowedSizeTiers)
    ? compiled.timeChamberAllowedSizeTiers.filter((entry) => normalizeSizeTier(entry) !== null)
    : [];
  return {
    capacity,
    maxSpeed: Math.max(BASE_SPEED, Math.min(MAX_INSTANCE_TICK_SPEED, Math.trunc(Number(compiled?.timeChamberMaxSpeed) || MAX_INSTANCE_TICK_SPEED))),
    fuelUnitsPerSpiritStone: Math.max(1, Math.min(MAX_FUEL_UNITS_PER_SPIRIT_STONE, Math.trunc(Number(compiled?.timeChamberFuelUnitsPerSpiritStone) || 36_000))),
    allowedSizeTiers: allowed.length > 0 ? allowed : ['small', 'medium', 'large'],
  };
}

function isTimeChamberBuilding(instance: any, building: any): boolean {
  if (building?.defId === TIME_CHAMBER_DEF_ID || building?.defHandle === TIME_CHAMBER_DEF_ID) {
    return true;
  }
  return Math.max(0, Math.trunc(Number(resolveCompiledBuilding(instance, building)?.timeChamberDefaultCapacity) || 0)) > 0;
}

function buildTimeChamberMapDocument(state: Pick<TimeChamberState, 'templateId' | 'displayName' | 'sizeTier' | 'chamberInstanceId'>): any {
  const { width, height } = SIZE_BY_TIER[state.sizeTier];
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.'
  )).join(''));
  return {
    id: state.templateId,
    name: state.displayName,
    width,
    height,
    routeDomain: `time-chamber:${state.chamberInstanceId}`,
    mapLv: 1,
    tiles,
    spawnPoint: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [{ x: Math.floor(width / 2), y: Math.floor(height / 2), radius: Math.max(width, height) }],
    landmarks: [],
    containers: [],
    auras: [],
  };
}

function removeInventoryItemCount(items: any[], itemId: string, count: number): { ok: boolean; nextItems: any[]; removedItems: any[] } {
  let remaining = count;
  const nextItems: any[] = [];
  const removedItems: any[] = [];
  for (const item of items) {
    const available = Math.max(0, Math.trunc(Number(item?.count) || 0));
    if (item?.itemId !== itemId || remaining <= 0) {
      nextItems.push({ ...item });
      continue;
    }
    const removed = Math.min(available, remaining);
    remaining -= removed;
    removedItems.push({ ...item, count: removed });
    if (available > removed) {
      nextItems.push({ ...item, count: available - removed });
    }
  }
  return { ok: remaining === 0, nextItems: remaining === 0 ? nextItems : items, removedItems: remaining === 0 ? removedItems : [] };
}

function markBuildingChanged(instance: any, building: any): void {
  instance.localBuildingViewCacheById?.delete?.(building.id);
  instance.markAoiViewChangedAt?.(building.x, building.y);
  instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
  instance.persistentRevision = Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)) + 1;
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);
}

function buildBuildingKey(sourceInstanceId: string, buildingId: string): string {
  return `${normalizeString(sourceInstanceId)}\u0000${normalizeString(buildingId)}`;
}

function buildStableChamberHash(sourceInstanceId: string, buildingId: string): string {
  return createHash('sha256').update(`${sourceInstanceId}\u0000${buildingId}`).digest('hex').slice(0, 24);
}

function buildFuelOperationId(playerId: string, state: Pick<TimeChamberState, 'sourceInstanceId' | 'buildingId'>, requestId: string): string {
  const hash = createHash('sha256')
    .update(`${playerId}\u0000${state.sourceInstanceId}\u0000${state.buildingId}\u0000${requestId}`)
    .digest('hex')
    .slice(0, 32);
  return `time-chamber-fuel:${hash}`;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRequestId(value: unknown): string | undefined {
  const requestId = normalizeString(value);
  return requestId && requestId.length <= MAX_REQUEST_ID_LENGTH ? requestId : undefined;
}

function normalizeName(value: unknown): string {
  const name = normalizeString(value).replace(/[\u0000-\u001f\u007f]/g, '');
  return name.length > 0 && Array.from(name).length <= MAX_NAME_LENGTH ? name : '';
}

function normalizeSizeTier(value: unknown): TimeChamberSizeTier | null {
  return value === 'small' || value === 'medium' || value === 'large' ? value : null;
}

function normalizeSafeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function chebyshevDistance(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return Math.max(Math.abs(Math.trunc(leftX) - Math.trunc(rightX)), Math.abs(Math.trunc(leftY) - Math.trunc(rightY)));
}

function fuelCostPerLogicalTick(speed: number): number {
  return Math.max(0, Math.trunc(speed) - BASE_SPEED);
}

function fuelConsumptionUnitsPerSecond(speed: number): number {
  return speed > BASE_SPEED ? Math.trunc(speed) * fuelCostPerLogicalTick(speed) : 0;
}

function reserveTargetUnits(speed: number, seconds: number): number {
  return Math.max(fuelCostPerLogicalTick(speed), fuelConsumptionUnitsPerSecond(speed) * seconds);
}

function resolveEffectiveInstanceSpeed(instance: any): number {
  if (!instance || instance.paused === true) {
    return 0;
  }
  const speed = Number(instance.tickSpeed);
  return Number.isFinite(speed) ? Math.max(0, Math.min(MAX_INSTANCE_TICK_SPEED, speed)) : BASE_SPEED;
}

function matchesExpectedRevision(expectedRevision: unknown, currentRevision: number): boolean {
  const revision = Number(expectedRevision);
  return Number.isSafeInteger(revision) && revision >= 1 && revision === currentRevision;
}

function isPlayerDomainPersistenceEnabled(persistence: any): boolean {
  return typeof persistence?.isEnabled === 'function' && persistence.isEnabled() === true;
}

interface RuntimeLeaseFence {
  assignedNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
}

function resolveRuntimeLeaseFence(instance: any): RuntimeLeaseFence | null {
  const assignedNodeId = normalizeString(instance?.meta?.assignedNodeId);
  const leaseToken = normalizeString(instance?.meta?.leaseToken);
  const ownershipEpoch = normalizeCatalogOwnershipEpoch(instance?.meta?.ownershipEpoch);
  return assignedNodeId && leaseToken
    ? { assignedNodeId, leaseToken, ownershipEpoch }
    : null;
}

/** 活跃租约只能由持有完全相同 lease/epoch 的本地运行态销毁；过期或空租约由行锁和 epoch 递增接管。 */
function canRetireCatalogRow(row: any, expectedLeaseFence: RuntimeLeaseFence | null): boolean {
  if (row?.lease_active !== true) {
    return true;
  }
  return expectedLeaseFence !== null
    && normalizeString(row?.assigned_node_id) === expectedLeaseFence.assignedNodeId
    && normalizeString(row?.lease_token) === expectedLeaseFence.leaseToken
    && normalizeCatalogOwnershipEpoch(row?.ownership_epoch) === expectedLeaseFence.ownershipEpoch;
}

function normalizeCatalogOwnershipEpoch(value: unknown): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function isRuntimeInstanceWritable(runtime: any, instance: any): boolean {
  if (!instance) {
    return false;
  }
  if (typeof runtime?.isInstanceLeaseWritable === 'function') {
    return runtime.isInstanceLeaseWritable(instance) === true;
  }
  const runtimeStatus = normalizeString(instance?.meta?.runtimeStatus);
  const status = normalizeString(instance?.meta?.status);
  return runtimeStatus !== 'fenced'
    && runtimeStatus !== 'lease_degraded'
    && runtimeStatus !== 'stopped'
    && status !== 'destroyed';
}

function normalizeOperationFailure(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return /^[a-z0-9_:-]{1,120}$/i.test(message) ? message : fallback;
}
