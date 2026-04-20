import type { InitializeMainAppOptions } from './main-app-assembly-types';
import { runMainAppBootstrap } from './main-app-bootstrap-runner';
import { createMainAppRuntimeContext } from './main-app-runtime-context';
/**
 * assembleMainApp：执行assembleMainApp相关逻辑。
 * @param options InitializeMainAppOptions 选项参数。
 * @returns 无返回值，直接更新assembleMainApp相关状态。
 */


export function assembleMainApp(options: InitializeMainAppOptions): void {
  runMainAppBootstrap(createMainAppRuntimeContext(options));
}
