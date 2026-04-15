"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveServerNextShadowUrl = exports.resolveServerNextShadowUrlEnvSource = exports.resolveServerNextUrl = exports.resolveServerNextUrlEnvSource = exports.resolveServerNextGmPassword = exports.resolveServerNextGmPasswordEnvSource = exports.resolveServerNextDatabaseUrl = exports.resolveServerNextDatabaseEnvSource = exports.readTrimmedEnv = void 0;
// TODO(next:ARCH01): 把 env alias 这类核心配置入口纳入 strict TS 收口路径，避免关键环境解析长期停留在 plain JS。
/** readTrimmedEnv：处理read Trimmed Env。 */
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
/** resolveServerNextDatabaseEnvSource：解析服务端新版数据库Env来源。 */
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
/** resolveServerNextDatabaseUrl：解析服务端新版数据库URL。 */
function resolveServerNextDatabaseUrl() {
    return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}
exports.resolveServerNextDatabaseUrl = resolveServerNextDatabaseUrl;
/** resolveServerNextGmPasswordEnvSource：解析服务端新版GM密码Env来源。 */
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
/** resolveServerNextGmPassword：解析服务端新版GM密码。 */
function resolveServerNextGmPassword(defaultValue = '') {
    return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
exports.resolveServerNextGmPassword = resolveServerNextGmPassword;
/** resolveServerNextUrlEnvSource：解析服务端新版URL Env来源。 */
function resolveServerNextUrlEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_URL')) {
        return 'SERVER_NEXT_URL';
    }
    return null;
}
exports.resolveServerNextUrlEnvSource = resolveServerNextUrlEnvSource;
/** resolveServerNextUrl：解析服务端新版URL。 */
function resolveServerNextUrl() {
    return readTrimmedEnv('SERVER_NEXT_URL');
}
exports.resolveServerNextUrl = resolveServerNextUrl;
/** resolveServerNextShadowUrlEnvSource：解析服务端新版影子URL Env来源。 */
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
/** resolveServerNextShadowUrl：解析服务端新版影子URL。 */
function resolveServerNextShadowUrl() {
    return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
exports.resolveServerNextShadowUrl = resolveServerNextShadowUrl;


