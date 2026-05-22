/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 新地图格式（format:2）分层字符映射。
 *
 * 每层使用独立的中文字符集：
 * - terrain 层：每格必填，描述底层地貌
 * - structure 层：`.` 表示无结构
 * - surface 层：`.` 表示无铺装（整层可省略）
 */
import { TerrainType, StructureType, SurfaceType } from '../../map-layer-types';

// ─── Terrain 层字符映射 ─────────────────────────────────────────────

/** terrain 层：中文字符 → TerrainType */
export const TERRAIN_CHAR_TO_TYPE: ReadonlyMap<string, TerrainType> = new Map([
  ['地', TerrainType.Floor],
  ['草', TerrainType.Grass],
  ['丘', TerrainType.Hill],
  ['崖', TerrainType.Cliff],
  ['泥', TerrainType.Mud],
  ['沼', TerrainType.Swamp],
  ['寒', TerrainType.ColdBog],
  ['熔', TerrainType.MoltenPool],
  ['水', TerrainType.Water],
  ['云', TerrainType.Cloud],
  ['霞', TerrainType.CloudFloor],
  ['空', TerrainType.Void],
]);

/** terrain 层：TerrainType → 中文字符 */
export const TERRAIN_TYPE_TO_CHAR: ReadonlyMap<TerrainType, string> = new Map(
  Array.from(TERRAIN_CHAR_TO_TYPE.entries()).map(([char, type]) => [type, char]),
);

// ─── Structure 层字符映射 ────────────────────────────────────────────

/** structure 层：中文字符 → StructureType（`.` 表示无结构） */
export const STRUCTURE_CHAR_TO_TYPE: ReadonlyMap<string, StructureType> = new Map([
  ['墙', StructureType.Wall],
  ['门', StructureType.Door],
  ['窗', StructureType.Window],
  ['檐', StructureType.HouseEave],
  ['角', StructureType.HouseCorner],
  ['壁', StructureType.ScreenWall],
  ['树', StructureType.Tree],
  ['竹', StructureType.Bamboo],
  ['石', StructureType.Stone],
  ['灵', StructureType.SpiritOre],
  ['铁', StructureType.BlackIronOre],
  ['刃', StructureType.BrokenSwordHeap],
]);

/** structure 层：StructureType → 中文字符 */
export const STRUCTURE_TYPE_TO_CHAR: ReadonlyMap<StructureType, string> = new Map(
  Array.from(STRUCTURE_CHAR_TO_TYPE.entries()).map(([char, type]) => [type, char]),
);

// ─── Surface 层字符映射 ──────────────────────────────────────────────

/** surface 层：中文字符 → SurfaceType（`.` 表示无铺装） */
export const SURFACE_CHAR_TO_TYPE: ReadonlyMap<string, SurfaceType> = new Map([
  ['路', SurfaceType.Road],
  ['径', SurfaceType.Trail],
  ['廊', SurfaceType.Veranda],
  ['阶', SurfaceType.StoneStairs],
  ['板', SurfaceType.Floor],
]);

/** surface 层：SurfaceType → 中文字符 */
export const SURFACE_TYPE_TO_CHAR: ReadonlyMap<SurfaceType, string> = new Map(
  Array.from(SURFACE_CHAR_TO_TYPE.entries()).map(([char, type]) => [type, char]),
);

// ─── 空位标记 ────────────────────────────────────────────────────────

/** structure/surface 层中表示"无内容"的字符 */
export const LAYER_EMPTY_CHAR = '.';
