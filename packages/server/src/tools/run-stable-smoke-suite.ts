// @ts-nocheck

/**
 * 用途：复制独立 dist 快照后执行 smoke-suite，避免被后台 watcher/compile 清空共享 dist。
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { createStableDistSnapshot, resolveToolPackageRoot } from './stable-dist';

async function main() {
  const packageRoot = resolveToolPackageRoot(__dirname);
  const repoRoot = path.resolve(packageRoot, '..', '..');
  const snapshot = createStableDistSnapshot({
    label: 'smoke-suite',
    packageRoot,
  });
  const scriptPath = path.join(snapshot.distRoot, 'tools', 'smoke-suite.js');

  const child = spawn('node', [scriptPath, ...process.argv.slice(2)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SERVER_NEXT_PACKAGE_ROOT: packageRoot,
      SERVER_NEXT_TOOL_DIST_ROOT: snapshot.distRoot,
    },
    stdio: 'inherit',
  });

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      snapshot.cleanup();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`run-stable-smoke-suite failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
