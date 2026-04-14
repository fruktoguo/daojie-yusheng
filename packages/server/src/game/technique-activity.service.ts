import { Injectable } from '@nestjs/common';
import { PlayerState, VisibleBuffState } from '@mud/shared';
import { AlchemyMutationResult, AlchemyService } from './alchemy.service';
import { EnhancementMutationResult, EnhancementService } from './enhancement.service';
import { LootService } from './loot.service';

export type TechniqueActivityKind = 'alchemy' | 'enhancement' | 'gather';
export type TechniqueActivityInterruptReason = 'move' | 'attack';

export interface TechniqueActivityDescriptor {
  kind: TechniqueActivityKind;
  buff: VisibleBuffState;
}

export type TechniqueActivityInterruptEffect =
  | { kind: 'alchemy'; result: AlchemyMutationResult }
  | { kind: 'enhancement'; result: EnhancementMutationResult }
  | { kind: 'gather'; dirtyPlayers: string[] };

@Injectable()
export class TechniqueActivityService {
  constructor(
    private readonly alchemyService: AlchemyService,
    private readonly enhancementService: EnhancementService,
    private readonly lootService: LootService,
  ) {}

  describePlayerActivities(player: PlayerState): TechniqueActivityDescriptor[] {
/** activities：定义该变量以承载业务值。 */
    const activities: TechniqueActivityDescriptor[] = [];
/** alchemyBuff：定义该变量以承载业务值。 */
    const alchemyBuff = this.alchemyService.buildVisibleAlchemyBuff(player);
    if (alchemyBuff) {
      activities.push({ kind: 'alchemy', buff: alchemyBuff });
    }
/** gatherBuff：定义该变量以承载业务值。 */
    const gatherBuff = this.lootService.buildVisibleGatherBuff(player);
    if (gatherBuff) {
      activities.push({ kind: 'gather', buff: gatherBuff });
    }
/** enhancementBuff：定义该变量以承载业务值。 */
    const enhancementBuff = this.enhancementService.buildVisibleEnhancementBuff(player);
    if (enhancementBuff) {
      activities.push({ kind: 'enhancement', buff: enhancementBuff });
    }
    return activities;
  }

  buildVisibleBuffs(player: PlayerState): VisibleBuffState[] {
    return this.describePlayerActivities(player).map((entry) => entry.buff);
  }

  hasActiveActivity(player: PlayerState): boolean {
    return this.describePlayerActivities(player).length > 0;
  }

  buildCultivationBlockedMessage(player: PlayerState): string | null {
/** activityNames：定义该变量以承载业务值。 */
    const activityNames = this.describePlayerActivities(player).map((entry) => entry.buff.name);
    if (activityNames.length === 0) {
      return null;
    }
/** label：定义该变量以承载业务值。 */
    const label = activityNames.join('、');
    return `${label}进行中，无法进入修炼。`;
  }

  interruptActivities(player: PlayerState, reason: TechniqueActivityInterruptReason): TechniqueActivityInterruptEffect[] {
/** effects：定义该变量以承载业务值。 */
    const effects: TechniqueActivityInterruptEffect[] = [];
    if (this.alchemyService.hasActiveAlchemyJob(player)) {
      effects.push({
        kind: 'alchemy',
        result: this.alchemyService.interruptAlchemy(player, reason),
      });
    }
    if (this.enhancementService.hasActiveEnhancementJob(player)) {
      effects.push({
        kind: 'enhancement',
        result: this.enhancementService.interruptEnhancement(player, reason),
      });
    }
    if (this.lootService.hasActiveHarvest(player.id)) {
/** dirtyPlayers：定义该变量以承载业务值。 */
      const dirtyPlayers = this.lootService.stopActiveHarvest(player.id);
      if (dirtyPlayers.length > 0) {
        effects.push({ kind: 'gather', dirtyPlayers });
      }
    }
    return effects;
  }
}
