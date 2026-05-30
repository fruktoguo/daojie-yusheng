/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 实例级 tick 编排服务
 * 按阶段推进每个实例的 tick：资源流动、阵法、建筑、传送、怪物、玩家修炼等
 * Phase 4: 实例级独立子阶段可外移到 InstanceWorkerPool，默认 always-on
 */
import { Injectable, Optional, Inject, Logger } from '@nestjs/common';
import { DEFAULT_AURA_LEVEL_BASE_VALUE, getAuraLevel, getQiResourceDefaultLevel, parseQiResourceKey, projectQiValue, resolveGameTimeState } from '@mud/shared';
import { projectPlayerQiResourceValue, resolvePlayerQiResourceProjection } from './world-runtime-qi-projection.helpers';
import { notifyBuildingConstructionCompletion } from './world-runtime-building.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import { InstanceWorkerPoolService } from '../../concurrency/instance-worker-pool.service';
import type { TickSectionDurations } from './world-runtime-metrics.service';


/** world-runtime instance tick orchestration：承接实例级 tick 编排外壳。 */
@Injectable()
export class WorldRuntimeInstanceTickOrchestrationService {
  private readonly logger = new Logger(WorldRuntimeInstanceTickOrchestrationService.name);
  /** T-17: 增量死亡玩家集合，避免每帧全量扫描。 */
  private readonly defeatedPlayerIds = new Set<string>();

  constructor(
    @Optional() @Inject(InstanceWorkerPoolService)
    private readonly instanceWorkerPool?: InstanceWorkerPoolService,
  ) {}

  /** T-17: 外部标记玩家死亡，加入增量集合。 */
  markPlayerDefeated(playerId: string): void {
    this.defeatedPlayerIds.add(playerId);
  }

  private recordIsolatedOperationFailure(deps, phase, error, details = {}) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const entry = {
      ok: false,
      reason: 'tick_operation_failed',
      phase,
      message,
      details,
      createdAt: new Date().toISOString(),
    };
    if (typeof deps?.recordCombatDiagnostic === 'function') {
      deps.recordCombatDiagnostic(entry);
    } else if (Array.isArray(deps?.combatDiagnostics)) {
      deps.combatDiagnostics.push(entry);
    }
    const context = Object.entries(details ?? {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    const line = `tick 操作隔离失败 phase=${phase}${context ? ` ${context}` : ''}：${message}`;
    const logger = deps?.logger ?? this.logger;
    if (typeof logger?.warn === 'function') {
      logger.warn(line, stack);
    } else {
      this.logger.warn(line, stack);
    }
  }

  private async runIsolatedOperation(deps, phase, details: Record<string, unknown> | (() => Record<string, unknown>), operation): Promise<boolean> {
    try {
      await operation();
      return true;
    } catch (error) {
      const resolvedDetails = typeof details === 'function' ? details() : details;
      this.recordIsolatedOperationFailure(deps, phase, error, resolvedDetails);
      return false;
    }
  }

  private runIsolatedSyncOperation(deps, phase, details: Record<string, unknown> | (() => Record<string, unknown>), operation): boolean {
    try {
      operation();
      return true;
    } catch (error) {
      const resolvedDetails = typeof details === 'function' ? details() : details;
      this.recordIsolatedOperationFailure(deps, phase, error, resolvedDetails);
      return false;
    }
  }

  /**
   * 开始实例 tick 前收敛已死亡但仍停留在实例位置表中的玩家。
   * 这类状态常见于重启恢复或死亡结算中断；如果不先清理，妖兽 AI 只看位置会反复锁定尸体目标。
   */
  private reconcileDefeatedPlayersBeforeTick(deps): void {
    // T-17: 优先处理增量 Set 中的已知死亡玩家
    if (this.defeatedPlayerIds.size > 0) {
      const playerRuntimeService = deps?.playerRuntimeService;
      if (typeof playerRuntimeService?.getPlayer === 'function') {
        for (const playerId of this.defeatedPlayerIds) {
          const player = playerRuntimeService.getPlayer(playerId);
          if (!player || player.hp > 0) {
            this.defeatedPlayerIds.delete(playerId);
            continue;
          }
          const instanceId = player.instanceId;
          const instance = instanceId ? deps.getInstanceRuntime?.(instanceId) : null;
          if (instance) {
            if (typeof instance.clearMonsterAggroForPlayer === 'function') {
              instance.clearMonsterAggroForPlayer(playerId);
            }
            if (typeof instance.cancelPendingCommand === 'function') {
              instance.cancelPendingCommand(playerId);
            }
          }
          deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
          deps.clearPendingCommand?.(playerId);
          if (!deps.worldRuntimeGmQueueService?.hasPendingRespawn?.(playerId)) {
            deps.worldRuntimeGmQueueService?.markPendingRespawn?.(playerId);
          }
          this.defeatedPlayerIds.delete(playerId);
        }
      }
      return;
    }
    // 安全网：增量 Set 为空时仍执行全量扫描（处理重启恢复等边缘情况）
    const playerRuntimeService = deps?.playerRuntimeService;
    if (typeof playerRuntimeService?.getPlayer !== 'function') {
      return;
    }
    for (const instance of deps.listInstanceRuntimes?.() ?? []) {
      if (typeof instance?.listPlayerIds !== 'function') {
        continue;
      }
      for (const playerId of instance.listPlayerIds()) {
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp > 0) {
          continue;
        }
        if (typeof instance.clearMonsterAggroForPlayer === 'function') {
          instance.clearMonsterAggroForPlayer(playerId);
        }
        if (typeof instance.cancelPendingCommand === 'function') {
          instance.cancelPendingCommand(playerId);
        }
        deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
        deps.clearPendingCommand?.(playerId);
        if (!deps.worldRuntimeGmQueueService?.hasPendingRespawn?.(playerId)) {
          deps.worldRuntimeGmQueueService?.markPendingRespawn?.(playerId);
        }
      }
    }
  }


  /**
   * Phase 4：把 POJO 镜像快照送入 worker 做确定性预计算，收集 monster intent proposals。
   * 返回 Map<instanceId, MonsterIntentProposal[]>，主线程在 advanceMonsters 中作为 target hints 使用。
   */
  private async precomputeInstanceWorkerIntents(instanceStepPlans, worldTick, deps = null): Promise<Map<string, Array<{ monsterId: string; action: string; targetId?: string }>>> {
    const proposals = new Map<string, Array<{ monsterId: string; action: string; targetId?: string }>>();
    if (!this.instanceWorkerPool) return proposals;
    const activeAiPlans = instanceStepPlans.filter(({ sleepMonsterAi }) => sleepMonsterAi !== true);
    if (activeAiPlans.length <= 0) {
      return proposals;
    }
    const results = await Promise.all(activeAiPlans.map(async ({ instance }) => {
      try {
        const mirror = this.buildInstanceWorkerMirror(instance, worldTick);
        if (!Array.isArray(mirror.monsters) || mirror.monsters.length <= 0) {
          return null;
        }
        return await this.instanceWorkerPool.submit(
          'instance-advance',
          {
            instanceId: instance.meta.instanceId,
            tick: worldTick,
            mirror,
          },
          (payload) => computeFallbackInstanceIntentProposal(payload),
          800,
        );
      } catch (error) {
        this.recordIsolatedOperationFailure(deps, 'instance_worker_precompute', error, {
          instanceId: instance.meta?.instanceId,
          worldTick,
        });
        return null;
      }
    }));
    for (const result of results) {
      if (result?.ok && result.result) {
        const output = result.result as { instanceId: string; monsterIntents: Array<{ monsterId: string; action: string; targetId?: string }> };
        if (output.instanceId && Array.isArray(output.monsterIntents)) {
          proposals.set(output.instanceId, output.monsterIntents);
        }
      }
    }
    return proposals;
  }

  /** 构造 worker 可结构化克隆的只读镜像，禁止传 MapInstanceRuntime class 实例。 */
  private buildInstanceWorkerMirror(instance, worldTick) {
    const monsters = typeof instance.listMonsterAiWorkerMirrors === 'function'
      ? instance.listMonsterAiWorkerMirrors()
      : (typeof instance.listMonsters === 'function' ? instance.listMonsters() : []).map((monster) => ({
        monsterId: String(monster.runtimeId ?? monster.monsterId ?? ''),
        x: Math.trunc(Number(monster.x) || 0),
        y: Math.trunc(Number(monster.y) || 0),
        hp: Math.trunc(Number(monster.hp) || 0),
        maxHp: Math.trunc(Number(monster.maxHp) || 0),
        alive: monster.alive !== false,
        aggroTargetId: typeof monster.aggroTargetPlayerId === 'string' ? monster.aggroTargetPlayerId : null,
        aggroRange: Math.max(0, Math.trunc(Number(monster.aggroRange) || 0)),
        leashRange: Math.max(0, Math.trunc(Number(monster.leashRange) || 0)),
        spawnX: Math.trunc(Number(monster.spawnX) || 0),
        spawnY: Math.trunc(Number(monster.spawnY) || 0),
      }));
    const players = typeof instance.listPlayerPositionWorkerMirrors === 'function'
      ? instance.listPlayerPositionWorkerMirrors()
      : (typeof instance.listPlayerIds === 'function'
        ? instance.listPlayerIds().map((playerId) => {
            const position = typeof instance.getPlayerPosition === 'function' ? instance.getPlayerPosition(playerId) : null;
            return position ? {
              playerId,
              x: Math.trunc(Number(position.x) || 0),
              y: Math.trunc(Number(position.y) || 0),
            } : null;
          }).filter(Boolean)
        : []);
    return {
      instanceId: instance.meta.instanceId,
      tick: worldTick,
      monsters,
      players,
      resourceState: null,
      buildings: [],
    };
  }
/**
 * advanceFrame：执行advance帧相关逻辑。
 * @param deps 运行时依赖。
 * @param frameDurationMs 参数说明。
 * @param getInstanceTickSpeed 参数说明。
 * @returns 无返回值，直接更新advance帧相关状态。
 */

    async advanceFrame(deps, frameDurationMs = 1000, getInstanceTickSpeed = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const startedAt = performance.now();
        const sectionDurations = createTickSectionDurations();
        const resetFrameEffectsStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'reset_frame_effects', { worldTick: deps.tick }, () => deps.worldRuntimeCombatEffectsService.resetFrameEffects());
        const resetFrameEffectsMs = performance.now() - resetFrameEffectsStartedAt;
        addTickSectionDuration(sectionDurations, 'tick.resetFrameEffectsMs', resetFrameEffectsMs);
        const reconcileStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'reconcile_defeated_players_before_tick', { worldTick: deps.tick }, () => this.reconcileDefeatedPlayersBeforeTick(deps));
        addMeasuredTickSection(sectionDurations, 'tick.reconcileDefeatedPlayersMs', reconcileStartedAt);
        const planInstanceStepsStartedAt = performance.now();
        const instanceStepPlans = [];
        let plannedLogicalTicks = 0;
        for (const instance of deps.listInstanceRuntimes()) {
            if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                if (typeof deps.fenceInstanceRuntime === 'function') {
                    deps.fenceInstanceRuntime(instance.meta.instanceId, 'advance_frame_lease_check_failed');
                }
                continue;
            }
            // 优先从实例自身读取 tickSpeed；paused 时 speed=0
            let speed;
            if (instance.paused === true) {
                speed = 0;
            } else if (Number.isFinite(instance.tickSpeed) && instance.tickSpeed >= 0) {
                speed = instance.tickSpeed;
            } else if (getInstanceTickSpeed) {
                speed = Math.max(0, Number(getInstanceTickSpeed(instance.template.id) ?? 1));
            } else {
                speed = 1;
            }
            const playerCount = resolveInstancePlayerCount(instance);
            const sleepMonsterAi = playerCount <= 0;
            if (instance._throttledSinceMs != null) {
                instance._throttledSinceMs = null;
            }
            if (!Number.isFinite(speed) || speed <= 0) {
                continue;
            }
            let previousProgress = 0;
            const progressReadable = this.runIsolatedSyncOperation(deps, 'instance_tick_progress_read', {
                instanceId: instance.meta.instanceId,
                worldTick: deps.tick,
            }, () => {
                previousProgress = deps.worldRuntimeTickProgressService.getProgress(instance.meta.instanceId);
            });
            if (!progressReadable) {
                continue;
            }
            const accumulated = previousProgress + speed * (Math.max(0, frameDurationMs) / 1000);
            const steps = Math.floor(accumulated);
            const progressWritable = this.runIsolatedSyncOperation(deps, 'instance_tick_progress_write', {
                instanceId: instance.meta.instanceId,
                worldTick: deps.tick,
            }, () => deps.worldRuntimeTickProgressService.setProgress(instance.meta.instanceId, accumulated - steps));
            if (!progressWritable) {
                continue;
            }
            if (steps <= 0) {
                continue;
            }
            instanceStepPlans.push({ instance, steps, speed, sleepMonsterAi });
            plannedLogicalTicks += steps;
        }
        const planInstanceStepsMs = performance.now() - planInstanceStepsStartedAt;
        if (plannedLogicalTicks <= 0) {
            this.runIsolatedSyncOperation(deps, 'record_idle_frame', {
                worldTick: deps.tick,
            }, () => deps.worldRuntimeMetricsService.recordIdleFrame(startedAt));
            return 0;
        }
        const preTickMaterializationStartedAt = performance.now();
        const respawnsStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'process_pending_respawns', { worldTick: deps.tick }, () => deps.processPendingRespawns());
        addMeasuredTickSection(sectionDurations, 'tick.processPendingRespawnsMs', respawnsStartedAt);
        const navigationMaterializeStartedAt = performance.now();
        await this.runIsolatedOperation(deps, 'materialize_navigation_commands', { worldTick: deps.tick }, () => deps.materializeNavigationCommands());
        addMeasuredTickSection(sectionDurations, 'tick.materializeNavigationCommandsMs', navigationMaterializeStartedAt);
        if (typeof deps.materializeAutoUsePills === 'function') {
            const autoUsePillsStartedAt = performance.now();
            this.runIsolatedSyncOperation(deps, 'materialize_auto_use_pills', { worldTick: deps.tick }, () => deps.materializeAutoUsePills());
            addMeasuredTickSection(sectionDurations, 'tick.materializeAutoUsePillsMs', autoUsePillsStartedAt);
        }
        const autoCombatStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'materialize_auto_combat_commands', { worldTick: deps.tick }, () => {
            const previousAutoCombatRecorder = deps.recordAutoCombatSectionDuration;
            deps.recordAutoCombatSectionDuration = (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count);
            try {
                if (typeof deps.worldRuntimeAutoCombatService?.materializeAutoCombatCommands === 'function') {
                    deps.worldRuntimeAutoCombatService.materializeAutoCombatCommands(deps);
                    return;
                }
                deps.materializeAutoCombatCommands?.();
            }
            finally {
                if (previousAutoCombatRecorder) {
                    deps.recordAutoCombatSectionDuration = previousAutoCombatRecorder;
                }
                else {
                    delete deps.recordAutoCombatSectionDuration;
                }
            }
        });
        addMeasuredTickSection(sectionDurations, 'tick.materializeAutoCombatCommandsMs', autoCombatStartedAt);
        const preTickMaterializationMs = performance.now() - preTickMaterializationStartedAt;
        const pendingCommandsStartedAt = performance.now();
        await this.runIsolatedOperation(deps, 'dispatch_pending_commands', { worldTick: deps.tick }, () => deps.dispatchPendingCommands(
            (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count),
        ));
        const pendingCommandsMs = performance.now() - pendingCommandsStartedAt;
        const systemCommandsStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'dispatch_pending_system_commands', { worldTick: deps.tick }, () => deps.dispatchPendingSystemCommands());
        const systemCommandsMs = performance.now() - systemCommandsStartedAt;
        const workerPrecomputeStartedAt = performance.now();
        const workerProposals = await this.precomputeInstanceWorkerIntents(instanceStepPlans, deps.tick, deps);
        const workerPrecomputeMs = performance.now() - workerPrecomputeStartedAt;
        addTickSectionDuration(sectionDurations, 'worker.instancePrecomputeMs', workerPrecomputeMs, instanceStepPlans.length);
        const steppedPlayerIds = new Set();
        let totalLogicalTicks = 0;
        // T-19: 预分配 tickOnce 返回值容器，循环内复用
        const reusableTickResult = { completedBuildings: [] as any[], transfers: [] as any[], monsterActions: [] as any[] };
        const instanceTicksStartedAt = performance.now();
        for (const { instance, steps, speed, sleepMonsterAi } of instanceStepPlans) {
            for (let index = 0; index < steps; index += 1) {
                // 加速 tick 补偿：对于后续逻辑 tick，为当前实例的玩家重新物化命令
                if (index > 0) {
                    const instanceStepMaterializationStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'materialize_navigation_commands_for_instance', {
                        instanceId: instance.meta.instanceId,
                        worldTick: deps.tick,
                    }, () => deps.worldRuntimeNavigationService.materializeNavigationCommandsForInstance(instance.meta.instanceId, deps));
                    this.runIsolatedSyncOperation(deps, 'materialize_auto_use_pills_for_instance', {
                        instanceId: instance.meta.instanceId,
                        worldTick: deps.tick,
                    }, () => deps.worldRuntimeAutoCombatService?.materializeAutoUsePillsForInstance?.(instance.meta.instanceId, deps));
                    this.runIsolatedSyncOperation(deps, 'materialize_auto_combat_commands_for_instance', {
                        instanceId: instance.meta.instanceId,
                        worldTick: deps.tick,
                    }, () => deps.worldRuntimeAutoCombatService?.materializeAutoCombatCommandsForInstance?.(instance.meta.instanceId, deps));
                    await this.runIsolatedOperation(deps, 'dispatch_pending_commands_for_instance_step', {
                        instanceId: instance.meta.instanceId,
                        worldTick: deps.tick,
                    }, () => deps.dispatchPendingCommands(
                        (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count),
                    ));
                    addMeasuredTickSection(sectionDurations, 'instance.stepCommandMaterializationMs', instanceStepMaterializationStartedAt);
                }
                let blockedPlayerIds = new Set();
                const blockedPlayerLookupStartedAt = performance.now();
                this.runIsolatedSyncOperation(deps, 'get_blocked_player_ids', { worldTick: deps.tick }, () => {
                    blockedPlayerIds = deps.worldRuntimeNavigationService.getBlockedPlayerIds();
                });
                addMeasuredTickSection(sectionDurations, 'instance.blockedPlayerLookupMs', blockedPlayerLookupStartedAt);
                deps.tick += 1;
                totalLogicalTicks += 1;
                if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                    if (typeof deps.fenceInstanceRuntime === 'function') {
                        deps.fenceInstanceRuntime(instance.meta.instanceId, 'instance_tick_lease_check_failed');
                    }
                    break;
                }
                let isFormationTerrainStabilized = null;
                if (typeof deps.worldRuntimeFormationService?.createTerrainStabilizationChecker === 'function') {
                    const terrainStabilizationStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'create_terrain_stabilization_checker', {
                        instanceId: instance.meta.instanceId,
                        worldTick: deps.tick,
                    }, () => {
                        isFormationTerrainStabilized = deps.worldRuntimeFormationService.createTerrainStabilizationChecker(instance.meta.instanceId);
                    });
                    addMeasuredTickSection(sectionDurations, 'instance.terrainStabilizationCheckerMs', terrainStabilizationStartedAt);
                }
                const terrainStabilizationChecker = typeof isFormationTerrainStabilized === 'function'
                    ? isFormationTerrainStabilized
                    : ((x, y) => deps.worldRuntimeFormationService?.isTerrainStabilized?.(instance.meta.instanceId, x, y) === true);
                const isTerrainStabilized = (x, y) => (
                    terrainStabilizationChecker(x, y) === true
                    || deps.worldRuntimeSectService?.isSectInnateStabilized?.(instance.meta.instanceId, x, y) === true
                );
                const instanceIntents = sleepMonsterAi === true ? null : (workerProposals.get(instance.meta.instanceId) ?? null);
                // T-19: 复用预分配容器
                reusableTickResult.completedBuildings.length = 0;
                reusableTickResult.transfers.length = 0;
                reusableTickResult.monsterActions.length = 0;
                let result = reusableTickResult;
                const coreTickStartedAt = performance.now();
                this.runIsolatedSyncOperation(deps, 'instance_tick_once', {
                    instanceId: instance.meta.instanceId,
                    instanceTick: instance.tick,
                    worldTick: deps.tick,
                }, () => {
                    result = instance.tickOnce(instanceIntents, { sleepMonsterAi: sleepMonsterAi === true }) ?? result;
                });
                addMeasuredTickSection(sectionDurations, 'instance.coreTickMs', coreTickStartedAt);
                if (typeof instance.advanceTileResourceFlow === 'function') {
                    const tileResourceFlowStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'instance_tile_resource_flow', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => instance.advanceTileResourceFlow());
                    addMeasuredTickSection(sectionDurations, 'instance.tileResourceFlowMs', tileResourceFlowStartedAt);
                }
                if (typeof deps.worldRuntimeFormationService?.advanceInstanceFormations === 'function') {
                    const formationAdvanceStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'instance_formations', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => deps.worldRuntimeFormationService.advanceInstanceFormations(instance, deps.tick, deps));
                    addMeasuredTickSection(sectionDurations, 'instance.formationAdvanceMs', formationAdvanceStartedAt);
                }
                if (typeof instance.advanceTemporaryTiles === 'function') {
                    const temporaryTilesStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'instance_temporary_tiles', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => instance.advanceTemporaryTiles(instance.tick, isTerrainStabilized));
                    addMeasuredTickSection(sectionDurations, 'instance.temporaryTileAdvanceMs', temporaryTilesStartedAt);
                }
                if (typeof instance.advanceTileRecovery === 'function') {
                    const tileRecoveryStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'instance_tile_recovery', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => {
                        const tileRecoveryProvider = resolveTileRecoveryProvider(instance);
                        instance.advanceTileRecovery(isTerrainStabilized, tileRecoveryProvider);
                    });
                    addMeasuredTickSection(sectionDurations, 'instance.tileRecoveryMs', tileRecoveryStartedAt);
                }
                if (Array.isArray(result.completedBuildings) && result.completedBuildings.length > 0) {
                    const buildingCompletionStartedAt = performance.now();
                    for (const building of result.completedBuildings) {
                        this.runIsolatedSyncOperation(deps, 'building_completion_notice', {
                            instanceId: instance.meta.instanceId,
                            buildingId: building?.id,
                            playerId: building?.playerId,
                            worldTick: deps.tick,
                        }, () => notifyBuildingConstructionCompletion(deps, building));
                    }
                    addMeasuredTickSection(sectionDurations, 'instance.buildingCompletionMs', buildingCompletionStartedAt, result.completedBuildings.length);
                }
                const transferApplyStartedAt = performance.now();
                for (const transfer of result.transfers) {
                    this.runIsolatedSyncOperation(deps, 'transfer_apply', {
                        instanceId: instance.meta.instanceId,
                        playerId: transfer?.playerId,
                        targetInstanceId: transfer?.targetInstanceId,
                        worldTick: deps.tick,
                    }, () => deps.applyTransfer(transfer));
                }
                addMeasuredTickSection(sectionDurations, 'instance.applyTransfersMs', transferApplyStartedAt, result.transfers.length);
                const monsterActionApplyStartedAt = performance.now();
                const previousMonsterActionSectionDuration = deps.recordMonsterActionSectionDuration;
                deps.recordMonsterActionSectionDuration = (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count);
                try {
                    for (const action of result.monsterActions) {
                        this.runIsolatedSyncOperation(deps, 'monster_action_apply', {
                            instanceId: action?.instanceId ?? instance.meta.instanceId,
                            monsterId: action?.runtimeId ?? action?.monsterId,
                            actionKind: action?.kind,
                            targetPlayerId: action?.targetPlayerId,
                            worldTick: deps.tick,
                        }, () => deps.applyMonsterAction(action));
                    }
                }
                finally {
                    if (previousMonsterActionSectionDuration === undefined) {
                        delete deps.recordMonsterActionSectionDuration;
                    }
                    else {
                        deps.recordMonsterActionSectionDuration = previousMonsterActionSectionDuration;
                    }
                }
                addMeasuredTickSection(sectionDurations, 'instance.applyMonsterActionsMs', monsterActionApplyStartedAt, result.monsterActions.length);
                let currentPlayerIds = [];
                const listPlayerIdsStartedAt = performance.now();
                this.runIsolatedSyncOperation(deps, 'instance_list_player_ids', {
                    instanceId: instance.meta.instanceId,
                    instanceTick: instance.tick,
                    worldTick: deps.tick,
                }, () => {
                    currentPlayerIds = instance.listPlayerIds();
                });
                addMeasuredTickSection(sectionDurations, 'instance.listPlayerIdsMs', listPlayerIdsStartedAt);
                if (currentPlayerIds.length > 0) {
                    // T-16: 合并为批量调用，减少逐玩家隔离开销
                    const worldTimeVisionStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'player_world_time_vision_batch', () => ({
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                        playerCount: currentPlayerIds.length,
                    }), () => syncWorldTimeVisionForPlayers(instance, currentPlayerIds, deps.playerRuntimeService, speed));
                    addMeasuredTickSection(sectionDurations, 'instance.playerWorldTimeVisionMs', worldTimeVisionStartedAt, currentPlayerIds.length);
                    const cultivationAuraMultiplierByPlayerId = new Map();
                    const cultivationAuraProjectionStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'player_cultivation_aura_projection_batch', () => ({
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                        playerCount: currentPlayerIds.length,
                    }), () => {
                        const entry = buildCultivationAuraMultiplierByPlayerId(instance, currentPlayerIds, deps.playerRuntimeService);
                        for (const [id, value] of entry) {
                            cultivationAuraMultiplierByPlayerId.set(id, value);
                        }
                    });
                    addMeasuredTickSection(sectionDurations, 'instance.cultivationAuraProjectionMs', cultivationAuraProjectionStartedAt, currentPlayerIds.length);
                    const terrainTickEffectsStartedAt = performance.now();
                    for (const playerId of currentPlayerIds) {
                        this.runIsolatedSyncOperation(deps, 'player_tile_terrain_effects', {
                            instanceId: instance.meta.instanceId,
                            playerId,
                            instanceTick: instance.tick,
                            worldTick: deps.tick,
                        }, () => applyTerrainTickEffectsForPlayers(instance, [playerId], deps));
                    }
                    addMeasuredTickSection(sectionDurations, 'instance.terrainTickEffectsMs', terrainTickEffectsStartedAt, currentPlayerIds.length);
                    const playerTickAdvanceStartedAt = performance.now();
                    for (const playerId of currentPlayerIds) {
                        this.runIsolatedSyncOperation(deps, 'player_tick_advance', {
                            instanceId: instance.meta.instanceId,
                            playerId,
                            instanceTick: instance.tick,
                            worldTick: deps.tick,
                        }, () => deps.playerRuntimeService.advanceTickForPlayerIds([playerId], instance.tick, {
                            idleCultivationBlockedPlayerIds: blockedPlayerIds,
                            cultivationAuraMultiplierByPlayerId,
                            markPlayerDefeated: (defeatedPlayerId) => this.markPlayerDefeated(defeatedPlayerId),
                            recordTickSectionDuration: (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count),
                        }));
                    }
                    addMeasuredTickSection(sectionDurations, 'instance.playerTickAdvanceMs', playerTickAdvanceStartedAt, currentPlayerIds.length);
                    const tileQiDrainStartedAt = performance.now();
                    for (const playerId of currentPlayerIds) {
                        this.runIsolatedSyncOperation(deps, 'player_tile_qi_drain', {
                            instanceId: instance.meta.instanceId,
                            playerId,
                            instanceTick: instance.tick,
                            worldTick: deps.tick,
                        }, () => applyTileQiDrainForPlayers(instance, [playerId], deps));
                    }
                    addMeasuredTickSection(sectionDurations, 'instance.tileQiDrainMs', tileQiDrainStartedAt, currentPlayerIds.length);
                    if (typeof deps.worldRuntimePlayerSkillDispatchService?.resolvePendingPlayerSkillCast === 'function') {
                        const pendingSkillCastStartedAt = performance.now();
                        for (const playerId of currentPlayerIds) {
                            await this.runIsolatedOperation(deps, 'player_pending_skill_cast', {
                                instanceId: instance.meta.instanceId,
                                playerId,
                                instanceTick: instance.tick,
                                worldTick: deps.tick,
                            }, () => deps.worldRuntimePlayerSkillDispatchService.resolvePendingPlayerSkillCast(playerId, deps));
                        }
                        addMeasuredTickSection(sectionDurations, 'instance.resolvePendingSkillCastMs', pendingSkillCastStartedAt, currentPlayerIds.length);
                    }
                    const craftJobAdvanceStartedAt = performance.now();
                    for (const playerId of currentPlayerIds) {
                        await this.runIsolatedOperation(deps, 'player_craft_jobs', {
                            instanceId: instance.meta.instanceId,
                            playerId,
                            instanceTick: instance.tick,
                            worldTick: deps.tick,
                        }, () => deps.worldRuntimeCraftTickService.advanceCraftJobs([playerId], deps));
                    }
                    addMeasuredTickSection(sectionDurations, 'instance.craftJobAdvanceMs', craftJobAdvanceStartedAt, currentPlayerIds.length);
                    for (const playerId of currentPlayerIds) {
                        steppedPlayerIds.add(playerId);
                    }
                }
                if (typeof deps.worldRuntimeTongtianTowerService?.advanceInstance === 'function') {
                    const tongtianTowerAdvanceStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'tongtian_tower_instance', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => deps.worldRuntimeTongtianTowerService.advanceInstance(instance, deps));
                    addMeasuredTickSection(sectionDurations, 'instance.tongtianTowerAdvanceMs', tongtianTowerAdvanceStartedAt);
                }
            }
        }
        const postTickCleanupStartedAt = performance.now();
        if (typeof deps.worldRuntimeTongtianTowerService?.cleanupIdleInstances === 'function') {
            await this.runIsolatedOperation(deps, 'tongtian_tower_cleanup_idle_instances', {
                worldTick: deps.tick,
            }, () => deps.worldRuntimeTongtianTowerService.cleanupIdleInstances(deps));
        }
        const postTickCleanupMs = performance.now() - postTickCleanupStartedAt;
        const instanceTicksMs = performance.now() - instanceTicksStartedAt;
        const playerAdvanceStartedAt = performance.now();
        const lootContainerSearchStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'loot_container_searches', {
            worldTick: deps.tick,
        }, () => deps.worldRuntimeLootContainerService.advanceContainerSearches({
            getInstanceRuntime: (instanceId) => deps.getInstanceRuntime(instanceId),
        }, {
            listConnectedPlayerIds: () => deps.listConnectedPlayerIds(),
            getPlayerLocation: (playerId) => deps.getPlayerLocation(playerId),
        }, deps.tick));
        addMeasuredTickSection(sectionDurations, 'postTick.lootContainerSearchesMs', lootContainerSearchStartedAt);
        const questRefreshStartedAt = performance.now();
        for (const playerId of steppedPlayerIds) {
            this.runIsolatedSyncOperation(deps, 'player_quest_refresh', {
                playerId,
                worldTick: deps.tick,
            }, () => deps.refreshQuestStates(playerId));
        }
        addMeasuredTickSection(sectionDurations, 'postTick.playerQuestRefreshMs', questRefreshStartedAt, steppedPlayerIds.size);
        const playerAdvanceMs = performance.now() - playerAdvanceStartedAt;
        this.runIsolatedSyncOperation(deps, 'record_frame_result', {
            worldTick: deps.tick,
        }, () => deps.worldRuntimeMetricsService.recordFrameResult(startedAt, {
            resetFrameEffectsMs,
            planInstanceStepsMs,
            preTickMaterializationMs,
            pendingCommandsMs,
            systemCommandsMs,
            workerPrecomputeMs,
            instanceTicksMs,
            postTickCleanupMs,
            playerAdvanceMs,
        }, sectionDurations));
        return totalLogicalTicks;
    }
};

function createTickSectionDurations(): TickSectionDurations {
    return Object.create(null) as TickSectionDurations;
}

function addMeasuredTickSection(sections: TickSectionDurations, key: string, startedAt: number, count = 1): void {
    addTickSectionDuration(sections, key, performance.now() - startedAt, count);
}

function addTickSectionDuration(sections: TickSectionDurations, key: string, durationMs: number, count = 1): void {
    const normalizedDuration = Math.max(0, Number(durationMs) || 0);
    const normalizedCount = Math.max(0, Math.trunc(Number(count) || 0));
    if (normalizedDuration <= 0 && normalizedCount <= 0) {
        return;
    }
    const current = sections[key] ?? { totalMs: 0, count: 0 };
    current.totalMs += normalizedDuration;
    current.count += normalizedCount;
    sections[key] = current;
}

function computeFallbackInstanceIntentProposal(payload) {
    const mirror = payload?.mirror ?? {};
    const monsters = Array.isArray(mirror.monsters) ? mirror.monsters : [];
    return {
        instanceId: payload?.instanceId,
        monsterIntents: monsters
            .filter((monster) => monster?.alive !== false)
            .map((monster) => (monster.aggroTargetId
                ? { monsterId: monster.monsterId, action: 'attack', targetId: monster.aggroTargetId }
                : { monsterId: monster.monsterId, action: 'idle' })),
        resourceMutations: [],
        buildingMutations: [],
    };
}

function syncWorldTimeVisionForPlayers(instance, playerIds, playerRuntimeService, tickSpeed = 1) {
    if (!playerRuntimeService || typeof playerRuntimeService.getPlayer !== 'function') {
        return;
    }
    const timeState = resolveGameTimeState(
        instance.tick,
        1,
        instance.template?.source?.time,
        tickSpeed,
    );
    for (const playerId of playerIds) {
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player) {
            continue;
        }
        if (isSameWorldTimeVisionState(player.worldTime, timeState)) {
            continue;
        }
        player.worldTime = timeState;
        if (typeof playerRuntimeService.playerAttributesService?.recalculate === 'function') {
            playerRuntimeService.playerAttributesService.recalculate(player);
        }
    }
}

function isSameWorldTimeVisionState(left, right) {
    return Boolean(left)
        && left.phase === right.phase
        && left.phaseLabel === right.phaseLabel
        && left.darknessStacks === right.darknessStacks
        && left.visionMultiplier === right.visionMultiplier
        && left.lightPercent === right.lightPercent;
}

function resolveInstancePlayerCount(instance) {
    const directCount = Number(instance?.playerCount);
    if (Number.isFinite(directCount) && directCount >= 0) {
        return Math.trunc(directCount);
    }
    const playersById = instance?.playersById;
    if (playersById && Number.isFinite(Number(playersById.size))) {
        return Math.max(0, Math.trunc(Number(playersById.size)));
    }
    if (typeof instance?.listPlayerIds === 'function') {
        const playerIds = instance.listPlayerIds();
        return Array.isArray(playerIds) ? playerIds.length : 0;
    }
    return 0;
}

function buildCultivationAuraMultiplierByPlayerId(instance, playerIds, playerRuntimeService) {
    const multipliers = new Map();
    for (const playerId of playerIds) {
        const player = typeof playerRuntimeService?.getPlayer === 'function'
            ? playerRuntimeService.getPlayer(playerId)
            : null;
        const position = typeof instance.getPlayerPosition === 'function'
            ? instance.getPlayerPosition(playerId)
            : null;
        multipliers.set(playerId, resolveCultivationAuraMultiplier(instance, player, position));
    }
    return multipliers;
}

function resolveCultivationAuraMultiplier(instance, player, position) {
    if (!position) {
        return 1;
    }
    const aura = resolveTileCultivationAura(instance, player, position.x, position.y);
    if (aura.rawLevel <= 0) {
        return 1;
    }
    const efficiencyMultiplier = aura.rawValue > 0
        ? Math.max(0, aura.effectiveValue / aura.rawValue)
        : 1;
    return 1 + Math.max(0, aura.rawLevel) * efficiencyMultiplier;
}

function resolveTileCultivationAura(instance, player, x, y) {
    if (typeof instance.visitTileResources === 'function') {
        let rawQiValue = 0;
        let projectedQiValue = 0;
        let hasQiResource = false;
        const visited = instance.visitTileResources(x, y, (resourceKey, raw) => {
            const value = Math.max(0, Number(raw) || 0);
            const projected = resolveCultivationResourceValue(player, resourceKey, value);
            if (!projected.contributes) {
                return;
            }
            hasQiResource = true;
            rawQiValue += projected.rawValue;
            projectedQiValue += projected.effectiveValue;
        });
        if (visited === true) {
            if (hasQiResource) {
                return {
                    rawValue: rawQiValue,
                    effectiveValue: projectedQiValue,
                    rawLevel: getAuraLevel(rawQiValue, DEFAULT_AURA_LEVEL_BASE_VALUE),
                };
            }
            return {
                rawValue: 0,
                effectiveValue: 0,
                rawLevel: 0,
            };
        }
    }
    const resources = typeof instance.listTileResources === 'function'
        ? instance.listTileResources(x, y)
        : null;
    if (Array.isArray(resources) && resources.length > 0) {
        let rawQiValue = 0;
        let projectedQiValue = 0;
        let hasQiResource = false;
        for (const resource of resources) {
            const value = Math.max(0, Number(resource.value) || 0);
            const projected = resolveCultivationResourceValue(player, resource.resourceKey, value);
            if (!projected.contributes) {
                continue;
            }
            hasQiResource = true;
            rawQiValue += projected.rawValue;
            projectedQiValue += projected.effectiveValue;
        }
        if (hasQiResource) {
            return {
                rawValue: rawQiValue,
                effectiveValue: projectedQiValue,
                rawLevel: getAuraLevel(rawQiValue, DEFAULT_AURA_LEVEL_BASE_VALUE),
            };
        }
    }
    const rawAura = typeof instance.getTileAura === 'function'
        ? instance.getTileAura(x, y)
        : 0;
    const normalizedAura = Math.max(0, Number(rawAura) || 0);
    const effectiveAura = player
        ? projectPlayerQiResourceValue(player, 'aura.refined.neutral', normalizedAura)
        : normalizedAura;
    return {
        rawValue: normalizedAura,
        effectiveValue: effectiveAura,
        rawLevel: getQiResourceDefaultLevel('aura.refined.neutral', normalizedAura, DEFAULT_AURA_LEVEL_BASE_VALUE) ?? 0,
    };
}

function applyTileQiDrainForPlayers(instance, playerIds, deps) {
    const playerRuntimeService = deps?.playerRuntimeService;
    if (!instance || typeof instance.getPlayerPosition !== 'function' || typeof instance.getTileQiDrainPerTick !== 'function' || typeof playerRuntimeService?.getPlayer !== 'function' || typeof playerRuntimeService?.setVitals !== 'function') {
        return;
    }
    for (const playerId of playerIds) {
        const position = instance.getPlayerPosition(playerId);
        if (!position) {
            continue;
        }
        const qiDrain = instance.getTileQiDrainPerTick(position.x, position.y);
        if (!Number.isFinite(qiDrain) || qiDrain <= 0) {
            continue;
        }
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0) {
            continue;
        }
        const currentQi = Math.max(0, Math.round(Number(player.qi) || 0));
        const nextQi = Math.max(0, currentQi - Math.max(0, Math.trunc(qiDrain)));
        if (nextQi !== player.qi) {
            playerRuntimeService.setVitals(playerId, { qi: nextQi });
        }
        if (currentQi > 0 && nextQi <= 0 && typeof instance.relocatePlayer === 'function') {
            const spawnPoint = instance.template?.spawnPoint ?? null;
            const relocated = instance.relocatePlayer(playerId, spawnPoint?.x, spawnPoint?.y);
            if (relocated) {
                instance.cancelPendingCommand?.(playerId);
                deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
                deps.clearPendingCommand?.(playerId);
                const notice = buildStructuredNotice('warn', 'notice.world.tile-qi-drained-relocated', '灵力被地脉道压抽空，你被震回起点。');
                deps.queuePlayerNotice?.(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
            }
        }
    }
}

function applyTerrainTickEffectsForPlayers(instance, playerIds, deps) {
    const contentTemplateRepository = deps?.contentTemplateRepository;
    const playerRuntimeService = deps?.playerRuntimeService;
    if (!instance || typeof instance.getPlayerPosition !== 'function' || typeof instance.getTileLayerState !== 'function' || typeof contentTemplateRepository?.getTerrainTickEffects !== 'function' || typeof playerRuntimeService?.applyConfiguredBuff !== 'function') {
        return;
    }
    for (const playerId of playerIds) {
        const position = instance.getPlayerPosition(playerId);
        if (!position) {
            continue;
        }
        const player = typeof playerRuntimeService.getPlayer === 'function'
            ? playerRuntimeService.getPlayer(playerId)
            : null;
        if (!player || player.hp <= 0) {
            continue;
        }
        const layerState = instance.getTileLayerState(position.x, position.y);
        const terrainType = typeof layerState?.terrain === 'string' ? layerState.terrain.trim() : '';
        if (!terrainType) {
            continue;
        }
        const effects = contentTemplateRepository.getTerrainTickEffects(terrainType);
        for (const effect of effects) {
            if (effect?.trigger !== 'on_tick' || effect?.target !== 'player' || !effect.applyBuff?.buffId) {
                continue;
            }
            playerRuntimeService.applyConfiguredBuff(playerId, effect.applyBuff.buffId, {
                stacks: effect.applyBuff.stacks,
                refreshDuration: effect.applyBuff.refreshDuration !== false,
            });
        }
    }
}

function resolveCultivationResourceValue(player, resourceKey, value) {
    const parsed = parseQiResourceKey(resourceKey);
    if (!parsed || value <= 0) {
        return { contributes: false, rawValue: 0, effectiveValue: 0 };
    }
    if (!player) {
        return { contributes: true, rawValue: value, effectiveValue: value };
    }
    const projection = resolvePlayerQiResourceProjection(player, resourceKey);
    if (projection?.visibility !== 'absorbable') {
        return { contributes: false, rawValue: 0, effectiveValue: 0 };
    }
    return {
        contributes: true,
        rawValue: value,
        effectiveValue: projectQiValue(value, projection.efficiencyBp),
    };
}

/** 秘境（通天塔等）不自动恢复地块的 provider。 */
const DUNGEON_NO_RECOVERY_PROVIDER = {
    getOriginalTileType() { return null; },
    getRecoveryConfig() { return { enabled: false, intervalTicks: 0 }; },
};

/** 根据实例类型选择地块恢复 provider。 */
function resolveTileRecoveryProvider(instance) {
    const kind = instance?.meta?.kind;
    if (kind === 'tower') {
        return DUNGEON_NO_RECOVERY_PROVIDER;
    }
    // 模板地图和宗门使用默认恢复（通过 getBaseTileType fallback）
    return null;
}
