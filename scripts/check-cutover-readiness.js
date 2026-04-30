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

function assertMissing(relativePath, message) {
  assert(!exists(relativePath), message);
}

function main() {
  const rootPackage = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const nextPlanReadme = read('docs/next-plan/README.md');
  const mainPlan = read('docs/next-plan/main.md');
  const serverReadme = read('packages/server/README.md');
  const serverTesting = read('packages/server/TESTING.md');
  const replaceRunbook = read('packages/server/REPLACE-RUNBOOK.md');
  const startRoot = read('start.sh');

  assertMissing('legacy', '仓库工作树不应再保留 legacy/ 归档目录');
  assertMissing('docker-compose.legacy.yml', '根目录不应再保留 legacy compose 入口');
  assertMissing('next-workspace', '根目录不应再保留迁移期 next-workspace 暂存目录');

  const rootFiles = listFiles('.');
  const allowedComposeAndStackFiles = new Set([
    'docker-compose.yml',
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
  const allowedProofScripts = new Set([
    'prove-client-s2c-consumption.js',
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
    'proof:cutover-preflight',
    'proof:cutover-operations',
  ];
  for (const name of requiredScripts) {
    assert(rootPackage.scripts[name], `根 package.json 缺少脚本：${name}`);
  }

  for (const [name, command] of Object.entries(rootPackage.scripts)) {
    assert(!name.startsWith('archive:legacy:'), `根 package.json 不应再保留 legacy 归档脚本：${name}`);
    assert(!name.includes('legacy'), `根 package.json 不应再保留 legacy 命名脚本：${name}`);
    assert(
      !/(^|[^\w-])legacy\/|--dir legacy\/|docker-compose\.legacy/.test(command),
      `根 package.json 脚本不应再直接触达 legacy：${name}`,
    );
  }

  assertIncludes(readme, /道劫余生是一个 Web MMO MUD 项目/, 'README 必须保留公开项目介绍');
  assertIncludes(readme, /packages\/[\s\S]*client\/[\s\S]*shared\/[\s\S]*server\/[\s\S]*config-editor\//, 'README 必须说明 packages 工作区结构');
  assertIncludes(readme, /(?:^|\n)\.\/start\.sh(?:\n|$)/, 'README 必须说明本地启动入口');
  assertIncludes(readme, /pnpm verify:replace-ready/, 'README 必须列出主验证入口');
  assertIncludes(startRoot, /启动当前本地开发环境/, 'start.sh 必须继续明确自己服务于当前本地开发环境');
  assertIncludes(startRoot, /docker-compose\.yml/, 'start.sh 必须继续以根 docker-compose.yml 作为默认 compose 入口');
  assertIncludes(startRoot, /\.runtime\/server\.local\.env/, 'start.sh 必须继续只读取当前 server.local.env 本地入口');

  assertIncludes(
    nextPlanReadme,
    /当前主线只认 `packages\/\*`；`legacy\/\*` 已从工作树移除。/,
    'next-plan README 必须继续明确 packages/* 是唯一主线且 legacy 已移除',
  );
  assertIncludes(serverReadme, /`packages\/server` 是道劫余生的服务端工作区/, 'packages/server README 必须保留服务端工作区说明');
  assertIncludes(serverReadme, /PostgreSQL[\s\S]*Redis/, 'packages/server README 必须说明持久化与在线态依赖');
  assertIncludes(serverTesting, /根级主入口现在是 `verify:replace-ready\*`。/, 'packages/server TESTING 必须继续明确 replace-ready 是主 gate 入口');
  assertIncludes(replaceRunbook, /根级主入口现在是 `verify:replace-ready\*`/, 'REPLACE-RUNBOOK 必须继续明确 replace-ready 是主 gate 入口');

  assertIncludes(mainPlan, /- \[x\] `packages\/\*` 成为唯一活跃主线/, '总表必须继续记录 packages/* 已成为唯一活跃主线');
  assertIncludes(mainPlan, /- \[x\] 删除仓库内 `legacy\/` 归档目录/, '总表必须继续记录 legacy 归档目录已删除');
  assertIncludes(mainPlan, /- \[x\] 固定 next cutover \/ readiness 的仓库内 proof/, '总表必须继续记录 cutover readiness proof 已固定');
  assertIncludes(mainPlan, /- \[x\] 固定 next cutover \/ preflight 的仓库内 proof/, '总表必须继续记录 cutover preflight proof 已固定');

  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs.existsSync(workflowDir)
    ? fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml'))
    : [];
  for (const fileName of workflowFiles) {
    const content = fs.readFileSync(path.join(workflowDir, fileName), 'utf8');
    assert(
      !/archive:legacy:|pnpm --dir legacy\/|legacy\/(client|server|shared)|docker-compose\.legacy/.test(content),
      `workflow 不应再把 legacy 当默认主入口：${fileName}`,
    );
  }

  process.stdout.write(
    [
      'cutover readiness contract check passed',
      'checked=root scripts + README/docs + server ops/testing + workflows',
      'default mainline=packages/*',
      'legacy directory=removed',
    ].join('\n') + '\n',
  );
}

main();
