import type { FormationLifecycle, FormationRangeShape, MonsterTier, PlayerState, RenderEntity } from '@mud/shared';
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
 * respawnRemainingTicks：回生/重生剩余 tick。
 */

  respawnRemainingTicks?: number;
  /**
 * respawnTotalTicks：回生/重生总 tick。
 */

  respawnTotalTicks?: number;
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
  /** 阵法影响半径。 */
  formationRadius?: number;
  /** 阵法范围形状。 */
  formationRangeShape?: FormationRangeShape;
  /** 感气时使用的阵法范围高亮颜色。 */
  formationRangeHighlightColor?: string;
  /** 阵法边界专用字符。 */
  formationBoundaryChar?: string;
  /** 阵法边界专用颜色。 */
  formationBoundaryColor?: string;
  /** 阵法边界专用范围高亮色。 */
  formationBoundaryRangeHighlightColor?: string;
  /** 阵眼是否无需感气即可直接看见。 */
  formationEyeVisibleWithoutSenseQi?: boolean;
  /** 阵法范围是否无需感气即可直接看见。 */
  formationRangeVisibleWithoutSenseQi?: boolean;
  /** 阵法边界是否无需感气即可直接看见。 */
  formationBoundaryVisibleWithoutSenseQi?: boolean;
  /** 阵法实体是否显示名称文本。 */
  formationShowText?: boolean;
  /** 阵法边界是否阻挡通行。 */
  formationBlocksBoundary?: boolean;
  /** 阵法所属宗门 ID。 */
  formationOwnerSectId?: string | null;
  /** 阵法所属玩家 ID。 */
  formationOwnerPlayerId?: string | null;
  /** 阵法是否处于开启状态。 */
  formationActive?: boolean;
  /** 阵法生命周期。 */
  formationLifecycle?: FormationLifecycle;
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
