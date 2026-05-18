/**
 * AOI Envelope Spec 类型定义。
 * 主线程投影出的 plain POJO，作为 worker 的输入。
 * 不含 class instance、Map/Set，可安全 postMessage。
 */

/** 主线程投影出的 envelope spec：view + player 的 POJO 快照 */
export interface EnvelopeSpec {
  /** 玩家 ID */
  playerId: string;
  /** 会话 ID */
  sessionId: string;
  /** 当前 tick */
  tick: number;
  /** 世界修订号 */
  worldRevision: number;
  /** 自身修订号 */
  selfRevision: number;
  /** 实例信息 */
  instance: EnvelopeSpecInstance;
  /** 自身状态 */
  self: EnvelopeSpecSelf;
  /** 可见玩家列表 */
  visiblePlayers: EnvelopeSpecPlayer[];
  /** 本地怪物列表 */
  localMonsters: EnvelopeSpecMonster[];
  /** 本地 NPC 列表 */
  localNpcs: EnvelopeSpecNpc[];
  /** 本地传送门列表 */
  localPortals: EnvelopeSpecPortal[];
  /** 本地地面物品堆 */
  localGroundPiles: EnvelopeSpecGroundPile[];
  /** 本地容器 */
  localContainers: EnvelopeSpecContainer[];
  /** 本地建筑 */
  localBuildings: EnvelopeSpecBuilding[];
  /** 本地阵法 */
  localFormations: EnvelopeSpecFormation[];
  /** 玩家运行时状态快照（用于 selfDelta/panelDelta 计算） */
  playerState: unknown;
}

export interface EnvelopeSpecInstance {
  instanceId: string;
  templateId: string;
  name: string;
  kind?: string;
  width: number;
  height: number;
}

export interface EnvelopeSpecSelf {
  name: string;
  displayName?: string;
  x: number;
  y: number;
  facing: number;
  buffs: unknown[];
  fengShuiLuck?: number;
}

export interface EnvelopeSpecPlayer {
  playerId: string;
  name: string;
  displayName?: string;
  x: number;
  y: number;
  facing: number;
  buffs?: unknown[];
  presentationScale?: number;
}

export interface EnvelopeSpecMonster {
  monsterId: string;
  instanceKey: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  tier?: string;
  alive: boolean;
  facing?: number;
  buffs?: unknown[];
}

export interface EnvelopeSpecNpc {
  npcId: string;
  name: string;
  x: number;
  y: number;
  facing?: number;
}

export interface EnvelopeSpecPortal {
  portalId: string;
  x: number;
  y: number;
  targetMapId: string;
  label?: string;
}

export interface EnvelopeSpecGroundPile {
  x: number;
  y: number;
  items: unknown[];
}

export interface EnvelopeSpecContainer {
  containerId: string;
  x: number;
  y: number;
  name?: string;
  state?: string;
}

export interface EnvelopeSpecBuilding {
  buildingId: string;
  x: number;
  y: number;
  state?: string;
  name?: string;
}

export interface EnvelopeSpecFormation {
  formationId: string;
  x: number;
  y: number;
  name?: string;
  active?: boolean;
}

/** Worker 产出的 envelope 结果 */
export interface EnvelopeResult {
  /** 是否有变化（null 表示无变化，不需要发送） */
  hasChanges: boolean;
  /** worldDelta payload（如有） */
  worldDelta?: unknown;
  /** selfDelta payload（如有） */
  selfDelta?: unknown;
  /** panelDelta payload（如有） */
  panelDelta?: unknown;
  /** mapEnter payload（跨图时） */
  mapEnter?: unknown;
}
