import {
  Attributes,
  buildQiResourceKey,
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
  DISPERSED_AURA_MIN_DECAY_PER_TICK,
  DISPERSED_AURA_RESOURCE_DESCRIPTOR,
  EquipmentSlots,
  GmMapDocument,
  ItemType,
  LootSourceVariant,
  MapMeta,
  MapMinimapSnapshot,
  MapRouteDomain,
  MapTimeConfig,
  MonsterAggroMode,
  MonsterCombatModel,
  MonsterInitialBuffDef,
  MonsterTier,
  NumericStats,
  NumericStatPercentages,
  PartialNumericStats,
  PlayerRealmStage,
  Portal,
  PortalKind,
  PortalTrigger,
  QuestLine,
  QuestObjectiveType,
  TechniqueGrade,
  TILE_AURA_HALF_LIFE_RATE_SCALE,
  TILE_AURA_HALF_LIFE_RATE_SCALED,
  Tile,
  TileType,
} from '@mud/shared';
import {
  ORDINARY_MONSTER_SPAWN_COUNT,
  ORDINARY_MONSTER_SPAWN_MAX_ALIVE,
} from '../constants/gameplay/monster';

export interface QuestConfig {
  id: string;
  title: string;
  desc: string;
  line: QuestLine;
  chapter?: string;
  story?: string;
  objectiveType: QuestObjectiveType;
  objectiveText?: string;
  targetName: string;
  targetMonsterId?: string;
  targetTechniqueId?: string;
  targetRealmStage?: PlayerRealmStage;
  targetRealmLv?: number;
  acceptRealmStage?: PlayerRealmStage;
  acceptRealmLv?: number;
  required: number;
  rewards: DropConfig[];
  rewardItemIds: string[];
  rewardItemId: string;
  rewardText: string;
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
  targetMapId?: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  targetNpcId?: string;
  targetNpcName?: string;
  submitNpcId?: string;
  submitNpcName?: string;
  submitMapId?: string;
  submitMapName?: string;
  submitX?: number;
  submitY?: number;
  relayMessage?: string;
  unlockBreakthroughRequirementIds?: string[];
  giverId: string;
  giverName: string;
  giverMapId: string;
  giverMapName: string;
  giverX: number;
  giverY: number;
}

export interface QuestFileRecord {
  id?: string;
  title?: string;
  desc?: string;
  line?: QuestLine;
  chapter?: string;
  story?: string;
  objectiveType?: QuestObjectiveType;
  objectiveText?: string;
  targetName?: string;
  targetMapId?: string;
  targetX?: number;
  targetY?: number;
  targetNpcId?: string;
  targetNpcName?: string;
  targetMonsterId?: string;
  targetTechniqueId?: string;
  targetRealmStage?: keyof typeof PlayerRealmStage | PlayerRealmStage;
  targetRealmLv?: number;
  acceptRealmStage?: keyof typeof PlayerRealmStage | PlayerRealmStage;
  acceptRealmLv?: number;
  required?: number;
  targetCount?: number;
  rewardItemId?: string;
  rewardText?: string;
  reward?: Array<{ itemId?: string; name?: string; type?: ItemType; count?: number }>;
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
  giverMapId?: string;
  giverNpcId?: string;
  submitNpcId?: string;
  submitMapId?: string;
  relayMessage?: string;
  unlockBreakthroughRequirementIds?: string[];
}

export interface QuestFileDocument {
  quests?: QuestFileRecord[];
}

export interface NpcConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  dialogue: string;
  role?: string;
  shopItems: NpcShopItemConfig[];
  quests: QuestConfig[];
}

export interface NpcShopItemConfig {
  itemId: string;
  price?: number;
  stockLimit?: number;
  refreshSeconds?: number;
  priceFormula?: 'technique_realm_square_grade';
}

export interface DropConfig {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance: number;
}

export interface ContainerLootPoolConfig {
  rolls: number;
  chance: number;
  minLevel?: number;
  maxLevel?: number;
  minGrade?: TechniqueGrade;
  maxGrade?: TechniqueGrade;
  tagGroups: string[][];
  countMin?: number;
  countMax?: number;
  allowDuplicates: boolean;
}

export interface ContainerConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  desc?: string;
  variant?: LootSourceVariant;
  char?: string;
  color?: string;
  grade: TechniqueGrade;
  refreshTicks?: number;
  refreshTicksMin?: number;
  refreshTicksMax?: number;
  drops: DropConfig[];
  lootPools: ContainerLootPoolConfig[];
}

export interface SafeZoneConfig {
  x: number;
  y: number;
  radius: number;
}

export interface MonsterSpawnConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  grade: TechniqueGrade;
  attrs: Attributes;
  equipment: EquipmentSlots;
  statPercents?: NumericStatPercentages;
  initialBuffs?: MonsterInitialBuffDef[];
  skills: string[];
  tier: MonsterTier;
  valueStats?: PartialNumericStats;
  numericStats: NumericStats;
  combatModel: MonsterCombatModel;
  hp: number;
  maxHp: number;
  attack: number;
  count: number;
  radius: number;
  maxAlive: number;
  wanderRadius: number;
  aggroRange: number;
  viewRange: number;
  aggroMode: MonsterAggroMode;
  respawnTicks: number;
  level?: number;
  expMultiplier: number;
  drops: DropConfig[];
}

export interface MapData {
  meta: MapMeta;
  tiles: Tile[][];
  portals: Portal[];
  auraPoints: MapAuraPoint[];
  baseAuraValues: Map<string, number>;
  baseResourceValues: Map<string, Map<string, number>>;
  safeZones: SafeZoneConfig[];
  containers: ContainerConfig[];
  npcs: NpcConfig[];
  monsterSpawns: MonsterSpawnConfig[];
  minimap: MapMinimapSnapshot;
  minimapSignature: string;
  spawnPoint: { x: number; y: number };
  source: GmMapDocument;
}

export interface MapAuraPoint {
  x: number;
  y: number;
  value: number;
}

export interface MapTileResourcePoint {
  x: number;
  y: number;
  resourceKey: string;
  value: number;
}

export interface DynamicTileState {
  x: number;
  y: number;
  originalType: TileType;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  restoreTicksLeft?: number;
  transformedType?: TileType;
  transformTicksLeft?: number;
}

export function resolveMonsterSpawnPopulation(
  tier: MonsterTier,
  configuredCount: number,
  configuredMaxAlive: number,
): { count: number; maxAlive: number } {
  if (tier === 'mortal_blood') {
    return {
      count: ORDINARY_MONSTER_SPAWN_COUNT,
      maxAlive: ORDINARY_MONSTER_SPAWN_MAX_ALIVE,
    };
  }

  const maxAlive = Math.max(1, Math.round(configuredMaxAlive));
  const count = Math.min(Math.max(1, Math.round(configuredCount)), maxAlive);
  return { count, maxAlive };
}

export interface PersistedDynamicTileRecord {
  x: number;
  y: number;
  hp: number;
  destroyed: boolean;
  restoreTicksLeft?: number;
  transformedType?: TileType;
  transformTicksLeft?: number;
}

export interface PersistedDynamicTileSnapshot {
  version: 1;
  maps: Record<string, PersistedDynamicTileRecord[]>;
}

export interface PersistedAuraRecord {
  x: number;
  y: number;
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}

export interface PersistedAuraSnapshot {
  version: 1;
  maps: Record<string, PersistedAuraRecord[]>;
}

export interface PersistedTileRuntimeTerrainRecord {
  hp: number;
  destroyed: boolean;
  restoreTicksLeft?: number;
  transformedType?: TileType;
  transformTicksLeft?: number;
}

export interface PersistedTileRuntimeResourceRecord {
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}

export interface TileResourceRuntimeState extends PersistedTileRuntimeResourceRecord {
  x: number;
  y: number;
}

export type TileResourceStateMap = Map<string, TileResourceRuntimeState>;
export type TileResourceBucketMap = Map<string, TileResourceStateMap>;

export interface PersistedTileRuntimeRecord {
  x: number;
  y: number;
  terrain?: PersistedTileRuntimeTerrainRecord;
  resources?: Record<string, PersistedTileRuntimeResourceRecord>;
}

export interface PersistedMapTimeState {
  totalTicks?: number;
  config?: MapTimeConfig;
  tickSpeed?: number;
}

export interface PersistedTileRuntimeSnapshot {
  version: 1 | 2;
  maps: Record<string, PersistedTileRuntimeRecord[]>;
  time?: Record<string, PersistedMapTimeState>;
}

export interface SyncedMapDocument {
  document: GmMapDocument;
  previousDocument?: GmMapDocument;
}

export const MAP_DOCUMENT_SCOPE = 'map_document';
export const RUNTIME_STATE_SCOPE = 'runtime_state';
export const MAP_TILE_RUNTIME_DOCUMENT_KEY = 'map_tile';
export const LEGACY_AURA_RESOURCE_KEY = 'aura';
export const AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
export const DISPERSED_AURA_RESOURCE_KEY = buildQiResourceKey(DISPERSED_AURA_RESOURCE_DESCRIPTOR);

export interface TileResourceFlowConfig {
  halfLifeRateScale: number;
  halfLifeRateScaled: number;
  minimumDecayPerTick: number;
}

export const TILE_RESOURCE_FLOW_CONFIGS: Partial<Record<string, TileResourceFlowConfig>> = {
  [AURA_RESOURCE_KEY]: {
    halfLifeRateScale: TILE_AURA_HALF_LIFE_RATE_SCALE,
    halfLifeRateScaled: TILE_AURA_HALF_LIFE_RATE_SCALED,
    minimumDecayPerTick: 0,
  },
  [DISPERSED_AURA_RESOURCE_KEY]: {
    halfLifeRateScale: TILE_AURA_HALF_LIFE_RATE_SCALE,
    halfLifeRateScaled: DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
    minimumDecayPerTick: DISPERSED_AURA_MIN_DECAY_PER_TICK,
  },
};

export const QI_FAMILY_LABELS = {
  aura: '灵气',
  demonic: '魔气',
  sha: '煞气',
} as const;

export const QI_FORM_LABELS = {
  refined: '凝练',
  dispersed: '逸散',
} as const;

export const QI_ELEMENT_LABELS = {
  neutral: '',
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
} as const;

export type OccupantKind = 'player' | 'monster';

export interface OccupancyCheckOptions {
  occupancyId?: string | null;
  actorType?: OccupantKind;
}

export interface NpcLocation {
  mapId: string;
  mapName: string;
  x: number;
  y: number;
  name: string;
}

export interface PortalQueryOptions {
  trigger?: PortalTrigger;
  kind?: PortalKind;
  allowedRouteDomains?: readonly MapRouteDomain[];
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface PortalObservationHint {
  title: string;
  desc?: string;
}

