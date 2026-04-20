import type { MonsterTier, PlayerState, RenderEntity } from '@mud/shared-next';
/**
 * MainRuntimeObservedEntity：统一结构类型，保证协议与运行时一致性。
 */


export type MainRuntimeObservedEntity = {
/**
 * id：对象字段。
 */

  id: string;  
  /**
 * wx：对象字段。
 */

  wx: number;  
  /**
 * wy：对象字段。
 */

  wy: number;  
  /**
 * char：对象字段。
 */

  char: string;  
  /**
 * color：对象字段。
 */

  color: string;  
  /**
 * name：对象字段。
 */

  name?: string;  
  /**
 * kind：对象字段。
 */

  kind?: string;  
  /**
 * monsterTier：对象字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * hp：对象字段。
 */

  hp?: number;  
  /**
 * maxHp：对象字段。
 */

  maxHp?: number;  
  /**
 * qi：对象字段。
 */

  qi?: number;  
  /**
 * maxQi：对象字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：对象字段。
 */

  npcQuestMarker?: RenderEntity['npcQuestMarker'];  
  /**
 * observation：对象字段。
 */

  observation?: RenderEntity['observation'];  
  /**
 * buffs：对象字段。
 */

  buffs?: PlayerState['temporaryBuffs'];
};
/**
 * isCrowdEntityKind：执行状态校验并返回判断结果。
 * @param kind string | null | undefined 参数说明。
 * @returns boolean。
 */


export function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}
/**
 * isPlayerLikeEntityKind：执行状态校验并返回判断结果。
 * @param kind string | null | undefined 参数说明。
 * @returns boolean。
 */


export function isPlayerLikeEntityKind(kind: string | null | undefined): boolean {
  return kind === 'player' || isCrowdEntityKind(kind);
}
