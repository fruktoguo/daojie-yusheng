/**
 * 建筑内容仓库与编译器。
 * 将 BuildingDef[] 编译为运行时 CompiledBuildingCatalog，
 * 包含拓扑标志、五行向量、特征索引和旋转变体。
 */
import {
  BUILDING_DEFAULT_BUILD_TICKS,
  BUILDING_DEFAULT_DECONSTRUCT_TICKS,
  BUILDING_DEFAULT_MAX_HP,
  BUILDING_LAYER_ID_BY_KEY,
  BUILDING_OPENING_KIND_ID_BY_KEY,
  BUILDING_ROOM_BOUNDARY_MAX,
  BUILDING_ROOF_COVERAGE_MAX,
  BUILDING_SHA_SHIELD_MAX,
  BUILDING_TOPOLOGY_BLOCKS_MOVE,
  BUILDING_TOPOLOGY_BLOCKS_SIGHT,
  BUILDING_TOPOLOGY_ROOM_BOUNDARY,
  BUILDING_TOPOLOGY_SEMI_OUTDOOR_LINK,
  BUILDING_VISUAL_LAYER_ID_BY_KEY,
  FENGSHUI_ELEMENT_INDEX,
  getDefaultTileDurabilityMultiplier,
  resolvePlacementLayerTarget,
  type BuildingDef,
  type CompiledBuildingCatalog,
  type CompiledBuildingDef,
  type FiveElement,
} from '@mud/shared';

const ROTATIONS = [0, 90, 180, 270] as const;

/** 建筑内容仓库：提供 BuildingDef → CompiledBuildingCatalog 的编译入口。 */
export class BuildingContentRepository {
  compile(definitions: readonly BuildingDef[]): CompiledBuildingCatalog {
    return compileBuildingDefinitions(definitions);
  }
}

/** 编译建筑定义数组为运行时目录，校验 ID 唯一性和层合法性。 */
export function compileBuildingDefinitions(definitions: readonly BuildingDef[]): CompiledBuildingCatalog {
  if (!Array.isArray(definitions)) {
    throw new Error('building_defs_invalid:not_array');
  }

  const seenIds = new Set<string>();
  const traitIdsByKey = new Map<string, number>();
  const traitKeysById: string[] = [''];
  const defs: CompiledBuildingDef[] = [];
  const defById = new Map<string, CompiledBuildingDef>();
  const defByHandle: CompiledBuildingDef[] = [];

  definitions.forEach((definition, index) => {
    const id = normalizeRequiredKey(definition?.id, `building_defs[${index}].id`);
    if (seenIds.has(id)) {
      throw new Error(`building_def_duplicate:${id}`);
    }
    seenIds.add(id);

    const name = normalizeOptionalText(definition.name) || id;
    const layer = definition.placement?.layer;
    const layerId = BUILDING_LAYER_ID_BY_KEY[layer];
    if (!layerId) {
      throw new Error(`building_def_invalid_layer:${id}`);
    }
    const cellLayerTarget = resolvePlacementLayerTarget(layer);

    const footprint = Array.isArray(definition.placement?.footprint)
      ? definition.placement.footprint
      : [];
    if (footprint.length === 0) {
      throw new Error(`building_def_empty_footprint:${id}`);
    }

    const topology = definition.topology ?? {};
    const roomBoundary = clampInt(topology.roomBoundary, 0, BUILDING_ROOM_BOUNDARY_MAX);
    const opening = topology.opening ?? 'none';
    const openingKind = BUILDING_OPENING_KIND_ID_BY_KEY[opening];
    if (openingKind === undefined) {
      throw new Error(`building_def_invalid_opening:${id}`);
    }

    const topologyMask = buildTopologyMask(topology, roomBoundary);
    const traitKeys = Array.isArray(definition.fengShui?.traits)
      ? definition.fengShui.traits.map((trait) => normalizeOptionalText(trait)).filter(Boolean)
      : [];
    const traitIds = traitKeys.map((trait) => resolveTraitId(trait, traitIdsByKey, traitKeysById));
    const cost = Array.isArray(definition.economy?.cost) ? definition.economy.cost : [];
    const visualTileType = typeof definition.visual?.tileType === 'string' && definition.visual.tileType.length > 0
      ? definition.visual.tileType
      : undefined;
    const compiled: CompiledBuildingDef = {
      handle: defs.length + 1,
      id,
      name,
      revision: clampInt(definition.revision, 1, Number.MAX_SAFE_INTEGER),
      layerId,
      visualLayerId: BUILDING_VISUAL_LAYER_ID_BY_KEY[definition.visual?.layer ?? 'terrain'] ?? 1,
      visualTileType,
      glyph: normalizeOptionalText(definition.visual?.glyph) || undefined,
      color: normalizeOptionalText(definition.visual?.color) || undefined,
      allowRotate: definition.placement?.allowRotate !== false,
      footprintByRotation: buildFootprintByRotation(footprint),
      topologyMask,
      roomBoundary,
      openingKind,
      roofCoverage: clampInt(topology.roofCoverage, 0, BUILDING_ROOF_COVERAGE_MAX),
      shaShield: clampInt(topology.shaShield, 0, BUILDING_SHA_SHIELD_MAX),
      elementVector: buildElementVector(definition.fengShui?.elementVector ?? {}),
      traitIds: Uint16Array.from(traitIds),
      fengShuiContrib: Int16Array.from([
        clampInt(definition.fengShui?.comfort, -32768, 32767),
        clampInt(definition.fengShui?.stability, -32768, 32767),
        clampInt(definition.fengShui?.qiAffinity, -32768, 32767),
        clampInt(definition.fengShui?.qiLeak, -32768, 32767),
        clampInt(definition.fengShui?.shaEmit, -32768, 32767),
        clampInt(definition.fengShui?.shaReduce, -32768, 32767),
        clampInt(definition.fengShui?.integrityWeight, -32768, 32767),
      ]),
      durabilityMultiplier: resolveBuildingDurabilityMultiplier(definition, visualTileType),
      maxHp: clampInt(definition.economy?.maxHp, 1, Number.MAX_SAFE_INTEGER, BUILDING_DEFAULT_MAX_HP),
      buildTicks: clampInt(definition.economy?.buildTicks, 0, Number.MAX_SAFE_INTEGER, BUILDING_DEFAULT_BUILD_TICKS),
      deconstructTicks: clampInt(
        definition.economy?.deconstructTicks,
        0,
        Number.MAX_SAFE_INTEGER,
        BUILDING_DEFAULT_DECONSTRUCT_TICKS,
      ),
      costItemIds: cost.map((entry, costIndex) => normalizeRequiredKey(entry.itemId, `${id}.cost[${costIndex}].itemId`)),
      costCounts: Uint32Array.from(cost.map((entry) => clampInt(entry.count, 1, Number.MAX_SAFE_INTEGER))),
      cellLayerTarget,
    };

    defs.push(compiled);
    defById.set(id, compiled);
    defByHandle[compiled.handle] = compiled;
  });

  return {
    defs,
    defById,
    defByHandle,
    traitIdsByKey,
    traitKeysById,
  };
}

function buildTopologyMask(
  topology: NonNullable<BuildingDef['topology']>,
  roomBoundary: number,
): number {
  let mask = 0;
  if (topology.blocksMove === true) mask |= BUILDING_TOPOLOGY_BLOCKS_MOVE;
  if (topology.blocksSight === true) mask |= BUILDING_TOPOLOGY_BLOCKS_SIGHT;
  if (roomBoundary > 0) mask |= BUILDING_TOPOLOGY_ROOM_BOUNDARY;
  if (topology.semiOutdoorLink === true) mask |= BUILDING_TOPOLOGY_SEMI_OUTDOOR_LINK;
  return mask;
}

function buildFootprintByRotation(footprint: readonly { dx: number; dy: number }[]): Int16Array[] {
  return ROTATIONS.map((rotation) => {
    const rotated: number[] = [];
    for (const cell of footprint) {
      const dx = clampInt(cell.dx, -32768, 32767);
      const dy = clampInt(cell.dy, -32768, 32767);
      const [x, y] = rotateOffset(dx, dy, rotation);
      rotated.push(x, y);
    }
    return Int16Array.from(rotated);
  });
}

function rotateOffset(dx: number, dy: number, rotation: 0 | 90 | 180 | 270): [number, number] {
  switch (rotation) {
    case 90:
      return [-dy, dx];
    case 180:
      return [-dx, -dy];
    case 270:
      return [dy, -dx];
    case 0:
    default:
      return [dx, dy];
  }
}

function buildElementVector(source: Partial<Record<FiveElement, number>>): Int16Array {
  const vector = new Int16Array(5);
  for (const [element, index] of Object.entries(FENGSHUI_ELEMENT_INDEX)) {
    vector[index] = clampInt(source[element as FiveElement], -32768, 32767);
  }
  return vector;
}

function resolveTraitId(key: string, traitIdsByKey: Map<string, number>, traitKeysById: string[]): number {
  const existing = traitIdsByKey.get(key);
  if (existing) {
    return existing;
  }
  const next = traitKeysById.length;
  if (next > 65535) {
    throw new Error('building_trait_id_overflow');
  }
  traitIdsByKey.set(key, next);
  traitKeysById[next] = key;
  return next;
}

function normalizeRequiredKey(value: unknown, field: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`building_def_required:${field}`);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function resolveBuildingDurabilityMultiplier(definition: BuildingDef, visualTileType: string | undefined): number {
  const configured = Number(definition.economy?.durabilityMultiplier);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  const tileDefault = getDefaultTileDurabilityMultiplier(visualTileType);
  if (tileDefault !== null) {
    return tileDefault;
  }
  const legacyMaxHp = Number(definition.economy?.maxHp);
  if (Number.isFinite(legacyMaxHp) && legacyMaxHp > 0) {
    return Math.max(0.01, legacyMaxHp / 100);
  }
  return Math.max(0.01, BUILDING_DEFAULT_MAX_HP / 100);
}
