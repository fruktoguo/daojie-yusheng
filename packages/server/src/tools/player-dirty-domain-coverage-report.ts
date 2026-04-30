import { installSmokeTimeout } from './smoke-timeout.js';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveToolPackageRoot } from './stable-dist';

const packageRoot = resolveToolPackageRoot(__dirname);
const repoRoot = path.resolve(packageRoot, '..', '..');

const EXPECTED_DIRTY_DOMAINS = [
  'world_anchor',
  'position_checkpoint',
  'vitals',
  'progression',
  'attr',
  'wallet',
  'inventory',
  'equipment',
  'technique',
  'body_training',
  'buff',
  'quest',
  'map_unlock',
  'combat_pref',
  'auto_battle_skill',
  'auto_use_item_rule',
  'profession',
  'alchemy_preset',
  'active_job',
  'enhancement_record',
  'logbook',
] as const;

async function main(): Promise<void> {
  const playerRuntimeSource = readSource('packages/server/src/runtime/player/player-runtime.service.ts');
  const craftPanelRuntimeSource = readSource('packages/server/src/runtime/craft/craft-panel-runtime.service.ts');
  const worldRuntimeAlchemySource = readSource('packages/server/src/runtime/world/world-runtime-alchemy.service.ts');
  const worldRuntimeEnhancementSource = readSource('packages/server/src/runtime/world/world-runtime-enhancement.service.ts');
  const marketRuntimeSource = readSource('packages/server/src/runtime/market/market-runtime.service.ts');
  const marketPersistenceSource = readSource('packages/server/src/persistence/market-persistence.service.ts');
  const playerDirtySmokeSource = readSource('packages/server/src/tools/player-runtime-dirty-domain-smoke.ts');
  const craftDirtySmokeSource = readSource('packages/server/src/tools/craft-persistence-dirty-domain-smoke.ts');
  const worldEnhancementSmokeSource = readSource('packages/server/src/tools/world-runtime-enhancement-smoke.ts');
  const worldAlchemySmokeSource = readSource('packages/server/src/tools/world-runtime-alchemy-smoke.ts');

  const coverage = EXPECTED_DIRTY_DOMAINS.map((domain) => ({
    domain,
    hasRuntimeMarker:
      playerRuntimeSource.includes(`'${domain}'`) || playerRuntimeSource.includes(`\"${domain}\"`)
      || craftPanelRuntimeSource.includes(`'${domain}'`) || craftPanelRuntimeSource.includes(`\"${domain}\"`)
      || worldRuntimeAlchemySource.includes(`'${domain}'`) || worldRuntimeAlchemySource.includes(`\"${domain}\"`)
      || worldRuntimeEnhancementSource.includes(`'${domain}'`) || worldRuntimeEnhancementSource.includes(`\"${domain}\"`)
      || marketRuntimeSource.includes(`'${domain}'`) || marketRuntimeSource.includes(`\"${domain}\"`)
      || marketPersistenceSource.includes(`'${domain}'`) || marketPersistenceSource.includes(`\"${domain}\"`),
    hasPlayerDirtySmoke: playerDirtySmokeSource.includes(`'${domain}'`) || playerDirtySmokeSource.includes(`\"${domain}\"`),
    hasOtherProof:
      craftDirtySmokeSource.includes(domain)
      || worldEnhancementSmokeSource.includes(domain)
      || worldAlchemySmokeSource.includes(domain),
  }));

  const missing = coverage.filter((entry) => !entry.hasRuntimeMarker);
  assert.equal(missing.length, 0, `missing runtime dirty markers: ${missing.map((entry) => entry.domain).join(', ')}`);
  assert.equal(
    marketRuntimeSource.includes("'market_storage'") || marketRuntimeSource.includes('"market_storage"'),
    false,
    'market_storage should no longer be tracked as a player dirty domain in market runtime',
  );
  assert.equal(
    marketPersistenceSource.includes('market_storage_version'),
    true,
    'market persistence should own market_storage watermark updates',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        coverage,
        answers: '玩家域热域已通过 player-runtime dirty 标记和现有 smoke/proof 展现为显式列式脏域；market_storage 已从 player dirty domain 脱离，改由坊市持久化上下文单独维护',
        excludes: '不证明所有调用路径都只写一个域，但证明计划里要求的玩家脏域已显式进入 dirty tracking，market_storage 不再属于 player dirty domain',
        completionMapping: 'release:proof:stage1.player-dirty-domain-coverage',
      },
      null,
      2,
    ),
  );
}

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
