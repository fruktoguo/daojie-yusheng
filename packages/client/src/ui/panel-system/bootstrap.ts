import { PanelCapabilityMonitor, detectPanelCapabilities } from './capability';
import { resolvePanelLayoutProfile } from './layout-profiles';
import { buildDefaultPanelRegistry, PanelRegistry } from './registry';
import { PanelSystemStore } from './store';
import { INITIAL_RUNTIME_STATE } from '../../constants/ui/panel-system';

/** 客户端面板系统实例。 */
export interface ClientPanelSystem {
/**
 * registry：注册表引用。
 */

  registry: PanelRegistry;  
  /**
 * store：存储引用。
 */

  store: PanelSystemStore;  
  /**
 * capabilityMonitor：capabilityMonitor相关字段。
 */

  capabilityMonitor: PanelCapabilityMonitor;  
  /**
 * destroy：destroy相关字段。
 */

  destroy: () => void;
}

/** createClientPanelSystem：创建客户端面板系统。 */
export function createClientPanelSystem(win: Window = window): ClientPanelSystem {
  const capabilities = detectPanelCapabilities(win);
  const layout = resolvePanelLayoutProfile(capabilities);
  const registry = buildDefaultPanelRegistry();
  const store = new PanelSystemStore({
    capabilities,
    layout,
    runtime: INITIAL_RUNTIME_STATE,
    panels: {},
  });

  const capabilityMonitor = new PanelCapabilityMonitor(win, (nextCapabilities) => {
    store.setCapabilities(nextCapabilities, resolvePanelLayoutProfile(nextCapabilities));
  });
  capabilityMonitor.start();

  return {
    registry,
    store,
    capabilityMonitor,
    destroy: () => {
      capabilityMonitor.stop();
    },
  };
}
