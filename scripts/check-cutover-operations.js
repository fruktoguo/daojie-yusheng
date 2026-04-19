#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(content, pattern, message) {
  assert(pattern.test(content), message);
}

function main() {
  const rootPackage = JSON.parse(read('package.json'));
  const plan10 = read('docs/next-plan/10-legacy-archive-and-cutover.md');
  const mainPlan = read('docs/next-plan/main.md');
  const ops = read('docs/server-next-operations.md');
  const runbook = read('packages/server/REPLACE-RUNBOOK.md');
  const checklist = read('docs/next-plan/10-cutover-execution-checklist.md');
  const logTemplate = read('docs/next-plan/10-cutover-execution-log-template.md');

  assert(
    rootPackage.scripts['proof:cutover-operations'],
    '根 package.json 缺少脚本：proof:cutover-operations',
  );

  assertIncludes(
    checklist,
    /## 切换前[\s\S]*`pnpm build`[\s\S]*`pnpm verify:replace-ready:full`[\s\S]*`pnpm proof:cutover-preflight`[\s\S]*`pnpm verify:replace-ready:shadow:destructive:preflight`/,
    '切换执行清单必须继续覆盖切换前 gate 与 proof',
  );
  assertIncludes(
    checklist,
    /preflight.*maintenance-active/,
    '切换执行清单必须继续明确 destructive 只能在 preflight 确认 maintenance-active 后执行',
  );
  assertIncludes(
    checklist,
    /## 切换中[\s\S]*gm\/maps[\s\S]*gm\/editor-catalog[\s\S]*gm\/database\/state/,
    '切换执行清单必须继续覆盖切换中的 GM 只读面检查',
  );
  assertIncludes(
    checklist,
    /## 切换后 30-60 分钟观察[\s\S]*legacy[\s\S]*next socket[\s\S]*gm\/database\/state/,
    '切换执行清单必须继续覆盖切换后观察项',
  );
  assertIncludes(
    checklist,
    /## 回滚触发条件[\s\S]*玩家无法稳定登录[\s\S]*关键 GM 只读面不可用/,
    '切换执行清单必须继续覆盖回滚触发条件',
  );

  assertIncludes(
    logTemplate,
    /## 基本信息[\s\S]*## 切换前 gate[\s\S]*## 切换中观察[\s\S]*## 切换后 30-60 分钟观察[\s\S]*## 结论/,
    '切换执行记录模板必须继续覆盖基本信息、gate、观察和结论',
  );
  assertIncludes(
    logTemplate,
    /## destructive \/ 备份恢复[\s\S]*SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1[\s\S]*destructive preflight 结果：/,
    '切换执行记录模板必须继续覆盖 destructive 执行记录',
  );

  assertIncludes(
    plan10,
    /\[10-cutover-execution-checklist\.md\]\(\.\/10-cutover-execution-checklist\.md\)/,
    '10 文档必须继续引用切换执行清单',
  );
  assertIncludes(
    plan10,
    /\[10-cutover-execution-log-template\.md\]\(\.\/10-cutover-execution-log-template\.md\)/,
    '10 文档必须继续引用切换执行记录模板',
  );
  assertIncludes(
    plan10,
    /- \[ \] 完成一次 next 主线切换前检查/,
    '10 文档必须继续保留真实切换前检查未完成状态',
  );
  assertIncludes(
    plan10,
    /- \[ \] 完成一次 next 主线切换后检查/,
    '10 文档必须继续保留真实切换后检查未完成状态',
  );

  assertIncludes(
    mainPlan,
    /- \[ \] 最后完成 `10` 的真实切换前\/切换后人工检查/,
    '总表必须继续明确真实切换前/后人工检查仍未完成',
  );

  assertIncludes(
    ops,
    /\[10-cutover-execution-checklist\.md\]\(\.\/next-plan\/10-cutover-execution-checklist\.md\)/,
    'server-next-operations 必须继续引用切换执行清单',
  );
  assertIncludes(
    ops,
    /\[10-cutover-execution-log-template\.md\]\(\.\/next-plan\/10-cutover-execution-log-template\.md\)/,
    'server-next-operations 必须继续引用切换执行记录模板',
  );
  assertIncludes(
    runbook,
    /10-cutover-execution-checklist\.md/,
    'REPLACE-RUNBOOK 必须继续引用切换执行清单',
  );

  process.stdout.write(
    [
      'cutover operations contract check passed',
      'manual cutover checklist + execution log template are wired',
      '10 still blocked only by real pre/post cutover execution',
    ].join('\n') + '\n',
  );
}

main();
