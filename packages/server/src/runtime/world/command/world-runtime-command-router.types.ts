/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * WorldRuntime 命令路由类型定义
 *
 * 所有玩家命令通过 WorldRuntimePlayerCommandService.dispatchPlayerCommand 统一路由。
 * 本文件定义命令 kind 枚举和命令载荷类型，使路由关系显式化。
 */

/** 玩家命令 kind 枚举 */
export const PlayerCommandKind = {
  UseItem: 'useItem',
  CreateFormation: 'createFormation',
  SetFormationActive: 'setFormationActive',
  RefillFormation: 'refillFormation',
  Equip: 'equip',
  Unequip: 'unequip',
  DropItem: 'dropItem',
  MoveTo: 'moveTo',
  BasicAttack: 'basicAttack',
  EngageBattle: 'engageBattle',
  TakeGround: 'takeGround',
  TakeGroundAll: 'takeGroundAll',
  Cultivate: 'cultivate',
  StartAlchemy: 'startAlchemy',
  CancelAlchemy: 'cancelAlchemy',
  StartForging: 'startForging',
  CancelForging: 'cancelForging',
  SaveAlchemyPreset: 'saveAlchemyPreset',
  DeleteAlchemyPreset: 'deleteAlchemyPreset',
  StartEnhancement: 'startEnhancement',
  CancelEnhancement: 'cancelEnhancement',
  StartGather: 'startGather',
  CancelGather: 'cancelGather',
  StartMining: 'startMining',
  CancelMining: 'cancelMining',
  StartBuilding: 'startBuilding',
  StartFormationMaintenance: 'startFormationMaintenance',
  CancelFormationMaintenance: 'cancelFormationMaintenance',
  CancelTechniqueActivity: 'cancelTechniqueActivity',
  RedeemCodes: 'redeemCodes',
  Breakthrough: 'breakthrough',
  RefineRootFoundation: 'refineRootFoundation',
  HeavenGateAction: 'heavenGateAction',
  CastSkill: 'castSkill',
  BuyNpcShopItem: 'buyNpcShopItem',
  NpcInteraction: 'npcInteraction',
  InteractNpcQuest: 'interactNpcQuest',
  AcceptNpcQuest: 'acceptNpcQuest',
  SubmitNpcQuest: 'submitNpcQuest',
} as const;

export type PlayerCommandKindValue = (typeof PlayerCommandKind)[keyof typeof PlayerCommandKind];

/** 命令 → 领域路由映射（文档用途，运行时路由在 WorldRuntimePlayerCommandService） */
export const COMMAND_DOMAIN_ROUTING: Record<PlayerCommandKindValue, string> = {
  useItem: 'WorldRuntimeUseItemService',
  createFormation: 'WorldRuntimeFormationService',
  setFormationActive: 'WorldRuntimeFormationService',
  refillFormation: 'WorldRuntimeFormationService',
  equip: 'WorldRuntimeEquipmentService',
  unequip: 'WorldRuntimeEquipmentService',
  dropItem: 'WorldRuntimeItemGroundService',
  moveTo: 'WorldRuntimeNavigationService',
  basicAttack: 'WorldRuntimeCombatCommandService',
  engageBattle: 'WorldRuntimeCombatCommandService',
  takeGround: 'WorldRuntimeItemGroundService',
  takeGroundAll: 'WorldRuntimeItemGroundService',
  cultivate: 'WorldRuntimeCultivationService',
  startAlchemy: 'WorldRuntimeAlchemyService',
  cancelAlchemy: 'WorldRuntimeAlchemyService',
  startForging: 'WorldRuntimeCraftMutationService',
  cancelForging: 'WorldRuntimeCraftMutationService',
  saveAlchemyPreset: 'WorldRuntimeAlchemyService',
  deleteAlchemyPreset: 'WorldRuntimeAlchemyService',
  startEnhancement: 'WorldRuntimeEnhancementService',
  cancelEnhancement: 'WorldRuntimeEnhancementService',
  startGather: 'WorldRuntimeCraftMutationService',
  cancelGather: 'WorldRuntimeCraftMutationService',
  startMining: 'WorldRuntimeCraftMutationService',
  cancelMining: 'WorldRuntimeCraftMutationService',
  startBuilding: 'WorldRuntimeBuildingService',
  startFormationMaintenance: 'WorldRuntimeFormationService',
  cancelFormationMaintenance: 'WorldRuntimeFormationService',
  cancelTechniqueActivity: 'WorldRuntimePlayerCommandService',
  redeemCodes: 'WorldRuntimeRedeemCodeService',
  breakthrough: 'WorldRuntimeProgressionService',
  refineRootFoundation: 'WorldRuntimeProgressionService',
  heavenGateAction: 'WorldRuntimeProgressionService',
  castSkill: 'WorldRuntimeCombatCommandService',
  buyNpcShopItem: 'WorldRuntimeNpcShopService',
  npcInteraction: 'WorldRuntimeNpcQuestWriteService',
  interactNpcQuest: 'WorldRuntimeNpcQuestWriteService',
  acceptNpcQuest: 'WorldRuntimeNpcQuestWriteService',
  submitNpcQuest: 'WorldRuntimeNpcQuestWriteService',
};

/** 战斗类命令（需要 action-ready 检查） */
export const COMBAT_COMMAND_KINDS: ReadonlySet<PlayerCommandKindValue> = new Set([
  PlayerCommandKind.BasicAttack,
  PlayerCommandKind.CastSkill,
]);
