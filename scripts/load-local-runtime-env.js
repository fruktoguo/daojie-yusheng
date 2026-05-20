'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const runtimeEnvFile = path.join(repoRoot, '.runtime', 'server.local.env');
const candidateFiles = [
  '.env',
  '.env.local',
  'packages/server/.env',
  'packages/server/.env.local',
];

function normalizeBooleanEnv(rawValue) {
  if (typeof rawValue !== 'string') {
    return false;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeValue(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/gu, "'").replace(/\\\\/gu, '\\');
  }
  return trimmed;
}

function parseEnvFile(content) {
  const entries = [];
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

function loadEntriesFromFile(absolutePath, overwrite) {
  if (!fs.existsSync(absolutePath)) {
    return;
  }
  const entries = parseEnvFile(fs.readFileSync(absolutePath, 'utf8'));
  for (const [key, value] of entries) {
    if (overwrite) {
      process.env[key] = value;
      continue;
    }
    if (typeof process.env[key] !== 'string' || process.env[key].trim() === '') {
      process.env[key] = value;
    }
  }
}

function loadLocalRuntimeEnv() {
  if (normalizeBooleanEnv(process.env.SERVER_SKIP_LOCAL_ENV_AUTOLOAD)) {
    return;
  }

  for (const relativePath of candidateFiles) {
    loadEntriesFromFile(path.join(repoRoot, relativePath), false);
  }

  loadEntriesFromFile(runtimeEnvFile, true);
}

loadLocalRuntimeEnv();

module.exports = {
  loadLocalRuntimeEnv,
};
