import { PanelCapabilityMonitor, detectPanelCapabilities } from './capability';
import { resolvePanelLayoutProfile } from './layout-profiles';
import { buildDefaultPanelRegistry, PanelRegistry } from './registry';
import { PanelSystemStore } from './store';
import { INITIAL_RUNTIME_STATE } from '../../constants/ui/panel-system';

/** ClientPanelSystem：定义该接口的能力与字段约束。 */
export interface ClientPanelSystem {
  registry: PanelRegistry;
  store: PanelSystemStore;
  capabilityMonitor: PanelCapabilityMonitor;
  destroy: () => void;
}

/** createClientPanelSystem：执行对应的业务逻辑。 */
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

