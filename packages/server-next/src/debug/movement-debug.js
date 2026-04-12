"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logServerNextMovement = exports.isServerNextMovementDebugEnabled = void 0;
/** normalizeDebugFlag：执行对应的业务逻辑。 */
function normalizeDebugFlag(value) {
    if (value === true || value === 1) {
        return true;
    }
    if (typeof value !== 'string') {
        return false;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}
/** isServerNextMovementDebugEnabled：执行对应的业务逻辑。 */
function isServerNextMovementDebugEnabled() {
    return normalizeDebugFlag(process.env.SERVER_NEXT_DEBUG_MOVEMENT)
        || normalizeDebugFlag(process.env.NEXT_DEBUG_MOVEMENT);
}
exports.isServerNextMovementDebugEnabled = isServerNextMovementDebugEnabled;
/** safeSerialize：执行对应的业务逻辑。 */
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
/** logServerNextMovement：执行对应的业务逻辑。 */
function logServerNextMovement(logger, scope, payload) {
    if (!isServerNextMovementDebugEnabled()) {
        return;
    }
    logger.log(`[next-move][${scope}]${payload === undefined ? '' : ` ${safeSerialize(payload)}`}`);
}
exports.logServerNextMovement = logServerNextMovement;
