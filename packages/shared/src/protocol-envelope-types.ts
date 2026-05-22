/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import type { PlayerRealmState } from './cultivation-types';
import type {
  LeaderboardBodyTrainingEntry,
  LeaderboardDeathEntry,
  LeaderboardMonsterKillEntry,
  LeaderboardPlayerKillEntry,
  LeaderboardPlayerLocationEntry,
  LeaderboardRealmEntry,
  LeaderboardSectEntry,
  LeaderboardSpiritStoneEntry,
  LeaderboardSupremeAttrEntry,
  LeaderboardWorldSummary,
} from './leaderboard-types';

/** 境界低频同步视图。 */
export interface RealmUpdateView {
/**
 * realm：realm相关字段。
 */

  realm: PlayerRealmState | null;
}

/** 排行榜同步视图。 */
export interface LeaderboardView {
/**
 * generatedAt：generatedAt相关字段。
 */

  generatedAt: number;  
  /**
 * limit：limit相关字段。
 */

  limit: number;  
  /**
 * boards：board相关字段。
 */

  boards: {  
  /**
 * realm：realm相关字段。
 */

    realm: LeaderboardRealmEntry[];    
    /**
 * monsterKills：怪物Kill相关字段。
 */

    monsterKills: LeaderboardMonsterKillEntry[];    
    /**
 * spiritStones：spiritStone相关字段。
 */

    spiritStones: LeaderboardSpiritStoneEntry[];    
    /**
 * playerKills：玩家Kill相关字段。
 */

    playerKills: LeaderboardPlayerKillEntry[];    
    /**
 * deaths：death相关字段。
 */

    deaths: LeaderboardDeathEntry[];    
    /**
 * bodyTraining：bodyTraining相关字段。
 */

    bodyTraining: LeaderboardBodyTrainingEntry[];
    /**
 * supremeAttrs：supremeAttr相关字段。
 */

    supremeAttrs: LeaderboardSupremeAttrEntry[];
    /**
 * sects：宗门排行榜字段。
 */

    sects: LeaderboardSectEntry[];
  };
}

/** 世界概览同步视图。 */
export interface WorldSummaryView {
/**
 * generatedAt：generatedAt相关字段。
 */

  generatedAt: number;  
  /**
 * summary：摘要状态或数据块。
 */

  summary: LeaderboardWorldSummary;
}

/** 玩家击杀榜坐标追索同步视图。 */
export interface LeaderboardPlayerLocationsView {
/**
 * entries：entries相关字段。
 */

  entries: LeaderboardPlayerLocationEntry[];
}
