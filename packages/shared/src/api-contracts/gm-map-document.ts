/**
 * GM 地图文档领域契约（最大块）。
 *
 * 包含地图传送点/灵气/气机/安全区/地块效果/资源节点布点/资源节点分组/地标/
 * 掉落物/容器随机池/容器/任务/NPC 商店商品/NPC/怪物刷新点/4 层地块真源单元
 * 等记录类型，以及完整地图文档、地图列表摘要/响应、地图详情响应和更新地图请求。
 */

import type { Attributes, NumericStatPercentages } from '../attribute-types';
import type { QuestLine, QuestObjectiveType } from '../quest-types';
import type { TechniqueGrade } from '../cultivation-types';
import type { ItemStack, ItemType } from '../item-runtime-types';
import type { MapRouteDomain, MapTimeConfig, MonsterAggroMode, MonsterTier, PortalRouteDomain } from '../world-core-types';
import type { InteractableKind, StructureType, SurfaceType, TerrainType } from '../map-layer-types';
/** GM 地图传送点记录。 */
export interface GmMapPortalRecord {
/**
 * id：同地图内稳定传送点ID。
 */

  id: string;
  /**
 * targetPortalId：双向传送点的目标端ID。
 */

  targetPortalId?: string;
  /**
 * direction：传送方向。
 */

  direction?: 'two_way' | 'one_way';
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId: string;
  /**
 * targetX：目标X相关字段。
 */

  targetX: number;
  /**
 * targetY：目标Y相关字段。
 */

  targetY: number;
  /**
 * kind：kind相关字段。
 */

  kind?: 'portal' | 'stairs';
  /**
 * trigger：trigger相关字段。
 */

  trigger?: 'manual' | 'auto';
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: PortalRouteDomain;
  /**
 * allowPlayerOverlap：allow玩家Overlap相关字段。
 */

  allowPlayerOverlap?: boolean;
  /**
 * hidden：hidden相关字段。
 */

  hidden?: boolean;
  /**
 * observeTitle：observeTitle名称或显示文本。
 */

  observeTitle?: string;
  /**
 * observeDesc：observeDesc相关字段。
 */

  observeDesc?: string;
}

/** GM 地图灵气记录。 */
export interface GmMapAuraRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * value：值数值。
 */

  value: number;
}

/** GM 地图气机记录。 */
export interface GmMapResourceRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * resourceKey：resourceKey标识。
 */

  resourceKey: string;
  /**
 * value：值数值。
 */

  value: number;
}

/** GM 地图安全区记录。 */
export interface GmMapSafeZoneRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * radius：radiu相关字段。
 */

  radius: number;
}

/** GM 地图地块效果区域记录。 */
export interface GmMapTileEffectRecord {
  /**
 * id：ID标识。
 */

  id?: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * movementCost：覆盖地块移动消耗。
 */

  movementCost?: number;
  /**
 * qiDrainPerTick：每息灵力消耗。
 */

  qiDrainPerTick?: number;
}

/** GM 地图资源节点布点记录。 */
export interface GmMapResourceNodePlacementRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
}

/** GM 地图资源节点分组记录。 */
export interface GmMapResourceNodeGroupRecord {
/**
 * resourceNodeId：资源节点 ID。
 */

  resourceNodeId: string;
  /**
 * idPrefix：生成地标 ID 的前缀。
 */

  idPrefix: string;
  /**
 * name：布点显示名称。
 */

  name: string;
  /**
 * placements：布点坐标列表。
 */

  placements: GmMapResourceNodePlacementRecord[];
}

/** GM 地图地标记录。 */
export interface GmMapLandmarkRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * resourceNodeId：resourceNodeID标识。
 */

  resourceNodeId?: string;
  /**
 * container：container相关字段。
 */

  container?: GmMapContainerRecord;
}

/** GM 地图掉落物记录。 */
export interface GmMapDropRecord {
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
 * count：数量或计量字段。
 */

  count: number;
  /**
 * chance：chance相关字段。
 */

  chance?: number;
}

/** GM 地图容器随机池记录。 */
export interface GmMapContainerLootPoolRecord {
/**
 * rolls：roll相关字段。
 */

  rolls?: number;
  /**
 * chance：chance相关字段。
 */

  chance?: number;
  /**
 * minLevel：min等级数值。
 */

  minLevel?: number;
  /**
 * maxLevel：max等级数值。
 */

  maxLevel?: number;
  /**
 * minGrade：minGrade相关字段。
 */

  minGrade?: TechniqueGrade;
  /**
 * maxGrade：maxGrade相关字段。
 */

  maxGrade?: TechniqueGrade;
  /**
 * tagGroups：tagGroup相关字段。
 */

  tagGroups?: string[][];
  /**
 * countMin：数量Min相关字段。
 */

  countMin?: number;
  /**
 * countMax：数量Max相关字段。
 */

  countMax?: number;
  /**
 * allowDuplicates：allowDuplicate相关字段。
 */

  allowDuplicates?: boolean;
}

/** GM 地图容器记录。 */
export interface GmMapContainerRecord {
/**
 * variant：来源附加变体标识。
 */

  variant?: 'herb';
/**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * refreshTicks：refreshtick相关字段。
 */

  refreshTicks?: number;
  /**
 * refreshTicksMin：刷新最小 tick。
 */

  refreshTicksMin?: number;
  /**
 * refreshTicksMax：刷新最大 tick。
 */

  refreshTicksMax?: number;
  /**
 * char：char相关字段。
 */

  char?: string;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * drops：drop相关字段。
 */

  drops?: GmMapDropRecord[];
  /**
 * lootPools：掉落Pool相关字段。
 */

  lootPools?: GmMapContainerLootPoolRecord[];
}

/** GM 地图任务记录。 */
export interface GmMapQuestRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * title：title名称或显示文本。
 */

  title: string;
  /**
 * desc：desc相关字段。
 */

  desc: string;
  /**
 * line：line相关字段。
 */

  line?: QuestLine;
  /**
 * chapter：chapter相关字段。
 */

  chapter?: string;
  /**
 * story：story相关字段。
 */

  story?: string;
  /**
 * objectiveType：objectiveType相关字段。
 */

  objectiveType?: QuestObjectiveType;
  /**
 * objectiveText：objectiveText名称或显示文本。
 */

  objectiveText?: string;
  /**
 * targetName：目标名称名称或显示文本。
 */

  targetName?: string;
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
  /**
 * targetNpcId：目标NPCID标识。
 */

  targetNpcId?: string;
  /**
 * targetNpcName：目标NPC名称名称或显示文本。
 */

  targetNpcName?: string;
  /**
 * targetMonsterId：目标怪物ID标识。
 */

  targetMonsterId?: string;
  /**
 * targetTechniqueId：目标功法ID标识。
 */

  targetTechniqueId?: string;
  /**
 * targetRealmLv：目标境界等级。
 */

  targetRealmLv?: number;
  /**
 * acceptRealmLv：接取任务所需的最低境界等级。
 */

  acceptRealmLv?: number;
  /**
 * required：required相关字段。
 */

  required?: number;
  /**
 * targetCount：数量或计量字段。
 */

  targetCount?: number;
  /**
 * rewardItemId：reward道具ID标识。
 */

  rewardItemId?: string;
  /**
 * rewardText：rewardText名称或显示文本。
 */

  rewardText?: string;
  /**
 * reward：reward相关字段。
 */

  reward?: GmMapDropRecord[];
  /**
 * nextQuestId：next任务ID标识。
 */

  nextQuestId?: string;
  /**
 * requiredItemId：required道具ID标识。
 */

  requiredItemId?: string;
  /**
 * requiredItemCount：数量或计量字段。
 */

  requiredItemCount?: number;
  /**
 * submitNpcId：submitNPCID标识。
 */

  submitNpcId?: string;
  /**
 * submitNpcName：submitNPC名称名称或显示文本。
 */

  submitNpcName?: string;
  /**
 * submitMapId：submit地图ID标识。
 */

  submitMapId?: string;
  /**
 * submitX：submitX相关字段。
 */

  submitX?: number;
  /**
 * submitY：submitY相关字段。
 */

  submitY?: number;
  /**
 * relayMessage：relayMessage相关字段。
 */

  relayMessage?: string;
  /**
 * guideFlowId：任务关联的新手引导组 ID，仅用于客户端展示与重新播放导览。
 */

  guideFlowId?: string;
  /**
 * unlockBreakthroughRequirementIds：unlockBreakthroughRequirementID相关字段。
 */

  unlockBreakthroughRequirementIds?: string[];
}

/** GM 地图 NPC 商店商品记录。 */
export interface GmMapNpcShopItemRecord {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * price：价格数值。
 */

  price?: number;
  /**
 * stockLimit：stockLimit相关字段。
 */

  stockLimit?: number;
  /**
 * refreshSeconds：refreshSecond相关字段。
 */

  refreshSeconds?: number;
  /**
 * priceFormula：价格Formula相关字段。
 */

  priceFormula?: 'technique_realm_square_grade';
}

/** GM 地图 NPC 记录。 */
export interface GmMapNpcRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * char：char相关字段。
 */

  char: string;
  /**
 * color：color相关字段。
 */

  color: string;
  /**
 * dialogue：dialogue相关字段。
 */

  dialogue: string;
  /**
 * role：role相关字段。
 */

  role?: string;
  /**
 * shopItems：集合字段。
 */

  shopItems?: GmMapNpcShopItemRecord[];
  /**
 * quests：集合字段。
 */

  quests?: GmMapQuestRecord[];
}

/** GM 地图怪物刷新点记录。 */
export interface GmMapMonsterSpawnRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * templateId：templateID标识。
 */

  templateId?: string;
  /**
 * name：名称名称或显示文本。
 */

  name?: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * char：char相关字段。
 */

  char?: string;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * hp：hp相关字段。
 */

  hp?: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;
  /**
 * attack：attack相关字段。
 */

  attack?: number;
  /**
 * count：数量或计量字段。
 */

  count?: number;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
  /**
 * maxAlive：maxAlive相关字段。
 */

  maxAlive?: number;
  /**
 * wanderRadius：wanderRadiu相关字段。
 */

  wanderRadius?: number;
  /**
 * aggroRange：aggro范围相关字段。
 */

  aggroRange?: number;
  /**
 * viewRange：视图范围相关字段。
 */

  viewRange?: number;
  /**
 * aggroMode：aggroMode相关字段。
 */

  aggroMode?: MonsterAggroMode;
  /**
 * respawnSec：重生Sec相关字段。
 */

  respawnSec?: number;
  /**
 * respawnTicks：重生tick相关字段。
 */

  respawnTicks?: number;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * statPercents：statPercent相关字段。
 */

  statPercents?: NumericStatPercentages;
  /**
 * skills：技能相关字段。
 */

  skills?: string[];
  /**
 * tier：tier相关字段。
 */

  tier?: MonsterTier;
  /**
 * expMultiplier：expMultiplier相关字段。
 */

  expMultiplier?: number;
  /**
 * drops：drop相关字段。
 */

  drops?: GmMapDropRecord[];
}

/** GM 编辑器里的 4 层地块真源单元。
 * - terrain：底层地形（floor/grass/...），缺省按 floor 处理。
 * - surface：地表铺装（road/trail/...），null 表示无铺装。
 * - structure：地上结构（wall/door/tree/...），null 表示无结构。
 * - interactables：交互对象（portal/stairs/...），缺省空数组。
 * 所有字段都是可选的，缺省时由运行时按多层默认补齐。
 */
export interface GmMapLayeredCellRecord {
  terrain?: TerrainType;
  surface?: SurfaceType | null;
  structure?: StructureType | null;
  interactables?: InteractableKind[];
}

/** GM 编辑器里的完整地图文档。 */
export interface GmMapDocument {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: MapRouteDomain;
  /**
 * mapLv：mapLv相关字段。
 */

  mapLv?: number;
  /**
 * parentMapId：parent地图ID标识。
 */

  parentMapId?: string;
  /**
 * parentOriginX：parentOriginX相关字段。
 */

  parentOriginX?: number;
  /**
 * parentOriginY：parentOriginY相关字段。
 */

  parentOriginY?: number;
  /**
 * floorLevel：floor等级数值。
 */

  floorLevel?: number;
  /**
 * floorName：floor名称名称或显示文本。
 */

  floorName?: string;
  /**
 * spaceVisionMode：spaceVisionMode相关字段。
 */

  spaceVisionMode?: 'isolated' | 'parent_overlay';
  /**
 * description：description相关字段。
 */

  description?: string;
  /**
 * tiles：tile相关字段。
 */

  tiles: string[];
  /**
 * terrainRows：可选底层地形真源（[y][x]）。缺省时由 tiles 字符推断。
 */
  terrainRows?: TerrainType[][];
  /**
 * surfaceRows：可选地表铺装真源（[y][x]）。null 表示该格没有铺装。
 */
  surfaceRows?: (SurfaceType | null)[][];
  /**
 * structureRows：可选地上结构真源（[y][x]）。null 表示该格没有结构。
 */
  structureRows?: (StructureType | null)[][];
  /**
 * interactableRows：可选交互层真源（[y][x][]）。空数组表示该格没有交互层标记。
 */
  interactableRows?: InteractableKind[][][];
  /**
 * layeredCells：可选的 4 层地块真源（[y][x]）。提供时优先于 tiles，由运行时直接读取；
 * 缺省时由服务端从 tiles 字符推断（保持与旧地图完全兼容）。
 */
  layeredCells?: (GmMapLayeredCellRecord | null)[][];
  /**
 * portals：portal相关字段。
 */

  portals: GmMapPortalRecord[];
  /**
 * spawnPoint：spawnPoint相关字段。
 */

  spawnPoint: {
  /**
 * x：x相关字段。
 */

    x: number;
    /**
 * y：y相关字段。
 */

    y: number;
  };
  /**
 * time：时间相关字段。
 */

  time?: MapTimeConfig;
  /**
 * auras：aura相关字段。
 */

  auras?: GmMapAuraRecord[];
  /**
 * resources：resource相关字段。
 */

  resources?: GmMapResourceRecord[];
  /**
 * safeZones：safeZone相关字段。
 */

  safeZones?: GmMapSafeZoneRecord[];
  /**
 * tileEffects：地块移动消耗与环境消耗区域。
 */

  tileEffects?: GmMapTileEffectRecord[];
  /**
 * resourceNodeGroups：资源节点分组布点。
 */

  resourceNodeGroups?: GmMapResourceNodeGroupRecord[];
  /**
 * landmarks：landmark相关字段。
 */

  landmarks?: GmMapLandmarkRecord[];
  /**
 * npcs：NPC相关字段。
 */

  npcs: GmMapNpcRecord[];
  /**
 * monsterSpawns：怪物Spawn相关字段。
 */

  monsterSpawns: GmMapMonsterSpawnRecord[];
}

/** GM 地图列表摘要。 */
export interface GmMapSummary {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: MapRouteDomain;
  /**
 * description：description相关字段。
 */

  description?: string;
  /**
 * mapLv：mapLv相关字段。
 */

  mapLv?: number;
  /**
 * portalCount：数量或计量字段。
 */

  portalCount: number;
  /**
 * npcCount：数量或计量字段。
 */

  npcCount: number;
  /**
 * monsterSpawnCount：数量或计量字段。
 */

  monsterSpawnCount: number;
}

/** GM 地图列表响应。 */
export interface GmMapListRes {
/**
 * maps：地图相关字段。
 */

  maps: GmMapSummary[];
}

/** GM 地图详情响应。 */
export interface GmMapDetailRes {
/**
 * map：缓存或索引容器。
 */

  map: GmMapDocument;
}

/** GM 更新地图请求。 */
export interface GmUpdateMapReq {
/**
 * map：缓存或索引容器。
 */

  map: GmMapDocument;
}

