"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTrimmedEnv = readTrimmedEnv;
exports.resolveServerNextDatabaseEnvSource = resolveServerNextDatabaseEnvSource;
exports.resolveServerNextDatabaseUrl = resolveServerNextDatabaseUrl;
exports.resolveServerNextGmPasswordEnvSource = resolveServerNextGmPasswordEnvSource;
exports.resolveServerNextGmPassword = resolveServerNextGmPassword;
exports.resolveServerNextUrlEnvSource = resolveServerNextUrlEnvSource;
exports.resolveServerNextUrl = resolveServerNextUrl;
exports.resolveServerNextShadowUrlEnvSource = resolveServerNextShadowUrlEnvSource;
exports.resolveServerNextShadowUrl = resolveServerNextShadowUrl;
function readTrimmedEnv() {
    var names = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        names[_i] = arguments[_i];
    }
    for (var _a = 0, names_1 = names; _a < names_1.length; _a++) {
        var name_1 = names_1[_a];
        var rawValue = process.env[name_1];
        if (typeof rawValue !== 'string') {
            continue;
        }
        var value = rawValue.trim();
        if (value.length > 0) {
            return value;
        }
    }
    return '';
}
function resolveServerNextDatabaseEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_DATABASE_URL')) {
        return 'SERVER_NEXT_DATABASE_URL';
    }
    if (readTrimmedEnv('DATABASE_URL')) {
        return 'DATABASE_URL';
    }
    return null;
}
function resolveServerNextDatabaseUrl() {
    return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}
function resolveServerNextGmPasswordEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_GM_PASSWORD')) {
        return 'SERVER_NEXT_GM_PASSWORD';
    }
    if (readTrimmedEnv('GM_PASSWORD')) {
        return 'GM_PASSWORD';
    }
    return null;
}
function resolveServerNextGmPassword(defaultValue) {
    if (defaultValue === void 0) { defaultValue = ''; }
    return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
function resolveServerNextUrlEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_URL')) {
        return 'SERVER_NEXT_URL';
    }
    return null;
}
function resolveServerNextUrl() {
    return readTrimmedEnv('SERVER_NEXT_URL');
}
function resolveServerNextShadowUrlEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_SHADOW_URL')) {
        return 'SERVER_NEXT_SHADOW_URL';
    }
    if (readTrimmedEnv('SERVER_NEXT_URL')) {
        return 'SERVER_NEXT_URL';
    }
    return null;
}
function resolveServerNextShadowUrl() {
    return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
