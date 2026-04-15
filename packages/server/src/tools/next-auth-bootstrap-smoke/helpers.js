"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */

Object.defineProperty(exports, "__esModule", { value: true });

/** helperFunctionNames：定义该变量以承载业务值。 */
const helperFunctionNames = [
    'isEnvEnabled',
    'buildStrictNativeSkippedProof',
    'buildProfileSkippedProof',
    'withEnvOverrides',
    'readBootstrapProfile',
    'expectNextSocketAuthFailure',
    'createNextSocket',
    'assertNoLegacyEvents',
    'flattenNoticeItems',
    'createAuthStarterSnapshotDeps',
    'runNextBootstrap',
    'shouldExpectImplicitDetachedResume',
    'shouldExpectConnectedSessionReuse',
    'shouldExpectRequestedSessionMismatchRotation',
    'registerAndLoginPlayer',
    'parseTokenIdentity',
    'assertBootstrapMatchesExpectedIdentity',
    'fetchPlayerState',
    'deletePlayer',
    'flushPersistence',
    'fetchAuthTrace',
    'clearAuthTrace',
    'waitForFailedSnapshotAuthTrace',
    'waitForFailedIdentityAuthTrace',
    'waitForFailedIdentitySourceAuthTrace',
    'readSummaryCount',
    'waitForAuthTrace',
    'withLocalAuthTraceEnabled',
    'findLatestSnapshotRecoveryTrace',
    'requestJson',
    'waitFor',
    'waitForValue',
    'waitForPlayerState',
    'delay',
    'buildUniqueDisplayName',
    'buildRetryDisplayName',
    'buildRetryRoleName',
    'buildSingleDisplayNameChar',
    'buildCompactSeed',
    'computeSeedHash',
    'parseJwtPayload',
];

module.exports = {
    helperFunctionNames,
};
