/** 宗门申请分页请求代际、跨宗门隔离和版本回退证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewSource = fs.readFileSync(
  path.join(clientRoot, 'src/ui/panels/action-panel-sect-management.ts'),
  'utf8',
);

function loadStateModule() {
  const sourcePath = path.join(clientRoot, 'src/ui/panels/sect-application-page-request-state.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('exports', 'module', 'require', output);
  execute(module.exports, module, require);
  return module.exports;
}

const { SectApplicationPageRequestState } = loadStateModule();

function createPage(request, overrides = {}) {
  return {
    requestId: request.requestId,
    sectId: 'sect:alpha',
    search: request.search,
    offset: request.offset,
    limit: request.limit,
    total: 1,
    revision: 12,
    items: [],
    ...overrides,
  };
}

const state = new SectApplicationPageRequestState();
const first = state.begin({ sectId: 'sect:alpha', search: '', offset: 0, limit: 20, minimumRevision: 10, now: 100 });
const second = state.begin({ sectId: 'sect:alpha', search: ' 张  三 ', offset: 20, limit: 20, minimumRevision: 11, now: 101 });
assert.equal(state.resolve(createPage(first)), 'ignored', '旧代际回包不得覆盖新搜索');
assert.equal(state.isPending(), true, '忽略旧回包后当前请求必须继续等待');
assert.equal(state.resolve(createPage(second, { sectId: 'sect:other' })), 'invalid-current', '其他宗门回包不得进入当前宗门面板');
assert.equal(state.isPending(), false, '当前代际非法回包必须解除 loading');

const stale = state.begin({ sectId: 'sect:alpha', search: '张 三', offset: 20, limit: 20, minimumRevision: 13, now: 102 });
assert.equal(state.resolve(createPage(stale, { revision: 12 })), 'invalid-current', '旧宗门版本不得覆盖已知新版本');

const current = state.begin({ sectId: 'sect:alpha', search: '张 三', offset: 20, limit: 999, minimumRevision: 13, now: 103 });
assert.equal(current.limit, 50, '分页数量必须限制在共享协议上限内');
assert.equal(state.resolve(createPage(current, { limit: 50, revision: 13 })), 'accepted', '完整匹配的当前代际回包必须接受');
assert.equal(state.isPending(), false);

const rejected = state.begin({ sectId: 'sect:alpha', search: '', offset: 0, limit: 20, minimumRevision: 13, now: 104 });
assert.equal(state.cancel(rejected.requestId), true, '本地发包失败必须能撤销对应 pending');
assert.equal(state.isPending(), false, '发包失败后不得永久锁住分页');

const patchMethodStart = viewSource.indexOf('private patchSectApplicationSection(');
const patchMethodEnd = viewSource.indexOf('private getActiveSectApplicationPage(', patchMethodStart);
assert.ok(patchMethodStart >= 0 && patchMethodEnd > patchMethodStart, '必须保留申请列表局部 patch 入口');
const patchMethodSource = viewSource.slice(patchMethodStart, patchMethodEnd);
assert.match(patchMethodSource, /replaceElementHtml\(rows,/, '分页回包只能替换申请行容器');
assert.doesNotMatch(patchMethodSource, /replaceElementHtml\(section,/, '分页回包不得重建含搜索输入框的申请卡片');
assert.match(viewSource, /data-sect-application-search/, '申请卡片必须保留独立搜索输入框');
assert.match(viewSource, /data-sect-application-rows/, '申请卡片必须保留独立行容器');

console.log(JSON.stringify({ ok: true, case: 'sect-application-page-request-lifecycle' }, null, 2));
