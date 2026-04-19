import path from 'node:path';

require(path.resolve(__dirname, '../../../../scripts/load-local-runtime-env.js'));

export function readTrimmedEnv(...names: string[]): string {
  for (const name of names) {
    const rawValue = process.env[name];
    if (typeof rawValue !== 'string') {
      continue;
    }
    const value = rawValue.trim();
    if (value.length > 0) {
      return value;
    }
  }
  return '';
}

export function resolveServerNextDatabaseEnvSource():
  | 'SERVER_NEXT_DATABASE_URL'
  | 'DATABASE_URL'
  | null {
  if (readTrimmedEnv('SERVER_NEXT_DATABASE_URL')) {
    return 'SERVER_NEXT_DATABASE_URL';
  }
  if (readTrimmedEnv('DATABASE_URL')) {
    return 'DATABASE_URL';
  }
  return null;
}

export function resolveServerNextDatabaseUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}

export function resolveServerNextGmPasswordEnvSource():
  | 'SERVER_NEXT_GM_PASSWORD'
  | 'GM_PASSWORD'
  | null {
  if (readTrimmedEnv('SERVER_NEXT_GM_PASSWORD')) {
    return 'SERVER_NEXT_GM_PASSWORD';
  }
  if (readTrimmedEnv('GM_PASSWORD')) {
    return 'GM_PASSWORD';
  }
  return null;
}

export function resolveServerNextGmPassword(defaultValue = ''): string {
  return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}

export function resolveServerNextUrlEnvSource(): 'SERVER_NEXT_URL' | null {
  if (readTrimmedEnv('SERVER_NEXT_URL')) {
    return 'SERVER_NEXT_URL';
  }
  return null;
}

export function resolveServerNextUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_URL');
}

export function resolveServerNextShadowUrlEnvSource():
  | 'SERVER_NEXT_SHADOW_URL'
  | 'SERVER_NEXT_URL'
  | null {
  if (readTrimmedEnv('SERVER_NEXT_SHADOW_URL')) {
    return 'SERVER_NEXT_SHADOW_URL';
  }
  if (readTrimmedEnv('SERVER_NEXT_URL')) {
    return 'SERVER_NEXT_URL';
  }
  return null;
}

export function resolveServerNextShadowUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
