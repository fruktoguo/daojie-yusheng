/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 制作/采集/建造中断服务
 * 当玩家移动或被打断时，统一中断所有进行中的技艺活动并休眠入队列
 */
import { Inject, Injectable } from '@nestjs/common';

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

interface CraftPlayerLike {
  gatherJob?: {
    remainingTicks?: number;
    resourceNodeId?: string;
    sourceId?: string;
    instanceId?: string;
    resourceNodeName?: string;
  } | null;
  buildingJob?: {
    remainingTicks?: number;
    buildingId?: string;
    buildingName?: string;
  } | null;
  formationJob?: {
    remainingTicks?: number;
    formationInstanceId?: string;
    formationName?: string;
  } | null;
  transmissionJob?: {
    remainingTicks?: number;
    techniqueId?: string;
    techniqueName?: string;
  } | null;
  miningJob?: {
    remainingTicks?: number;
    miningNodeId?: string;
    miningNodeName?: string;
    instanceId?: string;
    targetX?: number;
    targetY?: number;
  } | null;
}

interface CraftPanelRuntimePort<TPlayer = CraftPlayerLike> {
  listActiveTechniqueActivityKinds(player: TPlayer): Iterable<string>;
  interruptTechniqueActivity(player: TPlayer, kind: string, reason: string, deps?: unknown): unknown;
}

interface CraftMutationPort {
  flushCraftMutation(playerId: string, mutation: unknown, kind: string, deps: unknown): void;
}

interface CraftInterruptDeps<TPlayer = CraftPlayerLike> {
  worldRuntimeLootContainerService: {
    interruptGather(playerId: string, player: TPlayer, reason: string, deps: CraftInterruptDeps<TPlayer>): unknown;
  };
  worldRuntimeCraftMutationService?: {
    emitTechniqueActivityTaskUpdate?(playerId: string): void;
  };
  interruptBuildingConstruction?: (playerId: string, reason: string) => void;
}

/** 技艺活动统一中断器：移动/被攻击时中断炼丹、锻造、采集、建造等活动 */
@Injectable()
export class WorldRuntimeCraftInterruptService {
  private readonly pipeline: TechniqueActivityPipelineService;
  private readonly queueService: TechniqueActivityQueueService;

  constructor(
    @Inject(CraftPanelRuntimeService)
    private readonly craftPanelRuntimeService: CraftPanelRuntimePort,
    @Inject(WorldRuntimeCraftMutationService)
    private readonly worldRuntimeCraftMutationService: CraftMutationPort,
  ) {
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

  interruptCraftForReason(
    playerId: string,
    player: CraftPlayerLike,
    reason: string,
    deps: CraftInterruptDeps,
  ): void {
    if ((player as { suppressImmediateDomainPersistence?: boolean } | null)?.suppressImmediateDomainPersistence === true) {
      return;
    }
    for (const kind of this.craftPanelRuntimeService.listActiveTechniqueActivityKinds(player)) {
      if (kind === 'formation' && reason === 'move') {
        continue;
      }
      this.sleepConditionalTechniqueActivityBeforeInterrupt(player, kind, reason);
      this.worldRuntimeCraftMutationService.flushCraftMutation(
        playerId,
        this.craftPanelRuntimeService.interruptTechniqueActivity(player, kind, reason, deps),
        kind,
        deps,
      );
    }
  }

  private sleepConditionalTechniqueActivityBeforeInterrupt(
    player: CraftPlayerLike,
    kind: string,
    reason: string,
  ): void {
    if (kind === 'gather' && player.gatherJob && Number(player.gatherJob.remainingTicks) > 0) {
      const gatherJob = player.gatherJob;
      this.queueService.sleepToQueue(
        player, 'gather',
        {
          sourceId: gatherJob.sourceId ?? gatherJob.resourceNodeId,
          resourceNodeId: gatherJob.resourceNodeId,
          instanceId: gatherJob.instanceId,
        },
        gatherJob.resourceNodeName ?? '采集',
        reason === 'move' ? '离开采集点' : '被打断',
      );
    }
    if (kind === 'building' && player.buildingJob && Number(player.buildingJob.remainingTicks) > 0) {
      const buildingJob = player.buildingJob;
      this.queueService.sleepToQueue(
        player, 'building',
        { buildingId: buildingJob.buildingId },
        buildingJob.buildingName ?? '建造',
        reason === 'move' ? '离开建筑' : '被打断',
      );
    }
  }
}
