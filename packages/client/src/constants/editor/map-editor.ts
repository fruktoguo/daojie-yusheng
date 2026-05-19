/**
 * GM 地图编辑器常量 —— 控制画笔、选区与视图相关选项，便于与 UI 展示分离。
 */
import {
  InteractableKind,
  StructureType,
  SurfaceType,
  TerrainType,
  TileType,
} from '@mud/shared';

/** 可直接绘制的地块类型列表，保持与地图编辑器画笔一致。 */
export const PAINT_TILE_TYPES: TileType[] = [
  TileType.Floor,
  TileType.Road,
  TileType.Trail,
  TileType.Wall,
  TileType.Door,
  TileType.Window,
  TileType.HouseEave,
  TileType.HouseCorner,
  TileType.ScreenWall,
  TileType.Veranda,
  TileType.Grass,
  TileType.Hill,
  TileType.Cliff,
  TileType.Mud,
  TileType.Swamp,
  TileType.Water,
  TileType.Cloud,
  TileType.CloudFloor,
  TileType.Void,
  TileType.Tree,
  TileType.Bamboo,
  TileType.Stone,
  TileType.SpiritOre,
  TileType.BlackIronOre,
];

export const PAINT_TERRAIN_TYPES: TerrainType[] = [
  TerrainType.Floor,
  TerrainType.Grass,
  TerrainType.Hill,
  TerrainType.Cliff,
  TerrainType.Mud,
  TerrainType.Swamp,
  TerrainType.ColdBog,
  TerrainType.MoltenPool,
  TerrainType.Water,
  TerrainType.Cloud,
  TerrainType.CloudFloor,
  TerrainType.Void,
];

export const PAINT_SURFACE_TYPES: Array<SurfaceType | null> = [
  null,
  SurfaceType.Floor,
  SurfaceType.Road,
  SurfaceType.Trail,
  SurfaceType.Veranda,
  SurfaceType.StoneStairs,
];

export const PAINT_STRUCTURE_TYPES: Array<StructureType | null> = [
  null,
  StructureType.Wall,
  StructureType.Door,
  StructureType.Window,
  StructureType.HouseEave,
  StructureType.HouseCorner,
  StructureType.ScreenWall,
  StructureType.Tree,
  StructureType.Bamboo,
  StructureType.Stone,
  StructureType.SpiritOre,
  StructureType.BlackIronOre,
  StructureType.BrokenSwordHeap,
];

export const PAINT_INTERACTABLE_KINDS: Array<InteractableKind | null> = [
  null,
  InteractableKind.Portal,
  InteractableKind.Stairs,
  InteractableKind.Container,
  InteractableKind.Formation,
  InteractableKind.Mechanism,
];

/** 左侧工具栏按钮与提示。 */
export const TOOL_OPTIONS: Array<{
/**
 * value：值数值。
 */
/**
 * value：值数值。
 */
 value: 'select' | 'paint' | 'pan';
 /**
 * label：label名称或显示文本。
 */
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * note：note相关字段。
 */
/**
 * note：note相关字段。
 */
 note: string }> = [
  { value: 'select', label: '选取', note: '检查当前格与对象' },
  { value: 'paint', label: '绘制', note: '左键拖拽刷地块' },
  { value: 'pan', label: '平移', note: '左键拖动画布' },
];

/** 可绘制图层配置，保留旧地块组合，并提供四层真源画笔。 */
export const PAINT_LAYER_OPTIONS: Array<{
/**
 * value：值数值。
 */
/**
 * value：值数值。
 */
 value: 'tile' | 'terrain' | 'surface' | 'structure' | 'interactable' | 'aura' | 'resource';
 /**
 * label：label名称或显示文本。
 */
/**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'tile', label: '地块' },
  { value: 'terrain', label: '地形' },
  { value: 'surface', label: '地表' },
  { value: 'structure', label: '结构' },
  { value: 'interactable', label: '交互' },
  { value: 'aura', label: '无属性灵气' },
  { value: 'resource', label: '气机' },
];

/** 灵气刷子等级，用于快速切换。 */
export const AURA_BRUSH_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const;

/** 右侧检查器的标签页顺序与文字。 */
export const INSPECTOR_TABS: Array<{
/**
 * value：值数值。
 */
/**
 * value：值数值。
 */
 value: 'selection' | 'meta' | 'compose' | 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';
 /**
 * label：label名称或显示文本。
 */
/**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'selection', label: '选区' },
  { value: 'meta', label: '地图' },
  { value: 'compose', label: '拼图' },
  { value: 'portal', label: '传送点' },
  { value: 'npc', label: '场景人物' },
  { value: 'monster', label: '怪物' },
  { value: 'aura', label: '无属性灵气' },
  { value: 'resource', label: '气机' },
  { value: 'safeZone', label: '安全区' },
  { value: 'landmark', label: '地标' },
  { value: 'container', label: '容器' },
];

/** 编辑器画布的基础单元像素尺寸。 */
export const EDITOR_BASE_CELL_SIZE = 32;

/** 编辑器提供的缩放级别与默认索引，用于视角预设。 */
export const EDITOR_ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3] as const;
/** DEFAULT_EDITOR_ZOOM_INDEX：编辑器缩放索引默认值。 */
export const DEFAULT_EDITOR_ZOOM_INDEX = 3;

/** 撤销栈最多保留的步数。 */
export const MAX_UNDO_STEPS = 50;

