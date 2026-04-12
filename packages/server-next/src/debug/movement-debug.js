"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logServerNextMovement = exports.isServerNextMovementDebugEnabled = void 0;
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
function isServerNextMovementDebugEnabled() {
    return normalizeDebugFlag(process.env.SERVER_NEXT_DEBUG_MOVEMENT)
        || normalizeDebugFlag(process.env.NEXT_DEBUG_MOVEMENT);
}
exports.isServerNextMovementDebugEnabled = isServerNextMovementDebugEnabled;
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
function logServerNextMovement(logger, scope, payload) {
    if (!isServerNextMovementDebugEnabled()) {
        return;
    }
    logger.log(`[next-move][${scope}]${payload === undefined ? '' : ` ${safeSerialize(payload)}`}`);
}
exports.logServerNextMovement = logServerNextMovement;
