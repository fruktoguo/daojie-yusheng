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

/** QuestConfig：定义该接口的能力与字段约束。 */
export interface QuestConfig {
/** id：定义该变量以承载业务值。 */
  id: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
/** line：定义该变量以承载业务值。 */
  line: QuestLine;
  chapter?: string;
  story?: string;
/** objectiveType：定义该变量以承载业务值。 */
  objectiveType: QuestObjectiveType;
  objectiveText?: string;
/** targetName：定义该变量以承载业务值。 */
  targetName: string;
  targetMonsterId?: string;
  targetTechniqueId?: string;
  targetRealmStage?: PlayerRealmStage;
  targetRealmLv?: number;
  acceptRealmStage?: PlayerRealmStage;
  acceptRealmLv?: number;
/** required：定义该变量以承载业务值。 */
  required: number;
/** rewards：定义该变量以承载业务值。 */
  rewards: DropConfig[];
/** rewardItemIds：定义该变量以承载业务值。 */
  rewardItemIds: string[];
/** rewardItemId：定义该变量以承载业务值。 */
  rewardItemId: string;
/** rewardText：定义该变量以承载业务值。 */
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
/** giverId：定义该变量以承载业务值。 */
  giverId: string;
/** giverName：定义该变量以承载业务值。 */
  giverName: string;
/** giverMapId：定义该变量以承载业务值。 */
  giverMapId: string;
/** giverMapName：定义该变量以承载业务值。 */
  giverMapName: string;
/** giverX：定义该变量以承载业务值。 */
  giverX: number;
/** giverY：定义该变量以承载业务值。 */
  giverY: number;
}

/** QuestFileRecord：定义该接口的能力与字段约束。 */
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

/** QuestFileDocument：定义该接口的能力与字段约束。 */
export interface QuestFileDocument {
  quests?: QuestFileRecord[];
}

/** NpcConfig：定义该接口的能力与字段约束。 */
export interface NpcConfig {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** dialogue：定义该变量以承载业务值。 */
  dialogue: string;
  role?: string;
/** shopItems：定义该变量以承载业务值。 */
  shopItems: NpcShopItemConfig[];
/** quests：定义该变量以承载业务值。 */
  quests: QuestConfig[];
}

/** NpcShopItemConfig：定义该接口的能力与字段约束。 */
export interface NpcShopItemConfig {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
  price?: number;
  stockLimit?: number;
  refreshSeconds?: number;
  priceFormula?: 'technique_realm_square_grade';
}

/** DropConfig：定义该接口的能力与字段约束。 */
export interface DropConfig {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
/** count：定义该变量以承载业务值。 */
  count: number;
/** chance：定义该变量以承载业务值。 */
  chance: number;
}

/** ContainerLootPoolConfig：定义该接口的能力与字段约束。 */
export interface ContainerLootPoolConfig {
/** rolls：定义该变量以承载业务值。 */
  rolls: number;
/** chance：定义该变量以承载业务值。 */
  chance: number;
  minLevel?: number;
  maxLevel?: number;
  minGrade?: TechniqueGrade;
  maxGrade?: TechniqueGrade;
/** tagGroups：定义该变量以承载业务值。 */
  tagGroups: string[][];
  countMin?: number;
  countMax?: number;
/** allowDuplicates：定义该变量以承载业务值。 */
  allowDuplicates: boolean;
}

/** ContainerConfig：定义该接口的能力与字段约束。 */
export interface ContainerConfig {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  desc?: string;
  variant?: LootSourceVariant;
  char?: string;
  color?: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
  refreshTicks?: number;
  refreshTicksMin?: number;
  refreshTicksMax?: number;
/** drops：定义该变量以承载业务值。 */
  drops: DropConfig[];
/** lootPools：定义该变量以承载业务值。 */
  lootPools: ContainerLootPoolConfig[];
}

/** SafeZoneConfig：定义该接口的能力与字段约束。 */
export interface SafeZoneConfig {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** radius：定义该变量以承载业务值。 */
  radius: number;
}

/** MonsterSpawnConfig：定义该接口的能力与字段约束。 */
export interface MonsterSpawnConfig {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** attrs：定义该变量以承载业务值。 */
  attrs: Attributes;
/** equipment：定义该变量以承载业务值。 */
  equipment: EquipmentSlots;
  statPercents?: NumericStatPercentages;
  initialBuffs?: MonsterInitialBuffDef[];
/** skills：定义该变量以承载业务值。 */
  skills: string[];
/** tier：定义该变量以承载业务值。 */
  tier: MonsterTier;
  valueStats?: PartialNumericStats;
/** numericStats：定义该变量以承载业务值。 */
  numericStats: NumericStats;
/** combatModel：定义该变量以承载业务值。 */
  combatModel: MonsterCombatModel;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** attack：定义该变量以承载业务值。 */
  attack: number;
/** count：定义该变量以承载业务值。 */
  count: number;
/** radius：定义该变量以承载业务值。 */
  radius: number;
/** maxAlive：定义该变量以承载业务值。 */
  maxAlive: number;
/** wanderRadius：定义该变量以承载业务值。 */
  wanderRadius: number;
/** aggroRange：定义该变量以承载业务值。 */
  aggroRange: number;
/** viewRange：定义该变量以承载业务值。 */
  viewRange: number;
/** aggroMode：定义该变量以承载业务值。 */
  aggroMode: MonsterAggroMode;
/** respawnTicks：定义该变量以承载业务值。 */
  respawnTicks: number;
  level?: number;
/** expMultiplier：定义该变量以承载业务值。 */
  expMultiplier: number;
/** drops：定义该变量以承载业务值。 */
  drops: DropConfig[];
}

/** MapData：定义该接口的能力与字段约束。 */
export interface MapData {
/** meta：定义该变量以承载业务值。 */
  meta: MapMeta;
/** tiles：定义该变量以承载业务值。 */
  tiles: Tile[][];
/** portals：定义该变量以承载业务值。 */
  portals: Portal[];
/** auraPoints：定义该变量以承载业务值。 */
  auraPoints: MapAuraPoint[];
/** baseAuraValues：定义该变量以承载业务值。 */
  baseAuraValues: Map<string, number>;
/** baseResourceValues：定义该变量以承载业务值。 */
  baseResourceValues: Map<string, Map<string, number>>;
/** safeZones：定义该变量以承载业务值。 */
  safeZones: SafeZoneConfig[];
/** containers：定义该变量以承载业务值。 */
  containers: ContainerConfig[];
/** npcs：定义该变量以承载业务值。 */
  npcs: NpcConfig[];
/** monsterSpawns：定义该变量以承载业务值。 */
  monsterSpawns: MonsterSpawnConfig[];
/** minimap：定义该变量以承载业务值。 */
  minimap: MapMinimapSnapshot;
/** minimapSignature：定义该变量以承载业务值。 */
  minimapSignature: string;
/** spawnPoint：定义该变量以承载业务值。 */
  spawnPoint: { x: number; y: number };
/** source：定义该变量以承载业务值。 */
  source: GmMapDocument;
}

/** MapAuraPoint：定义该接口的能力与字段约束。 */
export interface MapAuraPoint {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** value：定义该变量以承载业务值。 */
  value: number;
}

/** MapTileResourcePoint：定义该接口的能力与字段约束。 */
export interface MapTileResourcePoint {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** resourceKey：定义该变量以承载业务值。 */
  resourceKey: string;
/** value：定义该变量以承载业务值。 */
  value: number;
}

/** DynamicTileState：定义该接口的能力与字段约束。 */
export interface DynamicTileState {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** originalType：定义该变量以承载业务值。 */
  originalType: TileType;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** destroyed：定义该变量以承载业务值。 */
  destroyed: boolean;
  restoreTicksLeft?: number;
  transformedType?: TileType;
  transformTicksLeft?: number;
}

/** resolveMonsterSpawnPopulation：执行对应的业务逻辑。 */
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

/** maxAlive：定义该变量以承载业务值。 */
  const maxAlive = Math.max(1, Math.round(configuredMaxAlive));
/** count：定义该变量以承载业务值。 */
  const count = Math.min(Math.max(1, Math.round(configuredCount)), maxAlive);
  return { count, maxAlive };
}

/** PersistedDynamicTileRecord：定义该接口的能力与字段约束。 */
export interface PersistedDynamicTileRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** destroyed：定义该变量以承载业务值。 */
  destroyed: boolean;
  restoreTicksLeft?: number;
  transformedType?: TileType;
  transformTicksLeft?: number;
}

/** PersistedDynamicTileSnapshot：定义该接口的能力与字段约束。 */
export interface PersistedDynamicTileSnapshot {
/** version：定义该变量以承载业务值。 */
  version: 1;
/** maps：定义该变量以承载业务值。 */
  maps: Record<string, PersistedDynamicTileRecord[]>;
}

/** PersistedAuraRecord：定义该接口的能力与字段约束。 */
export interface PersistedAuraRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** value：定义该变量以承载业务值。 */
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}

/** PersistedAuraSnapshot：定义该接口的能力与字段约束。 */
export interface PersistedAuraSnapshot {
/** version：定义该变量以承载业务值。 */
  version: 1;
/** maps：定义该变量以承载业务值。 */
  maps: Record<string, PersistedAuraRecord[]>;
}

/** PersistedTileRuntimeTerrainRecord：定义该接口的能力与字段约束。 */
export interface PersistedTileRuntimeTerrainRecord {
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** destroyed：定义该变量以承载业务值。 */
  destroyed: boolean;
  restoreTicksLeft?: number;
  transformedType?: TileType;
  transformTicksLeft?: number;
}

/** PersistedTileRuntimeResourceRecord：定义该接口的能力与字段约束。 */
export interface PersistedTileRuntimeResourceRecord {
/** value：定义该变量以承载业务值。 */
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}

/** TileResourceRuntimeState：定义该接口的能力与字段约束。 */
export interface TileResourceRuntimeState extends PersistedTileRuntimeResourceRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
}

/** TileResourceStateMap：定义该类型的结构与数据语义。 */
export type TileResourceStateMap = Map<string, TileResourceRuntimeState>;
/** TileResourceBucketMap：定义该类型的结构与数据语义。 */
export type TileResourceBucketMap = Map<string, TileResourceStateMap>;

/** PersistedTileRuntimeRecord：定义该接口的能力与字段约束。 */
export interface PersistedTileRuntimeRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  terrain?: PersistedTileRuntimeTerrainRecord;
  resources?: Record<string, PersistedTileRuntimeResourceRecord>;
}

/** PersistedMapTimeState：定义该接口的能力与字段约束。 */
export interface PersistedMapTimeState {
  totalTicks?: number;
  config?: MapTimeConfig;
  tickSpeed?: number;
}

/** PersistedTileRuntimeSnapshot：定义该接口的能力与字段约束。 */
export interface PersistedTileRuntimeSnapshot {
/** version：定义该变量以承载业务值。 */
  version: 1 | 2;
/** maps：定义该变量以承载业务值。 */
  maps: Record<string, PersistedTileRuntimeRecord[]>;
  time?: Record<string, PersistedMapTimeState>;
}

/** SyncedMapDocument：定义该接口的能力与字段约束。 */
export interface SyncedMapDocument {
/** document：定义该变量以承载业务值。 */
  document: GmMapDocument;
  previousDocument?: GmMapDocument;
}

/** MAP_DOCUMENT_SCOPE：定义该变量以承载业务值。 */
export const MAP_DOCUMENT_SCOPE = 'map_document';
/** RUNTIME_STATE_SCOPE：定义该变量以承载业务值。 */
export const RUNTIME_STATE_SCOPE = 'runtime_state';
/** MAP_TILE_RUNTIME_DOCUMENT_KEY：定义该变量以承载业务值。 */
export const MAP_TILE_RUNTIME_DOCUMENT_KEY = 'map_tile';
/** LEGACY_AURA_RESOURCE_KEY：定义该变量以承载业务值。 */
export const LEGACY_AURA_RESOURCE_KEY = 'aura';
/** AURA_RESOURCE_KEY：定义该变量以承载业务值。 */
export const AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
/** DISPERSED_AURA_RESOURCE_KEY：定义该变量以承载业务值。 */
export const DISPERSED_AURA_RESOURCE_KEY = buildQiResourceKey(DISPERSED_AURA_RESOURCE_DESCRIPTOR);

/** TileResourceFlowConfig：定义该接口的能力与字段约束。 */
export interface TileResourceFlowConfig {
/** halfLifeRateScale：定义该变量以承载业务值。 */
  halfLifeRateScale: number;
/** halfLifeRateScaled：定义该变量以承载业务值。 */
  halfLifeRateScaled: number;
/** minimumDecayPerTick：定义该变量以承载业务值。 */
  minimumDecayPerTick: number;
}

/** TILE_RESOURCE_FLOW_CONFIGS：定义该变量以承载业务值。 */
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

/** QI_FAMILY_LABELS：定义该变量以承载业务值。 */
export const QI_FAMILY_LABELS = {
  aura: '灵气',
  demonic: '魔气',
  sha: '煞气',
} as const;

/** QI_FORM_LABELS：定义该变量以承载业务值。 */
export const QI_FORM_LABELS = {
  refined: '凝练',
  dispersed: '逸散',
} as const;

/** QI_ELEMENT_LABELS：定义该变量以承载业务值。 */
export const QI_ELEMENT_LABELS = {
  neutral: '',
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
} as const;

/** OccupantKind：定义该类型的结构与数据语义。 */
export type OccupantKind = 'player' | 'monster';

/** OccupancyCheckOptions：定义该接口的能力与字段约束。 */
export interface OccupancyCheckOptions {
  occupancyId?: string | null;
  actorType?: OccupantKind;
}

/** NpcLocation：定义该接口的能力与字段约束。 */
export interface NpcLocation {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** name：定义该变量以承载业务值。 */
  name: string;
}

/** PortalQueryOptions：定义该接口的能力与字段约束。 */
export interface PortalQueryOptions {
  trigger?: PortalTrigger;
  kind?: PortalKind;
  allowedRouteDomains?: readonly MapRouteDomain[];
}

/** ProjectedPoint：定义该接口的能力与字段约束。 */
export interface ProjectedPoint {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
}

/** PortalObservationHint：定义该接口的能力与字段约束。 */
export interface PortalObservationHint {
/** title：定义该变量以承载业务值。 */
  title: string;
  desc?: string;
}

