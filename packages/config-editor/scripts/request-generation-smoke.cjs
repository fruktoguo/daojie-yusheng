/** 验证配置编辑器最新请求代际和保存回写上下文。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/lib/request-generation.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;
const loadedModule = { exports: {} };
vm.runInNewContext(output, {
  AbortController,
  exports: loadedModule.exports,
  module: loadedModule,
}, { filename: sourcePath });

const {
  LatestRequestGuard,
  shouldReplaceEditorDraftAfterSave,
} = loadedModule.exports;

const guard = new LatestRequestGuard();
const inactiveRequest = guard.begin();
assert.equal(guard.isCurrent(inactiveRequest), false, '组件激活前不得接纳回包');

guard.activate();
const firstRequest = guard.begin();
assert.equal(guard.isCurrent(firstRequest), true, '激活后的当前请求应可接纳');
const secondRequest = guard.begin();
assert.equal(firstRequest.signal.aborted, true, '新请求必须取消上一只读请求');
assert.equal(guard.isCurrent(firstRequest), false, '旧代际回包必须失效');
assert.equal(guard.isCurrent(secondRequest), true, '最新代际回包必须有效');

guard.deactivate();
assert.equal(secondRequest.signal.aborted, true, '组件停用时必须取消当前请求');
assert.equal(guard.isCurrent(secondRequest), false, '组件停用后不得接纳回包');
guard.activate();
const strictModeRequest = guard.begin();
assert.equal(guard.isCurrent(strictModeRequest), true, 'StrictMode 再激活后必须可继续工作');

assert.equal(
  shouldReplaceEditorDraftAfterSave('a', '{"value":1}', 'a', '{"value":1}'),
  true,
  '相同条目且草稿未变化时应采用服务端规范化结果',
);
assert.equal(
  shouldReplaceEditorDraftAfterSave('a', '{"value":1}', 'b', '{"value":1}'),
  false,
  '切换条目后旧保存回包不得替换当前草稿',
);
assert.equal(
  shouldReplaceEditorDraftAfterSave('a', '{"value":1}', 'a', '{"value":2}'),
  false,
  '保存期间继续编辑后不得用旧回包覆盖新草稿',
);

console.log('config-editor request-generation smoke ok');
