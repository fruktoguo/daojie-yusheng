"use strict";

const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..", "..");
const mapsRoot = path.join(packageRoot, "data", "maps");

function walkJsonFiles(dirPath, result = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(absolutePath, result);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(absolutePath);
    }
  }
  return result;
}

function loadMapFiles() {
  return walkJsonFiles(mapsRoot).map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(packageRoot, filePath);
    return {
      filePath,
      relativePath,
      baseName: path.basename(filePath, ".json"),
      composeGroupName: relativePath.includes(`${path.sep}compose${path.sep}`)
        ? path.basename(path.dirname(filePath))
        : null,
      map: JSON.parse(raw),
    };
  });
}

function isIntegerInBounds(value, maxExclusive) {
  return Number.isInteger(value) && value >= 0 && value < maxExclusive;
}

function validatePoint(errors, mapInfo, label, x, y, width, height) {
  if (!isIntegerInBounds(x, width) || !isIntegerInBounds(y, height)) {
    errors.push(`${mapInfo.map.id}: ${label} 坐标越界 -> (${x}, ${y}) / ${width}x${height} @ ${mapInfo.relativePath}`);
  }
}

function validateTileShape(errors, mapInfo, width, height) {
  const tiles = mapInfo.map.tiles;
  if (!Array.isArray(tiles)) {
    errors.push(`${mapInfo.map.id}: 缺少 tiles 数组 @ ${mapInfo.relativePath}`);
    return;
  }
  if (tiles.length !== height) {
    errors.push(`${mapInfo.map.id}: tiles 行数 ${tiles.length} 与 height ${height} 不一致 @ ${mapInfo.relativePath}`);
  }
  tiles.forEach((row, index) => {
    if (typeof row !== "string" || row.length !== width) {
      errors.push(`${mapInfo.map.id}: 第 ${index + 1} 行 tile 宽度不合法 -> ${typeof row === "string" ? row.length : "non-string"}，期望 ${width} @ ${mapInfo.relativePath}`);
    }
  });
}

function validateMapFileIdentity(errors, mapInfo) {
  if (mapInfo.baseName !== mapInfo.map.id) {
    errors.push(`${mapInfo.map.id}: 文件名 ${mapInfo.baseName}.json 与 map.id 不一致 @ ${mapInfo.relativePath}`);
  }
}

function validateComposeRules(errors, mapInfo) {
  if (!mapInfo.composeGroupName) {
    return;
  }
  if (!mapInfo.map.id.startsWith(`${mapInfo.composeGroupName}_`)) {
    errors.push(`${mapInfo.map.id}: compose 子图 id 必须以前缀 ${mapInfo.composeGroupName}_ 开头 @ ${mapInfo.relativePath}`);
  }
  if (typeof mapInfo.map.parentMapId === "string") {
    errors.push(`${mapInfo.map.id}: compose 子图不应直接声明 parentMapId -> ${mapInfo.map.parentMapId} @ ${mapInfo.relativePath}`);
  }
}

function validatePortals(errors, mapInfo, mapById, width, height) {
  for (const portal of mapInfo.map.portals ?? []) {
    validatePoint(errors, mapInfo, `portal:${portal.targetMapId ?? "unknown"}`, portal.x, portal.y, width, height);
    if (typeof portal.targetMapId !== "string") {
      errors.push(`${mapInfo.map.id}: portal 缺少 targetMapId @ ${mapInfo.relativePath}`);
      continue;
    }
    const targetMapInfo = mapById.get(portal.targetMapId);
    if (!targetMapInfo) {
      errors.push(`${mapInfo.map.id}: portal 指向不存在的地图 ${portal.targetMapId} @ ${mapInfo.relativePath}`);
      continue;
    }
    validatePoint(
      errors,
      targetMapInfo,
      `portal-target-from:${mapInfo.map.id}`,
      portal.targetX,
      portal.targetY,
      targetMapInfo.map.width,
      targetMapInfo.map.height,
    );
  }
}

function validateParentMapRules(errors, mapInfo, mapById) {
  const parentMapId = mapInfo.map.parentMapId;
  if (typeof parentMapId !== "string") {
    return;
  }
  if (mapInfo.composeGroupName) {
    errors.push(`${mapInfo.map.id}: parentMap 室内图不应落在 compose 目录下 @ ${mapInfo.relativePath}`);
  }
  const parentMapInfo = mapById.get(parentMapId);
  if (!parentMapInfo) {
    errors.push(`${mapInfo.map.id}: parentMapId 不存在 -> ${parentMapId} @ ${mapInfo.relativePath}`);
    return;
  }
  if (!Number.isInteger(mapInfo.map.floorLevel)) {
    errors.push(`${mapInfo.map.id}: parentMapId 已设置，但 floorLevel 非整数 @ ${mapInfo.relativePath}`);
  }
  if (mapInfo.map.floorLevel === 0) {
    errors.push(`${mapInfo.map.id}: parentMapId 已设置，但 floorLevel 不能为 0 @ ${mapInfo.relativePath}`);
  }
  if (!mapInfo.map.id.startsWith(`${parentMapId}_`)) {
    errors.push(`${mapInfo.map.id}: parentMap 室内图 id 应以前缀 ${parentMapId}_ 开头 @ ${mapInfo.relativePath}`);
  }
  const hasParentOriginX = Number.isInteger(mapInfo.map.parentOriginX);
  const hasParentOriginY = Number.isInteger(mapInfo.map.parentOriginY);
  if (mapInfo.map.spaceVisionMode === "parent_overlay") {
    if (!hasParentOriginX || !hasParentOriginY) {
      errors.push(`${mapInfo.map.id}: parent_overlay 缺少 parentOriginX/Y @ ${mapInfo.relativePath}`);
    }
  }
  if (hasParentOriginX && hasParentOriginY) {
    validatePoint(
      errors,
      parentMapInfo,
      `parent-origin-from:${mapInfo.map.id}`,
      mapInfo.map.parentOriginX,
      mapInfo.map.parentOriginY,
      parentMapInfo.map.width,
      parentMapInfo.map.height,
    );
  }
  const hasReturnPortal = (mapInfo.map.portals ?? []).some((portal) => portal?.targetMapId === parentMapId);
  if (!hasReturnPortal) {
    errors.push(`${mapInfo.map.id}: 缺少回到父图 ${parentMapId} 的 portal @ ${mapInfo.relativePath}`);
  }
}

function validateAnchors(errors, mapInfo, key, width, height) {
  for (const entry of mapInfo.map[key] ?? []) {
    const entryId = typeof entry?.id === "string" ? entry.id : "unknown";
    validatePoint(errors, mapInfo, `${key}:${entryId}`, entry?.x, entry?.y, width, height);
  }
}

function main() {
  const mapFiles = loadMapFiles();
  const errors = [];
  const mapById = new Map();

  for (const mapInfo of mapFiles) {
    const { map } = mapInfo;
    if (typeof map?.id !== "string" || map.id.length === 0) {
      errors.push(`地图文件缺少合法 id @ ${mapInfo.relativePath}`);
      continue;
    }
    if (mapById.has(map.id)) {
      errors.push(`检测到重复 map id: ${map.id} @ ${mapInfo.relativePath}`);
      continue;
    }
    mapById.set(map.id, mapInfo);
  }

  for (const mapInfo of mapById.values()) {
    const width = mapInfo.map.width;
    const height = mapInfo.map.height;
    validateMapFileIdentity(errors, mapInfo);
    validateComposeRules(errors, mapInfo);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      errors.push(`${mapInfo.map.id}: width/height 非法 -> ${width}x${height} @ ${mapInfo.relativePath}`);
      continue;
    }
    validateTileShape(errors, mapInfo, width, height);
    validateParentMapRules(errors, mapInfo, mapById);
    if (!mapInfo.map.spawnPoint) {
      errors.push(`${mapInfo.map.id}: 缺少 spawnPoint @ ${mapInfo.relativePath}`);
    } else {
      validatePoint(errors, mapInfo, "spawnPoint", mapInfo.map.spawnPoint.x, mapInfo.map.spawnPoint.y, width, height);
    }
    validatePortals(errors, mapInfo, mapById, width, height);
    validateAnchors(errors, mapInfo, "npcs", width, height);
    validateAnchors(errors, mapInfo, "landmarks", width, height);
    validateAnchors(errors, mapInfo, "monsterSpawns", width, height);
  }

  if (errors.length > 0) {
    process.stderr.write("[content/map consistency] failed\n");
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[content/map consistency] passed\n");
  process.stdout.write(`- checked maps: ${mapById.size}\n`);
  process.stdout.write("- validated: file/id identity, compose naming, tiles, spawn points, portals, npc anchors, landmarks, monster spawns, parent-map rules\n");
}

main();
