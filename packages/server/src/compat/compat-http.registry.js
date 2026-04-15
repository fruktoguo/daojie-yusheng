"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPAT_HTTP_PROVIDERS = exports.COMPAT_HTTP_CONTROLLERS = void 0;
/** compat_tokens_1：定义该变量以承载业务值。 */
const compat_tokens_1 = require("./compat.tokens");
/** ALLOW_LEGACY_HTTP_COMPAT_ENV_KEYS：定义该变量以承载业务值。 */
const ALLOW_LEGACY_HTTP_COMPAT_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT',
    'NEXT_ALLOW_LEGACY_HTTP_COMPAT',
];
/** isLegacyHttpCompatEnabled：执行对应的业务逻辑。 */
function isLegacyHttpCompatEnabled() {
    for (const key of ALLOW_LEGACY_HTTP_COMPAT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** buildCompatHttpBindings：执行对应的业务逻辑。 */
function buildCompatHttpBindings() {
    return {
        controllers: [],
        providers: [],
    };
}
/** COMPAT_HTTP_BINDINGS：定义该变量以承载业务值。 */
const COMPAT_HTTP_BINDINGS = buildCompatHttpBindings();
exports.COMPAT_HTTP_CONTROLLERS = COMPAT_HTTP_BINDINGS.controllers;
/** COMPAT_HTTP_ONLY_PROVIDERS：定义该变量以承载业务值。 */
const COMPAT_HTTP_ONLY_PROVIDERS = COMPAT_HTTP_BINDINGS.providers;
exports.COMPAT_HTTP_PROVIDERS = [
    ...COMPAT_HTTP_ONLY_PROVIDERS,
];
