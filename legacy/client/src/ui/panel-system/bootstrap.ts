import { PanelCapabilityMonitor, detectPanelCapabilities } from './capability';
import { resolvePanelLayoutProfile } from './layout-profiles';
import { buildDefaultPanelRegistry, PanelRegistry } from './registry';
import { PanelSystemStore } from './store';
import { INITIAL_RUNTIME_STATE } from '../../constants/ui/panel-system';

/** ClientPanelSystem：定义该接口的能力与字段约束。 */
export interface ClientPanelSystem {
/** registry：定义该变量以承载业务值。 */
  registry: PanelRegistry;
/** store：定义该变量以承载业务值。 */
  store: PanelSystemStore;
/** capabilityMonitor：定义该变量以承载业务值。 */
  capabilityMonitor: PanelCapabilityMonitor;
  destroy: () => void;
}

/** createClientPanelSystem：执行对应的业务逻辑。 */
export function createClientPanelSystem(win: Window = window): ClientPanelSystem {
/** capabilities：定义该变量以承载业务值。 */
  const capabilities = detectPanelCapabilities(win);
/** layout：定义该变量以承载业务值。 */
  const layout = resolvePanelLayoutProfile(capabilities);
/** registry：定义该变量以承载业务值。 */
  const registry = buildDefaultPanelRegistry();
/** store：定义该变量以承载业务值。 */
  const store = new PanelSystemStore({
    capabilities,
    layout,
    runtime: INITIAL_RUNTIME_STATE,
    panels: {},
  });

/** capabilityMonitor：定义该变量以承载业务值。 */
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

