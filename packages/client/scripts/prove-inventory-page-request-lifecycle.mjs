/** 背包分页请求代际、乱序和版本回退证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadStateModule() {
  const sourcePath = path.join(clientRoot, 'src/ui/panels/inventory-page-request-state.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('exports', 'module', output);
  execute(module.exports, module);
  return module.exports;
}

const { InventoryPageRequestState } = loadStateModule();

function createPage(request, overrides = {}) {
  return {
    requestId: request.requestId,
    filter: request.filter,
    search: request.search,
    offset: request.offset,
    limit: request.limit,
    total: 1,
    totalItems: 1,
    capacity: 20,
    revision: 7,
    items: [],
    ...overrides,
  };
}

const state = new InventoryPageRequestState();
const first = state.begin({ filter: 'all', search: '', offset: 0, limit: 30, knownRevision: 7, now: 100 });
const second = state.begin({ filter: 'equipment', search: ' 铜  罗盘 ', offset: 30, limit: 30, knownRevision: 7, now: 101 });
assert.equal(state.resolve(createPage(first), 7), 'ignored', '旧代际回包不得覆盖新请求');
assert.equal(state.isPending(), true, '忽略旧回包后当前请求必须继续等待');
assert.equal(state.resolve(createPage(second, { requestId: undefined }), 7), 'ignored', '无 requestId 回包不得降级接受');
assert.equal(state.isPending(), true, '无身份回包不得清除当前请求');
assert.equal(state.resolve(createPage(second, { offset: 0 }), 7), 'invalid-current', '当前代际的错误分页坐标必须拒绝');
assert.equal(state.isPending(), false, '当前代际错误回包必须解锁请求，不能永久 loading');

const stale = state.begin({ filter: 'equipment', search: '铜 罗盘', offset: 30, limit: 30, knownRevision: 8, now: 102 });
assert.equal(state.resolve(createPage(stale, { revision: 7 }), 8), 'invalid-current', '低于客户端版本的回包不得回退背包');

const current = state.begin({ filter: 'equipment', search: '铜 罗盘', offset: 30, limit: 30, knownRevision: 8, now: 103 });
assert.equal(state.resolve(createPage(current, { revision: 8 }), 8), 'accepted', '完整匹配的当前代际回包必须接受');
assert.equal(state.isPending(), false);

const rejected = state.begin({ filter: 'all', search: '', offset: 0, limit: 30, now: 104 });
assert.equal(state.cancel(rejected.requestId), true, '本地发包失败必须能撤销对应 pending');
assert.equal(state.isPending(), false, '发包失败后不得永久锁住分页');

console.log(JSON.stringify({ ok: true, case: 'inventory-page-request-lifecycle' }, null, 2));
