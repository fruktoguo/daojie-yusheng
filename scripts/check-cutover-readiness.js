#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function listFiles(relativePath) {
  return fs
    .readdirSync(path.join(repoRoot, relativePath), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
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
  const serverOps = read('docs/server-operations.md');
  const startRoot = read('start.sh');

  const rootFiles = listFiles('.');
  const allowedComposeAndStackFiles = new Set([
    'docker-compose.yml',
    'docker-compose.legacy.yml',
    'docker-compose.mainline.yml',
    'docker-stack.yml',
    'docker-stack.mainline.yml',
  ]);
  for (const fileName of rootFiles) {
    assert(!/^start-.+\.sh$/.test(fileName), `根目录不应再保留额外 start 兼容壳：${fileName}`);
    if (/^docker-(?:compose|stack)\..+\.yml$/.test(fileName)) {
      assert(
        allowedComposeAndStackFiles.has(fileName),
        `根目录不应再保留过时 compose/stack 兼容壳：${fileName}`,
      );
    }
  }

  const scriptFiles = listFiles('scripts');
  assert(
    !scriptFiles.some((fileName) => /^server-.*verify\.(?:js|sh|cmd)$/.test(fileName)),
    'scripts/ 不应再保留 server 验证兼容壳家族',
  );
  assert(
    !scriptFiles.includes('verify-alias-banner.js'),
    'scripts/ 不应再保留旧验证 alias banner',
  );

  const allowedProofScripts = new Set([
    'prove-client-no-legacy-alias.js',
    'prove-client-s2c-consumption.js',
    'prove-client-shared-no-legacy-source.js',
    'prove-no-legacy-file-behavior.js',
    'prove-protobuf-drift.js',
    'prove-protocol-source.js',
    'prove-server-runtime-mainline.js',
    'prove-shared-types-source.js',
  ]);
  for (const fileName of scriptFiles) {
    if (/^prove-.*\.js$/.test(fileName)) {
      assert(allowedProofScripts.has(fileName), `scripts/ 中存在过时 proof 壳：${fileName}`);
    }
  }

  const requiredScripts = [
    'build',
    'build:mainline',
    'build:client',
    'build:server',
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
    /当前主验证入口是 `verify:replace-ready\*`/,
    'README 必须继续明确 replace-ready 是当前主验证入口',
  );
  assertIncludes(
    readme,
    /- 旧兼容验证、proof 与启动入口已移除/,
    'README 必须继续明确旧兼容验证、proof 与启动入口已移除',
  );
  assertIncludes(
    readme,
    /`\.\/start\.sh` 是默认且唯一的本地启动脚本/,
    'README 必须继续明确 start.sh 是默认且唯一的本地启动脚本',
  );
  assertIncludes(
    startRoot,
    /启动当前本地开发环境/,
    'start.sh 必须继续明确自己服务于当前本地开发环境',
  );
  assertIncludes(
    startRoot,
    /docker-compose\.yml/,
    'start.sh 必须继续以根 docker-compose.yml 作为默认 compose 入口',
  );
  assertIncludes(
    startRoot,
    /\.runtime\/server\.local\.env/,
    'start.sh 必须继续只读取当前 server.local.env 本地入口',
  );

  assertIncludes(
    nextPlanReadme,
    /当前主线只认 `packages\/\*`；`legacy\/\*` 只继续保留为归档参考、旧数据格式对照和历史排查参考。/,
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
    /根级主入口现在是 `verify:replace-ready\*`。/,
    'packages/server TESTING 必须继续明确 replace-ready 是主 gate 入口',
  );
  assertIncludes(
    serverOps,
    /根级主入口现在是 `verify:replace-ready\*`。/,
    'server-operations 必须继续明确 replace-ready 是主 gate 入口',
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
    /- \[x\] 把 legacy 剩余价值收束为“查规则 \/ 查旧数据格式 \/ 历史对照”/,
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
    /- \[x\] legacy 只剩归档和历史参考价值/,
    '10 文档必须继续记录切换后检查里 legacy 角色已收束',
  );
  assertIncludes(
    cutoverPlan,
    /- \[x\] legacy 只剩归档和历史参考价值/,
    '10 文档完成定义必须继续记录 legacy 只剩归档和历史参考价值',
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
    /- \[x\] 把 legacy 剩余价值收束为“查规则 \/ 查旧数据格式 \/ 历史对照”/,
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
    /- \[x\] legacy 只剩归档和历史参考价值/,
    '总表必须继续记录 legacy 已只剩归档和历史参考价值',
  );

  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));
  for (const fileName of workflowFiles) {
    const content = fs.readFileSync(path.join(workflowDir, fileName), 'utf8');
    assert(
      !/archive:legacy:|pnpm --dir legacy\/|legacy\/(client|server|shared)/.test(content),
      `workflow 不应再把 legacy 当默认主入口：${fileName}`,
    );
  }

  process.stdout.write(
    [
      'cutover readiness contract check passed',
      'checked=root scripts + README/docs + server ops/testing + workflows',
      'default mainline=packages/*',
      'legacy role=archive/reference only',
    ].join('\n') + '\n',
  );
}

main();
