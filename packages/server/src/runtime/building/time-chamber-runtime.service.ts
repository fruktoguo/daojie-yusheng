/**
 * 密室建筑领域服务。
 *
 * 建筑、玩家位置与实例 tick 仍由 WorldRuntimeService 权威维护；本服务只拥有密室玩法配置、
 * 全室限时开启状态和外部建筑到独立实例的稳定映射。开启成本一次预扣，tick 热路径不访问数据库。
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  calculateTimeChamberActivationCost,
  calculateTimeChamberOperatingCostPerHour,
  MAX_INSTANCE_TICK_SPEED,
  requiresTimeChamberActivation,
  resolveTimeChamberCapacityLimit,
  SPIRIT_STONE_ITEM_ID,
  TIME_CHAMBER_MAX_SPEED,
  TIME_CHAMBER_MAX_USAGE_HOURS,
  TIME_CHAMBER_MIN_USAGE_HOURS,
  TIME_CHAMBER_SIZE_OPTIONS,
  type C2S_ActivateTimeChamberView,
  type C2S_EnterTimeChamberView,
  type C2S_RequestTimeChamberView,
  type C2S_ResizeTimeChamberView,
  type C2S_UpdateTimeChamberSettingsView,
  type TimeChamberManagementDetailView,
  type TimeChamberOperationResultView,
  type TimeChamberSizeTier,
  type TimeChamberSummaryView,
  type TimeChamberUsageDetailView,
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
import { resolveCompiledBuildingDefinition } from './building-definition-resolution.helpers';
import { TimeChamberAdmissionPolicy } from './time-chamber-admission.policy';
import {
  resolveTimeChamberPasswordHashPatch,
  verifyTimeChamberAccessPassword,
} from './time-chamber-password.helpers';
import { WorldRuntimeInstanceScheduleService } from '../world/world-runtime-instance-schedule.service';

const TIME_CHAMBER_TABLE = 'instance_time_chamber_state';
const TIME_CHAMBER_DEF_ID = 'time_chamber';
const MAX_NAME_LENGTH = 20;
const MAX_REQUEST_ID_LENGTH = 128;
const BASE_SPEED = 1;
const EXPIRY_TIMER_MAX_DELAY_MS = 2_147_000_000;
const EXPIRY_RETRY_DELAY_MS = 5_000;
const ORPHAN_CLEANUP_RETRY_DELAY_MS = 5_000;
const ORPHAN_CLEANUP_MAX_ATTEMPTS = 6;

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
  activeStartedAt: number | null;
  activeExpiresAt: number | null;
  activationPlayerId: string | null;
  activationSpiritStones: number;
  accessPasswordHash: string | null;
  maxSpeed: number;
  allowedSizeTiers: TimeChamberSizeTier[];
  revision: number;
}

interface TimeChamberRecoveryOptions {
  instanceDomainRestoreMode?: 'eager' | 'lazy';
}

@Injectable()
export class TimeChamberRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimeChamberRuntimeService.name);
  private readonly stateByBuildingKey = new Map<string, TimeChamberState>();
  private readonly stateByChamberInstanceId = new Map<string, TimeChamberState>();
  private readonly operationTailByKey = new Map<string, Promise<unknown>>();
  private pool: PoolLike | null = null;
  private enabled = false;
  private initPromise: Promise<void> | null = null;
  private worldRuntime: any = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private orphanCleanupRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly orphanCleanupRetryByKey = new Map<string, { state: TimeChamberState; attempt: number }>();

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

  onModuleDestroy(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (this.orphanCleanupRetryTimer) {
      clearTimeout(this.orphanCleanupRetryTimer);
      this.orphanCleanupRetryTimer = null;
    }
    this.orphanCleanupRetryByKey.clear();
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

  /** 实例目录恢复后应用配置和全室开启状态，并补建尚未进入 catalog 的密室实例。 */
  async applyRecoveredRuntimeState(runtime: any, options: TimeChamberRecoveryOptions = {}): Promise<void> {
    this.worldRuntime = runtime;
    await this.relocateExpiredPersistedPlayers(runtime);
    const staleStates: TimeChamberState[] = [];
    const hydratedInstanceIds = new Set<string>();
    const ensureRecoveredInstanceReady = async (
      instanceId: string,
      instance: any,
      requiresPersistentHydration: boolean,
    ): Promise<boolean> => {
      await runtime.waitForInstanceLeaseReady?.(instanceId);
      if (runtime.getInstanceRuntime?.(instanceId) !== instance) {
        throw new Error(`time_chamber_recovery_runtime_replaced:${instanceId}`);
      }
      if (!isRuntimeInstanceWritable(runtime, instance)) {
        return false;
      }
      if (!requiresPersistentHydration || hydratedInstanceIds.has(instanceId)) {
        return true;
      }
      if (typeof runtime.hydratePersistentInstanceSnapshot !== 'function') {
        throw new Error(`time_chamber_recovery_hydration_unavailable:${instanceId}`);
      }
      await runtime.hydratePersistentInstanceSnapshot(instanceId, instance);
      if (runtime.getInstanceRuntime?.(instanceId) !== instance) {
        throw new Error(`time_chamber_recovery_runtime_replaced:${instanceId}`);
      }
      hydratedInstanceIds.add(instanceId);
      return true;
    };
    const applyLocalChamberBinding = async (state: TimeChamberState): Promise<void> => {
      const chamberInstance = runtime.getInstanceRuntime?.(state.chamberInstanceId);
      if (!chamberInstance || !isRuntimeInstanceWritable(runtime, chamberInstance)) {
        return;
      }
      if (options.instanceDomainRestoreMode === 'lazy'
        && !await ensureRecoveredInstanceReady(state.chamberInstanceId, chamberInstance, true)) {
        return;
      }
      chamberInstance.meta.ownerPlayerId = state.ownerPlayerId;
      chamberInstance.meta.displayName = state.displayName;
      this.applyInstanceBindingMetadata(state, chamberInstance);
      this.applyEffectiveSpeed(state, chamberInstance, runtime);
    };
    for (const state of Array.from(this.stateByBuildingKey.values())) {
      const sourceInstance = runtime.getInstanceRuntime?.(state.sourceInstanceId);
      if (!sourceInstance || !isRuntimeInstanceWritable(runtime, sourceInstance)) {
        // 分片节点只处理本地可写实例；远端或续租降级实例不能被误判成孤儿并修改全局状态。
        await applyLocalChamberBinding(state);
        continue;
      }
      if (options.instanceDomainRestoreMode === 'lazy'
        && !await ensureRecoveredInstanceReady(state.sourceInstanceId, sourceInstance, true)) {
        await applyLocalChamberBinding(state);
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
      const existingInstance = runtime.getInstanceRuntime?.(state.chamberInstanceId) ?? null;
      // lazy 启动只恢复 catalog 空壳；密室会继续 tick，必须在开放玩家挂接前补齐全部分域真源。
      const requiresPersistentHydration = options.instanceDomainRestoreMode === 'lazy' || !existingInstance;
      const instance = this.ensureRuntimeInstance(state, runtime);
      if (!await ensureRecoveredInstanceReady(
        state.chamberInstanceId,
        instance,
        requiresPersistentHydration,
      )) {
        this.logger.warn(`密室实例当前不归本节点写入，跳过恢复应用：${state.chamberInstanceId}`);
        continue;
      }
      if (requiresPersistentHydration) {
        this.logger.log(`密室运行态已从持久化状态完成水合：${state.chamberInstanceId}`);
      }
      instance.meta.ownerPlayerId = state.ownerPlayerId;
      instance.meta.displayName = state.displayName;
      this.applyInstanceBindingMetadata(state, instance);
      this.applyEffectiveSpeed(state, instance, runtime);
    }
    for (const state of staleStates) {
      await this.cleanupRecoveredOrphanState(state, runtime, 1);
    }
    await this.ensurePersistentChambersForActiveBuildings(runtime);
    this.scheduleNextActivationExpiry();
  }

  /** 建筑完工后立即建立稳定状态与常驻实例，不依赖玩家首次打开面板。 */
  async ensurePersistentChamberForBuilding(
    sourceInstanceIdInput: string,
    buildingIdInput: string,
    runtime: any,
  ): Promise<{ ok: boolean; reason?: string; chamberInstanceId?: string }> {
    await this.initPromise;
    this.worldRuntime = runtime;
    if (!this.isEnabled()) {
      return { ok: false, reason: 'time_chamber_persistence_disabled' };
    }
    const sourceInstanceId = normalizeString(sourceInstanceIdInput);
    const buildingId = normalizeString(buildingIdInput);
    const sourceInstance = sourceInstanceId ? runtime.getInstanceRuntime?.(sourceInstanceId) : null;
    const building = sourceInstance?.buildingById?.get?.(buildingId) ?? null;
    if (!sourceInstance || !building || building.state !== 'active' || !isTimeChamberBuilding(sourceInstance, building)) {
      return { ok: false, reason: 'time_chamber_not_found' };
    }
    if (!isRuntimeInstanceWritable(runtime, sourceInstance)) {
      return { ok: false, reason: 'time_chamber_unavailable' };
    }
    const state = await this.ensureState(sourceInstance, building);
    if (!state) {
      return { ok: false, reason: 'time_chamber_state_create_failed' };
    }
    const instance = this.ensureRuntimeInstance(state, runtime);
    await runtime.waitForInstanceLeaseReady?.(state.chamberInstanceId);
    if (!isRuntimeInstanceWritable(runtime, instance)) {
      return { ok: false, reason: 'time_chamber_unavailable' };
    }
    this.applyInstanceBindingMetadata(state, instance);
    this.applyEffectiveSpeed(state, instance, runtime);
    return { ok: true, chamberInstanceId: state.chamberInstanceId };
  }

  async buildDetail(
    playerId: string,
    payload: C2S_RequestTimeChamberView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    const mode = payload.mode === 'management' ? 'management' : payload.mode === 'usage' ? 'usage' : null;
    if (!requestId) {
      return { ok: false, operation: 'usage_detail', reason: 'request_id_required' };
    }
    if (!mode) {
      return { ok: false, operation: 'usage_detail', requestId, reason: 'invalid_time_chamber_panel_mode' };
    }
    return this.runBuildingOperation(payload, async () => {
      const operation = mode === 'management' ? 'management_detail' : 'usage_detail';
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, mode === 'management');
      if (resolved.ok !== true) {
        return { ok: false, operation, requestId, reason: resolved.reason };
      }
      return mode === 'management'
        ? {
          ok: true,
          operation,
          requestId,
          managementDetail: this.buildManagementDetailView(playerId, resolved.state, resolved.chamberInstance),
        }
        : {
          ok: true,
          operation,
          requestId,
          usageDetail: this.buildUsageDetailView(playerId, resolved.state, resolved.chamberInstance),
        };
    });
  }

  async activate(
    playerId: string,
    payload: C2S_ActivateTimeChamberView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'activate', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, false);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'activate', requestId, reason: resolved.reason };
      }
      if (!requiresTimeChamberActivation(resolved.state.configuredSpeed)) {
        return { ok: false, operation: 'activate', requestId, reason: 'time_chamber_activation_not_required' };
      }
      const durationHours = Math.trunc(Number(payload.durationHours));
      if (
        !Number.isSafeInteger(durationHours)
        || durationHours < TIME_CHAMBER_MIN_USAGE_HOURS
        || durationHours > TIME_CHAMBER_MAX_USAGE_HOURS
      ) {
        return { ok: false, operation: 'activate', requestId, reason: 'invalid_time_chamber_duration' };
      }
      if (!matchesExpectedRevision(payload.expectedRevision, resolved.state.revision)) {
        return { ok: false, operation: 'activate', requestId, reason: 'time_chamber_revision_conflict' };
      }
      if (resolved.state.activeExpiresAt !== null) {
        const reason = resolved.state.activeExpiresAt > Date.now()
          ? 'time_chamber_already_active'
          : 'time_chamber_expiry_pending';
        return { ok: false, operation: 'activate', requestId, reason };
      }
      const passwordVerification = await verifyTimeChamberAccessPassword(
        payload.accessPassword,
        resolved.state.accessPasswordHash,
      );
      if ('reason' in passwordVerification) {
        return { ok: false, operation: 'activate', requestId, reason: passwordVerification.reason };
      }
      const admission = await this.resolveAdmission(playerId, resolved.state, resolved.chamberInstance, runtime);
      if (!admission.ok) {
        return { ok: false, operation: 'activate', requestId, reason: admission.reason };
      }
      const operationId = buildTimeChamberOperationId('activate', playerId, resolved.state, requestId);
      try {
        await this.activateDurably(playerId, resolved.state, durationHours, operationId, runtime);
        await this.reloadState(resolved.state);
        this.applyEffectiveSpeed(resolved.state, resolved.chamberInstance, runtime);
        this.scheduleNextActivationExpiry();
        const entryQueued = this.enqueueEnterCommand(playerId, resolved.state, runtime);
        return {
          ok: true,
          operation: 'activate',
          requestId,
          entryQueued,
          usageDetail: this.buildUsageDetailView(playerId, resolved.state, resolved.chamberInstance),
        };
      } catch (error) {
        this.logger.warn(`密室开启失败：${error instanceof Error ? error.message : String(error)}`);
        return {
          ok: false,
          operation: 'activate',
          requestId,
          reason: normalizeOperationFailure(error, 'time_chamber_activation_failed'),
        };
      }
    });
  }

  async queueEnter(
    playerId: string,
    payload: C2S_EnterTimeChamberView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'enter', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, false);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'enter', requestId, reason: resolved.reason };
      }
      if (
        requiresTimeChamberActivation(resolved.state.configuredSpeed)
        && !isTimeChamberActive(resolved.state, Date.now())
      ) {
        return { ok: false, operation: 'enter', requestId, reason: 'time_chamber_activation_required' };
      }
      const passwordVerification = await verifyTimeChamberAccessPassword(
        payload.accessPassword,
        resolved.state.accessPasswordHash,
      );
      if ('reason' in passwordVerification) {
        return { ok: false, operation: 'enter', requestId, reason: passwordVerification.reason };
      }
      const admission = await this.resolveAdmission(playerId, resolved.state, resolved.chamberInstance, runtime);
      if (!admission.ok) {
        return { ok: false, operation: 'enter', requestId, reason: admission.reason };
      }
      if (!this.enqueueEnterCommand(playerId, resolved.state, runtime)) {
        return { ok: false, operation: 'enter', requestId, reason: 'time_chamber_unavailable' };
      }
      return {
        ok: true,
        operation: 'enter',
        requestId,
        entryQueued: true,
        usageDetail: this.buildUsageDetailView(playerId, resolved.state, resolved.chamberInstance),
      };
    });
  }

  async updateSettings(
    playerId: string,
    payload: C2S_UpdateTimeChamberSettingsView,
    runtime: any,
  ): Promise<TimeChamberOperationResultView> {
    const requestId = normalizeRequestId(payload.requestId);
    if (!requestId) {
      return { ok: false, operation: 'settings', reason: 'request_id_required' };
    }
    return this.runBuildingOperation(payload, async () => {
      const resolved = await this.resolveManagedChamber(playerId, payload, runtime, true);
      if (resolved.ok !== true) {
        return { ok: false, operation: 'settings', requestId, reason: resolved.reason };
      }
      const name = normalizeName(payload.name);
      const speed = Math.trunc(Number(payload.speed));
      const capacity = Math.trunc(Number(payload.capacity));
      const maxCapacity = resolveTimeChamberCapacityLimit(resolved.state.sizeTier);
      if (!name) {
        return { ok: false, operation: 'settings', requestId, reason: 'invalid_time_chamber_name' };
      }
      if (!Number.isInteger(speed) || speed < BASE_SPEED || speed > resolved.state.maxSpeed) {
        return { ok: false, operation: 'settings', requestId, reason: 'invalid_time_chamber_speed' };
      }
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > maxCapacity) {
        return { ok: false, operation: 'settings', requestId, reason: 'invalid_time_chamber_capacity' };
      }
      if (!matchesExpectedRevision(payload.expectedRevision, resolved.state.revision)) {
        return { ok: false, operation: 'settings', requestId, reason: 'time_chamber_revision_conflict' };
      }
      if (
        resolved.state.activeExpiresAt !== null
        && (speed !== resolved.state.configuredSpeed || capacity !== resolved.state.capacity)
      ) {
        return { ok: false, operation: 'settings', requestId, reason: 'time_chamber_settings_locked' };
      }
      let passwordPatch;
      try {
        passwordPatch = await resolveTimeChamberPasswordHashPatch(payload.passwordChange);
      } catch (error) {
        return {
          ok: false,
          operation: 'settings',
          requestId,
          reason: normalizeOperationFailure(error, 'invalid_time_chamber_password'),
        };
      }
      await this.updateConfigRow(resolved.state, {
        configuredSpeed: speed,
        displayName: name,
        capacity,
        ...(passwordPatch.provided ? { accessPasswordHash: passwordPatch.passwordHash } : {}),
      });
      const nameChanged = name !== resolved.state.displayName;
      resolved.state.configuredSpeed = speed;
      resolved.state.displayName = name;
      resolved.state.capacity = capacity;
      if (passwordPatch.provided) resolved.state.accessPasswordHash = passwordPatch.passwordHash;
      resolved.state.revision += 1;
      if (nameChanged) {
        resolved.building.name = name;
        resolved.building.updatedAtTick = Math.max(0, Math.trunc(Number(resolved.sourceInstance.tick) || 0));
        resolved.building.revision = Math.max(1, Math.trunc(Number(resolved.building.revision) || 1)) + 1;
        markBuildingChanged(resolved.sourceInstance, resolved.building);
        resolved.chamberInstance.meta.displayName = name;
        this.templateRepository.renameRuntimeMapTemplate?.(resolved.state.templateId, name);
        resolved.chamberInstance.worldRevision = Math.max(0, Math.trunc(Number(resolved.chamberInstance.worldRevision) || 0)) + 1;
      }
      this.applyEffectiveSpeed(resolved.state, resolved.chamberInstance, runtime);
      await runtime.flushInstanceDomains?.(resolved.state.chamberInstanceId, ['time']);
      return {
        ok: true,
        operation: 'settings',
        requestId,
        managementDetail: this.buildManagementDetailView(playerId, resolved.state, resolved.chamberInstance),
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
      if (resolved.state.activeExpiresAt !== null) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_settings_locked' };
      }
      if (resolved.state.capacity > resolveTimeChamberCapacityLimit(sizeTier)) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_capacity_exceeds_size' };
      }
      if (resolved.chamberInstance.listPlayerIds().length > 0) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_occupied' };
      }
      if ((runtime.worldRuntimeFormationService?.listRuntimeFormations?.(resolved.state.chamberInstanceId)?.length ?? 0) > 0) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_not_empty' };
      }
      if ((resolved.chamberInstance.buildingById?.size ?? 0) > 0) {
        return { ok: false, operation: 'resize', requestId, reason: 'time_chamber_has_buildings' };
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
        managementDetail: this.buildManagementDetailView(playerId, resolved.state, resolved.chamberInstance),
      };
    });
  }

  /** 密室处于有效开启时段时，玩家可在容量限制内进入。 */
  async enter(
    playerId: string,
    sourceInstanceId: string,
    buildingId: string,
    runtime: any,
    passwordVerifiedRevision?: unknown,
  ): Promise<{ ok: boolean; reason?: string }> {
    return this.runBuildingOperation({ sourceInstanceId, buildingId }, async () => {
      const resolved = await this.resolveManagedChamber(playerId, { sourceInstanceId, buildingId }, runtime, false);
      if (resolved.ok !== true) {
        return { ok: false, reason: resolved.reason };
      }
      if (
        requiresTimeChamberActivation(resolved.state.configuredSpeed)
        && !isTimeChamberActive(resolved.state, Date.now())
      ) {
        return { ok: false, reason: 'time_chamber_activation_required' };
      }
      if (
        resolved.state.accessPasswordHash
        && !matchesExpectedRevision(passwordVerifiedRevision, resolved.state.revision)
      ) {
        return { ok: false, reason: 'time_chamber_unavailable' };
      }
      const admission = await this.resolveAdmission(playerId, resolved.state, resolved.chamberInstance, runtime);
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

  /** 开启成本已一次预扣；这里只在调度批次边界强制执行到期回落。 */
  authorizeScheduledSteps(instanceId: string, instance: any, requestedSteps: number, speed: number, runtime: any): number {
    const state = this.stateByChamberInstanceId.get(instanceId);
    if (!state) {
      return requestedSteps;
    }
    this.worldRuntime = runtime;
    if (!isTimeChamberActive(state, Date.now())) {
      this.applyEffectiveSpeed(state, instance, runtime);
      if (!this.expiryTimer && state.activeExpiresAt !== null) {
        this.scheduleNextActivationExpiry();
      }
      return Math.min(Math.max(0, Math.trunc(requestedSteps)), 1);
    }
    return requestedSteps;
  }

  consumeScheduledStep(_instanceId: string, _instance: any, _speed: number, _runtime: any): boolean {
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
      if (state.activeExpiresAt !== null) {
        return { ok: false, reason: 'time_chamber_active' };
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

  getInstanceBinding(chamberInstanceIdInput: string): {
    chamberInstanceId: string;
    sourceInstanceId: string;
    buildingId: string;
    displayName: string;
  } | null {
    const state = this.stateByChamberInstanceId.get(normalizeString(chamberInstanceIdInput));
    if (!state) return null;
    return {
      chamberInstanceId: state.chamberInstanceId,
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      displayName: state.displayName,
    };
  }

  getInteractionSummary(sourceInstanceId: string, buildingId: string): {
    displayName: string;
    configuredSpeed: number;
    effectiveSpeed: number;
    occupancy: number;
    capacity: number;
  } | null {
    const state = this.getStateByExteriorBuilding(sourceInstanceId, buildingId);
    if (!state) return null;
    const active = isTimeChamberActive(state, Date.now());
    const instance = this.worldRuntime?.getInstanceRuntime?.(state.chamberInstanceId);
    return {
      displayName: state.displayName,
      configuredSpeed: state.configuredSpeed,
      effectiveSpeed: active ? state.configuredSpeed : BASE_SPEED,
      occupancy: instance?.listPlayerIds?.().length ?? 0,
      capacity: state.capacity,
    };
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
      this.scheduleNextActivationExpiry();
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
    await runtime.waitForInstanceLeaseReady?.(state.chamberInstanceId);
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
         revision, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'small', $7, 1, 1, now(), now())
       ON CONFLICT (source_instance_id, building_id) DO NOTHING
       RETURNING *`,
      [
        sourceInstanceId,
        building.id,
        chamberInstanceId,
        templateId,
        ownerPlayerId,
        displayName,
        config.capacity,
      ],
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
      this.applyInstanceBindingMetadata(state, existing);
      return existing;
    }
    this.registerTemplate(state);
    const instance = runtime.createInstance({
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
      parentInstanceId: state.sourceInstanceId,
      parentBuildingId: state.buildingId,
    });
    this.applyInstanceBindingMetadata(state, instance);
    return instance;
  }

  private applyInstanceBindingMetadata(state: TimeChamberState, instance: any): void {
    if (!instance?.meta) return;
    instance.meta.parentInstanceId = state.sourceInstanceId;
    instance.meta.parentBuildingId = state.buildingId;
  }

  private async ensurePersistentChambersForActiveBuildings(runtime: any): Promise<void> {
    const entries = typeof runtime.listInstanceEntries === 'function'
      ? runtime.listInstanceEntries()
      : [];
    for (const [instanceId, instance] of entries) {
      if (!instance?.meta?.persistent || !isRuntimeInstanceWritable(runtime, instance)) continue;
      for (const building of instance.buildingById?.values?.() ?? []) {
        if (building?.state !== 'active' || !isTimeChamberBuilding(instance, building)) continue;
        const result = await this.ensurePersistentChamberForBuilding(instanceId, building.id, runtime);
        if (result.ok !== true) {
          this.logger.warn(`密室常驻实例补建失败：${instanceId}/${building.id} reason=${result.reason ?? ''}`);
        }
      }
    }
  }

  private async cleanupRecoveredOrphanState(state: TimeChamberState, runtime: any, attempt: number): Promise<void> {
    const key = buildBuildingKey(state.sourceInstanceId, state.buildingId);
    if (this.stateByBuildingKey.get(key) !== state) return;
    try {
      await runtime.waitForInstanceLeaseReady?.(state.chamberInstanceId);
    } catch (error) {
      this.logger.warn(`密室孤儿实例等待租约失败：${state.chamberInstanceId} ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = await this.prepareDeconstruct(state.sourceInstanceId, state.buildingId, runtime);
    if (result.ok === true) {
      this.orphanCleanupRetryByKey.delete(key);
      return;
    }
    if (result.reason === 'time_chamber_unavailable' && attempt < ORPHAN_CLEANUP_MAX_ATTEMPTS) {
      this.orphanCleanupRetryByKey.set(key, { state, attempt: attempt + 1 });
      this.scheduleOrphanCleanupRetry(runtime);
      return;
    }
    this.logger.warn(`密室孤儿状态清理失败：${state.chamberInstanceId} reason=${result.reason ?? ''}`);
  }

  private scheduleOrphanCleanupRetry(runtime: any): void {
    if (this.orphanCleanupRetryTimer || this.orphanCleanupRetryByKey.size === 0) return;
    this.orphanCleanupRetryTimer = setTimeout(() => {
      this.orphanCleanupRetryTimer = null;
      const pending = Array.from(this.orphanCleanupRetryByKey.values());
      this.orphanCleanupRetryByKey.clear();
      void (async () => {
        for (const entry of pending) {
          await this.cleanupRecoveredOrphanState(entry.state, runtime, entry.attempt);
        }
      })().catch((error) => {
        this.logger.warn(`密室孤儿状态重试队列失败：${error instanceof Error ? error.message : String(error)}`);
      });
    }, ORPHAN_CLEANUP_RETRY_DELAY_MS);
    this.orphanCleanupRetryTimer.unref?.();
  }

  private registerTemplate(state: Pick<TimeChamberState, 'templateId' | 'displayName' | 'sizeTier' | 'chamberInstanceId'>): any {
    return this.templateRepository.registerRuntimeMapTemplate(buildTimeChamberMapDocument(state));
  }

  private buildSummaryView(playerId: string, state: TimeChamberState, instance: any): TimeChamberSummaryView {
    const dimensions = TIME_CHAMBER_SIZE_OPTIONS[state.sizeTier];
    const active = isTimeChamberActive(state, Date.now());
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
      capacity: state.capacity,
      occupancy: instance?.listPlayerIds?.().length ?? 0,
      configuredSpeed: state.configuredSpeed,
      effectiveSpeed: resolveEffectiveInstanceSpeed(instance),
      active,
      activeUntil: active ? state.activeExpiresAt : null,
      passwordProtected: Boolean(state.accessPasswordHash),
      revision: state.revision,
    };
  }

  private buildUsageDetailView(playerId: string, state: TimeChamberState, instance: any): TimeChamberUsageDetailView {
    const summary = this.buildSummaryView(playerId, state, instance);
    return {
      ...summary,
      activationCostSpiritStonesPerHour: calculateTimeChamberOperatingCostPerHour(
        state.configuredSpeed,
        state.capacity,
        state.sizeTier,
      ),
      minUsageHours: TIME_CHAMBER_MIN_USAGE_HOURS,
      maxUsageHours: TIME_CHAMBER_MAX_USAGE_HOURS,
    };
  }

  private buildManagementDetailView(playerId: string, state: TimeChamberState, instance: any): TimeChamberManagementDetailView {
    const summary = this.buildSummaryView(playerId, state, instance);
    const operatingCost = calculateTimeChamberOperatingCostPerHour(
      state.configuredSpeed,
      state.capacity,
      state.sizeTier,
    );
    return {
      ...summary,
      minSpeed: BASE_SPEED,
      maxSpeed: state.maxSpeed,
      maxCapacity: resolveTimeChamberCapacityLimit(state.sizeTier),
      allowedSizes: state.allowedSizeTiers.map((tier) => ({
        tier,
        width: TIME_CHAMBER_SIZE_OPTIONS[tier].width,
        height: TIME_CHAMBER_SIZE_OPTIONS[tier].height,
        costMultiplierPercent: TIME_CHAMBER_SIZE_OPTIONS[tier].costMultiplierPercent,
      })),
      operatingCostSpiritStonesPerHour: operatingCost,
      settingsLocked: state.activeExpiresAt !== null,
      hasBuildings: (instance?.buildingById?.size ?? 0) > 0,
    };
  }

  private async activateDurably(
    playerId: string,
    state: TimeChamberState,
    durationHours: number,
    operationId: string,
    runtime: any,
  ): Promise<void> {
    const player = this.playerRuntimeService.getPlayerOrThrow(playerId) as any;
    if (!this.durableOperationService.isEnabled?.() || !player.runtimeOwnerId || !Number.isFinite(Number(player.sessionEpoch))) {
      throw new Error('durable_inventory_unavailable');
    }
    await this.playerRuntimeService.runExclusiveAssetMutation([playerId], async () => {
      const activationCost = calculateTimeChamberActivationCost(
        state.configuredSpeed,
        state.capacity,
        durationHours,
        state.sizeTier,
      );
      const currentItems = Array.isArray(player.inventory?.items) ? player.inventory.items.map((entry) => ({ ...entry })) : [];
      const removal = removeInventoryItemCount(currentItems, SPIRIT_STONE_ITEM_ID, activationCost);
      if (!removal.ok) throw new Error('insufficient_spirit_stone');
      const leaseContext = await resolveInventoryGrantLeaseContext(player.instanceId, runtime.instanceCatalogService);
      if (player.instanceId && !leaseContext) throw new Error('inventory_grant_lease_context_required');
      const durableInput: GrantInventoryItemsInput & DurableInventoryMutationRequest = {
        operationId,
        playerId,
        expectedRuntimeOwnerId: player.runtimeOwnerId,
        expectedSessionEpoch: Math.max(1, Math.trunc(Number(player.sessionEpoch))),
        expectedInstanceId: player.instanceId ?? null,
        expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
        expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
        sourceType: 'time_chamber_activation',
        sourceRefId: state.chamberInstanceId,
        inventoryAction: 'transfer',
        grantedItems: buildGrantedInventorySnapshots(removal.removedItems),
        nextInventoryItems: buildNextInventorySnapshots(removal.nextItems),
        sourceMutation: {
          kind: 'time_chamber_activation',
          instanceId: state.sourceInstanceId,
          buildingId: state.buildingId,
          chamberInstanceId: state.chamberInstanceId,
          playerId,
          durationHours,
          expectedRevision: state.revision,
          chargedSpiritStones: activationCost,
        },
      };
      const applied = await this.commitDurableInventoryMutation(durableInput, playerId, operationId);
      if (applied) this.playerRuntimeService.replaceInventoryItems(playerId, removal.nextItems);
    });
  }

  private async commitDurableInventoryMutation(
    input: GrantInventoryItemsInput & DurableInventoryMutationRequest,
    playerId: string,
    operationId: string,
  ): Promise<boolean> {
    try {
      const result = await this.durableOperationService.grantInventoryItems(input);
      return result.alreadyCommitted !== true;
    } catch (error) {
      if (!isDurableCommitOutcomeUnknownError(error)) throw error;
      const reconciliation = await reconcileDurableInventoryCommitOutcome<
        GrantInventoryItemsInput & DurableInventoryMutationRequest
      >(this.durableOperationService, input);
      if (reconciliation.outcome === 'failed') throw reconciliation.error;
      if (reconciliation.outcome === 'unknown') throw error;
      this.playerRuntimeService.replaceInventoryItems(playerId, reconciliation.inventoryItems);
      this.logger.warn(reconciliation.replayReadFailed
        ? `密室资产事务已确认提交，但 operation 明细暂不可读，已按同一请求后态收敛：operationId=${operationId}`
        : `密室资产事务 COMMIT 回包不确定，已按 durable operation 回读收敛：operationId=${operationId}`);
      return false;
    }
  }

  private applyEffectiveSpeed(state: TimeChamberState, instance: any, runtime: any): void {
    const desired = isTimeChamberActive(state, Date.now())
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

  private async resolveAdmission(
    playerId: string,
    state: TimeChamberState,
    chamberInstance: any,
    runtime: any,
  ): Promise<{ ok: boolean; reason?: string }> {
    const persistence = this.playerRuntimeService.playerDomainPersistenceService;
    if (!isPlayerDomainPersistenceEnabled(persistence)
      || typeof persistence?.listRetainedPlayerIdsInInstance !== 'function') {
      return { ok: false, reason: 'time_chamber_persistence_disabled' };
    }
    const retainedPlayerIds = (await persistence.listRetainedPlayerIdsInInstance(
      state.chamberInstanceId,
      state.capacity + 1,
    )).filter((retainedPlayerId: string) => {
      // 位置 checkpoint 可能比刚完成的跨图传送晚一次 flush；在线运行态已明确离开时不能继续占用名额。
      const runtimeLocation = runtime.getPlayerLocation?.(retainedPlayerId);
      const runtimePlayer = this.playerRuntimeService.getPlayer?.(retainedPlayerId);
      const currentInstanceId = normalizeString(runtimeLocation?.instanceId)
        || normalizeString(runtimePlayer?.instanceId);
      return !currentInstanceId || currentInstanceId === state.chamberInstanceId;
    });
    return this.admissionPolicy.canEnter(
      chamberInstance,
      playerId,
      state.capacity,
      retainedPlayerIds,
    );
  }

  private enqueueEnterCommand(playerId: string, state: TimeChamberState, runtime: any): boolean {
    if (typeof runtime?.enqueuePendingCommand !== 'function') return false;
    runtime.enqueuePendingCommand(playerId, {
      kind: 'timeChamberTransfer',
      direction: 'enter',
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      ...(state.accessPasswordHash ? { passwordVerifiedRevision: state.revision } : {}),
    });
    return true;
  }

  private async reloadState(state: TimeChamberState): Promise<void> {
    if (!this.pool) return;
    const result = await this.pool.query(
      `SELECT * FROM ${TIME_CHAMBER_TABLE}
        WHERE source_instance_id = $1 AND building_id = $2 LIMIT 1`,
      [state.sourceInstanceId, state.buildingId],
    );
    const row = result.rows?.[0];
    if (row) {
      state.capacity = Math.max(
        1,
        Math.min(resolveTimeChamberCapacityLimit(state.sizeTier), normalizeSafeInteger(row.capacity)),
      );
      state.configuredSpeed = Math.max(BASE_SPEED, Math.min(state.maxSpeed, normalizeSafeInteger(row.configured_speed)));
      state.displayName = normalizeName(row.display_name) || state.displayName;
      state.activeStartedAt = normalizeNullablePositiveInteger(row.active_started_at_ms);
      state.activeExpiresAt = normalizeNullablePositiveInteger(row.active_expires_at_ms);
      state.activationPlayerId = normalizeString(row.activation_player_id) || null;
      state.activationSpiritStones = normalizeSafeInteger(row.activation_spirit_stones);
      state.accessPasswordHash = normalizeString(row.access_password_hash) || null;
      state.revision = Math.max(1, normalizeSafeInteger(row.revision));
    }
  }

  private scheduleNextActivationExpiry(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    const runtime = this.worldRuntime;
    if (!runtime) return;
    const now = Date.now();
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const state of this.stateByChamberInstanceId.values()) {
      if (state.activeExpiresAt === null || !this.canProcessActivationExpiry(state, runtime)) continue;
      nextExpiry = Math.min(nextExpiry, state.activeExpiresAt);
    }
    if (!Number.isFinite(nextExpiry)) return;
    const delay = nextExpiry <= now
      ? EXPIRY_RETRY_DELAY_MS
      : Math.max(1, Math.min(EXPIRY_TIMER_MAX_DELAY_MS, nextExpiry - now));
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      void this.expireActivations().catch((error) => {
        this.logger.warn(`密室开启时段到期处理失败：${error instanceof Error ? error.message : String(error)}`);
        this.scheduleActivationExpiryRetry();
      });
    }, delay);
  }

  private scheduleActivationExpiryRetry(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      void this.expireActivations().catch((error) => {
        this.logger.warn(`密室开启时段到期重试失败：${error instanceof Error ? error.message : String(error)}`);
        this.scheduleActivationExpiryRetry();
      });
    }, EXPIRY_RETRY_DELAY_MS);
  }

  private async expireActivations(): Promise<void> {
    const runtime = this.worldRuntime;
    if (!runtime) return;
    const now = Date.now();
    for (const state of this.stateByChamberInstanceId.values()) {
      if (state.activeExpiresAt === null || state.activeExpiresAt > now || !this.canProcessActivationExpiry(state, runtime)) continue;
      await this.runBuildingOperation(state, async () => {
        await this.reloadState(state);
        if (state.activeExpiresAt === null || state.activeExpiresAt > Date.now()) return;
        await this.expirePersistedActivationForState(state, runtime);
      });
    }
    this.scheduleNextActivationExpiry();
  }

  private async relocateExpiredPersistedPlayers(runtime: any): Promise<void> {
    const now = Date.now();
    for (const state of this.stateByChamberInstanceId.values()) {
      if (state.activeExpiresAt === null || state.activeExpiresAt > now || !this.canProcessActivationExpiry(state, runtime)) continue;
      await this.expirePersistedActivationForState(state, runtime);
    }
  }

  private canProcessActivationExpiry(state: TimeChamberState, runtime: any): boolean {
    const sourceInstance = runtime?.getInstanceRuntime?.(state.sourceInstanceId);
    const chamberInstance = runtime?.getInstanceRuntime?.(state.chamberInstanceId);
    return Boolean(
      sourceInstance
      && chamberInstance
      && isRuntimeInstanceWritable(runtime, sourceInstance)
      && isRuntimeInstanceWritable(runtime, chamberInstance)
    );
  }

  private async expirePersistedActivationForState(state: TimeChamberState, runtime: any): Promise<boolean> {
    if (!this.pool) return false;
    const result = await this.pool.query(
      `SELECT player_id, facing AS checkpoint_facing
         FROM player_position_checkpoint
        WHERE instance_id = $1`,
      [state.chamberInstanceId],
    );
    const sourceInstance = runtime.getInstanceRuntime?.(state.sourceInstanceId);
    const building = sourceInstance?.buildingById?.get?.(state.buildingId) ?? null;
    if (!sourceInstance || !building) return true;
    const persistence = this.playerRuntimeService.playerDomainPersistenceService;
    if (!isPlayerDomainPersistenceEnabled(persistence)) return true;
    const checkpointFacingByPlayerId = new Map<string, number>();
    for (const row of result.rows ?? []) {
      const playerId = normalizeString(row?.player_id);
      if (playerId) checkpointFacingByPlayerId.set(playerId, Math.trunc(Number(row?.checkpoint_facing) || 2));
    }
    const chamberInstance = runtime.getInstanceRuntime?.(state.chamberInstanceId);
    const playerIds = new Set<string>([
      ...checkpointFacingByPlayerId.keys(),
      ...(chamberInstance?.listPlayerIds?.() ?? []),
    ]);
    let remainingPlayers = false;
    for (const playerId of playerIds) {
      if (!playerId) continue;
      const runtimeLocation = runtime.getPlayerLocation?.(playerId);
      if (normalizeString(runtimeLocation?.instanceId) === state.chamberInstanceId) {
        this.applyVerifiedTransfer(playerId, state.sourceInstanceId, {
          playerId,
          sessionId: runtimeLocation.sessionId,
          fromInstanceId: state.chamberInstanceId,
          targetMapId: sourceInstance.template.id,
          targetInstanceId: state.sourceInstanceId,
          targetX: building.x,
          targetY: building.y,
          reason: 'time_chamber_activation_expired',
        }, runtime);
      }
      const currentLocationInChamber = normalizeString(runtime.getPlayerLocation?.(playerId)?.instanceId) === state.chamberInstanceId;
      if (currentLocationInChamber) {
        remainingPlayers = true;
        continue;
      }
      if (checkpointFacingByPlayerId.has(playerId)) {
        await persistence.savePlayerPositionCheckpoint(playerId, {
          instanceId: state.sourceInstanceId,
          x: Math.trunc(Number(building.x) || 0),
          y: Math.trunc(Number(building.y) || 0),
          facing: checkpointFacingByPlayerId.get(playerId) ?? 2,
          checkpointKind: 'time_chamber_activation_expired',
        });
      }
    }
    if (remainingPlayers || (await persistence.hasRetainedPlayersInInstance?.(state.chamberInstanceId)) === true) {
      return true;
    }
    const expiredAt = state.activeExpiresAt;
    if (expiredAt === null) return false;
    const cleared = await this.pool.query(
      `UPDATE ${TIME_CHAMBER_TABLE}
          SET active_started_at_ms = NULL,
              active_expires_at_ms = NULL,
              activation_player_id = NULL,
              activation_spirit_stones = 0,
              revision = revision + 1,
              updated_at = now()
        WHERE source_instance_id = $1
          AND building_id = $2
          AND active_expires_at_ms = $3
          AND active_expires_at_ms <= floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint`,
      [state.sourceInstanceId, state.buildingId, expiredAt],
    );
    await this.reloadState(state);
    const instance = runtime.getInstanceRuntime?.(state.chamberInstanceId);
    if (instance) this.applyEffectiveSpeed(state, instance, runtime);
    return (cleared.rowCount ?? 0) !== 1 && state.activeExpiresAt !== null;
  }

  private async updateConfigRow(
    state: TimeChamberState,
    patch: {
      configuredSpeed?: number;
      displayName?: string;
      sizeTier?: TimeChamberSizeTier;
      capacity?: number;
      accessPasswordHash?: string | null;
    },
  ): Promise<void> {
    if (!this.pool) {
      throw new Error('time_chamber_persistence_disabled');
    }
    const result = await this.pool.query(
      `UPDATE ${TIME_CHAMBER_TABLE}
          SET configured_speed = COALESCE($3, configured_speed),
              display_name = COALESCE($4, display_name),
              size_tier = COALESCE($5, size_tier),
              capacity = COALESCE($6, capacity),
              access_password_hash = CASE WHEN $7::boolean THEN $8::text ELSE access_password_hash END,
              revision = revision + 1,
              updated_at = now()
        WHERE source_instance_id = $1 AND building_id = $2 AND revision = $9`,
      [
        state.sourceInstanceId,
        state.buildingId,
        patch.configuredSpeed ?? null,
        patch.displayName ?? null,
        patch.sizeTier ?? null,
        patch.capacity ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'accessPasswordHash'),
        patch.accessPasswordHash ?? null,
        state.revision,
      ],
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
      active_started_at_ms bigint,
      active_expires_at_ms bigint,
      activation_player_id varchar(100),
      activation_spirit_stones bigint NOT NULL DEFAULT 0 CHECK (activation_spirit_stones >= 0),
      access_password_hash text,
      revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_instance_id, building_id)
    )
  `);
  await pool.query(`ALTER TABLE ${TIME_CHAMBER_TABLE} ADD COLUMN IF NOT EXISTS active_started_at_ms bigint`);
  await pool.query(`ALTER TABLE ${TIME_CHAMBER_TABLE} ADD COLUMN IF NOT EXISTS active_expires_at_ms bigint`);
  await pool.query(`ALTER TABLE ${TIME_CHAMBER_TABLE} ADD COLUMN IF NOT EXISTS activation_player_id varchar(100)`);
  await pool.query(`ALTER TABLE ${TIME_CHAMBER_TABLE} ADD COLUMN IF NOT EXISTS activation_spirit_stones bigint NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE ${TIME_CHAMBER_TABLE} ADD COLUMN IF NOT EXISTS access_password_hash text`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_time_chamber_owner ON ${TIME_CHAMBER_TABLE}(owner_player_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_time_chamber_activation_expiry ON ${TIME_CHAMBER_TABLE}(active_expires_at_ms) WHERE active_expires_at_ms IS NOT NULL`);
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
    capacity: Math.max(
      1,
      Math.min(
        resolveTimeChamberCapacityLimit(sizeTier),
        Math.trunc(Number(row?.capacity) || config?.capacity || 1),
      ),
    ),
    configuredSpeed: Math.max(BASE_SPEED, Math.min(TIME_CHAMBER_MAX_SPEED, Math.trunc(Number(row?.configured_speed) || BASE_SPEED))),
    activeStartedAt: normalizeNullablePositiveInteger(row?.active_started_at_ms),
    activeExpiresAt: normalizeNullablePositiveInteger(row?.active_expires_at_ms),
    activationPlayerId: normalizeString(row?.activation_player_id) || null,
    activationSpiritStones: normalizeSafeInteger(row?.activation_spirit_stones),
    accessPasswordHash: normalizeString(row?.access_password_hash) || null,
    maxSpeed: config?.maxSpeed ?? MAX_INSTANCE_TICK_SPEED,
    allowedSizeTiers: config?.allowedSizeTiers ?? ['small', 'medium', 'large'],
    revision: Math.max(1, normalizeSafeInteger(row?.revision)),
  };
}

function resolveCompiledBuilding(instance: any, building: any): any {
  return resolveCompiledBuildingDefinition(instance?.buildingCatalog, building);
}

function resolveTimeChamberConfig(compiled: any): {
  capacity: number;
  maxSpeed: number;
  allowedSizeTiers: TimeChamberSizeTier[];
} | null {
  if (compiled?.timeChamberEnabled !== true) {
    return null;
  }
  const capacity = Math.max(
    0,
    Math.min(
      resolveTimeChamberCapacityLimit('small'),
      Math.trunc(Number(compiled?.timeChamberDefaultCapacity) || 0),
    ),
  );
  if (capacity <= 0) {
    return null;
  }
  const allowed = Array.isArray(compiled?.timeChamberAllowedSizeTiers)
    ? compiled.timeChamberAllowedSizeTiers.filter((entry) => normalizeSizeTier(entry) !== null)
    : [];
  return {
    capacity,
    maxSpeed: Math.max(BASE_SPEED, Math.min(TIME_CHAMBER_MAX_SPEED, Math.trunc(Number(compiled?.timeChamberMaxSpeed) || TIME_CHAMBER_MAX_SPEED))),
    allowedSizeTiers: allowed.length > 0 ? allowed : ['small', 'medium', 'large'],
  };
}

function isTimeChamberBuilding(instance: any, building: any): boolean {
  const compiled = resolveCompiledBuilding(instance, building);
  return building?.defId === TIME_CHAMBER_DEF_ID
    || compiled?.id === TIME_CHAMBER_DEF_ID
    || compiled?.timeChamberEnabled === true;
}

function buildTimeChamberMapDocument(state: Pick<TimeChamberState, 'templateId' | 'displayName' | 'sizeTier' | 'chamberInstanceId'>): any {
  const { width, height } = TIME_CHAMBER_SIZE_OPTIONS[state.sizeTier];
  const tiles = Array.from({ length: height }, () => '.'.repeat(width));
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
    safeZones: [],
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

function buildTimeChamberOperationId(
  kind: 'activate',
  playerId: string,
  state: Pick<TimeChamberState, 'sourceInstanceId' | 'buildingId'>,
  requestId: string,
): string {
  const hash = createHash('sha256')
    .update(`${kind}\u0000${playerId}\u0000${state.sourceInstanceId}\u0000${state.buildingId}\u0000${requestId}`)
    .digest('hex')
    .slice(0, 32);
  return `time-chamber-${kind}:${hash}`;
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

function normalizeNullablePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function isTimeChamberActive(state: Pick<TimeChamberState, 'activeExpiresAt'>, now: number): boolean {
  return state.activeExpiresAt !== null && state.activeExpiresAt > now;
}

function chebyshevDistance(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return Math.max(Math.abs(Math.trunc(leftX) - Math.trunc(rightX)), Math.abs(Math.trunc(leftY) - Math.trunc(rightY)));
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
