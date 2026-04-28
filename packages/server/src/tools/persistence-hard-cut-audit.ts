import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AuditRule = {
  file: string;
  banned: Array<{
    pattern: string;
    reason: string;
  }>;
};

const RULES: AuditRule[] = [
  {
    file: 'packages/server/src/runtime/world/world-runtime-lifecycle.service.ts',
    banned: [
      { pattern: 'loadMapSnapshot(', reason: '运行时恢复不得回读旧 map snapshot' },
      { pattern: 'SERVER_MAP_LEGACY_SNAPSHOT_RESTORE', reason: '硬切后不得保留旧 map snapshot 恢复开关' },
    ],
  },
  {
    file: 'packages/server/src/runtime/world/world-runtime-instance-lease.helpers.ts',
    banned: [
      { pattern: 'loadMapSnapshot(', reason: '实例 lease 接管不得回读旧 map snapshot' },
      { pattern: 'SERVER_MAP_LEGACY_SNAPSHOT_RESTORE', reason: '硬切后不得保留旧 map snapshot 恢复开关' },
    ],
  },
  {
    file: 'packages/server/src/persistence/map-persistence-flush.service.ts',
    banned: [
      { pattern: 'saveMapSnapshot(', reason: '地图刷盘不得写 persistent_documents 整档快照' },
      { pattern: 'listDirtyPersistentInstances()', reason: '地图刷盘不得回退到整实例 dirty 扫描' },
    ],
  },
  {
    file: 'packages/server/src/persistence/player-persistence-flush.service.ts',
    banned: [
      { pattern: 'savePlayerSnapshot(', reason: '玩家刷盘不得写 server_player_snapshot 整档快照' },
      { pattern: 'savePlayerSnapshotProjection(playerId, snapshot)', reason: '玩家刷盘不得把未知脏域升级成全域投影' },
    ],
  },
  {
    file: 'packages/server/src/app.module.ts',
    banned: [
      { pattern: 'PlayerPersistenceService,', reason: 'server_player_snapshot 服务不得注册进主线运行时 DI' },
      { pattern: "import { PlayerPersistenceService }", reason: '主线 AppModule 不得导入旧玩家整档快照服务' },
    ],
  },
  {
    file: 'packages/server/src/persistence/durable-operation.service.ts',
    banned: [
      { pattern: 'server_player_snapshot', reason: 'durable operation 不得顺手维护旧玩家整档表' },
      { pattern: 'upsertPlayerSnapshot(', reason: 'durable operation 不得写整档玩家快照' },
    ],
  },
  {
    file: 'packages/server/src/http/native/native-gm-player.service.ts',
    banned: [
      { pattern: 'PlayerPersistenceService', reason: 'GM 玩家管理不得绕回旧 server_player_snapshot' },
      { pattern: 'server_player_snapshot', reason: 'GM 玩家数据库视图不得把旧整档表当主线表' },
    ],
  },
  {
    file: 'packages/server/src/http/native/native-gm-mail.service.ts',
    banned: [
      { pattern: 'PlayerPersistenceService', reason: 'GM 广播收件人不得枚举旧 server_player_snapshot' },
    ],
  },
  {
    file: 'packages/server/src/http/native/native-gm-state-query.service.ts',
    banned: [
      { pattern: 'PlayerPersistenceService', reason: 'GM 玩家列表不得枚举旧 server_player_snapshot' },
    ],
  },
  {
    file: 'packages/server/src/persistence/redeem-code-persistence.service.ts',
    banned: [
      { pattern: 'persistent_documents', reason: '兑换码真源必须是 server_redeem_code_* 专表' },
      { pattern: 'ensurePersistentDocumentsTable', reason: '兑换码服务不得初始化通用文档桶' },
    ],
  },
  {
    file: 'packages/server/src/persistence/suggestion-persistence.service.ts',
    banned: [
      { pattern: 'persistent_documents', reason: '建议真源必须是 server_suggestion_* 专表' },
      { pattern: 'ensurePersistentDocumentsTable', reason: '建议服务不得初始化通用文档桶' },
    ],
  },
  {
    file: 'packages/server/src/persistence/market-persistence.service.ts',
    banned: [
      { pattern: 'persistent_documents', reason: '坊市订单/历史/托管仓不得再写通用文档桶' },
      { pattern: 'LEGACY_MARKET_', reason: '坊市硬切后不得保留旧 scope 回读优先级' },
    ],
  },
  {
    file: 'packages/server/src/persistence/gm-map-config-persistence.service.ts',
    banned: [
      { pattern: 'persistent_documents', reason: 'GM 地图配置真源必须是 server_gm_map_config 专表' },
      { pattern: 'ensurePersistentDocumentsTable', reason: 'GM 地图配置服务不得初始化通用文档桶' },
    ],
  },
  {
    file: 'packages/server/src/runtime/gm/runtime-gm-auth.service.ts',
    banned: [
      { pattern: 'persistent_documents', reason: 'GM 鉴权真源必须是 server_gm_auth 专表' },
      { pattern: 'ensurePersistentDocumentsTable', reason: 'GM 鉴权服务不得初始化通用文档桶' },
    ],
  },
  {
    file: 'packages/server/src/runtime/world/world-runtime-sect.service.ts',
    banned: [
      { pattern: 'persistent_documents', reason: '宗门真源必须是 server_sect 专表' },
      { pattern: 'server_sects_v1', reason: '宗门硬切后不得保留旧全服文档 scope' },
    ],
  },
  {
    file: 'packages/server/src/network/world-player-snapshot.service.ts',
    banned: [
      { pattern: 'playerPersistenceService.loadPlayerSnapshot(', reason: '会话恢复不得回读旧 server_player_snapshot' },
      { pattern: 'playerPersistenceService.savePlayerSnapshot(', reason: '会话恢复不得补种旧 server_player_snapshot' },
    ],
  },
  {
    file: 'packages/server/src/runtime/player/player-runtime.service.ts',
    banned: [
      { pattern: 'getInventoryFallbackWalletBalance', reason: '钱包余额不得从背包物品兼容兜底' },
      { pattern: 'consumeInventoryWalletFallback', reason: '钱包扣费不得消费背包物品兼容兜底' },
    ],
  },
];

function main(): void {
  const failures: Array<{ file: string; pattern: string; reason: string }> = [];
  const checked: Array<{ file: string; bannedPatterns: number }> = [];
  for (const rule of RULES) {
    const absolutePath = resolveSourcePath(rule.file);
    const source = readFileSync(absolutePath, 'utf8');
    checked.push({ file: rule.file, bannedPatterns: rule.banned.length });
    for (const banned of rule.banned) {
      if (source.includes(banned.pattern)) {
        failures.push({
          file: rule.file,
          pattern: banned.pattern,
          reason: banned.reason,
        });
      }
    }
  }
  const report = {
    ok: failures.length === 0,
    checked,
    failures,
    answers: '硬切持久化静态边界：玩家、地图、GM、坊市、兑换码、建议和宗门主线不得继续使用旧整档快照或通用文档桶真源。',
    completionMapping: 'replace-ready:proof:persistence-hard-cut-audit',
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();

function resolveSourcePath(file: string): string {
  const packageRelativeFile = file.startsWith('packages/server/')
    ? file.slice('packages/server/'.length)
    : file;
  const candidates = [
    resolve(process.cwd(), file),
    resolve(process.cwd(), '..', '..', file),
    resolve(__dirname, '..', '..', packageRelativeFile),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`audit_source_not_found:${file}`);
  }
  return found;
}
