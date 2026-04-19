import type { InitializeMainAppOptions } from './main-app-assembly-types';
import { runMainAppBootstrap } from './main-app-bootstrap-runner';
import { createMainAppRuntimeContext } from './main-app-runtime-context';

export function assembleMainApp(options: InitializeMainAppOptions): void {
  runMainAppBootstrap(createMainAppRuntimeContext(options));
}
