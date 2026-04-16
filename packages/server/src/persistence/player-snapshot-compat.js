"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeRuntimeBonusSource = exports.resolveCompatiblePendingLogbookMessages = exports.resolveCompatibleRuntimeBonuses = void 0;
// TODO(next:T04): 当 snapshot 主链彻底只读 next-native 后，删除 legacyBonuses / legacyCompat.pendingLogbookMessages 等兼容回读。

/** legacy 与 next 快照兼容处理：统一读取历史数组与 bonus 来源。 */
function resolveCompatibleSnapshotArray(snapshot, primaryKey, compatResolver) {

    const primaryValue = snapshot?.[primaryKey];
    if (Array.isArray(primaryValue)) {
        return primaryValue;
    }

    const compatValue = compatResolver(snapshot);
    return Array.isArray(compatValue) ? compatValue : [];
}

/** 兼容读取 runtimeBonuses：优先新字段，兼容 legacyBonuses。 */
function resolveCompatibleRuntimeBonuses(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'runtimeBonuses', (candidate) => candidate?.legacyBonuses);
}
exports.resolveCompatibleRuntimeBonuses = resolveCompatibleRuntimeBonuses;

/** 兼容读取 pendingLogbookMessages：优先新字段并回退 legacyCompat 分支。 */
function resolveCompatiblePendingLogbookMessages(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'pendingLogbookMessages', (candidate) => candidate?.legacyCompat?.pendingLogbookMessages);
}
exports.resolveCompatiblePendingLogbookMessages = resolveCompatiblePendingLogbookMessages;

/** 将 legacy bonus source 映射到 next 统一命名空间，便于后续归并。 */
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
