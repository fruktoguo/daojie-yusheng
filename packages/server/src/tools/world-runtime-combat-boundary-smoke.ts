// @ts-nocheck

/**
 * 用途：验证统一战斗编排器仍是运行时窄口，不把网络、数据库或 JSON 序列化带入热路径。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeFiles = [
  'packages/server/src/runtime/world/world-runtime-combat-action.service.ts',
  'packages/server/src/runtime/combat/combat-outcome-apply-adapters.ts',
  'packages/server/src/runtime/combat/combat-event-query.ts',
  'packages/server/src/runtime/combat/combat-runtime-event-ring.helpers.ts',
  'packages/server/src/runtime/combat/pending-combat-cast.helpers.ts',
  'packages/server/src/runtime/world/combat-action.types.ts',
];

// 旧生产服务在阶段 14 被计划瘦身/删除；删除前先用静态护栏锁定不再新增
// 直接 DB/socket/fs/redis 访问。JSON.stringify 等历史实现在老代码里仍被允许。
const legacyRuntimeFiles = [
  'packages/server/src/runtime/world/world-runtime-basic-attack.service.ts',
  'packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.ts',
  'packages/server/src/runtime/world/world-runtime-monster-action-apply.service.ts',
];

const forbiddenRuntimePatterns = [
  { pattern: /socket\.emit\s*\(/, label: 'socket.emit' },
  { pattern: /\.emit\s*\(\s*S2C\./, label: 'direct S2C emit' },
  { pattern: /from\s+['"]pg['"]|require\(['"]pg['"]\)/, label: 'pg import' },
  { pattern: /createQueryRunner\s*\(|manager\.query\s*\(|\.query\s*\(/, label: 'direct database query' },
  { pattern: /JSON\.stringify\s*\(/, label: 'JSON.stringify' },
  { pattern: /JSON\.parse\s*\(/, label: 'JSON.parse' },
  { pattern: /fs\./, label: 'fs access' },
];

// 旧服务允许遗留 JSON.stringify/parse，但绝不允许新增 DB/socket/fs/redis 直连。
const forbiddenLegacyPatterns = [
  { pattern: /socket\.emit\s*\(/, label: 'socket.emit' },
  { pattern: /\.emit\s*\(\s*S2C\./, label: 'direct S2C emit' },
  { pattern: /from\s+['"]pg['"]|require\(['"]pg['"]\)/, label: 'pg import' },
  { pattern: /createQueryRunner\s*\(|manager\.query\s*\(/, label: 'direct database query' },
  { pattern: /from\s+['"]ioredis['"]|require\(['"]ioredis['"]\)|from\s+['"]redis['"]|require\(['"]redis['"]\)/, label: 'redis client import' },
  { pattern: /require\(['"]fs['"]\)|from\s+['"]fs['"]|require\(['"]node:fs['"]\)|from\s+['"]node:fs['"]/, label: 'fs import' },
];

function run() {
  const repoRoot = resolveRepoRoot();
  for (const relativePath of runtimeFiles) {
    const source = readSource(repoRoot, relativePath);
    for (const check of forbiddenRuntimePatterns) {
      assert.equal(
        check.pattern.test(source),
        false,
        `${relativePath} must not contain ${check.label}`,
      );
    }
  }

  for (const relativePath of legacyRuntimeFiles) {
    const source = readSource(repoRoot, relativePath);
    for (const check of forbiddenLegacyPatterns) {
      assert.equal(
        check.pattern.test(source),
        false,
        `legacy ${relativePath} must not contain ${check.label}`,
      );
    }
  }

  const serviceSource = readSource(repoRoot, 'packages/server/src/runtime/world/world-runtime-combat-action.service.ts');
  assert.equal(serviceSource.includes('recordBoundedCombatRing'), true);
  assert.equal(serviceSource.includes('buildCombatEvents'), true);
  assert.equal(serviceSource.includes('writesDatabaseInTick: false'), true);
  assert.equal(serviceSource.includes('assertCombatAoiResultEventBudget'), true);
  assert.equal(serviceSource.includes('S2C.'), false);

  const sharedCombatSource = readSource(repoRoot, 'packages/shared/src/combat-event-types.ts');
  assert.equal(sharedCombatSource.includes("channel: 'S2C.WorldDelta.fx'"), true);
  assert.equal(sharedCombatSource.includes("channel: 'S2C.Notice'"), true);
  assert.equal(sharedCombatSource.includes("channel: 'internal'"), true);
  assert.equal(sharedCombatSource.includes('allowsDiagnostics: false'), true);
  assert.equal(sharedCombatSource.includes('allowsAudit: false'), true);

  // 阶段 9 协议分层：pending cast 生命周期只定义边界，不新增 S2C 事件。
  assert.equal(sharedCombatSource.includes('COMBAT_PENDING_CAST_PROTOCOL_SPECS'), true);
  assert.equal(sharedCombatSource.includes("layer: 'chant_start'"), true);
  assert.equal(sharedCombatSource.includes("layer: 'chant_progress'"), true);
  assert.equal(sharedCombatSource.includes("layer: 'chant_resolve'"), true);
  assert.equal(sharedCombatSource.includes("layer: 'chant_cancel'"), true);
  // 吟唱完成复用 world_delta_fx + notice，不新增独立事件名。
  assert.equal(sharedCombatSource.includes("payloadShape: 'chant_resolve_ref'"), true);
  assert.equal(sharedCombatSource.includes("delivery: 'reuse_existing'"), true);

  // 同步验证 shared protocol 主 S2C 事件映射没有混入 pending cast 专用事件名。
  const sharedProtocolSource = readSource(repoRoot, 'packages/shared/src/protocol.ts');
  for (const forbidden of ['CombatChantStart', 'CombatChantProgress', 'CombatChantCancel', 'CombatChant']) {
    assert.equal(sharedProtocolSource.includes(forbidden), false, `protocol must not expose ${forbidden}`);
  }

  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-combat-boundary',
    checkedFiles: runtimeFiles.length,
    legacyCheckedFiles: legacyRuntimeFiles.length,
    forbiddenPatterns: forbiddenRuntimePatterns.map((entry) => entry.label),
    legacyForbiddenPatterns: forbiddenLegacyPatterns.map((entry) => entry.label),
    pendingCastProtocolLayers: ['chant_start', 'chant_progress', 'chant_resolve', 'chant_cancel'],
  }, null, 2));
}

function resolveRepoRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..', '..'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'packages/server/src/runtime/world/world-runtime-combat-action.service.ts'))) {
      return candidate;
    }
  }
  throw new Error(`cannot locate repo root from cwd=${process.cwd()} dirname=${__dirname}`);
}

function readSource(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

run();
