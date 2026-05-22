/**
 * 本文件负责服务端运行配置的解析或角色判断，是启动期配置边界的一部分。
 *
 * 维护时要让默认值对生产环境友好，并避免把临时本地配置误当作线上真源。
 */
/**
 * 本地运行时环境变量自动加载：启动期从仓库根和包目录的 .env 文件中
 * 读取环境变量；普通 .env 仅填充尚未设置的变量，`.runtime/server.local.env`
 * 作为 GM 持久化运行时覆盖层会在最后覆盖同名变量。
 * 支持 export 前缀、引号包裹和注释行，可通过 SERVER_SKIP_LOCAL_ENV_AUTOLOAD 跳过。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  RUNTIME_ENV_FILE_PATH,
  applyRuntimeEnvFileToProcess,
  parseEnvText,
} from './runtime-env-file';

/** 应用 GM runtime 覆盖前的 env 快照，用于删除 runtime 覆盖后回退。 */
let preRuntimeOverlayEnvSnapshot = new Map(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

/** 解析包根目录：优先使用 SERVER_PACKAGE_ROOT 覆盖，否则从编译产物反推。 */
const packageRoot = (() => {
  const override = typeof process.env.SERVER_PACKAGE_ROOT === 'string'
    ? process.env.SERVER_PACKAGE_ROOT.trim()
    : '';
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(__dirname, '..', '..');
})();

const repoRoot = path.resolve(packageRoot, '..', '..');

/** 普通 .env 候选文件路径：只填充缺失变量，不覆盖已有值。 */
const candidateFiles = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(packageRoot, '.env'),
  path.join(packageRoot, '.env.local'),
];

/** 读取 GM runtime 覆盖前的 env 快照。 */
export function getInitialRuntimeEnvSnapshot(): ReadonlyMap<string, string> {
  return preRuntimeOverlayEnvSnapshot;
}

/** 将环境变量字符串值解析为布尔。 */
function normalizeBooleanEnv(rawValue: string | undefined): boolean {
  if (typeof rawValue !== 'string') {
    return false;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/** 当前进程是否显式跳过本地 runtime env 自动加载。 */
export function shouldSkipLocalRuntimeEnvAutoload(): boolean {
  return normalizeBooleanEnv(process.env.SERVER_SKIP_LOCAL_ENV_AUTOLOAD);
}

/** 遍历候选 .env 文件，将未设置的变量注入 process.env；最后应用 GM runtime 覆盖。 */
export function loadLocalRuntimeEnv(): void {
  if (shouldSkipLocalRuntimeEnvAutoload()) {
    return;
  }

  for (const absolutePath of candidateFiles) {
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const entries = parseEnvText(fs.readFileSync(absolutePath, 'utf8'));
    for (const [key, value] of entries) {
      if (typeof process.env[key] !== 'string' || process.env[key]?.trim() === '') {
        process.env[key] = value;
      }
    }
  }

  // 记录普通 .env 加载后的快照，便于 GM 删除 runtime 覆盖时回退。
  preRuntimeOverlayEnvSnapshot = new Map(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );

  // `.runtime/server.local.env` 是 GM 持久化运行时覆盖层，需要覆盖同名变量。
  if (fs.existsSync(RUNTIME_ENV_FILE_PATH)) {
    applyRuntimeEnvFileToProcess(RUNTIME_ENV_FILE_PATH, true);
  }
}

loadLocalRuntimeEnv();
