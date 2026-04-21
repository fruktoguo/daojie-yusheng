import * as fs from 'node:fs';
import * as path from 'node:path';

const packageRoot = (() => {
  const override = typeof process.env.SERVER_NEXT_PACKAGE_ROOT === 'string'
    ? process.env.SERVER_NEXT_PACKAGE_ROOT.trim()
    : '';
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(__dirname, '..', '..');
})();

const repoRoot = path.resolve(packageRoot, '..', '..');

const candidateFiles = [
  path.join(repoRoot, '.runtime', 'server-next.local.env'),
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(packageRoot, '.env'),
  path.join(packageRoot, '.env.local'),
];

function normalizeBooleanEnv(rawValue: string | undefined): boolean {
  if (typeof rawValue !== 'string') {
    return false;
  }

  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

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

export function loadLocalRuntimeEnv(): void {
  if (normalizeBooleanEnv(process.env.SERVER_NEXT_SKIP_LOCAL_ENV_AUTOLOAD)) {
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
