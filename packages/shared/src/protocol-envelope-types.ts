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
  realm: PlayerRealmState | null;
}

/** 排行榜同步视图。 */
export interface LeaderboardView {
  generatedAt: number;
  limit: number;
  boards: {
    realm: LeaderboardRealmEntry[];
    monsterKills: LeaderboardMonsterKillEntry[];
    spiritStones: LeaderboardSpiritStoneEntry[];
    playerKills: LeaderboardPlayerKillEntry[];
    deaths: LeaderboardDeathEntry[];
    bodyTraining: LeaderboardBodyTrainingEntry[];
    supremeAttrs: LeaderboardSupremeAttrEntry[];
  };
}

/** 世界概览同步视图。 */
export interface WorldSummaryView {
  generatedAt: number;
  summary: LeaderboardWorldSummary;
}
