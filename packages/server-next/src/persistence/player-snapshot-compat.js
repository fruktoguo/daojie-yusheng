"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeRuntimeBonusSource = exports.resolveCompatiblePendingLogbookMessages = exports.resolveCompatibleRuntimeBonuses = void 0;
function resolveCompatibleSnapshotArray(snapshot, primaryKey, compatResolver) {
    const primaryValue = snapshot?.[primaryKey];
    if (Array.isArray(primaryValue)) {
        return primaryValue;
    }
    const compatValue = compatResolver(snapshot);
    return Array.isArray(compatValue) ? compatValue : [];
}
function resolveCompatibleRuntimeBonuses(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'runtimeBonuses', (candidate) => candidate?.legacyBonuses);
}
exports.resolveCompatibleRuntimeBonuses = resolveCompatibleRuntimeBonuses;
function resolveCompatiblePendingLogbookMessages(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'pendingLogbookMessages', (candidate) => candidate?.legacyCompat?.pendingLogbookMessages);
}
exports.resolveCompatiblePendingLogbookMessages = resolveCompatiblePendingLogbookMessages;
function canonicalizeRuntimeBonusSource(source) {
    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'legacy:vitals_baseline') {
        return 'runtime:vitals_baseline';
    }
    if (normalized === 'technique:aggregate') {
        return 'runtime:technique_aggregate';
    }
    if (normalized === 'realm:state') {
        return 'runtime:realm_state';
    }
    if (normalized === 'realm:stage') {
        return 'runtime:realm_stage';
    }
    if (normalized === 'heaven_gate:roots') {
        return 'runtime:heaven_gate_roots';
    }
    if (normalized.startsWith('equip:')) {
        return `equipment:${normalized.slice('equip:'.length)}`;
    }
    return normalized;
}
exports.canonicalizeRuntimeBonusSource = canonicalizeRuntimeBonusSource;
