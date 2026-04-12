"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLegacySocketProtocolEnabled = isLegacySocketProtocolEnabled;
const LEGACY_SOCKET_PROTOCOL_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL',
    'NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL',
];
function isLegacySocketProtocolEnabled() {
    for (const key of LEGACY_SOCKET_PROTOCOL_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
