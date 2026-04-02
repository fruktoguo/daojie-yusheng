import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const mapsDir = path.join(repoRoot, 'packages/server/data/maps');
const outputPath = path.join(mapsDir, 'cleft_blade_plain.json');

const OUTPUT_WIDTH = 56;
const OUTPUT_HEIGHT = 56;

const placements = [
  { mapId: 'cleft_blade_plain_tomb_mouth', x: 2, y: 2, rotate: 0 },
  { mapId: 'cleft_blade_plain_tomb_front', x: 8, y: 10, rotate: 90 },
  { mapId: 'cleft_blade_plain_plateau', x: 18, y: 16, rotate: 0 },
  { mapId: 'cleft_blade_plain_straightway', x: 31, y: 18, rotate: 90 },
  { mapId: 'cleft_blade_plain_slope', x: 27, y: 31, rotate: 0 },
  { mapId: 'cleft_blade_plain_entry', x: 32, y: 40, rotate: 0 },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createGrid(width, height, fillChar = '.') {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => fillChar));
  for (let x = 0; x < width; x += 1) {
    rows[0][x] = '#';
    rows[height - 1][x] = '#';
  }
  for (let y = 0; y < height; y += 1) {
    rows[y][0] = '#';
    rows[y][width - 1] = '#';
  }
  return rows;
}

function getInteriorSize(map, rotate) {
  const width = map.width - 2;
  const height = map.height - 2;
  return rotate === 90 || rotate === 270
    ? { width: height, height: width }
    : { width, height };
}

function transformInteriorPoint(point, map, placement) {
  const sourceWidth = map.width - 2;
  const sourceHeight = map.height - 2;
  const localX = point.x - 1;
  const localY = point.y - 1;

  if (localX < 0 || localY < 0 || localX >= sourceWidth || localY >= sourceHeight) {
    return null;
  }

  switch (placement.rotate) {
    case 90:
      return {
        x: placement.x + (sourceHeight - 1 - localY),
        y: placement.y + localX,
      };
    case 180:
      return {
        x: placement.x + (sourceWidth - 1 - localX),
        y: placement.y + (sourceHeight - 1 - localY),
      };
    case 270:
      return {
        x: placement.x + localY,
        y: placement.y + (sourceWidth - 1 - localX),
      };
    case 0:
    default:
      return {
        x: placement.x + localX,
        y: placement.y + localY,
      };
  }
}

function pasteMap(grid, map, placement) {
  for (let sourceY = 1; sourceY < map.height - 1; sourceY += 1) {
    const row = [...map.tiles[sourceY]];
    for (let sourceX = 1; sourceX < map.width - 1; sourceX += 1) {
      const target = transformInteriorPoint({ x: sourceX, y: sourceY }, map, placement);
      if (!target) continue;
      if (target.x < 1 || target.x >= OUTPUT_WIDTH - 1 || target.y < 1 || target.y >= OUTPUT_HEIGHT - 1) continue;
      grid[target.y][target.x] = row[sourceX];
    }
  }
}

function transformPoints(points, map, placement) {
  return (points ?? [])
    .map((point) => {
      const transformed = transformInteriorPoint(point, map, placement);
      return transformed ? { ...point, ...transformed } : null;
    })
    .filter(Boolean);
}

function dedupeAuras(points) {
  const bucket = new Map();
  for (const point of points) {
    const key = `${point.x},${point.y}`;
    const previous = bucket.get(key);
    if (!previous || previous.value < point.value) {
      bucket.set(key, point);
    }
  }
  return [...bucket.values()];
}

function dedupeResources(points) {
  const bucket = new Map();
  for (const point of points) {
    const key = `${point.x},${point.y},${point.resourceKey}`;
    const previous = bucket.get(key);
    if (!previous || previous.value < point.value) {
      bucket.set(key, point);
    }
  }
  return [...bucket.values()];
}

function findPlacement(mapId) {
  const placement = placements.find((entry) => entry.mapId === mapId);
  if (!placement) {
    throw new Error(`未找到 ${mapId} 的摆放配置`);
  }
  return placement;
}

const sourceMaps = placements.map((placement) => ({
  placement,
  map: readJson(path.join(mapsDir, `${placement.mapId}.json`)),
}));

for (const { placement, map } of sourceMaps) {
  const size = getInteriorSize(map, placement.rotate);
  if (placement.x < 1 || placement.y < 1 || placement.x + size.width > OUTPUT_WIDTH - 1 || placement.y + size.height > OUTPUT_HEIGHT - 1) {
    throw new Error(`${placement.mapId} 超出总图边界`);
  }
}

const grid = createGrid(OUTPUT_WIDTH, OUTPUT_HEIGHT, '.');
for (const { placement, map } of sourceMaps) {
  pasteMap(grid, map, placement);
}

const entryPlacement = findPlacement('cleft_blade_plain_entry');
const entryMap = sourceMaps.find((entry) => entry.placement.mapId === 'cleft_blade_plain_entry')?.map;
const tombPlacement = findPlacement('cleft_blade_plain_tomb_mouth');
const tombMap = sourceMaps.find((entry) => entry.placement.mapId === 'cleft_blade_plain_tomb_mouth')?.map;

if (!entryMap || !tombMap) {
  throw new Error('缺少入口图或终点图');
}

const spawnPoint = transformInteriorPoint(entryMap.spawnPoint, entryMap, entryPlacement);
if (!spawnPoint) {
  throw new Error('入口出生点无法转换');
}

const qizhenPortals = transformPoints(
  (entryMap.portals ?? []).filter((portal) => portal.targetMapId === 'qizhen_crossing'),
  entryMap,
  entryPlacement,
);
const guizangPortals = transformPoints(
  (tombMap.portals ?? []).filter((portal) => portal.targetMapId === 'guizang_vein_cavern'),
  tombMap,
  tombPlacement,
);

const allAuras = sourceMaps.flatMap(({ placement, map }) => transformPoints(map.auras ?? [], map, placement));
const allResources = sourceMaps.flatMap(({ placement, map }) => transformPoints(map.resources ?? [], map, placement));
const allLandmarks = sourceMaps.flatMap(({ placement, map }) => transformPoints(map.landmarks ?? [], map, placement));

const output = {
  id: 'cleft_blade_plain',
  name: '裂锋原',
  width: OUTPUT_WIDTH,
  height: OUTPUT_HEIGHT,
  routeDomain: 'system',
  terrainProfileId: 'earth_stone_wild',
  spaceVisionMode: 'isolated',
  description: '练气期金行地图裂锋原总图。通过脚本把六张子图按可调位置拼进一张 56x56 大图，当前采用东南入口、向西北斜折推进、最终落到断兵冢口与归藏锋门的布局，方便后续继续手工修边。',
  dangerLevel: 4,
  recommendedRealm: '练气一层-练气十层',
  tiles: grid.map((row) => row.join('')),
  portals: [
    ...qizhenPortals,
    ...guizangPortals,
  ].map((portal) => ({
    x: portal.x,
    y: portal.y,
    targetMapId: portal.targetMapId,
    targetX: portal.targetX,
    targetY: portal.targetY,
    kind: portal.kind,
    trigger: portal.trigger,
    routeDomain: portal.routeDomain,
    allowPlayerOverlap: portal.allowPlayerOverlap,
    hidden: portal.hidden,
  })),
  spawnPoint,
  time: {
    offsetTicks: 320,
    scale: 1,
    light: {
      base: 34,
      timeInfluence: 24,
    },
    palette: {
      dawn: {
        tint: '#d9d1c2',
        alpha: 0.05,
      },
      dusk: {
        tint: '#b38a5c',
        alpha: 0.1,
      },
      night: {
        tint: '#1f2433',
        alpha: 0.24,
      },
    },
  },
  auras: dedupeAuras(allAuras),
  resources: dedupeResources(allResources),
  safeZones: [],
  landmarks: allLandmarks,
  npcs: [],
  monsterSpawns: [],
};

writeJson(outputPath, output);
console.log(`已生成 ${path.relative(repoRoot, outputPath)}`);
console.log('当前摆放配置：');
for (const placement of placements) {
  console.log(`- ${placement.mapId}: (${placement.x}, ${placement.y}) 旋转 ${placement.rotate}°`);
}
