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
 * windowRef：窗口Ref相关字段。
 */

  windowRef: Window;  
  /**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;  
  /**
 * dom：dom相关字段。
 */

  dom: MainDomElements;  
  /**
 * modules：模块相关字段。
 */

  modules: MainFrontendModules;
};
