"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLegacySocketProtocolEnabled = isLegacySocketProtocolEnabled;
/** LEGACY_SOCKET_PROTOCOL_ENV_KEYS：定义该变量以承载业务值。 */
const LEGACY_SOCKET_PROTOCOL_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL',
    'NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL',
];
/** isLegacySocketProtocolEnabled：执行对应的业务逻辑。 */
function isLegacySocketProtocolEnabled() {
    for (const key of LEGACY_SOCKET_PROTOCOL_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
