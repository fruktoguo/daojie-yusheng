import { scheduleDeferredLocalContentPreload } from './content/deferred-local-content';
import type { InitializeMainAppOptions } from './main-app-assembly-types';
import { assembleMainApp } from './main-app-runtime-assembly';

export function initializeMainApp(options: InitializeMainAppOptions): void {
  scheduleDeferredLocalContentPreload();
  assembleMainApp(options);
}
