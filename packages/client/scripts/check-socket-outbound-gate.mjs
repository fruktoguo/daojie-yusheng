import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const gatePath = resolve(scriptDir, '../src/network/socket-outbound-gate.ts');
const socketPath = resolve(scriptDir, '../src/network/socket.ts');

function loadOutboundGate() {
  const source = readFileSync(gatePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: gatePath,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', compiled)(module.exports, module);
  return module.exports;
}

const {
  emitSocketBusinessEvent,
  emitSocketLifecycleEvent,
} = loadOutboundGate();

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
  emitSocketBusinessEvent({ connected: true, sessionReady: true }, emit),
  { accepted: true },
);
assert.equal(emitted, 1, '会话就绪后业务事件应正常发送');

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: true }, null),
  { accepted: false, reason: 'not_connected' },
);
assert.equal(emitted, 1, '缺少当前 Socket 时不得把发送结果误报为 accepted');

assert.equal(
  emitSocketLifecycleEvent({ connected: false, sessionReady: false }, false, emit),
  false,
  '断线时 Hello 也不得交给 Socket.IO 缓冲',
);
assert.equal(emitted, 1);

assert.equal(
  emitSocketLifecycleEvent({ connected: true, sessionReady: false }, false, emit),
  true,
  'Hello 必须在底层连接建立后、InitSession 前允许发送',
);
assert.equal(emitted, 2);

assert.equal(
  emitSocketLifecycleEvent({ connected: true, sessionReady: false }, true, emit),
  false,
  'Heartbeat 必须等待 InitSession，避免在服务端玩家会话未绑定时发送',
);
assert.equal(emitted, 2);

assert.equal(
  emitSocketLifecycleEvent({ connected: true, sessionReady: true }, true, emit),
  true,
  'InitSession 后 Heartbeat 应恢复发送',
);
assert.equal(emitted, 3);

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: false }, emit),
  { accepted: false, reason: 'not_ready' },
);
assert.equal(emitted, 3, '重连后的 connect 至 InitSession 窗口不得泄漏旧业务意图');

assert.deepEqual(
  emitSocketBusinessEvent({ connected: true, sessionReady: true }, emit),
  { accepted: true },
);
assert.equal(emitted, 4, '重连收到 InitSession 后业务事件应恢复发送');

const socketSource = readFileSync(socketPath, 'utf8');
assert.match(socketSource, /socket\.on\('connect',[\s\S]*?this\.sessionReady = false;/);
assert.match(socketSource, /socket\.on\('disconnect',[\s\S]*?this\.sessionReady = false;/);
assert.match(socketSource, /socket\.on\(S2C\.InitSession,[\s\S]*?this\.sessionReady = true;/);
assert.match(socketSource, /this\.sessionReady = false;\s*this\.lifecycle\.dispose\(\);/);
assert.match(socketSource, /this\.sendLifecycleEvent\(C2S\.Hello, \{\}, false\);/);
assert.match(socketSource, /this\.sendLifecycleEvent\(C2S\.Heartbeat, \{ clientAt: Date\.now\(\) \}, true\);/);

console.log('socket outbound gate proof passed');
