"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
