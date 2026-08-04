/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 实例级 tick 编排服务
 * 按阶段推进每个实例的 tick：资源流动、阵法、建筑、传送、怪物、玩家修炼等
 * Phase 4: 实例级怪物 intent 预计算默认进入 InstanceWorkerPool，权威应用仍在主线程完成。
 */
import { Injectable, Optional, Inject, Logger } from '@nestjs/common';
import { DEFAULT_AURA_LEVEL_BASE_VALUE, getAuraLevel, getQiResourceDefaultLevel, parseQiResourceKey, projectQiValue, resolveGameTimeState } from '@mud/shared';
import { projectPlayerQiResourceValue, resolvePlayerQiResourceProjection } from './world-runtime-qi-projection.helpers';
import { notifyBuildingConstructionCompletion } from './world-runtime-building.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import { InstanceWorkerPoolService } from '../../concurrency/instance-worker-pool.service';
import { RuntimeMapConfigService } from '../map/runtime-map-config.service';
import type { TickSectionDurations } from './world-runtime-metrics.service';
import type { InstanceTickSchedulePlan } from './world-runtime-instance-schedule.service';

const DEFERRED_CRAFT_RUNTIME_UPDATE_OPTIONS = Object.freeze({ deferRuntimeUpdates: true });

type InstanceStepAttributionKeys = Readonly<{
  stepDurationKey: string;
  playerStepCountKey: string;
  materializationDurationKey: string | null;
}>;

const TIME_CHAMBER_FIRST_STEP_ATTRIBUTION: InstanceStepAttributionKeys = Object.freeze({
  stepDurationKey: 'attribution.instance.timeChamber.firstStepMs',
  playerStepCountKey: 'attribution.instance.timeChamber.playerSteps',
  materializationDurationKey: null,
});
const TIME_CHAMBER_EXTRA_STEP_ATTRIBUTION: InstanceStepAttributionKeys = Object.freeze({
  stepDurationKey: 'attribution.instance.timeChamber.extraStepMs',
  playerStepCountKey: 'attribution.instance.timeChamber.playerSteps',
  materializationDurationKey: 'attribution.instance.timeChamber.extraStepMaterializationMs',
});
const NON_TIME_CHAMBER_FIRST_STEP_ATTRIBUTION: InstanceStepAttributionKeys = Object.freeze({
  stepDurationKey: 'attribution.instance.nonTimeChamber.firstStepMs',
  playerStepCountKey: 'attribution.instance.nonTimeChamber.playerSteps',
  materializationDurationKey: null,
});
const NON_TIME_CHAMBER_CATCH_UP_STEP_ATTRIBUTION: InstanceStepAttributionKeys = Object.freeze({
  stepDurationKey: 'attribution.instance.nonTimeChamber.catchUpStepMs',
  playerStepCountKey: 'attribution.instance.nonTimeChamber.playerSteps',
  materializationDurationKey: 'attribution.instance.nonTimeChamber.catchUpMaterializationMs',
});

/** world-runtime instance tick orchestration：承接实例级 tick 编排外壳。 */
@Injectable()
export class WorldRuntimeInstanceTickOrchestrationService {
  private readonly logger = new Logger(WorldRuntimeInstanceTickOrchestrationService.name);
  /** T-17: 增量死亡玩家集合，避免每帧全量扫描。 */
  private readonly defeatedPlayerIds = new Set<string>();
  /** 以运行时实例为键保存 1Hz 世界时钟余数，避免状态泄漏到总 facade。 */
  private readonly worldTickElapsedRemainderMsByRuntime = new WeakMap<object, number>();

  constructor(
    @Optional() @Inject(InstanceWorkerPoolService)
    private readonly instanceWorkerPool?: InstanceWorkerPoolService,
    @Optional() @Inject(RuntimeMapConfigService)
    private readonly runtimeMapConfigService?: RuntimeMapConfigService,
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

  private advanceWorldClock(deps: object & { tick: number }, frameDurationMs: number): number {
    const elapsedMs = Math.max(0, Number(frameDurationMs) || 0);
    const previousRemainderMs = this.worldTickElapsedRemainderMsByRuntime.get(deps) ?? 0;
    const accumulatedMs = previousRemainderMs + elapsedMs;
    const elapsedWorldTicks = Math.floor(accumulatedMs / 1000);
    this.worldTickElapsedRemainderMsByRuntime.set(deps, accumulatedMs - elapsedWorldTicks * 1000);
    if (elapsedWorldTicks > 0) {
      deps.tick = Math.max(0, Math.trunc(Number(deps.tick) || 0)) + elapsedWorldTicks;
    }
    return elapsedWorldTicks;
  }

  /**
   * 开始实例 tick 前收敛已死亡但仍停留在实例位置表中的玩家。
   * 这类状态常见于重启恢复或死亡结算中断；如果不先清理，妖兽 AI 只看位置会反复锁定尸体目标。
   */
  private reconcileDefeatedPlayersBeforeTick(deps, allowFullScan = true): void {
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
    // 安全网只允许在 1Hz 世界维护节拍执行，不能被少数加速实例放大为 10Hz 全服扫描。
    if (!allowFullScan) {
      return;
    }
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

    async advanceFrame(
        deps,
        frameDurationMs = 1000,
        getInstanceTickSpeed = null,
        scheduledPlans: InstanceTickSchedulePlan[] | null = null,
    ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const startedAt = performance.now();
        // 世界时钟只由真实经过时间推进，与本帧实例数和实例逻辑 step 数无关。
        // 加速实例会让调度帧频高于 1Hz，因此必须保留毫秒余数，不能简单每帧 +1。
        const elapsedWorldTicks = this.advanceWorldClock(deps, frameDurationMs);
        const worldMaintenanceDue = elapsedWorldTicks > 0;
        const sectionDurations = createTickSectionDurations();
        const resetFrameEffectsStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'reset_frame_effects', { worldTick: deps.tick }, () => deps.worldRuntimeCombatEffectsService.resetFrameEffects());
        const resetFrameEffectsMs = performance.now() - resetFrameEffectsStartedAt;
        addTickSectionDuration(sectionDurations, 'tick.resetFrameEffectsMs', resetFrameEffectsMs);
        const reconcileStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'reconcile_defeated_players_before_tick', { worldTick: deps.tick }, () => this.reconcileDefeatedPlayersBeforeTick(deps, scheduledPlans === null || worldMaintenanceDue));
        addMeasuredTickSection(sectionDurations, 'tick.reconcileDefeatedPlayersMs', reconcileStartedAt);
        const planInstanceStepsStartedAt = performance.now();
        const instanceStepPlans = [];
        let plannedLogicalTicks = 0;
        const candidatePlans: Array<{ instance: any; steps: number | null; speed: number | null }> = scheduledPlans === null
            ? Array.from(deps.listInstanceRuntimes() as Iterable<any>, (instance) => ({ instance, steps: null, speed: null }))
            : scheduledPlans as Array<{ instance: any; steps: number; speed: number }>;
        for (const candidatePlan of candidatePlans) {
            const instance = candidatePlan.instance;
            if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                if (typeof deps.fenceInstanceRuntime === 'function') {
                    deps.fenceInstanceRuntime(instance.meta.instanceId, 'advance_frame_lease_check_failed');
                }
                continue;
            }
            // 优先从实例自身读取 tickSpeed；paused 时 speed=0
            let speed = scheduledPlans === null ? null : Number(candidatePlan.speed);
            if (speed === null) {
                if (instance.paused === true) {
                    speed = 0;
                } else if (Number.isFinite(instance.tickSpeed) && instance.tickSpeed >= 0) {
                    speed = instance.tickSpeed;
                } else if (getInstanceTickSpeed) {
                    speed = Math.max(0, Number(getInstanceTickSpeed(instance.template.id) ?? 1));
                } else {
                    speed = 1;
                }
            }
            const playerCount = resolveInstancePlayerCount(instance);
            const sleepMonsterAi = playerCount <= 0;
            if (instance._throttledSinceMs != null) {
                instance._throttledSinceMs = null;
            }
            if (!Number.isFinite(speed) || speed <= 0) {
                continue;
            }
            if (scheduledPlans !== null) {
                let steps = Math.max(0, Math.trunc(Number(candidatePlan.steps) || 0));
                if (typeof deps.timeChamberRuntimeService?.authorizeScheduledSteps === 'function') {
                    steps = deps.timeChamberRuntimeService.authorizeScheduledSteps(
                        instance.meta.instanceId,
                        instance,
                        steps,
                        speed,
                        deps,
                    );
                }
                if (steps > 0) {
                    instanceStepPlans.push({ instance, steps, speed, sleepMonsterAi });
                    plannedLogicalTicks += steps;
                }
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
            if (worldMaintenanceDue) {
                this.runIsolatedSyncOperation(deps, 'process_pending_respawns', { worldTick: deps.tick }, () => deps.processPendingRespawns());
                this.runIsolatedSyncOperation(deps, 'dispatch_pending_system_commands', { worldTick: deps.tick }, () => deps.dispatchPendingSystemCommands());
                if (typeof deps.worldRuntimeTongtianTowerService?.cleanupIdleInstances === 'function') {
                    await this.runIsolatedOperation(deps, 'tongtian_tower_cleanup_idle_instances', { worldTick: deps.tick }, () => deps.worldRuntimeTongtianTowerService.cleanupIdleInstances(deps));
                }
            }
            this.runIsolatedSyncOperation(deps, 'record_idle_frame', {
                worldTick: deps.tick,
            }, () => deps.worldRuntimeMetricsService.recordIdleFrame(startedAt));
            return 0;
        }
        const preTickMaterializationStartedAt = performance.now();
        const respawnsStartedAt = performance.now();
        if (scheduledPlans === null || worldMaintenanceDue) {
            this.runIsolatedSyncOperation(deps, 'process_pending_respawns', { worldTick: deps.tick }, () => deps.processPendingRespawns());
        }
        addMeasuredTickSection(sectionDurations, 'tick.processPendingRespawnsMs', respawnsStartedAt);
        const navigationMaterializeStartedAt = performance.now();
        const dueInstanceIds = scheduledPlans === null
            ? null
            : Array.from(new Set(instanceStepPlans.map(({ instance }) => instance.meta.instanceId)));
        if (dueInstanceIds) {
            for (const instanceId of dueInstanceIds) {
                await this.runIsolatedOperation(deps, 'materialize_navigation_commands_for_instance', { worldTick: deps.tick, instanceId }, () => deps.worldRuntimeNavigationService.materializeNavigationCommandsForInstance(instanceId, deps));
            }
        } else {
            await this.runIsolatedOperation(deps, 'materialize_navigation_commands', { worldTick: deps.tick }, () => deps.materializeNavigationCommands());
        }
        addMeasuredTickSection(sectionDurations, 'tick.materializeNavigationCommandsMs', navigationMaterializeStartedAt);
        if (typeof deps.materializeAutoUsePills === 'function') {
            const autoUsePillsStartedAt = performance.now();
            if (dueInstanceIds) {
                for (const instanceId of dueInstanceIds) {
                    this.runIsolatedSyncOperation(deps, 'materialize_auto_use_pills_for_instance', { worldTick: deps.tick, instanceId }, () => deps.worldRuntimeAutoCombatService?.materializeAutoUsePillsForInstance?.(instanceId, deps));
                }
            } else {
                this.runIsolatedSyncOperation(deps, 'materialize_auto_use_pills', { worldTick: deps.tick }, () => deps.materializeAutoUsePills());
            }
            addMeasuredTickSection(sectionDurations, 'tick.materializeAutoUsePillsMs', autoUsePillsStartedAt);
        }
        const autoCombatStartedAt = performance.now();
        this.runIsolatedSyncOperation(deps, 'materialize_auto_combat_commands', { worldTick: deps.tick }, () => {
            const previousAutoCombatRecorder = deps.recordAutoCombatSectionDuration;
            deps.recordAutoCombatSectionDuration = (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count);
            try {
                if (dueInstanceIds) {
                    for (const instanceId of dueInstanceIds) {
                        deps.worldRuntimeAutoCombatService?.materializeAutoCombatCommandsForInstance?.(instanceId, deps);
                    }
                    return;
                }
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
        const duePlayerIds = dueInstanceIds
            ? new Set(dueInstanceIds.flatMap((instanceId) => deps.getInstanceRuntime(instanceId)?.listPlayerIds?.()
                ?? deps.worldSessionService?.listInstancePlayerIds?.(instanceId)
                ?? []))
            : null;
        await this.runIsolatedOperation(deps, 'dispatch_pending_commands', { worldTick: deps.tick }, () => deps.dispatchPendingCommands(
            (key, durationMs, count = 1) => addTickSectionDuration(sectionDurations, key, durationMs, count),
            duePlayerIds,
        ));
        const pendingCommandsMs = performance.now() - pendingCommandsStartedAt;
        const systemCommandsStartedAt = performance.now();
        if (scheduledPlans === null || worldMaintenanceDue) {
            this.runIsolatedSyncOperation(deps, 'dispatch_pending_system_commands', { worldTick: deps.tick }, () => deps.dispatchPendingSystemCommands());
        }
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
            const deferCraftRuntimeUpdates = steps > 1;
            const isTimeChamber = isTimeChamberInstance(instance.meta.instanceId, deps);
            for (let index = 0; index < steps; index += 1) {
                if (scheduledPlans !== null && !isScheduledInstancePlanStillCurrent(instance, speed, deps)) {
                    break;
                }
                if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                    if (typeof deps.fenceInstanceRuntime === 'function') {
                        deps.fenceInstanceRuntime(instance.meta.instanceId, 'instance_tick_lease_check_failed');
                    }
                    break;
                }
                const attribution = resolveInstanceStepAttribution(isTimeChamber, index);
                const attributedStepStartedAt = performance.now();
                // 加速 tick 补偿：对于后续逻辑 tick，为当前实例的玩家重新物化命令
                if (index > 0) {
                    const instanceStepMaterializationStartedAt = performance.now();
                    await this.runIsolatedOperation(deps, 'materialize_navigation_commands_for_instance', {
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
                        new Set(instance.listPlayerIds()),
                    ));
                    const materializationDurationMs = performance.now() - instanceStepMaterializationStartedAt;
                    addTickSectionDuration(sectionDurations, 'instance.stepCommandMaterializationMs', materializationDurationMs, 1);
                    if (attribution.materializationDurationKey) {
                        addTickSectionDuration(sectionDurations, attribution.materializationDurationKey, materializationDurationMs, 1);
                    }
                    if (!isScheduledInstancePlanStillCurrent(instance, speed, deps)) {
                        break;
                    }
                    if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                        if (typeof deps.fenceInstanceRuntime === 'function') {
                            deps.fenceInstanceRuntime(instance.meta.instanceId, 'instance_tick_lease_check_failed');
                        }
                        break;
                    }
                }
                let blockedPlayerIds = new Set();
                const blockedPlayerLookupStartedAt = performance.now();
                this.runIsolatedSyncOperation(deps, 'get_blocked_player_ids', { worldTick: deps.tick }, () => {
                    blockedPlayerIds = scheduledPlans !== null
                        && typeof deps.worldRuntimeNavigationService.getBlockedPlayerIdsForInstance === 'function'
                        ? deps.worldRuntimeNavigationService.getBlockedPlayerIdsForInstance(instance.meta.instanceId, deps)
                        : deps.worldRuntimeNavigationService.getBlockedPlayerIds();
                });
                addMeasuredTickSection(sectionDurations, 'instance.blockedPlayerLookupMs', blockedPlayerLookupStartedAt);
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
                const hasFormationTerrainStabilizer = typeof isFormationTerrainStabilized === 'function'
                    && (isFormationTerrainStabilized as { hasTerrainStabilizer?: boolean }).hasTerrainStabilizer === true;
                const instanceIdText = String(instance.meta.instanceId ?? '');
                const hasSectInnateStabilizer = instanceIdText.startsWith('sect:')
                    && typeof deps.worldRuntimeSectService?.findSectByInstanceId === 'function'
                    && deps.worldRuntimeSectService.findSectByInstanceId(instance.meta.instanceId) !== null;
                const isTerrainStabilized = (x, y) => (
                    terrainStabilizationChecker(x, y) === true
                    || deps.worldRuntimeSectService?.isSectInnateStabilized?.(instance.meta.instanceId, x, y) === true
                );
                const terrainStabilizerHpRecoveryChecker = hasFormationTerrainStabilizer || hasSectInnateStabilizer
                    ? Object.defineProperty((x: number, y: number) => isTerrainStabilized(x, y), 'hasTerrainStabilizer', {
                        value: true,
                        enumerable: false,
                    })
                    : null;
                const instanceIntents = sleepMonsterAi === true ? null : (workerProposals.get(instance.meta.instanceId) ?? null);
                // T-19: 复用预分配容器
                reusableTickResult.completedBuildings.length = 0;
                reusableTickResult.transfers.length = 0;
                reusableTickResult.monsterActions.length = 0;
                let result = reusableTickResult;
                const coreTickStartedAt = performance.now();
                const coreTickCompleted = this.runIsolatedSyncOperation(deps, 'instance_tick_once', {
                    instanceId: instance.meta.instanceId,
                    instanceTick: instance.tick,
                    worldTick: deps.tick,
                }, () => {
                    result = instance.tickOnce(instanceIntents, { sleepMonsterAi: sleepMonsterAi === true }) ?? result;
                });
                addMeasuredTickSection(sectionDurations, 'instance.coreTickMs', coreTickStartedAt);
                if (!coreTickCompleted) {
                    break;
                }
                totalLogicalTicks += 1;
                const fuelConsumed = scheduledPlans === null
                    || typeof deps.timeChamberRuntimeService?.consumeScheduledStep !== 'function'
                    || deps.timeChamberRuntimeService.consumeScheduledStep(
                        instance.meta.instanceId,
                        instance,
                        speed,
                        deps,
                    ) !== false;
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
                    }, () => deps.worldRuntimeFormationService.advanceInstanceFormations(instance, instance.tick, deps));
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
                if (typeof instance.advanceGroundItemExpiry === 'function') {
                    const groundItemExpiryStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'instance_ground_item_expiry', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => instance.advanceGroundItemExpiry(instance.tick));
                    addMeasuredTickSection(sectionDurations, 'instance.groundItemExpiryMs', groundItemExpiryStartedAt);
                }
                if (typeof instance.advanceTileRecovery === 'function') {
                    const tileRecoveryStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'instance_tile_recovery', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => {
                        const tileRecoveryProvider = resolveTileRecoveryProvider(instance);
                        instance.advanceTileRecovery(isTerrainStabilized, tileRecoveryProvider, terrainStabilizerHpRecoveryChecker);
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
                if (scheduledPlans !== null && typeof deps.worldRuntimeLootContainerService?.advanceContainerSearchesForInstance === 'function') {
                    const lootContainerSearchStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'loot_container_searches_for_instance', {
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                    }, () => deps.worldRuntimeLootContainerService.advanceContainerSearchesForInstance(
                        instance.meta.instanceId,
                        {
                            getInstanceRuntime: (instanceId) => deps.getInstanceRuntime(instanceId),
                        },
                        {
                            listConnectedPlayerIds: () => instance.listPlayerIds(),
                            getPlayerLocation: (playerId) => deps.getPlayerLocation(playerId),
                        },
                        instance.tick,
                    ));
                    addMeasuredTickSection(sectionDurations, 'instance.lootContainerSearchesMs', lootContainerSearchStartedAt);
                }
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
                    const playerAnchorSyncStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'player_world_anchor_sync_batch', () => ({
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                        playerCount: currentPlayerIds.length,
                    }), () => syncPlayerWorldAnchorsFromInstance(instance, currentPlayerIds, deps.playerRuntimeService));
                    addMeasuredTickSection(sectionDurations, 'instance.playerWorldAnchorSyncMs', playerAnchorSyncStartedAt, currentPlayerIds.length);
                    // T-16: 合并为批量调用，减少逐玩家隔离开销
                    const worldTimeVisionStartedAt = performance.now();
                    this.runIsolatedSyncOperation(deps, 'player_world_time_vision_batch', () => ({
                        instanceId: instance.meta.instanceId,
                        instanceTick: instance.tick,
                        worldTick: deps.tick,
                        playerCount: currentPlayerIds.length,
                    }), () => syncWorldTimeVisionForPlayers(instance, currentPlayerIds, deps.playerRuntimeService, speed, this.runtimeMapConfigService));
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
                            getInstanceRuntime: (instanceId) => deps.getInstanceRuntime(instanceId),
                            markPlayerDefeated: (defeatedPlayerId) => this.markPlayerDefeated(defeatedPlayerId),
                            onPlayerQiSpent: (player, amount) => instance.disperseQiAt?.(player?.x, player?.y, amount),
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
                    const craftPlayerIds = typeof deps.worldRuntimeCraftTickService?.listTickablePlayerIds === 'function'
                        ? deps.worldRuntimeCraftTickService.listTickablePlayerIds(currentPlayerIds)
                        : currentPlayerIds;
                    if (craftPlayerIds.length > 0) {
                        const craftJobAdvanceStartedAt = performance.now();
                        await this.runIsolatedOperation(deps, 'instance_craft_jobs', {
                            instanceId: instance.meta.instanceId,
                            playerCount: craftPlayerIds.length,
                            candidatePlayerCount: currentPlayerIds.length,
                            instanceTick: instance.tick,
                            worldTick: deps.tick,
                        }, () => deps.worldRuntimeCraftTickService.advanceCraftJobs(
                            craftPlayerIds,
                            deps,
                            deferCraftRuntimeUpdates ? DEFERRED_CRAFT_RUNTIME_UPDATE_OPTIONS : undefined,
                        ));
                        addMeasuredTickSection(sectionDurations, 'instance.craftJobAdvanceMs', craftJobAdvanceStartedAt, craftPlayerIds.length);
                    }
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
                addTickSectionDuration(
                    sectionDurations,
                    attribution.stepDurationKey,
                    performance.now() - attributedStepStartedAt,
                    1,
                );
                addTickSectionDuration(
                    sectionDurations,
                    attribution.playerStepCountKey,
                    0,
                    currentPlayerIds.length,
                );
                if (!fuelConsumed) {
                    break;
                }
            }
            if (deferCraftRuntimeUpdates) {
                deps.worldRuntimeCraftTickService?.flushDeferredRuntimeUpdates?.(deps);
            }
        }
        const postTickCleanupStartedAt = performance.now();
        if ((scheduledPlans === null || worldMaintenanceDue) && typeof deps.worldRuntimeTongtianTowerService?.cleanupIdleInstances === 'function') {
            await this.runIsolatedOperation(deps, 'tongtian_tower_cleanup_idle_instances', {
                worldTick: deps.tick,
            }, () => deps.worldRuntimeTongtianTowerService.cleanupIdleInstances(deps));
        }
        const postTickCleanupMs = performance.now() - postTickCleanupStartedAt;
        const instanceTicksMs = performance.now() - instanceTicksStartedAt;
        const playerAdvanceStartedAt = performance.now();
        if (scheduledPlans === null) {
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
        }
        const questRefreshStartedAt = performance.now();
        for (const playerId of steppedPlayerIds) {
            this.runIsolatedSyncOperation(deps, 'player_quest_refresh', {
                playerId,
                worldTick: deps.tick,
            }, () => {
                if (typeof deps.refreshQuestStatesIfDependenciesChanged === 'function') {
                    deps.refreshQuestStatesIfDependenciesChanged(playerId);
                    return;
                }
                deps.refreshQuestStates(playerId);
            });
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

function isTimeChamberInstance(instanceId: string, deps): boolean {
    return typeof deps.timeChamberRuntimeService?.isTimeChamberInstance === 'function'
        && deps.timeChamberRuntimeService.isTimeChamberInstance(instanceId) === true;
}

function resolveInstanceStepAttribution(
    isTimeChamber: boolean,
    stepIndex: number,
): InstanceStepAttributionKeys {
    if (isTimeChamber) {
        return stepIndex > 0
            ? TIME_CHAMBER_EXTRA_STEP_ATTRIBUTION
            : TIME_CHAMBER_FIRST_STEP_ATTRIBUTION;
    }
    return stepIndex > 0
        ? NON_TIME_CHAMBER_CATCH_UP_STEP_ATTRIBUTION
        : NON_TIME_CHAMBER_FIRST_STEP_ATTRIBUTION;
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

export function syncWorldTimeVisionForPlayers(instance, playerIds, playerRuntimeService, tickSpeed = 1, runtimeMapConfigService = null) {
    if (!playerRuntimeService || typeof playerRuntimeService.getPlayer !== 'function') {
        return;
    }
    const timeConfig = resolveInstanceTimeConfig(instance, runtimeMapConfigService);
    const timeState = resolveGameTimeState(
        instance.tick,
        1,
        timeConfig,
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

function resolveInstanceTimeConfig(instance, runtimeMapConfigService) {
    const baseTimeConfig = instance?.template?.source?.time;
    const mapId = resolveInstanceTemplateId(instance);
    if (mapId && typeof runtimeMapConfigService?.getMapTimeConfig === 'function') {
        return runtimeMapConfigService.getMapTimeConfig(mapId, baseTimeConfig ?? {});
    }
    return baseTimeConfig;
}

function resolveInstanceTemplateId(instance) {
    const candidates = [
        instance?.template?.id,
        instance?.meta?.templateId,
        instance?.templateId,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
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

/** 异步预计算期间实例可能被改速、暂停、销毁或替换；旧计划执行前必须再次复核。 */
function isScheduledInstancePlanStillCurrent(instance, plannedSpeed, deps) {
    const instanceId = typeof instance?.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
    if (!instanceId || deps.getInstanceRuntime?.(instanceId) !== instance || instance.paused === true) {
        return false;
    }
    const currentSpeed = Number(instance.tickSpeed);
    return Number.isFinite(currentSpeed) && currentSpeed > 0 && currentSpeed === plannedSpeed;
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

function syncPlayerWorldAnchorsFromInstance(instance, playerIds, playerRuntimeService) {
    if (!instance || typeof instance.getPlayerPosition !== 'function' || typeof playerRuntimeService?.syncWorldAnchorFromInstanceTick !== 'function') {
        return;
    }
    const instanceId = typeof instance.meta?.instanceId === 'string' ? instance.meta.instanceId : '';
    const templateId = typeof instance.meta?.templateId === 'string' ? instance.meta.templateId : '';
    if (!instanceId || !templateId) {
        return;
    }
    for (const playerId of playerIds) {
        const position = instance.getPlayerPosition(playerId);
        if (!position) {
            continue;
        }
        playerRuntimeService.syncWorldAnchorFromInstanceTick(playerId, {
            instanceId,
            templateId,
            x: position.x,
            y: position.y,
            facing: position.facing,
        });
    }
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
