/**
 * 地图格式迁移脚本：将旧格式地图 JSON 转为 format:2 分层中文字符图格式。
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeEditableMapDocument, TerrainType, StructureType, SurfaceType, GmMapDocument, gameplayConstants } from '@mud/shared';

const { TERRAIN_TYPE_TO_CHAR, STRUCTURE_TYPE_TO_CHAR, SURFACE_TYPE_TO_CHAR, LAYER_EMPTY_CHAR } = gameplayConstants;
const MAPS_DIR = path.resolve(__dirname, '../../data/maps');

function main() {
  const files = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith('.json'));
  let converted = 0, skipped = 0;
  for (const file of files) {
    const filePath = path.join(MAPS_DIR, file);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (raw.format === 2) { skipped++; continue; }
    const normalized = normalizeEditableMapDocument(raw);
    const output = convertToFormatV2(normalized, raw);
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
    converted++;
    console.log(`✓ ${file}`);
  }
  console.log(`\n完成：${converted} 个文件已转换，${skipped} 个已跳过`);
}

function convertToFormatV2(doc: GmMapDocument, raw: Record<string, unknown>): Record<string, unknown> {
  const { width, height } = doc;
  const terrainLines: string[] = [];
  const structureLines: string[] = [];
  const surfaceLines: string[] = [];
  let hasSurface = false;
  for (let y = 0; y < height; y++) {
    let tLine = '', sLine = '', fLine = '';
    for (let x = 0; x < width; x++) {
      const terrain = doc.terrainRows?.[y]?.[x] ?? TerrainType.Floor;
      const structure = doc.structureRows?.[y]?.[x] ?? null;
      const surface = doc.surfaceRows?.[y]?.[x] ?? null;
      tLine += TERRAIN_TYPE_TO_CHAR.get(terrain as TerrainType) ?? '地';
      sLine += structure ? (STRUCTURE_TYPE_TO_CHAR.get(structure as StructureType) ?? LAYER_EMPTY_CHAR) : LAYER_EMPTY_CHAR;
      const fc = surface ? (SURFACE_TYPE_TO_CHAR.get(surface as SurfaceType) ?? LAYER_EMPTY_CHAR) : LAYER_EMPTY_CHAR;
      fLine += fc;
      if (surface) hasSurface = true;
    }
    terrainLines.push(tLine);
    structureLines.push(sLine);
    surfaceLines.push(fLine);
  }
  const auras = (doc.auras ?? []).map((a) => [a.x, a.y, a.value]);
  const monsterSpawns = (doc.monsterSpawns ?? []).map((m) => [m.x, m.y, m.id]);
  const output: Record<string, unknown> = { format: 2, id: doc.id, name: doc.name };
  if (doc.mapGroupId) output.mapGroupId = doc.mapGroupId;
  if (doc.mapGroupName) output.mapGroupName = doc.mapGroupName;
  if (doc.mapGroupOrder !== undefined) output.mapGroupOrder = doc.mapGroupOrder;
  if (doc.mapGroupMemberOrder !== undefined) output.mapGroupMemberOrder = doc.mapGroupMemberOrder;
  output.width = width;
  output.height = height;
  if (doc.routeDomain) output.routeDomain = doc.routeDomain;
  const mapLv = (doc as unknown as Record<string, unknown>).mapLv;
  if (mapLv) output.mapLv = mapLv;
  if (doc.spaceVisionMode) output.spaceVisionMode = doc.spaceVisionMode;
  if (doc.parentMapId) output.parentMapId = doc.parentMapId;
  if (doc.description) output.description = doc.description;
  output.terrain = terrainLines;
  output.structure = structureLines;
  if (hasSurface) output.surface = surfaceLines;
  if (auras.length > 0) output.auras = auras;
  if (monsterSpawns.length > 0) output.monsterSpawns = monsterSpawns;
  if (doc.portals && doc.portals.length > 0) output.portals = doc.portals;
  output.spawnPoint = doc.spawnPoint;
  const time = (doc as unknown as Record<string, unknown>).time;
  if (time) output.time = time;
  if (raw.resources && (raw.resources as unknown[]).length > 0) output.resources = raw.resources;
  if (raw.safeZones && (raw.safeZones as unknown[]).length > 0) output.safeZones = raw.safeZones;
  if (raw.landmarks && (raw.landmarks as unknown[]).length > 0) output.landmarks = raw.landmarks;
  if (raw.npcs && (raw.npcs as unknown[]).length > 0) output.npcs = raw.npcs;
  if (raw.tileEffects && (raw.tileEffects as unknown[]).length > 0) output.tileEffects = raw.tileEffects;
  if (raw.resourceNodeGroups && (raw.resourceNodeGroups as unknown[]).length > 0) output.resourceNodeGroups = raw.resourceNodeGroups;
  return output;
}

main();
