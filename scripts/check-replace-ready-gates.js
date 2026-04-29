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
  const localEnvLoader = read('scripts/load-local-runtime-env.js');
  const localScript = read('scripts/replace-ready.js');
  const withDbScript = read('scripts/replace-ready-with-db.js');
  const doctorScript = read('scripts/replace-ready-doctor.js');
  const proofWithDbScript = read('scripts/replace-ready-proof-with-db.js');
  const shadowTargetProbeScript = read('scripts/shadow-target-probe.js');
  const shadowScript = read('scripts/replace-ready-shadow.js');
  const shadowDestructivePreflightScript = read('scripts/replace-ready-shadow-destructive-preflight.js');
  const shadowDestructiveScript = read('scripts/replace-ready-shadow-destructive.js');
  const acceptanceScript = read('scripts/replace-ready-acceptance.js');
  const fullScript = read('scripts/replace-ready-full.js');
  const plan09 = read('docs/next-plan/09-verification-and-acceptance.md');
  const serverTesting = read('packages/server/TESTING.md');

  const requiredRootScripts = [
    'verify:replace-ready',
    'verify:replace-ready:doctor',
    'verify:replace-ready:with-db',
    'verify:replace-ready:proof:with-db',
    'verify:replace-ready:shadow',
    'verify:replace-ready:shadow:destructive:preflight',
    'verify:replace-ready:acceptance',
    'verify:replace-ready:full',
    'verify:replace-ready:shadow:destructive',
  ];
  for (const name of requiredRootScripts) {
    assert(rootPackage.scripts[name], `根 package.json 缺少脚本：${name}`);
  }

  assertIncludes(
    localEnvLoader,
    /candidateFiles = \[[\s\S]*'\.runtime\/server\.local\.env'[\s\S]*'packages\/server\/\.env\.local'/,
    'replace-ready 本地 env loader 必须继续覆盖 .runtime/.env/packages-server 这套默认文件顺序',
  );
  assertIncludes(
    localEnvLoader,
    /SERVER_SKIP_LOCAL_ENV_AUTOLOAD/,
    'replace-ready 本地 env loader 必须继续支持显式跳过自动加载',
  );
  for (const [scriptName, content] of [
    ['replace-ready', localScript],
    ['replace-ready:with-db', withDbScript],
    ['replace-ready:proof:with-db', proofWithDbScript],
    ['replace-ready:doctor', doctorScript],
    ['replace-ready:shadow', shadowScript],
    ['replace-ready:shadow:destructive:preflight', shadowDestructivePreflightScript],
    ['replace-ready:shadow:destructive', shadowDestructiveScript],
    ['replace-ready:acceptance', acceptanceScript],
    ['replace-ready:full', fullScript],
  ]) {
    assertIncludes(
      content,
      /require\('\.\/load-local-runtime-env'\);/,
      `${scriptName} 脚本必须继续默认加载本地 env`,
    );
  }

  assertIncludes(
    doctorScript,
    /local replace-ready: ready/,
    'doctor 必须继续声明 local gate 就绪口径',
  );
  assertIncludes(
    doctorScript,
    /with-db replace-ready:/,
    'doctor 必须继续声明 with-db gate 口径',
  );
  assertIncludes(
    doctorScript,
    /acceptance replace-ready:/,
    'doctor 必须继续声明 acceptance gate 口径',
  );
  assertIncludes(
    doctorScript,
    /full replace-ready:/,
    'doctor 必须继续声明 full gate 口径',
  );
  assertIncludes(
    shadowTargetProbeScript,
    /gm_route_missing/,
    'shadow target probe 必须继续区分 URL 可达但 GM 路由缺失',
  );
  assertIncludes(
    shadowTargetProbeScript,
    /reachable_with_nonready_health_/,
    'shadow target probe 必须继续允许 liveness 正常但 readiness 非 ready 的 shadow 目标',
  );
  assertIncludes(
    doctorScript,
    /shadow target probe:/,
    'doctor 必须继续声明 shadow target probe 口径',
  );
  assertIncludes(
    shadowDestructivePreflightScript,
    /target_not_maintenance_active/,
    'shadow-destructive preflight 必须继续在目标未进入 maintenance-active 时快失败',
  );
  assertIncludes(
    shadowDestructivePreflightScript,
    /SERVER_SHADOW_ALLOW_DESTRUCTIVE=1/,
    'shadow-destructive preflight 必须继续显式要求 destructive 开关',
  );
  assertIncludes(
    doctorScript,
    /shadow destructive gm-database proof:/,
    'doctor 必须继续声明 shadow-destructive gate 口径',
  );
  assertIncludes(
    doctorScript,
    /shadow destructive preflight:/,
    'doctor 必须继续显式给出 shadow-destructive preflight 推荐命令',
  );
  assertIncludes(
    doctorScript,
    /\/api\/auth\/gm\/login is not 404/,
    'doctor 必须继续提示 shadow target 需要 next GM 登录入口',
  );

  assertIncludes(
    shadowDestructiveScript,
    /\[replace-ready:shadow:destructive\] steps=preflight -> smoke:shadow:gm-database/,
    'shadow-destructive 脚本必须继续先跑 preflight 再执行 destructive proof',
  );
  assertIncludes(
    shadowDestructiveScript,
    /replace-ready-shadow-destructive-preflight\.js/,
    'shadow-destructive 脚本必须继续复用独立 preflight 脚本',
  );
  assertIncludes(
    shadowScript,
    /shadow target .*current \/health payload=/,
    'shadow 脚本必须继续在目标缺少 GM 登录路由时快速失败',
  );

  assertIncludes(
    acceptanceScript,
    /\[replace-ready:acceptance\] steps=replace-ready -> shadow -> gm/,
    'acceptance 脚本必须继续固定为 replace-ready -> shadow -> gm',
  );
  assertIncludes(
    acceptanceScript,
    /DATABASE_URL: ''[\s\S]*SERVER_DATABASE_URL: ''/,
    'acceptance 脚本必须继续屏蔽 DB 环境，固定先跑 local gate',
  );
  assertIncludes(
    acceptanceScript,
    /SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '1'/,
    'acceptance 脚本必须继续显式跳过 local gate 的本地 env 自动补齐',
  );
  assertIncludes(
    acceptanceScript,
    /replace-ready acceptance requires shadow env:/,
    'acceptance 脚本必须继续在缺 shadow\/gm env 时直接失败',
  );

  assertIncludes(
    fullScript,
    /\[replace-ready:full\] steps=with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm/,
    'full 脚本必须继续固定严格自动化链路',
  );
  assertIncludes(
    fullScript,
    /replace-ready full blocked by shadow target:/,
    'full 脚本必须继续在 shadow target 错误时快速失败',
  );
  assertIncludes(
    fullScript,
    /replace-ready full requires:/,
    'full 脚本必须继续在缺 DB\/shadow\/gm env 时直接失败',
  );

  assertIncludes(
    plan09,
    /\| `acceptance` \| `pnpm verify:replace-ready:acceptance` \| `local \+ shadow \+ gm` 是否一起通过 \|/,
    '09 文档必须继续明确 acceptance 的组合链路',
  );
  assertIncludes(
    plan09,
    /\| `full` \| `pnpm verify:replace-ready:full` \| `with-db -> gm-database -> backup-persistence -> shadow -> gm` 是否全绿 \|/,
    '09 文档必须继续明确 full 的组合链路',
  );
  assertIncludes(
    plan09,
    /`pnpm verify:replace-ready:shadow:destructive:preflight`/,
    '09 文档必须继续记录 shadow-destructive preflight 入口',
  );
  assertIncludes(
    plan09,
    /shadow target probe/,
    '09 文档必须继续记录 shadow target probe 的口径',
  );
  assertIncludes(
    serverTesting,
    /### `acceptance`/,
    'TESTING 文档必须继续保留 acceptance gate 定义',
  );
  assertIncludes(
    serverTesting,
    /### `full`/,
    'TESTING 文档必须继续保留 full gate 定义',
  );

  process.stdout.write(
    [
      'replace-ready gate contract check passed',
      'checked=root scripts + doctor + shadow + acceptance + full + docs',
      'acceptance=replace-ready -> shadow -> gm',
      'full=with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm',
    ].join('\n') + '\n',
  );
}

main();
