/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
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
