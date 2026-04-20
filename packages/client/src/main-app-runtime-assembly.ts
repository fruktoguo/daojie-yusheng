import type { InitializeMainAppOptions } from './main-app-assembly-types';
import { runMainAppBootstrap } from './main-app-bootstrap-runner';
import { createMainAppRuntimeContext } from './main-app-runtime-context';
/**
 * assembleMainApp：执行核心业务逻辑。
 * @param options InitializeMainAppOptions 选项参数。
 * @returns void。
 */


export function assembleMainApp(options: InitializeMainAppOptions): void {
  runMainAppBootstrap(createMainAppRuntimeContext(options));
}
