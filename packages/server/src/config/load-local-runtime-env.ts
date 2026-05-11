/**
 * 本地运行时环境变量自动加载：启动期从仓库根和包目录的 .env 文件中
 * 读取环境变量，仅填充尚未设置的变量（不覆盖已有值）。
 * 支持 export 前缀、引号包裹和注释行，可通过 SERVER_SKIP_LOCAL_ENV_AUTOLOAD 跳过。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** 解析包根目录：优先使用 SERVER_PACKAGE_ROOT 覆盖，否则从编译产物反推 */
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

/** 按优先级排列的 .env 候选文件路径 */
const candidateFiles = [
  path.join(repoRoot, '.runtime', 'server.local.env'),
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(packageRoot, '.env'),
  path.join(packageRoot, '.env.local'),
];

/** 将环境变量字符串值解析为布尔 */
function normalizeBooleanEnv(rawValue: string | undefined): boolean {
  if (typeof rawValue !== 'string') {
    return false;
  }

  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/** 去除值两端引号（单引号或双引号包裹） */
function normalizeValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/** 解析 .env 文件内容为 key-value 对列表，跳过注释和空行 */
function parseEnvFile(content: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    const value = normalizeValue(normalized.slice(separatorIndex + 1));
    entries.push([key, value]);
  }

  return entries;
}

/** 遍历候选 .env 文件，将未设置的变量注入 process.env */
export function loadLocalRuntimeEnv(): void {
  if (normalizeBooleanEnv(process.env.SERVER_SKIP_LOCAL_ENV_AUTOLOAD)) {
    return;
  }

  for (const absolutePath of candidateFiles) {
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const entries = parseEnvFile(fs.readFileSync(absolutePath, 'utf8'));
    for (const [key, value] of entries) {
      if (typeof process.env[key] !== 'string' || process.env[key]?.trim() === '') {
        process.env[key] = value;
      }
    }
  }
}

loadLocalRuntimeEnv();
