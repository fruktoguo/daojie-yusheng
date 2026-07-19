import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const proofPath = resolve(rootDir, 'packages', 'server', 'dist', 'tools', 'repair-issue-000025-proof.js');

run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', '@mud/server', 'compile']);
run(process.execPath, [proofPath]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
