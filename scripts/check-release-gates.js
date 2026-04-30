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
  const localScript = read('scripts/release-local.js');
  const withDbScript = read('scripts/release-with-db.js');
  const doctorScript = read('scripts/release-doctor.js');
  const proofWithDbScript = read('scripts/release-proof-with-db.js');
  const shadowTargetProbeScript = read('scripts/shadow-target-probe.js');
  const shadowScript = read('scripts/release-shadow.js');
  const shadowDestructivePreflightScript = read('scripts/release-shadow-destructive-preflight.js');
  const shadowDestructiveScript = read('scripts/release-shadow-destructive.js');
  const acceptanceScript = read('scripts/release-acceptance.js');
  const fullScript = read('scripts/release-full.js');
  const plan09 = read('docs/next-plan/09-verification-and-acceptance.md');
  const serverTesting = read('packages/server/TESTING.md');
  const serverRunbook = read('packages/server/RUNBOOK.md');

  const requiredRootScripts = [
    'verify:quick',
    'verify:standard',
    'verify:release',
    'verify:release:local',
    'verify:release:doctor',
    'verify:release:with-db',
    'verify:release:proof:with-db',
    'verify:release:shadow',
    'verify:release:shadow:destructive:preflight',
    'verify:release:acceptance',
    'verify:release:full',
    'verify:release:shadow:destructive',
  ];
  for (const name of requiredRootScripts) {
    assert(rootPackage.scripts[name], `根 package.json 缺少脚本：${name}`);
  }

  assertIncludes(
    localEnvLoader,
    /candidateFiles = \[[\s\S]*'\.runtime\/server\.local\.env'[\s\S]*'packages\/server\/\.env\.local'/,
    'release 本地 env loader 必须继续覆盖 .runtime/.env/packages-server 这套默认文件顺序',
  );
  assertIncludes(
    localEnvLoader,
    /SERVER_SKIP_LOCAL_ENV_AUTOLOAD/,
    'release 本地 env loader 必须继续支持显式跳过自动加载',
  );
  for (const [scriptName, content] of [
    ['release:local', localScript],
    ['release:with-db', withDbScript],
    ['release:proof:with-db', proofWithDbScript],
    ['release:doctor', doctorScript],
    ['release:shadow', shadowScript],
    ['release:shadow:destructive:preflight', shadowDestructivePreflightScript],
    ['release:shadow:destructive', shadowDestructiveScript],
    ['release:acceptance', acceptanceScript],
    ['release:full', fullScript],
  ]) {
    assertIncludes(
      content,
      /require\('\.\/load-local-runtime-env'\);/,
      `${scriptName} 脚本必须继续默认加载本地 env`,
    );
  }

  assertIncludes(
    doctorScript,
    /local release: ready/,
    'doctor 必须继续声明 local gate 就绪口径',
  );
  assertIncludes(
    doctorScript,
    /with-db release:/,
    'doctor 必须继续声明 with-db gate 口径',
  );
  assertIncludes(
    doctorScript,
    /acceptance release:/,
    'doctor 必须继续声明 acceptance gate 口径',
  );
  assertIncludes(
    doctorScript,
    /full release:/,
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
    /\[release:shadow:destructive\] steps=preflight -> smoke:shadow:gm-database/,
    'shadow-destructive 脚本必须继续先跑 preflight 再执行 destructive proof',
  );
  assertIncludes(
    shadowDestructiveScript,
    /release-shadow-destructive-preflight\.js/,
    'shadow-destructive 脚本必须继续复用独立 preflight 脚本',
  );
  assertIncludes(
    shadowScript,
    /shadow target .*current \/health payload=/,
    'shadow 脚本必须继续在目标缺少 GM 登录路由时快速失败',
  );

  assertIncludes(
    acceptanceScript,
    /\[release:acceptance\] steps=release:local -> shadow -> gm/,
    'acceptance 脚本必须继续固定为 release:local -> shadow -> gm',
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
    /release acceptance requires shadow env:/,
    'acceptance 脚本必须继续在缺 shadow\/gm env 时直接失败',
  );

  assertIncludes(
    fullScript,
    /rerunGmDatabase[\s\S]*--rerun-gm-database/,
    'full 脚本必须继续支持显式重跑 gm-database',
  );
  assertIncludes(
    fullScript,
    /\[release:full\] steps=\$\{steps\.map\(\(step\) => step\.label\)\.join\(' -> '\)\}/,
    'full 脚本必须继续输出实际严格自动化链路',
  );
  assertIncludes(
    fullScript,
    /release full blocked by shadow target:/,
    'full 脚本必须继续在 shadow target 错误时快速失败',
  );
  assertIncludes(
    fullScript,
    /release full requires:/,
    'full 脚本必须继续在缺 DB\/shadow\/gm env 时直接失败',
  );

  assertIncludes(
    plan09,
    /\| `acceptance` \| `pnpm verify:release:acceptance` \| `local \+ shadow \+ gm` 是否一起通过 \|/,
    '09 文档必须继续明确 acceptance 的组合链路',
  );
  assertIncludes(
    plan09,
    /\| `full` \| `pnpm verify:release:full` \| `with-db -> backup-persistence -> shadow -> gm` 是否全绿/,
    '09 文档必须继续明确 full 的组合链路',
  );
  assertIncludes(
    plan09,
    /`pnpm verify:release:shadow:destructive:preflight`/,
    '09 文档必须继续记录 shadow-destructive preflight 入口',
  );
  assertIncludes(
    plan09,
    /shadow target probe/,
    '09 文档必须继续记录 shadow target probe 的口径',
  );
  assertIncludes(
    serverTesting,
    /`acceptance`：`local` 之外，shadow 实物验收和 shadow GM 关键写路径是否也绿。/,
    'TESTING 文档必须继续保留 acceptance gate 定义',
  );
  assertIncludes(
    serverTesting,
    /`full`：数据库、shadow、GM 密码都齐备时，最严格自动化门禁是否全绿；默认不重复跑 `with-db` 已覆盖的 `gm-database`。/,
    'TESTING 文档必须继续保留 full gate 定义',
  );
  assertIncludes(
    serverRunbook,
    /当前运行手册服务于 shadow \/ release 验证线/,
    'RUNBOOK 必须继续说明 shadow / release 验证线边界',
  );
  assertIncludes(
    serverRunbook,
    /旧阶段自动切换入口已移除/,
    'RUNBOOK 必须继续说明旧阶段自动切换入口已移除',
  );

  process.stdout.write(
    [
      'release gate contract check passed',
      'checked=root scripts + doctor + shadow + acceptance + full + docs',
      'acceptance=release:local -> shadow -> gm',
      'full=with-db -> gm-database-backup-persistence -> shadow -> gm',
    ].join('\n') + '\n',
  );
}

main();
