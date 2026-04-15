import { preloadItemSourceCatalog } from './item-sources';
import { preloadMonsterLocationCatalog } from './monster-locations';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

let preloadScheduled = false;


export function scheduleDeferredLocalContentPreload(): void {
  if (preloadScheduled) {
    return;
  }
  preloadScheduled = true;


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

