"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// TODO(next:T25): 当 auth/bootstrap 迁移窗口结束后，清理这份 legacy compat fixture 名单，只保留正式仍需证明的 next-native 夹具。
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
