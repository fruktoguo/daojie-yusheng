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

function resolveServerDatabaseEnvSource() {
  if (readTrimmedEnv('SERVER_DATABASE_URL')) return 'SERVER_DATABASE_URL';
  if (readTrimmedEnv('DATABASE_URL')) return 'DATABASE_URL';
  return null;
}

function resolveServerDatabaseUrl() {
  return readTrimmedEnv('SERVER_DATABASE_URL', 'DATABASE_URL');
}

function resolveServerGmPasswordEnvSource() {
  if (readTrimmedEnv('SERVER_GM_PASSWORD')) return 'SERVER_GM_PASSWORD';
  if (readTrimmedEnv('GM_PASSWORD')) return 'GM_PASSWORD';
  return null;
}

function resolveServerGmPassword(defaultValue = '') {
  return readTrimmedEnv('SERVER_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}

function resolveServerUrlEnvSource() {
  if (readTrimmedEnv('SERVER_URL')) return 'SERVER_URL';
  return null;
}

function resolveServerUrl() {
  return readTrimmedEnv('SERVER_URL');
}

function resolveServerShadowUrlEnvSource() {
  if (readTrimmedEnv('SERVER_SHADOW_URL')) return 'SERVER_SHADOW_URL';
  if (readTrimmedEnv('SERVER_URL')) return 'SERVER_URL';
  return null;
}

function resolveServerShadowUrl() {
  return readTrimmedEnv('SERVER_SHADOW_URL', 'SERVER_URL');
}

module.exports = {
  readTrimmedEnv,
  resolveServerDatabaseEnvSource,
  resolveServerDatabaseUrl,
  resolveServerGmPasswordEnvSource,
  resolveServerGmPassword,
  resolveServerUrlEnvSource,
  resolveServerUrl,
  resolveServerShadowUrlEnvSource,
  resolveServerShadowUrl,
};
