"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveServerNextShadowUrl = exports.resolveServerNextShadowUrlEnvSource = exports.resolveServerNextUrl = exports.resolveServerNextUrlEnvSource = exports.resolveServerNextGmPassword = exports.resolveServerNextGmPasswordEnvSource = exports.resolveServerNextDatabaseUrl = exports.resolveServerNextDatabaseEnvSource = exports.readTrimmedEnv = void 0;
function readTrimmedEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value !== 'string') {
            continue;
        }
        const normalized = value.trim();
        if (normalized) {
            return normalized;
        }
    }
    return '';
}
exports.readTrimmedEnv = readTrimmedEnv;
function resolveServerNextDatabaseEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_DATABASE_URL')) {
        return 'SERVER_NEXT_DATABASE_URL';
    }
    if (readTrimmedEnv('DATABASE_URL')) {
        return 'DATABASE_URL';
    }
    return null;
}
exports.resolveServerNextDatabaseEnvSource = resolveServerNextDatabaseEnvSource;
function resolveServerNextDatabaseUrl() {
    return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}
exports.resolveServerNextDatabaseUrl = resolveServerNextDatabaseUrl;
function resolveServerNextGmPasswordEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_GM_PASSWORD')) {
        return 'SERVER_NEXT_GM_PASSWORD';
    }
    if (readTrimmedEnv('GM_PASSWORD')) {
        return 'GM_PASSWORD';
    }
    return null;
}
exports.resolveServerNextGmPasswordEnvSource = resolveServerNextGmPasswordEnvSource;
function resolveServerNextGmPassword(defaultValue = '') {
    return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
exports.resolveServerNextGmPassword = resolveServerNextGmPassword;
function resolveServerNextUrlEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_URL')) {
        return 'SERVER_NEXT_URL';
    }
    return null;
}
exports.resolveServerNextUrlEnvSource = resolveServerNextUrlEnvSource;
function resolveServerNextUrl() {
    return readTrimmedEnv('SERVER_NEXT_URL');
}
exports.resolveServerNextUrl = resolveServerNextUrl;
function resolveServerNextShadowUrlEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_SHADOW_URL')) {
        return 'SERVER_NEXT_SHADOW_URL';
    }
    if (readTrimmedEnv('SERVER_NEXT_URL')) {
        return 'SERVER_NEXT_URL';
    }
    return null;
}
exports.resolveServerNextShadowUrlEnvSource = resolveServerNextShadowUrlEnvSource;
function resolveServerNextShadowUrl() {
    return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
exports.resolveServerNextShadowUrl = resolveServerNextShadowUrl;
