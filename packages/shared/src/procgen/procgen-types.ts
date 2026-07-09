/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：配置 schema 与结果类型。
 *
 * 设计口径：
 * - 生成器只认"地块生成档案（ProcgenTileDef）"，默认档案由 shared 层枚举派生，
 *   新地块通过配置追加/覆盖，不需要改生成器代码。
 * - 一个秘境地貌 = 一份 ProcgenBiomePreset，声明使用哪些地块、噪声场参数、
 *   地形规则、结构放置规则、连通性策略与传送阵数量。
 * - 同一 seed + 同一 preset + 同一地块目录 => 永远生成同一张地图（确定性）。
 */

/** 地块所属层，对应 format:2 的三个字符网格层。 */
export type ProcgenLayer = 'terrain' | 'surface' | 'structure';

/** 地块生成档案：生成器眼中一种地块的全部参数。 */
export interface ProcgenTileDef {
  /** 唯一 id；默认档案直接使用 TerrainType/SurfaceType/StructureType 的枚举值。 */
  id: string;
  layer: ProcgenLayer;
  /** 展示名（中文）。 */
  name: string;
  /** format:2 导出字符；同层内必须唯一。 */
  char: string;
  /** 预览渲染色（demo/编辑器用，不进运行时协议）。 */
  color: string;
  /** terrain 层：该地貌是否可行走。surface/structure 层忽略。 */
  walkable?: boolean;
  /** structure 层：是否阻挡移动。terrain/surface 层忽略。 */
  blocksMove?: boolean;
  tags?: readonly string[];
}

/** 噪声场参数（分形值噪声）。 */
export interface ProcgenFieldSpec {
  /** 基础尺度（格）：越大地貌块越大。 */
  scale: number;
  /** 分形层数：越多细节越丰富。 */
  octaves: number;
  /** 每层振幅衰减（0-1）。 */
  persistence: number;
  /** 域扭曲强度（0-1，可选）：让地貌边缘更蜿蜒自然。 */
  warp?: number;
}

/** 地形规则命中条件；全部给定区间同时命中才算命中。区间为闭区间 [min,max]。 */
export interface ProcgenCondition {
  /** 高度场取值区间（0-1）。 */
  elevation?: readonly [number, number];
  /** 湿度场取值区间（0-1）。 */
  moisture?: readonly [number, number];
  /** 距地图边缘的切比雪夫格数区间。 */
  edgeDistance?: readonly [number, number];
}

/** 地形层规则：按顺序首条命中生效；都不命中则用 baseTerrain。 */
export interface ProcgenTerrainRule {
  /** terrain 层地块 id。 */
  tile: string;
  when?: ProcgenCondition;
}

/** 成簇放置参数（矿脉、石群等）。区间均为 [min,max]，按 seed 取定值。 */
export interface ProcgenClusterSpec {
  count: readonly [number, number];
  size: readonly [number, number];
}

/** 结构层放置规则。density 与 clusters 至少给一个。 */
export interface ProcgenStructureRule {
  /** structure 层地块 id。 */
  tile: string;
  /** 允许落在哪些 terrain 地块上。 */
  on: readonly string[];
  /** 独立散布概率（0-1，逐格判定）。 */
  density?: number;
  /** 成簇放置（随机游走生长）。 */
  clusters?: ProcgenClusterSpec;
  /** 邻近约束：radius 格内必须存在 tiles 之一（如矿脉只长在崖边）。 */
  nearTiles?: { tiles: readonly string[]; radius: number };
  /** 最小间距（格），用于散布模式防止糊成一片。 */
  minSpacing?: number;
  /** 出生点周围保留净空半径（格）。 */
  keepClearOfSpawn?: number;
}

/** 道路生成参数：把出生点、传送阵和若干兴趣点用铺装连起来。 */
export interface ProcgenPathSpec {
  /** surface 层地块 id（如 trail/road）。 */
  tile: string;
  /** 额外兴趣点数量区间。 */
  extraPoiCount: readonly [number, number];
  /** 路径抖动（0-1）：0 为近似直线，越大越蜿蜒。 */
  wobble: number;
}

/** 连通性策略：carve=把孤立可走区域用通道凿通；fill=把孤立区域回填为不可走。 */
export interface ProcgenConnectivitySpec {
  mode: 'carve' | 'fill';
  /** carve 时通道使用的 terrain 地块 id（默认 baseTerrain）。 */
  carveTile?: string;
  /** 小于该格数的孤立区域直接回填（默认 8）。 */
  fillThreshold?: number;
}

/**
 * 房屋风格：
 * - courtyard 完整院落：闭合外墙 + 门窗 + 可多间，会被 room-detection 识别为房间。
 * - ruins 荒废遗迹：残缺墙段、可撒断剑堆/碎石，保留至少一个可进的门。
 * - village 成片村落：一片区域内多栋小房沿空地排布。
 */
export type ProcgenBuildingStyle = 'courtyard' | 'ruins' | 'village';

/** 房屋内部内容锚点生成参数（生成器只给位置，具体掉落/怪物 id 由策划在编辑器填）。 */
export interface ProcgenBuildingContentSpec {
  /** 每栋房子内部放宝箱锚点的概率 0-1。 */
  chestChance?: number;
  /** 每栋房子内部放怪物据点锚点的概率 0-1。 */
  monsterChance?: number;
}

/** 房屋生成规则：每个地貌预设自选风格与参数。 */
export interface ProcgenBuildingSpec {
  style: ProcgenBuildingStyle;
  /** 房屋（village 为聚落）数量区间。 */
  count: readonly [number, number];
  /** 单栋外墙包围盒尺寸区间（含墙，格）。 */
  size: { width: readonly [number, number]; height: readonly [number, number] };
  /** 只在这些 terrain 地块上建房。 */
  on: readonly string[];
  /** 墙 structure 地块 id（默认 wall）。 */
  wallTile?: string;
  /** 门 structure 地块 id（默认 door）。 */
  doorTile?: string;
  /** 窗 structure 地块 id 与开窗概率（0-1，逐段判定）。 */
  windowTile?: string;
  windowChance?: number;
  /** 室内地板 surface 地块 id（可选，铺在房屋内部空地）。 */
  floorTile?: string;
  /** ruins：墙段残缺率 0-1（越大越破，但始终保留至少一个门）。 */
  ruinBreakage?: number;
  /** ruins：房内可撒的碎物 structure 地块 id（如 broken_sword_heap/stone）。 */
  ruinDebrisTile?: string;
  /** village：单个聚落含房屋数区间。 */
  villageHouses?: readonly [number, number];
  /** 离出生点/传送阵/其他房屋的净空（格）。 */
  keepClear?: number;
  /** 内部内容锚点。 */
  content?: ProcgenBuildingContentSpec;
}

/** 内容锚点种类。生成器只给位置与语义，具体 itemId/monsterId 由服务端在实例创建期决定。 */
export type ProcgenAnchorKind = 'chest' | 'monster' | 'boss' | 'herb' | 'scripture' | 'lock' | 'key';

/**
 * 内容锚点。关键奖励挂拓扑节点（nodeId 非空），普通草药/杂兵按地形撒（nodeId 为空）。
 * 锁-钥用 gateGroupId/keyGroupId 配对：持有 keyGroupId 才能通过同号的 gateGroupId。
 */
export interface ProcgenContentAnchor {
  x: number;
  y: number;
  kind: ProcgenAnchorKind;
  /** requires：通过此锚点需持有该组钥匙。 */
  gateGroupId?: number;
  /** grants：取得此锚点授予该组钥匙。 */
  keyGroupId?: number;
  /** 所属拓扑节点的 nodeId；filler 内容不挂节点。 */
  nodeId?: string;
}

// ───────────────────────── 分区拼装（可选管线） ─────────────────────────
// 详见 docs/design/systems/秘境地形生成设计.md
// preset 不填 partition 时，生成器走原有的全图单一噪声管线，行为完全不变。

/** 区域生成器种类。 */
export type ProcgenRegionKind = 'open' | 'maze' | 'dungeon' | 'vault' | 'boss' | 'corridor' | 'transition';

/** 关卡拓扑节点角色。 */
export type ProcgenNodeRole = 'entry' | 'combat' | 'vault' | 'boss' | 'exit' | 'branch' | 'hub';

export interface ProcgenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** BSP 分区参数。区数 N = clamp(round(area(R0) / targetArea), 2, maxRegions)。 */
export interface ProcgenPartitionSpec {
  /** 单区目标面积（格）。默认 1600。太大会让区数恒被夹到下界。 */
  targetArea?: number;
  /** 区的最小边长（格）。默认 18。 */
  minSide?: number;
  /** 区数上限。默认 24。 */
  maxRegions?: number;
  /** 长宽比超过该值强制切长轴（防细条）。默认 2.2。 */
  maxAspect?: number;
}

/** 迷宫：Recursive Backtracker + dead-end braiding。 */
/**
 * 迷宫区：山崖地形拼出的天然迷宫。
 *
 * 墙体是 terrain 层的不可走地形（山体），不是 structure 层的一格厚砖墙 ——
 * 后者渲染出来是网格纸迷宫，与秘境的山野观感不符。通道宽度由 corridorRadius 与
 * roughness 共同调制，因此宽窄不一，像山谷间的峡道。
 */
export interface ProcgenMazeSpec {
  /** 拆死胡同成环的比例（0-1）。0 = 完美迷宫。 */
  braidRate?: number;
  /** 山体地形 id，必须不可走（如 cliff）。 */
  wallTerrain: string;
  /** 通道地形 id。 */
  floorTile?: string;
  /** 通道贴着山体的一圈过渡地形（须可走，如 hill）；省略则不铺山脚。 */
  slopeTile?: string;
  /** 迷宫单元间距（格）。越大山体越厚、通道越疏朗。 */
  cellPitch?: readonly [number, number];
  /** 通道半径基准（格）。1 ≈ 单格小径，2 ≈ 三格宽峡道。 */
  corridorRadius?: readonly [number, number];
  /** 山体边缘起伏强度（0-1）。0 = 等宽通道，1 = 从一线天到开阔谷地。 */
  roughness?: number;
  /** 通道蜿蜒度（0-1）。0 = 笔直峡道，越大越曲折。 */
  wobble?: number;
}

/** 地牢：嵌套 BSP 房间 + L 形直角走廊。 */
export interface ProcgenDungeonSpec {
  roomTargetArea?: number;
  minRoom?: number;
  jitter?: readonly [number, number];
  wallTile: string;
  doorTile: string;
  floorTile?: string;
}

/** 宝库：封闭房 + 单扇锁门 + 中心宝箱。 */
export interface ProcgenVaultSpec {
  wallTile: string;
  doorTile: string;
  floorTile?: string;
  /** 柱阵地块（可选，纯装饰）。 */
  pillarTile?: string;
}

/** boss 房：大 chamber + 宽入口。 */
export interface ProcgenBossSpec {
  wallTile: string;
  entranceWidth?: readonly [number, number];
  floorTile?: string;
  pillarTile?: string;
}

/** 走廊区：细条叶的贯穿脊。 */
export interface ProcgenCorridorSpec {
  floorTile?: string;
  width?: number;
}

export interface ProcgenRegionGenSpec {
  maze?: ProcgenMazeSpec;
  dungeon?: ProcgenDungeonSpec;
  vault?: ProcgenVaultSpec;
  boss?: ProcgenBossSpec;
  corridor?: ProcgenCorridorSpec;
  /** 每种区域可覆盖 terrainRules（否则用 preset.terrainRules）。 */
  openTerrainRulesByKind?: Record<string, readonly ProcgenTerrainRule[]>;
}

/** 拓扑骨架参数。 */
export interface ProcgenTopologySpec {
  /** 临界路上的战斗房数量区间。 */
  combatCount?: readonly [number, number];
  /** 旁支（宝库候选）数量区间。 */
  branchCount?: readonly [number, number];
  /** 锁门数量区间。 */
  lockCount?: readonly [number, number];
}

/** 区间连接口：门位在生成前预留，作为区域生成器的强制通道。 */
export interface ProcgenRegionPort {
  side: 'N' | 'E' | 'S' | 'W';
  x: number;
  y: number;
  toNodeId: string;
  lockId?: number;
}

/** 一个几何区域（BSP 叶）及其被回灌的拓扑角色。 */
export interface ProcgenRegionNode {
  /** BSP 路径串，如 "R.0.1"。与兄弟遍历顺序解耦，作为该区的种子来源。 */
  nodeId: string;
  rect: ProcgenRect;
  kind: ProcgenRegionKind;
  role: ProcgenNodeRole;
  /** 从 entry 区起的 RAG 图距。 */
  depth: number;
  ports: ProcgenRegionPort[];
}

export interface ProcgenLevelEdge {
  id: number;
  from: string;
  to: string;
  kind: 'corridor' | 'portal';
  /** 锁门组号；持有同号钥匙才能通过。 */
  lockId?: number;
  /** 临界路（entry→boss 最短路）上的边：禁 braid、禁旁路。 */
  critical: boolean;
}

export interface ProcgenLevelGraph {
  nodes: readonly ProcgenRegionNode[];
  edges: readonly ProcgenLevelEdge[];
  /** entry→boss 的最短路（nodeId 序列）。 */
  criticalPath: readonly string[];
}

/** 秘境地貌预设：一份配置完整描述一种秘境的地貌生成方式。 */
export interface ProcgenBiomePreset {
  id: string;
  name: string;
  description?: string;
  /** 宽高随机区间（格）。 */
  size: { width: readonly [number, number]; height: readonly [number, number] };
  /** 默认底层地貌（terrain 地块 id）。 */
  baseTerrain: string;
  /** 封闭边界：秘境四周的不可走环带，厚度随噪声起伏。 */
  border: { tile: string; thickness: readonly [number, number] };
  /** 噪声场定义。 */
  fields: { elevation: ProcgenFieldSpec; moisture: ProcgenFieldSpec };
  terrainRules: readonly ProcgenTerrainRule[];
  /** 元胞自动机平滑迭代次数（去噪点、让地貌成片）。 */
  smoothing: { iterations: number };
  structures: readonly ProcgenStructureRule[];
  /** 房屋生成（可选）：在结构散布前占地画房，产出 structure 字符与内容锚点。 */
  buildings?: ProcgenBuildingSpec;
  paths?: ProcgenPathSpec;
  connectivity: ProcgenConnectivitySpec;
  /** 出口传送阵数量（入口固定 1 个，位于出生点）。 */
  exitPortalCount: number;
  /** 可行走占比合法区间，超出会产生 warning。 */
  walkableRatioRange: readonly [number, number];
  /** 分区拼装：填了才启用，不填走原全图单一噪声管线。 */
  partition?: ProcgenPartitionSpec;
  /** 分区拼装：各区域生成器参数。启用 partition 时必填。 */
  regionGen?: ProcgenRegionGenSpec;
  /** 分区拼装：拓扑骨架参数。 */
  topology?: ProcgenTopologySpec;
}

/** 生成的传送阵位置。 */
export interface ProcgenPortalPlacement {
  x: number;
  y: number;
  role: 'entry' | 'exit';
}

/** 生成统计，用于校验与考核。 */
export interface ProcgenMapStats {
  walkableRatio: number;
  /** 连通性处理后的可走连通块数量（carve 模式应为 1）。 */
  regionCount: number;
  carvedCells: number;
  filledCells: number;
  /** 实际落地的房屋数（预设未配置 buildings 时为 0）。门数不等于房屋数：院落含内墙门。 */
  buildingCount: number;
  /** 各层地块数量统计，key 为 `${layer}:${tileId}`。 */
  tileCounts: Record<string, number>;
  /** 分区拼装：几何区域数（未启用分区时为 0）。 */
  spatialRegionCount: number;
  /** 分区拼装：各区域种类的数量。 */
  regionKindCounts: Record<string, number>;
  /** 分区拼装：锁门数。 */
  lockCount: number;
}

/** 生成结果：既含 format:2 字符网格，也含扁平 id 数组（idx = y*width+x）。 */
export interface ProcgenMapResult {
  seed: string;
  presetId: string;
  width: number;
  height: number;
  terrainRows: string[];
  surfaceRows: string[];
  structureRows: string[];
  terrainIds: string[];
  surfaceIds: (string | null)[];
  structureIds: (string | null)[];
  spawnPoint: { x: number; y: number };
  portals: ProcgenPortalPlacement[];
  /** 内容锚点（宝箱/怪物/草药/藏经台/boss/锁/钥），供服务端在实例创建期翻译成具体内容。 */
  contentAnchors: ProcgenContentAnchor[];
  /**
   * 分区拼装：图内成对传送阵（纯冗余 cross-link，绝不是任何区域的唯一通路）。
   * 走返回字段而非地图 document 顶层——document 是白名单重建，自定义字段会被静默丢弃。
   * 运行时若不支持图内传送，调用方直接忽略即可，走廊保底连通。
   */
  portalPairs?: { a: { x: number; y: number }; b: { x: number; y: number }; lockId?: number }[];
  /** 分区拼装：几何区域表（未启用分区时缺省）。 */
  regions?: readonly ProcgenRegionNode[];
  /** 分区拼装：关卡拓扑图（未启用分区时缺省）。 */
  levelGraph?: ProcgenLevelGraph;
  stats: ProcgenMapStats;
  warnings: string[];
}

/** 生成入参：预设 + 地块目录 + seed（可选尺寸覆盖）。 */
export interface ProcgenGenerateOptions {
  preset: ProcgenBiomePreset;
  /** 地块目录；缺省用 buildProcgenTileCatalog() 的默认目录。 */
  tiles?: readonly ProcgenTileDef[];
  seed: string;
  /** 覆盖预设的尺寸区间（demo 调参用）；必须为整数。 */
  widthOverride?: number;
  heightOverride?: number;
  /**
   * 允许使用未在 shared 字符表注册的自定义地块字符（仅预览用途，产出 warning）。
   * 默认 false：发现未注册字符直接抛错——这些字符导出后会被运行时解码
   * 静默回退为可走 floor/无结构，封闭边界与可走性口径会失效。
   */
  allowUnregisteredChars?: boolean;
}
