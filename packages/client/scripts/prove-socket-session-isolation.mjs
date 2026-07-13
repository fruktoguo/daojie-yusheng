import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const lifecyclePath = resolve(scriptDir, '../src/network/socket-lifecycle-controller.ts');
const registryPath = resolve(scriptDir, '../src/network/socket-event-registry.ts');
const connectionStatePath = resolve(scriptDir, '../src/main-connection-state-source.ts');

function loadTypeScriptModule(modulePath, dependencies = {}) {
  const source = readFileSync(modulePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) {
      return dependencies[specifier];
    }
    throw new Error(`未提供 proof 依赖：${specifier}`);
  };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, localRequire);
  return module.exports;
}

class FakeSocket {
  handlers = new Map();

  on(event, handler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  trigger(event, payload) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

const S2C = {
  InitSession: 'session:init',
  Kick: 'session:kick',
  SyncEnvelope: 'sync:envelope',
  WorldDelta: 'sync:world',
  SelfDelta: 'sync:self',
  PanelDelta: 'sync:panel',
};

const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const activeTimers = new Set();
let timerSequence = 0;
globalThis.setInterval = () => {
  const token = { id: timerSequence += 1 };
  activeTimers.add(token);
  return token;
};
globalThis.clearInterval = (token) => {
  activeTimers.delete(token);
};

try {
  const { createSocketLifecycleController } = loadTypeScriptModule(lifecyclePath, {
    '@mud/shared': { S2C, PLAYER_HEARTBEAT_INTERVAL_MS: 10_000 },
  });

  const oldSocket = new FakeSocket();
  const currentSocket = new FakeSocket();
  let activeSocket = oldSocket;
  let helloCount = 0;
  let heartbeatCount = 0;
  let disconnectCommandCount = 0;
  let kickCallbackCount = 0;
  let disconnectCallbackCount = 0;
  let connectErrorCallbackCount = 0;
  const lifecycle = createSocketLifecycleController({
    getSocket: () => activeSocket,
    sendHello: () => { helloCount += 1; },
    sendHeartbeat: () => { heartbeatCount += 1; },
    disconnect: () => { disconnectCommandCount += 1; },
  });
  lifecycle.onKick(() => { kickCallbackCount += 1; });
  lifecycle.onDisconnect(() => { disconnectCallbackCount += 1; });
  lifecycle.onConnectError(() => { connectErrorCallbackCount += 1; });
  lifecycle.bind(oldSocket);
  oldSocket.trigger('connect');
  assert.equal(helloCount, 1, '当前旧连接在仍为 owner 时应正常发送 Hello');

  activeSocket = currentSocket;
  lifecycle.bind(currentSocket);
  currentSocket.trigger('connect');
  currentSocket.trigger(S2C.InitSession, { sid: 'current' });
  assert.equal(helloCount, 2, '新连接应正常发送 Hello');
  assert.equal(heartbeatCount, 1, '新连接 InitSession 应立即发送一次心跳');
  assert.equal(activeTimers.size, 1, '新连接 InitSession 应建立唯一心跳定时器');

  oldSocket.trigger(S2C.InitSession, { sid: 'stale' });
  oldSocket.trigger(S2C.Kick, { reason: 'replaced' });
  oldSocket.trigger('disconnect', 'transport close');
  oldSocket.trigger('connect_error', new Error('旧连接错误'));
  assert.equal(heartbeatCount, 1, '旧 InitSession 不得向新会话发送心跳');
  assert.equal(activeTimers.size, 1, '旧 disconnect 不得停止新连接心跳');
  assert.equal(kickCallbackCount, 0, '旧 Kick 不得进入当前会话回调');
  assert.equal(disconnectCommandCount, 0, '旧 Kick 不得断开当前连接');
  assert.equal(disconnectCallbackCount, 0, '旧 disconnect 不得把当前 UI 标记为离线');
  assert.equal(connectErrorCallbackCount, 0, '旧 connect_error 不得触发当前恢复流程');

  currentSocket.trigger('connect_error', new Error('当前连接错误'));
  currentSocket.trigger(S2C.Kick, { reason: 'replaced' });
  assert.equal(connectErrorCallbackCount, 1, '当前 connect_error 应保留原有处理');
  assert.equal(kickCallbackCount, 1, '当前 Kick 应保留原有处理');
  assert.equal(disconnectCommandCount, 1, '当前 Kick 应断开当前连接');
  lifecycle.dispose();
  assert.equal(activeTimers.size, 0, '生命周期释放必须停止心跳');

  let decodeCount = 0;
  const { createSocketServerEventRegistry } = loadTypeScriptModule(registryPath, {
    '@mud/shared': {
      S2C,
      decodeServerEventPayload: (_event, payload) => {
        decodeCount += 1;
        return payload;
      },
    },
    '../debug/runtime-profiler': {
      startRuntimeProfileMetric: () => 0,
      endRuntimeProfileMetric: () => undefined,
    },
    './socket-server-events': {
      SESSION_SERVER_EVENTS: ['session:event'],
      GAMEPLAY_SERVER_EVENTS: ['game:event'],
    },
  });
  activeSocket = oldSocket;
  const registry = createSocketServerEventRegistry({ getSocket: () => activeSocket });
  const received = [];
  registry.on('session:event', (payload) => received.push(payload));
  registry.on('game:event', (payload) => received.push(payload));
  registry.bindSessionEvents();
  registry.bindGameplayEvents();
  activeSocket = currentSocket;
  registry.bindSessionEvents();
  registry.bindGameplayEvents();

  oldSocket.trigger('session:event', { source: 'old-session' });
  oldSocket.trigger('game:event', { source: 'old-game' });
  assert.equal(decodeCount, 0, '旧 Socket 包应在解码和状态消费前直接丢弃');
  assert.deepEqual(received, [], '旧 Socket 包不得进入当前客户端状态');

  currentSocket.trigger('session:event', { source: 'current-session' });
  currentSocket.trigger('game:event', { source: 'current-game' });
  assert.equal(decodeCount, 2, '当前 Socket 包应正常解码');
  assert.deepEqual(received, [{ source: 'current-session' }, { source: 'current-game' }]);

  const { createMainConnectionStateSource } = loadTypeScriptModule(connectionStatePath, {
    './ui/i18n': { t: (key) => key },
  });
  let redirectCount = 0;
  let rejectPendingCount = 0;
  let clearPingCount = 0;
  let markDisconnectedCount = 0;
  let recoveryCount = 0;
  const connectionState = createMainConnectionStateSource({
    socket: { connected: false },
    restoreSession: async () => false,
    redirectConnection: () => {
      redirectCount += 1;
      return true;
    },
    hasRefreshToken: () => true,
    resetGameState: () => undefined,
    showLogin: () => undefined,
    showToast: () => undefined,
    logout: () => undefined,
    rejectPendingRedeemCodes: () => { rejectPendingCount += 1; },
    clearPendingSocketPing: () => { clearPingCount += 1; },
    renderPingLatency: () => undefined,
    setPanelRuntimeDisconnected: () => { markDisconnectedCount += 1; },
    hasPlayer: () => true,
    scheduleConnectionRecovery: () => { recoveryCount += 1; },
    getDocumentVisibilityState: () => 'visible',
    handlePong: () => undefined,
  });
  await connectionState.handleError({
    code: 'AUTH_FAIL',
    message: 'redirect',
    redirectUrl: 'https://next.example.test',
  });
  assert.equal(redirectCount, 1, 'AUTH_FAIL 重定向应切换一次连接');
  connectionState.handleDisconnect('transport close');
  assert.equal(rejectPendingCount, 1, '重定向完成后的真实断线仍应清理待决请求');
  assert.equal(clearPingCount, 1, '重定向完成后的真实断线仍应清理心跳请求');
  assert.equal(markDisconnectedCount, 1, '重定向完成后的真实断线仍应更新面板状态');
  assert.equal(recoveryCount, 1, '重定向完成后的真实断线仍应调度恢复');
} finally {
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
}

console.log('socket session isolation proof passed');
