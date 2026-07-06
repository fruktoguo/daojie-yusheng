// @ts-nocheck

/**
 * 用途：复制独立 dist 快照后执行协议审计，避免被后台 watcher/compile 清空共享 dist。
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import '../config/load-local-runtime-env';
import { createStableDistSnapshot, resolveToolPackageRoot } from './stable-dist';

async function main() {
  const packageRoot = resolveToolPackageRoot(__dirname);
  const repoRoot = path.resolve(packageRoot, '..', '..');
  const snapshot = createStableDistSnapshot({
    label: 'protocol-audit',
    packageRoot,
  });
  const scriptPath = path.join(snapshot.distRoot, 'tools', 'run-protocol-audit.js');
  const withDbAudit = process.argv.includes('--with-db') || process.env.SERVER_PROTOCOL_AUDIT_DB_MODE === 'with-db';
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '1',
    SERVER_PACKAGE_ROOT: packageRoot,
    SERVER_TOOL_DIST_ROOT: snapshot.distRoot,
  };
  if (!withDbAudit) {
    childEnv.DATABASE_URL = '';
    childEnv.SERVER_DATABASE_URL = '';
    childEnv.DATABASE_POOLER_URL = '';
    childEnv.SERVER_DATABASE_POOLER_URL = '';
  }

  const child = spawn('node', [scriptPath, ...process.argv.slice(2)], {
    cwd: repoRoot,
    env: childEnv,
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
      reject(new Error(`run-stable-protocol-audit failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
