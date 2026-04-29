import { installSmokeTimeout } from './smoke-timeout.js';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  await import('./player-dirty-domain-coverage-report.js');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
