import { scheduleDeferredLocalContentPreload } from './content/deferred-local-content';
import type { InitializeMainAppOptions } from './main-app-assembly-types';
import { assembleMainApp } from './main-app-runtime-assembly';
/**
 * initializeMainApp：初始化并准备运行时基础状态。
 * @param options InitializeMainAppOptions 选项参数。
 * @returns void。
 */


export function initializeMainApp(options: InitializeMainAppOptions): void {
  scheduleDeferredLocalContentPreload();
  assembleMainApp(options);
}
