import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TICK_HOTPATH_FILES = [
  'packages/server/src/runtime/world/world-runtime-craft-tick.service.ts',
  'packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts',
  'packages/server/src/runtime/craft/pipeline/strategies/alchemy-like-tick.helpers.ts',
  'packages/server/src/runtime/craft/pipeline/strategies/enhancement-tick.helpers.ts',
  'packages/server/src/runtime/craft/pipeline/strategies/gather-tick.helpers.ts',
  'packages/server/src/runtime/craft/pipeline/strategies/building-tick.helpers.ts',
  'packages/server/src/runtime/craft/pipeline/strategies/formation-maintenance-tick.helpers.ts',
  'packages/server/src/runtime/craft/pipeline/strategies/mining.strategy.ts',
];

const FORBIDDEN_HOTPATH_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'JSON.stringify', pattern: /\bJSON\.stringify\s*\(/ },
  { label: 'JSON.parse', pattern: /\bJSON\.parse\s*\(/ },
  { label: 'readFileSync', pattern: /\breadFileSync\s*\(/ },
  { label: 'existsSync', pattern: /\bexistsSync\s*\(/ },
  { label: 'readdirSync', pattern: /\breaddirSync\s*\(/ },
  { label: 'database pool query', pattern: /\b(?:pool|client)\.query\s*\(/ },
  { label: 'player active job persistence write', pattern: /\bsavePlayerActiveJob\s*\(/ },
  { label: 'technique queue persistence write', pattern: /\bsavePlayerTechniqueActivityQueue\s*\(/ },
  { label: 'enhancement record persistence write', pattern: /\bsavePlayerEnhancementRecords\s*\(/ },
  { label: 'alchemy preset persistence write', pattern: /\bsavePlayerAlchemyPresets\s*\(/ },
  { label: 'persistence pool initialization', pattern: /\bensurePersistencePool\s*\(/ },
  { label: 'schema migration/bootstrap', pattern: /\b(?:ensureSchema|runMigrations|migrateSchema|createTable)\s*\(/ },
];

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function main(): void {
  const failures: string[] = [];
  const checkedFiles: string[] = [];

  for (const filePath of TICK_HOTPATH_FILES) {
    const source = readSource(filePath);
    checkedFiles.push(filePath);
    for (const { label, pattern } of FORBIDDEN_HOTPATH_PATTERNS) {
      if (pattern.test(source)) {
        failures.push(`${filePath}: forbidden ${label}`);
      }
    }
  }

  const craftRuntimeSource = readSource('packages/server/src/runtime/craft/craft-panel-runtime.service.ts');
  assert.match(craftRuntimeSource, /loadAlchemyCatalog\(\)\s*\{[\s\S]*?JSON\.parse\(readFileSync/);
  assert.match(craftRuntimeSource, /loadForgingCatalog\(\)\s*\{[\s\S]*?JSON\.parse\(readFileSync/);
  assert.match(craftRuntimeSource, /loadEnhancementConfigs\(\)\s*\{[\s\S]*?JSON\.parse\(readFileSync/);
  assert.match(craftRuntimeSource, /constructor\([\s\S]*?this\.loadAlchemyCatalog\(\);[\s\S]*?this\.loadForgingCatalog\(\);[\s\S]*?this\.loadEnhancementConfigs\(\);/);

  if (failures.length > 0) {
    throw new Error(`technique activity tick hotpath violations:\n${failures.join('\n')}`);
  }

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '技艺 tick 编排和 tick helper 中未出现 JSON.stringify / JSON.parse。',
      '技艺 tick 编排和 tick helper 中未出现文件 IO、配置目录读取或 schema/migration 初始化。',
      '技艺 tick 编排和 tick helper 中未出现 player active job / queue / enhancement record / alchemy preset 的直接持久化写入。',
      '炼丹、炼器、强化配置读取仍限定在 CraftPanelRuntimeService 构造期加载函数，不在 tick helper 中执行。',
    ],
    checkedFiles,
  }, null, 2));
}

main();
