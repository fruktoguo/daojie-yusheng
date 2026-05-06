import type { TileType } from './world-core-types';

export type FiveElement = 'metal' | 'wood' | 'water' | 'fire' | 'earth' | 'neutral';

export type BuildingPlacementLayer =
  | 'structure'
  | 'floor'
  | 'facility'
  | 'furniture'
  | 'decoration';

export type BuildingVisualLayer =
  | 'terrain'
  | 'structure'
  | 'furniture'
  | 'overlay';

export type BuildingOpeningKind = 'none' | 'door' | 'window';

export type BuildingInstanceState =
  | 'planned'
  | 'building'
  | 'active'
  | 'damaged'
  | 'destroyed'
  | 'deconstructing';

export interface BuildingFootprintCell {
  dx: number;
  dy: number;
  tileType?: TileType;
}

export interface BuildingCostEntry {
  itemId: string;
  count: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  revision?: number;
  visual?: {
    tileType?: TileType;
    glyph?: string;
    color?: string;
    layer?: BuildingVisualLayer;
  };
  placement: {
    layer: BuildingPlacementLayer;
    footprint: BuildingFootprintCell[];
    allowRotate?: boolean;
    allowedTerrainTags?: string[];
    forbiddenTerrainTags?: string[];
    requireOwnedLand?: boolean;
    requireSectLand?: boolean;
    allowOverlapLayers?: BuildingPlacementLayer[];
  };
  topology?: {
    blocksMove?: boolean;
    blocksSight?: boolean;
    roomBoundary?: number;
    opening?: BuildingOpeningKind;
    roofCoverage?: number;
    semiOutdoorLink?: boolean;
    shaShield?: number;
    supportsLoad?: number;
  };
  fengShui?: {
    elementVector?: Partial<Record<FiveElement, number>>;
    traits?: string[];
    comfort?: number;
    stability?: number;
    qiAffinity?: number;
    qiLeak?: number;
    shaEmit?: number;
    shaReduce?: number;
    integrityWeight?: number;
  };
  economy?: {
    buildTicks?: number;
    deconstructTicks?: number;
    maxHp?: number;
    cost?: BuildingCostEntry[];
    refund?: BuildingCostEntry[];
  };
}

export interface CompiledBuildingDef {
  handle: number;
  id: string;
  name: string;
  revision: number;
  layerId: number;
  visualLayerId: number;
  visualTileType?: TileType;
  glyph?: string;
  color?: string;
  allowRotate: boolean;
  footprintByRotation: Int16Array[];
  topologyMask: number;
  roomBoundary: number;
  openingKind: number;
  roofCoverage: number;
  shaShield: number;
  elementVector: Int16Array;
  traitIds: Uint16Array;
  fengShuiContrib: Int16Array;
  maxHp: number;
  buildTicks: number;
  deconstructTicks: number;
  costItemIds: string[];
  costCounts: Uint32Array;
}

export interface CompiledBuildingCatalog {
  defs: CompiledBuildingDef[];
  defById: Map<string, CompiledBuildingDef>;
  defByHandle: CompiledBuildingDef[];
  traitIdsByKey: Map<string, number>;
  traitKeysById: string[];
}

export interface BuildingInstance {
  id: string;
  defId: string;
  defHandle: number;
  instanceId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  ownerPlayerId?: string | null;
  ownerSectId?: string | null;
  roomId?: string | null;
  hp: number;
  maxHp: number;
  state: BuildingInstanceState;
  createdAtTick: number;
  updatedAtTick: number;
  revision: number;
  buildStrength?: number;
  builderSkillLevel?: number;
  buildCompleteTick?: number;
  buildRemainingTicks?: number;
  activeBuilderPlayerId?: string | null;
}
