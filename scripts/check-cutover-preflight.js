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
  const plan09 = read('docs/next-plan/09-verification-and-acceptance.md');

  assertMissing('legacy', 'legacy/ 归档目录应已删除');
  assertMissing('docker-compose.legacy.yml', 'legacy compose 入口应已删除');
  assertMissing('next-workspace', 'next-workspace 迁移期目录应已删除');
  assertMissing('docs/next-plan/01-freeze-legacy-and-boundaries.md', '01 legacy 冻结文档应已删除');
  assertMissing('docs/next-plan/02-pin-next-sources-and-protocol.md', '02 真源钉死文档应已删除');
  assertMissing('docs/next-plan/03-required-data-migration-checklist.md', '03 迁移清单文档应已删除');
  assertMissing('docs/next-plan/04-one-off-migration-script.md', '04 一次性迁移脚本文档应已删除');
  assertMissing('docs/next-plan/05-remove-compat-and-bridges.md', '05 compat 删除文档应已删除');
  assertMissing('docs/next-plan/06-server-mainline-refactor.md', '06 已完成服务端主链文档应已并入总表后删除');
  assertMissing('docs/next-plan/07-client-mainline-refactor.md', '07 已完成客户端主链文档应已并入总表后删除');
  assertMissing('docs/next-plan/08-shared-content-and-map-cleanup.md', '08 已完成 shared/content 文档应已并入总表后删除');
  assertMissing('docs/next-plan/10-legacy-archive-and-cutover.md', '10 legacy 归档文档应已删除');
  assertMissing(
    'docs/next-plan/10-cutover-execution-log-2026-04-20-local-shadow-destructive.md',
    '本地 shadow destructive 历史样例记录应已删除，真实切换只使用本轮执行记录',
  );
  assertMissing('docs/next-plan/11-server-ts-migration-plan.md', '11 已完成 server TS 化计划应已并入总表后删除');
  assertMissing('docs/frontend-refactor', 'frontend-refactor 迁移期文档目录应已删除');
  assertMissing('docs/frontend-mainline-style-sync-plan.md', 'frontend mainline 对照计划应已删除');
  assertMissing('docs/equipment-design/current-equipment-catalog.json', '旧装备目录生成快照应已删除');
  assertMissing('packages/server/NEXT-GAP-ANALYSIS.md', '旧 server gap 分析入口应已删除');
  assertMissing('packages/server/src/tools/convert-legacy-map-dump.ts', '旧 legacy map dump 转换工具应已删除');
  assertMissing('packages/server/src/tools/audit/legacy-boundary-audit.ts', '旧 legacy boundary audit 文件名应已改为 mainline 口径');
  assertMissing('packages/server/src/tools/prove-runtime-network-no-legacy-source.ts', '旧 runtime/network legacy-source proof 文件名应已改为 mainline 口径');

  for (const [name, command] of Object.entries(rootPackage.scripts)) {
    assert(!name.startsWith('archive:legacy:'), `根 package.json 不应再保留 legacy 归档脚本：${name}`);
    assert(
      !/(^|[^\w-])legacy\/|--dir legacy\/|docker-compose\.legacy/.test(command),
      `根 package.json 脚本不应再直接触达 legacy：${name}`,
    );
  }

  assertIncludes(
    mainPlan,
    /## 6\. 服务端主链收口[\s\S]*- \[x\] 服务端主链按职责拆清[\s\S]*- \[x\] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径/,
    '总表必须继续保留 06 服务端主链完成定义',
  );
  assertIncludes(
    mainPlan,
    /## 7\. 客户端主链收口[\s\S]*- \[x\] 客户端主链不再依赖旧协议或旧 UI 兼容逻辑[\s\S]*- \[x\] 客户端达到“能和 next 新协议正常对接”的可切换状态/,
    '总表必须继续保留 07 客户端主链完成定义',
  );
  assertIncludes(
    mainPlan,
    /## 8\. shared 与内容地图收口[\s\S]*- \[x\] shared 不再成为隐形不稳定源[\s\S]*- \[x\] 内容、地图、引用关系完成一次系统性清理/,
    '总表必须继续保留 08 shared/content 完成定义',
  );
  assertIncludes(
    plan09,
    /- \[x\] 跑通 `pnpm verify:replace-ready`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:with-db`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:acceptance`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:full`/,
    '09 必须继续保持“local/with-db/acceptance/full 已过”的门禁状态',
  );

  assertNotIncludes(
    nextPlanReadme,
    /01-freeze-legacy|02-pin-next-sources|03-required-data-migration-checklist|04-one-off-migration-script|05-remove-compat|06-server-mainline|07-client-mainline|08-shared-content|10-legacy-archive|10-cutover-execution-log-2026-04-20|11-server-ts-migration/,
    'next-plan README 不应再保留已删除的迁移期文档入口',
  );
  assertNotIncludes(
    mainPlan,
    /01-freeze-legacy|02-pin-next-sources|03-required-data-migration-checklist|04-one-off-migration-script|05-remove-compat|06-server-mainline|07-client-mainline|08-shared-content|10-legacy-archive|10-cutover-execution-log-2026-04-20|11-server-ts-migration|legacy 数据可以稳定迁到 next/,
    '总表不应再引用已删除的迁移期文档或 legacy 数据迁移口径',
  );
  assertNotIncludes(
    plan09,
    /migrate:legacy-next:once|migrate-next-mainline-once|数据迁移 proof 链/,
    '09 不应再保留迁移 proof 链或一次性迁移脚本入口',
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
    !Object.prototype.hasOwnProperty.call(serverPackage.scripts, 'convert:legacy-map-dump'),
    'packages/server package.json 不应再保留 legacy map dump 转换入口',
  );
  assert(
    !Object.prototype.hasOwnProperty.call(serverPackage.scripts, 'proof:runtime-network-no-legacy-source'),
    'packages/server package.json 不应再保留旧 runtime/network legacy-source proof 命名',
  );

  assertIncludes(
    mainPlan,
    /## 11\. 验证门禁收口[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:with-db`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:acceptance`[\s\S]*- \[x\] 跑通 `pnpm verify:replace-ready:full`/,
    '总表必须继续记录 09 的默认 gate 已全部通过',
  );
  assertIncludes(
    mainPlan,
    /## 12\. legacy 工作树清理与 cutover 收尾[\s\S]*- \[x\] 删除仓库内 `legacy\/` 归档目录/,
    '总表必须继续记录 legacy 工作树已删除',
  );
  assertIncludes(
    mainPlan,
    /## 13\. 硬切完成定义[\s\S]*- \[x\] `packages\/\*` 成为唯一活跃主线[\s\S]*- \[x\] GM 关键面与必要管理面能闭环[\s\S]*- \[x\] 验证门禁全部按 next 主链口径通过/,
    '总表必须继续记录 GM 关键面与默认验证门禁已闭环',
  );

  process.stdout.write(
    [
      'cutover preflight contract check passed',
      'retired migration/legacy docs removed',
      '06/07/08/11 completion summaries kept in main plan; retired detail docs removed',
      'legacy working tree removed; remaining blockers are manual cutover operations',
    ].join('\n') + '\n',
  );
}

main();
