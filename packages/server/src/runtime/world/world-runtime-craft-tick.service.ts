/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 制作任务 tick 推进服务
 * 每帧为有活跃制作任务的玩家推进炼丹、锻造、强化等技艺活动进度
 */
import { Inject, Injectable } from '@nestjs/common';
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
import { buildTechniqueActivityTaskListView } from '../craft/technique-activity-task-view.helpers';

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
                const result = await Promise.resolve(this.craftPanelRuntimeService.tickTechniqueActivity(player, kind, deps));
                this.sleepConditionalTechniqueActivityIfRequested(player, result);
                this.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    result,
                    kind,
                    deps,
                );
            }

            // 队列推进：如果当前没有活跃任务，尝试启动队列中的下一个
            if (!this.craftPanelRuntimeService.hasAnyActiveTechniqueActivity(player)) {
                const ctx = this.craftPanelRuntimeService.buildPipelineContext(deps);
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

        const tasks = buildTechniqueActivityTaskListView(player).tasks;
        for (const task of tasks) {
            if (task.state !== 'running' && task.state !== 'interrupt_wait') continue;
            const total = Number(task.workTotalTicks ?? 1);
            const remaining = Number(task.workRemainingTicks ?? 0);
            const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
            eventBus.queueActiveJobProgress(playerId, {
                jobId: task.cancelRef.jobRunId || task.id,
                jobType: task.kind,
                progress,
                remainingMs: remaining * 1000,
                label: task.targetLabel || task.label,
            });
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
