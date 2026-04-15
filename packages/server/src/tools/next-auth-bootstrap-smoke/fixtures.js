"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */

Object.defineProperty(exports, "__esModule", { value: true });

/** fixtureFunctionNames：定义该变量以承载业务值。 */
const fixtureFunctionNames = [
    'ensureLegacyCompatSchema',
    'seedLegacyCompatPlayerSnapshot',
    'hasLegacyCompatPlayerSnapshotDocument',
    'ensureLegacyCompatPlayerSnapshotDocument',
    'dropPlayerSnapshotSourcesButKeepIdentity',
    'dropPersistedPlayerSnapshot',
    'dropPersistedIdentityDocument',
    'expectLegacyCompatPlayerSnapshotDocument',
    'expectPersistedPlayerSnapshotDocument',
    'expectPersistedIdentityDocument',
    'readPersistedPlayerSnapshotPayload',
    'readPersistedIdentityPayload',
    'writeInvalidPersistedIdentityDocument',
    'writeInvalidPersistedSnapshotDocument',
    'writePersistedPlayerSnapshotDocument',
    'ensurePersistedPlayerSnapshotDocument',
    'writeInvalidPersistedSnapshotMetaPersistedSource',
    'writeInvalidPersistedSnapshotUnlockedMapIds',
    'writePersistedIdentityDocument',
    'installIdentityBackfillSaveFailure',
    'installSnapshotSeedSaveFailure',
    'uninstallIdentityBackfillSaveFailure',
    'uninstallSnapshotSeedSaveFailure',
    'writeInvalidLegacyCompatUnlockedMinimapIds',
    'writeInvalidLegacyCompatMapId',
    'cleanupLegacyCompatPlayerSnapshot',
    'ignoreMissingCompatCleanupError',
    'normalizePersistedIdentity',
];

module.exports = {
    fixtureFunctionNames,
};
