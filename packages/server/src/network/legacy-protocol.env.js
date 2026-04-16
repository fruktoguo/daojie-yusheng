"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLegacySocketProtocolEnabled = isLegacySocketProtocolEnabled;
// TODO(next:T24): 定稿 legacy socket 的最终保留范围后，下线这个 compat 开关与相关环境变量，避免旧协议入口长期被动常驻。

const LEGACY_SOCKET_PROTOCOL_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL',
    'NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL',
];
/** 读取是否允许 legacy Socket 协议入口。 */
function isLegacySocketProtocolEnabled() {
    for (const key of LEGACY_SOCKET_PROTOCOL_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}

