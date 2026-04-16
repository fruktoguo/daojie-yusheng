"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_GM_BOT_ID_PREFIX = void 0;
exports.isNextGmBotPlayerId = isNextGmBotPlayerId;
exports.NEXT_GM_BOT_ID_PREFIX = 'gm_bot_';
function isNextGmBotPlayerId(playerId) {
  return typeof playerId === 'string'
    && playerId.startsWith(exports.NEXT_GM_BOT_ID_PREFIX);
}
