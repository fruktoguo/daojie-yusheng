/**
 * 本文件是服务端冷路径运维工具入口，用于迁移、预检、清理或后台任务手动执行。
 *
 * 维护时要让脚本参数、失败退出码和副作用范围清晰，避免误操作生产数据。
 */
/**
 * 地图格式迁移脚本：将旧格式地图 JSON 转为 format:2 分层中文字符图格式。
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeEditableMapDocument, serializeEditableMapDocumentToFormatV2 } from '@mud/shared';

const MAPS_DIR = path.resolve(__dirname, '../../data/maps');
const LEGACY_MAP_KEYS = ['tiles', 'layeredCells', 'terrainRows', 'surfaceRows', 'structureRows', 'interactableRows'];

function main(): void {
  const mode = process.argv.includes('--apply') ? 'apply' : (process.argv.includes('--check') ? 'check' : 'dry-run');
  const files = collectJsonFiles(MAPS_DIR);
  let matched = 0;
  let converted = 0;
  const samples: string[] = [];
  const errors: string[] = [];

  for (const filePath of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      if (!isLegacyMapDocument(raw)) {
        continue;
      }
      matched += 1;
      const normalized = normalizeEditableMapDocument(raw);
      const output = serializeEditableMapDocumentToFormatV2(normalized);
      assertRuntimeMapDocumentV2(output, filePath);
      if (mode === 'apply') {
        fs.writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
        converted += 1;
      }
      if (samples.length < 10) {
        samples.push(path.relative(MAPS_DIR, filePath));
      }
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = { ok: errors.length === 0, mode, matched, converted, samples, errors };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0 || (mode === 'check' && matched > 0)) {
    process.exit(1);
  }
}

function collectJsonFiles(dir: string, output: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(fullPath, output);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      output.push(fullPath);
    }
  }
  return output.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function isLegacyMapDocument(raw: Record<string, unknown>): boolean {
  return raw.format !== 2 || LEGACY_MAP_KEYS.some((key) => Object.prototype.hasOwnProperty.call(raw, key));
}

function assertRuntimeMapDocumentV2(raw: Record<string, unknown>, filePath: string): void {
  const legacyKeys = LEGACY_MAP_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(raw, key));
  if (raw.format !== 2 || legacyKeys.length > 0) {
    throw new Error(`转换后仍含旧地图字段：${legacyKeys.join(',') || 'format'} (${filePath})`);
  }
  if (!Array.isArray(raw.terrain) || !Array.isArray(raw.structure)) {
    throw new Error(`转换后缺少 format:2 terrain/structure (${filePath})`);
  }
}

main();
