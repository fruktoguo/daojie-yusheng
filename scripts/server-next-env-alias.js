'use strict';

require('./load-local-runtime-env.js');

function readTrimmedEnv(...names) {
  for (const name of names) {
    const rawValue = process.env[name];
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (value.length > 0) return value;
  }
  return '';
}

function resolveServerNextDatabaseEnvSource() {
  if (readTrimmedEnv('SERVER_NEXT_DATABASE_URL')) return 'SERVER_NEXT_DATABASE_URL';
  if (readTrimmedEnv('DATABASE_URL')) return 'DATABASE_URL';
  return null;
}

function resolveServerNextDatabaseUrl() {
  return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}

function resolveServerNextGmPasswordEnvSource() {
  if (readTrimmedEnv('SERVER_NEXT_GM_PASSWORD')) return 'SERVER_NEXT_GM_PASSWORD';
  if (readTrimmedEnv('GM_PASSWORD')) return 'GM_PASSWORD';
  return null;
}

function resolveServerNextGmPassword(defaultValue = '') {
  return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}

function resolveServerNextUrlEnvSource() {
  if (readTrimmedEnv('SERVER_NEXT_URL')) return 'SERVER_NEXT_URL';
  return null;
}

function resolveServerNextUrl() {
  return readTrimmedEnv('SERVER_NEXT_URL');
}

function resolveServerNextShadowUrlEnvSource() {
  if (readTrimmedEnv('SERVER_NEXT_SHADOW_URL')) return 'SERVER_NEXT_SHADOW_URL';
  if (readTrimmedEnv('SERVER_NEXT_URL')) return 'SERVER_NEXT_URL';
  return null;
}

function resolveServerNextShadowUrl() {
  return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}

module.exports = {
  readTrimmedEnv,
  resolveServerNextDatabaseEnvSource,
  resolveServerNextDatabaseUrl,
  resolveServerNextGmPasswordEnvSource,
  resolveServerNextGmPassword,
  resolveServerNextUrlEnvSource,
  resolveServerNextUrl,
  resolveServerNextShadowUrlEnvSource,
  resolveServerNextShadowUrl,
};
