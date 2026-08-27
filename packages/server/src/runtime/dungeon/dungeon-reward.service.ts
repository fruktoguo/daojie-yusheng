import { Injectable } from '@nestjs/common';
import type { DungeonDefinition, DungeonRunState } from '@mud/shared';
import { PlayerRuntimeService } from '../player/player-runtime.service';

/** 副本通关奖励的幂等边界；具体掉落仍由战斗掉落链路负责。 */
@Injectable()
export class DungeonRewardService {
  private readonly claimed = new Set<string>();

  constructor(private readonly players: PlayerRuntimeService) {}

  claim(run: DungeonRunState, definition: DungeonDefinition): boolean {
    const rewardKey = run.completionId ?? run.runId;
    if (this.claimed.has(rewardKey)) return false;
    for (const member of run.members) {
      for (const reward of definition.rewards.itemRewards ?? []) {
        const count = Math.max(1, Math.trunc(Number(reward.count) || 1));
        this.players.grantItem(member.playerId, reward.itemId, count);
      }
    }
    this.claimed.add(rewardKey);
    return true;
  }
}
