/**
 * GM 地图编辑器常量 —— 控制画笔、选区与视图相关选项，便于与 UI 展示分离。
 */
import { TileType } from '@mud/shared';

/** 可直接绘制的地块类型列表，保持与地图编辑器画笔一致。 */
export const PAINT_TILE_TYPES: TileType[] = [
  TileType.Floor,
  TileType.Road,
  TileType.Trail,
  TileType.Wall,
  TileType.Door,
  TileType.Window,
  TileType.BrokenWindow,
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

/** 左侧工具栏按钮与提示。 */
export const TOOL_OPTIONS: Array<{ value: 'select' | 'paint' | 'pan'; label: string; note: string }> = [
  { value: 'select', label: '选取', note: '检查当前格与对象' },
  { value: 'paint', label: '绘制', note: '左键拖拽刷地块' },
  { value: 'pan', label: '平移', note: '左键拖动画布' },
];

/** 可绘制图层配置，与地块与灵气双通道同步。 */
export const PAINT_LAYER_OPTIONS: Array<{ value: 'tile' | 'aura'; label: string }> = [
  { value: 'tile', label: '地块' },
  { value: 'aura', label: '灵气' },
];

/** 灵气刷子等级，用于快速切换。 */
export const AURA_BRUSH_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const;

/** 右侧检查器的标签页顺序与文字。 */
export const INSPECTOR_TABS: Array<{ value: 'selection' | 'meta' | 'portal' | 'npc' | 'monster' | 'aura' | 'landmark' | 'container'; label: string }> = [
  { value: 'selection', label: '选区' },
  { value: 'meta', label: '地图' },
  { value: 'portal', label: '传送点' },
  { value: 'npc', label: 'NPC' },
  { value: 'monster', label: '怪物' },
  { value: 'aura', label: '灵气' },
  { value: 'landmark', label: '地标' },
  { value: 'container', label: '容器' },
];

/** 编辑器画布的基础单元像素尺寸。 */
export const EDITOR_BASE_CELL_SIZE = 32;

/** 编辑器提供的缩放级别与默认索引，用于视角预设。 */
export const EDITOR_ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3] as const;
export const DEFAULT_EDITOR_ZOOM_INDEX = 3;

/** 撤销栈最多保留的步数。 */
export const MAX_UNDO_STEPS = 50;
