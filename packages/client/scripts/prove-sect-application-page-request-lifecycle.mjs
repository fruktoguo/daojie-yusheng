/** 宗门申请分页请求代际、跨宗门隔离和版本回退证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const {
  SECT_MEMBER_ROLE_HIERARCHY,
  SECT_PERMISSION_IDS,
  isSectMemberRoleLowerThan,
} = require('@mud/shared');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewSource = fs.readFileSync(
  path.join(clientRoot, 'src/ui/panels/action-panel-sect-management.ts'),
  'utf8',
);
const i18nSource = fs.readFileSync(
  path.join(clientRoot, 'src/content/i18n/zh-CN.csv'),
  'utf8',
);
const panelsStyleSource = fs.readFileSync(
  path.join(clientRoot, 'src/styles/panels.css'),
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

const {
  SectApplicationPageRequestState,
  resolveSectApplicationPageScopeSectId,
} = loadStateModule();

assert.deepEqual(
  SECT_MEMBER_ROLE_HIERARCHY,
  ['leader', 'supreme_elder', 'deputy', 'elder', 'inner', 'outer', 'labor'],
  '共享职位层级必须保持宗主到杂役的固定顺序',
);
assert.deepEqual(
  SECT_PERMISSION_IDS,
  ['guardian', 'member_remove', 'member_approve', 'member_role', 'building_create', 'building_remove'],
  '共享职位权限必须覆盖六项独立能力',
);
assert.equal(isSectMemberRoleLowerThan('elder', 'deputy'), true);
assert.equal(isSectMemberRoleLowerThan('supreme_elder', 'deputy'), false);

assert.equal(
  resolveSectApplicationPageScopeSectId('sect:summary', undefined),
  'sect:summary',
  '玩家投影缺少 sectId 时，宗门管理摘要仍必须允许分页请求发出',
);
assert.equal(
  resolveSectApplicationPageScopeSectId('sect:summary', 'sect:stale-player'),
  'sect:summary',
  '宗门管理摘要必须优先于可能滞后的玩家投影',
);

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
assert.match(
  viewSource,
  /resolveSectApplicationPageScopeSectId\(summary\.data\.sectId, this\.p\.previewPlayer\?\.sectId\)/,
  '宗门 ID 必须只用于申请分页的内部作用域隔离',
);
assert.doesNotMatch(
  viewSource,
  /sectIdLabel|data-sect-summary-field="sectId"|action\.sect\.manage\.summary\.sect-id/,
  '宗门管理界面不得把内部宗门 ID 渲染给玩家',
);
assert.doesNotMatch(
  i18nSource,
  /^action\.sect\.manage\.summary\.sect-id,/m,
  '语言包不得保留内部宗门 ID 的玩家可见文案',
);
assert.match(
  viewSource,
  /member\.canChangeRole \?\? isSectMemberRoleLowerThan\(member\.roleId, selfRoleId\)/,
  '客户端职位控件必须按服务端投影并兼容共享层级规则',
);
assert.match(
  viewSource,
  /class="sect-member-role-select" data-sect-member-role-select=.*data-sect-member-current-role=/,
  '可编辑职位必须使用宗门成员专用下拉框样式',
);
assert.match(
  panelsStyleSource,
  /\.sect-detail-tag\.strong,\s*\.sect-member-role-select\s*\{/,
  '职位下拉框必须复用当前职位红色标签的视觉语义',
);
assert.match(
  panelsStyleSource,
  /\.sect-member-role-select:focus-visible\s*\{/,
  '职位下拉框必须保留清晰的键盘焦点反馈',
);
assert.match(
  viewSource,
  /role\.id === 'supreme_elder'/,
  '太上长老固定权限必须在客户端禁用编辑',
);
assert.match(
  viewSource,
  /import \{ confirmModalHost \} from '\.\.\/confirm-modal-host';/,
  '宗门成员变更必须复用统一确认弹窗',
);
assert.match(
  viewSource,
  /select\.value = currentRoleId;/,
  '职位选择后必须先恢复服务端权威值，确认成功前不得伪装为已生效',
);
assert.match(
  viewSource,
  /data-sect-member-remove=/,
  '移除成员必须使用独立确认入口',
);
assert.match(
  viewSource,
  /private openSectMemberRoleConfirm[\s\S]*?confirmModalHost\.open[\s\S]*?sect:member:role:/,
  '修改职位必须在确认后才提交动作',
);
assert.match(
  viewSource,
  /private openSectMemberRemovalConfirm[\s\S]*?confirmModalHost\.open[\s\S]*?sect:member:remove:/,
  '逐出成员必须在危险操作确认后才提交动作',
);
for (const key of [
  'action.sect.manage.confirm.member-remove.body',
  'action.sect.manage.confirm.member-remove.button',
  'action.sect.manage.confirm.member-remove.title',
  'action.sect.manage.confirm.member-role.body',
  'action.sect.manage.confirm.member-role.button',
  'action.sect.manage.confirm.member-role.title',
  'action.sect.permission.guardian',
  'action.sect.permission.member-remove',
  'action.sect.permission.member-approve',
  'action.sect.permission.member-role',
  'action.sect.permission.building-create',
  'action.sect.permission.building-remove',
]) {
  assert.match(i18nSource, new RegExp(`^${key.replaceAll('.', '\\.')},`, 'm'), `缺少宗门权限文案：${key}`);
}

console.log(JSON.stringify({ ok: true, case: 'sect-application-page-request-lifecycle' }, null, 2));
