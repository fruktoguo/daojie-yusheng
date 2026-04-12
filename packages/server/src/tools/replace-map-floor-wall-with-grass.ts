/**
 * CLI 工具：把指定地图里的墙体与地面统一替换为草地。
 *
 * 用法示例：
 * `pnpm --filter @mud/server map:grassify -- --map=cleft_blade_plain`
 */
import * as fs from 'fs';
import * as path from 'path';
import { getMapCharFromTileType, getTileTypeFromMapChar, TileType } from '@mud/shared';

/** CliOptions：定义该接口的能力与字段约束。 */
interface CliOptions {
  mapId: string;
}

/** EditableMapFile：定义该接口的能力与字段约束。 */
interface EditableMapFile {
  id?: string;
  width?: number;
  height?: number;
  tiles?: string[];
}

/**
 * 解析参数。
 */
function parseArgs(argv: string[]): CliOptions {
/**
 * 汇总当前条目列表。
 */
  const entries = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, rawValue] = arg.slice(2).split('=');
    entries.set(key, rawValue ?? '1');
  }/**
 * 按 ID 组织mapId映射。
 */


  const mapId = entries.get('map')?.trim() || '';
  if (!mapId) {
    throw new Error('缺少 --map=地图ID');
  }

  return { mapId };
}

/** collectJsonFiles：执行对应的业务逻辑。 */
function collectJsonFiles(dirPath: string): string[] {
/**
 * 汇总当前条目列表。
 */
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
/**
 * 汇总待处理文件列表。
 */
  const files: string[] = [];
  for (const entry of entries) {
/**
 * 记录entry路径。
 */
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

/**
 * 查找地图文件路径。
 */
function findMapFilePath(mapsDir: string, mapId: string): string {
/**
 * 记录matched。
 */
  const matched = collectJsonFiles(mapsDir).filter((filePath) => path.basename(filePath, '.json') === mapId);
  if (matched.length === 0) {
    throw new Error(`未找到地图: ${mapId}`);
  }
  if (matched.length > 1) {
    throw new Error(`地图 ID 重复，无法确定目标文件: ${mapId}`);
  }
  return matched[0]!;
}

/**
 * 处理replacetileswithgrass。
 */
function replaceTilesWithGrass(rawMap: EditableMapFile): { nextTiles: string[]; replacedWall: number; replacedFloor: number } {
  if (!Array.isArray(rawMap.tiles)) {
    throw new Error('地图 tiles 缺失或格式非法');
  }
/**
 * 记录grasschar。
 */
  const grassChar = getMapCharFromTileType(TileType.Grass);
/**
 * 记录replacedwall。
 */
  let replacedWall = 0;
/**
 * 记录replacedfloor。
 */
  let replacedFloor = 0;
/**
 * 记录nexttiles。
 */
  const nextTiles = rawMap.tiles.map((row) => {
/**
 * 记录nextrow。
 */
    let nextRow = '';
    for (const char of row) {
/**
 * 记录type。
 */
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

/**
 * 串联执行脚本主流程。
 */
function main(): void {
/**
 * 保存解析后的选项。
 */
  const options = parseArgs(process.argv.slice(2));
/**
 * 记录地图目录。
 */
  const mapsDir = path.resolve(__dirname, '../../data/maps');
/**
 * 记录地图路径。
 */
  const mapPath = findMapFilePath(mapsDir, options.mapId);/**
 * 保存raw映射。
 */

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

