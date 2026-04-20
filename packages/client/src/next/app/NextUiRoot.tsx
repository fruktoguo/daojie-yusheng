import { NextDetailModalLayer } from '../overlays/NextDetailModalLayer';
import { NextToastLayer } from '../overlays/NextToastLayer';
import { NextTooltipLayer } from '../overlays/NextTooltipLayer';
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { shellStore } from '../stores/shell-store';
import { NextUiScaffold } from './NextUiScaffold';
/**
 * NextUiRoot：执行核心业务逻辑。
 * @returns 函数返回值。
 */


export function NextUiRoot() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const shellState = useExternalStoreSnapshot(shellStore);

  if (!shellState.enabled) {
    return null;
  }

  return (
    <div className="next-ui-root" data-shell-visible={shellState.runtime.shellVisible ? 'true' : 'false'}>
      <NextUiScaffold />
      <NextTooltipLayer />
      <NextDetailModalLayer />
      <NextToastLayer />
    </div>
  );
}
