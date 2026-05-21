import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveServerRuntimeRole, shouldStartHttpServer } from '../config/runtime-role';

async function main(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  try {
    process.env.SERVER_RUNTIME_ROLE = 'worker';
    assert.equal(resolveServerRuntimeRole(), 'worker');
    assert.equal(shouldStartHttpServer(), false);

    const source = fs.readFileSync(path.join(process.cwd(), 'src/app.module.ts'), 'utf8');
    assert.ok(source.includes('const WORLD_GATEWAY_PROVIDERS = shouldStartHttpServer()'));
    assert.ok(source.includes('...WORLD_GATEWAY_PROVIDERS'));
    assert.ok(!source.includes('\n    WorldGateway,\n  ],'));
    assert.ok(source.includes('WorldShutdownDrainService'));
    const flushTool = fs.readFileSync(path.join(process.cwd(), 'src/tools/flush-task-worker.ts'), 'utf8');
    const outboxTool = fs.readFileSync(path.join(process.cwd(), 'src/tools/outbox-dispatcher-worker.ts'), 'utf8');
    assert.ok(flushTool.includes("process.env.SERVER_RUNTIME_ROLE = process.env.SERVER_RUNTIME_ROLE?.trim() || 'worker'"));
    assert.ok(outboxTool.includes("process.env.SERVER_RUNTIME_ROLE = process.env.SERVER_RUNTIME_ROLE?.trim() || 'worker'"));
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: 'worker role 下 shouldStartHttpServer=false，AppModule 通过 WORLD_GATEWAY_PROVIDERS 条件注册 Socket.IO gateway 与 shutdown drain；正式 flush/outbox worker tool 默认强制 worker role。',
    excludes: '不启动真实 Nest application context，不证明所有历史诊断 tool 入口已删除。',
    completionMapping: 'worker-socket-policy',
  }, null, 2));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') process.env[name] = value;
  else delete process.env[name];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
