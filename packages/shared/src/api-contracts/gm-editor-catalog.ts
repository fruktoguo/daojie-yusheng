/**
 * GM 编辑器目录与玩家操作领域契约。
 *
 * 包含 GM 玩家详情响应、编辑器功法/物品/境界/Buff/任务候选项与目录响应、
 * 玩家更新快照/请求/分段、玩家属性设置请求、机器人生成/移除请求、
 * 快捷操作请求/响应以及数据兼容转换模式/样本/执行结果。
 */

import type { AttrKey } from '../attribute-types';
import type { QuestState } from '../quest-types';
import type { TechniqueCategory, TechniqueGrade, TechniqueLayerDef, TechniqueLayerGains } from '../cultivation-types';
import type { ConsumableBuffDef, EquipmentEffectDef, EquipSlot, ItemStack, ItemType, TileResourceGainDef } from '../item-runtime-types';
import type { CraftEffectStatsPatch } from '../craft-effect-stats';
import type { PlayerState } from '../player-runtime-types';
import type { SkillDef, TemporaryBuffState } from '../skill-types';
import type { GmManagedPlayerRecord } from './gm-player-management';
/** GM 玩家详情响应。 */
export interface GmPlayerDetailRes {
/**
 * player：玩家引用。
 */

  player: GmManagedPlayerRecord;
}

/** GM 编辑器里的功法候选项。 */
export interface GmEditorTechniqueOption {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * desc：描述文本。
 */

  desc?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * category：category相关字段。
 */

  category?: TechniqueCategory;
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv?: number;
  /**
 * attrRatio：量化功法六维分配权重。
 */

  attrRatio?: Partial<Record<AttrKey, number>>;
  /**
 * attrFloat：量化功法总属性浮动。
 */

  attrFloat?: number;
  /**
 * budgetPercent：服务端生成时确定的总预算百分比。
 */

  budgetPercent?: number;
  /**
 * totalBudget：服务端生成时确定的总预算快照。
 */

  totalBudget?: number;
  /**
 * maxLayer：量化功法总层数。
 */

  maxLayer?: number;
  /**
 * expDifficulty：量化功法经验难度。
 */

  expDifficulty?: number;
  /**
 * layerGains：量化功法逐层增量配置。
 */

  layerGains?: TechniqueLayerGains;
  /**
 * skills：技能相关字段。
 */

  skills?: SkillDef[];
  /**
 * layers：层相关字段。
 */

  layers?: TechniqueLayerDef[];
}

/** GM 编辑器里的物品候选项。 */
export interface GmEditorItemOption {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * type：type相关字段。
 */

  type: ItemType;
  /**
 * groundLabel：groundLabel名称或显示文本。
 */

  groundLabel?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * materialCategory：材料主分类。
 */

  materialCategory?: ItemStack['materialCategory'];
  /**
 * materialValues：材料属性值。
 */

  materialValues?: ItemStack['materialValues'];
  /**
 * equipSlot：equipSlot相关字段。
 */

  equipSlot?: EquipSlot;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * equipAttrs：equipAttr相关字段。
 */

  equipAttrs?: ItemStack['equipAttrs'];
  /**
 * equipStats：equipStat相关字段。
 */

  equipStats?: ItemStack['equipStats'];
  /**
 * equipValueStats：equip值Stat相关字段。
 */

  equipValueStats?: ItemStack['equipValueStats'];
  /**
 * equipSpecialStats：装备提供的悟性、幸运等特殊属性。
 */

  equipSpecialStats?: ItemStack['equipSpecialStats'];
  /**
 * tags：tag相关字段。
 */

  tags?: string[];
  /**
 * contextActions：装备后暴露到交互列表的动作。
 */

  contextActions?: ItemStack['contextActions'];
  /**
 * effects：effect相关字段。
 */

  effects?: EquipmentEffectDef[];
  /**
 * artifactMaxQiFactor：法宝最大灵气系数。
 */

  artifactMaxQiFactor?: ItemStack['artifactMaxQiFactor'];
  /**
 * artifactEffects：法宝特效定义。
 */

  artifactEffects?: ItemStack['artifactEffects'];
  /**
 * healAmount：数量或计量字段。
 */

  healAmount?: number;
  /**
 * healPercent：healPercent相关字段。
 */

  healPercent?: number;
  /**
 * baselineHealPercent：按物品 level 对应标准玩家最大生命的比例恢复。
 */

  baselineHealPercent?: number;
  /**
 * baselineQiPercent：按物品 level 对应标准玩家最大灵力的比例恢复。
 */

  baselineQiPercent?: number;
  /**
 * qiPercent：qiPercent相关字段。
 */

  qiPercent?: number;
  /** 使用后恢复的副本体力点数。 */
  staminaAmount?: number;
  /**
 * cooldown：冷却相关字段。
 */

  cooldown?: number;
  /** 是否允许进入交易行目录并参与坊市流通，缺省为允许。 */
  marketTradable?: boolean;
  /**
 * consumeBuffs：consumeBuff相关字段。
 */

  consumeBuffs?: ConsumableBuffDef[];
  /**
 * enhanceLevel：enhance等级数值。
 */

  enhanceLevel?: number;
  /**
 * craftEffectStats：技艺效果属性。
 */

  craftEffectStats?: CraftEffectStatsPatch;
  /**
 * mapUnlockId：地图UnlockID标识。
 */

  mapUnlockId?: string;
  /**
 * mapUnlockIds：地图UnlockID相关字段。
 */

  mapUnlockIds?: string[];
  /**
 * respawnBindMapId：使用后绑定的复活地图 ID。
 */

  respawnBindMapId?: string;
  /**
 * tileAuraGainAmount：数量或计量字段。
 */

  tileAuraGainAmount?: number;
  /**
 * tileResourceGains：集合字段。
 */

  tileResourceGains?: TileResourceGainDef[];
  /**
 * useBehavior：特殊使用行为。
 */

  useBehavior?: ItemStack['useBehavior'];
  /**
   * spiritualRootSeedTier：灵根幼苗品阶。
   */

  spiritualRootSeedTier?: ItemStack['spiritualRootSeedTier'];
  /**
   * allowBatchUse：allowBatchUse相关字段。
   */

  allowBatchUse?: boolean;
  /** 通用功法书指定的功法 ID。 */
  learnTechniqueId?: ItemStack['learnTechniqueId'];
  /** 通用功法书指定可领悟到的最高层数。 */
  learnTechniqueMaxLevel?: ItemStack['learnTechniqueMaxLevel'];
}

/** GM 编辑器里的境界候选项。 */
export interface GmEditorRealmOption {
/**
 * realmLv：realmLv相关字段。
 */

  realmLv: number;
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * phaseName：phase名称名称或显示文本。
 */

  phaseName?: string;
  /**
 * expToNext：当前等级升级所需修为。
 */

  expToNext?: number;
  /**
 * runtimeExpToNext：运行时已展开的升级所需修为。
 */

  runtimeExpToNext?: number;
  /**
 * review：review相关字段。
 */

  review?: string;
}

/** GM 编辑器里的 Buff 候选项。 */
export interface GmEditorBuffOption extends TemporaryBuffState {}

/** 客户端本地任务模板候选项。 */
export interface GmEditorQuestOption extends QuestState {}

/** GM 编辑器目录响应。 */
export interface GmEditorCatalogRes {
/**
 * techniques：功法相关字段。
 */

  techniques: GmEditorTechniqueOption[];
  /**
 * items：集合字段。
 */

  items: GmEditorItemOption[];
  /**
 * realmLevels：realm等级相关字段。
 */

  realmLevels: GmEditorRealmOption[];
  /**
 * buffs：buff相关字段。
 */

  buffs: GmEditorBuffOption[];
  /**
 * quests：任务静态模板。
 */

  quests?: GmEditorQuestOption[];
}

/** GM 更新玩家时允许单独提交的字段分组。 */
export type GmPlayerUpdateSection =
  | 'basic'
  | 'position'
  | 'realm'
  | 'buffs'
  | 'techniques'
  | 'craftSkills'
  | 'items'
  | 'quests';

/** GM 更新玩家快照。 */
export type GmUpdatePlayerSnapshot = Partial<PlayerState> & {
  /** 在线玩家位置迁移时可选的目标实例 ID。 */
  instanceId?: string;
};

/** GM 更新玩家请求。 */
export interface GmUpdatePlayerReq {
/**
 * snapshot：快照状态或数据块。
 */

  snapshot: GmUpdatePlayerSnapshot;
  /**
 * section：section相关字段。
 */

  section?: GmPlayerUpdateSection;
}

/** GM 设置玩家体修等级请求。 */
export interface GmSetPlayerBodyTrainingLevelReq {
/**
 * level：等级数值。
 */

  level: number;
}

/** GM 增加玩家道基请求。 */
export interface GmAddPlayerFoundationReq {
/**
 * amount：数量或计量字段。
 */

  amount: number;
}

/** GM 增加玩家战斗经验请求。 */
export interface GmAddPlayerCombatExpReq {
/**
 * amount：数量或计量字段。
 */

  amount: number;
}

/** GM 设置玩家功德月卡池请求。 */
export interface GmSetPlayerMonthCardPoolReq {
  totalPoolMerit: number;
  remainingPoolMerit: number;
  eternalEnabled?: boolean;
  dailySignInFixedMeritBonus?: number;
}

/** GM 直接激活玩家永恒权益请求。 */
export interface GmActivatePlayerEternalBenefitReq {
  count?: number;
}

/** GM 生成机器人请求。 */
export interface GmSpawnBotsReq {
/**
 * anchorPlayerId：anchor玩家ID标识。
 */

  anchorPlayerId: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** GM 移除机器人的请求。 */
export interface GmRemoveBotsReq {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * all：all相关字段。
 */

  all?: boolean;
}

/** GM 快捷操作可选玩家范围；为空时由服务端按全员操作处理。 */
export interface GmShortcutScopeReq {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * targetPlayerIds：目标玩家ID相关字段。
 */

  targetPlayerIds?: string[];
}

/** GM 快捷执行结果。 */
export interface GmShortcutRunRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
  /**
 * totalPlayers：集合字段。
 */

  totalPlayers: number;
  /**
 * queuedRuntimePlayers：集合字段。
 */

  queuedRuntimePlayers: number;
  /**
 * updatedOfflinePlayers：集合字段。
 */

  updatedOfflinePlayers: number;
  /**
 * totalInvalidInventoryStacksRemoved：totalInvalid背包StackRemoved相关字段。
 */

  totalInvalidInventoryStacksRemoved?: number;
  /**
 * totalInvalidMarketStorageStacksRemoved：totalInvalid坊市StorageStackRemoved相关字段。
 */

  totalInvalidMarketStorageStacksRemoved?: number;
  /**
 * totalInvalidEquipmentRemoved：totalInvalid装备Removed相关字段。
 */

  totalInvalidEquipmentRemoved?: number;
  /**
 * totalRecoveryPillInventoryStacksMigrated：恢复丹药迁移的背包堆叠数。
 */

  totalRecoveryPillInventoryStacksMigrated?: number;
  /**
 * totalRecoveryPillInventoryItemsMigrated：恢复丹药迁移的背包物品总数。
 */

  totalRecoveryPillInventoryItemsMigrated?: number;
  /**
 * totalRecoveryPillMarketStorageStacksMigrated：恢复丹药迁移的坊市托管仓堆叠数。
 */

  totalRecoveryPillMarketStorageStacksMigrated?: number;
  /**
 * totalRecoveryPillMarketStorageItemsMigrated：恢复丹药迁移的坊市托管仓物品总数。
 */

  totalRecoveryPillMarketStorageItemsMigrated?: number;
  /**
 * totalRecoveryPillEquipmentMigrated：恢复丹药迁移的装备栏条目数。
 */

  totalRecoveryPillEquipmentMigrated?: number;
  /**
 * totalCombatExpGranted：total战斗ExpGranted相关字段。
 */

  totalCombatExpGranted?: number;
  /**
 * totalFoundationGranted：totalFoundationGranted相关字段。
 */

  totalFoundationGranted?: number;
  /**
 * scannedInstances：扫描实例数。
 */

  scannedInstances?: number;
  /**
 * affectedInstances：发生清理的实例数。
 */

  affectedInstances?: number;
  /**
 * removedTemporaryTiles：移除异常临时地块数。
 */

  removedTemporaryTiles?: number;
  /**
 * flushedInstances：已同步刷盘的实例数。
 */

  flushedInstances?: number;
  /**
 * repairedMarketStorageRows：修复坊市托管仓 storage_item_id 行数。
 */

  repairedMarketStorageRows?: number;
  /**
 * repairedMarketStoragePlayers：修复坊市托管仓涉及玩家数。
 */

  repairedMarketStoragePlayers?: number;
  /**
 * marketStorageMismatchedRowsBefore：修复前异常 storage_item_id 行数。
 */

  marketStorageMismatchedRowsBefore?: number;
  /**
 * marketStorageMismatchedRowsAfter：修复后异常 storage_item_id 行数。
 */

  marketStorageMismatchedRowsAfter?: number;
  /**
 * marketStorageInvalidSlotRowsBefore：修复前非法托管仓槽位行数。
 */

  marketStorageInvalidSlotRowsBefore?: number;
  /**
 * marketStorageInvalidSlotRowsAfter：修复后非法托管仓槽位行数。
 */

  marketStorageInvalidSlotRowsAfter?: number;
  /**
 * repairedAt：修复完成时间。
 */

  repairedAt?: string;
  questProgressRepairMode?: 'dry-run' | 'apply';
  questProgressScannedRows?: number;
  questProgressKnownRows?: number;
  questProgressUnknownRows?: number;
  questProgressPatchedRows?: number;
  questProgressUnknownQuestIds?: Array<{ questId: string; count: number }>;
  questProgressSamplePatches?: Array<{ playerId: string; questId: string; status: string; progress: unknown }>;
  /**
 * refreshedOnlinePlayers：刷新功法模板的在线玩家数。
 */

  refreshedOnlinePlayers?: number;
  /**
 * refreshedTechniques：刷新功法模板的已学功法数。
 */

  refreshedTechniques?: number;
  /**
 * missingTechniqueTemplates：刷新时找不到模板的已学功法数。
 */

  missingTechniqueTemplates?: number;
  /** 回满体力的玩家数。 */
  staminaRefilledPlayers?: number;
  /** 体力上限。 */
  staminaMaximum?: number;
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId?: string;
  /**
 * targetX：目标X相关字段。
 */

  targetX?: number;
  /**
 * targetY：目标Y相关字段。
 */

  targetY?: number;
}

/** GM 数据兼容转换模式。 */
export type GmCompatConversionMode = 'dry-run' | 'apply';

/** GM 数据兼容转换样本差异摘要。 */
export interface GmCompatConversionSample {
  id: string;
  name: string;
  status: string;
  before: unknown;
  after: unknown;
}

/** GM 数据兼容转换执行结果。 */
export interface GmCompatConversionRunRes {
  ok: true;
  conversionId: string;
  mode: GmCompatConversionMode;
  matchedRows: number;
  convertedRows: number;
  skippedRows: number;
  failedRows: number;
  verifiedRows: number;
  samples: GmCompatConversionSample[];
  errors: string[];
  appliedAt?: string;
}
