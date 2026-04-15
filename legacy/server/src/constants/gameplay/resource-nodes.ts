import { TileType, type GmMapContainerRecord } from '@mud/shared';
import resourceNodesJson from '../../../data/content/resource-nodes.json';

export type RuntimeTileResourceNode = {
  id: string;
  kind: 'runtime_tile';
  name: string;
  sourceLabel: string;
  tileType: TileType;
  itemId: string;
  baseChanceBps: number;
};

export type LandmarkMarkerResourceNode = {
  id: string;
  kind: 'landmark_marker';
  name: string;
  sourceLabel: string;
  itemId: string;
};

export type LandmarkContainerResourceNode = {
  id: string;
  kind: 'landmark_container';
  name: string;
  container: GmMapContainerRecord;
};

export type ResourceNodeDefinition =
  | RuntimeTileResourceNode
  | LandmarkMarkerResourceNode
  | LandmarkContainerResourceNode;

type ResourceNodesJson = {
  resourceNodes?: ResourceNodeDefinition[];
};

const resourceNodesData = resourceNodesJson as ResourceNodesJson;

export const RESOURCE_NODES: ResourceNodeDefinition[] = Array.isArray(resourceNodesData.resourceNodes)
  ? resourceNodesData.resourceNodes
  : [];

export const RESOURCE_NODE_BY_ID = new Map(
  RESOURCE_NODES.map((node) => [node.id, node] as const),
);

export const RUNTIME_TILE_RESOURCE_NODES: RuntimeTileResourceNode[] = RESOURCE_NODES
  .filter((node): node is RuntimeTileResourceNode => node.kind === 'runtime_tile');

export const LANDMARK_RESOURCE_NODE_BY_ID = new Map(
  RESOURCE_NODES
    .filter((node): node is LandmarkMarkerResourceNode | LandmarkContainerResourceNode => (
      node.kind === 'landmark_marker' || node.kind === 'landmark_container'
    ))
    .map((node) => [node.id, node] as const),
);

