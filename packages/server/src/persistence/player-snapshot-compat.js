"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeRuntimeBonusSource = exports.resolveCompatiblePendingLogbookMessages = exports.resolveCompatibleRuntimeBonuses = void 0;

/** next 快照主链只读取正式字段，compat 行已经在迁移入口提前规范化。 */
function resolveNextSnapshotArray(snapshot, primaryKey) {

    const primaryValue = snapshot?.[primaryKey];
    if (Array.isArray(primaryValue)) {
        return primaryValue;
    }
    return [];
}

/** 读取 next runtimeBonuses：compat 数据需先在 migration 入口转成 next snapshot。 */
function resolveCompatibleRuntimeBonuses(snapshot) {
    return resolveNextSnapshotArray(snapshot, 'runtimeBonuses');
}
exports.resolveCompatibleRuntimeBonuses = resolveCompatibleRuntimeBonuses;

/** 读取 next pendingLogbookMessages：compat 数据需先在 migration 入口转成 next snapshot。 */
function resolveCompatiblePendingLogbookMessages(snapshot) {
    return resolveNextSnapshotArray(snapshot, 'pendingLogbookMessages');
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
