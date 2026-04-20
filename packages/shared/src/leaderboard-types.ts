/**
 * 低频排行榜与世界汇总投影视图，供协议层和消费端共用。
 */

/** 排行榜通用玩家条目。 */
export interface LeaderboardPlayerEntry {
/**
 * rank：LeaderboardPlayerEntry 内部字段。
 */

  rank: number;  
  /**
 * playerId：LeaderboardPlayerEntry 内部字段。
 */

  playerId: string;  
  /**
 * playerName：LeaderboardPlayerEntry 内部字段。
 */

  playerName: string;
}

/** 境界排行榜条目。 */
export interface LeaderboardRealmEntry extends LeaderboardPlayerEntry {
/**
 * realmLv：LeaderboardRealmEntry 内部字段。
 */

  realmLv: number;  
  /**
 * realmName：LeaderboardRealmEntry 内部字段。
 */

  realmName: string;  
  /**
 * realmShortName：LeaderboardRealmEntry 内部字段。
 */

  realmShortName?: string;  
  /**
 * progress：LeaderboardRealmEntry 内部字段。
 */

  progress: number;  
  /**
 * foundation：LeaderboardRealmEntry 内部字段。
 */

  foundation: number;
}

/** 击杀怪物排行榜条目。 */
export interface LeaderboardMonsterKillEntry extends LeaderboardPlayerEntry {
/**
 * totalKills：LeaderboardMonsterKillEntry 内部字段。
 */

  totalKills: number;  
  /**
 * eliteKills：LeaderboardMonsterKillEntry 内部字段。
 */

  eliteKills: number;  
  /**
 * bossKills：LeaderboardMonsterKillEntry 内部字段。
 */

  bossKills: number;
}

/** 灵石榜条目。 */
export interface LeaderboardSpiritStoneEntry extends LeaderboardPlayerEntry {
/**
 * spiritStoneCount：LeaderboardSpiritStoneEntry 内部字段。
 */

  spiritStoneCount: number;
}

/** 玩家击杀榜条目。 */
export interface LeaderboardPlayerKillEntry extends LeaderboardPlayerEntry {
/**
 * playerKillCount：LeaderboardPlayerKillEntry 内部字段。
 */

  playerKillCount: number;
}

/** 死亡榜条目。 */
export interface LeaderboardDeathEntry extends LeaderboardPlayerEntry {
/**
 * deathCount：LeaderboardDeathEntry 内部字段。
 */

  deathCount: number;
}

/** 体修榜条目。 */
export interface LeaderboardBodyTrainingEntry extends LeaderboardPlayerEntry {
/**
 * level：LeaderboardBodyTrainingEntry 内部字段。
 */

  level: number;  
  /**
 * exp：LeaderboardBodyTrainingEntry 内部字段。
 */

  exp: number;  
  /**
 * expToNext：LeaderboardBodyTrainingEntry 内部字段。
 */

  expToNext: number;
}

/** 四项至尊属性榜条目。 */
export interface LeaderboardSupremeAttrEntry {
/**
 * attr：LeaderboardSupremeAttrEntry 内部字段。
 */

  attr: 'constitution' | 'spirit' | 'perception' | 'talent';  
  /**
 * label：LeaderboardSupremeAttrEntry 内部字段。
 */

  label: string;  
  /**
 * playerId：LeaderboardSupremeAttrEntry 内部字段。
 */

  playerId: string;  
  /**
 * playerName：LeaderboardSupremeAttrEntry 内部字段。
 */

  playerName: string;  
  /**
 * value：LeaderboardSupremeAttrEntry 内部字段。
 */

  value: number;
}

/** 世界活跃行为统计。 */
export interface LeaderboardWorldActionCounts {
/**
 * cultivation：LeaderboardWorldActionCounts 内部字段。
 */

  cultivation: number;  
  /**
 * combat：LeaderboardWorldActionCounts 内部字段。
 */

  combat: number;  
  /**
 * alchemy：LeaderboardWorldActionCounts 内部字段。
 */

  alchemy: number;  
  /**
 * enhancement：LeaderboardWorldActionCounts 内部字段。
 */

  enhancement: number;
}

/** 世界境界分布统计。 */
export interface LeaderboardWorldRealmCounts {
/**
 * initial：LeaderboardWorldRealmCounts 内部字段。
 */

  initial: number;  
  /**
 * mortal：LeaderboardWorldRealmCounts 内部字段。
 */

  mortal: number;  
  /**
 * qiRefiningOrAbove：LeaderboardWorldRealmCounts 内部字段。
 */

  qiRefiningOrAbove: number;
}

/** 世界击杀与死亡统计。 */
export interface LeaderboardWorldKillCounts {
/**
 * normalMonsters：LeaderboardWorldKillCounts 内部字段。
 */

  normalMonsters: number;  
  /**
 * eliteMonsters：LeaderboardWorldKillCounts 内部字段。
 */

  eliteMonsters: number;  
  /**
 * bossMonsters：LeaderboardWorldKillCounts 内部字段。
 */

  bossMonsters: number;  
  /**
 * playerKills：LeaderboardWorldKillCounts 内部字段。
 */

  playerKills: number;  
  /**
 * playerDeaths：LeaderboardWorldKillCounts 内部字段。
 */

  playerDeaths: number;
}

/** 世界概览统计摘要。 */
export interface LeaderboardWorldSummary {
/**
 * totalSpiritStones：LeaderboardWorldSummary 内部字段。
 */

  totalSpiritStones: number;  
  /**
 * actionCounts：LeaderboardWorldSummary 内部字段。
 */

  actionCounts: LeaderboardWorldActionCounts;  
  /**
 * realmCounts：LeaderboardWorldSummary 内部字段。
 */

  realmCounts: LeaderboardWorldRealmCounts;  
  /**
 * killCounts：LeaderboardWorldSummary 内部字段。
 */

  killCounts: LeaderboardWorldKillCounts;
}
