import { TileType, type GmMapContainerRecord } from '@mud/shared';
import resourceNodesJson from '../../../data/content/resource-nodes.json';

/** RuntimeTileResourceNode：定义该类型的结构与数据语义。 */
export type RuntimeTileResourceNode = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'runtime_tile';
/** name：定义该变量以承载业务值。 */
  name: string;
/** sourceLabel：定义该变量以承载业务值。 */
  sourceLabel: string;
/** tileType：定义该变量以承载业务值。 */
  tileType: TileType;
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** baseChanceBps：定义该变量以承载业务值。 */
  baseChanceBps: number;
};

/** LandmarkMarkerResourceNode：定义该类型的结构与数据语义。 */
export type LandmarkMarkerResourceNode = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'landmark_marker';
/** name：定义该变量以承载业务值。 */
  name: string;
/** sourceLabel：定义该变量以承载业务值。 */
  sourceLabel: string;
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
};

/** LandmarkContainerResourceNode：定义该类型的结构与数据语义。 */
export type LandmarkContainerResourceNode = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'landmark_container';
/** name：定义该变量以承载业务值。 */
  name: string;
/** container：定义该变量以承载业务值。 */
  container: GmMapContainerRecord;
};

/** ResourceNodeDefinition：定义该类型的结构与数据语义。 */
export type ResourceNodeDefinition =
  | RuntimeTileResourceNode
  | LandmarkMarkerResourceNode
  | LandmarkContainerResourceNode;

/** ResourceNodesJson：定义该类型的结构与数据语义。 */
type ResourceNodesJson = {
  resourceNodes?: ResourceNodeDefinition[];
};

/** resourceNodesData：定义该变量以承载业务值。 */
const resourceNodesData = resourceNodesJson as ResourceNodesJson;

/** RESOURCE_NODES：定义该变量以承载业务值。 */
export const RESOURCE_NODES: ResourceNodeDefinition[] = Array.isArray(resourceNodesData.resourceNodes)
  ? resourceNodesData.resourceNodes
  : [];

/** RESOURCE_NODE_BY_ID：定义该变量以承载业务值。 */
export const RESOURCE_NODE_BY_ID = new Map(
  RESOURCE_NODES.map((node) => [node.id, node] as const),
);

/** RUNTIME_TILE_RESOURCE_NODES：定义该变量以承载业务值。 */
export const RUNTIME_TILE_RESOURCE_NODES: RuntimeTileResourceNode[] = RESOURCE_NODES
  .filter((node): node is RuntimeTileResourceNode => node.kind === 'runtime_tile');

/** LANDMARK_RESOURCE_NODE_BY_ID：定义该变量以承载业务值。 */
export const LANDMARK_RESOURCE_NODE_BY_ID = new Map(
  RESOURCE_NODES
    .filter((node): node is LandmarkMarkerResourceNode | LandmarkContainerResourceNode => (
      node.kind === 'landmark_marker' || node.kind === 'landmark_container'
    ))
    .map((node) => [node.id, node] as const),
);

