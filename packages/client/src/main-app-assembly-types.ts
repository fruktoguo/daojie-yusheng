import type { MainDomElements } from './main-dom-elements';
import type { MainFrontendModules } from './main-frontend-modules';
/**
 * ToastKind：统一结构类型，保证协议与运行时一致性。
 */


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
  /**
 * InitializeMainAppOptions：统一结构类型，保证协议与运行时一致性。
 */


export type InitializeMainAppOptions = {
/**
 * windowRef：对象字段。
 */

  windowRef: Window;  
  /**
 * documentRef：对象字段。
 */

  documentRef: Document;  
  /**
 * dom：对象字段。
 */

  dom: MainDomElements;  
  /**
 * modules：对象字段。
 */

  modules: MainFrontendModules;
};
