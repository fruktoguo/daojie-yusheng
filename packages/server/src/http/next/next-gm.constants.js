"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_NEXT_GM_BOT_ID_PREFIX = exports.NEXT_GM_BOT_ID_PREFIX = void 0;
exports.isNextGmBotPlayerId = isNextGmBotPlayerId;
// TODO(next:MIGRATE01): 在旧 GM bot ID 全量完成修复后，移除 legacy_bot_ 前缀兼容，避免 next 运行时长期背双命名。
exports.NEXT_GM_BOT_ID_PREFIX = 'gm_bot_';
exports.LEGACY_NEXT_GM_BOT_ID_PREFIX = 'legacy_bot_';
function isNextGmBotPlayerId(playerId) {
  return typeof playerId === 'string'
    && (playerId.startsWith(exports.NEXT_GM_BOT_ID_PREFIX) || playerId.startsWith(exports.LEGACY_NEXT_GM_BOT_ID_PREFIX));
}

