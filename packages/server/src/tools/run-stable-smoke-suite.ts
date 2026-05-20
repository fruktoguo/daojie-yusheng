// @ts-nocheck

/**
 * 用途：复制独立 dist 快照后执行 smoke-suite，避免被后台 watcher/compile 清空共享 dist。
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { createStableDistSnapshot, resolveToolPackageRoot } from './stable-dist';

function resolveStableSmokeGmPassword(defaultValue = ''): string {
  return (
    process.env.SERVER_GM_PASSWORD?.trim()
    || process.env.GM_PASSWORD?.trim()
    || defaultValue
  );
}

/**
 * 当 SERVER_NODE_ID 未显式设置时，从数据库查询当前 public:yunlai_town 的 lease 持有者 node ID，
 * 确保 smoke 临时服务器与实际 lease 持有者使用相同的 node ID，避免 lease fencing 冲突。
 */
async function resolveSmokeNodeId(): Promise<string> {
  const explicit = process.env.SERVER_NODE_ID?.trim();
  if (explicit) return explicit;
  const databaseUrl = process.env.SERVER_DATABASE_URL?.trim()
    || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return '';
  try {
    const pg = await import('pg');
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 3000,
    });
    try {
      const result = await pool.query(
        'SELECT assigned_node_id FROM instance_catalog WHERE instance_id = $1 AND assigned_node_id IS NOT NULL LIMIT 1',
        ['public:yunlai_town'],
      );
      const nodeId = typeof result.rows[0]?.assigned_node_id === 'string'
        ? result.rows[0].assigned_node_id.trim()
        : '';
      return nodeId;
    } finally {
      await pool.end().catch(() => undefined);
    }
  } catch {
    return '';
  }
}

async function main() {
  const packageRoot = resolveToolPackageRoot(__dirname);
  const repoRoot = path.resolve(packageRoot, '..', '..');
  const gmPassword = resolveStableSmokeGmPassword('admin123');
  const smokeNodeId = resolveSmokeNodeId();
  const snapshot = createStableDistSnapshot({
    label: 'smoke-suite',
    packageRoot,
  });
  const scriptPath = path.join(snapshot.distRoot, 'tools', 'smoke-suite.js');

  const child = spawn('node', [scriptPath, ...process.argv.slice(2)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SERVER_PACKAGE_ROOT: packageRoot,
      SERVER_TOOL_DIST_ROOT: snapshot.distRoot,
      SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD:
        process.env.SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD
        || process.env.GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD
        || '1',
      SERVER_GM_PASSWORD: gmPassword,
      ...(smokeNodeId ? { SERVER_NODE_ID: smokeNodeId } : {}),
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
