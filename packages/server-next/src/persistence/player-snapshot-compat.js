"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeRuntimeBonusSource = exports.resolveCompatiblePendingLogbookMessages = exports.resolveCompatibleRuntimeBonuses = void 0;
/** resolveCompatibleSnapshotArray：执行对应的业务逻辑。 */
function resolveCompatibleSnapshotArray(snapshot, primaryKey, compatResolver) {
/** primaryValue：定义该变量以承载业务值。 */
    const primaryValue = snapshot?.[primaryKey];
    if (Array.isArray(primaryValue)) {
        return primaryValue;
    }
/** compatValue：定义该变量以承载业务值。 */
    const compatValue = compatResolver(snapshot);
    return Array.isArray(compatValue) ? compatValue : [];
}
/** resolveCompatibleRuntimeBonuses：执行对应的业务逻辑。 */
function resolveCompatibleRuntimeBonuses(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'runtimeBonuses', (candidate) => candidate?.legacyBonuses);
}
exports.resolveCompatibleRuntimeBonuses = resolveCompatibleRuntimeBonuses;
/** resolveCompatiblePendingLogbookMessages：执行对应的业务逻辑。 */
function resolveCompatiblePendingLogbookMessages(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'pendingLogbookMessages', (candidate) => candidate?.legacyCompat?.pendingLogbookMessages);
}
exports.resolveCompatiblePendingLogbookMessages = resolveCompatiblePendingLogbookMessages;
/** canonicalizeRuntimeBonusSource：执行对应的业务逻辑。 */
function canonicalizeRuntimeBonusSource(source) {
/** normalized：定义该变量以承载业务值。 */
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
