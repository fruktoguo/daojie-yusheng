import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  process.env.MULTI_WORKER_FLUSH_PLAYER_COUNT ??= '16';
  process.env.MULTI_WORKER_FLUSH_INSTANCE_COUNT ??= '16';
  process.env.MULTI_WORKER_FLUSH_PLAYER_WORKERS ??= '4';
  process.env.MULTI_WORKER_FLUSH_INSTANCE_WORKERS ??= '4';
  process.env.MULTI_WORKER_FLUSH_CONCURRENCY ??= '4';
  process.env.MULTI_WORKER_FLUSH_DELAY_MS ??= '4';
  await import('./multi-worker-flush-stability-report.js');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
