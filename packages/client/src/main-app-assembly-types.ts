/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
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
