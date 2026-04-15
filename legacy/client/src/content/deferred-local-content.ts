import { preloadItemSourceCatalog } from './item-sources';
import { preloadMonsterLocationCatalog } from './monster-locations';

/** IdleWindow：定义该类型的结构与数据语义。 */
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

/** preloadScheduled：定义该变量以承载业务值。 */
let preloadScheduled = false;

/** scheduleDeferredLocalContentPreload：执行对应的业务逻辑。 */
export function scheduleDeferredLocalContentPreload(): void {
  if (preloadScheduled) {
    return;
  }
  preloadScheduled = true;

/** triggerPreload：通过常量导出可复用函数行为。 */
  const triggerPreload = () => {
    void preloadItemSourceCatalog();
    void preloadMonsterLocationCatalog();
  };

/** idleWindow：定义该变量以承载业务值。 */
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(triggerPreload, { timeout: 1500 });
    return;
  }

  window.setTimeout(triggerPreload, 300);
}

