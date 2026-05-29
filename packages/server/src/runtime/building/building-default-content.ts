/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 建筑默认内容定义。
 * 提供内置建筑模板（石墙、木门、木窗、地板、蒲团等）和默认风水规则，
 * 在无外部配置文件时作为兜底使用。
 */
import * as fs from 'node:fs';

import { TileType, type BuildingDef } from '@mud/shared';

import { resolveProjectPath } from '../../common/project-path';
import { compileBuildingDefinitions } from './building-content.repository';
import { compileFengShuiRules, type FengShuiRuleDef } from './fengshui-calculator.service';

const DEFAULT_BUILDING_DEFS: BuildingDef[] = [
  {
    id: 'stone_wall',
    name: '石墙',
    visual: { tileType: TileType.Wall, layer: 'structure' },
    placement: { layer: 'structure', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: true, blocksSight: true, roomBoundary: 100, shaShield: 20 },
    fengShui: { elementVector: { earth: 10 }, traits: ['structure.wall', 'material.stone'], stability: 6 },
    economy: { maxHp: 120, cost: [{ itemId: 'stone', count: 1 }] },
  },
  {
    id: 'wooden_door',
    name: '木门',
    visual: { tileType: TileType.Door, layer: 'structure' },
    placement: { layer: 'structure', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: false, blocksSight: false, roomBoundary: 100, opening: 'door' },
    fengShui: { elementVector: { wood: 4 }, traits: ['opening.door'], qiLeak: 2 },
    economy: { maxHp: 80, cost: [{ itemId: 'wood', count: 1 }] },
  },
  {
    id: 'wooden_window',
    name: '木窗',
    visual: { tileType: TileType.Window, layer: 'structure' },
    placement: { layer: 'structure', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: true, blocksSight: false, roomBoundary: 100, opening: 'window' },
    fengShui: { elementVector: { wood: 3 }, traits: ['opening.window'], comfort: 2 },
    economy: { maxHp: 60, cost: [{ itemId: 'wood', count: 1 }] },
  },
  {
    id: 'plain_floor',
    name: '地板',
    visual: { tileType: TileType.Floor, layer: 'terrain' },
    placement: { layer: 'floor', footprint: [{ dx: 0, dy: 0 }], allowOverlapLayers: ['structure', 'furniture', 'facility'] },
    topology: { roofCoverage: 100 },
    fengShui: { traits: ['floor.basic'], stability: 2 },
    economy: { maxHp: 80, cost: [{ itemId: 'wood', count: 1 }] },
  },
  {
    id: 'meditation_mat',
    name: '蒲团',
    placement: { layer: 'furniture', footprint: [{ dx: 0, dy: 0 }] },
    fengShui: { elementVector: { water: 8, wood: 4 }, traits: ['facility.meditation', 'comfort.seat'], comfort: 8, stability: 4 },
    economy: { maxHp: 40, cost: [{ itemId: 'cloth', count: 1 }] },
  },
  {
    id: 'wooden_bed',
    name: '木床',
    placement: { layer: 'furniture', footprint: [{ dx: 0, dy: 0 }] },
    fengShui: { elementVector: { wood: 12, earth: 4 }, traits: ['comfort.rest'], comfort: 16, stability: 6 },
    economy: { maxHp: 90, cost: [{ itemId: 'wood', count: 2 }] },
  },
  {
    id: 'alchemy_furnace',
    name: '丹炉',
    placement: { layer: 'facility', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: true },
    fengShui: { elementVector: { fire: 20, earth: 6 }, traits: ['facility.alchemy.heat_source'], comfort: -2, stability: 4, shaEmit: 3 },
    economy: { maxHp: 150, cost: [{ itemId: 'stone', count: 2 }] },
  },
  {
    id: 'storage_shelf',
    name: '储物架',
    placement: { layer: 'furniture', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: true },
    fengShui: { elementVector: { earth: 10, metal: 5 }, traits: ['storage.shelf'], stability: 8 },
    economy: { maxHp: 90, cost: [{ itemId: 'wood', count: 2 }] },
  },
  {
    id: 'scripture_platform',
    name: '藏经台',
    placement: { layer: 'facility', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: true },
    fengShui: {
      elementVector: { wood: 18, earth: 4 },
      traits: ['facility.scripture_platform', 'storage.scripture'],
      comfort: 3,
      stability: 10,
      qiAffinity: 2,
    },
    economy: { buildTicks: 3600, durabilityMultiplier: 100, maxHp: 120, cost: [{ itemId: 'wood', count: 8 }] },
  },
  {
    id: 'spirit_screen',
    name: '影壁',
    placement: { layer: 'structure', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: true, blocksSight: true, roomBoundary: 70, shaShield: 60 },
    fengShui: { elementVector: { earth: 8 }, traits: ['sha.screen'], stability: 5, shaReduce: 10 },
    economy: { maxHp: 100, cost: [{ itemId: 'stone', count: 1 }] },
  },
  {
    id: 'covered_corridor',
    name: '回廊',
    visual: { tileType: TileType.Floor, layer: 'terrain' },
    placement: { layer: 'floor', footprint: [{ dx: 0, dy: 0 }], allowOverlapLayers: ['furniture'] },
    topology: { roofCoverage: 60, semiOutdoorLink: true },
    fengShui: { elementVector: { wood: 5 }, traits: ['semi_outdoor.corridor'], comfort: 4 },
    economy: { maxHp: 80, cost: [{ itemId: 'wood', count: 1 }] },
  },
];

const DEFAULT_FENGSHUI_RULES: FengShuiRuleDef[] = [
  { id: 'closed_room', when: [{ enclosedIs: true }], scoreDelta: 80, reasonCode: 'enclosure.closed', severity: 'good' },
  { id: 'open_room', when: [{ enclosedIs: false }], scoreDelta: -120, reasonCode: 'enclosure.open', severity: 'bad' },
  { id: 'no_door', when: [{ metricLte: ['doorCount', 0] }, { enclosedIs: true }], scoreDelta: -80, reasonCode: 'enclosure.no_door', severity: 'warning' },
  { id: 'balanced_area', when: [{ metricGte: ['area', 6] }, { metricLte: ['area', 64] }], scoreDelta: 40, reasonCode: 'shape.area_balanced', severity: 'good' },
  { id: 'roof_covered', when: [{ metricGte: ['roofCoverage', 80] }], scoreDelta: 30, reasonCode: 'shape.roof_covered', severity: 'good' },
  { id: 'alchemy_heat_source', when: [{ roomRoleIs: 'alchemy' }, { traitAtLeast: ['facility.alchemy.heat_source', 1] }], scoreDelta: 60, reasonCode: 'trait.alchemy_heat_source', severity: 'good' },
  { id: 'meditation_facility', when: [{ roomRoleIs: 'meditation' }, { traitAtLeast: ['facility.meditation', 1] }], scoreDelta: 50, reasonCode: 'trait.meditation_facility', severity: 'good' },
  { id: 'rest_comfort', when: [{ roomRoleIs: 'bedroom' }, { traitAtLeast: ['comfort.rest', 1] }], scoreDelta: 50, reasonCode: 'trait.rest_comfort', severity: 'good' },
  { id: 'storage_shelf', when: [{ roomRoleIs: 'storage' }, { traitAtLeast: ['storage.shelf', 1] }], scoreDelta: 45, reasonCode: 'trait.storage_shelf', severity: 'good' },
  { id: 'element_generates_function', when: [{ elementGeneratesFunction: true }], scoreDelta: 45, reasonCode: 'element.generates_function', severity: 'good' },
  { id: 'element_conflicts_function', when: [{ elementConflictsFunction: true }], scoreDelta: -60, reasonCode: 'element.conflicts_function', severity: 'bad' },
  { id: 'qi_dense', when: [{ metricGte: ['qiDensity', 80] }], scoreDelta: 40, reasonCode: 'qi.dense', severity: 'good' },
  { id: 'comfort_good', when: [{ metricGte: ['comfort', 12] }], scoreDelta: 30, reasonCode: 'comfort.good', severity: 'good' },
  { id: 'sha_screen', when: [{ traitAtLeast: ['sha.screen', 1] }], scoreDelta: 20, reasonCode: 'sha.screen', severity: 'good' },
];

let cachedDefaultBuildingRuntime: { catalog: ReturnType<typeof compileBuildingDefinitions>; rules: ReturnType<typeof compileFengShuiRules> } | null = null;

export function getDefaultBuildingRuntime() {
  if (!cachedDefaultBuildingRuntime) {
    const source = loadBuildingRuntimeContent();
    const catalog = compileBuildingDefinitions(source.buildings);
    cachedDefaultBuildingRuntime = {
      catalog,
      rules: compileFengShuiRules(catalog, source.rules),
    };
  }
  return cachedDefaultBuildingRuntime;
}

export function loadBuildingRuntimeContent(): { buildings: BuildingDef[]; rules: FengShuiRuleDef[]; source: string } {
  const baseDir = resolveProjectPath('packages', 'server', 'data', 'content', 'building-runtime');
  const buildingsPath = `${baseDir}/buildings.json`;
  const rulesPath = `${baseDir}/fengshui-rules.json`;
  if (!fs.existsSync(buildingsPath) || !fs.existsSync(rulesPath)) {
    return { buildings: DEFAULT_BUILDING_DEFS, rules: DEFAULT_FENGSHUI_RULES, source: 'builtin' };
  }
  const buildings = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  assertBuildingRuntimeContent(buildings, rules);
  return { buildings, rules: rules as FengShuiRuleDef[], source: baseDir };
}

function assertBuildingRuntimeContent(buildings: unknown, rules: unknown): asserts buildings is BuildingDef[] {
  if (!Array.isArray(buildings) || buildings.length === 0) {
    throw new Error('building_runtime_config_invalid:buildings_empty');
  }
  if (!Array.isArray(rules)) {
    throw new Error('building_runtime_config_invalid:rules_not_array');
  }
  const ids = new Set<string>();
  for (const [index, def] of buildings.entries()) {
    const record = def as BuildingDef;
    if (!record?.id || typeof record.id !== 'string') throw new Error(`building_runtime_config_invalid:id:${index}`);
    if (ids.has(record.id)) throw new Error(`building_runtime_config_invalid:duplicate:${record.id}`);
    ids.add(record.id);
    if (!record.placement || !Array.isArray(record.placement.footprint) || record.placement.footprint.length === 0) {
      throw new Error(`building_runtime_config_invalid:footprint:${record.id}`);
    }
    if (!record.placement.layer) throw new Error(`building_runtime_config_invalid:layer:${record.id}`);
    for (const cell of record.placement.footprint) {
      if (!Number.isFinite(Number(cell.dx)) || !Number.isFinite(Number(cell.dy))) {
        throw new Error(`building_runtime_config_invalid:footprint_cell:${record.id}`);
      }
    }
    for (const cost of record.economy?.cost ?? []) {
      if (!cost.itemId || !Number.isFinite(Number(cost.count)) || Number(cost.count) <= 0) {
        throw new Error(`building_runtime_config_invalid:cost:${record.id}`);
      }
    }
  }
}
