import type { CombatReactionRegistry } from '../../combat-reaction-registry';
import type { FivePhaseDevourReactionHost } from './fivephase-devour.reaction';
import { registerFivePhaseDevourReaction } from './fivephase-devour.reaction';

/** 怪物战斗反应唯一注册入口。 */
export function registerMonsterCombatReactions(
 registry: CombatReactionRegistry<unknown>,
 host: FivePhaseDevourReactionHost,
): void {
 registerFivePhaseDevourReaction(registry, host);
}
