import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function main(): void {
  const migrationSource = readFileSync(
    resolveSourcePath('packages/server/src/tools/import-legacy-persistence-once.ts'),
    'utf8',
  );
  const gmStateSource = readFileSync(
    resolveSourcePath('packages/server/src/http/native/native-gm-state-query.service.ts'),
    'utf8',
  );

  assert.ok(
    migrationSource.includes('savePlayerPresence(entry.playerId'),
    'expected legacy player-domain import to seed player_presence',
  );
  assert.ok(
    migrationSource.includes('inWorld: Boolean(entry.snapshot.placement?.templateId)'),
    'expected imported player presence to preserve offline hanging inWorld=true when placement exists',
  );
  assert.ok(
    gmStateSource.includes('LEFT JOIN player_presence presence ON presence.player_id = rw.player_id'),
    'expected GM player summaries to read player_presence',
  );
  assert.ok(
    gmStateSource.includes('COALESCE(presence.in_world, position.player_id IS NOT NULL) AS in_world'),
    'expected GM player summaries to fall back to checkpoint presence for pre-fix imports',
  );

  console.log(JSON.stringify({
    ok: true,
    case: 'offline-hanging-presence-import',
    answers: '旧快照迁移会为导入玩家补 player_presence；GM 玩家摘要不再硬编码 persisted 玩家为普通离线，而是读取 presence，并在旧数据缺 presence 时按位置 checkpoint 保留离线挂机展示。',
    excludes: '不证明真实数据库导入、服务器完整重启或客户端渲染，只证明源码合同不会再把导入玩家的驻留世界状态投影为普通离线。',
    completionMapping: 'release:proof:offline-hanging-presence-import',
  }, null, 2));
}

function resolveSourcePath(relativePath: string): string {
  return `${process.cwd()}/${relativePath}`;
}

main();
