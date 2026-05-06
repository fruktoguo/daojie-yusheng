import { Inject, Injectable } from '@nestjs/common';

import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';

interface CraftPlayerLike {
  gatherJob?: {
    remainingTicks?: number;
  } | null;
  buildingJob?: {
    remainingTicks?: number;
  } | null;
}

interface CraftPanelRuntimePort<TPlayer = CraftPlayerLike> {
  listActiveTechniqueActivityKinds(player: TPlayer): Iterable<string>;
  interruptTechniqueActivity(player: TPlayer, kind: string, reason: string): unknown;
}

interface CraftMutationPort {
  flushCraftMutation(playerId: string, mutation: unknown, kind: string, deps: unknown): void;
}

interface CraftInterruptDeps<TPlayer = CraftPlayerLike> {
  worldRuntimeLootContainerService: {
    interruptGather(playerId: string, player: TPlayer, reason: string, deps: CraftInterruptDeps<TPlayer>): unknown;
  };
  interruptBuildingConstruction?: (playerId: string, reason: string) => void;
}

@Injectable()
export class WorldRuntimeCraftInterruptService {
  constructor(
    @Inject(CraftPanelRuntimeService)
    private readonly craftPanelRuntimeService: CraftPanelRuntimePort,
    @Inject(WorldRuntimeCraftMutationService)
    private readonly worldRuntimeCraftMutationService: CraftMutationPort,
  ) {}

  interruptCraftForReason(
    playerId: string,
    player: CraftPlayerLike,
    reason: string,
    deps: CraftInterruptDeps,
  ): void {
    for (const kind of this.craftPanelRuntimeService.listActiveTechniqueActivityKinds(player)) {
      this.worldRuntimeCraftMutationService.flushCraftMutation(
        playerId,
        this.craftPanelRuntimeService.interruptTechniqueActivity(player, kind, reason),
        kind,
        deps,
      );
    }
    if (player.gatherJob && Number(player.gatherJob.remainingTicks) > 0) {
      this.worldRuntimeCraftMutationService.flushCraftMutation(
        playerId,
        deps.worldRuntimeLootContainerService.interruptGather(playerId, player, reason, deps),
        'gather',
        deps,
      );
    }
    if (player.buildingJob && Number(player.buildingJob.remainingTicks) > 0) {
      deps.interruptBuildingConstruction?.(playerId, reason);
    }
  }
}
