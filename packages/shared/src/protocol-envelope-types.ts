import type { PlayerRealmState } from './cultivation-types';
import type {
  LeaderboardBodyTrainingEntry,
  LeaderboardDeathEntry,
  LeaderboardMonsterKillEntry,
  LeaderboardPlayerKillEntry,
  LeaderboardRealmEntry,
  LeaderboardSpiritStoneEntry,
  LeaderboardSupremeAttrEntry,
  LeaderboardWorldSummary,
} from './leaderboard-types';

/** 境界低频同步视图。 */
export interface RealmUpdateView {
/**
 * realm：RealmUpdateView 内部字段。
 */

  realm: PlayerRealmState | null;
}

/** 排行榜同步视图。 */
export interface LeaderboardView {
/**
 * generatedAt：LeaderboardView 内部字段。
 */

  generatedAt: number;  
  /**
 * limit：LeaderboardView 内部字段。
 */

  limit: number;  
  /**
 * boards：LeaderboardView 内部字段。
 */

  boards: {  
  /**
 * realm：LeaderboardView 内部字段。
 */

    realm: LeaderboardRealmEntry[];    
    /**
 * monsterKills：LeaderboardView 内部字段。
 */

    monsterKills: LeaderboardMonsterKillEntry[];    
    /**
 * spiritStones：LeaderboardView 内部字段。
 */

    spiritStones: LeaderboardSpiritStoneEntry[];    
    /**
 * playerKills：LeaderboardView 内部字段。
 */

    playerKills: LeaderboardPlayerKillEntry[];    
    /**
 * deaths：LeaderboardView 内部字段。
 */

    deaths: LeaderboardDeathEntry[];    
    /**
 * bodyTraining：LeaderboardView 内部字段。
 */

    bodyTraining: LeaderboardBodyTrainingEntry[];    
    /**
 * supremeAttrs：LeaderboardView 内部字段。
 */

    supremeAttrs: LeaderboardSupremeAttrEntry[];
  };
}

/** 世界概览同步视图。 */
export interface WorldSummaryView {
/**
 * generatedAt：WorldSummaryView 内部字段。
 */

  generatedAt: number;  
  /**
 * summary：WorldSummaryView 内部字段。
 */

  summary: LeaderboardWorldSummary;
}
