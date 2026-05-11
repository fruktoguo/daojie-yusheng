/**
 * 读取服务端地块定义里的运行时地块掉落配置，供内容校验与来源生成脚本复用。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const mapInstanceRuntimePath = path.join(repoRoot, 'packages/server/src/runtime/instance/map-instance.runtime.ts');

const TILE_LABELS = {
  Cloud: '云墙',
  SpiritOre: '灵石矿',
  BlackIronOre: '玄铁矿',
  BrokenSwordHeap: '断剑堆',
};

function readRuntimeSource() {
  return fs.readFileSync(mapInstanceRuntimePath, 'utf8');
}

function extractObjectLiteral(source, constName) {
  const anchor = source.indexOf(`const ${constName} = {`);
  if (anchor < 0) {
    return '';
  }
  const start = source.indexOf('{', anchor);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return '';
}

function findMatchingBrace(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function extractTileEntries(block) {
  const entries = [];
  const keyPattern = /\[TileType\.([A-Za-z0-9_]+)\]:/g;
  for (const match of block.matchAll(keyPattern)) {
    const tileKey = match[1];
    const objectStart = block.indexOf('{', match.index + match[0].length);
    if (objectStart < 0) {
      continue;
    }
    const objectEnd = findMatchingBrace(block, objectStart);
    if (objectEnd < 0) {
      continue;
    }
    entries.push({
      tileKey,
      source: block.slice(objectStart, objectEnd + 1),
    });
  }
  return entries;
}

function extractDropArray(entrySource, propertyName) {
  const match = entrySource.match(new RegExp(`${propertyName}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/itemId:\s*'([^']+)'[\s\S]*?count:\s*(\d+)(?:[\s\S]*?chanceBps:\s*(\d+))?/g)]
    .map((drop) => ({
      itemId: drop[1],
      count: Number(drop[2]) || 1,
      chanceBps: drop[3] === undefined ? undefined : Number(drop[3]),
    }));
}

function normalizeDropModes(damageDrops, destroyDrops) {
  const byItemId = new Map();
  for (const [mode, drops] of [['damage', damageDrops], ['destroy', destroyDrops]]) {
    for (const drop of drops) {
      const current = byItemId.get(drop.itemId) ?? {
        itemId: drop.itemId,
        damage: false,
        destroy: false,
      };
      current[mode] = true;
      byItemId.set(drop.itemId, current);
    }
  }
  return [...byItemId.values()].sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'));
}

export function loadRuntimeTileDropSources() {
  const block = extractObjectLiteral(readRuntimeSource(), 'DEFAULT_TERRAIN_DURABILITY_BY_TILE');
  const sources = [];
  for (const entry of extractTileEntries(block)) {
    const tileKey = entry.tileKey;
    const entrySource = entry.source;
    const damageDrops = extractDropArray(entrySource, 'damageDrops');
    const destroyDrops = extractDropArray(entrySource, 'destroyDrops');
    if (damageDrops.length <= 0 && destroyDrops.length <= 0) {
      continue;
    }
    sources.push({
      id: `tile.${tileKey}`,
      sourceLabel: TILE_LABELS[tileKey] ?? tileKey,
      damageDrops,
      destroyDrops,
      drops: normalizeDropModes(damageDrops, destroyDrops),
    });
  }
  return sources.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));
}
