import { Inject, Injectable } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';
import { WorldRuntimeAlchemyService } from './world-runtime-alchemy.service';
import { WorldRuntimeEnhancementService } from './world-runtime-enhancement.service';

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
    }
    /**
 * advanceCraftJobs：执行advance炼制Job相关逻辑。
 * @param playerIds player ID 集合。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advance炼制Job相关状态。
 */

    async advanceCraftJobs(playerIds, deps) {
        for (const playerId of playerIds) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                continue;
            }
            for (const kind of this.craftPanelRuntimeService.listActiveTechniqueActivityKinds(player)) {
                if (kind === 'alchemy' || kind === 'forging') {
                    await this.worldRuntimeAlchemyService.tickAlchemy(playerId, player, deps);
                    continue;
                }
                if (kind === 'enhancement') {
                    await this.worldRuntimeEnhancementService.tickEnhancement(playerId, player, deps);
                    continue;
                }
                this.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    this.craftPanelRuntimeService.tickTechniqueActivity(player, kind),
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
        }
    }
};
