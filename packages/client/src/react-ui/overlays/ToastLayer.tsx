/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { overlayStore } from './overlay-store';
/**
 * ToastLayer：渲染NextToast层组件。
 * @returns 无返回值，直接更新NextToast层相关状态。
 */


export function ToastLayer() {
  const { toasts } = useExternalStoreSnapshot(overlayStore);

  return (
    <div className="react-ui-toast-layer" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`react-ui-toast react-ui-toast--${toast.kind}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
