/**
 * 服务端镜像唯一入口。
 *
 * 生产环境由轻量监督进程拉起 Nest 子进程；开发和测试环境默认直接启动应用。
 * 源码入口是 main.ts，镜像实际执行 TypeScript 编译后的 dist/main.js。
 */
import './config/bootstrap-local-development-runtime-defaults';

import {
  notifyServerProcessSupervisorReady,
  runServerProcessSupervisor,
  shouldRunServerProcessSupervisor,
  startServerProcessSupervisorHeartbeat,
} from './bootstrap/process-supervisor';

async function main(): Promise<void> {
  if (shouldRunServerProcessSupervisor()) {
    await runServerProcessSupervisor({ entryPath: __filename });
    return;
  }

  const stopHeartbeat = startServerProcessSupervisorHeartbeat();
  try {
    const { startServerApplication } = await import('./bootstrap/server-application.js');
    await startServerApplication();
    notifyServerProcessSupervisorReady();
  } catch (error) {
    stopHeartbeat();
    throw error;
  }
}

void main().catch((error) => {
  console.error('[启动] 服务端入口失败：', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
