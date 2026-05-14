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
