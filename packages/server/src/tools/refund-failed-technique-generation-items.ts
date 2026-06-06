import { Pool } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';
import { ensureDurableOperationTables } from '../persistence/durable-operation.service';
import {
  ensureGeneratedTechniqueTables,
  previewFailedTechniqueGenerationItemRefunds,
  refundFailedTechniqueGenerationItems,
} from '../persistence/generated-technique-persistence.service';
import { ensurePlayerDomainTables } from '../persistence/player-domain-persistence.service';

interface CliOptions {
  apply: boolean;
  allowOnlinePlayers: boolean;
  batchSize: number;
  maxJobs?: number;
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    allowOnlinePlayers: false,
    batchSize: 100,
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.apply = false;
      continue;
    }
    if (arg === '--allow-online') {
      options.allowOnlinePlayers = true;
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parsePositiveInteger(arg.slice('--batch-size='.length), 'batch-size');
      continue;
    }
    if (arg.startsWith('--max-jobs=')) {
      options.maxJobs = parsePositiveInteger(arg.slice('--max-jobs='.length), 'max-jobs');
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正整数`);
  }
  return value;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('SERVER_DATABASE_URL/DATABASE_URL 未配置，无法扫描历史悟道失败玉简返还');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await ensureGeneratedTechniqueTables(pool);
    await ensurePlayerDomainTables(pool);
    await ensureDurableOperationTables(pool);

    const before = await previewFailedTechniqueGenerationItemRefunds(pool);
    if (!options.apply) {
      console.log(JSON.stringify({
        ok: true,
        mode: 'dry-run',
        answers: '仅预览历史悟道失败且已扣未还的玉简，不修改库存、outbox、审计或 technique_generation_job.item_refunded。',
        preview: before,
        applyHint: '确认维护窗口内玩家离线后，可追加 --apply 执行；presence 残留在线时才使用 --allow-online。',
        completionMapping: 'technique-generation:refund-failed-items:dry-run',
      }, null, 2));
      return;
    }

    const result = await refundFailedTechniqueGenerationItems(pool, {
      batchSize: options.batchSize,
      maxJobs: options.maxJobs,
      allowOnlinePlayers: options.allowOnlinePlayers,
    });
    const after = await previewFailedTechniqueGenerationItemRefunds(pool);
    console.log(JSON.stringify({
      ok: true,
      mode: 'apply',
      answers: '已按 technique_generation_job.item_refunded 幂等标记补偿历史悟道失败玉简，并写入背包、恢复水位、outbox 和资产审计。',
      before,
      result,
      after,
      options: {
        batchSize: options.batchSize,
        maxJobs: options.maxJobs ?? null,
        allowOnlinePlayers: options.allowOnlinePlayers,
      },
      completionMapping: 'technique-generation:refund-failed-items:apply',
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
