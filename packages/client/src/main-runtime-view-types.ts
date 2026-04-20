import type { MonsterTier, PlayerState, RenderEntity } from '@mud/shared-next';
/**
 * MainRuntimeObservedEntity：统一结构类型，保证协议与运行时一致性。
 */


export type MainRuntimeObservedEntity = {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * wx：wx相关字段。
 */

  wx: number;  
  /**
 * wy：wy相关字段。
 */

  wy: number;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * badge：badge相关字段。
 */

  badge?: RenderEntity['badge'];  
  /**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: string;  
  /**
 * monsterScale：怪物Scale相关字段。
 */

  monsterScale?: number;  
  /**
 * monsterTier：怪物Tier相关字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * maxQi：maxQi相关字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

  npcQuestMarker?: RenderEntity['npcQuestMarker'];  
  /**
 * observation：observation相关字段。
 */

  observation?: RenderEntity['observation'];  
  /**
 * hostile：hostile相关字段。
 */

  hostile?: boolean;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: PlayerState['temporaryBuffs'];
};
/**
 * isCrowdEntityKind：判断CrowdEntityKind是否满足条件。
 * @param kind string | null | undefined 参数说明。
 * @returns 返回是否满足CrowdEntityKind条件。
 */


export function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}
/**
 * isPlayerLikeEntityKind：判断玩家LikeEntityKind是否满足条件。
 * @param kind string | null | undefined 参数说明。
 * @returns 返回是否满足玩家LikeEntityKind条件。
 */


export function isPlayerLikeEntityKind(kind: string | null | undefined): boolean {
  return kind === 'player' || isCrowdEntityKind(kind);
}
