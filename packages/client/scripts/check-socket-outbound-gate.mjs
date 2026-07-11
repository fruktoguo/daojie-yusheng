import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const gatePath = resolve(scriptDir, '../src/network/socket-outbound-gate.ts');
const socketPath = resolve(scriptDir, '../src/network/socket.ts');
const socketSendTypesPath = resolve(scriptDir, '../src/network/socket-send-types.ts');
const socialEconomySenderPath = resolve(scriptDir, '../src/network/socket-send-social-economy.ts');
const offlineGainModalPath = resolve(scriptDir, '../src/ui/offline-gain-modal.ts');
const offlineGainConfirmationStatePath = resolve(scriptDir, '../src/ui/offline-gain-confirmation-state.ts');
const offlineGainRefreshStatePath = resolve(scriptDir, '../src/ui/offline-gain-refresh-state.ts');
const bootstrapAssemblyPath = resolve(scriptDir, '../src/main-bootstrap-assembly.ts');
const resetStateSourcePath = resolve(scriptDir, '../src/main-reset-state-source.ts');

function loadTypeScriptModule(modulePath) {
  const source = readFileSync(modulePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', compiled)(module.exports, module);
  return module.exports;
}

const {
  emitSocketBusinessEvent,
  emitSocketLifecycleEvent,
} = loadTypeScriptModule(gatePath);
const { OfflineGainConfirmationState } = loadTypeScriptModule(offlineGainConfirmationStatePath);
const { OfflineGainRefreshState } = loadTypeScriptModule(offlineGainRefreshStatePath);

let emitted = 0;
const emit = () => {
  emitted += 1;
};

assert.deepEqual(
  emitSocketBusinessEvent({ connected: false, sessionReady: true }, emit),
  { accepted: false, reason: 'not_connected' },
);
assert.equal(emitted, 0, '断线业务事件不得调用 Socket.IO emit，避免进入离线缓冲');

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: false }, emit),
  { accepted: false, reason: 'not_ready' },
);
assert.equal(emitted, 0, '首包未完成时业务事件不得调用 Socket.IO emit');

assert.deepEqual(
  emitSocketBusinessEvent(
    { connected: true, sessionReady: false },
    emit,
    { requiresSessionReady: false },
  ),
  { accepted: true },
);
assert.equal(emitted, 1, '离线收益会话引导事件应允许在 InitSession 前发送');

assert.deepEqual(
  emitSocketBusinessEvent(
    { connected: false, sessionReady: false },
    emit,
    { requiresSessionReady: false },
  ),
  { accepted: false, reason: 'not_connected' },
);
assert.equal(emitted, 1, '断线时会话引导事件仍不得进入 Socket.IO 缓冲');

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: true }, emit),
  { accepted: true },
);
assert.equal(emitted, 2, '会话就绪后业务事件应正常发送');

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: true }, null),
  { accepted: false, reason: 'not_connected' },
);
assert.equal(emitted, 2, '缺少当前 Socket 时不得把发送结果误报为 accepted');

assert.equal(
  emitSocketLifecycleEvent({ connected: false, sessionReady: false }, false, emit),
  false,
  '断线时 Hello 也不得交给 Socket.IO 缓冲',
);
assert.equal(emitted, 2);

assert.equal(
  emitSocketLifecycleEvent({ connected: true, sessionReady: false }, false, emit),
  true,
  'Hello 必须在底层连接建立后、InitSession 前允许发送',
);
assert.equal(emitted, 3);

assert.equal(
  emitSocketLifecycleEvent({ connected: true, sessionReady: false }, true, emit),
  false,
  'Heartbeat 必须等待 InitSession，避免在服务端玩家会话未绑定时发送',
);
assert.equal(emitted, 3);

assert.equal(
  emitSocketLifecycleEvent({ connected: true, sessionReady: true }, true, emit),
  true,
  'InitSession 后 Heartbeat 应恢复发送',
);
assert.equal(emitted, 4);

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: false }, emit),
  { accepted: false, reason: 'not_ready' },
);
assert.equal(emitted, 4, '重连后的 connect 至 InitSession 窗口不得泄漏旧业务意图');

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: true }, emit),
  { accepted: true },
);
assert.equal(emitted, 5, '重连收到 InitSession 后业务事件应恢复发送');

const socketSource = readFileSync(socketPath, 'utf8');
assert.match(socketSource, /socket\.on\('connect',[\s\S]*?this\.sessionReady = false;/);
assert.match(socketSource, /socket\.on\('disconnect',[\s\S]*?this\.sessionReady = false;/);
assert.match(socketSource, /socket\.on\(S2C\.InitSession,[\s\S]*?this\.sessionReady = true;/);
assert.match(socketSource, /this\.sessionReady = false;\s*this\.lifecycle\.dispose\(\);/);
assert.match(socketSource, /this\.sendLifecycleEvent\(C2S\.Hello, \{\}, false\);/);
assert.match(socketSource, /this\.sendLifecycleEvent\(C2S\.Heartbeat, \{ clientAt: Date\.now\(\) \}, true\);/);
assert.match(
  socketSource,
  /requiresSessionReady: !isSocketSessionBootstrapEvent\(event\)/,
  'SocketManager 必须按事件分类会话引导期门控',
);

const socketSendTypesSource = readFileSync(socketSendTypesPath, 'utf8');
const bootstrapEventGuardStart = socketSendTypesSource.indexOf('export function isSocketSessionBootstrapEvent');
const bootstrapEventGuardEnd = socketSendTypesSource.indexOf('\n}', bootstrapEventGuardStart) + 2;
assert.ok(bootstrapEventGuardStart >= 0 && bootstrapEventGuardEnd > bootstrapEventGuardStart, '必须定义会话引导事件守卫');
const bootstrapEventGuardSource = socketSendTypesSource.slice(bootstrapEventGuardStart, bootstrapEventGuardEnd);
assert.match(bootstrapEventGuardSource, /event === C2S\.AckOfflineGainReports \|\| event === C2S\.RequestOfflineGainReports/);
assert.equal(
  Array.from(bootstrapEventGuardSource.matchAll(/C2S\./g)).length,
  2,
  '会话引导期不得放开离线收益以外的业务事件',
);

const socialEconomySenderSource = readFileSync(socialEconomySenderPath, 'utf8');
assert.match(socialEconomySenderSource, /ackOfflineGainReports\(reportIds: string\[\]\): boolean/);
assert.match(socialEconomySenderSource, /return deps\.emitEvent\(C2S\.AckOfflineGainReports, \{ reportIds \}\)\.accepted/);
assert.match(socialEconomySenderSource, /requestOfflineGainReports\(requestId: string\): boolean/);
assert.match(
  socialEconomySenderSource,
  /return deps\.emitEvent\(C2S\.RequestOfflineGainReports, \{ requestId \}\)\.accepted/,
);

const offlineGainModalSource = readFileSync(offlineGainModalPath, 'utf8');
assert.match(
  offlineGainModalSource,
  /if \(!options\.ackOfflineGainReports\(confirmResult\.reportIds\)\) \{[\s\S]*?return;[\s\S]*?beginBlockingOfflineGainConfirmation/,
  '确认发包被拒绝时必须保留阻塞弹层与刷新任务',
);
assert.match(offlineGainModalSource, /export function completeOfflineGainBlockingConfirmation\(\): void/);
assert.match(offlineGainModalSource, /export function resetOfflineGainBlockingConfirmation\(\): void/);
assert.match(offlineGainModalSource, /blockingConfirmationState\.settle\(\)/);
assert.match(offlineGainModalSource, /OFFLINE_GAIN_CONFIRM_TIMEOUT_MS/);
assert.match(offlineGainModalSource, /blockingRefreshState\.acceptResponse\(payload\?\.requestId\)/);
assert.match(offlineGainModalSource, /blockingRefreshState\.cancel\(requestId\)/);

const bootstrapAssemblySource = readFileSync(bootstrapAssemblyPath, 'utf8');
assert.match(
  bootstrapAssemblySource,
  /options\.runtimeStateSource\.handleBootstrap\(data\);\s*completeOfflineGainBlockingConfirmation\(\);/,
  '阻塞层必须在 Bootstrap 成功处理后关闭',
);

const resetStateSource = readFileSync(resetStateSourcePath, 'utf8');
assert.match(
  resetStateSource,
  /resetOfflineGainBlockingConfirmation\(\)/,
  '终止会话必须清理离线收益确认状态',
);
assert.match(
  resetStateSource,
  /options\.clearSettingsState\(\)/,
  '终止会话必须清理兑换码等设置面板异步状态',
);

const confirmationState = new OfflineGainConfirmationState();
assert.equal(confirmationState.begin([]), false, '空报告不得进入确认态');
assert.equal(confirmationState.begin(['report-1']), true);
assert.equal(confirmationState.isPending(), true);
assert.equal(confirmationState.begin(['report-1']), false, '等待中不得重复确认');
assert.equal(confirmationState.markRetryable(), true);
assert.equal(confirmationState.isPending(), false);
assert.equal(confirmationState.hasActiveAttempt(), true, '超时后仍须接受迟到的成功 Bootstrap');
assert.equal(confirmationState.begin(['report-1']), true, '超时后必须允许重试');
assert.deepEqual(confirmationState.settle(1_000), ['report-1']);
assert.equal(confirmationState.hasActiveAttempt(), false);
assert.equal(confirmationState.shouldSuppressBlockingPreview(['changed-id'], 20_000), true, '成功后的迟到预览必须抑制');
assert.equal(confirmationState.shouldSuppressBlockingPreview(['report-1'], 40_000), true, '同一报告的迟到预览必须持续抑制');
assert.equal(confirmationState.shouldSuppressBlockingPreview(['report-2'], 40_000), false, '新的离线会话必须正常进入确认');
confirmationState.begin(['report-3']);
confirmationState.reset();
assert.equal(confirmationState.hasActiveAttempt(), false, '终止登录时必须清理旧账号确认状态');
assert.equal(confirmationState.shouldSuppressBlockingPreview(['report-1'], 40_000), false, '终止登录时必须清理迟到预览抑制状态');

const refreshState = new OfflineGainRefreshState();
assert.equal(refreshState.acceptResponse(undefined), true, '服务端主动首包不带请求 ID，必须继续接收');
const oldRefreshId = refreshState.begin(1_000);
const latestRefreshId = refreshState.begin(2_000);
assert.notEqual(oldRefreshId, latestRefreshId);
assert.equal(refreshState.acceptResponse(oldRefreshId), false, '旧刷新回包不得覆盖较新的离线收益预览');
assert.equal(refreshState.acceptResponse(latestRefreshId), true, '当前刷新回包必须正常接收');
assert.equal(refreshState.acceptResponse(latestRefreshId), false, '同一刷新回包只能消费一次');
const rejectedRefreshId = refreshState.begin(3_000);
refreshState.cancel(rejectedRefreshId);
assert.equal(refreshState.acceptResponse(rejectedRefreshId), false, '发包被门控拒绝后不得保留假等待态');
const resetRefreshId = refreshState.begin(4_000);
refreshState.reset();
assert.equal(refreshState.acceptResponse(resetRefreshId), false, '会话结束后不得接收旧账号刷新回包');

console.log('socket outbound gate proof passed');
