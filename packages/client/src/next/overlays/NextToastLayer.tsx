import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { overlayStore } from './overlay-store';
/**
 * NextToastLayer：渲染NextToast层组件。
 * @returns 无返回值，直接更新NextToast层相关状态。
 */


export function NextToastLayer() {
  const { toasts } = useExternalStoreSnapshot(overlayStore);

  return (
    <div className="next-ui-toast-layer" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`next-ui-toast next-ui-toast--${toast.kind}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
