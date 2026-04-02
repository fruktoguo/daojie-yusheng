import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const resourceNodesPath = path.join(repoRoot, 'packages/server/data/content/resource-nodes.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadResourceNodes() {
  const data = readJson(resourceNodesPath);
  return Array.isArray(data?.resourceNodes) ? data.resourceNodes : [];
}

export function buildResourceNodeIndexes() {
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
