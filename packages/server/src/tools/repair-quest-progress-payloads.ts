/**
 * 冷路径 CLI 包装：正式运维入口在 GM 快捷操作中；本脚本只用于本地验证和应急命令行执行。
 */
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { repairQuestProgressPayloads } from '../persistence/quest-progress-payload-repair';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      mode: options.mode,
      answers: '扫描并修复历史 player_quest_progress.raw_payload/progress_payload 需要真实数据库连接',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await repairQuestProgressPayloads(pool, options);
    console.log(JSON.stringify({
      ...result,
      answers: result.mode === 'apply'
        ? '已按当前任务模板修复历史任务进度结构化 payload'
        : '已预览历史任务进度结构化 payload 修复范围，未写库',
    }, null, 2));
  } finally {
    await pool.end();
  }
}

function parseArgs(argv: string[]): {
  mode: 'dry-run' | 'apply';
  playerId: string | null;
  limit: number | null;
} {
  let playerId: string | null = null;
  let limit: number | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--player=')) {
      const value = arg.slice('--player='.length).trim();
      playerId = value || null;
    } else if (arg.startsWith('--limit=')) {
      const value = Math.trunc(Number(arg.slice('--limit='.length)));
      limit = Number.isFinite(value) && value > 0 ? value : null;
    }
  }
  return {
    mode: argv.includes('--apply') ? 'apply' : 'dry-run',
    playerId,
    limit,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
