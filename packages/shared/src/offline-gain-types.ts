/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
export type PlayerStatisticScope = 'online' | 'offline';

export type PlayerStatisticSource =
  | 'cultivation'
  | 'combat'
  | 'loot'
  | 'craft'
  | 'market'
  | 'mail'
  | 'quest'
  | 'shop'
  | 'gm'
  | 'redeem'
  | 'system'
  | string;

export interface PlayerStatisticAmountView {
  gained: number;
  lost: number;
  net: number;
}

export interface PlayerStatisticPeriodTotalView {
  spiritStones: PlayerStatisticAmountView;
  progress: PlayerStatisticAmountView;
  techniques: PlayerStatisticAmountView;
  professions: PlayerStatisticAmountView;
}

/** 服务端权威累计总账，客户端只缓存展示。 */
export interface PlayerStatisticTotalsView {
  today: PlayerStatisticPeriodTotalView;
  yesterday: PlayerStatisticPeriodTotalView;
  week: PlayerStatisticPeriodTotalView;
  generatedAt: number;
}

/** 统计记录里的物品收支。灵石会被单独摘出，不放在普通物品列表里。 */
export interface OfflineGainItemView {
  itemId: string;
  name?: string;
  gained: number;
  lost: number;
  net: number;
}

/** 统计记录里的角色成长收支。 */
export interface OfflineGainProgressView {
  kind: 'realmExp' | 'foundation' | 'rootFoundation' | 'combatExp' | 'bodyTrainingExp';
  label: string;
  gained: number;
  lost: number;
  net: number;
  levelGain?: number;
  levelLoss?: number;
  currentLevel?: number;
}

/** 统计记录里的功法经验收支。 */
export interface OfflineGainTechniqueView {
  techniqueId: string;
  name?: string;
  expGained: number;
  expLost: number;
  netExp: number;
  levelGain?: number;
  levelLoss?: number;
  currentLevel?: number;
}

/** 统计记录里的技艺经验收支。 */
export interface OfflineGainProfessionView {
  professionType: 'alchemy' | 'gather' | 'enhancement' | string;
  label: string;
  expGained: number;
  expLost: number;
  netExp: number;
  levelGain?: number;
  levelLoss?: number;
  currentLevel?: number;
}

/** 单次玩家收支统计记录，服务端低频下发，客户端本地归档。 */
export interface OfflineGainReportView {
  id: string;
  playerId?: string;
  scope?: PlayerStatisticScope;
  source?: PlayerStatisticSource;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  generatedAt: number;
  spiritStones?: PlayerStatisticAmountView;
  items: OfflineGainItemView[];
  progress: OfflineGainProgressView[];
  techniques: OfflineGainTechniqueView[];
  professions: OfflineGainProfessionView[];
}

/** 玩家收支统计记录批次。 */
export interface OfflineGainReportsView {
  reports: OfflineGainReportView[];
  totals?: PlayerStatisticTotalsView;
}
