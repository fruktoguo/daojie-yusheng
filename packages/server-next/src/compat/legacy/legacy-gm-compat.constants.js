"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_GM_COMPAT_BOT_ID_PREFIX = void 0;
exports.isLegacyGmCompatBotPlayerId = isLegacyGmCompatBotPlayerId;
exports.LEGACY_GM_COMPAT_BOT_ID_PREFIX = 'legacy_bot_';
/** isLegacyGmCompatBotPlayerId：执行对应的业务逻辑。 */
function isLegacyGmCompatBotPlayerId(playerId) {
    return typeof playerId === 'string' && playerId.startsWith(exports.LEGACY_GM_COMPAT_BOT_ID_PREFIX);
}
