/**
 * 兼容聚合口：保留历史 `./types` 导入路径，统一转发到已拆分的小文件。
 */

export type {
  AutoBattleSkillConfig,
  AutoBattleTargetingMode,
  AutoUsePillBuffMissingCondition,
  AutoUsePillCondition,
  AutoUsePillConditionOperator,
  AutoUsePillConfig,
  AutoUsePillResource,
  AutoUsePillResourceCondition,
  CombatTargetingRules,
} from './automation-types';
export type {
  CombatRelation,
  CombatRelationBlockedReason,
  CombatRelationResolution,
  CombatRelationTargetKind,
} from './combat-relation';
export type {
  ActionDef,
  ActionType,
  CombatEffect,
  CombatEffectAttack,
  CombatEffectFloat,
  CombatEffectWarningZone,
} from './action-combat-types';
export type {
  AttrBonus,
  AttrKey,
  Attributes,
  NumericStatPercentages,
} from './attribute-types';
export type {
  AlchemyIngredientRole,
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemyRecipeCategory,
  AlchemyRecipeIngredientDef,
  AlchemySkillState,
  EnhancementMaterialRequirement,
  EnhancementTargetRef,
  PlayerAlchemyJob,
  PlayerAlchemyPreset,
  PlayerEnhancementJob,
  PlayerGatherJob,
  PlayerEnhancementLevelRecord,
  PlayerEnhancementRecord,
  PlayerEnhancementSessionStatus,
  SyncedAlchemyPanelState,
  SyncedEnhancementCandidateView,
  SyncedEnhancementPanelState,
  SyncedEnhancementProtectionCandidate,
  SyncedEnhancementRequirementView,
} from './crafting-types';
export type {
  TechniqueActivityJobBase,
  RuntimeTechniqueActivityKind,
  TechniqueActivityInterruptReason,
  TechniqueActivityKind,
  TechniqueSkillProgressState,
} from './technique-activity-types';
export type {
  TechniqueActivityCancelErrorCode,
  TechniqueActivityCancelEventName,
  TechniqueActivityCommandKind,
  TechniqueActivityMetadata,
  TechniqueActivityPanelEventName,
  TechniqueActivityRequestEventName,
  TechniqueActivityRequestPanelErrorCode,
  TechniqueActivityStartErrorCode,
  TechniqueActivityStartEventName,
} from './technique-activity-meta';
export {
  PlayerRealmStage,
  TechniqueRealm,
} from './cultivation-types';
export type {
  BodyTrainingState,
  HeavenGateRootValues,
  HeavenGateState,
  PlayerRealmState,
  PlayerSpecialStats,
  TechniqueAttrCurveSegment,
  TechniqueAttrCurves,
  TechniqueCategory,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueState,
} from './cultivation-types';
export type {
  MailAttachment,
  MailDetailView,
  MailFilter,
  MailListEntryView,
  MailPageView,
  MailSummaryView,
  MailTemplateArg,
} from './mail-types';
export type {
  BuffSustainCostDef,
  ConsumableBuffDef,
  EquipmentBuffDef,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  EquipmentEffectDef,
  EquipmentPeriodicCostEffectDef,
  EquipmentProgressEffectDef,
  EquipmentSlots,
  EquipmentStatAuraEffectDef,
  EquipmentTimedBuffEffectDef,
  EquipmentTrigger,
  EquipSlot,
  Inventory,
  InventoryItemCooldownState,
  ItemStack,
  ItemType,
} from './item-runtime-types';
export type {
  GroundItemEntryView,
  GroundItemPileView,
  LootSearchProgressView,
  LootSourceKind,
  LootWindowItemView,
  LootWindowSourceView,
  LootWindowState,
} from './loot-view-types';
export type {
  MarketListedItemView,
  MarketOrderBookView,
  MarketOrderSide,
  MarketOrderStatus,
  MarketOwnOrderView,
  MarketPriceLevelView,
  MarketStorage,
  MarketTradeHistoryEntryView,
  MarketTradeHistorySide,
} from './market-types';
export type {
  ObservationClarity,
  ObservationInsight,
  ObservationLine,
} from './observation-types';
export type {
  MonsterInitialBuffDef,
  SkillBuffEffectDef,
  SkillCleanseEffectDef,
  SkillDamageEffectDef,
  SkillDamageKind,
  SkillDef,
  SkillEffectDef,
  SkillFormula,
  SkillFormulaVar,
  SkillHealEffectDef,
  SkillMonsterCastDef,
  SkillTargetingDef,
  TemporaryBuffState,
} from './skill-types';
export type {
  PendingLogbookMessage,
  QuestLine,
  QuestNavigationState,
  QuestObjectiveType,
  QuestState,
  QuestStatus,
} from './quest-types';
export type {
  BreakthroughItemRequirement,
  BreakthroughPreviewState,
  BreakthroughRequirementType,
  BreakthroughRequirementView,
} from './progression-view-types';
export type {
  MapMinimapArchiveEntry,
  MapMinimapMarker,
  MapMinimapMarkerKind,
  MapMinimapSnapshot,
  NpcQuestMarker,
  NpcQuestMarkerState,
  NpcShopItemView,
  NpcShopView,
  Suggestion,
  SuggestionPage,
  SuggestionReply,
  SuggestionReplyAuthorType,
  SuggestionStatus,
} from './world-view-types';
export {
  Direction,
  TileType,
} from './world-core-types';
export type {
  BuffCategory,
  BuffModifierMode,
  BuffVisibility,
  EntityKind,
  GameTimeState,
  HiddenEntranceObservation,
  MapLightConfig,
  MapMeta,
  MapRouteDomain,
  MapSpaceVisionMode,
  MapTimeConfig,
  MonsterAggroMode,
  MonsterTier,
  Portal,
  PortalKind,
  PortalRouteDomain,
  PortalTrigger,
  RenderEntity,
  Tile,
  TimePaletteEntry,
  TimePhaseId,
  Viewport,
  VisibleBuffState,
  VisibleTile,
} from './world-core-types';
export type { PlayerState } from './player-runtime-types';
