import { PanelCapabilityMonitor, detectPanelCapabilities } from './capability';
import { resolvePanelLayoutProfile } from './layout-profiles';
import { buildDefaultPanelRegistry, PanelRegistry } from './registry';
import { PanelSystemStore } from './store';
import { INITIAL_RUNTIME_STATE } from '../../constants/ui/panel-system';

/** 客户端面板系统实例。 */
export interface ClientPanelSystem {
/**
 * registry：ClientPanelSystem 内部字段。
 */

  registry: PanelRegistry;  
  /**
 * store：ClientPanelSystem 内部字段。
 */

  store: PanelSystemStore;  
  /**
 * capabilityMonitor：ClientPanelSystem 内部字段。
 */

  capabilityMonitor: PanelCapabilityMonitor;  
  /**
 * destroy：ClientPanelSystem 内部字段。
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
