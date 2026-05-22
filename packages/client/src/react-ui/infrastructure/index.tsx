/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
/**
 * React 面板基础设施统一导出
 */

// Stores
export { createPanelStore } from '../stores/create-panel-store';
export { createExternalStore } from '../stores/create-external-store';
export { panelDataStore } from '../stores/panel-data-store';
export { shellStore } from '../stores/shell-store';

// Hooks
export { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
export { useFloatingTooltip } from '../hooks/use-floating-tooltip';
export { useDetailModal } from '../hooks/use-detail-modal';
export {
  useRuntimeSender,
  usePanelSender,
  useSocialEconomySender,
  useAdminSender,
  useBuildingSender,
  injectSenders,
} from '../hooks/use-sender';

// Flags
export {
  isReactPanelEnabled,
  setReactPanelFlag,
  registerPanelFlagApi,
  type ReactPanelId,
} from '../bridge/panel-flags';
