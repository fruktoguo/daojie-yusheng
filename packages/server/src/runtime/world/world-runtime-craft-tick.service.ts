/**
 * 制作任务 tick 推进服务
 * 每帧为有活跃制作任务的玩家推进炼丹、锻造、强化等技艺活动进度
 */
import { Inject, Injectable } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';
import { WorldRuntimeAlchemyService } from './world-runtime-alchemy.service';
import { WorldRuntimeEnhancementService } from './world-runtime-enhancement.service';
import { TechniqueActivityPipelineService } from '../craft/pipeline/technique-activity-pipeline.service';
import { TechniqueActivityQueueService } from '../craft/pipeline/technique-activity-queue.service';
import { AlchemyStrategy } from '../craft/pipeline/strategies/alchemy.strategy';
import { ForgingStrategy } from '../craft/pipeline/strategies/forging.strategy';
import { EnhancementStrategy } from '../craft/pipeline/strategies/enhancement.strategy';
import { GatherStrategy } from '../craft/pipeline/strategies/gather.strategy';
import { BuildingStrategy } from '../craft/pipeline/strategies/building.strategy';

/** world-runtime craft tick orchestration：承接 craft job tick 推进编排。 */
@Injectable()
export class WorldRuntimeCraftTickService {
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
    /**
 * worldRuntimeAlchemyService：世界运行态炼丹 tick 服务引用。
 */

    worldRuntimeAlchemyService;
    /**
 * worldRuntimeEnhancementService：世界运行态强化 tick 服务引用。
 */

    worldRuntimeEnhancementService;

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
        @Inject(WorldRuntimeAlchemyService) worldRuntimeAlchemyService: any,
        @Inject(WorldRuntimeEnhancementService) worldRuntimeEnhancementService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
        this.worldRuntimeEnhancementService = worldRuntimeEnhancementService;

        // 初始化管线并注册所有策略
        this.pipeline = new TechniqueActivityPipelineService();
        this.pipeline.register(new AlchemyStrategy(craftPanelRuntimeService));
        this.pipeline.register(new ForgingStrategy(craftPanelRuntimeService));
        this.pipeline.register(new EnhancementStrategy(craftPanelRuntimeService));
        this.pipeline.register(new GatherStrategy());
        this.pipeline.register(new BuildingStrategy());
        this.queueService = new TechniqueActivityQueueService(this.pipeline);
    }
    /**
 * advanceCraftJobs：执行advance炼制Job相关逻辑。
 * @param playerIds player ID 集合。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advance炼制Job相关状态。
 */

    async advanceCraftJobs(playerIds, deps) {
        for (const playerId of playerIds) {
          try {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                continue;
            }
            for (const kind of this.craftPanelRuntimeService.listActiveTechniqueActivityKinds(player)) {
                if (kind === 'alchemy' || kind === 'forging') {
                    await this.worldRuntimeAlchemyService.tickAlchemy(playerId, player, deps, kind);
                    continue;
                }
                if (kind === 'enhancement') {
                    await this.worldRuntimeEnhancementService.tickEnhancement(playerId, player, deps);
                    continue;
                }
                this.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    this.craftPanelRuntimeService.tickTechniqueActivity(player, kind, deps),
                    kind,
                    deps,
                );
            }
            if (player.gatherJob && Number(player.gatherJob.remainingTicks) > 0) {
                const gatherResult = await deps.worldRuntimeLootContainerService.tickGather(playerId, deps);
                this.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    gatherResult,
                    'gather',
                    deps,
                );
            }
            if (player.buildingJob && Number(player.buildingJob.remainingTicks) > 0) {
                deps.tickBuildingConstruction(playerId);
            }

            // 队列推进：如果当前没有活跃任务，尝试启动队列中的下一个
            if (!this.craftPanelRuntimeService.hasAnyActiveTechniqueActivity(player)
                && !(player.gatherJob && Number(player.gatherJob.remainingTicks) > 0)
                && !(player.buildingJob && Number(player.buildingJob.remainingTicks) > 0)) {
                const ctx = { contentTemplateRepository: null as any, resolveExpToNextByLevel: () => 100, getInstanceRuntime: () => null, deps };
                const queueResult = this.queueService.tickQueue(player, ctx);
                if (queueResult?.ok) {
                    const kind = this.resolveQueueResultKind(player);
                    if (kind) {
                        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, queueResult, kind, deps);
                    }
                }
            }

            // EventBus: 发射活跃 job 进度
            this.emitActiveJobProgress(playerId, player);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            deps?.queuePlayerNotice?.(playerId, message, 'warn');
          }
        }
    }

    /** 向 EventBus 发射当前玩家所有活跃 job 的进度快照。 */
    private emitActiveJobProgress(playerId: string, player: any): void {
        const eventBus = this.playerRuntimeService.runtimeEventBusService;
        if (!eventBus) return;

        const jobs = [
            { job: player.alchemyJob, type: 'alchemy' },
            { job: player.forgingJob, type: 'forging' },
            { job: player.enhancementJob, type: 'enhancement' },
            { job: player.gatherJob, type: 'gather' },
            { job: player.buildingJob, type: 'building' },
        ];

        for (const { job, type } of jobs) {
            if (!job || Number(job.remainingTicks) <= 0) continue;
            const total = Number(job.totalTicks || job.durationTicks || 1);
            const remaining = Number(job.remainingTicks);
            const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
            eventBus.queueActiveJobProgress(playerId, {
                jobId: job.jobRunId || `${type}:${playerId}`,
                jobType: type,
                progress,
                remainingMs: remaining * 1000,
                label: job.label || job.recipeName || undefined,
            });
        }
    }

    /** 从玩家当前活跃 job 推断刚启动的 kind。 */
    private resolveQueueResultKind(player) {
        if (player.alchemyJob && Number(player.alchemyJob.remainingTicks) > 0) return 'alchemy';
        if (player.forgingJob && Number(player.forgingJob.remainingTicks) > 0) return 'forging';
        if (player.enhancementJob && Number(player.enhancementJob.remainingTicks) > 0) return 'enhancement';
        if (player.gatherJob && Number(player.gatherJob.remainingTicks) > 0) return 'gather';
        if (player.buildingJob && Number(player.buildingJob.remainingTicks) > 0) return 'building';
        return null;
    }
};
