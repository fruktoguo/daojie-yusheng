/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 制作任务 tick 推进服务
 * 每帧为有活跃制作任务的玩家推进炼丹、锻造、强化等技艺活动进度
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';
import { TechniqueActivityPipelineService } from '../craft/pipeline/technique-activity-pipeline.service';
import { TechniqueActivityQueueService } from '../craft/pipeline/technique-activity-queue.service';
import { AlchemyStrategy } from '../craft/pipeline/strategies/alchemy.strategy';
import { ForgingStrategy } from '../craft/pipeline/strategies/forging.strategy';
import { EnhancementStrategy } from '../craft/pipeline/strategies/enhancement.strategy';
import { TransmissionStrategy } from '../craft/pipeline/strategies/transmission.strategy';
import { GatherStrategy } from '../craft/pipeline/strategies/gather.strategy';
import { BuildingStrategy } from '../craft/pipeline/strategies/building.strategy';
import { FormationStrategy } from '../craft/pipeline/strategies/formation.strategy';
import { MiningStrategy } from '../craft/pipeline/strategies/mining.strategy';
import { hasTechniqueActivityJob } from '../craft/technique-activity-runtime.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';

const CRAFT_TICK_FLUSH_OPTIONS = Object.freeze({
    skipActiveJobPersistence: true,
    deferRuntimeUpdates: false,
});
const DEFERRED_CRAFT_TICK_FLUSH_OPTIONS = Object.freeze({
    skipActiveJobPersistence: true,
    deferRuntimeUpdates: true,
});
const DEFERRED_CRAFT_QUEUE_FLUSH_OPTIONS = Object.freeze({
    deferRuntimeUpdates: true,
});

/** world-runtime craft tick orchestration：承接 craft job tick 推进编排。 */
@Injectable()
export class WorldRuntimeCraftTickService {
    private readonly logger = new Logger(WorldRuntimeCraftTickService.name);
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * craftPanelRuntimeService：炼制面板运行态服务引用。
 */

    craftPanelRuntimeService;
    /**
 * worldRuntimeCraftMutationService：世界运行态技艺活动 mutation 服务引用。
 */

    worldRuntimeCraftMutationService;
    /** 技艺管线服务。 */
    pipeline;
    /** 技艺队列服务。 */
    queueService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeCraftMutationService 参数说明。
 * @param worldRuntimeAlchemyService 参数说明。
 * @param worldRuntimeEnhancementService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(CraftPanelRuntimeService) craftPanelRuntimeService: any,
        @Inject(WorldRuntimeCraftMutationService) worldRuntimeCraftMutationService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;

        // 初始化管线并注册所有策略
        this.pipeline = new TechniqueActivityPipelineService();
        this.pipeline.register(new AlchemyStrategy(craftPanelRuntimeService));
        this.pipeline.register(new ForgingStrategy(craftPanelRuntimeService));
        this.pipeline.register(new EnhancementStrategy(craftPanelRuntimeService));
        this.pipeline.register(new TransmissionStrategy());
        this.pipeline.register(new GatherStrategy());
        this.pipeline.register(new MiningStrategy());
        this.pipeline.register(new BuildingStrategy());
        this.pipeline.register(new FormationStrategy());
        this.queueService = new TechniqueActivityQueueService(this.pipeline);
    }
    /** 从实例居民中筛出本息确实需要进入技艺管线的玩家。 */
    listTickablePlayerIds(playerIds): string[] {
        const tickablePlayerIds: string[] = [];
        for (const playerId of playerIds ?? []) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (hasTechniqueActivityTickWork(player)) {
                tickablePlayerIds.push(playerId);
            }
        }
        return tickablePlayerIds;
    }
    /**
 * advanceCraftJobs：执行advance炼制Job相关逻辑。
 * @param playerIds player ID 集合。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advance炼制Job相关状态。
 */

    async advanceCraftJobs(playerIds, deps, options: any = undefined) {
        const deferRuntimeUpdates = options?.deferRuntimeUpdates === true;
        const tickFlushOptions = deferRuntimeUpdates
            ? DEFERRED_CRAFT_TICK_FLUSH_OPTIONS
            : CRAFT_TICK_FLUSH_OPTIONS;
        for (const playerId of playerIds) {
          try {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                continue;
            }
            if (!hasTechniqueActivityTickWork(player)) {
                continue;
            }
            this.ensureAlchemyLikeResourceCompatibilityAfterRestore(playerId, player, deps);
            for (const kind of this.craftPanelRuntimeService.listActiveTechniqueActivityKinds(player)) {
                const pendingResult = this.tickActiveTechniqueActivity(player, kind, deps);
                const result = isPromiseLike(pendingResult) ? await pendingResult : pendingResult;
                this.sleepConditionalTechniqueActivityIfRequested(player, result);
                this.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    result,
                    kind,
                    deps,
                    tickFlushOptions,
                );
            }

            // 队列推进：如果当前没有活跃任务，尝试启动队列中的下一个
            if (!this.craftPanelRuntimeService.hasAnyActiveTechniqueActivity(player)) {
                const ctx = this.craftPanelRuntimeService.buildPipelineContext(deps);
                const queueHead = typeof this.queueService.getQueue === 'function'
                    ? this.queueService.getQueue(player)[0]
                    : null;
                const queueResult = queueHead?.kind === 'enhancement'
                    && typeof this.craftPanelRuntimeService.startQueuedEnhancementDurably === 'function'
                    ? await this.craftPanelRuntimeService.startQueuedEnhancementDurably(
                        player,
                        () => this.queueService.tickQueue(player, ctx),
                        deps,
                    )
                    : this.queueService.tickQueue(player, ctx);
                if (queueResult?.ok) {
                    const kind = this.resolveQueueResultKind(player);
                    if (kind) {
                        this.worldRuntimeCraftMutationService.flushCraftMutation(
                            playerId,
                            queueResult,
                            kind,
                            deps,
                            deferRuntimeUpdates ? DEFERRED_CRAFT_QUEUE_FLUSH_OPTIONS : undefined,
                        );
                    }
                }
            }
          } catch (error) {
            const notice = buildCraftTickErrorNotice(error);
            this.logger.error(
                `玩家技艺 tick 失败 playerId=${playerId}`,
                error instanceof Error ? error.stack : String(error),
            );
            try {
                const noticeOperation = deps?.queuePlayerNotice?.(
                    playerId,
                    notice.text,
                    notice.kind,
                    undefined,
                    undefined,
                    notice.structured,
                );
                void Promise.resolve(noticeOperation).catch((noticeError) => {
                    this.logger.warn(
                        `玩家技艺 tick 失败通知入队失败 playerId=${playerId} error=${noticeError instanceof Error ? noticeError.message : String(noticeError)}`,
                    );
                });
            } catch (noticeError) {
                this.logger.warn(
                    `玩家技艺 tick 失败通知入队失败 playerId=${playerId} error=${noticeError instanceof Error ? noticeError.message : String(noticeError)}`,
                );
            }
          }
        }
    }

    /** 推进活跃技艺；强化必须走强事务入口，避免完成回写和 active_job 分裂。 */
    private tickActiveTechniqueActivity(player: any, kind: string, deps: any): any {
        if (kind === 'enhancement' && typeof this.craftPanelRuntimeService.tickEnhancementDurably === 'function') {
            return this.craftPanelRuntimeService.tickEnhancementDurably(player, deps);
        }
        if (
            kind === 'formation'
            && typeof deps?.worldRuntimeFormationService?.tickFormationMaintenanceDurably === 'function'
        ) {
            return deps.worldRuntimeFormationService.tickFormationMaintenanceDurably(
                player,
                (tickDeps: any) => this.craftPanelRuntimeService.tickTechniqueActivity(player, kind, tickDeps),
                deps,
            );
        }
        return this.runWithDeferredActiveJobPersistence(
            player,
            () => this.craftPanelRuntimeService.tickTechniqueActivity(player, kind, deps),
        );
    }

    /** 普通进度息只标记分域脏数据，交给统一 flush；命令和资产边界仍使用各自强写路径。 */
    private runWithDeferredActiveJobPersistence(player: any, action: () => any): any {
        const previousSuppress = player?.suppressImmediateDomainPersistence;
        if (player) {
            player.suppressImmediateDomainPersistence = true;
        }
        try {
            const result = action();
            if (isPromiseLike(result)) {
                return Promise.resolve(result).finally(() => {
                    if (player) {
                        player.suppressImmediateDomainPersistence = previousSuppress;
                    }
                });
            }
            if (player) {
                player.suppressImmediateDomainPersistence = previousSuppress;
            }
            return result;
        } catch (error) {
            if (player) {
                player.suppressImmediateDomainPersistence = previousSuppress;
            }
            throw error;
        }
    }

    /** 高倍实例完成本帧全部逻辑息后统一下发最终技艺投影。 */
    flushDeferredRuntimeUpdates(deps): void {
        this.worldRuntimeCraftMutationService.flushDeferredRuntimeUpdates?.(deps);
    }

    /** 玩家从持久化恢复后，首轮 craft tick 先迁移旧预扣炼丹/炼器 job。 */
    private ensureAlchemyLikeResourceCompatibilityAfterRestore(playerId: string, player: any, deps: any): void {
        if (typeof this.craftPanelRuntimeService.ensureAlchemyLikeActiveJobResourceCompatibilityMutation !== 'function') {
            return;
        }
        for (const kind of ['alchemy', 'forging']) {
            const result = this.craftPanelRuntimeService.ensureAlchemyLikeActiveJobResourceCompatibilityMutation(player, kind);
            if (result?.ok && (result.panelChanged || result.inventoryChanged)) {
                this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, kind, deps);
            }
        }
    }

    /** 从玩家当前活跃 job 推断刚启动的 kind。 */
    private resolveQueueResultKind(player) {
        if (player.alchemyJob && Number(player.alchemyJob.remainingTicks) > 0) return 'alchemy';
        if (player.forgingJob && Number(player.forgingJob.remainingTicks) > 0) return 'forging';
        if (player.enhancementJob && Number(player.enhancementJob.remainingTicks) > 0) return 'enhancement';
        if (player.transmissionJob && Number(player.transmissionJob.remainingTicks) > 0) return 'transmission';
        if (player.gatherJob && Number(player.gatherJob.remainingTicks) > 0) return 'gather';
        if (player.miningJob && Number(player.miningJob.remainingTicks) > 0) return 'mining';
        if (player.buildingJob && Number(player.buildingJob.remainingTicks) > 0) return 'building';
        if (player.formationJob && Number(player.formationJob.remainingTicks) > 0) return 'formation';
        return null;
    }

    /** 条件型技艺 tick 失败时，领域服务只返回休眠信号，统一队列由这里写入。 */
    private sleepConditionalTechniqueActivityIfRequested(player: any, result: any): void {
        const sleepPayload = result?.sleepPayload;
        if (!sleepPayload || typeof sleepPayload !== 'object') return;
        const kind = sleepPayload.kind;
        if (kind !== 'gather' && kind !== 'building' && kind !== 'formation' && kind !== 'mining') return;
        this.queueService.sleepToQueue(
            player,
            kind,
            sleepPayload.payload ?? {},
            typeof sleepPayload.label === 'string' && sleepPayload.label.trim() ? sleepPayload.label.trim() : '技艺任务',
            typeof sleepPayload.reason === 'string' && sleepPayload.reason.trim() ? sleepPayload.reason.trim() : '条件暂时不满足',
        );
    }
};

/** 只读判断玩家是否存在活跃 job、兼容迁移 job 或等待队列。 */
function hasTechniqueActivityTickWork(player: any): boolean {
    if (!player || typeof player !== 'object') {
        return false;
    }
    if (player.alchemyJob || player.forgingJob) {
        return true;
    }
    if (
        hasTechniqueActivityJob(player.enhancementJob)
        || hasTechniqueActivityJob(player.transmissionJob)
        || hasTechniqueActivityJob(player.gatherJob)
        || hasTechniqueActivityJob(player.buildingJob)
        || hasTechniqueActivityJob(player.miningJob)
        || hasTechniqueActivityJob(player.formationJob)
    ) {
        return true;
    }
    return Array.isArray(player.techniqueActivityQueue) && player.techniqueActivityQueue.length > 0;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

export function buildCraftTickErrorNotice(error: unknown): { text: string; kind: string; structured?: unknown } {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('player_active_job_cas_conflict')) {
        return buildStructuredNotice(
            'warn',
            'notice.craft.enhancement.sync-conflict',
            '强化状态正在同步，请稍后重试。',
        );
    }
    if (message.includes('formation_maintenance_active_job_sync_pending')) {
        return buildStructuredNotice(
            'warn',
            'notice.craft.formation.sync-pending',
            '阵法维护任务状态正在同步，请稍后重试。',
        );
    }
    return { text: message || '技艺任务处理失败', kind: 'warn' };
}
