"use strict";
/** 新版移动调试辅助模块：解析开关并在开启时输出结构化移动日志。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logServerNextMovement = exports.isServerNextMovementDebugEnabled = void 0;

/** 把环境变量里常见的布尔写法统一成标准布尔值。 */
function normalizeDebugFlag(value) {
    if (value === true || value === 1) {
        return true;
    }
    if (typeof value !== 'string') {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}
/** 判断是否开启服务端新版移动日志调试。 */
function isServerNextMovementDebugEnabled() {
    return normalizeDebugFlag(process.env.SERVER_NEXT_DEBUG_MOVEMENT)
        || normalizeDebugFlag(process.env.NEXT_DEBUG_MOVEMENT);
}
exports.isServerNextMovementDebugEnabled = isServerNextMovementDebugEnabled;
/** 安全序列化日志载荷，失败时回退为错误摘要，避免调试日志再抛错。 */
function safeSerialize(payload) {
    if (payload === undefined) {
        return '';
    }
    try {
        return JSON.stringify(payload);
    }
    catch (error) {
        return JSON.stringify({
            serializationError: error instanceof Error ? error.message : String(error),
            fallback: String(payload),
        });
    }
}
/** 在开关开启时输出移动日志，便于定位移动链路的分支和载荷。 */
function logServerNextMovement(logger, scope, payload) {
    if (!isServerNextMovementDebugEnabled()) {
        return;
    }
    logger.log(`[移动调试][${scope}]${payload === undefined ? '' : ` ${safeSerialize(payload)}`}`);
}
exports.logServerNextMovement = logServerNextMovement;

