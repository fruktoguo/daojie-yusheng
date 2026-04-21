// @ts-nocheck

/**
 * 用途：为 smoke / audit 等验证入口提供稳定的 dist 快照，避免被后台 compile/watch 进程清空共享 dist。
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * resolveToolPackageRoot：解析工具脚本应使用的真实包根目录。
 * @param defaultDirname 当前脚本目录。
 * @returns 返回包根目录绝对路径。
 */
export function resolveToolPackageRoot(defaultDirname: string) {
  const override = typeof process.env.SERVER_NEXT_PACKAGE_ROOT === 'string'
    ? process.env.SERVER_NEXT_PACKAGE_ROOT.trim()
    : '';
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(defaultDirname, '..', '..');
}

/**
 * resolveToolDistRoot：解析工具脚本应读取的 dist 目录。
 * @param defaultDirname 当前脚本目录。
 * @param packageRoot 包根目录。
 * @returns 返回 dist 目录绝对路径。
 */
export function resolveToolDistRoot(defaultDirname: string, packageRoot = resolveToolPackageRoot(defaultDirname)) {
  const override = typeof process.env.SERVER_NEXT_TOOL_DIST_ROOT === 'string'
    ? process.env.SERVER_NEXT_TOOL_DIST_ROOT.trim()
    : '';
  if (override) {
    return path.resolve(override);
  }
  return path.join(packageRoot, 'dist');
}

/**
 * createStableDistSnapshot：复制一份独立 dist 快照，供当前验证进程独占使用。
 * @param options 选项。
 * @returns 返回快照路径与清理函数。
 */
export function createStableDistSnapshot(options: {
  label?: string;
  packageRoot?: string;
  sourceDistRoot?: string;
} = {}) {
  const packageRoot = path.resolve(options.packageRoot ?? resolveToolPackageRoot(__dirname));
  const sourceDistRoot = path.resolve(options.sourceDistRoot ?? path.join(packageRoot, 'dist'));
  const stableRuntimeRoot = path.join(packageRoot, '.runtime', 'stable-dist');
  fs.mkdirSync(stableRuntimeRoot, { recursive: true });
  const snapshotRoot = fs.mkdtempSync(path.join(stableRuntimeRoot, `${options.label ?? 'tool'}-`));
  const snapshotDistRoot = path.join(snapshotRoot, 'dist');

  if (!fs.existsSync(sourceDistRoot)) {
    throw new Error(`stable dist snapshot source missing: ${sourceDistRoot}`);
  }

  fs.cpSync(sourceDistRoot, snapshotDistRoot, {
    recursive: true,
    force: true,
  });

  let cleanedUp = false;
  return {
    packageRoot,
    sourceDistRoot,
    snapshotRoot,
    distRoot: snapshotDistRoot,
    cleanup() {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      fs.rmSync(snapshotRoot, { recursive: true, force: true });
    },
  };
}
