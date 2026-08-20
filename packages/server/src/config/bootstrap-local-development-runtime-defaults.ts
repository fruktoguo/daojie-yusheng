/**
 * 服务端本地开发启动前置：先加载本地 env，再补齐单进程运行默认值。
 * 该模块必须在 main.ts 的 AppModule 之前导入，确保启动期常量读取到最终角色。
 */
import './load-local-runtime-env';

import { applyLocalDevelopmentRuntimeDefaults } from './local-development-runtime-defaults';
import {
  applyLocalDevelopmentListenEndpointRepair,
  formatLocalDevelopmentListenEndpointRepair,
} from './local-development-listen-endpoint';

const runtimeEnvironment = firstTrimmed(
  process.env.SERVER_RUNTIME_ENV,
  process.env.APP_ENV,
  process.env.NODE_ENV,
);

if (runtimeEnvironment === 'development' || runtimeEnvironment === 'dev' || runtimeEnvironment === 'local') {
  applyLocalDevelopmentRuntimeDefaults();
}

const listenEndpointRepair = applyLocalDevelopmentListenEndpointRepair();
if (listenEndpointRepair) {
  console.warn(`[启动配置] ${formatLocalDevelopmentListenEndpointRepair(listenEndpointRepair)}`);
}

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized) {
      return normalized;
    }
  }
  return '';
}
