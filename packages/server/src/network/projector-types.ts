/**
 * 投影器类型定义。
 * 定义投影器内部使用的所有接口、常量和类型别名，是 projector 模块的类型基础。
 */

import type {
  ActionDef,
  AttrBonus,
  Attributes,
  AutoBattleTargetingMode,
  AutoUsePillConfig,
  BodyTrainingState,
  CombatTargetingRules,
  EquipmentSlotUpdateEntry,
  FormationLifecycle,
  FormationRangeShape,
  GroundItemEntryView,
  InitSessionView,
  MapEnterView,
  MonsterTier,
  NpcQuestMarker,
  NumericRatioDivisors,
  NumericStats,
  PlayerSpecialStats,
  PlayerWalletState,
  S2C_PanelAttrDelta,
  S2C_PanelDelta,
  SelfDeltaView,
  SyncedItemStack,
  TechniqueUpdateEntryView,
  VisibleBuffState,
  WorldDeltaView,
} from '@mud/shared';

export const ATTR_DELTA_PATCH_THRESHOLD = 10;
export const ATTRIBUTE_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians'] as const;
export const NUMERIC_STAT_KEYS = [
    'maxHp',
    'maxQi',
    'physAtk',
    'spellAtk',
    'physDef',
    'spellDef',
    'hit',
    'dodge',
    'crit',
    'antiCrit',
    'critDamage',
    'breakPower',
    'resolvePower',
    'maxQiOutputPerTick',
    'qiRegenRate',
    'hpRegenRate',
    'cooldownSpeed',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'realmExpPerTick',
    'techniqueExpPerTick',
    'lootRate',
    'rareLootRate',
    'viewRange',
    'moveSpeed',
    'extraAggroRate',
    'extraRange',
    'extraArea',
    'actionsPerTurn',
] as const;
export const RATIO_DIVISOR_KEYS = [
    'dodge',
    'crit',
    'breakPower',
    'resolvePower',
    'cooldownSpeed',
    'moveSpeed',
] as const;
export const ELEMENT_GROUP_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'] as const;

export type DirectionLike = NonNullable<SelfDeltaView['f']>;
export type LooseRecord = Record<string, unknown>;
export type AttributeKey = typeof ATTRIBUTE_KEYS[number];
export type NumericStatKey = typeof NUMERIC_STAT_KEYS[number];
export type RatioDivisorKey = typeof RATIO_DIVISOR_KEYS[number];
export type ElementGroupKey = typeof ELEMENT_GROUP_KEYS[number];

export type ProjectedPatchResult<TPatch> = { changes: 0; patch?: undefined } | { changes: number; patch: TPatch };
export interface AttrBonusMetaRecord {
    [key: string]: AttrBonusMetaValue;
}
export type AttrBonusMetaValue = string | number | boolean | null | AttrBonusMetaRecord | AttrBonusMetaValue[];
export interface BindingLike {
  playerId: string;
  sessionId: string;
  resumed?: boolean | null;
}
export interface ProjectorInstanceLike {
  instanceId: string;
  templateId: string;
  name: string;
  kind: string;
  width: number;
  height: number;
}
export interface ProjectorVisiblePlayerLike {
  playerId: string;
  name: string;
  displayName?: string | null;
  x: number;
  y: number;
  buffs?: { buffs?: unknown[] | null } | unknown[] | null;
}
export interface ProjectorNpcLike {
  npcId: string;
  x: number;
  y: number;
  name: string;
  char: string;
  color: string;
  hasShop?: boolean;
  questMarker?: NpcQuestMarker | null;
}
export interface ProjectorMonsterLike {
  runtimeId: string;
  monsterId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi?: number;
  maxQi?: number;
  name: string;
  char: string;
  color: string;
  tier?: MonsterTier;
  buffs?: unknown[];
}
export interface ProjectorPortalLike {
  id?: string | null;
  x: number;
  y: number;
  kind: string;
  targetMapId?: string | null;
  trigger?: string | null;
  direction?: string | null;
}
export interface ProjectorGroundPileLike {
  sourceId: string;
  x: number;
  y: number;
  items: GroundItemEntryView[];
}
export interface ProjectorContainerLike {
  id: string;
  x: number;
  y: number;
  name: string;
  char: string;
  color: string;
  respawnRemainingTicks?: number;
}
export interface ProjectorBuildingLike {
  id: string;
  x: number;
  y: number;
  name: string;
  char: string;
  color: string;
  remainingTicks?: number;
  totalTicks?: number;
}
export interface ProjectorFormationLike {
  id: string;
  x: number;
  y: number;
  name: string;
  active?: boolean;
  radius?: number;
  rangeShape?: FormationRangeShape;
  char?: string;
  color?: string;
  showText?: boolean;
  rangeHighlightColor?: string;
  boundaryChar?: string;
  boundaryColor?: string;
  boundaryRangeHighlightColor?: string;
  eyeVisibleWithoutSenseQi?: boolean;
  rangeVisibleWithoutSenseQi?: boolean;
  boundaryVisibleWithoutSenseQi?: boolean;
  blocksBoundary?: boolean;
  ownerSectId?: string | null;
  ownerPlayerId?: string | null;
  lifecycle?: FormationLifecycle;
}
export interface ProjectorViewLike {
  playerId: string;
  tick: number;
  worldRevision: number;
  selfRevision: number;
  instance: ProjectorInstanceLike;
  self: {
    x: number;
    y: number;
    name: string;
    displayName?: string | null;
    buffs?: { buffs?: unknown[] | null } | unknown[] | null;
  };
  visiblePlayers: ProjectorVisiblePlayerLike[];
  localNpcs: ProjectorNpcLike[];
  localMonsters: ProjectorMonsterLike[];
  localPortals: ProjectorPortalLike[];
  localGroundPiles: ProjectorGroundPileLike[];
  localContainers: ProjectorContainerLike[];
  localBuildings?: ProjectorBuildingLike[];
  localFormations?: ProjectorFormationLike[];
}
export interface ProjectedPlayerEntry {
  n: string;
  ch: string;
  x: number;
  y: number;
  sc?: number | null;
}
export interface ProjectedNpcEntry {
  x: number;
  y: number;
  n: string;
  ch: string;
  c: string;
  sh: 0 | 1;
  qm: NpcQuestMarker | null;
}
export interface ProjectedMonsterEntry {
  mid: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi?: number;
  maxQi?: number;
  n: string;
  c: string;
  tr?: MonsterTier;
}
export interface ProjectedPortalEntry {
  n: string;
  ch: string;
  x: number;
  y: number;
  tm?: string | null;
  tr: 0 | 1;
  d: 0 | 1;
}
export interface ProjectedGroundPileEntry {
  x: number;
  y: number;
  items: GroundItemEntryView[];
}
export interface ProjectedContainerEntry {
  x: number;
  y: number;
  n: string;
  ch: string;
  c: string;
  rr?: number;
}
export interface ProjectedBuildingEntry {
  x: number;
  y: number;
  n: string;
  ch: string;
  c: string;
  rt?: number;
  tt?: number;
}
export interface ProjectedFormationEntry {
  x: number;
  y: number;
  n: string;
  ch: string;
  c: string;
  ac: 0 | 1;
  rs?: number;
  sh?: FormationRangeShape;
  hl?: string;
  bch?: string;
  bc?: string;
  bhl?: string;
  ev: 0 | 1;
  rv: 0 | 1;
  bv: 0 | 1;
  tx: 0 | 1;
  bd: 0 | 1;
  os?: string | null;
  op?: string | null;
  lt: 0 | 1;
}
export interface ProjectedSelfState {
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  f: DirectionLike;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  wallet: PlayerWalletState | null;
}
export type ProjectedNumericStats = NumericStats;
export type ProjectedRatioDivisors = NumericRatioDivisors;
export type ProjectedActionEntry = ActionDef;
export type ProjectedElementGroup = ProjectedNumericStats['elementDamageBonus'];
export type ProjectedAttrPatch = NonNullable<S2C_PanelAttrDelta['baseAttrs']>;
export type ProjectedNumericStatsPatch = NonNullable<S2C_PanelAttrDelta['numericStats']>;
export type ProjectedRatioDivisorsPatch = NonNullable<S2C_PanelAttrDelta['ratioDivisors']>;
export interface ProjectorPlayerLike {
  selfRevision: number;
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  facing: DirectionLike;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  foundation: number;
  rootFoundation?: number;
  combatExp: number;
  comprehension?: number;
  luck?: number;
  fengShuiLuck?: number;
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears?: number | null;
  realmLv?: number;
  realm?: {
    realmLv?: number;
    progress?: number;
    progressToNext?: number;
    breakthroughReady?: boolean;
  } | null;
  inventory: {
    revision: number;
    capacity: number;
    items: SyncedItemStack[];
  };
  wallet?: PlayerWalletState | null;
  equipment: {
    revision: number;
    slots: EquipmentSlotUpdateEntry[];
  };
  techniques: {
    revision: number;
    techniques: TechniqueUpdateEntryView[];
    cultivatingTechId?: string | null;
  };
  bodyTraining?: BodyTrainingState | null;
  alchemySkill?: S2C_PanelAttrDelta['alchemySkill'];
  forgingSkill?: S2C_PanelAttrDelta['alchemySkill'];
  buildingSkill?: S2C_PanelAttrDelta['buildingSkill'];
  gatherSkill?: S2C_PanelAttrDelta['gatherSkill'];
  enhancementSkill?: S2C_PanelAttrDelta['enhancementSkill'];
  miningSkill?: S2C_PanelAttrDelta['miningSkill'];
  attrs: {
    revision: number;
    stage: S2C_PanelAttrDelta['stage'];
    baseAttrs: Attributes;
    finalAttrs: Attributes;
    numericStats: ProjectedNumericStats;
    ratioDivisors: ProjectedRatioDivisors;
  };
  actions: {
    revision: number;
    actions: ProjectedActionEntry[];
  };
  combat: {
    autoBattle: boolean;
    autoUsePills: AutoUsePillConfig[];
    combatTargetingRules?: CombatTargetingRules;
    autoBattleTargetingMode: AutoBattleTargetingMode;
    retaliatePlayerTargetId?: string | null;
    combatTargetId?: string | null;
    combatTargetLocked?: boolean;
    autoRetaliate?: boolean;
    autoBattleStationary?: boolean;
    allowAoePlayerHit?: boolean;
    autoIdleCultivation?: boolean;
    autoSwitchCultivation?: boolean;
    autoRootFoundation?: boolean;
    cultivationActive?: boolean;
    senseQiActive?: boolean;
    wangQiActive?: boolean;
  };
  buffs: {
    revision: number;
    buffs: VisibleBuffState[];
  };
  bonuses?: AttrBonus[];
}
export interface ProjectedAttrPanelState {
  revision: number;
  stage: S2C_PanelAttrDelta['stage'];
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs: Attributes;
  numericStats: ProjectedNumericStats;
  ratioDivisors: ProjectedRatioDivisors;
  specialStats: PlayerSpecialStats;
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears?: number | null;
  realmProgress?: number;
  realmProgressToNext?: number;
  realmBreakthroughReady?: boolean;
  alchemySkill?: S2C_PanelAttrDelta['alchemySkill'];
  forgingSkill?: S2C_PanelAttrDelta['alchemySkill'];
  buildingSkill?: S2C_PanelAttrDelta['buildingSkill'];
  gatherSkill?: S2C_PanelAttrDelta['gatherSkill'];
  enhancementSkill?: S2C_PanelAttrDelta['enhancementSkill'];
  miningSkill?: S2C_PanelAttrDelta['miningSkill'];
}
export interface ProjectedActionPanelState {
  revision: number;
  actions: ProjectedActionEntry[];
  autoBattle: boolean;
  autoUsePills: AutoUsePillConfig[];
  combatTargetingRules?: CombatTargetingRules;
  autoBattleTargetingMode: AutoBattleTargetingMode;
  retaliatePlayerTargetId?: string | null;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  autoRootFoundation?: boolean;
  cultivationActive?: boolean;
  senseQiActive?: boolean;
  wangQiActive?: boolean;
}
export type ProjectedAttrDeltaView = S2C_PanelAttrDelta;
export interface ProjectedPanelState {
  inventory: {
    revision: number;
    capacity: number;
    items: SyncedItemStack[];
  };
  equipment: {
    revision: number;
    slots: EquipmentSlotUpdateEntry[];
  };
  technique: {
    revision: number;
    techniques: TechniqueUpdateEntryView[];
    cultivatingTechId?: string | null;
    bodyTraining?: BodyTrainingState | null;
  };
  attr: ProjectedAttrPanelState;
  action: ProjectedActionPanelState;
  buff: {
    revision: number;
    buffs: VisibleBuffState[];
  };
}
export interface ProjectedPanelCursor {
  inventoryRevision: number;
  equipmentRevision: number;
  techniqueRevision: number;
  attrRevision: number;
  actionRevision: number;
  buffRevision: number;
  attrSignature: string;
  actionSignature: string;
  buffSignature: string;
}
export interface WorldStateSlice {
  instanceId: string;
  worldRevision: number;
  players: Map<string, ProjectedPlayerEntry>;
  npcs: Map<string, ProjectedNpcEntry>;
  monsters: Map<string, ProjectedMonsterEntry>;
  portals: Map<string, ProjectedPortalEntry>;
  groundPiles: Map<string, ProjectedGroundPileEntry>;
  containers: Map<string, ProjectedContainerEntry>;
  buildings: Map<string, ProjectedBuildingEntry>;
  formations: Map<string, ProjectedFormationEntry>;
}
export interface PlayerStateSlice {
  selfRevision: number;
  self: ProjectedSelfState;
  panel?: ProjectedPanelState;
  techniquePanel?: ProjectedPanelState['technique'];
  panelCursor: ProjectedPanelCursor;
}
export interface ProjectorState extends WorldStateSlice, PlayerStateSlice {}
export interface InitialEnvelope {
  initSession: InitSessionView;
  mapEnter: MapEnterView;
  worldDelta: WorldDeltaView;
  selfDelta: SelfDeltaView;
  panelDelta: S2C_PanelDelta;
}
export interface DeltaEnvelope {
  mapEnter?: MapEnterView;
  worldDelta?: WorldDeltaView;
  selfDelta?: SelfDeltaView;
  panelDelta?: S2C_PanelDelta;
}
