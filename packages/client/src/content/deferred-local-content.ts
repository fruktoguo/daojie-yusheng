/**
 * 本文件负责客户端内容索引、模板读取或本地展示数据解析。
 *
 * 维护时要区分展示缓存与正式配置真源，避免在客户端内容层重新裁定掉落、资产或战斗规则。
 */
import { preloadItemSourceCatalog } from './item-sources';
import { preloadMonsterLocationCatalog } from './monster-locations';

/** 兼容 requestIdleCallback 的 Window 扩展。 */
type IdleWindow = Window & {
/**
 * requestIdleCallback：requestIdleCallback相关字段。
 */

  requestIdleCallback?: (callback: () => void, options?: {  
  /**
 * timeout：超时数值。
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

