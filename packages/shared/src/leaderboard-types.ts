/**
 * 低频排行榜与世界汇总投影视图，供协议层和消费端共用。
 */

/** 排行榜通用玩家条目。 */
export interface LeaderboardPlayerEntry {
/**
 * rank：rank相关字段。
 */

  rank: number;  
  /**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName: string;
}

/** 境界排行榜条目。 */
export interface LeaderboardRealmEntry extends LeaderboardPlayerEntry {
/**
 * realmLv：realmLv相关字段。
 */

  realmLv: number;  
  /**
 * realmName：realm名称名称或显示文本。
 */

  realmName: string;  
  /**
 * realmShortName：realmShort名称名称或显示文本。
 */

  realmShortName?: string;  
  /**
 * progress：进度状态或数据块。
 */

  progress: number;  
  /**
 * foundation：foundation相关字段。
 */

  foundation: number;
}

/** 击杀怪物排行榜条目。 */
export interface LeaderboardMonsterKillEntry extends LeaderboardPlayerEntry {
/**
 * totalKills：totalKill相关字段。
 */

  totalKills: number;  
  /**
 * eliteKills：eliteKill相关字段。
 */

  eliteKills: number;  
  /**
 * bossKills：bossKill相关字段。
 */

  bossKills: number;
}

/** 灵石榜条目。 */
export interface LeaderboardSpiritStoneEntry extends LeaderboardPlayerEntry {
/**
 * spiritStoneCount：数量或计量字段。
 */

  spiritStoneCount: number;
}

/** 玩家击杀榜条目。 */
export interface LeaderboardPlayerKillEntry extends LeaderboardPlayerEntry {
/**
 * playerKillCount：数量或计量字段。
 */

  playerKillCount: number;
}

/** 死亡榜条目。 */
export interface LeaderboardDeathEntry extends LeaderboardPlayerEntry {
/**
 * deathCount：数量或计量字段。
 */

  deathCount: number;
}

/** 体修榜条目。 */
export interface LeaderboardBodyTrainingEntry extends LeaderboardPlayerEntry {
/**
 * level：等级数值。
 */

  level: number;  
  /**
 * exp：exp相关字段。
 */

  exp: number;  
  /**
 * expToNext：expToNext相关字段。
 */

  expToNext: number;
}

/** 四项至尊属性榜条目。 */
export interface LeaderboardSupremeAttrEntry {
/**
 * attr：attr相关字段。
 */

  attr: 'constitution' | 'spirit' | 'perception' | 'talent';  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName: string;  
  /**
 * value：值数值。
 */

  value: number;
}

/** 世界活跃行为统计。 */
export interface LeaderboardWorldActionCounts {
/**
 * cultivation：cultivation相关字段。
 */

  cultivation: number;  
  /**
 * combat：战斗相关字段。
 */

  combat: number;  
  /**
 * alchemy：炼丹相关字段。
 */

  alchemy: number;  
  /**
 * enhancement：强化相关字段。
 */

  enhancement: number;
}

/** 世界境界分布统计。 */
export interface LeaderboardWorldRealmCounts {
/**
 * initial：initial相关字段。
 */

  initial: number;  
  /**
 * mortal：mortal相关字段。
 */

  mortal: number;  
  /**
 * qiRefiningOrAbove：qiRefiningOrAbove相关字段。
 */

  qiRefiningOrAbove: number;
}

/** 世界击杀与死亡统计。 */
export interface LeaderboardWorldKillCounts {
/**
 * normalMonsters：集合字段。
 */

  normalMonsters: number;  
  /**
 * eliteMonsters：集合字段。
 */

  eliteMonsters: number;  
  /**
 * bossMonsters：集合字段。
 */

  bossMonsters: number;  
  /**
 * playerKills：玩家Kill相关字段。
 */

  playerKills: number;  
  /**
 * playerDeaths：玩家Death相关字段。
 */

  playerDeaths: number;
}

/** 世界概览统计摘要。 */
export interface LeaderboardWorldSummary {
/**
 * totalSpiritStones：totalSpiritStone相关字段。
 */

  totalSpiritStones: number;  
  /**
 * actionCounts：action数量相关字段。
 */

  actionCounts: LeaderboardWorldActionCounts;  
  /**
 * realmCounts：realm数量相关字段。
 */

  realmCounts: LeaderboardWorldRealmCounts;  
  /**
 * killCounts：kill数量相关字段。
 */

  killCounts: LeaderboardWorldKillCounts;
}
