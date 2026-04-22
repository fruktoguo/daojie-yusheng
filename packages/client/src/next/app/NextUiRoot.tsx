import { DetailModalLayer } from '../overlays/NextDetailModalLayer';
import { ToastLayer } from '../overlays/NextToastLayer';
import { TooltipLayer } from '../overlays/NextTooltipLayer';
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { shellStore } from '../stores/shell-store';
import { ReactUiScaffold } from './NextUiScaffold';
/**
 * ReactUiRoot：渲染NextUi根容器组件。
 * @returns 无返回值，直接更新NextUi根容器相关状态。
 */


export function ReactUiRoot() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const shellState = useExternalStoreSnapshot(shellStore);

  if (!shellState.enabled) {
    return null;
  }

  return (
    <div className="next-ui-root" data-shell-visible={shellState.runtime.shellVisible ? 'true' : 'false'}>
      <ReactUiScaffold />
      <TooltipLayer />
      <DetailModalLayer />
      <ToastLayer />
    </div>
  );
}
