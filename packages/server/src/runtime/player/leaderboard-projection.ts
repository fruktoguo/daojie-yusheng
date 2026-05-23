/**
 * 排行榜纯函数构建模块。
 *
 * 这个模块只包含 8 个 board 的 sort/slice/map 纯函数，可以在主线程或
 * worker_threads 中安全运行（不依赖 NestJS DI、不依赖运行态 service）。
 *
 * 调用方负责把扁平 snapshot 数组传进来；snapshot 由
 * `LeaderboardRuntimeService.createSnapshot` 在主线程预先组装好（因为
 * 那一步依赖 mapTemplateRepository / marketRuntimeService 等 NestJS 单例）。
 */

/** 排行榜扁平 snapshot 形状（调用方组装好后传入）。 */
export interface LeaderboardFlatSnapshot {
  playerId: string;
  playerName: string;
  mapId: string;
  mapName: string;
  x: number;
  y: number;
  online: boolean;
  inWorld: boolean;
  realmLv: number;
  realmName: string;
  realmShortName?: string;
  realmProgress: number;
  foundation: number;
  monsterKillCount: number;
  eliteMonsterKillCount: number;
  bossMonsterKillCount: number;
  spiritStoneCount: number;
  marketStorageSpiritStoneCount: number;
  playerKillCount: number;
  deathCount: number;
  bodyTrainingLevel: number;
  bodyTrainingExp: number;
  bodyTrainingExpToNext: number;
  finalAttrs: Record<string, number>;
  flags: {
    cultivation: boolean;
    combat: boolean;
    alchemy: boolean;
    enhancement: boolean;
  };
}

/** 六维主属性榜单中文标签（与 leaderboard-runtime.service 中保持一致）。 */
export const SUPREME_ATTR_LABELS: Record<string, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  strength: '力道',
  meridians: '经脉',
};

/** 名称比较器（中文 zh-Hans-CN 排序）。 */
export function compareLeaderboardName(left: LeaderboardFlatSnapshot, right: LeaderboardFlatSnapshot): number {
  return left.playerName.localeCompare(right.playerName, 'zh-Hans-CN');
}

/** 构造境界榜。 */
export function buildRealmBoard(snapshots: LeaderboardFlatSnapshot[], limit: number): unknown[] {
  return [...snapshots]
    .sort((left, right) => (right.realmLv - left.realmLv
      || right.realmProgress - left.realmProgress
      || right.bodyTrainingLevel - left.bodyTrainingLevel
      || right.foundation - left.foundation
      || right.bodyTrainingExp - left.bodyTrainingExp
      || compareLeaderboardName(left, right)))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      realmLv: entry.realmLv,
      realmName: entry.realmName,
      realmShortName: entry.realmShortName,
      progress: entry.realmProgress,
      foundation: entry.foundation,
    }));
}

/** 构造击杀榜。 */
export function buildMonsterKillBoard(snapshots: LeaderboardFlatSnapshot[], limit: number): unknown[] {
  return [...snapshots]
    .sort((left, right) => (right.monsterKillCount - left.monsterKillCount
      || right.bossMonsterKillCount - left.bossMonsterKillCount
      || right.eliteMonsterKillCount - left.eliteMonsterKillCount
      || compareLeaderboardName(left, right)))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      totalKills: entry.monsterKillCount,
      eliteKills: entry.eliteMonsterKillCount,
      bossKills: entry.bossMonsterKillCount,
    }));
}

/** 构造灵石持有榜。 */
export function buildSpiritStoneBoard(snapshots: LeaderboardFlatSnapshot[], limit: number): unknown[] {
  return [...snapshots]
    .sort((left, right) => right.spiritStoneCount - left.spiritStoneCount || compareLeaderboardName(left, right))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      spiritStoneCount: entry.spiritStoneCount,
    }));
}

/** 构造玩家击杀榜。 */
export function buildPlayerKillBoard(snapshots: LeaderboardFlatSnapshot[], limit: number): unknown[] {
  return [...snapshots]
    .sort((left, right) => right.playerKillCount - left.playerKillCount || compareLeaderboardName(left, right))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      playerKillCount: entry.playerKillCount,
    }));
}

/** 构造死亡榜。 */
export function buildDeathBoard(snapshots: LeaderboardFlatSnapshot[], limit: number): unknown[] {
  return [...snapshots]
    .sort((left, right) => right.deathCount - left.deathCount || compareLeaderboardName(left, right))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      deathCount: entry.deathCount,
    }));
}

/** 构造体修榜。 */
export function buildBodyTrainingBoard(snapshots: LeaderboardFlatSnapshot[], limit: number): unknown[] {
  return [...snapshots]
    .sort((left, right) => (right.bodyTrainingLevel - left.bodyTrainingLevel
      || right.bodyTrainingExp - left.bodyTrainingExp
      || compareLeaderboardName(left, right)))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      level: entry.bodyTrainingLevel,
      exp: entry.bodyTrainingExp,
      expToNext: entry.bodyTrainingExpToNext,
    }));
}

/** 构造六维最高属性榜。 */
export function buildSupremeAttrBoard(snapshots: LeaderboardFlatSnapshot[]): unknown[] {
  return Object.keys(SUPREME_ATTR_LABELS).map((attr) => {
    const top = [...snapshots].sort((left, right) => (right.finalAttrs[attr] - left.finalAttrs[attr]
      || right.realmLv - left.realmLv
      || compareLeaderboardName(left, right)))[0];
    return {
      attr,
      label: SUPREME_ATTR_LABELS[attr],
      playerId: top?.playerId ?? '',
      playerName: top?.playerName ?? '暂无',
      value: top?.finalAttrs[attr] ?? 0,
    };
  });
}

/**
 * 一次性构建 8 个 board。worker 内调用入口。
 * sects 由调用方在主线程预算好（依赖 NestJS sectService）后透传。
 */
export function buildAllLeaderboards(
  snapshots: LeaderboardFlatSnapshot[],
  sects: unknown[],
  limit: number,
): {
  realm: unknown[];
  monsterKills: unknown[];
  spiritStones: unknown[];
  playerKills: unknown[];
  deaths: unknown[];
  bodyTraining: unknown[];
  supremeAttrs: unknown[];
  sects: unknown[];
} {
  return {
    realm: buildRealmBoard(snapshots, limit),
    monsterKills: buildMonsterKillBoard(snapshots, limit),
    spiritStones: buildSpiritStoneBoard(snapshots, limit),
    playerKills: buildPlayerKillBoard(snapshots, limit),
    deaths: buildDeathBoard(snapshots, limit),
    bodyTraining: buildBodyTrainingBoard(snapshots, limit),
    supremeAttrs: buildSupremeAttrBoard(snapshots),
    sects,
  };
}
