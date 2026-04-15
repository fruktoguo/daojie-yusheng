/**
 * 用途：为资源相关生成脚本构建资源节点索引。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 记录仓库根目录。
 */
const repoRoot = path.resolve(__dirname, '..', '..');
/**
 * 记录资源nodes路径。
 */
const resourceNodesPath = path.join(repoRoot, 'legacy/server/data/content/resource-nodes.json');

/**
 * 读取json。
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 加载资源nodes。
 */
export function loadResourceNodes() {
/**
 * 记录data。
 */
  const data = readJson(resourceNodesPath);
  return Array.isArray(data?.resourceNodes) ? data.resourceNodes : [];
}

/**
 * 构建资源节点indexes。
 */
export function buildResourceNodeIndexes() {
/**
 * 记录资源nodes。
 */
  const resourceNodes = loadResourceNodes();
  return {
    resourceNodes,
    runtimeTileNodes: resourceNodes.filter((node) => node?.kind === 'runtime_tile'),
    landmarkNodesById: new Map(
      resourceNodes
        .filter((node) => node?.kind === 'landmark_marker' || node?.kind === 'landmark_container')
        .map((node) => [node.id, node]),
    ),
  };
}
