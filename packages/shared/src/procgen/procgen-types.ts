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
  paths?: ProcgenPathSpec;
  connectivity: ProcgenConnectivitySpec;
  /** 出口传送阵数量（入口固定 1 个，位于出生点）。 */
  exitPortalCount: number;
  /** 可行走占比合法区间，超出会产生 warning。 */
  walkableRatioRange: readonly [number, number];
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
  /** 各层地块数量统计，key 为 `${layer}:${tileId}`。 */
  tileCounts: Record<string, number>;
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
