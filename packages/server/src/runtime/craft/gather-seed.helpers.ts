import { computeLuckSuccessRateBonus, computePlantSeedDropChance } from '@mud/shared';
import { resolvePlayerEffectiveLuck } from '../player/player-special-stat.helpers';

/** 调用方必须已成功采得一个单位；保留采集库存也不增加抽取次数。 */
export function rollGatherSeed(player: any, container: any, harvestedItemId: string, content: any): any | null {
  const definition = content?.plantingContent?.resolve(container, harvestedItemId);
  if (!definition) return null;
  const probability = computePlantSeedDropChance(computeLuckSuccessRateBonus(resolvePlayerEffectiveLuck(player)));
  if (Math.random() >= probability) return null;
  const seed = content.createItem(definition.seedItemId, 1);
  if (!seed) throw new Error('gather_seed_template_missing');
  return seed;
}
