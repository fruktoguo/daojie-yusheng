import { preloadItemSourceCatalog } from './item-sources';
import { preloadMonsterLocationCatalog } from './monster-locations';

/** 兼容 requestIdleCallback 的 Window 扩展。 */
type IdleWindow = Window & {
/**
 * requestIdleCallback：对象字段。
 */

  requestIdleCallback?: (callback: () => void, options?: {  
  /**
 * timeout：对象字段。
 */
 timeout: number }) => number;
};

/** 是否已经排过一次延迟预热。 */
let preloadScheduled = false;

/** 在浏览器空闲时预加载本地内容目录。 */
export function scheduleDeferredLocalContentPreload(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (preloadScheduled) {
    return;
  }
  preloadScheduled = true;

  /** 真正执行目录预热的回调。 */
  const triggerPreload = () => {
    void preloadItemSourceCatalog();
    void preloadMonsterLocationCatalog();
  };

  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(triggerPreload, { timeout: 1500 });
    return;
  }

  window.setTimeout(triggerPreload, 300);
}

