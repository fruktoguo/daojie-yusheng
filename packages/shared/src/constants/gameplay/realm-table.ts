/**
 * 境界表辅助函数，供前端百科和其他展示场景使用。
 */
import { PLAYER_REALM_CONFIG, PLAYER_REALM_ORDER, PLAYER_REALM_STAGE_LEVEL_RANGES } from './realm';
import type { PlayerRealmStage } from '../../cultivation-types';

/** 境界表行数据（用于百科等展示场景）。 */
export interface RealmTableRow {
  stage: PlayerRealmStage;
  name: string;
  shortName: string;
  levelFrom: number;
  levelTo: number;
  progressToNext: number;
  path: 'martial' | 'immortal' | 'ascended';
}

/** 获取完整境界表（按境界顺序排列）。 */
export function getRealmTable(): RealmTableRow[] {
  return PLAYER_REALM_ORDER.map((stage) => {
    const config = PLAYER_REALM_CONFIG[stage];
    const levelRange = PLAYER_REALM_STAGE_LEVEL_RANGES[stage];
    return {
      stage,
      name: config.name,
      shortName: config.shortName,
      levelFrom: levelRange.levelFrom,
      levelTo: levelRange.levelTo,
      progressToNext: config.progressToNext,
      path: config.path,
    };
  });
}
