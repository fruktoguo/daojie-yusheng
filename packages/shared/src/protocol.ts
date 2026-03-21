import { Direction, PlayerState, Tile, VisibleTile, RenderEntity, MapMeta, Attributes, Inventory, EquipmentSlots, TechniqueState, ActionDef, AttrBonus, EquipSlot, EntityKind, PlayerRealmState, QuestState, CombatEffect, AutoBattleSkillConfig, ItemType, QuestLine, QuestObjectiveType, GameTimeState, MapTimeConfig, MonsterAggroMode, TechniqueGrade, GroundItemPileView, LootWindowState } from './types';
import { NumericRatioDivisors, NumericStats } from './numeric';

// ===== 事件名 =====

/** 客户端 → 服务端 */
export const C2S = {
  Move: 'c:move',
  MoveTo: 'c:moveTo',
  GmGetState: 'c:gmGetState',
  GmSpawnBots: 'c:gmSpawnBots',
  GmRemoveBots: 'c:gmRemoveBots',
  GmUpdatePlayer: 'c:gmUpdatePlayer',
  GmResetPlayer: 'c:gmResetPlayer',
  Action: 'c:action',
  UpdateAutoBattleSkills: 'c:updateAutoBattleSkills',
  DebugResetSpawn: 'c:debugResetSpawn',
  Chat: 'c:chat',
  UseItem: 'c:useItem',
  DropItem: 'c:dropItem',
  TakeLoot: 'c:takeLoot',
  SortInventory: 'c:sortInventory',
  Equip: 'c:equip',
  Unequip: 'c:unequip',
  Cultivate: 'c:cultivate',
} as const;

/** 服务端 → 客户端 */
export const S2C = {
  Init: 's:init',
  Tick: 's:tick',
  GmState: 's:gmState',
  // 预留事件：当前服务端尚未正式使用
  Enter: 's:enter',
  Leave: 's:leave',
  Kick: 's:kick',
  Error: 's:error',
  // 预留事件：当前服务端尚未正式使用
  Dead: 's:dead',
  Respawn: 's:respawn',
  AttrUpdate: 's:attrUpdate',
  InventoryUpdate: 's:inventoryUpdate',
  EquipmentUpdate: 's:equipmentUpdate',
  TechniqueUpdate: 's:techniqueUpdate',
  ActionsUpdate: 's:actionsUpdate',
  LootWindowUpdate: 's:lootWindowUpdate',
  QuestUpdate: 's:questUpdate',
  SystemMsg: 's:systemMsg',
} as const;

// ===== Payload 类型 =====

/** 移动指令 */
export interface C2S_Move {
  d: Direction;
}

/** 点击目标点移动 */
export interface C2S_MoveTo {
  x: number;
  y: number;
  ignoreVisibilityLimit?: boolean;
  allowNearestReachable?: boolean;
}

export interface C2S_GmGetState {}

export interface C2S_GmSpawnBots {
  count: number;
}

export interface C2S_GmRemoveBots {
  playerIds?: string[];
  all?: boolean;
}

export interface C2S_GmUpdatePlayer {
  playerId: string;
  mapId: string;
  x: number;
  y: number;
  hp: number;
  autoBattle: boolean;
}

export interface C2S_GmResetPlayer {
  playerId: string;
}

/** 动作指令 */
export interface C2S_Action {
  type?: string;
  actionId?: string;
  target?: string;
}

export interface C2S_UpdateAutoBattleSkills {
  skills: AutoBattleSkillConfig[];
}

/** 调试：回出生点 */
export interface C2S_DebugResetSpawn {
  force?: boolean;
}

/** 聊天消息 */
export interface C2S_Chat {
  message: string;
}

/** Tick 更新（紧凑格式） */
export interface S2C_Tick {
  p: RenderEntity[];                              // 玩家可见实体（含自身）
  t: [number, number, string][];                  // [x, y, tileType]
  e: RenderEntity[];                              // 怪物 / NPC 可见实体
  g?: GroundItemPileView[];                       // 视野内地面物品
  fx?: CombatEffect[];                            // 当前 tick 触发的战斗特效
  v?: VisibleTile[][];                            // 视野 tiles（null 表示当前不可见）
  dt?: number;                                    // 实际 tick 间隔（毫秒）
  m?: string;                                     // 当前地图 ID（跨图时用于同步客户端状态）
  mapMeta?: MapMeta;                              // 当前地图元数据
  path?: [number, number][];                      // 当前剩余路径点
  hp?: number;                                    // 当前玩家 HP
  qi?: number;                                    // 当前玩家灵力
  f?: Direction;                                  // 当前玩家朝向
  time?: GameTimeState;                           // 当前地图时间状态
}

/** 实体进入视野 */
export interface S2C_Enter {
  entity: RenderEntity;
}

/** 实体离开视野 */
export interface S2C_Leave {
  entityId: string;
}

/** 初始化数据（连接成功后发送） */
export interface S2C_Init {
  self: PlayerState;
  mapMeta: MapMeta;
  tiles: VisibleTile[][];
  players: RenderEntity[]; // 初始可见玩家实体（含自身）
  time?: GameTimeState;
}

export interface GmPlayerSummary {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  autoBattle: boolean;
  isBot: boolean;
}

export interface S2C_GmState {
  players: GmPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: {
    cpuPercent: number;
    memoryMb: number;
    tickMs: number;
  };
}

/** 错误信息 */
export interface S2C_Error {
  code: string;
  message: string;
}

// ===== 修仙系统 Payload =====

/** 使用物品 */
export interface C2S_UseItem {
  slotIndex: number;
}

/** 丢弃物品 */
export interface C2S_DropItem {
  slotIndex: number;
  count: number;
}

/** 拿取战利品 */
export interface C2S_TakeLoot {
  sourceId: string;
  itemKey: string;
}

/** 整理背包 */
export interface C2S_SortInventory {}

/** 装备物品 */
export interface C2S_Equip {
  slotIndex: number;
}

/** 卸下装备 */
export interface C2S_Unequip {
  slot: EquipSlot;
}

/** 修炼功法 */
export interface C2S_Cultivate {
  techId: string | null; // null 表示停止修炼
}

/** 属性更新 */
export interface S2C_AttrUpdate {
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs: Attributes;
  numericStats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
  maxHp: number;
  qi: number;
  realm?: PlayerRealmState;
}

/** 背包更新 */
export interface S2C_InventoryUpdate {
  inventory: Inventory;
}

/** 装备更新 */
export interface S2C_EquipmentUpdate {
  equipment: EquipmentSlots;
}

/** 功法更新 */
export interface S2C_TechniqueUpdate {
  techniques: TechniqueState[];
  cultivatingTechId?: string;
}

/** 行动列表更新 */
export interface S2C_ActionsUpdate {
  actions: ActionDef[];
  autoBattle?: boolean;
  autoRetaliate?: boolean;
  senseQiActive?: boolean;
}

export interface S2C_LootWindowUpdate {
  window: LootWindowState | null;
}

/** 任务列表更新 */
export interface S2C_QuestUpdate {
  quests: QuestState[];
}

/** 系统消息 */
export interface S2C_SystemMsg {
  text: string;
  kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot';
  from?: string;
  floating?: {
    x: number;
    y: number;
    text: string;
    color?: string;
  };
}

// ===== HTTP 接口 =====

export interface AuthRegisterReq {
  username: string;
  password: string;
  displayName: string;
}

export interface AuthLoginReq {
  username: string;
  password: string;
}

export interface AuthRefreshReq {
  refreshToken: string;
}

export interface AuthTokenRes {
  accessToken: string;
  refreshToken: string;
}

export interface DisplayNameAvailabilityRes {
  available: boolean;
  message?: string;
}

export interface AccountUpdatePasswordReq {
  currentPassword: string;
  newPassword: string;
}

export interface AccountUpdateDisplayNameReq {
  displayName: string;
}

export interface AccountUpdateDisplayNameRes {
  displayName: string;
}

export interface AccountUpdateRoleNameReq {
  roleName: string;
}

export interface AccountUpdateRoleNameRes {
  roleName: string;
}

export interface BasicOkRes {
  ok: true;
}

export interface GmLoginReq {
  password: string;
}

export interface GmLoginRes {
  accessToken: string;
  expiresInSec: number;
}

export interface GmChangePasswordReq {
  currentPassword: string;
  newPassword: string;
}

export interface GmManagedPlayerMeta {
  userId?: string;
  isBot: boolean;
  online: boolean;
  updatedAt?: string;
  dirtyFlags: string[];
}

export interface GmManagedPlayerRecord {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi: number;
  dead: boolean;
  autoBattle: boolean;
  autoRetaliate: boolean;
  meta: GmManagedPlayerMeta;
  snapshot: PlayerState;
}

export interface GmStateRes {
  players: GmManagedPlayerRecord[];
  mapIds: string[];
  botCount: number;
  perf: {
    cpuPercent: number;
    memoryMb: number;
    tickMs: number;
  };
}

export interface GmUpdatePlayerReq {
  snapshot: PlayerState;
}

export interface GmSpawnBotsReq {
  anchorPlayerId: string;
  count: number;
}

export interface GmRemoveBotsReq {
  playerIds?: string[];
  all?: boolean;
}

export interface GmMapPortalRecord {
  x: number;
  y: number;
  targetMapId: string;
  targetX: number;
  targetY: number;
  kind?: 'portal' | 'stairs';
  trigger?: 'manual' | 'auto';
  hidden?: boolean;
  observeTitle?: string;
  observeDesc?: string;
}

export interface GmMapAuraRecord {
  x: number;
  y: number;
  value: number;
}

export interface GmMapLandmarkRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  desc?: string;
  container?: GmMapContainerRecord;
}

export interface GmMapDropRecord {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance?: number;
}

export interface GmMapContainerRecord {
  grade?: TechniqueGrade;
  refreshTicks?: number;
  drops?: GmMapDropRecord[];
}

export interface GmMapQuestRecord {
  id: string;
  title: string;
  desc: string;
  line?: QuestLine;
  chapter?: string;
  story?: string;
  objectiveType?: QuestObjectiveType;
  objectiveText?: string;
  targetName?: string;
  targetMonsterId?: string;
  targetTechniqueId?: string;
  targetRealmStage?: string | number;
  required?: number;
  targetCount?: number;
  rewardItemId?: string;
  rewardText?: string;
  reward?: GmMapDropRecord[];
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
  unlockBreakthroughRequirementIds?: string[];
}

export interface GmMapNpcRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  dialogue: string;
  role?: string;
  quests?: GmMapQuestRecord[];
}

export interface GmMapMonsterSpawnRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  hp: number;
  maxHp?: number;
  attack: number;
  radius?: number;
  maxAlive?: number;
  aggroRange?: number;
  viewRange?: number;
  aggroMode?: MonsterAggroMode;
  respawnSec?: number;
  respawnTicks?: number;
  level?: number;
  expMultiplier?: number;
  drops?: GmMapDropRecord[];
}

export interface GmMapDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  parentMapId?: string;
  parentOriginX?: number;
  parentOriginY?: number;
  floorLevel?: number;
  floorName?: string;
  spaceVisionMode?: 'isolated' | 'parent_overlay';
  description?: string;
  dangerLevel?: number;
  recommendedRealm?: string;
  tiles: string[];
  portals: GmMapPortalRecord[];
  spawnPoint: {
    x: number;
    y: number;
  };
  time?: MapTimeConfig;
  auras?: GmMapAuraRecord[];
  landmarks?: GmMapLandmarkRecord[];
  npcs: GmMapNpcRecord[];
  monsterSpawns: GmMapMonsterSpawnRecord[];
}

export interface GmMapSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  description?: string;
  dangerLevel?: number;
  recommendedRealm?: string;
  portalCount: number;
  npcCount: number;
  monsterSpawnCount: number;
}

export interface GmMapListRes {
  maps: GmMapSummary[];
}

export interface GmMapDetailRes {
  map: GmMapDocument;
}

export interface GmUpdateMapReq {
  map: GmMapDocument;
}
