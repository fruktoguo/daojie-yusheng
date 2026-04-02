"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_GM_COMPAT_BOT_ID_PREFIX = void 0;
exports.isLegacyGmCompatBotPlayerId = isLegacyGmCompatBotPlayerId;
exports.LEGACY_GM_COMPAT_BOT_ID_PREFIX = 'legacy_bot_';
function isLegacyGmCompatBotPlayerId(playerId) {
    return typeof playerId === 'string' && playerId.startsWith(exports.LEGACY_GM_COMPAT_BOT_ID_PREFIX);
}
