import { scheduleDeferredLocalContentPreload } from './content/deferred-local-content';
import type { InitializeMainAppOptions } from './main-app-assembly-types';
import { assembleMainApp } from './main-app-runtime-assembly';
/**
 * initializeMainApp：执行initializeMainApp相关逻辑。
 * @param options InitializeMainAppOptions 选项参数。
 * @returns 无返回值，直接更新initializeMainApp相关状态。
 */


export function initializeMainApp(options: InitializeMainAppOptions): void {
  scheduleDeferredLocalContentPreload();
  assembleMainApp(options);
}
