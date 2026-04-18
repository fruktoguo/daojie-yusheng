/**
 * 低频排行榜与世界汇总投影视图，供协议层和消费端共用。
 */

/** 排行榜通用玩家条目。 */
export interface LeaderboardPlayerEntry {
  rank: number;
  playerId: string;
  playerName: string;
}

/** 境界排行榜条目。 */
export interface LeaderboardRealmEntry extends LeaderboardPlayerEntry {
  realmLv: number;
  realmName: string;
  realmShortName?: string;
  progress: number;
  foundation: number;
}

/** 击杀怪物排行榜条目。 */
export interface LeaderboardMonsterKillEntry extends LeaderboardPlayerEntry {
  totalKills: number;
  eliteKills: number;
  bossKills: number;
}

/** 灵石榜条目。 */
export interface LeaderboardSpiritStoneEntry extends LeaderboardPlayerEntry {
  spiritStoneCount: number;
}

/** 玩家击杀榜条目。 */
export interface LeaderboardPlayerKillEntry extends LeaderboardPlayerEntry {
  playerKillCount: number;
}

/** 死亡榜条目。 */
export interface LeaderboardDeathEntry extends LeaderboardPlayerEntry {
  deathCount: number;
}

/** 体修榜条目。 */
export interface LeaderboardBodyTrainingEntry extends LeaderboardPlayerEntry {
  level: number;
  exp: number;
  expToNext: number;
}

/** 四项至尊属性榜条目。 */
export interface LeaderboardSupremeAttrEntry {
  attr: 'constitution' | 'spirit' | 'perception' | 'talent';
  label: string;
  playerId: string;
  playerName: string;
  value: number;
}

/** 世界活跃行为统计。 */
export interface LeaderboardWorldActionCounts {
  cultivation: number;
  combat: number;
  alchemy: number;
  enhancement: number;
}

/** 世界境界分布统计。 */
export interface LeaderboardWorldRealmCounts {
  initial: number;
  mortal: number;
  qiRefiningOrAbove: number;
}

/** 世界击杀与死亡统计。 */
export interface LeaderboardWorldKillCounts {
  normalMonsters: number;
  eliteMonsters: number;
  bossMonsters: number;
  playerKills: number;
  playerDeaths: number;
}

/** 世界概览统计摘要。 */
export interface LeaderboardWorldSummary {
  totalSpiritStones: number;
  actionCounts: LeaderboardWorldActionCounts;
  realmCounts: LeaderboardWorldRealmCounts;
  killCounts: LeaderboardWorldKillCounts;
}
