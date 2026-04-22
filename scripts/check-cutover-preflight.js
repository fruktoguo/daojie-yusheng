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

function assertNotIncludes(content, pattern, message) {
  assert(!pattern.test(content), message);
}

function assertMissing(relativePath, message) {
  assert(!fs.existsSync(path.join(repoRoot, relativePath)), message);
}

function main() {
  const rootPackage = JSON.parse(read('package.json'));
  const serverPackage = JSON.parse(read('packages/server/package.json'));
  const mainPlan = read('docs/next-plan/main.md');
  const nextPlanReadme = read('docs/next-plan/README.md');
  const plan05 = read('docs/next-plan/05-remove-compat-and-bridges.md');
  const plan06 = read('docs/next-plan/06-server-mainline-refactor.md');
  const plan07 = read('docs/next-plan/07-client-mainline-refactor.md');
  const plan08 = read('docs/next-plan/08-shared-content-and-map-cleanup.md');
  const plan09 = read('docs/next-plan/09-verification-and-acceptance.md');
  const plan10 = read('docs/next-plan/10-legacy-archive-and-cutover.md');

  assertIncludes(
    plan05,
    /## 完成定义[\s\S]*- \[x\] 玩家主链不再默认走 compat fallback[\s\S]*- \[x\] 主要路径只剩 next 单线逻辑/,
    '05 必须继续保持完成定义全绿',
  );
  assertIncludes(
    plan06,
    /## 完成定义[\s\S]*- \[x\] 服务端主链按职责拆清[\s\S]*- \[x\] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径/,
    '06 必须继续保持完成定义全绿',
  );
  assertIncludes(
    plan07,
    /## 完成定义[\s\S]*- \[x\] 客户端主链不再依赖旧协议或旧 UI 兼容逻辑[\s\S]*- \[x\] 客户端达到“能和 next 新协议正常对接”的可切换状态/,
    '07 必须继续保持完成定义全绿',
  );
  assertIncludes(
    plan08,
    /## 完成定义[\s\S]*- \[x\] shared 不再成为隐形不稳定源[\s\S]*- \[x\] 内容、地图、引用关系完成一次系统性清理/,
    '08 必须继续保持完成定义全绿',
  );
  assertIncludes(
    plan09,
    /- \[x\] 跑通 `pnpm verify:replace-ready`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:with-db`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:acceptance`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:full`/,
    '09 必须继续保持“local/with-db/acceptance/full 已过”的门禁状态',
  );
  assertIncludes(
    plan09,
    /当前 shell 环境参考结论是：[\s\S]*- \[x\] `local`: ready[\s\S]*- \[x\] `with-db`: ready[\s\S]*- \[x\] `proof with-db`: ready[\s\S]*- \[x\] `shadow`: ready[\s\S]*- \[x\] `acceptance`: ready[\s\S]*- \[x\] `full`: ready[\s\S]*默认 shell 下，`shadow-destructive` 仍不是常开 ready 状态[\s\S]*本轮已经补过一次本机 maintenance-active shadow destructive proof/,
    '09 必须继续明确默认 shell 下 destructive 不是常开 ready，但本轮 proof 已补过',
  );

  assertIncludes(
    plan10,
    /- \[x\] 仓库内 cutover\/readiness proof 已固定/,
    '10 必须继续记录 cutover readiness proof 已固定',
  );
  assertIncludes(
    plan10,
    /- \[x\] 仓库内 cutover\/preflight proof 已固定/,
    '10 必须继续记录 cutover preflight proof 已固定',
  );
  assertIncludes(
    plan10,
    /- \[x\] 仓库主入口文档已统一写成 next 唯一主线[\s\S]*- \[x\] 仍保留的 legacy 文件都有保留原因/,
    '10 必须继续记录切换后检查的仓库内项已完成',
  );
  assertIncludes(
    plan10,
    /## 切换前检查表[\s\S]*- \[x\] next 真源已唯一化[\s\S]*- \[x\] 不再保留一次性迁移脚本，默认按空库 \/ 新服入口切换[\s\S]*- \[x\] 主要 compat 面已不再阻塞主链[\s\S]*- \[x\] server\/client\/shared 主链都已收口到可继续开发[\s\S]*- \[x\] 验证门禁口径已固定/,
    '10 必须继续记录仓库内切换前检查表已完成',
  );
  assertIncludes(
    plan10,
    /- \[x\] legacy 只剩归档和历史参考价值[\s\S]*- \[x\] next 主线可以作为后续唯一开发入口/,
    '10 必须继续记录已完成的 cutover 定义',
  );

  assertNotIncludes(
    nextPlanReadme,
    /03-required-data-migration-checklist|04-one-off-migration-script/,
    'next-plan README 不应再保留迁移清单或一次性迁移脚本文档入口',
  );
  assertNotIncludes(
    mainPlan,
    /03-required-data-migration-checklist|04-one-off-migration-script|给“数据迁移完成”补一条迁移 proof 链|legacy 数据可以稳定迁到 next/,
    '总表不应再保留迁移阶段入口、迁移 proof 口径或 legacy 数据迁移完成定义',
  );
  assertNotIncludes(
    plan09,
    /migrate:legacy-next:once|migrate-next-mainline-once|数据迁移 proof 链/,
    '09 不应再保留迁移 proof 链或一次性迁移脚本入口',
  );
  assertNotIncludes(
    plan10,
    /迁移来源|迁移脚本已能把必要数据写入 next 真源|legacy 只剩归档和迁移参考价值/,
    '10 不应再把迁移来源或迁移参考价值当成当前切换口径',
  );
  assert(
    !Object.prototype.hasOwnProperty.call(rootPackage.scripts, 'proof:migration-write-boundaries'),
    '根 package.json 不应再暴露迁移写边界 proof',
  );
  assert(
    !Object.keys(serverPackage.scripts).some((name) => name.startsWith('migrate:')),
    'packages/server package.json 不应再保留迁移脚本入口',
  );
  assert(
    !Object.keys(serverPackage.scripts).some(
      (name) =>
        name.startsWith('proof:') &&
        !['proof:content-map-sources', 'proof:runtime-network-no-legacy-source', 'proof:mainline-boundaries'].includes(name),
    ),
    'packages/server package.json 不应再保留过时 proof 别名',
  );
  assertMissing(
    'docs/next-plan/03-required-data-migration-checklist.md',
    '03 迁移清单文档应已删除',
  );
  assertMissing(
    'docs/next-plan/04-one-off-migration-script.md',
    '04 一次性迁移脚本文档应已删除',
  );
  assertMissing(
    'packages/server/src/tools/migrate-next-mainline-once.ts',
    'server 迁移脚本真源应已删除',
  );
  assertMissing(
    'packages/server/src/tools/fixtures/migrate-next-mainline-once/sample-legacy.json',
    '迁移样本 fixture 应已删除',
  );
  assertMissing(
    'scripts/prove-migration-write-boundaries.js',
    '迁移写边界 proof 脚本应已删除',
  );
  const serverToolFiles = fs
    .readdirSync(path.join(repoRoot, 'packages/server/src/tools'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const allowedProofTools = new Set([
    'prove-content-map-sources.ts',
    'prove-runtime-network-no-legacy-source.ts',
  ]);
  for (const fileName of serverToolFiles) {
    if (/^prove-.*\.ts$/.test(fileName)) {
      assert(allowedProofTools.has(fileName), `packages/server/src/tools 不应再保留过时 proof 壳：${fileName}`);
    }
  }

  assertIncludes(
    mainPlan,
    /## 11\. 验证门禁收口[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:with-db`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:acceptance`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:full`/,
    '总表必须继续记录 09 的默认 gate 已全部通过',
  );
  assertIncludes(
    mainPlan,
    /## 12\. legacy 归档收尾[\s\S]*- \[x\] 固定 next cutover \/ readiness 的仓库内 proof/,
    '总表必须继续记录 10 的仓库内 proof 已固定',
  );
  assertIncludes(
    mainPlan,
    /## 12\. legacy 归档收尾[\s\S]*- \[x\] 固定 next cutover \/ preflight 的仓库内 proof/,
    '总表必须继续记录 10 的 cutover preflight proof 已固定',
  );
  assertIncludes(
    mainPlan,
    /## 13\. 硬切完成定义[\s\S]*- \[x\] `packages\/\*` 成为唯一活跃主线[\s\S]*- \[x\] GM 关键面与必要管理面能闭环[\s\S]*- \[x\] 验证门禁全部按 next 主链口径通过/,
    '总表必须继续记录 GM 关键面与默认验证门禁已闭环',
  );
  assertNotIncludes(
    mainPlan,
    /- \[ \] 再补协议空洞和最外层 compat 删除|- \[ \] 再写一次性迁移脚本|- \[ \] 再做 server\/client\/shared 主链收口/,
    '总表不应再把 03-08 的主链工程项保留为未完成',
  );

  process.stdout.write(
    [
      'cutover preflight contract check passed',
      '03/04 retired; 05/06/07/08 completed-by-doc',
      '09 default gates passed; only shadow-destructive remains optional/maintenance-gated',
      '10 repository-side cutover checks fixed; remaining blockers are manual cutover operations',
    ].join('\n') + '\n',
  );
}

main();
