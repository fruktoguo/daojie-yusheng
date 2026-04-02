/**
 * CLI 工具：把指定地图里的墙体与地面统一替换为草地。
 *
 * 用法示例：
 * `pnpm --filter @mud/server map:grassify -- --map=cleft_blade_plain`
 */
import * as fs from 'fs';
import * as path from 'path';
import { getMapCharFromTileType, getTileTypeFromMapChar, TileType } from '@mud/shared';

interface CliOptions {
  mapId: string;
}

interface EditableMapFile {
  id?: string;
  width?: number;
  height?: number;
  tiles?: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const entries = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, rawValue] = arg.slice(2).split('=');
    entries.set(key, rawValue ?? '1');
  }

  const mapId = entries.get('map')?.trim() || '';
  if (!mapId) {
    throw new Error('缺少 --map=地图ID');
  }

  return { mapId };
}

function collectJsonFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

function findMapFilePath(mapsDir: string, mapId: string): string {
  const matched = collectJsonFiles(mapsDir).filter((filePath) => path.basename(filePath, '.json') === mapId);
  if (matched.length === 0) {
    throw new Error(`未找到地图: ${mapId}`);
  }
  if (matched.length > 1) {
    throw new Error(`地图 ID 重复，无法确定目标文件: ${mapId}`);
  }
  return matched[0]!;
}

function replaceTilesWithGrass(rawMap: EditableMapFile): { nextTiles: string[]; replacedWall: number; replacedFloor: number } {
  if (!Array.isArray(rawMap.tiles)) {
    throw new Error('地图 tiles 缺失或格式非法');
  }
  const grassChar = getMapCharFromTileType(TileType.Grass);
  let replacedWall = 0;
  let replacedFloor = 0;
  const nextTiles = rawMap.tiles.map((row) => {
    let nextRow = '';
    for (const char of row) {
      const type = getTileTypeFromMapChar(char);
      if (type === TileType.Wall) {
        nextRow += grassChar;
        replacedWall += 1;
        continue;
      }
      if (type === TileType.Floor) {
        nextRow += grassChar;
        replacedFloor += 1;
        continue;
      }
      nextRow += char;
    }
    return nextRow;
  });
  return { nextTiles, replacedWall, replacedFloor };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const mapsDir = path.resolve(__dirname, '../../data/maps');
  const mapPath = findMapFilePath(mapsDir, options.mapId);
  const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8')) as EditableMapFile;
  const { nextTiles, replacedWall, replacedFloor } = replaceTilesWithGrass(rawMap);
  rawMap.tiles = nextTiles;
  fs.writeFileSync(mapPath, `${JSON.stringify(rawMap, null, 2)}\n`, 'utf-8');

  console.log([
    `地图: ${options.mapId}`,
    `文件: ${path.relative(process.cwd(), mapPath)}`,
    `墙体替换为草: ${replacedWall}`,
    `地面替换为草: ${replacedFloor}`,
  ].join('\n'));
}

main();
