import type { MainDomElements } from './main-dom-elements';
import type { MainFrontendModules } from './main-frontend-modules';

export type ToastKind =
  | 'system'
  | 'chat'
  | 'quest'
  | 'combat'
  | 'loot'
  | 'grudge'
  | 'success'
  | 'warn'
  | 'travel';

export type InitializeMainAppOptions = {
  windowRef: Window;
  documentRef: Document;
  dom: MainDomElements;
  modules: MainFrontendModules;
};
