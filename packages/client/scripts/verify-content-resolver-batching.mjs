import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const clientRoot = fileURLToPath(new URL('..', import.meta.url));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, message, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(message);
    }
    await wait(2);
  }
}

function createItem(itemId) {
  return {
    itemId,
    name: itemId,
    type: 'material',
    desc: '',
  };
}

function bindRecorder(resolver) {
  const requests = [];
  resolver.bindEmitter((payload) => {
    requests.push(structuredClone(payload));
    return { accepted: true };
  });
  return requests;
}

async function verifyMultiBatchOutOfOrder(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 500 });
  const requests = bindRecorder(resolver);
  const ids = Array.from({ length: 120 }, (_, index) => `proof:multi:${index}`);
  const resultsPromise = Promise.all(ids.map((id) => resolver.fetchItem(id)));

  await waitFor(() => requests.length === 3, '120 个 ID 未拆成三个批次');
  assert.deepEqual(requests.map((request) => request.items?.length), [50, 50, 20]);
  assert.equal(new Set(requests.map((request) => request.requestId)).size, 3, '每批必须拥有唯一 requestId');

  for (const request of [requests[2], requests[0], requests[1]]) {
    resolver.handleContentTemplatesResponse({
      requestId: request.requestId,
      items: request.items.map(createItem),
    });
  }

  const results = await resultsPromise;
  assert.deepEqual(results.map((item) => item?.itemId ?? null), ids, '乱序响应必须回到各自批次');
}

async function verifyLaterEnqueueIsolation(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 500 });
  const requests = bindRecorder(resolver);
  const firstPromise = resolver.fetchItem('proof:later:first');
  await waitFor(() => requests.length === 1, '首批请求未发出');

  let laterSettled = false;
  const laterPromise = resolver.fetchItem('proof:later:second').then((value) => {
    laterSettled = true;
    return value;
  });
  await waitFor(() => requests.length === 2, '后入队 ID 未形成独立批次');

  resolver.handleContentTemplatesResponse({
    requestId: requests[0].requestId,
    items: [createItem('proof:later:first'), createItem('proof:later:second')],
  });
  await Promise.resolve();
  assert.equal(laterSettled, false, '旧批响应错误结算了后入队 promise');
  assert.equal(resolver.getItem('proof:later:second'), null, '旧批不得注入不属于该批的 ID');

  resolver.handleContentTemplatesResponse({
    requestId: requests[1].requestId,
    items: [createItem('proof:later:second')],
  });
  assert.equal((await firstPromise)?.itemId, 'proof:later:first');
  assert.equal((await laterPromise)?.itemId, 'proof:later:second');
}

async function verifySameIdCoalescing(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 500 });
  const requests = bindRecorder(resolver);
  const firstPromise = resolver.fetchItem('proof:coalesce');
  await waitFor(() => requests.length === 1, '同 ID 合并测试首批未发出');
  const secondPromise = resolver.fetchItem('proof:coalesce');
  await wait(5);
  assert.equal(requests.length, 1, '同一 in-flight ID 不应重复发包');

  resolver.handleContentTemplatesResponse({
    requestId: requests[0].requestId,
    items: [createItem('proof:coalesce')],
  });
  assert.equal((await firstPromise)?.itemId, 'proof:coalesce');
  assert.equal((await secondPromise)?.itemId, 'proof:coalesce');
}

async function verifyTimeoutAndLateResponse(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 20 });
  const requests = bindRecorder(resolver);
  const timedOutPromise = resolver.fetchItem('proof:timeout');
  await waitFor(() => requests.length === 1, '超时测试请求未发出');
  const expiredRequest = requests[0];
  assert.equal(await timedOutPromise, null, '超时 promise 必须收敛为 null');

  resolver.handleContentTemplatesResponse({
    requestId: expiredRequest.requestId,
    items: [createItem('proof:timeout')],
  });
  assert.equal(resolver.getItem('proof:timeout'), null, '迟到响应不得污染动态缓存');

  const retryPromise = resolver.fetchItem('proof:timeout');
  await waitFor(() => requests.length === 2, '超时后的新请求未重新发出');
  assert.notEqual(requests[1].requestId, expiredRequest.requestId, '重试必须使用新 requestId');
  resolver.handleContentTemplatesResponse({
    requestId: requests[1].requestId,
    items: [createItem('proof:timeout')],
  });
  assert.equal((await retryPromise)?.itemId, 'proof:timeout');
}

async function verifyMissingIdsSettle(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 500 });
  const requests = bindRecorder(resolver);
  const missingPromise = resolver.fetchItem('proof:missing');
  await waitFor(() => requests.length === 1, '缺失 ID 测试请求未发出');
  resolver.handleContentTemplatesResponse({ requestId: requests[0].requestId });
  assert.equal(await missingPromise, null, '服务端未返回的批内 ID 必须结算为 null');
}

async function verifyPartialItemRequiresFullFetch(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 500 });
  const requests = bindRecorder(resolver);
  resolver.injectItemSummary('proof:partial', { name: '只含摘要的物品', type: 'material' });
  assert.equal(resolver.getItem('proof:partial')?.name, '只含摘要的物品', '同步展示仍应读取摘要');

  const fullPromise = resolver.fetchItem('proof:partial');
  await waitFor(() => requests.length === 1, '精简摘要未触发完整模板请求');
  assert.deepEqual(requests[0].items, ['proof:partial']);
  resolver.handleContentTemplatesResponse({
    requestId: requests[0].requestId,
    items: [createItem('proof:partial')],
  });
  assert.equal((await fullPromise)?.name, 'proof:partial', '完整模板响应必须替换摘要缓存');
}

async function verifyRejectedEmissionSettlesImmediately(ContentResolver) {
  const resolver = new ContentResolver({ flushDelayMs: 1, requestTimeoutMs: 60_000 });
  let rejectedRequest = null;
  resolver.bindEmitter((payload) => {
    rejectedRequest = structuredClone(payload);
    return { accepted: false };
  });

  const result = await Promise.race([
    resolver.fetchItem('proof:rejected-send'),
    wait(100).then(() => 'timed-out'),
  ]);
  assert.equal(result, null, '出站门控拒绝后不得等到 L3 的 10 秒请求超时');
  assert.ok(rejectedRequest, '被拒绝的批次仍应到达发包回调以获得拒绝结果');

  resolver.handleContentTemplatesResponse({
    requestId: rejectedRequest.requestId,
    items: [createItem('proof:rejected-send')],
  });
  assert.equal(resolver.getItem('proof:rejected-send'), null, '已拒绝批次的迟到响应不得回填缓存');
}

const vite = await createServer({
  root: clientRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { ContentResolver } = await vite.ssrLoadModule('/src/content/content-resolver.ts');
  await verifyMultiBatchOutOfOrder(ContentResolver);
  await verifyLaterEnqueueIsolation(ContentResolver);
  await verifySameIdCoalescing(ContentResolver);
  await verifyTimeoutAndLateResponse(ContentResolver);
  await verifyMissingIdsSettle(ContentResolver);
  await verifyPartialItemRequiresFullFetch(ContentResolver);
  await verifyRejectedEmissionSettlesImmediately(ContentResolver);
  console.log('ContentResolver 批处理关联、乱序隔离与超时收敛验证通过');
} finally {
  await vite.close();
}
