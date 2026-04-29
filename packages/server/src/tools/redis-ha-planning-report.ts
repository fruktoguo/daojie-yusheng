import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { resolveServerRedisMode, resolveServerRedisUrl } from '../config/env-alias';

function main(): void {
  const mode = resolveServerRedisMode();
  const redisUrl = resolveServerRedisUrl();
  const normalizedMode = normalizeMode(mode);
  const summary = {
    ok: true,
    redisUrlConfigured: redisUrl.length > 0,
    redisMode: normalizedMode,
    redisModeSource: mode.length > 0 ? mode : null,
    recommendations: {
      preferred: normalizedMode === 'sentinel' || normalizedMode === 'cluster' ? '已满足 HA 形态入口' : '建议切换 sentinel 或 cluster',
      singleNode: '单节点建议至少保留独立连接池和健康检查，避免把 Redis 当强真源',
      workerFallback: 'worker 在 Redis 不可用时应继续直接轮询 flush ledger',
      poolBudget: '单节点 10-20 连接，多节点按 4 节点 x 16 连接起步并配合 pooler',
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

function normalizeMode(mode: string): 'standalone' | 'sentinel' | 'cluster' | 'unknown' {
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'sentinel') {
    return 'sentinel';
  }
  if (normalized === 'cluster') {
    return 'cluster';
  }
  if (normalized === 'standalone') {
    return 'standalone';
  }
  return 'unknown';
}

main();
