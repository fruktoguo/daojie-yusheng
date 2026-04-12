"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveServerNextShadowUrl = exports.resolveServerNextShadowUrlEnvSource = exports.resolveServerNextUrl = exports.resolveServerNextUrlEnvSource = exports.resolveServerNextGmPassword = exports.resolveServerNextGmPasswordEnvSource = exports.resolveServerNextDatabaseUrl = exports.resolveServerNextDatabaseEnvSource = exports.readTrimmedEnv = void 0;
/** readTrimmedEnv：执行对应的业务逻辑。 */
function readTrimmedEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value !== 'string') {
            continue;
        }
/** normalized：定义该变量以承载业务值。 */
        const normalized = value.trim();
        if (normalized) {
            return normalized;
        }
    }
    return '';
}
exports.readTrimmedEnv = readTrimmedEnv;
/** resolveServerNextDatabaseEnvSource：执行对应的业务逻辑。 */
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
/** resolveServerNextDatabaseUrl：执行对应的业务逻辑。 */
function resolveServerNextDatabaseUrl() {
    return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}
exports.resolveServerNextDatabaseUrl = resolveServerNextDatabaseUrl;
/** resolveServerNextGmPasswordEnvSource：执行对应的业务逻辑。 */
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
/** resolveServerNextGmPassword：执行对应的业务逻辑。 */
function resolveServerNextGmPassword(defaultValue = '') {
    return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
exports.resolveServerNextGmPassword = resolveServerNextGmPassword;
/** resolveServerNextUrlEnvSource：执行对应的业务逻辑。 */
function resolveServerNextUrlEnvSource() {
    if (readTrimmedEnv('SERVER_NEXT_URL')) {
        return 'SERVER_NEXT_URL';
    }
    return null;
}
exports.resolveServerNextUrlEnvSource = resolveServerNextUrlEnvSource;
/** resolveServerNextUrl：执行对应的业务逻辑。 */
function resolveServerNextUrl() {
    return readTrimmedEnv('SERVER_NEXT_URL');
}
exports.resolveServerNextUrl = resolveServerNextUrl;
/** resolveServerNextShadowUrlEnvSource：执行对应的业务逻辑。 */
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
/** resolveServerNextShadowUrl：执行对应的业务逻辑。 */
function resolveServerNextShadowUrl() {
    return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
exports.resolveServerNextShadowUrl = resolveServerNextShadowUrl;
