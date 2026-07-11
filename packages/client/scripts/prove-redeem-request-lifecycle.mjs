#!/usr/bin/env node

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const clientRoot = fileURLToPath(new URL('..', import.meta.url));
const timers = new Map();
let nextTimerId = 0;

globalThis.window = {
  setTimeout(callback) {
    nextTimerId += 1;
    timers.set(nextTimerId, callback);
    return nextTimerId;
  },
  clearTimeout(timerId) {
    timers.delete(timerId);
  },
};

function runOnlyTimer() {
  assert.equal(timers.size, 1, '当前应只有一个兑换超时任务');
  const [timerId, callback] = timers.entries().next().value;
  timers.delete(timerId);
  callback();
}

async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const vite = await createServer({
  root: clientRoot,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { createMainSettingsStateSource } = await vite.ssrLoadModule('/src/main-settings-state-source.ts');
  let panelOptions = null;
  let sendAccepted = true;
  const sentRequests = [];
  const source = createMainSettingsStateSource({
    settingsPanel: {
      setOptions(options) {
        panelOptions = options;
      },
    },
    getCurrentAccountName: () => 'account',
    getCurrentPlayerId: () => 'player:1',
    getPlayerNo: () => 1,
    getPlayer: () => null,
    applyVisibleDisplayName() {},
    applyVisibleRoleName() {},
    syncPlayerBridgeState() {},
    refreshHudChrome() {},
    showToast() {},
    isSocketConnected: () => true,
    sendRedeemCodes(requestId, codes) {
      sentRequests.push({ requestId, codes });
      return sendAccepted;
    },
    closeSettingsPanel() {},
    disconnectSocket() {},
    resetGameState() {},
    logout() {},
  });

  assert.ok(panelOptions?.redeemCodes, '设置面板必须持有兑换请求入口');

  const timedOut = panelOptions.redeemCodes(['CODE-A']);
  const firstRequestId = sentRequests.at(-1)?.requestId;
  assert.match(firstRequestId, /^redeem:/, '兑换请求必须生成独立 requestId');
  runOnlyTimer();
  await assert.rejects(timedOut, /兑换未有回音/);

  const second = panelOptions.redeemCodes(['CODE-B']);
  const secondRequestId = sentRequests.at(-1)?.requestId;
  assert.notEqual(secondRequestId, firstRequestId, '超时后的新请求不得复用旧 requestId');
  let secondSettled = false;
  void second.then(
    () => { secondSettled = true; },
    () => { secondSettled = true; },
  );
  source.handleRedeemCodesResult({
    requestId: firstRequestId,
    result: { results: [{ code: 'CODE-A', ok: true }] },
  });
  await settleMicrotasks();
  assert.equal(secondSettled, false, '迟到的旧结果不得结算新请求');
  const secondResult = { results: [{ code: 'CODE-B', ok: true }] };
  source.handleRedeemCodesResult({ requestId: secondRequestId, result: secondResult });
  assert.deepEqual(await second, secondResult);
  assert.equal(timers.size, 0, '成功结算必须撤销超时任务');

  const failed = panelOptions.redeemCodes(['CODE-C']);
  const failedRequestId = sentRequests.at(-1)?.requestId;
  source.handleRedeemCodesResult({
    requestId: failedRequestId,
    result: null,
    errorCode: 'execution_failed',
  });
  await assert.rejects(failed, /兑换执行失败/);

  const cleared = panelOptions.redeemCodes(['CODE-D']);
  source.clear();
  await assert.rejects(cleared, /气机已断/);
  assert.equal(timers.size, 0, '会话清理必须撤销兑换超时任务');

  sendAccepted = false;
  await assert.rejects(panelOptions.redeemCodes(['CODE-E']), /气机未通/);
  assert.equal(timers.size, 0, '发包门控拒绝后不得留下假等待态');

  console.log('兑换码请求关联与会话清理证明通过');
} finally {
  await vite.close();
}
