import type { CombatReactionRegistry } from '../../combat-reaction-registry';
import { registerPlayerHeavenlyDevourReaction } from './heavenly-devour.reaction';
import { registerPlayerHeavenlyDeathImmunityReaction } from './heavenly-death-immunity.reaction';
import { registerPlayerLowHpReaction } from './low-hp.reaction';

/** 玩家战斗反应唯一注册入口；顺序即 beforeDamage 的执行顺序。 */
export function registerPlayerCombatReactions(registry: CombatReactionRegistry<unknown>): void {
 registerPlayerHeavenlyDevourReaction(registry);
 registerPlayerHeavenlyDeathImmunityReaction(registry);
 registerPlayerLowHpReaction(registry);
}
