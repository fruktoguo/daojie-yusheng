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
  const readme = read('README.md');
  const nextPlanReadme = read('docs/next-plan/README.md');
  const mainPlan = read('docs/next-plan/main.md');
  const cutoverPlan = read('docs/next-plan/10-legacy-archive-and-cutover.md');
  const serverReadme = read('packages/server/README.md');
  const serverTesting = read('packages/server/TESTING.md');
  const serverOps = read('docs/server-next-operations.md');
  const startNext = read('start-next.sh');
  const startLegacy = read('start.sh');

  const requiredScripts = [
    'build',
    'build:next',
    'dev:client',
    'dev:server',
    'start:server',
    'verify:replace-ready',
    'verify:replace-ready:doctor',
    'proof:cutover-readiness',
  ];
  for (const name of requiredScripts) {
    assert(rootPackage.scripts[name], `根 package.json 缺少脚本：${name}`);
  }

  for (const [name, command] of Object.entries(rootPackage.scripts)) {
    const touchesLegacyDir =
      /(^|[^\w-])legacy\//.test(command) ||
      /--dir legacy\//.test(command) ||
      /docker-compose\.legacy/.test(command);
    if (touchesLegacyDir) {
      assert(
        name.startsWith('archive:legacy:'),
        `只有 archive:legacy:* 脚本允许直接触达 legacy 目录，违规脚本：${name}`,
      );
    }
  }

  assertIncludes(
    readme,
    /这个仓库当前只服务于 `next` 重构线。/,
    'README 必须继续把 next 写成当前唯一活跃主线',
  );
  assertIncludes(
    readme,
    /目录主线已经统一到 `packages\/\*`/,
    'README 必须继续明确目录主线统一到 packages/*',
  );
  assertIncludes(
    readme,
    /legacy\/\*` 当前只保留三类价值：查旧规则、查旧数据格式、迁移输入/,
    'README 必须继续明确 legacy 只剩规则/旧数据格式/迁移输入三类价值',
  );
  assertIncludes(
    readme,
    /`\.\/start-next\.sh` 是默认本地启动脚本；`\.\/start\.sh` 只保留给 `legacy\/` 归档排查/,
    'README 必须继续明确 start-next.sh 是默认入口，start.sh 只给 legacy 归档排查',
  );
  assertIncludes(
    startNext,
    /启动 server-next 本地开发环境/,
    'start-next.sh 必须继续明确自己服务于 next 主线本地开发环境',
  );
  assertIncludes(
    startLegacy,
    /启动 legacy 归档本地开发环境/,
    'start.sh 必须继续明确自己只服务于 legacy 归档环境',
  );
  assertIncludes(
    startLegacy,
    /next 默认请使用 \.\/start-next\.sh/,
    'start.sh 必须继续提示 next 默认入口是 start-next.sh',
  );

  assertIncludes(
    nextPlanReadme,
    /当前主线只认 `packages\/\*`；`legacy\/\*` 只继续保留为归档参考、旧数据格式对照和迁移输入来源。/,
    'next-plan README 必须继续明确主线与 legacy 的角色划分',
  );

  assertIncludes(
    serverReadme,
    /`packages\/server` 是仓库里的 next 后端目录主线/,
    'packages/server README 必须继续明确 packages/server 是 next 主线',
  );
  assertIncludes(
    serverReadme,
    /active 主包里已不存在单独的 compat\/legacy 主目录/,
    'packages/server README 必须继续明确 active 主包不再把 legacy 当主目录',
  );
  assertIncludes(
    serverTesting,
    /根级主入口现在是 `verify:replace-ready\*`；`verify:server-next\*` 只保留为兼容别名。/,
    'packages/server TESTING 必须继续明确 replace-ready 是主 gate 入口',
  );
  assertIncludes(
    serverOps,
    /根级主入口现在是 `verify:replace-ready\*`；`verify:server-next\*` 只保留为兼容别名。/,
    'server-next-operations 必须继续明确 replace-ready 是主 gate 入口',
  );

  assertIncludes(
    cutoverPlan,
    /- \[x\] 把不再需要的 legacy 入口从主文档中移除/,
    '10 文档必须继续记录主文档 legacy 入口已移出',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] 把不再需要的 legacy 入口从主流程中移除/,
    '10 文档必须继续记录主流程 legacy 入口已移出',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] 把 legacy 剩余价值收束为“查规则 \/ 查旧数据格式 \/ 迁移来源”/,
    '10 文档必须继续记录 legacy 剩余价值已收束',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] 固定仓库内 next cutover \/ readiness proof/,
    '10 文档必须继续记录 cutover proof 已固定',
  );
  assertIncludes(
    cutoverPlan,
    /legacy\/client\/src\/\*\*`、`legacy\/shared\/src\/\*\*`、`legacy\/server\/src\/game\/\*\*`.*不再进入默认开发、默认验证或默认启动流程/,
    '10 文档必须继续明确 legacy 基线目录不再进入默认开发/验证/启动流程',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] README 与 docs 首页只指向 next 主线/,
    '10 文档必须继续记录切换后检查里 README/docs 首页已收口到 next 主线',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] 默认命令只指向 next 主线/,
    '10 文档必须继续记录切换后检查里默认命令已收口到 next 主线',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] workflow 文案不再暗示 legacy 是主入口/,
    '10 文档必须继续记录切换后检查里 workflow 文案已不再暗示 legacy 主入口',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] legacy 只剩归档和迁移参考价值/,
    '10 文档必须继续记录切换后检查里 legacy 角色已收束',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] legacy 只剩归档和迁移参考价值/,
    '10 文档完成定义必须继续记录 legacy 只剩归档和迁移参考价值',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] next 主线可以作为后续唯一开发入口/,
    '10 文档完成定义必须继续记录 next 主线已可作为唯一开发入口',
  );

  assertIncludes(
    mainPlan,
    /- \[x\] 把不再需要的 legacy 入口从主文档和主流程中移除/,
    '总表必须继续记录 legacy 主文档/主流程入口已移出',
  );
  assertIncludes(
    mainPlan,
    /- \[x\] 把 legacy 剩余价值收束为“查规则 \/ 查旧数据格式 \/ 迁移来源”/,
    '总表必须继续记录 legacy 剩余价值已收束',
  );
  assertIncludes(
    mainPlan,
    /- \[x\] 固定 next cutover \/ readiness 的仓库内 proof/,
    '总表必须继续记录 cutover proof 已固定',
  );
  assertIncludes(
    mainPlan,
    /- \[x\] `packages\/\*` 成为唯一活跃主线/,
    '总表必须继续记录 packages/* 已成为唯一活跃主线',
  );
  assertIncludes(
    mainPlan,
    /- \[x\] legacy 只剩归档和迁移参考价值/,
    '总表必须继续记录 legacy 已只剩归档和迁移参考价值',
  );

  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));
  for (const fileName of workflowFiles) {
    const content = fs.readFileSync(path.join(workflowDir, fileName), 'utf8');
    assert(
      !/archive:legacy:|pnpm --dir legacy\/|legacy\/(client|server|shared)|\.\/start\.sh/.test(content),
      `workflow 不应再把 legacy 当默认主入口：${fileName}`,
    );
  }

  process.stdout.write(
    [
      'cutover readiness contract check passed',
      'checked=root scripts + README/docs + server ops/testing + workflows',
      'default mainline=packages/*',
      'legacy role=archive/reference/migration-input only',
    ].join('\n') + '\n',
  );
}

main();
