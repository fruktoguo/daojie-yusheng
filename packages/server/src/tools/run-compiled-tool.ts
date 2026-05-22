/**
 * 本文件是服务端冷路径运维工具入口，用于迁移、预检、清理或后台任务手动执行。
 *
 * 维护时要让脚本参数、失败退出码和副作用范围清晰，避免误操作生产数据。
 */
// @ts-nocheck

/**
 * 用途：在完成 compile 后按文件名执行 dist/tools 下的单个工具脚本。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveServerGmPassword } from '../config/env-alias';
import { createStableDistSnapshot, resolveToolPackageRoot } from './stable-dist';

function normalizeToolScriptName(input: string | undefined): string | null {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw || raw.includes('/') || raw.includes('\\') || raw.includes('\0')) {
    return null;
  }
  if (raw.endsWith('.js')) {
    return raw;
  }
  if (raw.includes('.')) {
    return null;
  }
  return `${raw}.js`;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === '--') {
    rawArgs.shift();
  }
  const [toolInput, ...toolArgs] = rawArgs;
  const scriptName = normalizeToolScriptName(toolInput);
  if (!scriptName) {
    console.error('usage: pnpm --filter @mud/server tool -- <dist-tools-script> [...args]');
    console.error('example: pnpm --filter @mud/server tool -- world-runtime-auto-combat-smoke');
    process.exitCode = 1;
    return;
  }

  const packageRoot = resolveToolPackageRoot(__dirname);
  const repoRoot = path.resolve(packageRoot, '..', '..');
  const snapshot = createStableDistSnapshot({
    label: 'compiled-tool',
    packageRoot,
  });
  const scriptPath = path.join(snapshot.distRoot, 'tools', scriptName);
  if (!fs.existsSync(scriptPath)) {
    snapshot.cleanup();
    throw new Error(`compiled tool not found: ${scriptName}`);
  }
  const gmPassword = resolveServerGmPassword('admin123');

  const child = spawn('node', [scriptPath, ...toolArgs], {
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
      reject(new Error(`${scriptName} failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
